/**
 * Step Executor
 * 
 * Executes individual workflow steps with retry logic, timeout handling,
 * and adapter invocation.
 * 
 * Integrates with ContextStore for state management and uses automation
 * policies (RetryPolicy, BackoffStrategy, TimeoutManager) for reliability.
 * 
 * @module execution
 */

import type { ParsedStep } from '../parser/StepParser.js';
import type { ResolutionContext } from '../context/VariableResolver.js';
import { VariableResolver } from '../context/VariableResolver.js';
import { ContextStore } from '../context/ContextStore.js';
import { RetryPolicy } from '../automation/RetryPolicy.js';
import { BackoffStrategy } from '../automation/BackoffStrategy.js';
import { TimeoutManager } from '../automation/TimeoutManager.js';
import { DriverResolver } from './drivers/DriverResolver.js';
import { AdapterDriver } from './drivers/AdapterDriver.js';
import type { DriverStep, DriverContext } from './drivers/ExecutionDriver.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import type { Adapter } from '@dev-ecosystem/core';

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
 * 
 * Uses driver system for pluggable execution strategies.
 * Maintains backward compatibility with legacy StepAdapter interface.
 */
export class StepExecutor {
  // Legacy adapter support (backward compatibility)
  private adapters = new Map<string, StepAdapter>();
  
  // Modern driver system
  private driverResolver = new DriverResolver();
  private adapterRegistry = new AdapterRegistry();
  private adapterDriver?: AdapterDriver;
  
  private resolver = new VariableResolver();
  private contextStore?: ContextStore;
  private retryPolicy?: RetryPolicy;
  private timeoutManager?: TimeoutManager;

  /**
   * Register an adapter (legacy interface - backward compatibility)
   * 
   * @param adapter - Adapter to register
   * @deprecated Use registerModernAdapter() for new code
   */
  registerAdapter(adapter: StepAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }
  
  /**
   * Register a modern adapter with driver system
   * 
   * @param adapter - Adapter implementing @dev-ecosystem/core Adapter interface
   */
  registerModernAdapter(adapter: Adapter): void {
    this.adapterRegistry.register(adapter);
    
    // Initialize AdapterDriver if not already done
    if (!this.adapterDriver) {
      this.adapterDriver = new AdapterDriver(this.adapterRegistry);
      this.driverResolver.register(this.adapterDriver);
    }
  }
  
  /**
   * Register multiple modern adapters
   * 
   * @param adapters - Array of adapters
   */
  registerModernAdapters(adapters: Adapter[]): void {
    for (const adapter of adapters) {
      this.registerModernAdapter(adapter);
    }
  }

  /**
   * Set context store for state management
   * 
   * @param contextStore - Context store instance
   */
  setContextStore(contextStore: ContextStore): void {
    this.contextStore = contextStore;
  }

  /**
   * Set retry policy for step execution
   * 
   * @param retryPolicy - Retry policy instance
   */
  setRetryPolicy(retryPolicy: RetryPolicy): void {
    this.retryPolicy = retryPolicy;
  }

  /**
   * Set timeout manager for step execution
   * 
   * @param timeoutManager - Timeout manager instance
   */
  setTimeoutManager(timeoutManager: TimeoutManager): void {
    this.timeoutManager = timeoutManager;
  }
  
  /**
   * Get driver resolver (for advanced use cases)
   * 
   * @returns Driver resolver instance
   */
  getDriverResolver(): DriverResolver {
    return this.driverResolver;
  }
  
  /**
   * Get adapter registry (for advanced use cases)
   * 
   * @returns Adapter registry instance
   */
  getAdapterRegistry(): AdapterRegistry {
    return this.adapterRegistry;
  }

