/**
 * Workflow Schema and Validation Errors
 * 
 * Specific error types for workflow parsing and validation.
 * Includes helpers for creating diagnostic-rich errors.
 * 
 * @module errors
 */

import { OrbytError, type OrbytErrorDiagnostic } from './OrbytError.js';
import { OrbytErrorCode, ErrorSeverity } from './ErrorCodes.js';

/**
 * Schema validation error (structure problems)
 */
export class SchemaError extends OrbytError {
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super({ ...diagnostic, severity: ErrorSeverity.ERROR });
  }
  
  /**
   * Create unknown field error with suggestion
   */
  static unknownField(
    field: string,
    path: string,
    suggestion?: string
  ): SchemaError {
    const hint = suggestion
      ? `Did you mean "${suggestion}"?`
      : 'Check the workflow schema documentation.';
    
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_UNKNOWN_FIELD,
      message: `Unknown field "${field}"`,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
    });
  }
  
  /**
   * Create invalid type error
   */
  static invalidType(
    field: string,
    expected: string,
    received: string,
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_INVALID_TYPE,
      message: `Field "${field}" expects ${expected}, got ${received}`,
      path,
      hint: `The field "${field}" must be a ${expected}.`,
      severity: ErrorSeverity.ERROR,
    });
  }
  
  /**
   * Create missing required field error
   */
  static missingField(
    field: string,
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_MISSING_FIELD,
      message: `Missing required field "${field}"`,
      path,
      hint: `Add the "${field}" field to your workflow.`,
      severity: ErrorSeverity.ERROR,
    });
  }
  
  /**
   * Create invalid enum value error
   */
  static invalidEnum(
    field: string,
    value: string,
    validValues: string[],
    path: string
  ): SchemaError {
    return new SchemaError({
      code: OrbytErrorCode.SCHEMA_INVALID_ENUM,
      message: `Invalid value "${value}" for field "${field}"`,
      path,
      hint: `Valid values are: ${validValues.join(', ')}`,
      severity: ErrorSeverity.ERROR,
    });
  }
}

/**
 * Semantic validation error (logic problems)
 */
export class ValidationError extends OrbytError {
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super({ ...diagnostic, severity: ErrorSeverity.ERROR });
  }
  
  /**
   * Create duplicate ID error
   */
  static duplicateId(
    stepId: string,
    path: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_DUPLICATE_ID,
      message: `Duplicate step ID "${stepId}"`,
      path,
      hint: 'Step IDs must be unique across the workflow.',
      severity: ErrorSeverity.ERROR,
    });
  }
  
  /**
   * Create unknown step reference error
   */
  static unknownStep(
    stepId: string,
    path: string,
    availableSteps?: string[]
  ): ValidationError {
    const hint = availableSteps && availableSteps.length > 0
      ? `Available steps: ${availableSteps.join(', ')}`
      : 'Ensure the step ID is defined before referencing it.';
    
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_UNKNOWN_STEP,
      message: `Unknown step "${stepId}"`,
      path,
      hint,
      severity: ErrorSeverity.ERROR,
    });
  }
  
  /**
   * Create circular dependency error
   */
  static circularDependency(
    cycle: string[],
    path: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY,
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      path,
      hint: 'Remove circular dependencies between steps.',
      severity: ErrorSeverity.ERROR,
    });
  }
  
  /**
   * Create forward reference error
   */
  static forwardReference(
    stepId: string,
    referencedStep: string,
    path: string
  ): ValidationError {
    return new ValidationError({
      code: OrbytErrorCode.VALIDATION_FORWARD_REFERENCE,
      message: `Step "${stepId}" references "${referencedStep}" which hasn't been defined yet`,
      path,
      hint: 'Steps must be defined before they are referenced.',
      severity: ErrorSeverity.ERROR,
    });
  }
}
