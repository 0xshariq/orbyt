/**
 * Workflow Schema and Validation Errors
 * 
 * Specific error types for workflow parsing and validation.
 * Includes factory methods for creating diagnostic-rich errors with:
 * - Clear, actionable error messages
 * - Fix suggestions (hints)
 * - Exit codes from ecosystem-core
 * - Field locations and context
 * 
 * USAGE:
 * =====
 * Instead of creating generic errors, use factory methods:
 * 
 * ```typescript
 * // ❌ Bad: Generic error
 * throw new Error('Unknown field: foo');
 * 
 * // ✅ Good: Structured error with diagnostics
 * throw SchemaError.unknownField('foo', 'workflow.steps[0]', 'name');
 * ```
 * 
 * ADDING NEW ERRORS:
 * ==================
 * 1. Add error code to OrbytErrorCode enum in ErrorCodes.ts
 * 2. Add description in getErrorDescription()
 * 3. Add factory method here
 * 4. Use the factory method throughout engine
 * 
 * @module errors
 */

import { ExitCodes } from '@dev-ecosystem/core';
import { OrbytError, type OrbytErrorDiagnostic } from './OrbytError.js';
import { OrbytErrorCode, ErrorSeverity } from './ErrorCodes.js';

/**
 * Schema validation error (structure problems)
 * 
 * Used for:
 * - Unknown/misspelled fields
 * - Invalid field types
 * - Missing required fields
 * - Invalid enum values
 * - YAML/JSON syntax errors
 */
export class SchemaError extends OrbytError {
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super({ 
      ...diagnostic, 
      severity: ErrorSeverity.ERROR,
      exitCode: diagnostic.exitCode || ExitCodes.INVALID_SCHEMA,
    });
  }
  
  /**
   * Create unknown field error with suggestion
   * 
   * @param field - The unknown field name
   * @param path - Path where field was found (e.g., "workflow.steps[0]")
   * @param suggestion - Suggested correct field name
   * @returns SchemaError with typo detection hint
   */
  static unknownField(
    field: string,
    path: string,
    suggestion?: string
  ): SchemaError {
    const hint = suggestion
      ? `Did you mean "${suggestion}"? Check for typos in field names.`
      : 'Check the Orbyt workflow schema documentation for valid fields.';
    
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_UNKNOWN_FIELD,
      message: `Unknown field "${field}" in workflow definition`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
      context: { field, suggestion },
    });
  }
  
  /**
   * Create invalid type error
   * 
   * @param field - Field name with wrong type
   * @param expected - Expected type (e.g., "string", "number", "array")
   * @param received - Actual type received
   * @param path - Path to the field
   * @returns SchemaError with type mismatch details
   */
  static invalidType(
    field: string,
    expected: string,
    received: string,
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_INVALID_TYPE,
      message: `Field "${field}" has incorrect type: expected ${expected}, received ${received}`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path,
      hint: `Change the value of "${field}" to match the expected type: ${expected}`,
      severity: ErrorSeverity.ERROR,
      context: { field, expected, received },
    });
  }
  
  /**
   * Create missing required field error
   * 
   * @param field - Name of missing required field
   * @param path - Path where field should be
   * @returns SchemaError for missing field
   */
  static missingField(
    field: string,
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_MISSING_FIELD,
      message: `Missing required field "${field}" in workflow definition`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path,
      hint: `Add the required field "${field}" to your workflow at ${path}`,
      severity: ErrorSeverity.ERROR,
      context: { field, path },
    });
  }
  
  /**
   * Create invalid enum value error
   * 
   * @param field - Field name with invalid value
   * @param value - Invalid value provided
   * @param validValues - List of valid values
   * @param path - Path to the field
   * @returns SchemaError with valid options
   */
  static invalidEnum(
    field: string,
    value: string,
    validValues: string[],
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_INVALID_ENUM,
      message: `Invalid value "${value}" for field "${field}". Must be one of: ${validValues.join(', ')}`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path,
      hint: `Change "${field}" to one of the valid values: ${validValues.join(', ')}`,
      severity: ErrorSeverity.ERROR,
      context: { field, value, validValues },
    });
  }

  /**
   * Create YAML/JSON parsing error
   * 
   * @param filePath - Path to workflow file with syntax error
   * @param line - Line number where error occurred (optional)
   * @param column - Column number where error occurred (optional)
   * @param details - Additional parsing error details (optional)
   * @returns SchemaError with parse location
   */
  static parseError(
    filePath: string,
    line?: number,
    column?: number,
    details?: string
  ): SchemaError {
    const location = line ? ` at line ${line}${column ? `, column ${column}` : ''}` : '';
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_PARSE_ERROR,
      message: `Failed to parse workflow file${location}`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path: filePath,
      hint: details || 'Check YAML/JSON syntax - ensure proper indentation, quotes, and structure',
      severity: ErrorSeverity.ERROR,
      context: { filePath, line, column, details },
    });
  }

  /**
   * Create reserved field error
   * 
   * @param field - Reserved field name that was used
   * @param path - Path where field was found
   * @returns SchemaError for reserved field usage
   */
  static reservedField(
    field: string,
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_RESERVED_FIELD,
      message: `Reserved field "${field}" cannot be used in workflow definition`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path,
      hint: `Field "${field}" is reserved by Orbyt engine. Use a different field name`,
      severity: ErrorSeverity.ERROR,
      context: { field },
    });
  }
  
  /**
   * Create invalid adapter error
   * 
   * @param adapter - Unknown adapter name
   * @param path - Path to step using unknown adapter
   * @param validAdapters - List of valid adapter names (optional)
   * @returns SchemaError for unknown adapter
   */
  static invalidAdapter(
    adapter: string,
    path: string,
    validAdapters?: string[]
  ): SchemaError {
    const hint = validAdapters
      ? `Use one of the supported adapters: ${validAdapters.join(', ')}`
      : `Adapter "${adapter}" is not registered. Check spelling or register the adapter`;
    
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_UNKNOWN_FIELD,
      message: `Unknown adapter "${adapter}"`,
      exitCode: ExitCodes.INVALID_SCHEMA,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
      context: { adapter, validAdapters },
    });
  }
}

