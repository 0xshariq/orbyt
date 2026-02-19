/**
 * Explanation Generator
 * 
 * Generates comprehensive execution explanations for workflows.
 * This module is ALWAYS invoked before workflow execution to provide
 * full transparency into what the engine will do.
 * 
 * @module explanation
 */

import { ConditionalPathAnalysis, DataFlowPrediction, ExecutionExplanation, ExecutionTimeEstimation, ExplainedStep, ParsedStep, ParsedWorkflow } from "../types/core-types.js";



/**
 * Explanation Generator
 * 
 * Always generates explanations before workflow execution.
 * Integrates with EngineLogger to provide full transparency.
 */
export class ExplanationGenerator {
    /**
     * Generate a complete execution explanation
     * 
     * This method analyzes the workflow and generates a comprehensive
     * explanation of what will happen during execution. This is always
     * called before workflow execution begins.
     * 
     * @param workflow - Parsed workflow to explain
     * @returns Complete execution explanation
     */
    static generate(workflow: ParsedWorkflow): ExecutionExplanation {
        // Determine execution strategy
        const hasParallelSteps = workflow.steps.some(step =>
            step.needs && step.needs.length > 0
        );
        const allSequential = workflow.steps.every((step, idx) =>
            !step.needs || step.needs.length === 0 || (idx > 0 && step.needs.includes(workflow.steps[idx - 1].id))
        );

        const executionStrategy: 'sequential' | 'parallel' | 'mixed' =
            !hasParallelSteps ? 'sequential' : allSequential ? 'sequential' : 'mixed';

        // Build dependency graph
        const dependencyGraph: Record<string, string[]> = {};
        for (const step of workflow.steps) {
            dependencyGraph[step.id] = step.needs || [];
        }

        // Detect cycles
        const { hasCycles, cycles } = this.detectCycles(workflow.steps);

        // Map steps to explained steps
        const explainedSteps: ExplainedStep[] = workflow.steps.map(step =>
            this.buildExplainedStep(step, workflow)
        );

        // Extract unique adapters used and their actions
        const adapterActionsMap = new Map<string, Set<string>>();
        for (const step of workflow.steps) {
            const parts = step.action.split('.');
            const adapter = parts[0];
            const action = parts.slice(1).join('.');

            if (!adapterActionsMap.has(adapter)) {
                adapterActionsMap.set(adapter, new Set());
            }
            adapterActionsMap.get(adapter)!.add(action);
        }

        const adaptersUsed = Array.from(adapterActionsMap.keys()).sort();
        const adapterActions: Record<string, string[]> = {};
        for (const [adapter, actions] of adapterActionsMap) {
            adapterActions[adapter] = Array.from(actions).sort();
        }

        // Analyze workflow inputs
        const requiredInputs: string[] = [];
        const optionalInputs: Record<string, any> = {};

        if (workflow.inputs) {
            for (const [key, value] of Object.entries(workflow.inputs)) {
                if (key.startsWith('_')) continue; // Skip internal fields

                // Check if input has 'required' field
                if (typeof value === 'object' && value !== null) {
                    if (value.required === true) {
                        requiredInputs.push(key);
                    } else if (value.default !== undefined) {
                        optionalInputs[key] = value.default;
                    }
                }
            }
        }

        // Calculate workflow complexity
        const maxDepth = this.calculateMaxDepth(workflow.steps, dependencyGraph);
        const parallelizableSteps = workflow.steps.filter(step =>
            step.needs && step.needs.length > 0
        ).length;
        const sequentialSteps = workflow.steps.length - parallelizableSteps;

        // Build explanation object
        const explanation: ExecutionExplanation = {
            workflowName: workflow.metadata?.name || workflow.name,
            description: workflow.metadata?.description || workflow.description,
            version: workflow.version,
            kind: workflow.kind,
            stepCount: workflow.steps.length,
            executionStrategy,
            steps: explainedSteps,
            hasCycles,
            cycles: hasCycles ? cycles : undefined,
            dependencyGraph,
            adaptersUsed,
            adapterActions,
            complexity: {
                totalSteps: workflow.steps.length,
                maxDepth,
                parallelizableSteps,
                sequentialSteps,
            },
        };

        // Add optional workflow-level fields
        if (workflow.inputs) {
            explanation.inputs = this.filterInternalFields(workflow.inputs);

            if (requiredInputs.length > 0) {
                explanation.requiredInputs = requiredInputs;
            }

            if (Object.keys(optionalInputs).length > 0) {
                explanation.optionalInputs = optionalInputs;
            }
        }

        if (workflow.secrets) {
            // Only show secret keys, never values
            explanation.secrets = {
                vault: workflow.secrets.vault,
                keys: workflow.secrets.refs ? Object.keys(workflow.secrets.refs) : undefined,
            };
        }

        if (workflow.context) {
            explanation.context = this.filterInternalFields(workflow.context);
        }

        if (workflow.outputs) {
            explanation.outputs = this.filterInternalFields(workflow.outputs);
        }

        if (workflow.defaults) {
            explanation.defaults = {
                timeout: workflow.defaults.timeout,
                adapter: workflow.defaults.adapter,
            };
        }

        if (workflow.policies) {
            explanation.policies = workflow.policies;
        }

        if (workflow.metadata?.tags || workflow.tags) {
            explanation.tags = workflow.metadata?.tags || workflow.tags;
        }

        if (workflow.metadata?.owner || workflow.owner) {
            explanation.owner = workflow.metadata?.owner || workflow.owner;
        }

        if (workflow.annotations) {
            explanation.annotations = this.filterInternalFields(workflow.annotations);
        }

        // ============================================================================
        // HIGH PRIORITY DYNAMIC IMPROVEMENTS
        // ============================================================================

        // 1. Runtime Data Prediction
        explanation.dataFlow = this.analyzeDataFlow(workflow, dependencyGraph);

        // 2. Conditional Path Analysis
        explanation.conditionalPaths = this.analyzeConditionalPaths(workflow, dependencyGraph);

        // 3. Execution Time Estimation
        explanation.timeEstimation = this.estimateExecutionTime(workflow, dependencyGraph);

        return explanation;
    }

