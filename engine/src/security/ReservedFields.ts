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

import { 
  SecurityError, 
  SecurityErrorCode, 
  type SecurityViolationDetails 
} from '../errors/SecurityErrors.js';

/**
 * Reserved top-level workflow fields
 * These are NEVER user-controlled, always engine-injected
 */
export const RESERVED_WORKFLOW_FIELDS = [
  '_internal',           // Internal execution context
  '_identity',           // Execution identity
  '_ownership',          // Ownership context
  '_billing',            // Billing context
  '_usage',              // Usage tracking
  '_audit',              // Audit trail
  '_system',             // System fields
  '_engine',             // Engine metadata
  '_execution',          // Execution context (internal)
  '_runtime',            // Runtime context (internal)
  '_security',           // Security context
  '_metadata',           // Internal metadata
] as const;

/**
 * Reserved context field names
 * Users cannot set these in workflow context
 */
export const RESERVED_CONTEXT_FIELDS = [
  '_internal',
  '_identity',
  '_ownership',
  '_billing',
  '_usage',
  '_audit',
  '_system',
  '_engine',
  '_security',
  'executionId',
  'runId',
  'traceId',
  'userId',
  'workspaceId',
  'subscriptionId',
  'subscriptionTier',
  'billingId',
  'billingMode',
  'pricingTier',
  'pricingModel',
  'billingSnapshot',
] as const;

/**
 * Reserved step field names
 * Users cannot set these in step definitions
 */
export const RESERVED_STEP_FIELDS = [
  '_internal',
  '_billing',
  '_usage',
  '_audit',
  'executionId',
  'runId',
  'stepExecutionId',
] as const;

/**
 * Reserved annotation prefixes
 * These annotation namespaces are reserved for engine use
 */
export const RESERVED_ANNOTATION_PREFIXES = [
  'engine.',
  'system.',
  'internal.',
  'billing.',
  'audit.',
  'security.',
] as const;

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
  const violations: SecurityViolationDetails[] = [];
  
  // 1. Check top-level workflow fields
  const topLevelViolations = findReservedFields(workflow, RESERVED_WORKFLOW_FIELDS);
  for (const field of topLevelViolations) {
    violations.push({
      code: determineErrorCode(field),
      location: 'workflow (root level)',
      field,
      attemptedValue: workflow[field],
      reason: getFieldReason(field),
      suggestion: `Remove '${field}' from your workflow YAML. The engine will inject this field automatically during execution.`,
    });
  }
  
  // 2. Check workflow.context for reserved fields
  if (workflow.context && typeof workflow.context === 'object') {
    const contextViolations = findReservedFields(workflow.context, RESERVED_CONTEXT_FIELDS);
    for (const field of contextViolations) {
      violations.push({
        code: determineErrorCode(field),
        location: 'workflow.context',
        field,
        attemptedValue: workflow.context[field],
        reason: getFieldReason(field),
        suggestion: `Remove '${field}' from workflow.context. Use custom field names like 'myContext' or 'customData' instead.`,
      });
    }
  }
  
  // 3. Check annotations for reserved prefixes
  if (workflow.annotations && typeof workflow.annotations === 'object') {
    for (const key of Object.keys(workflow.annotations)) {
      if (isReservedAnnotation(key)) {
        violations.push({
          code: SecurityErrorCode.RESERVED_ANNOTATION_NAMESPACE,
          location: 'workflow.annotations',
          field: key,
          attemptedValue: workflow.annotations[key],
          reason: `Annotation namespace '${key.split('.')[0]}.' is reserved for engine use.`,
          suggestion: `Use a custom prefix like 'custom.${key}' or 'my.${key}' instead.`,
        });
      }
    }
  }
  
  // 4. Check steps for reserved fields
  if (workflow.workflow?.steps && Array.isArray(workflow.workflow.steps)) {
    workflow.workflow.steps.forEach((step: any, index: number) => {
      const stepViolations = findReservedFields(step, RESERVED_STEP_FIELDS);
      for (const field of stepViolations) {
        violations.push({
          code: determineErrorCode(field),
          location: `workflow.steps[${index}] (${step.id || 'unnamed'})`,
          field,
          attemptedValue: step[field],
          reason: getFieldReason(field),
          suggestion: `Remove '${field}' from step definition. The engine tracks execution state internally.`,
        });
      }
    });
  }
  
  // If violations found, throw SecurityError
  if (violations.length > 0) {
    throw new SecurityError(violations);
  }
}
