/**
 * Error Formatter
 * 
 * Formats Orbyt errors for CLI display with colors and helpful formatting.
 * Provides human-readable error output for developers with:
 * - Colored output for severity levels
 * - Exit code information
 * - Error category and retryability
 * - Contextual debugging information
 * - Integration with EngineLogger for proper log management
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
 * 
 * // Log error using EngineLogger
 * logErrorToEngine(error, logger);
 * ```
 * 
 * @module errors
 */

import { OrbytError } from './OrbytError.js';
import { ErrorSeverity } from './ErrorCodes.js';
import type { EngineLogger } from '../logging/EngineLogger.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import { LogLevel } from '@dev-ecosystem/core';
import type { WorkflowContext } from '../types/log-types.js';

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

/**
 * Map ErrorSeverity to LogLevel
 * Converts Orbyt's error severity to ecosystem-core's log level
 * 
 * @param severity - Error severity
 * @returns Corresponding log level
 */
export function errorSeverityToLogLevel(severity: ErrorSeverity): LogLevel {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.FATAL:
      return LogLevel.FATAL;
    case ErrorSeverity.ERROR:
      return LogLevel.ERROR;
    case ErrorSeverity.MEDIUM:
    case ErrorSeverity.LOW:
    case ErrorSeverity.WARNING:
      return LogLevel.WARN;
    case ErrorSeverity.INFO:
      return LogLevel.INFO;
    default:
      return LogLevel.ERROR;
  }
}

/**
 * Log an error to EngineLogger with proper formatting
 * 
 * This is the primary way to log errors during workflow loading and execution.
 * It maps Orbyt's ErrorSeverity to ecosystem-core's LogLevel and includes
 * all relevant context.
 * 
 * @param error - Orbyt error to log
 * @param logger - EngineLogger instance
 * @param includeDebugInfo - Whether to include full diagnostic info (default: true)
 * @deprecated Use {@link logErrorToEngineWithContext} which automatically attaches
 *   workflow file path, name, and step count to the log entry.
 */
export function logErrorToEngine(
  error: OrbytError,
  logger: EngineLogger,
  includeDebugInfo: boolean = true
): void {
  const logLevel = errorSeverityToLogLevel(error.severity);

  // Build context with error details
  const context: Record<string, unknown> = {
    errorCode: error.code,
    exitCode: error.exitCode,
    category: error.category,
    severity: error.severity,
    userError: error.isUserError,
    retryable: error.isRetryable,
  };

  // Add path if available
  if (error.path) {
    context.path = error.path;
  }

  // Add hint if available
  if (error.hint) {
    context.hint = error.hint;
  }

  // Add diagnostic context
  if (includeDebugInfo && error.diagnostic.context) {
    context.diagnostic = error.diagnostic.context;
  }

  // Log based on severity
  switch (logLevel) {
    case LogLevel.FATAL:
      logger.fatal(error.message, error, context);
      break;
    case LogLevel.ERROR:
      logger.error(error.message, error, context);
      break;
    case LogLevel.WARN:
      logger.warn(error.message, context);
      break;
    case LogLevel.INFO:
      logger.info(error.message, context);
      break;
    default:
      logger.error(error.message, error, context);
  }
}

/**
 * Log multiple errors to EngineLogger
 * 
 * @param errors - Array of Orbyt errors
 * @param logger - EngineLogger instance
 * @param includeDebugInfo - Whether to include full diagnostic info
 */
export function logErrorsToEngine(
  errors: OrbytError[],
  logger: EngineLogger,
  includeDebugInfo: boolean = true
): void {
  // Log summary first
  logger.error(`Found ${errors.length} error(s) during workflow processing`, undefined, {
    errorCount: errors.length,
    errorCodes: errors.map(e => e.code),
  });

  // Log each error
  errors.forEach((error) => {
    logErrorToEngine(error, logger, includeDebugInfo);
  });
}

/**
 * Format and log error (combined operation)
 * Returns formatted string AND logs to EngineLogger if provided
 * 
 * @param error - Orbyt error
 * @param logger - Optional EngineLogger instance
 * @param options - Formatting options
 * @returns Formatted error string
 */
export function formatAndLogError(
  error: OrbytError,
  logger?: EngineLogger,
  options?: {
    useColors?: boolean;
    verbose?: boolean;
    includeDebugInfo?: boolean;
  }
): string {
  const { useColors = true, verbose = false, includeDebugInfo = true } = options || {};

  // Log to engine if logger provided
  if (logger) {
    logErrorToEngine(error, logger, includeDebugInfo);
  }

  // Return formatted string for console/CLI
  return formatError(error, useColors, verbose);
}

// ============================================================================
// CONTEXT-AWARE FORMATTERS
// These functions use WorkflowContext (file path, line numbers) to produce
// output that points the user to the exact location in their workflow file.
// Context is auto-read from LoggerManager if not provided.
// ============================================================================

