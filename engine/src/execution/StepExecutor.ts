/**
 * Step Executor
 * 
 * Executes individual workflow steps with retry logic, timeout handling,
 * and adapter invocation.
 * 
 * @module execution
 */

import type { ParsedStep } from '../parser/StepParser.js';
import type { ResolutionContext } from '../context/VariableResolver.js';
import { VariableResolver } from '../context/VariableResolver.js';

/**
 * Step execution result
 */
export interface StepResult {
  /** Step ID */
  stepId: string;
  
  /** Execution status */
  status: 'success' | 'failure' | 'skipped' | 'timeout';
  
  /** Step output data */
  output: any;
  
  /** Error if failed */
  error?: Error;
  
  /** Execution duration (ms) */
  duration: number;
  
  /** Number of retry attempts */
  attempts: number;
  
  /** Start timestamp */
  startedAt: Date;
  
  /** End timestamp */
  completedAt: Date;
}

/**
 * Adapter interface for step execution
 */
export interface StepAdapter {
  /** Adapter name */
  name: string;
  
  /**
   * Execute step with the adapter
   * 
   * @param action - Full action name (e.g., 'http.request.get')
   * @param input - Resolved input parameters
   * @param context - Execution context
   * @returns Adapter output
   */
  execute(action: string, input: Record<string, any>, context: any): Promise<any>;
}

/**
 * Step executor with retry and timeout logic
 */
export class StepExecutor {
  private adapters = new Map<string, StepAdapter>();
  private resolver = new VariableResolver();

  /**
   * Register an adapter
   * 
   * @param adapter - Adapter to register
   */
  registerAdapter(adapter: StepAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Execute a step
   * 
   * @param step - Step to execute
   * @param context - Resolution context
   * @returns Step execution result
   */
  async execute(
    step: ParsedStep,
    context: ResolutionContext
  ): Promise<StepResult> {
    const startedAt = new Date();
    let attempts = 0;
    let lastError: Error | undefined;

    // Check conditional execution
    if (step.when && !this.evaluateCondition(step.when, context)) {
      return {
        stepId: step.id,
        status: 'skipped',
        output: null,
        attempts: 0,
        duration: 0,
        startedAt,
        completedAt: new Date(),
      };
    }

    // Resolve variables in input
    const resolvedInput = this.resolver.resolve(step.input, context);

    // Retry loop
    const maxAttempts = step.retry?.max || 1;
    let backoffMs = step.retry?.delay || 1000;
    const backoffStrategy = step.retry?.backoff || 'linear';

    for (attempts = 1; attempts <= maxAttempts; attempts++) {
      try {
        // Execute with timeout
        const output = await this.executeWithTimeout(
          step,
          resolvedInput,
          context
        );

        const completedAt = new Date();
        return {
          stepId: step.id,
          status: 'success',
          output,
          attempts,
          duration: completedAt.getTime() - startedAt.getTime(),
          startedAt,
          completedAt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if timeout error
        if (lastError.message.includes('timeout')) {
          const completedAt = new Date();
          return {
            stepId: step.id,
            status: 'timeout',
            output: null,
            error: lastError,
            attempts,
            duration: completedAt.getTime() - startedAt.getTime(),
            startedAt,
            completedAt,
          };
        }

        // Retry if more attempts available
        if (attempts < maxAttempts) {
          await this.sleep(backoffMs);
          // Apply backoff strategy
          if (backoffStrategy === 'exponential') {
            backoffMs *= 2;
          }
        }
      }
    }

    // All attempts failed
    const completedAt = new Date();
    return {
      stepId: step.id,
      status: 'failure',
      output: null,
      error: lastError,
      attempts,
      duration: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
    };
  }

  /**
   * Execute step with timeout
   */
  private async executeWithTimeout(
    step: ParsedStep,
    input: Record<string, any>,
    context: any
  ): Promise<any> {
    const adapter = this.adapters.get(step.adapter);
    
    if (!adapter) {
      throw new Error(
        `Adapter '${step.adapter}' not registered. ` +
        `Available: ${Array.from(this.adapters.keys()).join(', ')}`
      );
    }

    const executionPromise = adapter.execute(step.action, input, context);

    // Apply timeout if configured
    if (step.timeout) {
      const timeoutMs = this.parseTimeoutString(step.timeout);
      return this.withTimeout(executionPromise, timeoutMs, step.id);
    }

    return executionPromise;
  }

  /**
   * Parse timeout string to milliseconds
   * @param timeout - Timeout string like "30s", "5m", "1h"
   * @returns Timeout in milliseconds
   */
  private parseTimeoutString(timeout: string): number {
    const match = timeout.match(/^([0-9]+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${timeout}. Expected format: <number><unit> (e.g., 30s, 5m, 1h)`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported timeout unit: ${unit}`);
    }
  }

  /**
   * Add timeout to promise
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    stepId: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(
            `Step '${stepId}' exceeded timeout of ${timeoutMs}ms`
          ));
        }, timeoutMs);
        // Cleanup timer if promise resolves first
        promise.finally(() => clearTimeout(timer));
      }),
    ]);
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Evaluate conditional expression
   * 
   * Currently simple boolean evaluation.
   * Future: Support expression language.
   * 
   * @param condition - Conditional expression
   * @param context - Resolution context
   * @returns True if condition met
   */
  private evaluateCondition(
    condition: string,
    context: ResolutionContext
  ): boolean {
    // Resolve variables in condition
    const resolved = this.resolver.resolve(condition, context);
    
    // Simple boolean evaluation
    if (typeof resolved === 'boolean') {
      return resolved;
    }
    
    if (typeof resolved === 'string') {
      return resolved.toLowerCase() !== 'false' && resolved !== '0' && resolved !== '';
    }
    
    return !!resolved;
  }

  /**
   * Get registered adapters
   */
  getAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if adapter is registered
   */
  hasAdapter(name: string): boolean {
    return this.adapters.has(name);
  }
}
