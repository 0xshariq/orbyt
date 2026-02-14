/**
 * Security Error System
 * 
 * Structured errors for security violations.
 * These errors are thrown when users attempt to manipulate engine-controlled fields.
 * 
 * @module errors/security
 */

/**
 * Security error codes
 */
export enum SecurityErrorCode {
  /** User attempted to set a reserved field name */
  RESERVED_FIELD_OVERRIDE = 'ENGINE_RESERVED_FIELD_OVERRIDE',
  
  /** User attempted to set billing-related fields */
  BILLING_FIELD_OVERRIDE = 'ENGINE_BILLING_FIELD_OVERRIDE',
  
  /** User attempted to set execution identity fields */
  IDENTITY_FIELD_OVERRIDE = 'ENGINE_IDENTITY_FIELD_OVERRIDE',
  
  /** User attempted to set ownership fields */
  OWNERSHIP_FIELD_OVERRIDE = 'ENGINE_OWNERSHIP_FIELD_OVERRIDE',
  
  /** User attempted to set usage counter fields */
  USAGE_COUNTER_OVERRIDE = 'ENGINE_USAGE_COUNTER_OVERRIDE',
  
  /** User attempted to set internal state fields */
  INTERNAL_STATE_OVERRIDE = 'ENGINE_INTERNAL_STATE_OVERRIDE',
  
  /** User attempted to use reserved annotation namespace */
  RESERVED_ANNOTATION_NAMESPACE = 'ENGINE_RESERVED_ANNOTATION_NAMESPACE',
}

/**
 * Security violation details
 */
export interface SecurityViolationDetails {
  /** Error code for programmatic handling */
  code: SecurityErrorCode;
  
  /** Location where violation occurred */
  location: string;
  
  /** The reserved field that was attempted */
  field: string;
  
  /** The value user tried to set (for debugging) */
  attemptedValue?: any;
  
  /** Why this field is protected */
  reason: string;
  
  /** Suggested fix */
  suggestion: string;
}

/**
 * Security Error
 * 
 * Thrown when users attempt to manipulate engine-controlled fields.
 * This is a CRITICAL error that must never be silently ignored.
 */
export class SecurityError extends Error {
  public readonly code: SecurityErrorCode;
  public readonly violations: SecurityViolationDetails[];
  public readonly isEngineError = true;
  
  constructor(violations: SecurityViolationDetails[]) {
    const errorMessage = SecurityError.formatViolations(violations);
    super(errorMessage);
    
    this.name = 'SecurityError';
    this.code = violations[0]?.code || SecurityErrorCode.RESERVED_FIELD_OVERRIDE;
    this.violations = violations;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityError);
    }
  }
  
  /**
   * Format violations into a clear, actionable error message
   */
  private static formatViolations(violations: SecurityViolationDetails[]): string {
    const lines: string[] = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '❌ SECURITY VIOLATION: Engine-Controlled Fields Detected',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️  Your workflow contains fields that are RESERVED for engine control.',
      '   These fields are critical for:',
      '   • Billing integrity and usage tracking',
      '   • Security and audit compliance',
      '   • Execution identity and ownership',
      '',
      '🚫 User workflows CANNOT set these fields. The engine injects them.',
      '',
    ];
    
    if (violations.length === 1) {
      const v = violations[0];
      lines.push('VIOLATION DETAILS:');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`  Error Code:  ${v.code}`);
      lines.push(`  Location:    ${v.location}`);
      lines.push(`  Field:       "${v.field}"`);
      lines.push(`  Reason:      ${v.reason}`);
      lines.push('');
      lines.push(`  💡 Solution: ${v.suggestion}`);
    } else {
      lines.push(`FOUND ${violations.length} VIOLATIONS:`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      violations.forEach((v, index) => {
        lines.push('');
        lines.push(`${index + 1}. ${v.code}`);
        lines.push(`   Location: ${v.location}`);
        lines.push(`   Field:    "${v.field}"`);
        lines.push(`   Reason:   ${v.reason}`);
        lines.push(`   Solution: ${v.suggestion}`);
      });
    }
    
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('WHY THIS MATTERS:');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('  If users could set these fields:');
    lines.push('  ❌ Billing could be manipulated');
    lines.push('  ❌ Usage tracking would be unreliable');
    lines.push('  ❌ Audit trails would be compromised');
    lines.push('  ❌ Security boundaries would collapse');
    lines.push('');
    lines.push('  The engine protects these fields to ensure:');
    lines.push('  ✅ Billing integrity');
    lines.push('  ✅ Accurate usage tracking');
    lines.push('  ✅ Complete audit trails');
    lines.push('  ✅ Security compliance');
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('WHAT TO DO:');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('  1. Remove all fields starting with "_" from your workflow');
    lines.push('  2. Remove any billing, execution, or identity fields');
    lines.push('  3. Use only your own custom field names');
    lines.push('');
    lines.push('  EXAMPLE:');
    lines.push('    ❌ BAD:  _internal: { ... }');
    lines.push('    ❌ BAD:  executionId: "xyz"');
    lines.push('    ❌ BAD:  billingMode: "free"');
    lines.push('    ✅ GOOD: myData: { ... }');
    lines.push('    ✅ GOOD: customConfig: { ... }');
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return lines.join('\n');
  }
  
  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      violations: this.violations,
      isEngineError: this.isEngineError,
    };
  }
}

/**
 * Create a security error for reserved field violations
 */
export function createSecurityError(violations: SecurityViolationDetails[]): SecurityError {
  return new SecurityError(violations);
}
