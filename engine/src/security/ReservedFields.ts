/**
 * Reserved Field Security
 * 
 * CRITICAL SECURITY MODULE
 * 
 * Defines and guards internal/reserved fields that users MUST NEVER control.
 * These fields are engine-controlled for billing, security, and audit purposes.
 * 
 * ANY attempt to set these fields in user YAML will be REJECTED at parse time
 * with explicit structured errors.
 * 
 * @module security
 */

import { SecurityError } from '../errors/SecurityErrors.js';
import { RESERVED_ANNOTATION_PREFIXES, RESERVED_CONTEXT_FIELDS, RESERVED_STEP_FIELDS, RESERVED_WORKFLOW_FIELDS, SecurityErrorCode } from '../types/core-types.js';


/**
 * Check if a field name is reserved
 */
export function isReservedWorkflowField(fieldName: string): boolean {
  return RESERVED_WORKFLOW_FIELDS.includes(fieldName as any) || fieldName.startsWith('_');
}

/**
 * Check if a context field name is reserved
 */
export function isReservedContextField(fieldName: string): boolean {
  return RESERVED_CONTEXT_FIELDS.includes(fieldName as any) || fieldName.startsWith('_');
}

/**
 * Check if a step field name is reserved
 */
export function isReservedStepField(fieldName: string): boolean {
  return RESERVED_STEP_FIELDS.includes(fieldName as any);
}

/**
 * Check if an annotation key uses a reserved prefix
 */
export function isReservedAnnotation(annotationKey: string): boolean {
  return RESERVED_ANNOTATION_PREFIXES.some(prefix => annotationKey.startsWith(prefix));
}

/**
 * Determine the appropriate error code for a reserved field
 */
function determineErrorCode(field: string): SecurityErrorCode {
  // Billing-related fields
  if (field.includes('billing') || field.includes('pricing') || field.includes('cost') || field.includes('subscription')) {
    return SecurityErrorCode.BILLING_FIELD_OVERRIDE;
  }

  // Identity fields
  if (field.includes('executionId') || field.includes('runId') || field.includes('traceId')) {
    return SecurityErrorCode.IDENTITY_FIELD_OVERRIDE;
  }

  // Ownership fields
  if (field.includes('userId') || field.includes('workspaceId') || field.includes('subscriptionId')) {
    return SecurityErrorCode.OWNERSHIP_FIELD_OVERRIDE;
  }

  // Usage counter fields
  if (field.includes('usage') || field.includes('count') || field.includes('duration')) {
    return SecurityErrorCode.USAGE_COUNTER_OVERRIDE;
  }

  // Internal state fields (anything starting with _)
  if (field.startsWith('_')) {
    return SecurityErrorCode.INTERNAL_STATE_OVERRIDE;
  }

  // Default to reserved field override
  return SecurityErrorCode.RESERVED_FIELD_OVERRIDE;
}

/**
 * Get human-readable reason for why a field is protected
 */
function getFieldReason(field: string): string {
  if (field.startsWith('_billing') || field.includes('billing')) {
    return 'Billing fields control pricing and cost calculation. User manipulation would compromise revenue integrity.';
  }

  if (field.startsWith('_internal')) {
    return 'Internal fields contain engine state. User manipulation would break execution and audit tracking.';
  }

  if (field.startsWith('_identity')) {
    return 'Identity fields link execution to audit trail. User manipulation would compromise compliance.';
  }

  if (field.startsWith('_ownership')) {
    return 'Ownership fields determine access rights. User manipulation would be a security violation.';
  }

  if (field.startsWith('_usage')) {
    return 'Usage counters track resource consumption. User manipulation would compromise billing and quotas.';
  }

  if (field.includes('executionId') || field.includes('runId')) {
    return 'Execution identifiers must be engine-generated for audit integrity and traceability.';
  }

  if (field.startsWith('_')) {
    return 'Fields starting with "_" are reserved for engine internals and cannot be user-controlled.';
  }

  return 'This field is reserved for engine control to ensure system integrity.';
}

/**
 * Scan an object for reserved field names
 * Returns array of found reserved fields
 */
export function findReservedFields(
  obj: Record<string, any>,
  reservedList: readonly string[],
  checkPrefix = true
): string[] {
  const found: string[] = [];

  for (const key of Object.keys(obj)) {
    // Check against reserved list
    if (reservedList.includes(key as any)) {
      found.push(key);
    }
    // Check for underscore prefix (internal convention)
    else if (checkPrefix && key.startsWith('_')) {
      found.push(key);
    }
  }

  return found;
}


