/**
 * Failure Handler
 * 
 * Runtime executor for failure strategies in workflow execution.
 * Handles failure decisions, cleanup, and error propagation.
 * 
 * @module automation/runtime
 */

import { FailureStrategy, type FailureDecision } from '../FailureStrategy.js';

/**
 * Failure context for tracking execution state
 */
export interface FailureContext {
  /** ID of failed step */
  stepId: string;
  
  /** Error that caused failure */
  error: Error;
  
  /** Total steps in workflow */
  totalSteps: number;
  
  /** Number of completed steps */
  completedSteps: number;
  
  /** Number of failed steps so far */
  failureCount: number;
  
  /** Workflow execution ID */
  executionId?: string;
}

/**
 * Failure handling result
 */
export interface FailureHandlingResult {
  /** Failure decision */
  decision: FailureDecision;
  
  /** Cleanup completed successfully */
  cleanupSuccess: boolean;
  
  /** Error during cleanup (if any) */
  cleanupError?: Error;
  
  /** Steps to skip based on decision */
  stepsToSkip: string[];
}

/**
 * Failure event listeners
 */
export interface FailureListeners {
  /** Called before handling failure */
  onBeforeHandle?: (context: FailureContext) => void | Promise<void>;
  
  /** Called after decision is made */
  onDecision?: (decision: FailureDecision, context: FailureContext) => void | Promise<void>;
  
  /** Called before cleanup */
  onBeforeCleanup?: (context: FailureContext) => void | Promise<void>;
  
  /** Called after cleanup */
  onAfterCleanup?: (success: boolean, context: FailureContext) => void | Promise<void>;
  
  /** Called when workflow should abort */
  onAbort?: (reason: string, context: FailureContext) => void | Promise<void>;
  
  /** Called when workflow continues after failure */
  onContinue?: (context: FailureContext) => void | Promise<void>;
}

/**
 * Dependency information for skip decisions
 */
export interface DependencyInfo {
  /** Step ID to dependencies map */
  stepDependencies: Map<string, string[]>;
  
  /** Step ID to dependents map (reverse) */
  stepDependents: Map<string, string[]>;
}

/**
 * Failure handler for workflow execution
 */
export class FailureHandler {
  /**
   * Handle step failure with strategy
   * 
   * @param context - Failure context
   * @param strategy - Failure strategy
   * @param dependencyInfo - Dependency information for skip decisions
   * @param listeners - Event listeners
   * @returns Failure handling result
   */
  static async handle(
    context: FailureContext,
    strategy: FailureStrategy,
    dependencyInfo?: DependencyInfo,
    listeners?: FailureListeners
  ): Promise<FailureHandlingResult> {
    // Call before handle listener
    await listeners?.onBeforeHandle?.(context);

    // Get failure decision from strategy
    const decision = await strategy.decide(
      context.stepId,
      context.error,
      context.totalSteps,
      context.completedSteps
    );

    // Call decision listener
    await listeners?.onDecision?.(decision, context);

    // Execute cleanup if needed
    let cleanupSuccess = true;
    let cleanupError: Error | undefined;

    if (decision.runCleanup) {
      await listeners?.onBeforeCleanup?.(context);
      
      try {
        // Strategy already runs onFailure during decide()
        // This is additional cleanup if needed
        cleanupSuccess = true;
      } catch (error) {
        cleanupSuccess = false;
        cleanupError = error instanceof Error ? error : new Error(String(error));
      }

      await listeners?.onAfterCleanup?.(cleanupSuccess, context);
    }

    // Determine steps to skip
    const stepsToSkip = decision.skipDependentSteps && dependencyInfo
      ? this.calculateStepsToSkip(context.stepId, dependencyInfo)
      : [];

    // Call appropriate listener
    if (!decision.continueWorkflow) {
      await listeners?.onAbort?.(decision.reason, context);
    } else {
      await listeners?.onContinue?.(context);
    }

    return {
      decision,
      cleanupSuccess,
      cleanupError,
      stepsToSkip,
    };
  }

