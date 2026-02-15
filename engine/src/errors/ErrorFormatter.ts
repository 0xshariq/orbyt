/**
 * Error Formatter
 * 
 * Formats Orbyt errors for CLI display with colors and helpful formatting.
 * Provides human-readable error output for developers with:
 * - Colored output for severity levels
 * - Exit code information
 * - Error category and retryability
 * - Contextual debugging information
 * 
 * USAGE:
 * =====
 * ```typescript
 * // Format single error
 * const formatted = formatError(error);
 * console.error(formatted);
 * 
 * // Format multiple errors
 * const formatted = formatErrors(errors);
 * console.error(formatted);
 * 
 * // Detailed format with all diagnostics
 * const detailed = formatDetailedError(error);
 * console.error(detailed);
 * ```
 * 
 * @module errors
 */

import { OrbytError } from './OrbytError.js';
import { ErrorSeverity } from './ErrorCodes.js';

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

/**
 * Format error for CLI display
 * 
 * @param error - Orbyt error to format
 * @param useColors - Whether to use ANSI colors (default: true)
 * @param verbose - Show additional diagnostic info (default: false)
 * @returns Formatted error string
 */
export function formatError(
  error: OrbytError, 
  useColors: boolean = true,
  verbose: boolean = false
): string {
  const c = useColors ? colors : {
    reset: '',
    bold: '',
    dim: '',
    red: '',
    yellow: '',
    blue: '',
    cyan: '',
    gray: '',
  };
  
  const lines: string[] = [];
  
  // Error header with icon
  const icon = getSeverityIcon(error.severity);
  const color = getSeverityColor(error.severity, c);
  
  lines.push(
    `${color}${icon} ${error.name}${c.reset} ${c.gray}[${error.code}]${c.reset}`
  );
  
  // Path (if available)
  if (error.path) {
    lines.push(`${c.dim}at ${c.cyan}${error.path}${c.reset}`);
  }
  
  // Empty line
  lines.push('');
  
  // Main error message
  lines.push(`${c.bold}${error.message}${c.reset}`);
  
  // Hint (if available)
  if (error.hint) {
    lines.push('');
    lines.push(`${c.blue}\u2192 Hint:${c.reset} ${error.hint}`);
  }

  // Verbose mode: show additional diagnostics
  if (verbose) {
    lines.push('');
    lines.push(`${c.dim}Exit Code:${c.reset} ${error.exitCode} (${error.getExitCodeDescription()})`);
    lines.push(`${c.dim}Category:${c.reset} ${error.category}`);
    
    const flags: string[] = [];
    if (error.isUserError) flags.push('User-fixable');
    if (error.isRetryable) flags.push('Retryable');
    if (flags.length > 0) {
      lines.push(`${c.dim}Flags:${c.reset} ${flags.join(', ')}`);
    }
    
    // Show context if available
    if (error.diagnostic.context && Object.keys(error.diagnostic.context).length > 0) {
      lines.push('');
      lines.push(`${c.dim}Context:${c.reset}`);
      lines.push(c.gray + JSON.stringify(error.diagnostic.context, null, 2) + c.reset);
    }
  }
  
  return lines.join('\n');
}

/**
 * Format multiple errors for CLI display
 * 
 * @param errors - Array of Orbyt errors
 * @param useColors - Whether to use ANSI colors
 * @param verbose - Show additional diagnostic info
 * @returns Formatted errors string
 */
export function formatErrors(
  errors: OrbytError[], 
  useColors: boolean = true,
  verbose: boolean = false
): string {
  const c = useColors ? colors : {
    reset: '',
    bold: '',
    dim: '',
    red: '',
    yellow: '',
    blue: '',
    cyan: '',
    gray: '',
  };
  
  const lines: string[] = [];
  
  // Header
  lines.push(`${c.red}${c.bold}Found ${errors.length} error(s):${c.reset}`);
  lines.push('');
  
  // Format each error
  errors.forEach((error, index) => {
    if (index > 0) {
      lines.push('');
      lines.push(c.dim + '\u2500'.repeat(50) + c.reset);
      lines.push('');
    }
    lines.push(formatError(error, useColors, verbose));
  });
  
  return lines.join('\n');
}

