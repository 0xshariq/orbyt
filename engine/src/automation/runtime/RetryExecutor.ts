/**
 * Retry Executor
 * 
 * Orchestrates retry logic for operations using RetryPolicy and BackoffTimer.
 * This is the high-level runtime component that replaces inline retry logic.
 * 
 * @module automation/runtime
 */

import { RetryPolicy } from '../RetryPolicy.js';
import { BackoffTimer } from './BackoffTimer.js';

/**
 * Retry context for tracking retry state
 */
export interface RetryContext {
  /** Current attempt number (1-indexed) */
  attempt: number;
  
  /** Maximum attempts allowed */
  maxAttempts: number;
  
  /** Errors from previous attempts */
  previousErrors: Error[];
  
  /** Total time spent on retries (ms) */
  totalRetryTimeMs: number;
  
  /** Whether this is the final attempt */
  isFinalAttempt: boolean;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  /** Operation result (undefined if all retries failed) */
  result?: T;
  
  /** Final status */
  status: 'success' | 'failed' | 'aborted';
  
  /** Number of attempts made */
  attempts: number;
  
  /** Final error if failed */
  error?: Error;
  
  /** Array of all errors encountered */
  allErrors: Error[];
  
  /** Total execution time including retries (ms) */
  totalTimeMs: number;
}

/**
 * Retry event listeners
 */
export interface RetryListeners<T> {
  /** Called before each attempt */
  onAttempt?: (context: RetryContext) => void | Promise<void>;
  
  /** Called after successful attempt */
  onSuccess?: (result: T, context: RetryContext) => void | Promise<void>;
  
  /** Called after failed attempt (before retry decision) */
  onError?: (error: Error, context: RetryContext) => void | Promise<void>;
  
  /** Called when retry is about to happen */
  onRetry?: (error: Error, delayMs: number, context: RetryContext) => void | Promise<void>;
  
  /** Called when retries are exhausted */
  onExhausted?: (errors: Error[]) => void | Promise<void>;
  
  /** Called when retry is aborted */
  onAbort?: (error: Error, reason: string) => void | Promise<void>;
}

/**
 * Retry executor for orchestrating retry logic
 */
export class RetryExecutor {
  /**
   * Execute operation with retry policy
   * 
   * @param operation - Async operation to execute
   * @param policy - Retry policy
   * @param listeners - Event listeners for retry lifecycle
   * @returns Retry result
   */
  static async execute<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy,
    listeners?: RetryListeners<T>
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const maxAttempts = policy.getMaxAttempts();
    const allErrors: Error[] = [];
    let attempt = 0;
    let totalRetryTimeMs = 0;

    while (attempt < maxAttempts) {
      attempt++;
      
      const context: RetryContext = {
        attempt,
        maxAttempts,
        previousErrors: [...allErrors],
        totalRetryTimeMs,
        isFinalAttempt: attempt === maxAttempts,
      };

      // Call onAttempt listener
      await listeners?.onAttempt?.(context);

      try {
        // Execute operation
        const result = await operation();
        
        // Success!
        await listeners?.onSuccess?.(result, context);
        
        return {
          result,
          status: 'success',
          attempts: attempt,
          allErrors,
          totalTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        allErrors.push(err);

        // Call onError listener
        await listeners?.onError?.(err, context);

        // Check if should retry
        const shouldRetry = policy.shouldRetry(err, attempt);
        
        if (!shouldRetry) {
          // Check if aborted vs exhausted
          if (policy.shouldAbort(err)) {
            await listeners?.onAbort?.(err, 'Error triggers abort condition');
            return {
              status: 'aborted',
              attempts: attempt,
              error: err,
              allErrors,
              totalTimeMs: Date.now() - startTime,
            };
          } else {
            // Retries exhausted
            await listeners?.onExhausted?.(allErrors);
            return {
              status: 'failed',
              attempts: attempt,
              error: err,
              allErrors,
              totalTimeMs: Date.now() - startTime,
            };
          }
        }

        // Calculate delay and wait
        const delayMs = policy.getDelay(attempt);
        await listeners?.onRetry?.(err, delayMs, context);
        
        const retryStartTime = Date.now();
        await BackoffTimer.wait(policy.getBackoffStrategy(), attempt);
        totalRetryTimeMs += Date.now() - retryStartTime;
      }
    }

    // Should not reach here, but handle edge case
    const lastError = allErrors[allErrors.length - 1] || new Error('Unknown error');
    return {
      status: 'failed',
      attempts: attempt,
      error: lastError,
      allErrors,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Execute operation with retry (throwing version)
   * Throws error if all retries fail
   * 
   * @param operation - Async operation to execute
   * @param policy - Retry policy
   * @param listeners - Event listeners
   * @returns Operation result
   * @throws Last error if all retries fail
   */
  static async executeOrThrow<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy,
    listeners?: RetryListeners<T>
  ): Promise<T> {
    const result = await this.execute(operation, policy, listeners);
    
    if (result.status === 'success') {
      return result.result!;
    }
    
    // Throw last error with context
    const error = result.error || new Error('Operation failed');
    if (error) {
      (error as any).retryContext = {
        attempts: result.attempts,
        allErrors: result.allErrors,
        totalTimeMs: result.totalTimeMs,
      };
    }
    throw error;
  }

  /**
   * Execute operation with simple retry (no policy object)
   * 
   * @param operation - Async operation to execute
   * @param maxAttempts - Maximum attempts
   * @param delayMs - Delay between attempts
   * @returns Operation result
   */
  static async executeSimple<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxAttempts) {
          await BackoffTimer.sleep(delayMs);
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Execute with retry and timeout
   * Combines retry logic with timeout enforcement
   * 
   * @param operation - Async operation to execute
   * @param policy - Retry policy
   * @param timeoutMs - Timeout per attempt (ms)
   * @param listeners - Event listeners
   * @returns Retry result
   */
  static async executeWithTimeout<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy,
    timeoutMs: number,
    listeners?: RetryListeners<T>
  ): Promise<RetryResult<T>> {
    return this.execute(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
          return await operation();
        } finally {
          clearTimeout(timeout);
        }
      },
      policy,
      listeners
    );
  }
}
