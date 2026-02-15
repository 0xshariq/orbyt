/**
 * Orbyt Error Codes
 * 
 * Structured error codes for the Orbyt workflow execution engine.
 * These codes are separate from ecosystem exit codes (process-level).
 * 
 * ARCHITECTURE:
 * ============
 * - Error Codes (ORB-XX-NNN): Structured diagnostic codes for detailed error identification
 * - Exit Codes (100-509): Process-level codes from @dev-ecosystem/core for shell scripts
 * 
 * TWO-LAYER SYSTEM:
 * ================
 * 1. Exit Codes (@dev-ecosystem/core): Process termination codes for the whole ecosystem
 *    - Used by CLI, API, SDK to determine process exit status
 *    - Example: ExitCodes.INVALID_SCHEMA (103) for schema validation failures
 * 
 * 2. Error Codes (This file): Detailed diagnostic codes specific to Orbyt
 *    - Used internally by engine for precise error identification
 *    - Maps to exit codes for process termination
 *    - Example: ORB-S-001 (unknown field) → ExitCodes.INVALID_SCHEMA
 * 
 * Format: ORB-[Category]-[Number]
 * 
 * Categories:
 * - S: Schema/Structure errors (YAML syntax, field validation)
 * - V: Validation/Logic errors (duplicate IDs, circular deps)
 * - E: Execution errors (step failures, timeouts)
 * - R: Runtime errors (file not found, permissions)
 * 
 * ADDING NEW ERRORS:
 * =================
 * 1. Add error code enum value below
 * 2. Add description in getErrorDescription()
 * 3. Add exit code mapping in getExitCodeForError()
 * 4. Add to appropriate error class (WorkflowError, StepError, etc.)
 * 
 * @module errors
 */

import { ExitCodes } from '@dev-ecosystem/core';

export enum OrbytErrorCode {
  // ============================================================================
  // SCHEMA ERRORS (S) - Structure problems
  // Exit Code: ExitCodes.INVALID_SCHEMA (103)
  // ============================================================================

  /** Unknown field in workflow definition */
  SCHEMA_UNKNOWN_FIELD = 'ORB-S-001',

  /** Invalid field type */
  SCHEMA_INVALID_TYPE = 'ORB-S-002',

  /** Missing required field */
  SCHEMA_MISSING_FIELD = 'ORB-S-003',

  /** Invalid enum value */
  SCHEMA_INVALID_ENUM = 'ORB-S-004',

  /** Malformed YAML/JSON syntax */
  SCHEMA_PARSE_ERROR = 'ORB-S-005',

  /** Invalid field format/pattern */
  SCHEMA_INVALID_FORMAT = 'ORB-S-006',

  /** Reserved field detected (security) */
  SCHEMA_RESERVED_FIELD = 'ORB-S-007',

  // ============================================================================
  // VALIDATION ERRORS (V) - Logic problems
  // Exit Code: ExitCodes.VALIDATION_FAILED (105)
  // ============================================================================

  /** Duplicate step ID */
  VALIDATION_DUPLICATE_ID = 'ORB-V-001',

  /** Reference to non-existent step */
  VALIDATION_UNKNOWN_STEP = 'ORB-V-002',

  /** Circular dependency detected */
  VALIDATION_CIRCULAR_DEPENDENCY = 'ORB-V-003',

  /** Invalid step order */
  VALIDATION_INVALID_ORDER = 'ORB-V-004',

  /** Referenced step not yet executed */
  VALIDATION_FORWARD_REFERENCE = 'ORB-V-005',

  /** Invalid variable reference */
  VALIDATION_INVALID_VARIABLE = 'ORB-V-006',

  /** Missing required input */
  VALIDATION_MISSING_INPUT = 'ORB-V-007',

  /** Invalid adapter/action */
  VALIDATION_UNKNOWN_ADAPTER = 'ORB-V-008',

  /** Workflow has no steps */
  VALIDATION_EMPTY_WORKFLOW = 'ORB-V-009',

  /** Invalid condition expression syntax */
  VALIDATION_INVALID_CONDITION = 'ORB-V-010',