/**
 * Format error with a workflow file location header.
 *
 * Prepends a file/line block above the standard {@link formatError} output:
 *
 * ```
 * File:   /path/to/my-workflow.yaml
 * Line:   14:3          ← only present when error carries line/column info
 * Field:  steps[0].adapter   ← shown instead of Line when no line info exists
 * ✗ SchemaError [ORB-S-003]
 * ...
 * ```
 *
 * Line and column numbers come from `error.diagnostic.context.line`/`.column`,
 * which are populated by the YAML parser for syntax errors and by schema
 * validators for field-level errors.
 *
 * Workflow context is auto-read from {@link LoggerManager} when not provided.
 *
 * @param error       - Orbyt error to format
 * @param workflowCtx - Workflow context (auto-read from LoggerManager if omitted)
 * @param useColors   - Whether to use ANSI colors (default: true)
 * @param verbose     - Show additional diagnostic info (default: false)
 * @returns Formatted error string with location header
 */
export function formatErrorWithLocation(
  error: OrbytError,
  workflowCtx?: WorkflowContext,
  useColors: boolean = true,
  verbose: boolean = false
): string {
  const ctx = workflowCtx ?? LoggerManager.getWorkflowContext() ?? undefined;

  const c = useColors ? colors : {
    reset: '', bold: '', dim: '', red: '', yellow: '', blue: '', cyan: '', gray: '',
  };

  const locationLines: string[] = [];

  // File path or workflow name
  if (ctx?.filePath) {
    locationLines.push(`${c.dim}File:   ${c.cyan}${ctx.filePath}${c.reset}`);
  } else if (ctx?.name) {
    locationLines.push(`${c.dim}Source: ${c.cyan}${ctx.name}${c.reset}`);
  }

  // Line and column — set by YAML parser (parse errors) or schema validator (field errors)
  const diagCtx = error.diagnostic.context ?? {};
  const line    = (diagCtx.line   ?? diagCtx.lineNumber)   as number | undefined;
  const col     = (diagCtx.column ?? diagCtx.columnNumber) as number | undefined;

  if (line) {
    const lineRef = col ? `${line}:${col}` : String(line);
    locationLines.push(`${c.dim}Line:   ${c.yellow}${lineRef}${c.reset}`);
  } else if (error.path) {
    // No line info — fall back to the field path for schema/validation errors
    locationLines.push(`${c.dim}Field:  ${c.cyan}${error.path}${c.reset}`);
  }

  const base = formatError(error, useColors, verbose);
  return locationLines.length > 0 ? locationLines.join('\n') + '\n' + base : base;
}

/**
 * Log error to EngineLogger enriched with workflow file context.
 *
 * Same as {@link logErrorToEngine} but also attaches `sourceFile`,
 * `workflowName`, `workflowKind`, and `stepCount` to the log entry
 * when workflow context is available.
 *
 * Context is auto-read from {@link LoggerManager} — callers that load
 * workflows via {@link WorkflowLoader} already have context set, so
 * no extra wiring is needed:
 *
 * ```typescript
 * logErrorToEngineWithContext(error, logger);
 * // log entry carries: sourceFile, workflowName, stepCount automatically
 * ```
 *
 * @param error         - Orbyt error to log
 * @param logger        - EngineLogger instance
 * @param workflowCtx   - Workflow context (auto-read from LoggerManager if omitted)
 * @param includeDebugInfo - Whether to include full diagnostic info (default: true)
 */
export function logErrorToEngineWithContext(
  error: OrbytError,
  logger: EngineLogger,
  workflowCtx?: WorkflowContext,
  includeDebugInfo: boolean = true
): void {
  const ctx = workflowCtx ?? LoggerManager.getWorkflowContext() ?? undefined;

  const logLevel = errorSeverityToLogLevel(error.severity);

  const context: Record<string, unknown> = {
    errorCode:  error.code,
    exitCode:   error.exitCode,
    category:   error.category,
    severity:   error.severity,
    userError:  error.isUserError,
    retryable:  error.isRetryable,
  };

  if (error.path) context.path = error.path;
  if (error.hint) context.hint = error.hint;

  if (includeDebugInfo && error.diagnostic.context) {
    context.diagnostic = error.diagnostic.context;
  }

  // Enrich with workflow file context
  if (ctx) {
    if (ctx.filePath)          context.sourceFile   = ctx.filePath;
    if (ctx.name)              context.workflowName = ctx.name;
    if (ctx.kind)              context.workflowKind = ctx.kind;
    if (ctx.stepCount != null) context.stepCount    = ctx.stepCount;
  }

  switch (logLevel) {
    case LogLevel.FATAL: logger.fatal(error.message, error, context); break;
    case LogLevel.ERROR: logger.error(error.message, error, context); break;
    case LogLevel.WARN:  logger.warn(error.message, context);         break;
    case LogLevel.INFO:  logger.info(error.message, context);         break;
    default:             logger.error(error.message, error, context);
  }
}