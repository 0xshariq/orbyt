/**
 * Schema Validator
 * 
 * Validates workflow YAML/JSON against Zod schema from @dev-ecosystem/core.
 * Provides enhanced error diagnostics with typo detection and helpful suggestions.
 * 
 * @module parser
 */

import { z } from 'zod';
import { OrbytWorkflowSchema, type WorkflowDefinitionZod } from '@dev-ecosystem/core';
import {
  SchemaError,
  findMatches,
  isLikelyTypo,
  getValidFields,
  isValidField,
  OrbytError,
  ErrorSeverity,
} from '../errors/index.js';

/**
 * Enhanced schema validator with diagnostic capabilities
 */
export class SchemaValidator {
  /**
   * Validate raw workflow data against Zod schema
   * 
   * @param rawWorkflow - Raw workflow object from YAML/JSON
   * @returns Validated and typed workflow definition
   * @throws {OrbytError} If validation fails with detailed diagnostics
   */
  static validate(rawWorkflow: unknown): WorkflowDefinitionZod {
    try {
      // First, check for unknown fields at root level
      this.validateUnknownFields(rawWorkflow as Record<string, any>, 'root');
      
      // Use Zod schema from ecosystem-core for structural validation
      const validated = OrbytWorkflowSchema.parse(rawWorkflow);
      
      // Additional semantic validations
      this.validateWorkflowBody(validated);
      
      return validated;
    } catch (error) {
      // If it's already an OrbytError, rethrow it
      if (error instanceof OrbytError) {
        throw error;
      }
      
      // Transform Zod errors into diagnostic-rich OrbytErrors
      if (error instanceof z.ZodError) {
        throw this.transformZodError(error);
      }
      
      throw error;
    }
  }
  
  /**
   * Check for unknown fields and suggest corrections
   * Enhanced with multiple suggestions and better context
   * 
   * @param obj - Object to check
   * @param path - Current path context
   */
  private static validateUnknownFields(
    obj: Record<string, any>,
    path: string
  ): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    
    const validFields = getValidFields(path);
    const actualFields = Object.keys(obj);
    
    for (const field of actualFields) {
      if (!isValidField(field, path)) {
        // Find multiple suggestions (up to 3)
        const suggestions = findMatches(field, Array.from(validFields), 3, 0.5);
        const bestMatch = suggestions[0];
        
        // Build hint with multiple suggestions or best match
        let hint: string;
        if (suggestions.length > 1) {
          hint = `Did you mean one of: ${suggestions.map(s => `"${s}"`).join(', ')}?`;
        } else if (bestMatch) {
          hint = `Did you mean "${bestMatch}"?`;
        } else {
          hint = `Valid fields at ${path}: ${Array.from(validFields).join(', ')}`;
        }
        
        // Check if this looks like a very close typo (>0.8 similarity)
        if (bestMatch && isLikelyTypo(field, bestMatch)) {
          hint = `This looks like a typo of "${bestMatch}"!`;
        }
        
        // Throw error with enhanced suggestion
        throw new SchemaError({
          code: 'ORB-S-001' as any,
          message: `Unknown field "${field}"`,
          path: path === 'root' ? field : `${path}.${field}`,
          hint,
          severity: ErrorSeverity.ERROR,
        });
      }
      
      // Recursively validate nested objects
      const value = obj[field];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedPath = path === 'root' ? field : `${path}.${field}`;
        this.validateUnknownFields(value, nestedPath);
      }
      
      // Validate array items (steps, triggers, etc.)
      if (Array.isArray(value)) {
        if (field === 'steps') {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              this.validateUnknownFields(
                item,
                `workflow.steps[${index}]`
              );
            }
          });
        } else if (field === 'triggers') {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              this.validateUnknownFields(
                item,
                `triggers[${index}]`
              );
            }
          });
        }
      }
    }
  }
  
  /**
   * Validate workflow body structure and semantics
   * 
   * @param workflow - Validated workflow definition
   */
  private static validateWorkflowBody(workflow: WorkflowDefinitionZod): void {
    // Check if workflow body exists
    if (!workflow.workflow || !workflow.workflow.steps) {
      throw SchemaError.missingField('workflow.steps', 'workflow');
    }
    
    // Validate steps array is not empty
    if (workflow.workflow.steps.length === 0) {
      throw new SchemaError({
        code: 'ORB-S-003' as any,
        message: 'Workflow must contain at least one step',
        path: 'workflow.steps',
        hint: 'Add at least one step to the workflow.',
        severity: 'error' as any,
      });
    }
  }
  
  /**
   * Transform Zod validation error into OrbytError with better diagnostics
   * 
   * @param error - Zod validation error
   * @returns Enhanced OrbytError
   */
  private static transformZodError(error: z.ZodError): OrbytError {
    // Get the first error (we'll enhance to handle multiple later)
    const firstIssue = error.issues[0];
    const path = firstIssue.path.join('.');
    
    // Determine error type and create appropriate error
    switch (firstIssue.code) {
      case 'invalid_type':
        // Access properties without casting to specific type
        const expectedType = (firstIssue as any).expected || 'unknown';
        const receivedType = (firstIssue as any).received || 'unknown';
        return SchemaError.invalidType(
          path.split('.').pop() || 'unknown',
          expectedType,
          String(receivedType),
          path
        );
      
      case 'invalid_union':
        // Handle union/enum-like errors
        return new SchemaError({
          code: 'ORB-S-004' as any,
          message: firstIssue.message,
          path,
          hint: 'Check the allowed values in the workflow schema documentation.',
          severity: ErrorSeverity.ERROR,
        });
      
      default:
        // Generic schema error
        return new SchemaError({
          code: 'ORB-S-002' as any,
          message: firstIssue.message,
          path,
          hint: 'Check the workflow schema documentation.',
          severity: ErrorSeverity.ERROR,
        });
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
      this.validate(rawWorkflow);
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
    data?: WorkflowDefinitionZod;
    error?: OrbytError;
  } {
    try {
      const data = this.validate(rawWorkflow);
      return { success: true, data };
    } catch (error) {
      if (error instanceof OrbytError) {
        return { success: false, error };
      }
      // Wrap unexpected errors
      return {
        success: false,
        error: new SchemaError({
          code: 'ORB-S-005' as any,
          message: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error' as any,
        }),
      };
    }
  }
}
