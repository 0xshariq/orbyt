/**
 * Backoff Timer
 * 
 * Runtime utility for implementing delays between retry attempts.
 * Works with BackoffStrategy to execute actual wait operations.
 * 
 * @module automation/runtime
 */

import { BackoffStrategy } from '../BackoffStrategy.js';

/**
 * Backoff timer for retry delays
 */
export class BackoffTimer {
  /**
   * Wait for delay calculated by backoff strategy
   * 
   * @param strategy - Backoff strategy
   * @param attempt - Current attempt number (1-indexed)
   * @returns Promise that resolves after delay
   */
  static async wait(strategy: BackoffStrategy, attempt: number): Promise<number> {
    const delayMs = strategy.calculateDelay(attempt);

    if (delayMs === 0) {
      return 0;
    }

    await this.sleep(delayMs);
    return delayMs;
  }

  /**
   * Sleep for specified milliseconds
   * 
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait with cancellation support
   * 
   * @param strategy - Backoff strategy
   * @param attempt - Current attempt number
   * @param signal - Abort signal for cancellation
   * @returns Promise that resolves after delay or rejects if cancelled
   */
  static async waitCancellable(
    strategy: BackoffStrategy,
    attempt: number,
    signal?: AbortSignal
  ): Promise<number> {
    const delayMs = strategy.calculateDelay(attempt);

    if (delayMs === 0) {
      return 0;
    }

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Backoff cancelled');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(delayMs);
      }, delayMs);

      const onAbort = () => {
        cleanup();
        reject(new Error('Backoff cancelled'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Calculate total wait time for multiple attempts
   * 
   * @param strategy - Backoff strategy
   * @param attempts - Number of attempts
   * @returns Total wait time in milliseconds
   */
  static calculateTotalWaitTime(strategy: BackoffStrategy, attempts: number): number {
    return strategy.getTotalDelay(attempts);
  }

  /**
   * Format delay for logging
   * 
   * @param delayMs - Delay in milliseconds
   * @returns Formatted string
   */
  static formatDelay(delayMs: number): string {
    if (delayMs < 1000) {
      return `${delayMs}ms`;
    }
    if (delayMs < 60000) {
      return `${(delayMs / 1000).toFixed(1)}s`;
    }
    return `${(delayMs / 60000).toFixed(1)}m`;
  }

  /**
   * Wait with progress callback
   * Useful for UI updates or logging
   * 
   * @param strategy - Backoff strategy
   * @param attempt - Current attempt number
   * @param onProgress - Progress callback (current ms, total ms)
   * @param progressIntervalMs - Interval for progress updates (default: 1000ms)
   * @returns Promise that resolves after delay
   */
  static async waitWithProgress(
    strategy: BackoffStrategy,
    attempt: number,
    onProgress: (elapsedMs: number, totalMs: number) => void,
    progressIntervalMs = 1000
  ): Promise<number> {
    const totalMs = strategy.calculateDelay(attempt);

    if (totalMs === 0) {
      return 0;
    }

    const startTime = Date.now();

    return new Promise(resolve => {
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        onProgress(Math.min(elapsed, totalMs), totalMs);

        if (elapsed >= totalMs) {
          clearInterval(progressInterval);
        }
      }, progressIntervalMs);

      setTimeout(() => {
        clearInterval(progressInterval);
        onProgress(totalMs, totalMs);
        resolve(totalMs);
      }, totalMs);
    });
  }

  /**
   * Execute function after backoff delay
   * 
   * @param strategy - Backoff strategy
   * @param attempt - Current attempt number
   * @param fn - Function to execute after delay
   * @returns Result of function execution
   */
  static async waitAndExecute<T>(
    strategy: BackoffStrategy,
    attempt: number,
    fn: () => T | Promise<T>
  ): Promise<T> {
    await this.wait(strategy, attempt);
    return fn();
  }
}
