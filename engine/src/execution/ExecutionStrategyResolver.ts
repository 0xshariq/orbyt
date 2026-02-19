/**
 * Execution Strategy Resolver
 * 
 * Intelligence layer that decides HOW to run workflows safely.
 * 
 * This layer can adjust execution strategy based on:
 * - System load
 * - Resource availability
 * - Workflow intent
 * - Adapter capabilities
 * - Past execution patterns
 * 
 * Foundation: Currently returns default strategy.
 * Future: Can implement load-aware, intent-aware execution.
 */

import { ExecutionStrategyContext, ParsedWorkflow, ResolvedExecutionStrategy } from "../types/core-types.js";



/**
 * Execution Strategy Resolver
 * 
 * Hook point for intelligent execution decisions.
 * Currently returns default strategy - foundation for future intelligence.
 */
export class ExecutionStrategyResolver {
    /**
     * Resolve execution strategy for a workflow
     * 
     * Foundation implementation: Returns default strategy with basic intelligence
     * Future: Can analyze context and make advanced intelligent decisions
     */
    static resolve(context: ExecutionStrategyContext): ResolvedExecutionStrategy {
        // 1. Check system load (if provided)
        if (context.systemLoad?.cpu && context.systemLoad.cpu > 0.8) {
            return this.resolveForHighLoad(context);
        }

        // 2. Check workflow intent
        if (context.intent === 'data-pipeline') {
            return this.resolveForDataPipeline(context);
        }

        // 3. Check historical patterns (if provided)
        if (context.history?.averageSuccessRate && context.history.averageSuccessRate < 0.5) {
            return this.resolveForUnreliableWorkflow(context);
        }

        // 4. Check resource limits
        if (context.resourceLimits?.maxConcurrentSteps === 1) {
            return {
                strategy: 'sequential',
                adjustments: {
                    maxConcurrentSteps: 1,
                },
                reason: 'Sequential execution enforced by resource limits',
            };
        }

        // 5. Check if workflow requires safe mode
        if (this.requiresSafeMode(context.workflow)) {
            return {
                strategy: 'conservative',
                adjustments: {
                    maxRetries: 3,
                    retryStrategy: 'exponential',
                    timeoutMultiplier: 1.5,
                },
                reason: 'Safe mode recommended for workflow pattern',
            };
        }

        // Default: Normal execution strategy
        return {
            strategy: 'default',
            adjustments: {},
            reason: 'Default execution strategy (no special conditions detected)',
        };
    }

    /**
     * Resolve strategy for high system load
     * Analyzes system load and workflow complexity to determine safe execution strategy
     */
    private static resolveForHighLoad(
        context: ExecutionStrategyContext
    ): ResolvedExecutionStrategy {
        const load = context.systemLoad!;
        const stepCount = context.workflow.steps.length;

        // Determine concurrency based on CPU load
        let maxConcurrentSteps = 2;
        if (load.cpu > 0.9) {
            maxConcurrentSteps = 1; // Force sequential for very high load
        } else if (load.cpu > 0.85) {
            maxConcurrentSteps = 2;
        } else {
            maxConcurrentSteps = 3;
        }

        // Adjust timeout based on load and workflow size
        let timeoutMultiplier = 1.5;
        if (load.memory > 0.85 || stepCount > 20) {
            timeoutMultiplier = 2.0; // More generous timeout under stress
        }

        return {
            strategy: load.cpu > 0.9 ? 'sequential' : 'conservative',
            adjustments: {
                maxConcurrentSteps,
                timeoutMultiplier,
                retryStrategy: 'exponential',
                maxRetries: 2, // Fewer retries under high load
            },
            reason: `High system load detected (CPU: ${Math.round(load.cpu * 100)}%, Memory: ${Math.round(load.memory * 100)}%, Active: ${load.activeWorkflows})`,
        };
    }

