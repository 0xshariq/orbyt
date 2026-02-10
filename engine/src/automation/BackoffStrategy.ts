/**
 * Backoff Strategy
 * 
 * Calculates delays between retry attempts using various strategies.
 * Supports fixed, linear, and exponential backoff with jitter.
 * 
 * @module automation
 */

/**
 * Backoff strategy type
 */
export type BackoffType = 'fixed' | 'linear' | 'exponential';

/**
 * Backoff strategy configuration
 */
export interface BackoffConfig {
  /** Strategy type */
  type: BackoffType;
  
  /** Base delay in milliseconds */
  baseDelayMs: number;
  
  /** Maximum delay cap in milliseconds */
  maxDelayMs?: number;
  
  /** Multiplier for exponential backoff (default: 2) */
  multiplier?: number;
  
  /** Add random jitter (0-1, default: 0.1 = 10%) */
  jitter?: number;
}

/**
 * Backoff strategy for calculating retry delays
 */
export class BackoffStrategy {
  private readonly config: Required<BackoffConfig>;

  constructor(config: BackoffConfig) {
    this.config = {
      type: config.type,
      baseDelayMs: config.baseDelayMs,
      maxDelayMs: config.maxDelayMs ?? 60000, // Default 60s max
      multiplier: config.multiplier ?? 2,
      jitter: Math.max(0, Math.min(1, config.jitter ?? 0.1)), // Clamp 0-1
    };

    this.validateConfig();
  }

  /**
   * Calculate delay for a given attempt number
   * 
   * @param attempt - Attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    if (attempt < 1) {
      throw new Error(`Attempt number must be >= 1, got: ${attempt}`);
    }

    let delayMs: number;

    switch (this.config.type) {
      case 'fixed':
        delayMs = this.config.baseDelayMs;
        break;

      case 'linear':
        delayMs = this.config.baseDelayMs * attempt;
        break;

      case 'exponential':
        delayMs = this.config.baseDelayMs * Math.pow(this.config.multiplier, attempt - 1);
        break;

      default:
        throw new Error(`Unknown backoff type: ${this.config.type}`);
    }

    // Cap at max delay
    delayMs = Math.min(delayMs, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    if (this.config.jitter > 0) {
      const jitterAmount = delayMs * this.config.jitter;
      const randomJitter = Math.random() * jitterAmount * 2 - jitterAmount;
      delayMs = Math.max(0, delayMs + randomJitter);
    }

    return Math.round(delayMs);
  }

  /**
   * Calculate delays for a series of attempts
   * 
   * @param maxAttempts - Maximum number of attempts
   * @returns Array of delays in milliseconds
   */
  calculateDelays(maxAttempts: number): number[] {
    const delays: number[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      delays.push(this.calculateDelay(attempt));
    }
    return delays;
  }

  /**
   * Get total delay time for all retry attempts
   * 
   * @param maxAttempts - Maximum number of attempts
   * @returns Total delay in milliseconds
   */
  getTotalDelay(maxAttempts: number): number {
    return this.calculateDelays(maxAttempts).reduce((sum, delay) => sum + delay, 0);
  }

  /**
   * Get backoff configuration
   */
  getConfig(): Readonly<Required<BackoffConfig>> {
    return { ...this.config };
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.baseDelayMs < 0) {
      throw new Error(`Base delay must be >= 0, got: ${this.config.baseDelayMs}`);
    }

    if (this.config.maxDelayMs < this.config.baseDelayMs) {
      throw new Error(
        `Max delay (${this.config.maxDelayMs}ms) must be >= base delay (${this.config.baseDelayMs}ms)`
      );
    }

    if (this.config.multiplier <= 0) {
      throw new Error(`Multiplier must be > 0, got: ${this.config.multiplier}`);
    }
  }
}

/**
 * Predefined backoff strategies
 */
export const BackoffStrategies = {
  /**
   * Fixed 1-second delay
   */
  fixed1s: new BackoffStrategy({
    type: 'fixed',
    baseDelayMs: 1000,
  }),

  /**
   * Fixed 5-second delay
   */
  fixed5s: new BackoffStrategy({
    type: 'fixed',
    baseDelayMs: 5000,
  }),

  /**
   * Linear backoff starting at 1 second
   */
  linear1s: new BackoffStrategy({
    type: 'linear',
    baseDelayMs: 1000,
    maxDelayMs: 30000, // Cap at 30s
  }),

  /**
   * Exponential backoff starting at 1 second
   */
  exponential1s: new BackoffStrategy({
    type: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 60000, // Cap at 60s
    multiplier: 2,
  }),

  /**
   * Exponential backoff starting at 100ms (fast retries)
   */
  exponentialFast: new BackoffStrategy({
    type: 'exponential',
    baseDelayMs: 100,
    maxDelayMs: 10000, // Cap at 10s
    multiplier: 2,
  }),

  /**
   * No delay (immediate retry)
   */
  immediate: new BackoffStrategy({
    type: 'fixed',
    baseDelayMs: 0,
  }),
} as const;

/**
 * Create a backoff strategy from workflow configuration
 * 
 * @param type - Backoff type
 * @param baseDelayMs - Base delay in milliseconds
 * @param options - Additional options
 * @returns Backoff strategy instance
 */
export function createBackoffStrategy(
  type: BackoffType,
  baseDelayMs: number,
  options?: {
    maxDelayMs?: number;
    multiplier?: number;
    jitter?: number;
  }
): BackoffStrategy {
  return new BackoffStrategy({
    type,
    baseDelayMs,
    ...options,
  });
}
