/**
 * Schema Validator
 * 
 * Validates workflow YAML/JSON against Zod schema from @dev-ecosystem/core.
 * This ensures structural integrity before parsing into internal objects.
 * 
 * @module parser
 */

import { z } from 'zod';
import { WorkflowSchema } from '@dev-ecosystem/core';
import type { WorkflowDefinition } from '@dev-ecosystem/core';

/**
 * Validates workflow structure against schema
 */
export class SchemaValidator {
  /**
   * Validate raw workflow data against Zod schema
   * 
   * @param rawWorkflow - Raw workflow object from YAML/JSON
   * @returns Validated and typed workflow definition
   * @throws {z.ZodError} If validation fails with detailed error messages
   */
  static validate(rawWorkflow: unknown): WorkflowDefinition {
    try {
      // Use Zod schema from ecosystem-core for validation
      const validated = WorkflowSchema.parse(rawWorkflow);
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod errors into readable messages
        const errorMessages = error.issues.map((err: z.ZodIssue) => 
          `${err.path.join('.')}: ${err.message}`
        ).join('\n');
        
        throw new Error(
          `Workflow schema validation failed:\n${errorMessages}`
        );
      }
      throw error;
    }
  }

  /**
   * Check if workflow data is valid without throwing
   * 
   * @param rawWorkflow - Raw workflow object to validate
   * @returns True if valid, false otherwise
   */
  static isValid(rawWorkflow: unknown): boolean {
    try {
      WorkflowSchema.parse(rawWorkflow);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely validate and return result with success/error
   * 
   * @param rawWorkflow - Raw workflow object to validate
   * @returns Object with success flag and either data or error
   */
  static safeParse(rawWorkflow: unknown): {
    success: boolean;
    data?: WorkflowDefinition;
    error?: z.ZodError;
  } {
    const result = WorkflowSchema.safeParse(rawWorkflow);
    
    if (result.success) {
      return {
        success: true,
        data: result.data
      };
    }
    
    return {
      success: false,
      error: result.error
    };
  }
}