/**
 * Semantic validation error (logic problems)
 * 
 * Used for:
 * - Duplicate step IDs
 * - Unknown step references
 * - Circular dependencies
 * - Forward references
 * - Invalid variable references
 */
export class ValidationError extends OrbytError {
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super({ 
      ...diagnostic, 
      severity: ErrorSeverity.ERROR,
      exitCode: diagnostic.exitCode || ExitCodes.VALIDATION_FAILED,
    });
  }
  
  /**
   * Create duplicate ID error
   * 
   * @param stepId - The duplicated step ID
   * @param path - Path to where duplicate was found
   * @param firstOccurrence - Path to first occurrence (optional)
   * @returns ValidationError for duplicate ID
   */
  static duplicateId(
    stepId: string,
    path: string,
    firstOccurrence?: string
  ): ValidationError {
    const hint = firstOccurrence
      ? `Step ID "${stepId}" was first used at ${firstOccurrence}. Each step must have a unique ID.`
      : `Rename one of the steps with ID "${stepId}" to make it unique.`;
    
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_DUPLICATE_ID,
      message: `Duplicate step ID "${stepId}" found in workflow`,
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
      context: { stepId, firstOccurrence },
    });
  }
  
  /**
   * Create unknown step reference error
   * 
   * @param stepId - The referenced step ID that doesn't exist
   * @param path - Path where the reference was made
   * @param availableSteps - List of valid step IDs
   * @returns ValidationError for unknown reference
   */
  static unknownStep(
    stepId: string,
    path: string,
    availableSteps?: string[]
  ): ValidationError {
    const hint = availableSteps && availableSteps.length > 0
      ? `Available step IDs: ${availableSteps.join(', ')}. Check for typos in the step ID.`
      : `Step "${stepId}" does not exist in this workflow. Check the step ID spelling.`;
    
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_UNKNOWN_STEP,
      message: `Step "${stepId}" referenced but not defined in workflow`,
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
      context: { stepId, availableSteps },
    });
  }
  
  /**
   * Create circular dependency error
   * 
   * @param cycle - Array of step IDs forming the cycle
   * @param path - Path where cycle was detected
   * @returns ValidationError for circular dependency
   */
  static circularDependency(
    cycle: string[],
    path: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY,
      message: `Circular dependency detected: ${cycle.join(' → ')} → ${cycle[0]}`,
      exitCode: ExitCodes.CIRCULAR_DEPENDENCY,
      path,
      hint: 'Remove one of the dependencies to break the cycle',
      severity: ErrorSeverity.ERROR,
      context: { cycle },
    });
  }
  
  /**
   * Create forward reference error
   * 
   * @param stepId - Step making the forward reference
   * @param referencedStep - Step being referenced that executes later
   * @param path - Path where reference was made
   * @returns ValidationError for forward reference
   */
  static forwardReference(
    stepId: string,
    referencedStep: string,
    path: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_FORWARD_REFERENCE,
      message: `Step "${stepId}" references "${referencedStep}" which executes later`,
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint: 'Steps can only reference steps that execute before them',
      severity: ErrorSeverity.ERROR,
      context: { stepId, referencedStep },
    });
  }

  /**
   * Create empty workflow error
   * 
   * @param path - Path to workflow file
   * @returns ValidationError for workflow with no steps
   */
  static emptyWorkflow(path: string): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_EMPTY_WORKFLOW,
      message: 'Workflow has no steps defined',
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint: 'Add at least one step to the workflow.steps array',
      severity: ErrorSeverity.ERROR,
      context: {},
    });
  }

  /**
   * Create missing input error
   * 
   * @param inputName - Required input that is missing
   * @param path - Path to step requiring the input
   * @returns ValidationError for missing required input
   */
  static missingInput(
    inputName: string,
    path: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_MISSING_INPUT,
      message: `Required input "${inputName}" is not provided`,
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint: `Add "${inputName}" to the workflow inputs or step inputs`,
      severity: ErrorSeverity.ERROR,
      context: { inputName },
    });
  }

  /**
   * Create invalid condition error
   * 
   * @param condition - The invalid condition expression
   * @param path - Path to step with invalid condition
   * @param reason - Why the condition is invalid (optional)
   * @returns ValidationError for invalid condition
   */
  static invalidCondition(
    condition: string,
    path: string,
    reason?: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_INVALID_CONDITION,
      message: `Invalid condition expression: ${condition}`,
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint: reason || 'Check the condition syntax - ensure proper operators and variable references',
      severity: ErrorSeverity.ERROR,
      context: { condition, reason },
    });
  }

  /**
   * Create invalid variable reference error
   * 
   * @param variable - The invalid variable name/reference
   * @param path - Path where variable is referenced
   * @param availableVars - List of available variable names (optional)
   * @returns ValidationError for invalid variable
   */
  static invalidVariable(
    variable: string,
    path: string,
    availableVars?: string[]
  ): ValidationError {
    const hint = availableVars && availableVars.length > 0
      ? `Available variables: ${availableVars.join(', ')}`
      : `Variable "${variable}" is not defined. Check spelling or define the variable`;
    
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_INVALID_VARIABLE,
      message: `Invalid variable reference: ${variable}`,
      exitCode: ExitCodes.VALIDATION_FAILED,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
      context: { variable, availableVars },
    });
  }
}