  // ============================================================================
  // EXECUTION ERRORS (E) - Runtime failures
  // Exit Code: ExitCodes.WORKFLOW_FAILED (300), ExitCodes.STEP_FAILED (301)
  // ============================================================================

  /** Step execution failed */
  EXECUTION_STEP_FAILED = 'ORB-E-001',

  /** Timeout exceeded */
  EXECUTION_TIMEOUT = 'ORB-E-002',

  /** Adapter error */
  EXECUTION_ADAPTER_ERROR = 'ORB-E-003',

  /** Workflow cancelled */
  EXECUTION_CANCELLED = 'ORB-E-004',

  /** Step dependency failed */
  EXECUTION_DEPENDENCY_FAILED = 'ORB-E-005',

  /** Conditional check failed */
  EXECUTION_CONDITION_FAILED = 'ORB-E-006',

  // ============================================================================
  // RUNTIME ERRORS (R) - System/Infrastructure
  // Exit Code: ExitCodes.INTERNAL_ERROR (500), ExitCodes.FILESYSTEM_ERROR (506)
  // ============================================================================

  /** File not found */
  RUNTIME_FILE_NOT_FOUND = 'ORB-R-001',

  /** Permission denied */
  RUNTIME_PERMISSION_DENIED = 'ORB-R-002',

  /** Internal engine error */
  RUNTIME_INTERNAL_ERROR = 'ORB-R-003',

  /** Adapter not registered */
  RUNTIME_ADAPTER_NOT_FOUND = 'ORB-R-004',

  /** Resource exhausted */
  RUNTIME_RESOURCE_EXHAUSTED = 'ORB-R-005',
}

/**
 * Error severity levels
 * Used for prioritizing and determining execution control
 * 
 * EXECUTION CONTROL BEHAVIOR:
 * - CRITICAL/FATAL: Stop entire workflow execution immediately
 * - ERROR/HIGH: Stop entire workflow execution (default for errors)
 * - MEDIUM: Stop current step, attempt to continue to next step
 * - LOW: Log warning and continue current step
 * - WARNING: Log warning message, continue execution
 * - INFO: Log informational message, continue execution
 */
export enum ErrorSeverity {
  /** Critical error - stop entire workflow immediately (unrecoverable) */
  CRITICAL = 'critical',

  /** Fatal error - stop entire workflow (severe failure) */
  FATAL = 'fatal',

  /** High severity error - stop entire workflow */
  ERROR = 'error',

  /** Medium severity - stop current step, try to continue workflow */
  MEDIUM = 'medium',

  /** Low severity - log and continue current step */
  LOW = 'low',

  /** Warning - log warning message, continue execution */
  WARNING = 'warning',

  /** Informational message */
  INFO = 'info',
}

/**
 * Get human-readable category name from error code
 * 
 * @param code - Orbyt error code
 * @returns Category name (e.g., "Schema Error")
 * 
 * @example
 * ```typescript
 * const category = getErrorCategory(OrbytErrorCode.SCHEMA_UNKNOWN_FIELD);
 * // Returns: "Schema Error"
 * ```
 */
export function getErrorCategory(code: OrbytErrorCode): string {
  if (code.startsWith('ORB-S-')) return 'Schema Error';
  if (code.startsWith('ORB-V-')) return 'Validation Error';
  if (code.startsWith('ORB-E-')) return 'Execution Error';
  if (code.startsWith('ORB-R-')) return 'Runtime Error';
  return 'Unknown Error';
}

/**
 * Get detailed description for an error code
 * Helps users understand what went wrong
 * 
 * @param code - Orbyt error code
 * @returns Human-readable description
 * 
 * @example
 * ```typescript
 * const desc = getErrorDescription(OrbytErrorCode.SCHEMA_UNKNOWN_FIELD);
 * // Returns: "Workflow contains an unknown or misspelled field name"
 * ```
 */
