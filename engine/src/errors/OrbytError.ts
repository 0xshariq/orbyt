/**
 * Base Orbyt Error Class
 * 
 * Foundation for all Orbyt errors with diagnostic capabilities.
 * Provides structured error information for CLI, UI, and AI integrations.
 * 
 * ARCHITECTURE:
 * - Error codes (ORB-XX-NNN): Structured codes for error identification
 * - Exit codes (from @dev-ecosystem/core): Process exit codes for shell scripts
 * - Severity levels: ERROR, WARNING, INFO
 * - Context + hints: Help users debug and fix issues
 * 
 * @module errors
 */

import { ExitCodes } from '@dev-ecosystem/core';
import { 
  OrbytErrorCode, 
  ErrorSeverity, 
  getErrorCategory, 
  getErrorDescription,
  getExitCodeForError,
  getSuggestedAction,
  isUserError,
  isRetryable
} from './ErrorCodes.js';

/**
 * Diagnostic error information
 * Contains all data needed to understand and debug an error
 */
export interface OrbytErrorDiagnostic {
  /** Structured error code (e.g., ORB-S-001) */
  code: OrbytErrorCode;
  
  /** Human-readable error message */
  message: string;
  
  /** Process exit code from ecosystem-core (for CLI) */
  exitCode?: ExitCodes;
  
  /** Path to the error location (e.g., "workflow.steps[2].uses") */
  path?: string;
  
  /** Optional suggestion for fixing the error */
  hint?: string;
  
  /** Error severity (ERROR, WARNING, INFO) */
  severity: ErrorSeverity;
  
  /** Additional context data for debugging */
  context?: Record<string, any>;
}

/**
 * Base error class for all Orbyt errors
 * 
 * Provides rich diagnostic information including:
 * - Structured error code
 * - Exit code for process termination
 * - Location in workflow where error occurred
 * - Hints for fixing the error
 * - Additional context for debugging
 * 
 * @example
 * ```typescript
 * throw new OrbytError({
 *   code: OrbytErrorCode.SCHEMA_MISSING_FIELD,
 *   message: 'Missing required field "version"',
 *   exitCode: ExitCodes.INVALID_SCHEMA,
 *   path: 'workflow',
 *   hint: 'Add "version: 1.0" to your workflow definition',
 *   severity: ErrorSeverity.ERROR,
 * });
 * ```
 */
export class OrbytError extends Error {
  /** Error diagnostic information */
  public readonly diagnostic: OrbytErrorDiagnostic;
  
  /** Timestamp when error occurred */
  public readonly timestamp: Date;
  
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super(diagnostic.message);
    this.name = getErrorCategory(diagnostic.code);
    this.diagnostic = {
      ...diagnostic,
      // Use getExitCodeForError for proper mapping, fallback to provided or default
      exitCode: diagnostic.exitCode || getExitCodeForError(diagnostic.code),
      // If no hint provided, use suggested action
      hint: diagnostic.hint || getSuggestedAction(diagnostic.code),
    };
    this.timestamp = new Date();
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Get the error code
   */
  get code(): OrbytErrorCode {
    return this.diagnostic.code;
  }
  
  /**
   * Get the exit code for process termination
   */
  get exitCode(): ExitCodes {
    return this.diagnostic.exitCode!;
  }
  
  /**
   * Get the error path (where it occurred)
   */
  get path(): string | undefined {
    return this.diagnostic.path;
  }
  
  /**
   * Get the error hint/suggestion
   */
  get hint(): string | undefined {
    return this.diagnostic.hint;
  }
  
  /**
   * Get error severity
   */
  get severity(): ErrorSeverity {
    return this.diagnostic.severity;
  }
  
  /**
   * Get detailed error description
   */
  get description(): string {
    return getErrorDescription(this.code);
  }
  
  /**
   * Check if this is a user-fixable error
   * @returns True if user can fix by changing workflow
   */
  get isUserError(): boolean {
    return isUserError(this.code);
  }
  
  /**
   * Check if this error is retryable
   * @returns True if retry might succeed
   */
  get isRetryable(): boolean {
    return isRetryable(this.code);
  }
  
  /**
   * Get error category (Schema, Validation, Execution, Runtime)
   */
  get category(): string {
    return getErrorCategory(this.code);
  }
  
  /**
   * Format error as string for logging/display
   * Includes all diagnostic information in a readable format
   * 
   * @returns Formatted error string
   */
  toString(): string {
    let msg = `${this.name} [${this.code}]`;
    
    if (this.path) {
      msg += ` at ${this.path}`;
    }
    
    msg += `\n\n${this.message}`;
    
    if (this.hint) {
      msg += `\n\n💡 Hint: ${this.hint}`;
    }
    
    if (this.diagnostic.context && Object.keys(this.diagnostic.context).length > 0) {
      msg += `\n\n📋 Context: ${JSON.stringify(this.diagnostic.context, null, 2)}`;
    }
    
    return msg;
  }
  
  /**
   * Format error as detailed string with full diagnostic info
   * Used for verbose logging and debugging
   * 
   * @returns Detailed formatted error string with box drawing
   */
  toDetailedString(): string {
    const lines = [
      '━'.repeat(70),
      `❌ ${this.name}`,
      '━'.repeat(70),
      '',
      `Error Code:    ${this.code}`,
      `Exit Code:     ${this.exitCode} (${this.getExitCodeDescription()})`,
      `Severity:      ${this.severity.toUpperCase()}`,
      `Category:      ${this.category}`,
      `Timestamp:     ${this.timestamp.toISOString()}`,
      `User Fixable:  ${this.isUserError ? 'Yes' : 'No'}`,
      `Retryable:     ${this.isRetryable ? 'Yes' : 'No'}`,
    ];
    
    if (this.path) {
      lines.push(`Location:      ${this.path}`);
    }
    
    lines.push('', '📝 Message:', `   ${this.message}`);
    
    if (this.description) {
      lines.push('', '📖 Description:', `   ${this.description}`);
    }
    
    if (this.hint) {
      lines.push('', '💡 Hint:', `   ${this.hint}`);
    }
    
    if (this.diagnostic.context && Object.keys(this.diagnostic.context).length > 0) {
      lines.push('', '📋 Context:');
      Object.entries(this.diagnostic.context).forEach(([key, value]) => {
        lines.push(`   ${key}: ${JSON.stringify(value)}`);
      });
    }
    
    lines.push('', '━'.repeat(70));
    
    return lines.join('\n');
  }
  
  /**
   * Get human-readable description of exit code
   */
  getExitCodeDescription(): string {
    // Import at runtime to avoid circular dependencies
    try {
      const { getExitCodeDescription } = require('@dev-ecosystem/core');
      return getExitCodeDescription(this.exitCode);
    } catch {
      return 'exit code';
    }
  }
  
  /**
   * Convert to JSON for structured logging
   * Suitable for sending to logging services, APIs, or storing in databases
   * 
   * @returns JSON representation of error
   */
  toJSON(): object {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      exitCode: this.exitCode,
      message: this.message,
      description: this.description,
      path: this.path,
      hint: this.hint,
      severity: this.severity,
      context: this.diagnostic.context,
      timestamp: this.timestamp.toISOString(),
      isUserError: this.isUserError,
      isRetryable: this.isRetryable,
    };
  }
  
  /**
   * Create a simplified error object for CLI display
   * Contains only essential information for user-facing output
   * 
   * @returns Simplified error object
   */
  toSimpleObject(): {
    code: string;
    message: string;
    hint?: string;
    path?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      path: this.path,
    };
  }
}