  /**
   * Calculate which steps should be skipped based on failed step
   * Uses dependency graph to find all dependent steps
   * 
   * @param failedStepId - ID of failed step
   * @param dependencyInfo - Dependency information
   * @returns Array of step IDs to skip
   */
  private static calculateStepsToSkip(
    failedStepId: string,
    dependencyInfo: DependencyInfo
  ): string[] {
    const toSkip = new Set<string>();
    const queue = [failedStepId];

    // BFS to find all dependent steps
    while (queue.length > 0) {
      const stepId = queue.shift()!;
      const dependents = dependencyInfo.stepDependents.get(stepId) || [];

      for (const dependent of dependents) {
        if (!toSkip.has(dependent)) {
          toSkip.add(dependent);
          queue.push(dependent);
        }
      }
    }

    return Array.from(toSkip);
  }

  /**
   * Check if step should be skipped based on failure context
   * 
   * @param stepId - Step to check
   * @param skippedSteps - Set of steps that should be skipped
   * @returns True if step should be skipped
   */
  static shouldSkipStep(stepId: string, skippedSteps: Set<string>): boolean {
    return skippedSteps.has(stepId);
  }

  /**
   * Create enriched error with failure context
   * 
   * @param originalError - Original error
   * @param context - Failure context
   * @param decision - Failure decision
   * @returns Enriched error
   */
  static enrichError(
    originalError: Error,
    context: FailureContext,
    decision: FailureDecision
  ): Error {
    const enriched = new Error(originalError.message);
    enriched.name = originalError.name;
    enriched.stack = originalError.stack;

    (enriched as any).failureContext = {
      stepId: context.stepId,
      executionId: context.executionId,
      failureCount: context.failureCount,
      decision: decision.reason,
      continueWorkflow: decision.continueWorkflow,
    };

    return enriched;
  }

  /**
   * Build failure summary for logging/reporting
   * 
   * @param context - Failure context
   * @param decision - Failure decision
   * @param result - Handling result
   * @returns Formatted failure summary
   */
  static buildFailureSummary(
    context: FailureContext,
    decision: FailureDecision,
    result: FailureHandlingResult
  ): string {
    const lines = [
      `❌ Step Failure: ${context.stepId}`,
      `   Error: ${context.error.message}`,
      `   Decision: ${decision.reason}`,
      `   Continue: ${decision.continueWorkflow ? 'Yes' : 'No'}`,
    ];

    if (result.stepsToSkip.length > 0) {
      lines.push(`   Skipping: ${result.stepsToSkip.join(', ')}`);
    }

    if (decision.runCleanup) {
      lines.push(`   Cleanup: ${result.cleanupSuccess ? '✅' : '❌'}`);
    }

    if (decision.finalStatus) {
      lines.push(`   Final Status: ${decision.finalStatus}`);
    }

    return lines.join('\n');
  }

  /**
   * Determine final workflow status based on failures
   * 
   * @param totalSteps - Total number of steps
   * @param completedSteps - Number of completed steps
   * @param failedSteps - Number of failed steps
   * @param allowPartialSuccess - Whether partial success is allowed
   * @returns Final workflow status
   */
  static determineFinalStatus(
    totalSteps: number,
    completedSteps: number,
    failedSteps: number,
    allowPartialSuccess: boolean
  ): 'success' | 'failed' | 'partial' {
    // All steps completed successfully
    if (failedSteps === 0) {
      return 'success';
    }

    // No steps completed at all
    if (completedSteps === 0) {
      return 'failed';
    }

    // Calculate completion ratio for better status decision
    const completionRatio = completedSteps / totalSteps;
    const failureRatio = failedSteps / totalSteps;

    // If partial success is allowed and we have meaningful completion
    if (allowPartialSuccess && completedSteps > 0) {
      // Consider it still 'failed' if less than 50% completed
      // but mark as 'partial' if majority succeeded
      if (completionRatio >= 0.5 && failureRatio < 0.5) {
        return 'partial';
      }
    }

    return 'failed';
  }

  /**
   * Create failure context from step execution
   * 
   * @param stepId - Step ID
   * @param error - Error that occurred
   * @param totalSteps - Total steps
   * @param completedSteps - Completed steps
   * @param failureCount - Current failure count
   * @param executionId - Execution ID
   * @returns Failure context
   */
  static createContext(
    stepId: string,
    error: Error,
    _totalSteps: number,
    completedSteps: number,
    failureCount: number,
    executionId?: string
  ): FailureContext {
    return {
      stepId,
      error,
      totalSteps: _totalSteps,
      completedSteps,
      failureCount,
      executionId,
    };
  }
}
