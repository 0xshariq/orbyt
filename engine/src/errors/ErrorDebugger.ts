/**
 * Error Debugger (Smart Fix Suggestions)
 * 
 * Analyzes errors and provides actionable fix suggestions.
 * Makes debugging easy by suggesting concrete solutions.
 * 
 * PHILOSOPHY:
 * ==========
 * Instead of just showing errors, guide users to fix them.
 * Provide step-by-step solutions based on error context.
 * 
 * USAGE:
 * ======
 * ```typescript
 * // Get debug info for an error
 * const debug = ErrorDebugger.analyze(error);
 * console.log(debug.explanation);
 * console.log(debug.fixSteps);
 * 
 * // Get formatted debug output
 * const output = ErrorDebugger.format(error);
 * console.error(output);
 * ```
 * 
 * @module errors/debugger
 */

import { OrbytError } from './OrbytError.js';
import { OrbytErrorCode } from './ErrorCodes.js';

/**
 * Debug information for an error
 */
export interface ErrorDebugInfo {
  /** Plain English explanation of what went wrong */
  explanation: string;
  
  /** Why this error occurred (root cause) */
  cause: string;
  
  /** Step-by-step fix instructions */
  fixSteps: string[];
  
  /** Common mistakes that lead to this error */
  commonMistakes?: string[];
  
  /** Related documentation links */
  docsLinks?: string[];
  
  /** Example of correct implementation */
  example?: {
    description: string;
    code: string;
  };
  
  /** Whether this requires immediate action */
  urgent: boolean;
  
  /** Estimated time to fix */
  estimatedFixTime?: string;
}

/**
 * Error Debugger
 * 
 * Smart system that analyzes errors and provides fix suggestions.
 */
export class ErrorDebugger {
  /**
   * Analyze error and generate debug information
   * 
   * @param error - OrbytError to analyze
   * @returns Debug information with fix suggestions
   * 
   * @example
   * ```typescript
   * const debug = ErrorDebugger.analyze(error);
   * console.log(debug.explanation);
   * debug.fixSteps.forEach((step, i) => {
   *   console.log(`${i + 1}. ${step}`);
   * });
   * ```
   */
  static analyze(error: OrbytError): ErrorDebugInfo {
    // Get base information from error code
    const baseInfo = this.getBaseDebugInfo(error.code);
    
    // Enhance with context-specific information
    const contextInfo = this.analyzeContext(error);
    
    return {
      ...baseInfo,
      ...contextInfo,
      // Override with more specific information if available
      cause: contextInfo.cause || baseInfo.cause,
      fixSteps: (contextInfo.fixSteps && contextInfo.fixSteps.length > 0) ? contextInfo.fixSteps : baseInfo.fixSteps,
    };
  }
  
  /**
   * Format debug information for display
   * 
   * @param error - Error to format
   * @param useColors - Whether to use ANSI colors (default: true)
   * @returns Formatted debug output
   */
  static format(error: OrbytError, useColors: boolean = true): string {
    const debug = this.analyze(error);
    const lines: string[] = [];
    
    // Color codes
    const c = useColors ? {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      yellow: '\x1b[33m',
      green: '\x1b[32m',
      red: '\x1b[31m',
    } : {
      reset: '', bold: '', dim: '', blue: '', cyan: '', yellow: '', green: '', red: '',
    };
    
    // Header
    lines.push(`${c.bold}${c.blue}━━━━ DEBUG INFO ━━━━${c.reset}`);
    lines.push('');
    
    // Explanation
    lines.push(`${c.bold}What went wrong:${c.reset}`);
    lines.push(debug.explanation);
    lines.push('');
    
    // Cause
    lines.push(`${c.bold}Why it happened:${c.reset}`);
    lines.push(debug.cause);
    lines.push('');
    
    // Fix steps
    lines.push(`${c.bold}${c.green}How to fix:${c.reset}`);
    debug.fixSteps.forEach((step, i) => {
      lines.push(`${c.cyan}${i + 1}.${c.reset} ${step}`);
    });
    
    // Common mistakes
    if (debug.commonMistakes && debug.commonMistakes.length > 0) {
      lines.push('');
      lines.push(`${c.bold}${c.yellow}Common mistakes:${c.reset}`);
      debug.commonMistakes.forEach(mistake => {
        lines.push(`${c.dim}•${c.reset} ${mistake}`);
      });
    }
    
    // Example
    if (debug.example) {
      lines.push('');
      lines.push(`${c.bold}Example:${c.reset}`);
      lines.push(`${c.dim}${debug.example.description}${c.reset}`);
      lines.push('');
      lines.push(c.dim + '```' + c.reset);
      lines.push(debug.example.code);
      lines.push(c.dim + '```' + c.reset);
    }
    
    // Time estimate
    if (debug.estimatedFixTime) {
      lines.push('');
      lines.push(`${c.dim}⏱  Estimated fix time: ${debug.estimatedFixTime}${c.reset}`);
    }
    
    return lines.join('\n');
  }
  
  // ==================== PRIVATE METHODS ====================
  
