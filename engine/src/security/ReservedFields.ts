/**
 * Reserved Field Security
 * 
 * CRITICAL SECURITY MODULE
 * 
 * Defines and guards internal/reserved fields that users MUST NEVER control.
 * These fields are engine-controlled for billing, security, and audit purposes.
 * 
 * ANY attempt to set these fields in user YAML will be REJECTED at parse time.
 * 
 * @module security
 */

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
 * Validation result for reserved fields
 */
export interface ReservedFieldValidation {
  valid: boolean;
  violations: ReservedFieldViolation[];
}

/**
 * Reserved field violation details
 */
export interface ReservedFieldViolation {
  location: string;        // Where the violation occurred
  field: string;           // The reserved field name
  value?: any;             // The attempted value (for logging)
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Validate workflow for reserved field violations
 * 
 * SECURITY CRITICAL: This runs BEFORE any workflow execution
 * Rejects workflows that attempt to control internal fields
 */
export function validateWorkflowSecurity(workflow: any): ReservedFieldValidation {
  const violations: ReservedFieldViolation[] = [];
  
  // 1. Check top-level workflow fields
  const topLevelViolations = findReservedFields(workflow, RESERVED_WORKFLOW_FIELDS);
  for (const field of topLevelViolations) {
    violations.push({
      location: 'workflow (root)',
      field,
      value: workflow[field],
      severity: 'error',
      message: `Reserved field '${field}' is engine-controlled and cannot be set in workflow YAML. This field is automatically injected for billing, audit, and security purposes.`,
    });
  }
  
  // 2. Check workflow.context for reserved fields
  if (workflow.context && typeof workflow.context === 'object') {
    const contextViolations = findReservedFields(workflow.context, RESERVED_CONTEXT_FIELDS);
    for (const field of contextViolations) {
      violations.push({
        location: 'workflow.context',
        field,
        value: workflow.context[field],
        severity: 'error',
        message: `Reserved context field '${field}' is engine-controlled. Remove this field from your workflow context.`,
      });
    }
  }
  
  // 3. Check annotations for reserved prefixes
  if (workflow.annotations && typeof workflow.annotations === 'object') {
    for (const key of Object.keys(workflow.annotations)) {
      if (isReservedAnnotation(key)) {
        violations.push({
          location: 'workflow.annotations',
          field: key,
          value: workflow.annotations[key],
          severity: 'error',
          message: `Reserved annotation namespace '${key}' is for engine use only. Use custom prefixes like 'custom.${key}' instead.`,
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
          location: `workflow.steps[${index}] (${step.id || 'unnamed'})`,
          field,
          value: step[field],
          severity: 'error',
          message: `Reserved step field '${field}' is engine-controlled and cannot be set in step definitions.`,
        });
      }
    });
  }
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Format reserved field violations into a user-friendly error message
 */
export function formatSecurityViolations(validation: ReservedFieldValidation): string {
  if (validation.valid) {
    return '';
  }
  
  const errorViolations = validation.violations.filter(v => v.severity === 'error');
  
  if (errorViolations.length === 0) {
    return '';
  }
  
  const lines = [
    '❌ SECURITY VIOLATION: Workflow contains reserved internal fields',
    '',
    'Your workflow attempts to set fields that are engine-controlled.',
    'These fields are automatically injected for billing, audit, and security.',
    '',
    'Violations found:',
    '',
  ];
  
  for (const violation of errorViolations) {
    lines.push(`  • ${violation.location}`);
    lines.push(`    Field: '${violation.field}'`);
    lines.push(`    ${violation.message}`);
    lines.push('');
  }
  
  lines.push('SOLUTION:');
  lines.push('  Remove these fields from your workflow YAML.');
  lines.push('  The engine will inject them automatically at runtime.');
  lines.push('');
  lines.push('EXAMPLE:');
  lines.push('  ❌ BAD:  context: { _internal: {...} }');
  lines.push('  ✅ GOOD: context: { myData: {...} }');
  
  return lines.join('\n');
}
