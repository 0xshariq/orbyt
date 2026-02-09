/**
 * Orbyt Error Codes
 * 
 * Stable error codes for reliable error handling and documentation.
 * Format: ORB-[Category]-[Number]
 * 
 * Categories:
 * - S: Schema/Structure errors
 * - V: Validation/Logic errors
 * - E: Execution errors
 * - R: Runtime errors
 * 
 * @module errors
 */

export enum OrbytErrorCode {
  // ============================================================================
  // SCHEMA ERRORS (S) - Structure problems
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
  
  // ============================================================================
  // VALIDATION ERRORS (V) - Logic problems
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
  
  // ============================================================================
  // EXECUTION ERRORS (E) - Runtime failures
  // ============================================================================
  
  /** Step execution failed */
  EXECUTION_STEP_FAILED = 'ORB-E-001',
  
  /** Timeout exceeded */
  EXECUTION_TIMEOUT = 'ORB-E-002',
  
  /** Adapter error */
  EXECUTION_ADAPTER_ERROR = 'ORB-E-003',
  
  /** Workflow cancelled */
  EXECUTION_CANCELLED = 'ORB-E-004',
  
  // ============================================================================
  // RUNTIME ERRORS (R) - System/Infrastructure
  // ============================================================================
  
  /** File not found */
  RUNTIME_FILE_NOT_FOUND = 'ORB-R-001',
  
  /** Permission denied */
  RUNTIME_PERMISSION_DENIED = 'ORB-R-002',
  
  /** Internal engine error */
  RUNTIME_INTERNAL_ERROR = 'ORB-R-003',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

/**
 * Get human-readable category name from error code
 */
export function getErrorCategory(code: OrbytErrorCode): string {
  if (code.startsWith('ORB-S-')) return 'Schema Error';
  if (code.startsWith('ORB-V-')) return 'Validation Error';
  if (code.startsWith('ORB-E-')) return 'Execution Error';
  if (code.startsWith('ORB-R-')) return 'Runtime Error';
  return 'Unknown Error';
}