    /**
     * Resolve strategy for data pipeline intent
     * Optimizes for data reliability and throughput
     */
    private static resolveForDataPipeline(
        context: ExecutionStrategyContext
    ): ResolvedExecutionStrategy {
        const stepCount = context.workflow.steps.length;
        const resourceLimits = context.resourceLimits;

        // Data pipelines benefit from retries and caching
        let maxRetries = 5;
        let maxConcurrentSteps: number | undefined;

        // For large pipelines, limit concurrency to avoid overwhelming sources
        if (stepCount > 30) {
            maxConcurrentSteps = resourceLimits?.maxConcurrentSteps
                ? Math.min(resourceLimits.maxConcurrentSteps, 5)
                : 5;
        } else if (stepCount > 15) {
            maxConcurrentSteps = resourceLimits?.maxConcurrentSteps
                ? Math.min(resourceLimits.maxConcurrentSteps, 10)
                : 10;
        }

        // If historical data shows reliability issues, increase retries
        if (context.history?.averageSuccessRate && context.history.averageSuccessRate < 0.8) {
            maxRetries = 7;
        }

        return {
            strategy: 'resilient',
            adjustments: {
                maxRetries,
                retryStrategy: 'exponential',
                enableCaching: true,
                maxConcurrentSteps,
                timeoutMultiplier: 1.5, // Data operations may take longer
            },
            reason: `Data pipeline optimization (${stepCount} steps, resilient execution)`,
        };
    }

    /**
     * Resolve strategy for unreliable workflows
     * Analyzes historical failures to maximize success rate
     */
    private static resolveForUnreliableWorkflow(
        context: ExecutionStrategyContext
    ): ResolvedExecutionStrategy {
        const history = context.history!;
        const successRate = history.averageSuccessRate;

        // Adjust retries based on historical success rate
        let maxRetries = 3;
        let timeoutMultiplier = 2.0;

        if (successRate < 0.3) {
            // Very unreliable - maximum safety measures
            maxRetries = 5;
            timeoutMultiplier = 3.0;
        } else if (successRate < 0.5) {
            // Moderately unreliable - increased retries
            maxRetries = 4;
            timeoutMultiplier = 2.5;
        }

        // Reduce concurrency for unreliable workflows to avoid cascading failures
        let maxConcurrentSteps = 3;
        if (successRate < 0.4) {
            maxConcurrentSteps = 1; // Sequential for very unreliable
        } else if (successRate < 0.6) {
            maxConcurrentSteps = 2;
        }

        // Analyze common failures to provide specific recommendations
        const failureDetails = history.commonFailures?.length > 0
            ? ` (common failures: ${history.commonFailures.slice(0, 2).join(', ')})`
            : '';

        return {
            strategy: successRate < 0.4 ? 'sequential' : 'conservative',
            adjustments: {
                maxRetries,
                timeoutMultiplier,
                retryStrategy: 'exponential',
                maxConcurrentSteps,
            },
            reason: `Low historical success rate (${Math.round(successRate * 100)}% over ${history.previousExecutions} runs)${failureDetails}`,
        };
    }

    /**
     * Check if workflow should run in safe mode
     * Foundation: Detects basic risky patterns
     * Future: Can analyze workflow for more complex risky patterns
     */
    static requiresSafeMode(workflow: ParsedWorkflow): boolean {
        // Check for high step count (complex workflows are riskier)
        if (workflow.steps.length > 20) {
            return true;
        }

        // Check if workflow has no retry configured at all
        const hasRetryConfig = workflow.steps.some(step =>
            (step as any).retry !== undefined
        );
        const hasDefaultRetry = workflow.defaults?.retry !== undefined;

        if (!hasRetryConfig && !hasDefaultRetry && workflow.steps.length > 5) {
            // Complex workflow without retry - recommend safe mode
            return true;
        }

        // Check for multiple external dependencies (network operations)
        const externalAdapters = ['http', 'webhook', 'api', 'rest'];
        const externalStepCount = workflow.steps.filter(step =>
            externalAdapters.includes(step.adapter)
        ).length;

        if (externalStepCount > 5) {
            // Many external dependencies - recommend safe mode
            return true;
        }

        return false;
    }