  /**
   * Execute a step
   * 
   * @param step - Step to execute
   * @param providedContext - Optional resolution context (if not using ContextStore)
   * @returns Step execution result
   */
  async execute(
    step: ParsedStep,
    providedContext?: ResolutionContext
  ): Promise<StepResult> {
    const startedAt = new Date();
    let attempts = 0;
    let lastError: Error | undefined;

    // Get resolution context from ContextStore or use provided
    const context = this.contextStore
      ? this.contextStore.getResolutionContext()
      : providedContext;

    if (!context) {
      throw new Error('No resolution context available. Either set ContextStore or provide context.');
    }

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

    // Determine retry configuration
    let maxAttempts = step.retry?.max || 1;
    let backoffStrategy: BackoffStrategy | undefined;

    // Use automation policy if available
    if (this.retryPolicy) {
      // Use policy's max attempts if configured
      maxAttempts = Math.max(maxAttempts, this.retryPolicy.getMaxAttempts() || 1);

      // Get backoff strategy from policy
      backoffStrategy = this.retryPolicy.getBackoffStrategy();
    } else if (step.retry) {
      // No policy but step has retry config - create strategy from step config
      const strategyType = step.retry.backoff || 'linear';
      backoffStrategy = new BackoffStrategy({
        type: strategyType,
        baseDelayMs: step.retry.delay || 1000,
        maxDelayMs: 30000,
        multiplier: 2,
        jitter: 0.1,
      });
    }

    // Retry loop
    for (attempts = 1; attempts <= maxAttempts; attempts++) {
      try {
        // Update attempt count in ContextStore
        if (this.contextStore && attempts > 1) {
          this.contextStore.incrementAttempt();
        }

        // Execute with timeout
        let output = await this.executeWithTimeout(
          step,
          resolvedInput,
          context
        );

        // Apply output mapping if defined
        if (step.outputs) {
          output = this.mapOutputs(output, step.outputs, context);
        }

        // Store output in ContextStore if available
        if (this.contextStore) {
          this.contextStore.setStepOutput(step.id, output);
        }

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

        // Enhance error with step context
        if (lastError.message && !lastError.message.includes(step.id)) {
          lastError = new Error(
            `Step '${step.id}' failed: ${lastError.message}`
          );
          // Preserve original stack trace
          if (error instanceof Error && error.stack) {
            lastError.stack = error.stack;
          }
        }

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

        // Check if should retry using policy
        if (this.retryPolicy && attempts < maxAttempts) {
          const shouldRetry = this.retryPolicy.shouldRetry(lastError, attempts);

          if (!shouldRetry) {
            // Policy says don't retry
            break;
          }
        }

        // Retry if more attempts available
        if (attempts < maxAttempts) {
          // Use backoff strategy if available
          const backoffMs = backoffStrategy
            ? backoffStrategy.calculateDelay(attempts)
            : (step.retry?.delay || 1000) * (step.retry?.backoff === 'exponential' ? Math.pow(2, attempts - 1) : 1);

          await this.sleep(backoffMs);
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
    // Try driver system first (modern approach)
    if (this.adapterDriver) {
      const driverStep = this.convertToDriverStep(step, input);
      const driverContext = this.convertToDriverContext(step, context);
      
      try {
        const result = await this.executeWithDriver(driverStep, driverContext, step);
        return result.output;
      } catch (error) {
        // If driver fails, fall back to legacy adapter if available
        if (this.adapters.has(step.adapter)) {
          return this.executeWithLegacyAdapter(step, input, context);
        }
        throw error;
      }
    }
    
    // Fall back to legacy adapter system
    return this.executeWithLegacyAdapter(step, input, context);
  }
  
  /**
   * Execute using driver system
   */
  private async executeWithDriver(
    driverStep: DriverStep,
    driverContext: DriverContext,
    step: ParsedStep
  ): Promise<any> {
    const driver = this.driverResolver.resolve(driverStep);
    
    // Apply timeout if configured
    if (step.timeout || this.timeoutManager) {
      const timeoutMs = step.timeout
        ? this.parseTimeoutString(step.timeout)
        : 30000;
      
      if (this.timeoutManager) {
        return TimeoutManager.execute(
          () => driver.execute(driverStep, driverContext),
          {
            timeoutMs,
            operation: `Step: ${step.id}`,
          }
        );
      }
      
      return this.withTimeout(
        driver.execute(driverStep, driverContext),
        timeoutMs,
        step.id
      );
    }
    
    return driver.execute(driverStep, driverContext);
  }
  
  /**
   * Execute using legacy adapter (backward compatibility)
   */
  private async executeWithLegacyAdapter(
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
    if (step.timeout || this.timeoutManager) {
      const timeoutMs = step.timeout 
        ? this.parseTimeoutString(step.timeout)
        : 30000; // Default 30 seconds

      // Use TimeoutManager static method if available
      if (this.timeoutManager) {
        return TimeoutManager.execute(
          () => executionPromise,
          {
            timeoutMs,
            operation: `Step: ${step.id}`,
          }
        );
      }
      
      // Fallback to local timeout implementation
      return this.withTimeout(executionPromise, timeoutMs, step.id);
    }

    return executionPromise;
  }
  
  /**
   * Convert ParsedStep to DriverStep
   */
  private convertToDriverStep(step: ParsedStep, input: Record<string, any>): DriverStep {
    return {
      id: step.id,
      name: step.name,
      uses: step.action,
      with: input,
      when: step.when,
      retry: step.retry,
      timeout: step.timeout,
      continueOnError: step.continueOnError,
    };
  }
  
  /**
   * Convert execution context to DriverContext
   */
  private convertToDriverContext(step: ParsedStep, context: any): DriverContext {
    const resolutionContext = this.contextStore?.getResolutionContext() || context;
    
    return {
      stepId: step.id,
      executionId: resolutionContext.run?.id || 'unknown',
      workflowName: resolutionContext.workflow?.name || 'unknown',
      log: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => {
        console.log(`[${level || 'info'}] ${message}`);
      },
      timeout: step.timeout ? this.parseTimeoutString(step.timeout) : undefined,
      env: resolutionContext.env || {},
      secrets: resolutionContext.secrets || {},
      stepOutputs: resolutionContext.steps ? Object.fromEntries(resolutionContext.steps) : {},
      inputs: resolutionContext.inputs || {},
      workflowContext: resolutionContext.context || {},
    };
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
   * Map raw output to defined output structure
   * 
   * @param rawOutput - Raw output from adapter
   * @param outputMappings - Output mapping definitions
   * @param context - Resolution context for variable resolution in mappings
   * @returns Mapped output object
   */
  private mapOutputs(
    rawOutput: any,
    outputMappings: Record<string, string>,
    context: ResolutionContext
  ): Record<string, any> {
    const mapped: Record<string, any> = {};

    for (const [key, path] of Object.entries(outputMappings)) {
      // Resolve path (may contain variables)
      const resolvedPath = this.resolver.resolve(path, context) as string;

      // Navigate to value in rawOutput
      const parts = resolvedPath.split('.');
      let value: any = rawOutput;

      for (const part of parts) {
        if (value === null || value === undefined) {
          break;
        }
        value = value[part];
      }

      mapped[key] = value;
    }

    return mapped;
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
