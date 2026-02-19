/**
 * Retry Policy
 * 
 * Defines when and how to retry failed operations.
 * Includes attempt limits, backoff strategies, and retry conditions.
 * 
 * @module automation
 */

import { BackoffType, RetryCondition, RetryPolicyConfig } from '../types/core-types.js';
import { BackoffStrategy } from './BackoffStrategy.js';

/**
 * Retry policy for operation execution
 */
export class RetryPolicy {
  private readonly config: RetryPolicyConfig;

  constructor(config: RetryPolicyConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Check if error should be retried
   * 
   * @param error - Error that occurred
   * @param attempt - Current attempt number (1-indexed)
   * @returns True if should retry
   */
  shouldRetry(error: Error, attempt: number): boolean {
    // No more attempts available
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check abort conditions first
    if (this.shouldAbort(error)) {
      return false;
    }

    // Check retryable error types
    if (this.config.retryableErrors && this.config.retryableErrors.length > 0) {
      const isRetryableType = this.config.retryableErrors.some(
        ErrorType => error instanceof ErrorType
      );
      if (!isRetryableType) {
        return false;
      }
    }

    // Check retryable message patterns
    if (this.config.retryableMessages && this.config.retryableMessages.length > 0) {
      const hasRetryableMessage = this.config.retryableMessages.some(
        pattern => pattern.test(error.message)
      );
      if (!hasRetryableMessage) {
        return false;
      }
    }

    // Apply custom retry condition if provided
    if (this.config.retryCondition) {
      return this.config.retryCondition(error, attempt);
    }

    // Default: retry all errors (unless explicitly filtered above)
    return true;
  }

  /**
   * Check if error should abort retries immediately
   * 
   * @param error - Error to check
   * @returns True if should abort
   */
  shouldAbort(error: Error): boolean {
    if (!this.config.abortOn || this.config.abortOn.length === 0) {
      return false;
    }

    return this.config.abortOn.some(ErrorType => error instanceof ErrorType);
  }

  /**
   * Get delay for next retry attempt
   * 
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  getDelay(attempt: number): number {
    return this.config.backoffStrategy.calculateDelay(attempt);
  }

  /**
   * Get maximum number of attempts
   */
  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }

  /**
   * Get backoff strategy
   */
  getBackoffStrategy(): BackoffStrategy {
    return this.config.backoffStrategy;
  }

  /**
   * Get estimated total retry time (worst case)
   */
  getEstimatedRetryTime(): number {
    if (this.config.maxAttempts <= 1) {
      return 0;
    }
    return this.config.backoffStrategy.getTotalDelay(this.config.maxAttempts - 1);
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.maxAttempts < 0) {
      throw new Error(`Max attempts must be >= 0, got: ${this.config.maxAttempts}`);
    }
  }
}

/**
 * Predefined retry policies
 */
export const RetryPolicies = {
  /**
   * No retries
   */
  none: new RetryPolicy({
    maxAttempts: 1,
    backoffStrategy: new BackoffStrategy({ type: 'fixed', baseDelayMs: 0 }),
  }),

  /**
   * Standard retry (3 attempts, exponential backoff)
   */
  standard: new RetryPolicy({
    maxAttempts: 3,
    backoffStrategy: new BackoffStrategy({
      type: 'exponential',
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    }),
  }),

  /**
   * Aggressive retry (5 attempts, fast exponential)
   */
  aggressive: new RetryPolicy({
    maxAttempts: 5,
    backoffStrategy: new BackoffStrategy({
      type: 'exponential',
      baseDelayMs: 500,
      maxDelayMs: 20000,
    }),
  }),

  /**
   * Network retry (retry common network errors)
   */
  network: new RetryPolicy({
    maxAttempts: 4,
    backoffStrategy: new BackoffStrategy({
      type: 'exponential',
      baseDelayMs: 1000,
      maxDelayMs: 60000,
    }),
    retryableMessages: [
      /ECONNREFUSED/,
      /ENOTFOUND/,
      /ETIMEDOUT/,
      /ECONNRESET/,
      /socket hang up/i,
      /network timeout/i,
    ],
  }),

  /**
   * Immediate retry (retry once with no delay)
   */
  immediate: new RetryPolicy({
    maxAttempts: 2,
    backoffStrategy: new BackoffStrategy({ type: 'fixed', baseDelayMs: 0 }),
  }),
} as const;

/**
 * Create retry policy from workflow step configuration
 * 
 * @param stepRetryConfig - Retry config from ParsedStep
 * @returns Retry policy instance
 */
export function createRetryPolicyFromStep(stepRetryConfig?: {
  max: number;
  backoff?: 'linear' | 'exponential';
  delay?: number;
}): RetryPolicy {
  if (!stepRetryConfig || stepRetryConfig.max <= 1) {
    return RetryPolicies.none;
  }

  const backoffType: BackoffType = stepRetryConfig.backoff || 'linear';
  const baseDelayMs = stepRetryConfig.delay || 1000;

  return new RetryPolicy({
    maxAttempts: stepRetryConfig.max,
    backoffStrategy: new BackoffStrategy({
      type: backoffType,
      baseDelayMs,
      maxDelayMs: 60000, // Default 60s cap
    }),
  });
}

/**
 * Retry policy builder for fluent API
 */
export class RetryPolicyBuilder {
  private maxAttempts = 3;
  private backoffType: BackoffType = 'exponential';
  private baseDelayMs = 1000;
  private maxDelayMs?: number;
  private retryCondition?: RetryCondition;
  private retryableErrors?: Array<new (...args: any[]) => Error>;
  private retryableMessages?: RegExp[];
  private abortErrors?: Array<new (...args: any[]) => Error>;

  withMaxAttempts(max: number): this {
    this.maxAttempts = max;
    return this;
  }

  withBackoff(type: BackoffType, baseMs: number, maxMs?: number): this {
    this.backoffType = type;
    this.baseDelayMs = baseMs;
    this.maxDelayMs = maxMs;
    return this;
  }

  withCondition(condition: RetryCondition): this {
    this.retryCondition = condition;
    return this;
  }

  onErrors(...errors: Array<new (...args: any[]) => Error>): this {
    this.retryableErrors = errors;
    return this;
  }

  onMessages(...patterns: RegExp[]): this {
    this.retryableMessages = patterns;
    return this;
  }

  abortOn(...errors: Array<new (...args: any[]) => Error>): this {
    this.abortErrors = errors;
    return this;
  }

  build(): RetryPolicy {
    return new RetryPolicy({
      maxAttempts: this.maxAttempts,
      backoffStrategy: new BackoffStrategy({
        type: this.backoffType,
        baseDelayMs: this.baseDelayMs,
        maxDelayMs: this.maxDelayMs,
      }),
      retryCondition: this.retryCondition,
      retryableErrors: this.retryableErrors,
      retryableMessages: this.retryableMessages,
      abortOn: this.abortErrors,
    });
  }
}
