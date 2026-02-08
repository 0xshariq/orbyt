/**
 * Step Parser
 * 
 * Parses individual workflow steps and resolves adapter types.
 * Converts validated step definitions into internal Step objects.
 * 
 * @module parser
 */

import type { StepDefinition as ZodStepDefinition } from '@dev-ecosystem/core';

/**
 * Parsed internal step representation
 */
export interface ParsedStep {
  /** Unique step identifier */
  id: string;
  
  /** Adapter type (http, shell, cli, plugin, etc.) */
  adapter: string;
  
  /** Full action name (e.g., 'http.request.get') */
  action: string;
  
  /** Input parameters for the step */
  input: Record<string, any>;
  
  /** Step dependencies (other step IDs) */
  needs: string[];
  
  /** Optional name */
  name?: string;
  
  /** Conditional execution expression */
  when?: string;
  
  /** Continue workflow on failure */
  continueOnError: boolean;
  
  /** Retry policy */
  retry?: {
    max: number;
    backoff?: 'linear' | 'exponential';
    delay?: number;
  };
  
  /** Timeout string (e.g., '30s', '5m') */
  timeout?: string;
  
  /** Environment variables for this step */
  env?: Record<string, string>;
  
  /** Output mappings */
  outputs?: Record<string, string>;
}

/**
 * Parses individual workflow steps
 */
export class StepParser {
  /**
   * Parse a step definition into internal representation
   * 
   * @param stepDef - Validated step definition from schema
   * @returns Parsed step object ready for execution
   */
  static parse(stepDef: ZodStepDefinition): ParsedStep {
    // Validate required fields
    if (!stepDef.id) {
      throw new Error('Step missing required field: id');
    }
    
    if (!stepDef.uses) {
      throw new Error(`Step '${stepDef.id}' missing required field: uses`);
    }

    // Resolve adapter type from the 'uses' field
    const adapter = this.resolveAdapter(stepDef.uses);
    
    // Build parsed step
    const parsedStep: ParsedStep = {
      id: stepDef.id,
      adapter,
      action: stepDef.uses,
      input: stepDef.with || {},
      needs: stepDef.needs || [],
      name: stepDef.name,
      when: stepDef.when,
      continueOnError: stepDef.continueOnError,
      timeout: stepDef.timeout,
      env: stepDef.env,
      outputs: stepDef.outputs,
    };
    
    // Copy retry policy if present
    if (stepDef.retry) {
      parsedStep.retry = {
        max: stepDef.retry.max,
        backoff: stepDef.retry.backoff,
        delay: stepDef.retry.delay,
      };
    }
    
    return parsedStep;
  }

  /**
   * Resolve adapter type from 'uses' field
   * 
   * Examples:
   *   'http.request.get' -> 'http'
   *   'shell.exec' -> 'shell'
   *   'cli.run' -> 'cli'
   *   'mediaproc.image.resize' -> 'plugin'
   * 
   * @param uses - The 'uses' field from step definition
   * @returns Adapter type string
   */
  static resolveAdapter(uses: string): string {
    // Extract prefix before first dot
    const prefix = uses.split('.')[0];
    
    // Built-in adapter types
    const builtInAdapters = ['http', 'shell', 'cli', 'fs', 'webhook'];
    
    if (builtInAdapters.includes(prefix)) {
      return prefix;
    }
    
    // Everything else is a plugin adapter
    return 'plugin';
  }

  /**
   * Parse multiple steps
   * 
   * @param stepDefs - Array of step definitions
   * @returns Array of parsed steps
   */
  static parseAll(stepDefs: ZodStepDefinition[]): ParsedStep[] {
    return stepDefs.map(step => this.parse(step));
  }

  /**
   * Validate step IDs are unique
   * 
   * @param steps - Array of parsed steps
   * @throws {Error} If duplicate step IDs found
   */
  static validateUniqueIds(steps: ParsedStep[]): void {
    const ids = steps.map(s => s.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    
    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate step IDs found: ${duplicates.join(', ')}`
      );
    }
  }
}