export function getErrorDescription(code: OrbytErrorCode): string {
  const descriptions: Record<OrbytErrorCode, string> = {
    // Schema Errors
    [OrbytErrorCode.SCHEMA_UNKNOWN_FIELD]: 'Workflow contains an unknown or misspelled field name. Check that all field names match the Orbyt schema.',
    [OrbytErrorCode.SCHEMA_INVALID_TYPE]: 'Field has incorrect type (e.g., string instead of number). Review the expected type for this field.',
    [OrbytErrorCode.SCHEMA_MISSING_FIELD]: 'Required field is missing from workflow definition. All required fields must be present.',
    [OrbytErrorCode.SCHEMA_INVALID_ENUM]: 'Field value is not one of the allowed options. Check the valid values for this field.',
    [OrbytErrorCode.SCHEMA_PARSE_ERROR]: 'YAML/JSON syntax error prevents parsing. Check for missing colons, incorrect indentation, or unmatched brackets.',
    [OrbytErrorCode.SCHEMA_INVALID_FORMAT]: 'Field value does not match expected format or pattern (e.g., invalid ID format, malformed timeout).',
    [OrbytErrorCode.SCHEMA_RESERVED_FIELD]: 'Workflow uses a reserved field that is controlled by the engine. Remove fields starting with "_" or other reserved names.',

    // Validation Errors
    [OrbytErrorCode.VALIDATION_DUPLICATE_ID]: 'Two or more steps have the same ID. Each step must have a unique identifier.',
    [OrbytErrorCode.VALIDATION_UNKNOWN_STEP]: 'Step references another step that does not exist. Verify that all step references point to valid step IDs.',
    [OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY]: 'Steps depend on each other in a circular way (A needs B, B needs A). Break the cycle.',
    [OrbytErrorCode.VALIDATION_INVALID_ORDER]: 'Steps are not in valid execution order. Check the "needs" dependencies.',
    [OrbytErrorCode.VALIDATION_FORWARD_REFERENCE]: 'Step references another step that executes later. Steps can only reference earlier steps.',
    [OrbytErrorCode.VALIDATION_INVALID_VARIABLE]: 'Variable reference is invalid or undefined. Check variable syntax and availability.',
    [OrbytErrorCode.VALIDATION_MISSING_INPUT]: 'Required input parameter is missing. Provide all required inputs.',
    [OrbytErrorCode.VALIDATION_UNKNOWN_ADAPTER]: 'Adapter or action does not exist. Verify the "uses" field references a valid adapter.',
    [OrbytErrorCode.VALIDATION_EMPTY_WORKFLOW]: 'Workflow has no steps defined. At least one step is required.',
    [OrbytErrorCode.VALIDATION_INVALID_CONDITION]: 'Condition expression has invalid syntax. Check operators and variable references.',

    // Execution Errors
    [OrbytErrorCode.EXECUTION_STEP_FAILED]: 'Step execution failed during runtime. Check step configuration and adapter logs.',
    [OrbytErrorCode.EXECUTION_TIMEOUT]: 'Step or workflow exceeded time limit. Consider increasing timeout or optimizing the step.',
    [OrbytErrorCode.EXECUTION_ADAPTER_ERROR]: 'Adapter encountered an error during execution. Check adapter configuration and logs.',
    [OrbytErrorCode.EXECUTION_CANCELLED]: 'Workflow was cancelled by user or system. Execution was interrupted intentionally.',
    [OrbytErrorCode.EXECUTION_DEPENDENCY_FAILED]: 'Step could not run because a dependency failed. Fix the failing dependency first.',
    [OrbytErrorCode.EXECUTION_CONDITION_FAILED]: 'Step condition evaluated to false. This is expected behavior when conditions are not met.',

    // Runtime Errors
    [OrbytErrorCode.RUNTIME_FILE_NOT_FOUND]: 'Required file or workflow does not exist at the specified path. Check file path and spelling.',
    [OrbytErrorCode.RUNTIME_PERMISSION_DENIED]: 'Insufficient permissions to access resource. Check file permissions and user access rights.',
    [OrbytErrorCode.RUNTIME_INTERNAL_ERROR]: 'Internal engine error occurred. This may indicate a bug - please report with details.',
    [OrbytErrorCode.RUNTIME_ADAPTER_NOT_FOUND]: 'Adapter is not registered with the engine. Make sure the adapter is installed and loaded.',
    [OrbytErrorCode.RUNTIME_RESOURCE_EXHAUSTED]: 'System resources exhausted (memory, CPU, disk). Reduce resource usage or increase limits.',
  };

  return descriptions[code] || 'Unknown error occurred';
}

