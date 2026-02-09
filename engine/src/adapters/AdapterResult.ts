/**
 * Adapter Result
 * 
 * Standardized result format for all adapter executions.
 * Provides consistency across different adapter types while
 * allowing adapter-specific output data.
 * 
 * @module adapters
 */

/**
 * Execution metrics captured during adapter execution
 */
export interface ExecutionMetrics {
  /** Duration in milliseconds */
  durationMs: number;
  
  /** Memory used in bytes (if available) */
  memoryUsed?: number;
  
  /** Number of retries attempted */
  retries?: number;
  
  /** Additional adapter-specific metrics */
  [key: string]: any;
}

/**
 * Error information when adapter execution fails
 */
export interface AdapterError {
  /** Error message */
  message: string;
  
  /** Error code (if available) */
  code?: string | number;
  
  /** Stack trace (if available) */
  stack?: string;
  
  /** Additional error context */
  details?: Record<string, any>;
}

/**
 * Standardized adapter execution result
 * 
 * All adapters must return results in this format.
 * The generic type T allows adapter-specific output data.
 */
export interface AdapterResult<T = any> {
  /** Whether execution was successful */
  success: boolean;
  
  /** Adapter-specific output data (undefined on failure) */
  output?: T;
  
  /** Error information (only present on failure) */
  error?: AdapterError;
  
  /** Execution logs (stdout, stderr, or custom messages) */
  logs?: string[];
  
  /** Execution metrics */
  metrics: ExecutionMetrics;
  
  /** Effects caused by this execution (for observability) */
  effects?: string[];
  
  /** Events emitted during execution (for event bus) */
  emits?: string[];
  
  /** Warnings encountered (non-fatal) */
  warnings?: string[];
}

/**
 * Result builder for creating adapter results fluently
 */
export class AdapterResultBuilder<T = any> {
  private result: Partial<AdapterResult<T>> = {
    success: false,
    metrics: { durationMs: 0 },
    logs: [],
    effects: [],
    emits: [],
    warnings: [],
  };

  /**
   * Mark result as successful
   */
  success(output?: T): this {
    this.result.success = true;
    this.result.output = output;
    return this;
  }

  /**
   * Mark result as failed
   */
  failure(error: string | AdapterError): this {
    this.result.success = false;
    this.result.error = typeof error === 'string'
      ? { message: error }
      : error;
    return this;
  }

  /**
   * Set execution metrics
   */
  metrics(metrics: ExecutionMetrics): this {
    this.result.metrics = metrics;
    return this;
  }

  /**
   * Set duration
   */
  duration(ms: number): this {
    if (!this.result.metrics) {
      this.result.metrics = { durationMs: ms };
    } else {
      this.result.metrics.durationMs = ms;
    }
    return this;
  }

  /**
   * Add log message
   */
  log(message: string): this {
    if (!this.result.logs) {
      this.result.logs = [];
    }
    this.result.logs.push(message);
    return this;
  }

  /**
   * Add multiple logs
   */
  logs(messages: string[]): this {
    if (!this.result.logs) {
      this.result.logs = [];
    }
    this.result.logs.push(...messages);
    return this;
  }

  /**
   * Add effect
   */
  effect(effect: string): this {
    if (!this.result.effects) {
      this.result.effects = [];
    }
    this.result.effects.push(effect);
    return this;
  }

  /**
   * Add multiple effects
   */
  effects(effects: string[]): this {
    if (!this.result.effects) {
      this.result.effects = [];
    }
    this.result.effects.push(...effects);
    return this;
  }

  /**
   * Add event emission
   */
  emit(event: string): this {
    if (!this.result.emits) {
      this.result.emits = [];
    }
    this.result.emits.push(event);
    return this;
  }

  /**
   * Add warning
   */
  warning(warning: string): this {
    if (!this.result.warnings) {
      this.result.warnings = [];
    }
    this.result.warnings.push(warning);
    return this;
  }

  /**
   * Add multiple warnings
   */
  warnings(warnings: string[]): this {
    if (!this.result.warnings) {
      this.result.warnings = [];
    }
    this.result.warnings.push(...warnings);
    return this;
  }

  /**
   * Build the final result
   */
  build(): AdapterResult<T> {
    return this.result as AdapterResult<T>;
  }
}

/**
 * Create a success result
 */
export function createSuccessResult<T>(
  output: T,
  metrics: ExecutionMetrics,
  options?: {
    logs?: string[];
    effects?: string[];
    emits?: string[];
    warnings?: string[];
  }
): AdapterResult<T> {
  return {
    success: true,
    output,
    metrics,
    logs: options?.logs,
    effects: options?.effects,
    emits: options?.emits,
    warnings: options?.warnings,
  };
}

/**
 * Create a failure result
 */
export function createFailureResult(
  error: string | AdapterError,
  metrics: ExecutionMetrics,
  options?: {
    logs?: string[];
    warnings?: string[];
  }
): AdapterResult<never> {
  return {
    success: false,
    error: typeof error === 'string' ? { message: error } : error,
    metrics,
    logs: options?.logs,
    warnings: options?.warnings,
  };
}