/**
 * Format error with full diagnostic information
 * Useful for debugging and detailed error analysis
 * 
 * @param error - Orbyt error to format
 * @param useColors - Whether to use ANSI colors
 * @returns Detailed formatted error string
 */
export function formatDetailedError(error: OrbytError, useColors: boolean = true): string {
  const c = useColors ? colors : {
    reset: '',
    bold: '',
    dim: '',
    red: '',
    yellow: '',
    blue: '',
    cyan: '',
    gray: '',
  };
  
  // Use OrbytError's toDetailedString for comprehensive output
  const detailed = error.toDetailedString();
  
  // Colorize the output
  if (useColors) {
    return detailed
      .replace(/\[ERROR\]/g, `${c.red}[ERROR]${c.reset}`)
      .replace(/\[WARNING\]/g, `${c.yellow}[WARNING]${c.reset}`)
      .replace(/\[INFO\]/g, `${c.blue}[INFO]${c.reset}`)
      .replace(/Exit Code:/g, `${c.bold}Exit Code:${c.reset}`)
      .replace(/Description:/g, `${c.bold}Description:${c.reset}`)
      .replace(/Hint:/g, `${c.blue}Hint:${c.reset}`)
      .replace(/Path:/g, `${c.cyan}Path:${c.reset}`)
      .replace(/Context:/g, `${c.dim}Context:${c.reset}`);
  }
  
  return detailed;
}

/**
 * Format error summary (one-line format)
 * Useful for logging or compact display
 * 
 * @param error - Orbyt error to format
 * @param useColors - Whether to use ANSI colors
 * @returns One-line error summary
 */
export function formatErrorSummary(error: OrbytError, useColors: boolean = true): string {
  const c = useColors ? colors : {
    reset: '',
    bold: '',
    red: '',
    yellow: '',
    blue: '',
    gray: '',
  };
  
  const color = getSeverityColor(error.severity, c);
  const icon = getSeverityIcon(error.severity);
  const path = error.path ? ` at ${error.path}` : '';
  
  return `${color}${icon} ${error.code}${c.reset}${path}: ${c.bold}${error.message}${c.reset}`;
}

/**
 * Get icon for error severity
 */
function getSeverityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.ERROR:
      return '\u2717'; // ✗
    case ErrorSeverity.WARNING:
      return '\u26A0'; // ⚠
    case ErrorSeverity.INFO:
      return '\u2139'; // ℹ
    default:
      return '\u2022'; // •
  }
}

/**
 * Get color for error severity
 */
function getSeverityColor(
  severity: ErrorSeverity,
  c: typeof colors | Record<string, string>
): string {
  switch (severity) {
    case ErrorSeverity.ERROR:
      return c.red;
    case ErrorSeverity.WARNING:
      return c.yellow;
    case ErrorSeverity.INFO:
      return c.blue;
    default:
      return c.reset;
  }
}

/**
 * Create a simple box around text (for emphasis)
 * 
 * @param text - Text to box
 * @param useColors - Whether to use colors
 * @returns Boxed text string
 */
export function createBox(text: string, useColors: boolean = true): string {
  const c = useColors ? colors : { reset: '', dim: '', cyan: '' };
  const lines = text.split('\n');
  const maxLength = Math.max(...lines.map(l => l.length));
  
  const top = c.dim + '\u250C' + '\u2500'.repeat(maxLength + 2) + '\u2510' + c.reset;
  const bottom = c.dim + '\u2514' + '\u2500'.repeat(maxLength + 2) + '\u2518' + c.reset;
  
  const boxedLines = lines.map(line => 
    `${c.dim}\u2502${c.reset} ${line.padEnd(maxLength)} ${c.dim}\u2502${c.reset}`
  );
  
  return [top, ...boxedLines, bottom].join('\n');
}