/**
 * Map Orbyt error code to ecosystem exit code
 * Determines which process exit code should be used
 * 
 * @param code - Orbyt error code
 * @returns Exit code from @dev-ecosystem/core
 * 
 * @example
 * ```typescript
 * const exitCode = getExitCodeForError(OrbytErrorCode.SCHEMA_UNKNOWN_FIELD);
 * // Returns: ExitCodes.INVALID_SCHEMA (103)
 * ```
 */
export function getExitCodeForError(code: OrbytErrorCode): ExitCodes {
  // Schema errors → INVALID_SCHEMA
  if (code.startsWith('ORB-S-')) {
    if (code === OrbytErrorCode.SCHEMA_PARSE_ERROR) {
      return ExitCodes.INVALID_FORMAT;
    }
    if (code === OrbytErrorCode.SCHEMA_RESERVED_FIELD) {
      return ExitCodes.SECURITY_VIOLATION;
    }
    return ExitCodes.INVALID_SCHEMA;
  }

  // Validation errors → VALIDATION_FAILED
  if (code.startsWith('ORB-V-')) {
    if (code === OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY) {
      return ExitCodes.CIRCULAR_DEPENDENCY;
    }
    if (code === OrbytErrorCode.VALIDATION_MISSING_INPUT) {
      return ExitCodes.MISSING_REQUIRED_INPUT;
    }
    return ExitCodes.VALIDATION_FAILED;
  }

  // Execution errors → specific execution codes
  if (code.startsWith('ORB-E-')) {
    if (code === OrbytErrorCode.EXECUTION_TIMEOUT) {
      return ExitCodes.TIMEOUT;
    }
    if (code === OrbytErrorCode.EXECUTION_STEP_FAILED) {
      return ExitCodes.STEP_FAILED;
    }
    if (code === OrbytErrorCode.EXECUTION_ADAPTER_ERROR) {
      return ExitCodes.ADAPTER_FAILED;
    }
    if (code === OrbytErrorCode.EXECUTION_DEPENDENCY_FAILED) {
      return ExitCodes.DEPENDENCY_FAILED;
    }
    return ExitCodes.WORKFLOW_FAILED;
  }

  // Runtime errors → system-level codes
  if (code.startsWith('ORB-R-')) {
    if (code === OrbytErrorCode.RUNTIME_FILE_NOT_FOUND) {
      return ExitCodes.INVALID_FILE;
    }
    if (code === OrbytErrorCode.RUNTIME_PERMISSION_DENIED) {
      return ExitCodes.PERMISSION_DENIED;
    }
    if (code === OrbytErrorCode.RUNTIME_ADAPTER_NOT_FOUND) {
      return ExitCodes.MISSING_DEPENDENCY;
    }
    return ExitCodes.INTERNAL_ERROR;
  }

  return ExitCodes.INTERNAL_ERROR;
}

/**
 * Check if an error code represents a user error (fixable by changing workflow)
 * vs system error (infrastructure, permissions, etc.)
 * 
 * User errors are problems with the workflow definition that the user can fix.
 * System errors are infrastructure/runtime issues outside user control.
 * 
 * @param code - Orbyt error code
 * @returns True if error is user-fixable
 * 
 * @example
 * ```typescript
 * if (isUserError(error.code)) {
 *   console.log('Fix your workflow definition');
 * } else {
 *   console.log('Contact system administrator');
 * }
 * ```
 */
export function isUserError(code: OrbytErrorCode): boolean {
  // Schema and validation errors are always user-fixable
  return code.startsWith('ORB-S-') || code.startsWith('ORB-V-');
}

/**
 * Check if an error code represents a retryable error
 * Some errors (like timeouts, adapter failures) might succeed on retry.
 * Others (like validation errors) will always fail.
 * 
 * @param code - Orbyt error code
 * @returns True if error might succeed on retry
 * 
 * @example
 * ```typescript
 * if (isRetryable(error.code) && retryCount < maxRetries) {
 *   console.log('Retrying...');
 *   await retry();
 * }
 * ```
 */
