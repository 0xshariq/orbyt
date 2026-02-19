/**
 * Failure Strategy
 * 
 * Defines how to handle step failures in workflow execution.
 * Controls failure propagation and workflow continuation behavior.
 * 
 * @module automation
 */

import { FailureDecision, FailureStrategyConfig, FailureStrategyType } from "../types/core-types.js";

/**
 * Failure strategy for workflow execution
 */
export class FailureStrategy {
  private readonly config: Required<FailureStrategyConfig>;
  private failureCount = 0;

  constructor(config: FailureStrategyConfig) {
    this.config = {
      type: config.type,
      allowPartialSuccess: config.allowPartialSuccess ?? false,
      maxFailures: config.maxFailures ?? Infinity,
      criticalSteps: config.criticalSteps ?? [],
      onFailure: config.onFailure ?? (() => {}),
    };

    this.validateConfig();
  }

  /**
   * Decide what to do after a step failure
   * 
   * @param stepId - ID of failed step
   * @param error - Error that caused failure
   * @param totalSteps - Total number of steps
   * @param completedSteps - Number of completed steps
   * @returns Failure decision
   */
  async decide(
    stepId: string,
    error: Error,
    _totalSteps: number,
    completedSteps: number
  ): Promise<FailureDecision> {
    this.failureCount++;

    // Critical step failure = always abort
    if (this.isCriticalStep(stepId)) {
      await this.executeCleanup(stepId, error);
      return {
        continueWorkflow: false,
        runCleanup: true,
        skipDependentSteps: true,
        reason: `Critical step "${stepId}" failed`,
        finalStatus: 'failed',
      };
    }

    // Max failures exceeded = abort
    if (this.failureCount > this.config.maxFailures) {
      await this.executeCleanup(stepId, error);
      return {
        continueWorkflow: false,
        runCleanup: true,
        skipDependentSteps: true,
        reason: `Maximum failures (${this.config.maxFailures}) exceeded`,
        finalStatus: this.config.allowPartialSuccess && completedSteps > 0 
          ? 'partial' 
          : 'failed',
      };
    }

    // Strategy-specific decision
    switch (this.config.type) {
      case 'abort':
        await this.executeCleanup(stepId, error);
        return {
          continueWorkflow: false,
          runCleanup: true,
          skipDependentSteps: true,
          reason: 'Abort strategy - stop on failure',
          finalStatus: this.config.allowPartialSuccess && completedSteps > 0 
            ? 'partial' 
            : 'failed',
        };

      case 'continue':
        return {
          continueWorkflow: true,
          runCleanup: false,
          skipDependentSteps: false,
          reason: 'Continue strategy - proceed with remaining steps',
        };

      case 'skipDependent':
        return {
          continueWorkflow: true,
          runCleanup: false,
          skipDependentSteps: true,
          reason: 'Skip dependent strategy - skip steps depending on failed step',
        };

      default:
        throw new Error(`Unknown failure strategy: ${this.config.type}`);
    }
  }

  /**
   * Check if step is critical
   * 
   * @param stepId - Step ID to check
   * @returns True if critical
   */
  isCriticalStep(stepId: string): boolean {
    return this.config.criticalSteps.includes(stepId);
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset failure count (for new workflow execution)
   */
  reset(): void {
    this.failureCount = 0;
  }

  /**
   * Get strategy type
   */
  getType(): FailureStrategyType {
    return this.config.type;
  }

  /**
   * Check if partial success is allowed
   */
  allowsPartialSuccess(): boolean {
    return this.config.allowPartialSuccess;
  }

  /**
   * Execute cleanup handler
   */
  private async executeCleanup(stepId: string, error: Error): Promise<void> {
    try {
      await this.config.onFailure(stepId, error);
    } catch (cleanupError) {
      // Log cleanup error but don't throw
      console.error(`Cleanup failed for step "${stepId}":`, cleanupError);
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.maxFailures < 1) {
      throw new Error(`Max failures must be >= 1, got: ${this.config.maxFailures}`);
    }
  }
}

/**
 * Predefined failure strategies
 */
export const FailureStrategies = {
  /**
   * Abort workflow on first failure
   */
  abort: new FailureStrategy({
    type: 'abort',
    allowPartialSuccess: false,
  }),

  /**
   * Abort but allow partial success
   */
  abortWithPartial: new FailureStrategy({
    type: 'abort',
    allowPartialSuccess: true,
  }),

  /**
   * Continue executing all steps regardless of failures
   */
  continue: new FailureStrategy({
    type: 'continue',
    allowPartialSuccess: true,
  }),

  /**
   * Skip dependent steps on failure
   */
  skipDependent: new FailureStrategy({
    type: 'skipDependent',
    allowPartialSuccess: true,
  }),

  /**
   * Abort after 3 failures
   */
  maxThreeFailures: new FailureStrategy({
    type: 'continue',
    maxFailures: 3,
    allowPartialSuccess: true,
  }),
} as const;

/**
 * Create failure strategy from workflow step configuration
 * 
 * @param continueOnError - Continue on error flag from step
 * @param criticalSteps - List of critical step IDs
 * @returns Failure strategy instance
 */
export function createFailureStrategyFromStep(
  continueOnError: boolean,
  criticalSteps?: string[]
): FailureStrategy {
  if (continueOnError) {
    return new FailureStrategy({
      type: 'continue',
      allowPartialSuccess: true,
      criticalSteps,
    });
  }

  return new FailureStrategy({
    type: 'abort',
    allowPartialSuccess: false,
    criticalSteps,
  });
}

/**
 * Failure strategy builder for fluent API
 */
export class FailureStrategyBuilder {
  private type: FailureStrategyType = 'abort';
  private allowPartialSuccess = false;
  private maxFailures?: number;
  private criticalSteps: string[] = [];
  private failureHandler?: (stepId: string, error: Error) => Promise<void> | void;

  withType(type: FailureStrategyType): this {
    this.type = type;
    return this;
  }

  withPartialSuccess(allow = true): this {
    this.allowPartialSuccess = allow;
    return this;
  }

  withMaxFailures(max: number): this {
    this.maxFailures = max;
    return this;
  }

  withCriticalSteps(...stepIds: string[]): this {
    this.criticalSteps = stepIds;
    return this;
  }

  onFailure(handler: (stepId: string, error: Error) => Promise<void> | void): this {
    this.failureHandler = handler;
    return this;
  }

  build(): FailureStrategy {
    return new FailureStrategy({
      type: this.type,
      allowPartialSuccess: this.allowPartialSuccess,
      maxFailures: this.maxFailures,
      criticalSteps: this.criticalSteps,
      onFailure: this.failureHandler,
    });
  }
}