    /**
     * Estimate workflow resource requirements
     * Foundation: Basic analysis based on step types and count
     * Future: Can help with scheduling and resource allocation
     */
    static estimateResourceRequirements(workflow: ParsedWorkflow): {
        cpu: 'low' | 'medium' | 'high';
        memory: 'low' | 'medium' | 'high';
        network: 'low' | 'medium' | 'high';
    } {
        const stepCount = workflow.steps.length;

        // Analyze adapter types
        const adapters = workflow.steps.map(s => s.adapter);
        const cpuIntensiveAdapters = ['cli', 'shell', 'exec', 'script'];
        const networkAdapters = ['http', 'webhook', 'api', 'rest', 'graphql'];
        const memoryIntensiveAdapters = ['fs', 'file', 'data', 'transform'];

        const cpuIntensiveCount = adapters.filter(a => cpuIntensiveAdapters.includes(a)).length;
        const networkCount = adapters.filter(a => networkAdapters.includes(a)).length;
        const memoryIntensiveCount = adapters.filter(a => memoryIntensiveAdapters.includes(a)).length;

        // Estimate CPU usage
        let cpu: 'low' | 'medium' | 'high' = 'low';
        if (cpuIntensiveCount > 5 || stepCount > 30) {
            cpu = 'high';
        } else if (cpuIntensiveCount > 2 || stepCount > 10) {
            cpu = 'medium';
        }

        // Estimate memory usage
        let memory: 'low' | 'medium' | 'high' = 'low';
        if (memoryIntensiveCount > 5 || stepCount > 30) {
            memory = 'high';
        } else if (memoryIntensiveCount > 2 || stepCount > 10) {
            memory = 'medium';
        }

        // Estimate network usage
        let network: 'low' | 'medium' | 'high' = 'low';
        if (networkCount > 10) {
            network = 'high';
        } else if (networkCount > 3) {
            network = 'medium';
        }

        return { cpu, memory, network };
    }
}

/**
 * Execution Strategy Guard
 * 
 * Safety checks before execution starts.
 * Can prevent execution if conditions are unsafe.
 */
export class ExecutionStrategyGuard {
    /**
     * Check if it's safe to execute workflow
     * 
     * Foundation: Basic safety checks
     * Future: Can check resource availability, system health, etc.
     */
    static isSafeToExecute(context: ExecutionStrategyContext): {
        safe: boolean;
        reason?: string;
    } {
        // Check if system load is too high
        if (context.systemLoad) {
            if (context.systemLoad.cpu > 0.95) {
                return {
                    safe: false,
                    reason: 'System CPU usage is critically high (>95%)',
                };
            }
            if (context.systemLoad.memory > 0.95) {
                return {
                    safe: false,
                    reason: 'System memory usage is critically high (>95%)',
                };
            }
            if (context.systemLoad.activeWorkflows > 100) {
                return {
                    safe: false,
                    reason: 'Too many active workflows (>100)',
                };
            }
        }

        // Check resource requirements vs limits
        const requirements = ExecutionStrategyResolver.estimateResourceRequirements(context.workflow);
        if (requirements.cpu === 'high' && context.systemLoad?.cpu && context.systemLoad.cpu > 0.7) {
            return {
                safe: false,
                reason: 'High CPU requirement with current system load',
            };
        }

        // Check workflow complexity
        if (context.workflow.steps.length > 100) {
            return {
                safe: false,
                reason: 'Workflow exceeds maximum recommended step count (100)',
            };
        }

        return {
            safe: true,
        };
    }

    /**
     * Recommend delay before execution
     * Foundation: Basic delay based on system load
     * Future: Can suggest waiting during high load
     */
    static recommendedDelay(context: ExecutionStrategyContext): number {
        // Check system load and recommend delay if high
        if (context.systemLoad) {
            // If CPU is high but not critical, suggest short delay
            if (context.systemLoad.cpu > 0.8 && context.systemLoad.cpu <= 0.95) {
                return 5000; // 5 second delay
            }
            // If memory is high, suggest delay
            if (context.systemLoad.memory > 0.8 && context.systemLoad.memory <= 0.95) {
                return 3000; // 3 second delay
            }
            // If many active workflows, suggest delay
            if (context.systemLoad.activeWorkflows > 50) {
                return 2000; // 2 second delay
            }
        }

        // No delay needed
        return 0;
    }
}