    /**
     * Build an explained step from a parsed step
     * 
     * @param step - Parsed step
     * @param _workflow - Full workflow (reserved for future cross-step reference analysis)
     * @returns Explained step
     */
    private static buildExplainedStep(step: ParsedStep, _workflow: ParsedWorkflow): ExplainedStep {
        const explained: ExplainedStep = {
            id: step.id,
            name: step.name,
            uses: step.action,
            needs: step.needs || [],
            adapter: step.adapter
        };

        // Add optional fields
        if (step.when) {
            explained.when = step.when;
        }

        if (step.timeout) {
            explained.timeout = step.timeout;
        }

        if (step.retry) {
            explained.retry = {
                max: step.retry.max,  // Configuration: max retries allowed
                backoff: step.retry.backoff,
                delay: step.retry.delay,
            };
            // Note: 'count' is runtime state, not shown in explanation
        }

        if (step.continueOnError !== undefined) {
            explained.continueOnError = step.continueOnError;
        }

        if (step.input) {
            explained.with = step.input;

            // Analyze input to find workflow input references
            const inputsReferenced = this.extractVariableReferences(step.input, 'inputs');
            if (inputsReferenced.length > 0) {
                explained.inputsReferenced = inputsReferenced;
            }
        }

        if (step.env) {
            explained.env = step.env;

            // Analyze env to find secrets
            const secretsUsed = this.extractVariableReferences(step.env, 'secrets');
            if (secretsUsed.length > 0) {
                explained.secretsUsed = secretsUsed;
            }
        }

        if (step.outputs) {
            explained.outputs = step.outputs;
        }

        return explained;
    }

