/**
 * Timeout Manager
 * 
 * Manages execution timeouts for operations and steps.
 * Provides timeout enforcement, parsing, and cleanup handling.
 * 
 * @module automation
 */

/**
 * Timeout error
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  timeoutMs: number;
  
  /** Operation name for error messages */
  operation?: string;
  
  /** Cleanup function to run on timeout */
  onTimeout?: () => Promise<void> | void;
  
  /** Whether to run cleanup before throwing (default: true) */
  cleanupBeforeThrow?: boolean;
}

/**
 * Timeout result
 */
export interface TimeoutResult<T> {
  /** Operation result (undefined if timed out) */
  result?: T;
  
  /** Whether operation timed out */
  timedOut: boolean;
  
  /** Actual duration in milliseconds */
  durationMs: number;
  
  /** Timeout error if timed out */
  error?: TimeoutError;
}

/**
 * Timeout manager for execution control
 */
export class TimeoutManager {
  /**
   * Execute operation with timeout
   * 
   * @param operation - Async operation to execute
   * @param config - Timeout configuration
   * @returns Operation result
   * @throws TimeoutError if operation times out
   */
  static async execute<T>(
    operation: () => Promise<T>,
    config: TimeoutConfig
  ): Promise<T> {
    const startTime = Date.now();
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeout = setTimeout(async () => {
        const elapsedMs = Date.now() - startTime;
        const error = new TimeoutError(
          config.operation 
            ? `Operation "${config.operation}" timed out after ${config.timeoutMs}ms (elapsed: ${elapsedMs}ms)`
            : `Operation timed out after ${config.timeoutMs}ms (elapsed: ${elapsedMs}ms)`,
          config.timeoutMs,
          config.operation
        );

        // Add timing metadata to error
        (error as any).timing = {
          timeoutMs: config.timeoutMs,
          elapsedMs,
          startTime,
        };

        // Run cleanup if configured
        if (config.onTimeout && (config.cleanupBeforeThrow ?? true)) {
          try {
            await config.onTimeout();
          } catch (cleanupError) {
            console.error('Timeout cleanup failed:', cleanupError);
          }
        }

        reject(error);
      }, config.timeoutMs);

      // Ensure timeout is cleared if operation completes
      timeout.unref?.();
    });

    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      // Add successful execution time for monitoring
      const executionTime = Date.now() - startTime;
      if (result && typeof result === 'object' && result !== null) {
        (result as any).__executionTime = executionTime;
      }
      return result;
    } catch (error) {
      // If it's our timeout error, re-throw
      if (error instanceof TimeoutError) {
        throw error;
      }
      
      // Otherwise, it's an error from the operation
      throw error;
    }
  }

  /**
   * Execute operation with timeout (non-throwing version)
   * Returns result object indicating success or timeout
   * 
   * @param operation - Async operation to execute
   * @param config - Timeout configuration
   * @returns Timeout result
   */
  static async executeWithResult<T>(
    operation: () => Promise<T>,
    config: TimeoutConfig
  ): Promise<TimeoutResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.execute(operation, config);
      return {
        result,
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof TimeoutError) {
        return {
          timedOut: true,
          durationMs: Date.now() - startTime,
          error,
        };
      }
      
      // Re-throw non-timeout errors
      throw error;
    }
  }

  /**
   * Parse timeout string to milliseconds
   * 
   * Supported formats:
   * - "30s" -> 30000ms
   * - "5m" -> 300000ms
   * - "2h" -> 7200000ms
   * - "1000" -> 1000ms (raw number)
   * 
   * @param timeoutStr - Timeout string
   * @returns Timeout in milliseconds
   * @throws Error if format is invalid
   */
  static parseTimeout(timeoutStr: string): number {
    const trimmed = timeoutStr.trim();

    // Raw number (milliseconds)
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }

    // Parse with unit
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(trimmed);
    if (!match) {
      throw new Error(
        `Invalid timeout format: "${timeoutStr}". Expected: "30s", "5m", "2h", or raw ms`
      );
    }

    const value = parseFloat(match[1]);
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
        throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  /**
   * Format milliseconds to human-readable string
   * 
   * @param ms - Milliseconds
   * @returns Formatted string (e.g., "30s", "5m")
   */
  static formatTimeout(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    if (ms < 3600000) {
      return `${(ms / 60000).toFixed(1)}m`;
    }
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Create timeout config from timeout string
   * 
   * @param timeoutStr - Timeout string (e.g., "30s")
   * @param operation - Operation name
   * @param onTimeout - Cleanup function
   * @returns Timeout configuration
   */
  static createConfig(
    timeoutStr: string,
    operation?: string,
    onTimeout?: () => Promise<void> | void
  ): TimeoutConfig {
    return {
      timeoutMs: this.parseTimeout(timeoutStr),
      operation,
      onTimeout,
    };
  }

  /**
   * Create abort controller with timeout
   * Useful for cancellable operations
   * 
   * @param timeoutMs - Timeout in milliseconds
   * @returns Abort controller that aborts after timeout
   */
  static createAbortController(timeoutMs: number): AbortController {
    const controller = new AbortController();
    
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Clean up timeout if signal is aborted manually
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeout);
    }, { once: true });

    return controller;
  }

  /**
   * Check if error is a timeout error
   * 
   * @param error - Error to check
   * @returns True if timeout error
   */
  static isTimeoutError(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError;
  }

  /**
   * Validate timeout value
   * 
   * @param timeoutMs - Timeout in milliseconds
   * @param min - Minimum allowed timeout
   * @param max - Maximum allowed timeout
   * @throws Error if timeout is invalid
   */
  static validateTimeout(timeoutMs: number, min = 0, max = Infinity): void {
    if (timeoutMs < min) {
      throw new Error(`Timeout must be >= ${min}ms, got: ${timeoutMs}ms`);
    }
    if (timeoutMs > max) {
      throw new Error(`Timeout must be <= ${max}ms, got: ${timeoutMs}ms`);
    }
  }
}

/**
 * Predefined timeout configurations
 */
export const TimeoutConfigs = {
  /** 10 second timeout */
  short: { timeoutMs: 10000 },
  
  /** 30 second timeout */
  standard: { timeoutMs: 30000 },
  
  /** 5 minute timeout */
  long: { timeoutMs: 300000 },
  
  /** 30 minute timeout */
  veryLong: { timeoutMs: 1800000 },
  
  /** No timeout (24 hours) */
  none: { timeoutMs: 86400000 },
} as const;
