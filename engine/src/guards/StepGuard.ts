/**
 * Step Guard
 * 
 * Validates individual step configurations:
 * - Step structure validation
 * - Input parameter validation
 * - Timeout validation
 * - Retry policy validation
 * 
 * @module guards
 */

import type { ParsedStep } from '../parser/StepParser.js';
import { VariableResolver } from '../context/VariableResolver.js';

/**
 * Step validation guard
 */
export class StepGuard {
  /**
   * Validate a single step
   * 
   * @param step - Step to validate
   * @param availableSteps - Set of all step IDs in workflow
   * @throws {Error} If validation fails
   */
  static validate(step: ParsedStep, availableSteps: Set<string>): void {
    this.validateRequired(step);
    this.validateTimeout(step);
    this.validateRetryPolicy(step);
    this.validateDependencies(step, availableSteps);
    this.validateVariableReferences(step, availableSteps);
  }

  /**
   * Validate required fields
   * 
   * @param step - Step to validate
   * @throws {Error} If required fields missing
   */
  private static validateRequired(step: ParsedStep): void {
    if (!step.id || typeof step.id !== 'string') {
      throw new Error('Step missing required field: id (string)');
    }

    if (!step.action || typeof step.action !== 'string') {
      throw new Error(`Step '${step.id}' missing required field: uses/action`);
    }

    if (!step.adapter || typeof step.adapter !== 'string') {
      throw new Error(`Step '${step.id}' missing adapter type`);
    }
  }

  /**
   * Validate timeout values
   * 
   * @param step - Step to validate
   * @throws {Error} If timeout invalid
   */
  private static validateTimeout(step: ParsedStep): void {
    if (step.timeout !== undefined) {
      if (typeof step.timeout !== 'number' || step.timeout <= 0) {
        throw new Error(
          `Step '${step.id}': timeout must be a positive number (milliseconds)`
        );
      }

      // Warn about very large timeouts (> 24 hours)
      if (step.timeout > 24 * 60 * 60 * 1000) {
        console.warn(
          `Step '${step.id}': timeout is very large (${step.timeout}ms = ${Math.round(step.timeout / 3600000)}h)`
        );
      }
    }
  }

  /**
   * Validate retry policy
   * 
   * @param step - Step to validate
   * @throws {Error} If retry policy invalid
   */
  private static validateRetryPolicy(step: ParsedStep): void {
    if (step.retry) {
      const { max, delay } = step.retry;

      if (max < 0 || max > 10) {
        throw new Error(
          `Step '${step.id}': retry.max must be between 0 and 10`
        );
      }

      if (delay !== undefined && delay < 0) {
        throw new Error(
          `Step '${step.id}': retry.delay must be positive (got ${delay}ms)`
        );
      }
    }
  }

  /**
   * Validate step dependencies exist
   * 
   * @param step - Step to validate
   * @param availableSteps - Set of all step IDs
   * @throws {Error} If dependency doesn't exist
   */
  private static validateDependencies(
    step: ParsedStep,
    availableSteps: Set<string>
  ): void {
    for (const depId of step.needs) {
      if (!availableSteps.has(depId)) {
        throw new Error(
          `Step '${step.id}' depends on unknown step '${depId}'`
        );
      }

      // Check for self-dependency
      if (depId === step.id) {
        throw new Error(
          `Step '${step.id}' cannot depend on itself`
        );
      }
    }
  }

  /**
   * Validate variable references in step inputs
   * 
   * @param step - Step to validate
   * @param availableSteps - Set of all step IDs
   * @throws {Error} If variable references unknown step
   */
  private static validateVariableReferences(
    step: ParsedStep,
    availableSteps: Set<string>
  ): void {
    try {
      VariableResolver.validateStepReferences(step.input, availableSteps);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Step '${step.id}': ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate adapter-specific requirements
   * 
   * @param step - Step to validate
   * @throws {Error} If adapter requirements not met
   */
  static validateAdapterRequirements(step: ParsedStep): void {
    switch (step.adapter) {
      case 'http':
        this.validateHttpAdapter(step);
        break;
      
      case 'shell':
        this.validateShellAdapter(step);
        break;
      
      case 'cli':
        this.validateCliAdapter(step);
        break;
        
      // Add more adapter validations as needed
    }
  }

  /**
   * Validate HTTP adapter requirements
   */
  private static validateHttpAdapter(step: ParsedStep): void {
    const required = ['url'];
    for (const field of required) {
      if (!step.input[field]) {
        throw new Error(
          `Step '${step.id}' (http adapter): missing required input '${field}'`
        );
      }
    }
  }

  /**
   * Validate shell adapter requirements
   */
  private static validateShellAdapter(step: ParsedStep): void {
    if (!step.input.command && !step.input.script) {
      throw new Error(
        `Step '${step.id}' (shell adapter): must provide either 'command' or 'script'`
      );
    }
  }

  /**
   * Validate CLI adapter requirements
   */
  private static validateCliAdapter(step: ParsedStep): void {
    if (!step.input.command) {
      throw new Error(
        `Step '${step.id}' (cli adapter): missing required input 'command'`
      );
    }
  }

  /**
   * Check if step has any conditional execution
   * 
   * @param step - Step to check
   * @returns True if step has 'when' condition
   */
  static isConditional(step: ParsedStep): boolean {
    return !!step.when;
  }

  /**
   * Check if step is retryable
   * 
   * @param step - Step to check
   * @returns True if step has retry policy configured
   */
  static isRetryable(step: ParsedStep): boolean {
    return !!step.retry && step.retry.max > 0;
  }
}
