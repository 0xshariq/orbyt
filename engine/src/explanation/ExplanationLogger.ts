/**
 * Explanation Logger
 * 
 * Integrates explanation generation with EngineLogger to provide
 * full transparency into workflow execution plans.
 * 
 * This module ensures that explanations are ALWAYS logged before
 * execution begins, regardless of whether the user explicitly
 * requests an explanation.
 * 
 * @module explanation
 */


import { LoggerManager } from '../logging/LoggerManager.js';
import { ExecutionExplanation, ExplanationEvent } from '../types/core-types.js';

/**
 * Explanation Logger
 * 
 * Formats and logs execution explanations through EngineLogger.
 * Called automatically before every workflow execution.
 */
export class ExplanationLogger {
    /**
     * Log a complete workflow explanation
     * 
     * @param explanation - The execution explanation to log
     * @param level - Log level ('info' or 'debug')
     * @returns The explanation event created for this log
     */
    static log(
        explanation: ExecutionExplanation,
        level: 'info' | 'debug' = 'info'
    ): ExplanationEvent {
        const logger = LoggerManager.getLogger();
        // Create structured explanation event
        const event: ExplanationEvent = {
            type: 'explanation',
            timestamp: new Date(),
            explanation,
        };

        // Log workflow overview
        const logMethod = level === 'info' ? logger.info.bind(logger) : logger.debug.bind(logger);

        logMethod('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logMethod('📋 WORKFLOW EXECUTION PLAN');
        logMethod('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Workflow metadata
        logMethod(`Workflow: ${explanation.workflowName}`);
        if (explanation.description) {
            logMethod(`Description: ${explanation.description}`);
        }
        logMethod(`Version: ${explanation.version} | Kind: ${explanation.kind}`);
        if (explanation.owner) {
            logMethod(`Owner: ${explanation.owner}`);
        }
        if (explanation.tags && explanation.tags.length > 0) {
            logMethod(`Tags: ${explanation.tags.join(', ')}`);
        }
        logMethod('');

        // Execution strategy
        logMethod(`⚙️  Execution Strategy: ${explanation.executionStrategy.toUpperCase()}`);
        logMethod(`   Total Steps: ${explanation.stepCount}`);
        if (explanation.complexity) {
            logMethod(`   Max Depth: ${explanation.complexity.maxDepth}`);
            logMethod(`   Parallelizable: ${explanation.complexity.parallelizableSteps} steps`);
            logMethod(`   Sequential: ${explanation.complexity.sequentialSteps} steps`);
        }
        logMethod('');

        // Cycle detection warning
        if (explanation.hasCycles) {
            logger.warn('⚠️  CIRCULAR DEPENDENCIES DETECTED!');
            if (explanation.cycles) {
                for (const cycle of explanation.cycles) {
                    logger.warn(`   Cycle: ${cycle.join(' → ')}`);
                }
            }
            logger.warn('   This workflow cannot be executed safely.');
            logMethod('');
        }

        // Adapters used
        if (explanation.adaptersUsed.length > 0) {
            logMethod('🔌 Adapters:');
            for (const adapter of explanation.adaptersUsed) {
                const actions = explanation.adapterActions?.[adapter] || [];
                logMethod(`   ${adapter}: ${actions.join(', ')}`);
            }
            logMethod('');
        }

        // Inputs
        if (explanation.requiredInputs && explanation.requiredInputs.length > 0) {
            logMethod('📥 Required Inputs:');
            for (const input of explanation.requiredInputs) {
                logMethod(`   • ${input} (required)`);
            }
            logMethod('');
        }

        if (explanation.optionalInputs && Object.keys(explanation.optionalInputs).length > 0) {
            logMethod('📥 Optional Inputs:');
            for (const [key, value] of Object.entries(explanation.optionalInputs)) {
                logMethod(`   • ${key} = ${JSON.stringify(value)} (default)`);
            }
            logMethod('');
        }

        // Secrets
        if (explanation.secrets?.keys && explanation.secrets.keys.length > 0) {
            logMethod('🔐 Secrets:');
            logMethod(`   Vault: ${explanation.secrets.vault}`);
            for (const key of explanation.secrets.keys) {
                logMethod(`   • ${key}`);
            }
            logMethod('');
        }

        // ============================================================================
        // HIGH PRIORITY FEATURES
        // ============================================================================

        // Execution Time Estimation
        if (explanation.timeEstimation) {
            logMethod('⏱️  Time Estimation:');
            const { total, criticalPath, bottlenecks } = explanation.timeEstimation;
            logMethod(`   Total Time: ${total.min}-${total.max}ms (avg: ${total.avg}ms)`);
            logMethod(`   Critical Path: ${criticalPath.steps.join(' → ')} (${criticalPath.duration}ms)`);
            
            if (bottlenecks.length > 0) {
                logMethod(`   Bottlenecks:`);
                for (const bottleneck of bottlenecks) {
                    logMethod(`      • ${bottleneck.step}: ${bottleneck.reason} (impact: ${bottleneck.impact}ms)`);
                }
            }
            logMethod('');
        }

        // Data Flow Summary
        if (explanation.dataFlow && explanation.dataFlow.length > 0) {
            logMethod('🔄 Data Flow:');
            const stepsWithExternalInputs = explanation.dataFlow.filter(df => 
                df.inputs.some(i => i.source === 'workflow.inputs')
            );
            const stepsWithOutputs = explanation.dataFlow.filter(df => df.outputs.length > 0);
            
            logMethod(`   ${stepsWithExternalInputs.length} steps use workflow inputs`);
            logMethod(`   ${stepsWithOutputs.length} steps produce outputs`);
            
            const unresolved = explanation.dataFlow.filter(df => df.hasUnresolvedDependencies);
            if (unresolved.length > 0) {
                logMethod(`   ⚠️  ${unresolved.length} steps have unresolved dependencies`);
            }
            logMethod('');
        }

        // Conditional Paths Summary
        if (explanation.conditionalPaths) {
            logMethod('🔀 Conditional Paths:');
            const { totalPaths, conditionalSteps, alwaysExecutes } = explanation.conditionalPaths;
            logMethod(`   Total Possible Paths: ${totalPaths}`);
            logMethod(`   Conditional Steps: ${conditionalSteps.length}`);
            logMethod(`   Always Execute: ${alwaysExecutes.length} steps`);
            
            if (conditionalSteps.length > 0) {
                logMethod(`   Conditional:`);
                for (const cs of conditionalSteps) {
                    logMethod(`      • ${cs.step}: ${cs.condition}`);
                }
            }
            logMethod('');
        }

        // Steps
        logMethod('📝 Execution Steps:\n');
        this.logSteps(explanation, level);

        // Outputs
        if (explanation.outputs) {
            logMethod('\n📤 Expected Outputs:');
            for (const [key, value] of Object.entries(explanation.outputs)) {
                logMethod(`   • ${key}: ${JSON.stringify(value)}`);
            }
            logMethod('');
        }

        // Policies
        if (explanation.policies) {
            logMethod('🛡️  Policies:');
            if (explanation.policies.failure) {
                logMethod(`   Failure: ${explanation.policies.failure}`);
            }
            if (explanation.policies.concurrency) {
                logMethod(`   Concurrency: ${explanation.policies.concurrency}`);
            }
            if (explanation.policies.sandbox) {
                logMethod(`   Sandbox: ${explanation.policies.sandbox}`);
            }
            logMethod('');
        }

        logMethod('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Return the structured event
        return event;
    }

    /**
     * Log individual steps with proper formatting
     */
    private static logSteps(
        explanation: ExecutionExplanation,
        level: 'info' | 'debug'
    ): void {
        const logger = LoggerManager.getLogger();
        const logMethod = level === 'info' ? logger.info.bind(logger) : logger.debug.bind(logger);

        for (let i = 0; i < explanation.steps.length; i++) {
            const step = explanation.steps[i];
            const stepNum = i + 1;

            // Step header
            logMethod(`  ${stepNum}. ${step.name} (${step.id})`);
            logMethod(`     Uses: ${step.uses}`);

            // Dependencies
            if (step.needs.length > 0) {
                logMethod(`     Needs: ${step.needs.join(', ')}`);
            }

            // Conditions
            if (step.when) {
                logMethod(`     When: ${step.when}`);
            }

            // Configuration
            const configs: string[] = [];
            if (step.timeout) {
                configs.push(`timeout=${step.timeout}ms`);
            }
            if (step.retry) {
                configs.push(`retry.max=${step.retry.max}`);
                if (step.retry.backoff) {
                    configs.push(`retry.backoff=${step.retry.backoff}`);
                }
            }
            if (step.continueOnError !== undefined) {
                configs.push(`continueOnError=${step.continueOnError}`);
            }

            if (configs.length > 0) {
                logMethod(`     Config: ${configs.join(', ')}`);
            }

            // Inputs referenced
            if (step.inputsReferenced && step.inputsReferenced.length > 0) {
                logMethod(`     Inputs: ${step.inputsReferenced.join(', ')}`);
            }

            // Secrets used
            if (step.secretsUsed && step.secretsUsed.length > 0) {
                logMethod(`     Secrets: ${step.secretsUsed.join(', ')}`);
            }

            // Outputs
            if (step.outputs && Object.keys(step.outputs).length > 0) {
                const outputKeys = Object.keys(step.outputs);
                logMethod(`     Outputs: ${outputKeys.join(', ')}`);
            }

            logMethod(''); // Blank line between steps
        }
    }

    /**
     * Log a compact explanation (single line summary)
     * 
     * Useful for quick overview without detailed breakdown.
     * 
     * @returns The explanation event created for this log
     */
    static logCompact(
        explanation: ExecutionExplanation
    ): ExplanationEvent {
        const logger = LoggerManager.getLogger();
        const summary = [
            `Workflow: ${explanation.workflowName}`,
            `${explanation.stepCount} steps`,
            `${explanation.executionStrategy}`,
            `${explanation.adaptersUsed.length} adapters`,
        ];

        if (explanation.hasCycles) {
            summary.push('⚠️ HAS CYCLES');
        }

        logger.info(`📋 ${summary.join(' | ')}`);
        
        // Return the structured event
        return {
            type: 'explanation',
            timestamp: new Date(),
            explanation,
        };
    }

    /**
     * Log explanation as structured JSON
     * 
     * Useful for machine-readable output or debugging.
     * 
     * @returns The explanation event created for this log
     */
    static logJSON(
        explanation: ExecutionExplanation
    ): ExplanationEvent {
        const logger = LoggerManager.getLogger();
        // Create structured explanation event
        const event: ExplanationEvent = {
            type: 'explanation',
            timestamp: new Date(),
            explanation,
        };

        logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info('📋 WORKFLOW EXECUTION PLAN (JSON)');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        logger.info(JSON.stringify(event, null, 2));
        logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Return the structured event
        return event;
    }
}
