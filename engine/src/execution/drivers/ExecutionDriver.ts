/**
 * Execution Driver System
 * 
 * Drivers determine HOW steps are executed, while adapters determine WHAT is executed.
 * This abstraction allows the engine to support multiple execution strategies.
 * 
 * @module execution/drivers
 */

import type { AdapterResult } from '@dev-ecosystem/core';
import { DriverContext, DriverStep, ExecutionDriver } from '../../types/core-types.js';

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