export function isRetryable(code: OrbytErrorCode): boolean {
  // Only specific execution and runtime errors are retryable
  const retryableErrors = [
    OrbytErrorCode.EXECUTION_TIMEOUT,
    OrbytErrorCode.EXECUTION_ADAPTER_ERROR,
    OrbytErrorCode.RUNTIME_RESOURCE_EXHAUSTED,
  ];

  return retryableErrors.includes(code);
}

/**
 * Get suggested action for an error code
 * Provides actionable guidance for users
 * 
 * @param code - Orbyt error code
 * @returns Suggested action to fix the error
 * 
 * @example
 * ```typescript
 * const action = getSuggestedAction(OrbytErrorCode.SCHEMA_UNKNOWN_FIELD);
 * console.log(action); // "Check field names against schema documentation"
 * ```
 */
export function getSuggestedAction(code: OrbytErrorCode): string {
  const actions: Record<OrbytErrorCode, string> = {
    // Schema Errors
    [OrbytErrorCode.SCHEMA_UNKNOWN_FIELD]: 'Check field names against schema documentation',
    [OrbytErrorCode.SCHEMA_INVALID_TYPE]: 'Review field type requirements in schema',
    [OrbytErrorCode.SCHEMA_MISSING_FIELD]: 'Add the missing required field',
    [OrbytErrorCode.SCHEMA_INVALID_ENUM]: 'Use one of the allowed values',
    [OrbytErrorCode.SCHEMA_PARSE_ERROR]: 'Fix YAML/JSON syntax errors',
    [OrbytErrorCode.SCHEMA_INVALID_FORMAT]: 'Correct the field format (check regex patterns)',
    [OrbytErrorCode.SCHEMA_RESERVED_FIELD]: 'Remove reserved fields (those starting with "_")',

    // Validation Errors
    [OrbytErrorCode.VALIDATION_DUPLICATE_ID]: 'Rename duplicate steps to have unique IDs',
    [OrbytErrorCode.VALIDATION_UNKNOWN_STEP]: 'Fix step reference or add missing step',
    [OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY]: 'Break the dependency cycle',
    [OrbytErrorCode.VALIDATION_INVALID_ORDER]: 'Reorder steps or fix "needs" dependencies',
    [OrbytErrorCode.VALIDATION_FORWARD_REFERENCE]: 'Ensure steps only reference earlier steps',
    [OrbytErrorCode.VALIDATION_INVALID_VARIABLE]: 'Check variable name and availability',
    [OrbytErrorCode.VALIDATION_MISSING_INPUT]: 'Provide the required input parameter',
    [OrbytErrorCode.VALIDATION_UNKNOWN_ADAPTER]: 'Install adapter or fix "uses" field',
    [OrbytErrorCode.VALIDATION_EMPTY_WORKFLOW]: 'Add at least one step to workflow',
    [OrbytErrorCode.VALIDATION_INVALID_CONDITION]: 'Fix condition syntax or check variable references',

    // Execution Errors
    [OrbytErrorCode.EXECUTION_STEP_FAILED]: 'Check step configuration and logs',
    [OrbytErrorCode.EXECUTION_TIMEOUT]: 'Increase timeout or optimize step',
    [OrbytErrorCode.EXECUTION_ADAPTER_ERROR]: 'Check adapter configuration and logs',
    [OrbytErrorCode.EXECUTION_CANCELLED]: 'Resume workflow or investigate cancellation',
    [OrbytErrorCode.EXECUTION_DEPENDENCY_FAILED]: 'Fix the failing dependency step',
    [OrbytErrorCode.EXECUTION_CONDITION_FAILED]: 'Review condition logic or accept skip',

    // Runtime Errors
    [OrbytErrorCode.RUNTIME_FILE_NOT_FOUND]: 'Check file path exists and is accessible',
    [OrbytErrorCode.RUNTIME_PERMISSION_DENIED]: 'Check file permissions',
    [OrbytErrorCode.RUNTIME_INTERNAL_ERROR]: 'Report bug with full error details',
    [OrbytErrorCode.RUNTIME_ADAPTER_NOT_FOUND]: 'Install and register the adapter',
    [OrbytErrorCode.RUNTIME_RESOURCE_EXHAUSTED]: 'Free up resources or increase limits',
  };

  return actions[code] || 'Review error details and check documentation';
}