  /**
   * Get base debug information for error code
   */
  private static getBaseDebugInfo(code: OrbytErrorCode): ErrorDebugInfo {
    // Map of error codes to debug information
    const debugMap: Partial<Record<OrbytErrorCode, Partial<ErrorDebugInfo>>> = {
      [OrbytErrorCode.SCHEMA_UNKNOWN_FIELD]: {
        explanation: 'Your workflow contains a field that is not recognized by Orbyt.',
        cause: 'This usually happens due to a typo in the field name or using a field that doesn\'t exist in the schema.',
        fixSteps: [
          'Check the spelling of the field name',
          'Refer to Orbyt documentation for valid field names',
          'Remove the field if it\'s not needed',
        ],
        commonMistakes: [
          'Typos in field names (e.g., "varion" instead of "version")',
          'Using deprecated field names',
          'Copy-pasting from old workflow versions',
        ],
      },
      
      [OrbytErrorCode.SCHEMA_RESERVED_FIELD]: {
        explanation: 'You tried to use a field name that is reserved by Orbyt engine.',
        cause: 'Reserved fields are used internally for billing, execution tracking, and security. Users cannot set these.',
        fixSteps: [
          'Rename the field to something else',
          'Avoid using fields starting with "_" or "__"',
          'Avoid fields like "executionId", "billingMode", "userId"',
        ],
        commonMistakes: [
          'Using underscore-prefixed fields (_internal, __context)',
          'Trying to set billing fields manually',
          'Using engine-managed field names',
        ],
        docsLinks: ['https://docs.orbyt.dev/reserved-fields'],
      },
      
      [OrbytErrorCode.SCHEMA_MISSING_FIELD]: {
        explanation: 'A required field is missing from your workflow definition.',
        cause: 'Orbyt requires certain fields to be present for the workflow to be valid.',
        fixSteps: [
          'Add the missing required field to your workflow',
          'Check field name spelling',
          'Refer to schema documentation for required fields',
        ],
        estimatedFixTime: '1-2 minutes',
      },
      
      [OrbytErrorCode.VALIDATION_DUPLICATE_ID]: {
        explanation: 'Multiple steps in your workflow have the same ID.',
        cause: 'Each step must have a unique identifier so Orbyt can track execution and dependencies.',
        fixSteps: [
          'Find all steps with the duplicate ID',
          'Rename one (or both) to make IDs unique',
          'Use descriptive, meaningful IDs for clarity',
        ],
        commonMistakes: [
          'Copy-pasting steps without changing IDs',
          'Using generic IDs like "step1", "step2"',
        ],
        estimatedFixTime: '1 minute',
      },
      
      [OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY]: {
        explanation: 'Your workflow has steps that depend on each other in a circle.',
        cause: 'Step A depends on Step B, which depends on Step C, which depends on Step A. This creates an infinite loop.',
        fixSteps: [
          'Review the dependency chain shown in the error',
          'Identify which dependency can be removed or reordered',
          'Break the circle by removing one dependency',
        ],
        commonMistakes: [
          'Not visualizing the dependency graph',
          'Adding dependencies without checking existing ones',
        ],
        urgent: true,
        estimatedFixTime: '5-10 minutes',
      },
      
      [OrbytErrorCode.EXECUTION_TIMEOUT]: {
        explanation: 'A step took too long to execute and was terminated.',
        cause: 'The step exceeded its configured timeout limit.',
        fixSteps: [
          'Increase the timeout value in step configuration',
          'Optimize the step\'s logic to run faster',
          'Check if the step is stuck in an infinite loop',
          'Verify external services are responding',
        ],
        commonMistakes: [
          'Setting timeout too low for long-running operations',
          'Not handling network delays',
          'Infinite loops in custom code',
        ],
        urgent: true,
        estimatedFixTime: '10-30 minutes',
      },
    };
    
    const info = debugMap[code];
    
    if (info) {
      return {
        explanation: info.explanation || 'An error occurred in your workflow.',
        cause: info.cause || 'The exact cause depends on the specific error code and context.',
        fixSteps: info.fixSteps || [],
        commonMistakes: info.commonMistakes,
        docsLinks: info.docsLinks,
        example: info.example,
        urgent: info.urgent ?? false,
        estimatedFixTime: info.estimatedFixTime,
      };
    }
    
    // Default debug info for unknown codes
    return {
      explanation: 'An error occurred in your workflow.',
      cause: 'The exact cause depends on the specific error code and context.',
      fixSteps: [
        'Review the error message carefully',
        'Check the path/location mentioned in the error',
        'Refer to Orbyt documentation',
        'Contact support if issue persists',
      ],
      urgent: false,
    };
  }
  
  /**
   * Analyze error context for more specific information
   */
  private static analyzeContext(error: OrbytError): Partial<ErrorDebugInfo> {
    const fixSteps: string[] = [];
    
    // Add location-specific fix steps
    if (error.path) {
      fixSteps.push(`Look at: ${error.path}`);
    }
    
    // Add context-specific information
    if (error.diagnostic.context) {
      const ctx = error.diagnostic.context;
      
      // For unknown field errors, add suggestion if available
      if (ctx.suggestion) {
        fixSteps.push(`Did you mean: "${ctx.suggestion}"?`);
      }
      
      // For enum errors, show valid values
      if (ctx.validValues && Array.isArray(ctx.validValues)) {
        fixSteps.push(`Use one of: ${ctx.validValues.join(', ')}`);
      }
      
      // For type errors, show expected type
      if (ctx.expected) {
        fixSteps.push(`Change type to: ${ctx.expected}`);
      }
    }
    
    return { fixSteps };
  }
  
  /**
   * Quick debug - one-line summary
   * 
   * @param error - Error to summarize
   * @returns One-line debug summary
   */
  static quickDebug(error: OrbytError): string {
    const debug = this.analyze(error);
    return `💡 ${debug.fixSteps[0] || debug.cause}`;
  }
}
