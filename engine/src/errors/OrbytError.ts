/**
 * Base Orbyt Error Class
 * 
 * Foundation for all Orbyt errors with diagnostic capabilities.
 * Provides structured error information for CLI, UI, and AI integrations.
 * 
 * @module errors
 */

import { OrbytErrorCode, ErrorSeverity, getErrorCategory } from './ErrorCodes.js';

/**
 * Diagnostic error information
 */
export interface OrbytErrorDiagnostic {
  /** Stable error code */
  code: OrbytErrorCode;
  
  /** Human-readable error message */
  message: string;
  
  /** Path to the error location (e.g., "workflow.steps[2].uses") */
  path?: string;
  
  /** Optional suggestion for fixing the error */
  hint?: string;
  
  /** Error severity */
  severity: ErrorSeverity;
  
  /** Additional context data */
  context?: Record<string, any>;
}

/**
 * Base error class for all Orbyt errors
 */
export class OrbytError extends Error {
  /** Error diagnostic information */
  public readonly diagnostic: OrbytErrorDiagnostic;
  
  constructor(diagnostic: OrbytErrorDiagnostic) {
    super(diagnostic.message);
    this.name = getErrorCategory(diagnostic.code);
    this.diagnostic = diagnostic;
    
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
   * Format error as string for logging/display
   */
  toString(): string {
    let msg = `${this.name} [${this.code}]`;
    
    if (this.path) {
      msg += ` at ${this.path}`;
    }
    
    msg += `\n${this.message}`;
    
    if (this.hint) {
      msg += `\n→ Hint: ${this.hint}`;
    }
    
    return msg;
  }
  
  /**
   * Convert to JSON for structured logging
   */
  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      hint: this.hint,
      severity: this.severity,
      context: this.diagnostic.context,
    };
  }
}