/**
 * Validate workflow for reserved field violations
 * 
 * SECURITY CRITICAL: This runs BEFORE any workflow execution
 * Rejects workflows that attempt to control internal fields
 * 
 * @throws {SecurityError} If reserved fields are found
 */
export function validateWorkflowSecurity(workflow: any): void {
  // 1. Check top-level workflow fields for reserved/internal fields
  for (const key of Object.keys(workflow)) {
    if (isReservedWorkflowField(key)) {
      const code = determineErrorCode(key);
      const reason = getFieldReason(key);
      const err = SecurityError.reservedFieldOverride(key, 'workflow (root level)', code === SecurityErrorCode.BILLING_FIELD_OVERRIDE ? 'billing' : 'internal');
      (err as any).reason = reason;
      throw err;
    }
  }

  // 2. workflow.context fields
  if (workflow.context && typeof workflow.context === 'object') {
    const contextViolations = findReservedFields(workflow.context, RESERVED_CONTEXT_FIELDS);
    if (contextViolations.length > 0) {
      const key = contextViolations[0];
      const code = determineErrorCode(key);
      const reason = getFieldReason(key);
      const err = SecurityError.reservedFieldOverride(key, 'workflow.context', code === SecurityErrorCode.BILLING_FIELD_OVERRIDE ? 'billing' : 'internal');
      (err as any).reason = reason;
      throw err;
    }
  }

  // 3. Annotations
  if (workflow.annotations && typeof workflow.annotations === 'object') {
    for (const key of Object.keys(workflow.annotations)) {
      if (isReservedAnnotation(key)) {
        throw SecurityError.reservedAnnotation(key, 'workflow.annotations');
      }
    }
  }

  // 4. Steps
  if (workflow.workflow?.steps && Array.isArray(workflow.workflow.steps)) {
    for (let index = 0; index < workflow.workflow.steps.length; index++) {
      const step = workflow.workflow.steps[index];
      const stepViolations = findReservedFields(step, RESERVED_STEP_FIELDS);
      if (stepViolations.length > 0) {
        const key = stepViolations[0];
        const code = determineErrorCode(key);
        const reason = getFieldReason(key);
        const err = SecurityError.reservedFieldOverride(key, `workflow.steps[${index}] (${step.id || 'unnamed'})`, code === SecurityErrorCode.BILLING_FIELD_OVERRIDE ? 'billing' : 'internal');
        (err as any).reason = reason;
        throw err;
      }
    }
  }
}

/**
 * Collect all reserved field violations in a workflow (for advanced use/testing)
 * Returns an array of violation objects with code, reason, and location
 */
export function getAllReservedFieldViolations(workflow: any): Array<{ field: string, location: string, code: SecurityErrorCode, reason: string }> {
  const violations: Array<{ field: string, location: string, code: SecurityErrorCode, reason: string }> = [];

  // 1. Top-level
  for (const key of findReservedFields(workflow, RESERVED_WORKFLOW_FIELDS)) {
    violations.push({
      field: key,
      location: 'workflow (root level)',
      code: determineErrorCode(key),
      reason: getFieldReason(key),
    });
  }

  // 2. Context
  if (workflow.context && typeof workflow.context === 'object') {
    for (const key of findReservedFields(workflow.context, RESERVED_CONTEXT_FIELDS)) {
      violations.push({
        field: key,
        location: 'workflow.context',
        code: determineErrorCode(key),
        reason: getFieldReason(key),
      });
    }
  }

  // 3. Annotations
  if (workflow.annotations && typeof workflow.annotations === 'object') {
    for (const key of Object.keys(workflow.annotations)) {
      if (isReservedAnnotation(key)) {
        violations.push({
          field: key,
          location: 'workflow.annotations',
          code: SecurityErrorCode.RESERVED_ANNOTATION_NAMESPACE,
          reason: `Annotation namespace '${key.split('.')[0]}.' is reserved for engine use.`,
        });
      }
    }
  }

  // 4. Steps
  if (workflow.workflow?.steps && Array.isArray(workflow.workflow.steps)) {
    workflow.workflow.steps.forEach((step: any, index: number) => {
      for (const key of findReservedFields(step, RESERVED_STEP_FIELDS)) {
        violations.push({
          field: key,
          location: `workflow.steps[${index}] (${step.id || 'unnamed'})`,
          code: determineErrorCode(key),
          reason: getFieldReason(key),
        });
      }
    });
  }
  return violations;
}