/**
 * Execution Control Actions
 * Determines what action to take when error occurs
 */
export enum ExecutionControl {
  /** Stop entire workflow execution immediately */
  STOP_WORKFLOW = 'STOP_WORKFLOW',

  /** Stop current step, try to continue to next step */
  STOP_STEP = 'STOP_STEP',

  /** Continue execution, just log the issue */
  CONTINUE = 'CONTINUE',
}

/**
 * Get execution control action based on severity
 * Determines whether to stop workflow, stop step, or continue
 * 
 * @param severity - Error severity level
 * @returns Execution control action
 * 
 * @example
 * ```typescript
 * const action = getExecutionControl(ErrorSeverity.CRITICAL);
 * // Returns: ExecutionControl.STOP_WORKFLOW
 * 
 * const action2 = getExecutionControl(ErrorSeverity.MEDIUM);
 * // Returns: ExecutionControl.STOP_STEP
 * ```
 */
export function getExecutionControl(severity: ErrorSeverity): ExecutionControl {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.FATAL:
    case ErrorSeverity.ERROR:
      return ExecutionControl.STOP_WORKFLOW;

    case ErrorSeverity.MEDIUM:
      return ExecutionControl.STOP_STEP;

    case ErrorSeverity.LOW:
    case ErrorSeverity.WARNING:
    case ErrorSeverity.INFO:
      return ExecutionControl.CONTINUE;

    default:
      return ExecutionControl.STOP_WORKFLOW; // Safe default
  }
}

/**
 * Check if severity should stop workflow execution
 * 
 * @param severity - Error severity level
 * @returns True if workflow should stop
 */
export function shouldStopWorkflow(severity: ErrorSeverity): boolean {
  return getExecutionControl(severity) === ExecutionControl.STOP_WORKFLOW;
}

/**
 * Check if severity should stop step execution
 * 
 * @param severity - Error severity level
 * @returns True if step should stop
 */
export function shouldStopStep(severity: ErrorSeverity): boolean {
  const control = getExecutionControl(severity);
  return control === ExecutionControl.STOP_WORKFLOW || control === ExecutionControl.STOP_STEP;
}

/**
 * Get severity level from error code
 * Auto-determines appropriate severity for error code
 * 
 * @param code - Orbyt error code
 * @returns Appropriate severity level
 */
export function getSeverityForErrorCode(code: OrbytErrorCode): ErrorSeverity {
  // Critical errors (security violations, internal errors)
  if (code === OrbytErrorCode.RUNTIME_INTERNAL_ERROR) {
    return ErrorSeverity.CRITICAL;
  }

  if (code === OrbytErrorCode.RUNTIME_PERMISSION_DENIED) {
    return ErrorSeverity.FATAL;
  }

  // Schema and validation errors are typically ERROR level
  if (code.startsWith('ORB-S-') || code.startsWith('ORB-V-')) {
    // But some validation errors are less severe
    if (code === OrbytErrorCode.VALIDATION_FORWARD_REFERENCE) {
      return ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.ERROR;
  }

  // Execution errors
  if (code.startsWith('ORB-E-')) {
    if (code === OrbytErrorCode.EXECUTION_TIMEOUT) {
      return ErrorSeverity.ERROR;
    }
    if (code === OrbytErrorCode.EXECUTION_CONDITION_FAILED) {
      return ErrorSeverity.LOW; // Conditions failing is often expected
    }
    return ErrorSeverity.MEDIUM; // Most execution errors can try next step
  }

  // Runtime errors
  if (code.startsWith('ORB-R-')) {
    if (code === OrbytErrorCode.RUNTIME_FILE_NOT_FOUND) {
      return ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.ERROR;
  }

  // Default to ERROR for unknown codes
  return ErrorSeverity.ERROR;
}