    /**
     * Detect circular dependencies in workflow steps
     */
    private static detectCycles(steps: ParsedStep[]): { hasCycles: boolean; cycles: string[][] } {
        const graph = new Map<string, string[]>();

        // Build adjacency list
        for (const step of steps) {
            graph.set(step.id, step.needs || []);
        }

        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const cycles: string[][] = [];
        const currentPath: string[] = [];

        function dfs(nodeId: string): boolean {
            if (!graph.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);
            currentPath.push(nodeId);

            const neighbors = graph.get(nodeId) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    if (dfs(neighbor)) {
                        return true;
                    }
                } else if (recursionStack.has(neighbor)) {
                    // Found a cycle - extract it from current path
                    const cycleStart = currentPath.indexOf(neighbor);
                    if (cycleStart !== -1) {
                        cycles.push([...currentPath.slice(cycleStart), neighbor]);
                    }
                    return true;
                }
            }

            recursionStack.delete(nodeId);
            currentPath.pop();
            return false;
        }

        // Check each node
        for (const [nodeId] of graph) {
            if (!visited.has(nodeId)) {
                dfs(nodeId);
            }
        }

        return {
            hasCycles: cycles.length > 0,
            cycles,
        };
    }

    /**
     * Calculate maximum dependency depth in the workflow
     */
    private static calculateMaxDepth(
        steps: ParsedStep[],
        dependencyGraph: Record<string, string[]>
    ): number {
        const depths = new Map<string, number>();

        // Calculate depth for each step recursively
        function getDepth(stepId: string, visited = new Set<string>()): number {
            // Return cached depth if already calculated
            if (depths.has(stepId)) {
                return depths.get(stepId)!;
            }

            // Detect cycles
            if (visited.has(stepId)) {
                return 0;
            }

            visited.add(stepId);

            const dependencies = dependencyGraph[stepId] || [];
            if (dependencies.length === 0) {
                depths.set(stepId, 1);
                return 1;
            }

            // Depth is 1 + max depth of dependencies
            const maxDependencyDepth = Math.max(
                ...dependencies.map(dep => getDepth(dep, new Set(visited)))
            );

            const depth = maxDependencyDepth + 1;
            depths.set(stepId, depth);
            return depth;
        }

        // Calculate depth for all steps
        for (const step of steps) {
            getDepth(step.id);
        }

        // Return maximum depth
        return depths.size > 0 ? Math.max(...Array.from(depths.values())) : 1;
    }

    /**
     * Extract variable references from an object
     */
    private static extractVariableReferences(obj: any, prefix: string): string[] {
        const references = new Set<string>();

        // Regex to match ${prefix.variable} or ${{prefix.variable}}
        const regex = new RegExp(`\\$\\{?\\{?\\s*${prefix}\\.([a-zA-Z0-9_]+)`, 'g');

        function search(value: any): void {
            if (typeof value === 'string') {
                let match;
                while ((match = regex.exec(value)) !== null) {
                    references.add(match[1]);
                }
            } else if (typeof value === 'object' && value !== null) {
                for (const v of Object.values(value)) {
                    search(v);
                }
            }
        }

        search(obj);
        return Array.from(references).sort();
    }

    /**
     * Filter out internal fields (those starting with _)
     */
    private static filterInternalFields(obj: Record<string, any> | undefined): Record<string, any> | undefined {
        if (!obj) return undefined;
        const filtered: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (!key.startsWith('_')) {
                filtered[key] = value;
            }
        }
        return Object.keys(filtered).length > 0 ? filtered : undefined;
    }

    /**
     * Analyze data flow throughout the workflow
     * HIGH PRIORITY: Runtime Data Prediction
     * 
     * Predicts what data flows through each step by analyzing:
     * - Workflow inputs referenced
     * - Step outputs consumed by other steps
     * - Context and environment variables
     * - Secrets usage
     */
    private static analyzeDataFlow(
        workflow: ParsedWorkflow,
        dependencyGraph: Record<string, string[]>
    ): DataFlowPrediction[] {
        const dataFlow: DataFlowPrediction[] = [];
        const stepOutputs = new Map<string, Set<string>>(); // step -> output keys

        // First pass: collect all step outputs
        for (const step of workflow.steps) {
            if (step.outputs) {
                stepOutputs.set(step.id, new Set(Object.keys(step.outputs)));
            }
        }

        // Second pass: analyze data flow for each step
        for (const step of workflow.steps) {
            const inputs: DataFlowPrediction['inputs'] = [];
            const outputs: DataFlowPrediction['outputs'] = [];

            // Analyze inputs from step.input (with field)
            if (step.input) {
                // Extract workflow inputs
                const workflowInputRefs = this.extractVariableReferences(step.input, 'inputs');
                for (const key of workflowInputRefs) {
                    inputs.push({
                        source: 'workflow.inputs',
                        key,
                        type: this.inferType(workflow.inputs?.[key]),
                        example: workflow.inputs?.[key]?.default,
                    });
                }

                // Extract step output references
                const stepOutputRefs = this.extractVariableReferences(step.input, 'steps');
                for (const ref of stepOutputRefs) {
                    // ref format: "stepId.outputKey"
                    const [sourceStepId, outputKey] = ref.split('.');
                    if (sourceStepId && outputKey) {
                        inputs.push({
                            source: 'step.output',
                            key: outputKey,
                            sourceStep: sourceStepId,
                            type: 'unknown',
                        });
                    }
                }

                // Extract context references
                const contextRefs = this.extractVariableReferences(step.input, 'context');
                for (const key of contextRefs) {
                    inputs.push({
                        source: 'context',
                        key,
                        type: this.inferType(workflow.context?.[key]),
                    });
                }

                // Static values
                for (const [key, value] of Object.entries(step.input)) {
                    if (typeof value !== 'string' || !value.includes('${')) {
                        inputs.push({
                            source: 'static',
                            key,
                            type: typeof value,
                            example: value,
                        });
                    }
                }
            }

            // Analyze environment variables
            if (step.env) {
                const secretRefs = this.extractVariableReferences(step.env, 'secrets');
                for (const key of secretRefs) {
                    inputs.push({
                        source: 'secrets',
                        key,
                        type: 'string', // Secrets are always strings
                    });
                }

                const envContextRefs = this.extractVariableReferences(step.env, 'context');
                for (const key of envContextRefs) {
                    inputs.push({
                        source: 'context',
                        key,
                        type: this.inferType(workflow.context?.[key]),
                    });
                }
            }

            // Analyze outputs
            if (step.outputs) {
                for (const [key, value] of Object.entries(step.outputs)) {
                    // Find which steps use this output
                    const usedBy: string[] = [];

                    for (const otherStep of workflow.steps) {
                        if (otherStep.id === step.id) continue;

                        // Check if this output is referenced in other step's inputs
                        const inputStr = JSON.stringify(otherStep.input || {});
                        if (inputStr.includes(`steps.${step.id}.${key}`) ||
                            inputStr.includes(`steps.${step.id}[${key}]`)) {
                            usedBy.push(otherStep.id);
                        }

                        // Check in env
                        const envStr = JSON.stringify(otherStep.env || {});
                        if (envStr.includes(`steps.${step.id}.${key}`)) {
                            usedBy.push(otherStep.id);
                        }
                    }

                    outputs.push({
                        key,
                        type: typeof value === 'string' ? 'string' : this.inferType(value),
                        usedBy,
                    });
                }
            }

            // Check for unresolved dependencies
            const deps = dependencyGraph[step.id] || [];
            const hasUnresolvedDependencies = deps.some(depId =>
                !workflow.steps.find(s => s.id === depId)
            );

            dataFlow.push({
                step: step.id,
                stepName: step.name,
                inputs,
                outputs,
                hasUnresolvedDependencies,
            });
        }

        return dataFlow;
    }

    /**
     * Analyze all possible conditional execution paths
     * HIGH PRIORITY: Conditional Path Analysis
     * 
     * Analyzes workflow to determine:
     * - All possible execution paths based on conditions
     * - Steps that may be skipped
     * - Unreachable code
     */
    private static analyzeConditionalPaths(
        workflow: ParsedWorkflow,
        dependencyGraph: Record<string, string[]>
    ): ConditionalPathAnalysis {
        const conditionalSteps = workflow.steps
            .filter(step => step.when)
            .map(step => ({
                step: step.id,
                condition: step.when!,
                canBeSkipped: true,
            }));

        // Simple path analysis (can be enhanced with boolean logic solver)
        const paths: ConditionalPathAnalysis['paths'] = [];

        if (conditionalSteps.length === 0) {
            // No conditions - single path where all steps execute
            paths.push({
                description: 'Default path (no conditions)',
                conditions: [],
                stepsExecuted: workflow.steps.map(s => s.id),
                stepsSkipped: [],
                likelihood: 'always',
            });
        } else {
            // Path 1: All conditions true
            paths.push({
                description: 'All conditional steps execute',
                conditions: conditionalSteps.map(c => `${c.step}: ${c.condition}`),
                stepsExecuted: workflow.steps.map(s => s.id),
                stepsSkipped: [],
                likelihood: 'possible',
            });

            // Path 2: All conditions false
            const conditionalStepIds = new Set(conditionalSteps.map(c => c.step));
            paths.push({
                description: 'All conditional steps skipped',
                conditions: conditionalSteps.map(c => `${c.step}: NOT (${c.condition})`),
                stepsExecuted: workflow.steps.filter(s => !conditionalStepIds.has(s.id)).map(s => s.id),
                stepsSkipped: Array.from(conditionalStepIds),
                likelihood: 'possible',
            });

            // For simplicity, we'll just show these two extremes
            // A more advanced implementation would generate all 2^n combinations
        }

        // Find unreachable steps (steps that depend on other steps that are always skipped)
        const unreachableSteps: string[] = [];

        // Find steps that always execute (no conditions and no dependencies on conditional steps)
        const alwaysExecutes = workflow.steps
            .filter(step => {
                // No condition on this step
                if (step.when) return false;

                // No dependencies on conditional steps
                const deps = dependencyGraph[step.id] || [];
                return !deps.some(depId =>
                    conditionalSteps.some(cs => cs.step === depId)
                );
            })
            .map(s => s.id);

        return {
            totalPaths: paths.length,
            paths,
            conditionalSteps,
            unreachableSteps,
            alwaysExecutes,
        };
    }

    /**
     * Estimate execution time for the workflow
     * HIGH PRIORITY: Execution Time Estimation
     * 
     * Predicts workflow execution duration by:
     * - Analyzing dependency chains
     * - Finding critical path
     * - Estimating per-step execution time
     * - Identifying bottlenecks
     */
    private static estimateExecutionTime(
        workflow: ParsedWorkflow,
        dependencyGraph: Record<string, string[]>
    ): ExecutionTimeEstimation {
        // Default time estimates per adapter type (in milliseconds)
        const adapterTimeEstimates: Record<string, { min: number; avg: number; max: number }> = {
            shell: { min: 100, avg: 1000, max: 5000 },
            http: { min: 50, avg: 500, max: 3000 },
            fs: { min: 10, avg: 100, max: 1000 },
            cli: { min: 100, avg: 1000, max: 5000 },
            mediaproc: { min: 1000, avg: 10000, max: 60000 },
            default: { min: 100, avg: 1000, max: 5000 },
        };

        // Calculate time for each step
        const byStep: ExecutionTimeEstimation['byStep'] = workflow.steps.map(step => {
            const adapter = step.adapter || step.action.split('.')[0];
            const estimate = adapterTimeEstimates[adapter] || adapterTimeEstimates.default;

            // Adjust for timeout if specified
            let timeEstimate = { ...estimate };
            if (step.timeout) {
                const timeout = typeof step.timeout === 'string'
                    ? parseInt(step.timeout)
                    : step.timeout;
                if (!isNaN(timeout)) {
                    timeEstimate.max = Math.min(timeEstimate.max, timeout);
                }
            }

            return {
                step: step.id,
                ...timeEstimate,
                onCriticalPath: false, // Will be updated
            };
        });

        // Group steps by execution phase (based on dependency depth)
        const stepDepths = new Map<string, number>();
        const calculateDepth = (stepId: string, visited = new Set<string>()): number => {
            if (stepDepths.has(stepId)) return stepDepths.get(stepId)!;
            if (visited.has(stepId)) return 0;

            visited.add(stepId);
            const deps = dependencyGraph[stepId] || [];
            const depth = deps.length === 0
                ? 0
                : Math.max(...deps.map(d => calculateDepth(d, new Set(visited)))) + 1;

            stepDepths.set(stepId, depth);
            return depth;
        };

        workflow.steps.forEach(step => calculateDepth(step.id));
        const maxPhase = Math.max(...Array.from(stepDepths.values()));

        // Build by-phase estimates
        const byPhase: ExecutionTimeEstimation['byPhase'] = [];
        for (let phase = 0; phase <= maxPhase; phase++) {
            const stepsInPhase = workflow.steps
                .filter(step => stepDepths.get(step.id) === phase)
                .map(s => s.id);

            if (stepsInPhase.length === 0) continue;

            // In parallel execution, phase time = max of any step in that phase
            // In sequential, phase time = sum of all steps
            const stepTimes = stepsInPhase.map(stepId =>
                byStep.find(s => s.step === stepId)!
            );

            byPhase.push({
                phase,
                steps: stepsInPhase,
                duration: {
                    min: Math.max(...stepTimes.map(s => s.min)),
                    avg: Math.max(...stepTimes.map(s => s.avg)),
                    max: Math.max(...stepTimes.map(s => s.max)),
                },
            });
        }

        // Find critical path (longest dependency chain)
        const findCriticalPath = (): { steps: string[]; duration: number } => {
            const pathDurations = new Map<string, { duration: number; path: string[] }>();

            const calculatePath = (stepId: string, visited = new Set<string>()): { duration: number; path: string[] } => {
                if (pathDurations.has(stepId)) return pathDurations.get(stepId)!;
                if (visited.has(stepId)) return { duration: 0, path: [] };

                visited.add(stepId);
                const deps = dependencyGraph[stepId] || [];
                const stepTime = byStep.find(s => s.step === stepId)!.avg;

                if (deps.length === 0) {
                    return { duration: stepTime, path: [stepId] };
                }

                const depPaths = deps.map(d => calculatePath(d, new Set(visited)));
                const longestDep = depPaths.reduce((max, curr) =>
                    curr.duration > max.duration ? curr : max
                );

                const result = {
                    duration: longestDep.duration + stepTime,
                    path: [...longestDep.path, stepId],
                };

                pathDurations.set(stepId, result);
                return result;
            };

            // Find the longest path among all end nodes (steps with no dependents)
            const endNodes = workflow.steps.filter(step => {
                return !workflow.steps.some(other =>
                    (other.needs || []).includes(step.id)
                );
            });

            const allPaths = endNodes.map(step => calculatePath(step.id));
            const longestPath = allPaths.reduce((max, curr) =>
                curr.duration > max.duration ? curr : max
                , { duration: 0, path: [] as string[] });

            // Mark critical path steps
            longestPath.path.forEach((stepId: string) => {
                const s = byStep.find(s => s.step === stepId);
                if (s) s.onCriticalPath = true;
            });

            return { steps: longestPath.path, duration: longestPath.duration };
        };

        const criticalPath = findCriticalPath();

        // Calculate total time
        const total = {
            min: byPhase.reduce((sum, p) => sum + p.duration.min, 0),
            avg: byPhase.reduce((sum, p) => sum + p.duration.avg, 0),
            max: byPhase.reduce((sum, p) => sum + p.duration.max, 0),
        };

        // Identify bottlenecks (steps on critical path with long duration)
        const avgStepTime = total.avg / workflow.steps.length;
        const bottlenecks: ExecutionTimeEstimation['bottlenecks'] = byStep
            .filter(s => s.onCriticalPath && s.avg > avgStepTime * 1.5)
            .map(s => ({
                step: s.step,
                reason: `On critical path with ${s.avg}ms avg execution time`,
                impact: Math.round(s.avg * 0.5), // Assume 50% optimization potential
            }));

        return {
            total,
            byPhase,
            criticalPath,
            bottlenecks,
            byStep,
        };
    }

    /**
     * Infer type from workflow value definition
     */
    private static inferType(value: any): string {
        if (!value) return 'unknown';
        if (typeof value !== 'object') return typeof value;
        if (value.type) return value.type as string;
        if (value.default !== undefined) return typeof value.default;
        return 'unknown';
    }

    /**
     * Generate human-readable sentences from structured logs
     * 
     * This method converts the JSON-formatted explanation logs into
     * natural language sentences that describe the workflow execution plan.
     * 
     * @param explanation - The execution explanation to convert
     * @returns Array of human-readable sentences
     */
    static generateSentencesFromLogs(explanation: ExecutionExplanation): string[] {
        const sentences: string[] = [];

        // Workflow overview sentence
        const workflowType = this.inferWorkflowType(explanation);
        sentences.push(
            `This workflow "${explanation.workflowName}" is designed to ${workflowType}.`
        );

        // Execution strategy sentence
        if (explanation.executionStrategy === 'sequential') {
            sentences.push(
                `It will execute ${explanation.stepCount} steps sequentially, one after another.`
            );
        } else if (explanation.executionStrategy === 'parallel') {
            sentences.push(
                `It will execute all ${explanation.stepCount} steps in parallel for maximum efficiency.`
            );
        } else {
            sentences.push(
                `It will execute ${explanation.stepCount} steps using a mixed strategy, ` +
                `with ${explanation.complexity?.parallelizableSteps || 0} steps running in parallel ` +
                `and ${explanation.complexity?.sequentialSteps || 0} steps running sequentially.`
            );
        }

        // Adapters sentence
        if (explanation.adaptersUsed.length > 0) {
            const adapterList = explanation.adaptersUsed.join(', ');
            sentences.push(
                `The workflow uses ${explanation.adaptersUsed.length} adapter(s): ${adapterList}.`
            );
        }

        // Inputs sentence
        if (explanation.requiredInputs && explanation.requiredInputs.length > 0) {
            sentences.push(
                `Required inputs: ${explanation.requiredInputs.join(', ')}.`
            );
        }

        // Time estimation sentence
        if (explanation.timeEstimation) {
            const { total } = explanation.timeEstimation;
            sentences.push(
                `Estimated execution time: ${total.min}-${total.max}ms (average: ${total.avg}ms).`
            );

            if (explanation.timeEstimation.bottlenecks.length > 0) {
                const bottleneck = explanation.timeEstimation.bottlenecks[0];
                sentences.push(
                    `Potential bottleneck identified in step "${bottleneck.step}": ${bottleneck.reason}.`
                );
            }
        }

        // Critical path sentence
        if (explanation.timeEstimation?.criticalPath) {
            const { steps } = explanation.timeEstimation.criticalPath;
            sentences.push(
                `Critical path (longest dependency chain): ${steps.join(' → ')}.`
            );
        }

        // Data flow sentence
        if (explanation.dataFlow && explanation.dataFlow.length > 0) {
            const stepsWithInputs = explanation.dataFlow.filter(df =>
                df.inputs.some(i => i.source === 'workflow.inputs')
            ).length;
            const stepsWithOutputs = explanation.dataFlow.filter(df => df.outputs.length > 0).length;

            if (stepsWithInputs > 0 || stepsWithOutputs > 0) {
                sentences.push(
                    `Data flow: ${stepsWithInputs} step(s) consume workflow inputs, ` +
                    `${stepsWithOutputs} step(s) produce outputs.`
                );
            }
        }

        // Conditional paths sentence
        if (explanation.conditionalPaths && explanation.conditionalPaths.conditionalSteps.length > 0) {
            sentences.push(
                `The workflow has ${explanation.conditionalPaths.conditionalSteps.length} conditional step(s) ` +
                `that may be skipped based on runtime conditions.`
            );
        }

        // Cycles warning sentence
        if (explanation.hasCycles) {
            sentences.push(
                `⚠️ WARNING: Circular dependencies detected! This workflow cannot be executed safely.`
            );
        }

        // Step-by-step execution plan
        sentences.push('\nExecution plan:');
        explanation.steps.forEach((step, index) => {
            const stepNum = index + 1;
            let stepSentence = `  ${stepNum}. "${step.name || step.id}" will execute "${step.uses}"`;

            if (step.needs.length > 0) {
                stepSentence += ` after completing: ${step.needs.join(', ')}`;
            }

            if (step.when) {
                stepSentence += ` (conditional: ${step.when})`;
            }

            stepSentence += '.';
            sentences.push(stepSentence);

            // Add input/output info
            if (step.inputsReferenced && step.inputsReferenced.length > 0) {
                sentences.push(`     → Uses inputs: ${step.inputsReferenced.join(', ')}`);
            }
            if (step.outputs && Object.keys(step.outputs).length > 0) {
                sentences.push(`     → Produces outputs: ${Object.keys(step.outputs).join(', ')}`);
            }
        });

        // Expected outputs sentence
        if (explanation.outputs && Object.keys(explanation.outputs).length > 0) {
            const outputKeys = Object.keys(explanation.outputs);
            sentences.push(
                `\nExpected workflow outputs: ${outputKeys.join(', ')}.`
            );
        }

        return sentences;
    }

    /**
     * Infer workflow type from explanation
     */
    private static inferWorkflowType(explanation: ExecutionExplanation): string {
        const adapters = explanation.adaptersUsed;
        const name = explanation.workflowName?.toLowerCase() || '';
        const description = explanation.description?.toLowerCase() || '';

        // Analyze adapters and names/descriptions for type inference
        if (adapters.includes('http') || adapters.includes('api')) {
            return 'make API calls and process HTTP responses';
        }
        if (adapters.includes('db') || adapters.includes('database')) {
            return 'interact with databases and manage data';
        }
        if (adapters.includes('shell') || adapters.includes('cli')) {
            return 'execute shell commands and CLI operations';
        }
        if (adapters.includes('fs') || adapters.includes('file')) {
            return 'perform file system operations';
        }
        if (name.includes('deploy') || description.includes('deploy')) {
            return 'deploy applications and services';
        }
        if (name.includes('test') || description.includes('test')) {
            return 'run tests and validate functionality';
        }
        if (name.includes('build') || description.includes('build')) {
            return 'build and compile applications';
        }
        if (name.includes('backup') || description.includes('backup')) {
            return 'backup data and resources';
        }
        if (name.includes('monitor') || description.includes('monitor')) {
            return 'monitor systems and collect metrics';
        }

        // Default fallback
        return 'automate workflow tasks';
    }
}
