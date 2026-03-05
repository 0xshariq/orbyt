/**
 * Security Error System
 * 
 * Structured errors for security violations in workflows.
 * These errors are thrown when users attempt to:
 * - Manipulate engine-controlled fields
 * - Use reserved field names/annotations
 * - Override billing, execution, or identity fields
 * - Bypass security boundaries
 * 
 * CRITICAL: Security errors indicate attempts to compromise:
 * - Billing integrity and usage tracking
 * - Audit trails and compliance
 * - Execution identity and ownership
 * - Security boundaries
 * 
 * USAGE:
 * =====
 * Use factory methods for creating security errors:
 * 
 * ```typescript
 * // ❌ Bad: Generic error
 * throw new Error('Reserved field');
 * 
 * // ✅ Good: Structured security error
 * throw SecurityError.reservedFieldOverride('_internal', 'workflow.context');
 * ```
 * 
 * @module errors/security
 */

import { ExitCodes } from '@dev-ecosystem/core';
import { OrbytError } from './OrbytError.js';
import { OrbytErrorCode, ErrorSeverity } from './ErrorCodes.js';
import { OrbytErrorDiagnostic } from '../types/core-types.js';

/**
 * Security Error
 * 
 * Thrown when users attempt to manipulate engine-controlled fields.
 * Extends OrbytError to provide consistent error handling with proper exit codes.
 * 
 * CRITICAL: Security violations indicate attempts to compromise:
 * - Billing integrity → Manipulating usage tracking
 * - Audit compliance → Hiding execution traces
 * - System security → Bypassing access controls
 */
export class SecurityError extends OrbytError {
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super({
      ...diagnostic,
      severity: ErrorSeverity.ERROR,
      exitCode: diagnostic.exitCode || ExitCodes.SECURITY_VIOLATION,
    });
  }

  // ==================== FACTORY METHODS ====================

  /**
   * Create reserved field override error
   * 
   * @param field - Reserved field name that was attempted
   * @param path - Path where field was found
   * @param fieldType - Type of reserved field (e.g., 'billing', 'execution', 'internal')
   * @returns SecurityError for reserved field violation
   */
  static reservedFieldOverride(
    field: string,
    path: string,
    fieldType: 'billing' | 'execution' | 'identity' | 'ownership' | 'usage' | 'internal' = 'internal'
  ): SecurityError {
    const reasons: Record<string, string> = {
      billing: 'Billing fields control cost tracking and cannot be user-defined',
      execution: 'Execution fields are managed by engine for workflow orchestration',
      identity: 'Identity fields track user/org ownership and cannot be modified',
      ownership: 'Ownership fields establish resource access control',
      usage: 'Usage counters track resource consumption for billing',
      internal: 'Internal state fields are engine-managed and cannot be set by users',
    };

    return new SecurityError({
      code: OrbytErrorCode.RUNTIME_PERMISSION_DENIED,
      exitCode: ExitCodes.SECURITY_VIOLATION,
      message: `Reserved field "${field}" cannot be set in workflow`,
      hint: `Remove "${field}" from your workflow. ${reasons[fieldType]}`,
      path,
      severity: ErrorSeverity.ERROR,
      context: { field, fieldType, reason: reasons[fieldType] },
    });
  }

  /**
   * Create reserved annotation namespace error
   * 
   * @param annotation - Annotation key that uses reserved namespace
   * @param path - Path where annotation was found
   * @returns SecurityError for reserved annotation usage
   */
  static reservedAnnotation(
    annotation: string,
    path: string
  ): SecurityError {
    return new SecurityError({
      code: OrbytErrorCode.RUNTIME_PERMISSION_DENIED,
      exitCode: ExitCodes.SECURITY_VIOLATION,
      message: `Reserved annotation namespace "${annotation}" cannot be used`,
      hint: 'Annotations starting with "orbyt." or "_" are reserved. Use your own namespace',
      path,
      severity: ErrorSeverity.ERROR,
      context: { annotation },
    });
  }

  /**
   * Create field manipulation detected error
   * 
   * @param fields - Array of protected fields that were attempted
   * @param path - Path where manipulation was detected
   * @returns SecurityError with multiple violations
   */
  static fieldManipulationDetected(
    fields: Array<{ field: string; reason: string }>,
    path: string
  ): SecurityError {
    const fieldList = fields.map(f => f.field).join(', ');
    return new SecurityError({
      code: OrbytErrorCode.RUNTIME_PERMISSION_DENIED,
      exitCode: ExitCodes.SECURITY_VIOLATION,
      message: `Attempt to manipulate protected fields: ${fieldList}`,
      hint: 'Remove all engine-controlled fields from your workflow definition',
      path,
      severity: ErrorSeverity.ERROR,
      context: { fields },
    });
  }

  /**
   * Create permission denied error
   * 
   * @param resource - Resource that was attempted to access
   * @param path - Path where access was attempted
   * @param requiredPermission - Required permission that was missing (optional)
   * @returns SecurityError for insufficient permissions
   */
  static permissionDenied(
    resource: string,
    path: string,
    requiredPermission?: string
  ): SecurityError {
    const hint = requiredPermission
      ? `This operation requires permission: ${requiredPermission}`
      : 'Check access permissions and workflow ownership';

    return new SecurityError({
      code: OrbytErrorCode.RUNTIME_PERMISSION_DENIED,
      exitCode: ExitCodes.PERMISSION_DENIED,
      message: `Permission denied for resource: ${resource}`,
      hint,
      path,
      severity: ErrorSeverity.ERROR,
      context: { resource, requiredPermission },
    });
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
      hint: this.hint,
      severity: this.severity,
      context: this.diagnostic.context,
    };
  }
}


