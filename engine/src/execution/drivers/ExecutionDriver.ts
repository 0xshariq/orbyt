/**
 * Execution Driver System
 * 
 * Drivers determine HOW steps are executed, while adapters determine WHAT is executed.
 * This abstraction allows the engine to support multiple execution strategies.
 * 
 * @module execution/drivers
 */

import type { AdapterResult } from '@dev-ecosystem/core';

/**
 * Step execution context for drivers
 */
export interface DriverContext {
  /** Current step ID */
  stepId: string;
  
  /** Workflow execution ID */
  executionId: string;
  
  /** Workflow name */
  workflowName: string;
  
  /** Logger function */
  log: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Step timeout in milliseconds */
  timeout?: number;
  
  /** Working directory */
  cwd?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Secrets access */
  secrets?: Record<string, string>;
  
  /** Temporary directory */
  tempDir?: string;
  
  /** Previous step outputs */
  stepOutputs?: Record<string, any>;
  
  /** Workflow inputs */
  inputs?: Record<string, any>;
  
  /** Workflow context */
  workflowContext?: Record<string, any>;
}

/**
 * Step definition for driver execution
 */
export interface DriverStep {
  /** Step ID */
  id: string;
  
  /** Step name (optional) */
  name?: string;
  
  /** Action to execute (e.g., 'http.request.get', 'cli.run') */
  uses: string;
  
  /** Input parameters */
  with?: Record<string, any>;
  
  /** Conditional execution */
  when?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Retry configuration */
  retry?: {
    max: number;
    backoff?: 'linear' | 'exponential';
    delay?: number;
  };
  
  /** Timeout */
  timeout?: string;
  
  /** Continue on error */
  continueOnError?: boolean;
}

/**
 * Base execution driver interface
 */
export interface ExecutionDriver {
  /** Driver type identifier */
  readonly type: string;
  
  /** Driver name */
  readonly name: string;
  
  /** Driver version */
  readonly version: string;
  
  /** Driver description */
  readonly description?: string;
  
  /**
   * Check if this driver can handle a step
   * 
   * @param step - Step to check
   * @returns True if driver can handle this step
   */
  canHandle(step: DriverStep): boolean;
  
  /**
   * Execute a step
   * 
   * @param step - Step to execute
   * @param context - Execution context
   * @returns Execution result
   */
  execute(
    step: DriverStep,
    context: DriverContext
  ): Promise<AdapterResult>;
  
  /**
   * Optional: Initialize driver
   */
  initialize?(): Promise<void>;
  
  /**
   * Optional: Cleanup driver
   */
  cleanup?(): Promise<void>;
}

/**
 * Base driver implementation with common logic
 */
export abstract class BaseDriver implements ExecutionDriver {
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description?: string;
  
  abstract canHandle(step: DriverStep): boolean;
  
  abstract execute(
    step: DriverStep,
    context: DriverContext
  ): Promise<AdapterResult>;
  
  /**
   * Validate step has required fields
   */
  protected validateStep(step: DriverStep, required: string[]): void {
    for (const field of required) {
      if (!(field in step)) {
        throw new Error(
          `${this.name} driver: step missing required field '${field}'`
        );
      }
    }
  }
  
  /**
   * Get step input with default value
   */
  protected getStepInput<T>(
    step: DriverStep,
    key: string,
    defaultValue: T
  ): T {
    return step.with?.[key] !== undefined ? step.with[key] : defaultValue;
  }
  
  /**
   * Parse timeout string to milliseconds
   */
  protected parseTimeout(timeout?: string): number | undefined {
    if (!timeout) return undefined;
    
    const match = timeout.match(/^(\d+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${timeout}`);
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 'ms': return value;
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return value;
    }
  }
}
