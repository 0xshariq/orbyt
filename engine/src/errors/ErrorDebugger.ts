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

import { OrbytError, type ErrorDebugInfo } from './OrbytError.js';
import { OrbytErrorCode } from './ErrorCodes.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import type { WorkflowContext } from '../types/log-types.js';

// ErrorDebugInfo is defined in OrbytError.ts (Layer 0) and imported above.
// Re-export so any code that previously imported it directly from this module
// still compiles without changes.
export type { ErrorDebugInfo };

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
  /**
   * @deprecated Use {@link analyzeWithContext} which enriches fix steps with
   *   real workflow file context (file name, step count, field locations).
   *   Falls back identically when no context exists.
   */
  static analyze(error: OrbytError): ErrorDebugInfo {
    const logger = LoggerManager.getLogger();

    logger.debug(`[ErrorDebugger] Analyzing error: ${error.code}`, {
      code: error.code,
      message: error.message,
      path: error.path,
    });
    
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
  /**
   * @deprecated Use {@link formatWithContext} which shows the workflow file name
   *   in the header and context-specific fix steps.
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

      // ── Schema errors ──────────────────────────────────────────────────────

      [OrbytErrorCode.SCHEMA_PARSE_ERROR]: {
        explanation: 'Your .orbt workflow definition has a parse/shape error that prevents loader validation.',
        cause: 'The parser encountered malformed serialized content or invalid structure.',
        fixSteps: [
          'Open the .orbt workflow source and inspect malformed serialized sections',
          'Check for missing commas, braces, or quotes',
          'Ensure required fields exist with valid values',
          'Re-validate through WorkflowLoader before execution',
        ],
        commonMistakes: [
          'Malformed serialized object punctuation',
          'Invalid field names from older schema variants',
          'Incorrectly escaped strings',
          'Unclosed strings or brackets',
        ],
        estimatedFixTime: '2-5 minutes',
      },

      [OrbytErrorCode.SCHEMA_INVALID_TYPE]: {
        explanation: 'A field in your workflow has the wrong value type.',
        cause: 'The schema expects a specific type (string, number, boolean, array, or object) but received something different.',
        fixSteps: [
          'Check that the field value matches the expected type shown in the error',
          'Wrap string values in quotes if they look like numbers or booleans',
          'Use square brackets for array values: `tags: [a, b, c]`',
        ],
        estimatedFixTime: '1-2 minutes',
      },

      [OrbytErrorCode.SCHEMA_INVALID_ENUM]: {
        explanation: 'A field contains a value that is not one of the allowed options.',
        cause: 'Orbyt validates enum fields strictly — only the specific listed values are accepted.',
        fixSteps: [
          'Replace the current value with one of the valid options listed in the error',
          'Check spelling and casing — enum values are case-sensitive',
        ],
        commonMistakes: [
          'Using similar but wrong words (e.g. "Workflow" instead of "workflow")',
          'Wrong casing (e.g. "Sequential" instead of "sequential")',
        ],
        estimatedFixTime: '1 minute',
      },

      // ── Validation errors ───────────────────────────────────────────────────

      [OrbytErrorCode.VALIDATION_UNKNOWN_STEP]: {
        explanation: 'A step references another step that does not exist in this workflow.',
        cause: 'The `needs` (or `dependsOn`) field references a step ID that is not defined anywhere in the workflow.',
        fixSteps: [
          'Check the step ID spelling in the `needs` field',
          'Make sure the referenced step is defined somewhere in the workflow',
          'List all step IDs in the file to confirm none are missing',
        ],
        commonMistakes: [
          'Referencing a step by its `name` instead of its `id`',
          'Typos in step IDs',
        ],
        estimatedFixTime: '1-2 minutes',
      },

      [OrbytErrorCode.VALIDATION_FORWARD_REFERENCE]: {
        explanation: 'A step references another step that is defined later in the workflow.',
        cause: 'Steps can only depend on steps defined before them — Orbyt resolves dependencies top-to-bottom.',
        fixSteps: [
          'Move the referenced step definition above the step that depends on it',
          'Or restructure the dependency so the earlier step does not need the later one',
        ],
        estimatedFixTime: '2-5 minutes',
      },

      [OrbytErrorCode.VALIDATION_EMPTY_WORKFLOW]: {
        explanation: 'Your workflow has no steps defined.',
        cause: 'The `workflow.steps` array is empty or missing, so there is nothing to execute.',
        fixSteps: [
          'Add at least one step to the `workflow.steps` array',
          'Each step needs at minimum an `id` and a `uses` field',
        ],
        example: {
          description: 'Minimal valid step:',
          code: 'workflow:\n  steps:\n    - id: my-step\n      uses: shell.run\n      with:\n        command: echo hello',
        },
        estimatedFixTime: '2-5 minutes',
      },

      [OrbytErrorCode.VALIDATION_MISSING_INPUT]: {
        explanation: 'A required input value is missing.',
        cause: 'The workflow or one of its steps requires an input that was not provided at runtime.',
        fixSteps: [
          'Pass the missing input when invoking the workflow',
          'Or define a default value for it in the workflow `inputs` section',
        ],
        estimatedFixTime: '1-2 minutes',
      },

      [OrbytErrorCode.VALIDATION_INVALID_CONDITION]: {
        explanation: 'A step `when` condition expression is not valid.',
        cause: 'The `when` field contains an expression that cannot be evaluated by the Orbyt condition engine.',
        fixSteps: [
          'Use simple comparisons: `$input.value == "yes"`',
          'Make sure every variable referenced in the condition is defined',
          'Check for typos in variable names',
        ],
        commonMistakes: [
          'Referencing undefined variables',
          'Using unsupported operators or JavaScript syntax',
        ],
        estimatedFixTime: '2-5 minutes',
      },

      [OrbytErrorCode.VALIDATION_INVALID_VARIABLE]: {
        explanation: 'A variable reference in the workflow cannot be resolved.',
        cause: 'The workflow references a variable that is not defined in `inputs`, `context`, or the `outputs` of an earlier step.',
        fixSteps: [
          'Check the variable name for typos',
          'Make sure the variable is defined before the step that uses it',
          'Add it to the workflow `inputs` section if it is a runtime parameter',
        ],
        estimatedFixTime: '2-5 minutes',
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

      // For unknown field errors: show top-3 similar names from FieldRegistry.
      // These come from findMatches() stored by ErrorDetector.handleUnknownField.
      if (ctx.suggestions && Array.isArray(ctx.suggestions) && ctx.suggestions.length > 0) {
        const list = (ctx.suggestions as string[]).map(s => `"${s}"`).join(', ');
        fixSteps.push(`Closest valid fields at this location: ${list}`);
      } else if (ctx.suggestion) {
        // Fallback: single suggestion from SchemaError.unknownField hint
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

      // For parse errors: surface the line:col position when available.
      // Populated by extractYAMLPosition inside ErrorDetector.
      const line = (ctx.line ?? ctx.lineNumber) as number | undefined;
      const col  = (ctx.column ?? ctx.col ?? ctx.columnNumber) as number | undefined;
      if (typeof line === 'number') {
        fixSteps.push(
          `Syntax error at line ${line}${typeof col === 'number' ? `, column ${col}` : ''}`
        );
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
  /**
   * @deprecated Use {@link quickDebugWithContext} which references the actual workflow file.
   */
  static quickDebug(error: OrbytError): string {
    const debug = this.analyze(error);
    return `💡 ${debug.fixSteps[0] || debug.cause}`;
  }

  // ==================== CONTEXT-AWARE METHODS ====================
  // These methods pull WorkflowContext (file name, step count, kind) from
  // LoggerManager automatically — no manual wiring required by callers.

  /**
   * Analyze error with workflow file context for precise, file-specific fix suggestions.
   *
   * Automatically reads {@link WorkflowContext} from {@link LoggerManager} when no
   * context is provided — so the typical call is simply:
   *
   * ```typescript
   * const debug = ErrorDebugger.analyzeWithContext(error);
   * // fixSteps now say: "Open my-workflow.yaml and add `version:`"
   * ```
   *
   * Falls back to the generic {@link analyze} result when no context is available.
   *
   * @param error       - OrbytError to analyze
   * @param workflowCtx - Workflow context (auto-read from LoggerManager if omitted)
   * @returns Debug information with context-specific fix suggestions
   */
  static analyzeWithContext(error: OrbytError, workflowCtx?: WorkflowContext): ErrorDebugInfo {
    const ctx: WorkflowContext | null = workflowCtx ?? LoggerManager.getWorkflowContext();

    if (!ctx) {
      return this.analyze(error);
    }

    const base          = this.analyze(error);
    const enrichedSteps = this.buildContextualFixSteps(error, ctx, base.fixSteps);
    const enrichedCause = this.buildContextualCause(error, ctx) ?? base.cause;

    return {
      ...base,
      cause:    enrichedCause,
      fixSteps: enrichedSteps,
    };
  }

  /**
   * Format debug information using workflow file context.
   *
   * Same visual layout as {@link format} but:
   * - Header line shows the workflow file name
   * - "How to fix" steps reference the actual file and field names
   *
   * Automatically reads context from {@link LoggerManager} if none is provided.
   *
   * @param error       - Error to format
   * @param workflowCtx - Workflow context (auto-read from LoggerManager if omitted)
   * @param useColors   - Whether to use ANSI colors (default: true)
   * @returns Formatted debug output with context-aware suggestions
   */
  static formatWithContext(
    error: OrbytError,
    workflowCtx?: WorkflowContext,
    useColors: boolean = true
  ): string {
    const ctx   = workflowCtx ?? LoggerManager.getWorkflowContext() ?? undefined;
    const debug = ctx ? this.analyzeWithContext(error, ctx) : this.analyze(error);

    const c = useColors ? {
      reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
      blue: '\x1b[34m', cyan: '\x1b[36m', yellow: '\x1b[33m',
      green: '\x1b[32m', red: '\x1b[31m',
    } : {
      reset: '', bold: '', dim: '', blue: '', cyan: '', yellow: '', green: '', red: '',
    };

    const lines: string[] = [];

    // Header — include workflow file name when available
    if (ctx?.filePath || ctx?.name) {
      const label = ctx.filePath ? (ctx.filePath.split('/').pop() ?? ctx.filePath) : ctx.name;
      lines.push(`${c.bold}${c.blue}━━━━ DEBUG INFO ━━━━${c.reset} ${c.dim}(${label})${c.reset}`);
    } else {
      lines.push(`${c.bold}${c.blue}━━━━ DEBUG INFO ━━━━${c.reset}`);
    }
    lines.push('');

    lines.push(`${c.bold}What went wrong:${c.reset}`);
    lines.push(debug.explanation);
    lines.push('');

    lines.push(`${c.bold}Why it happened:${c.reset}`);
    lines.push(debug.cause);
    lines.push('');

    lines.push(`${c.bold}${c.green}How to fix:${c.reset}`);
    debug.fixSteps.forEach((step, i) => {
      lines.push(`${c.cyan}${i + 1}.${c.reset} ${step}`);
    });

    if (debug.commonMistakes && debug.commonMistakes.length > 0) {
      lines.push('');
      lines.push(`${c.bold}${c.yellow}Common mistakes:${c.reset}`);
      debug.commonMistakes.forEach(m => lines.push(`${c.dim}•${c.reset} ${m}`));
    }

    if (debug.example) {
      lines.push('');
      lines.push(`${c.bold}Example:${c.reset}`);
      lines.push(`${c.dim}${debug.example.description}${c.reset}`);
      lines.push('');
      lines.push(c.dim + '```' + c.reset);
      lines.push(debug.example.code);
      lines.push(c.dim + '```' + c.reset);
    }

    if (debug.estimatedFixTime) {
      lines.push('');
      lines.push(`${c.dim}⏱  Estimated fix time: ${debug.estimatedFixTime}${c.reset}`);
    }

    return lines.join('\n');
  }

  /**
   * One-line context-aware summary — like {@link quickDebug} but references
   * the actual workflow file when available.
   *
   * @param error       - Error to summarize
   * @param workflowCtx - Workflow context (auto-read from LoggerManager if omitted)
   * @returns One-line debug summary
   */
  static quickDebugWithContext(error: OrbytError, workflowCtx?: WorkflowContext): string {
    const debug = this.analyzeWithContext(error, workflowCtx);
    return `💡 ${debug.fixSteps[0] || debug.cause}`;
  }

  // ==================== PRIVATE CONTEXT HELPERS ====================

  /**
   * Build context-aware fix steps using real workflow metadata.
   *
   * Combines `error.path`, `error.diagnostic.context` (field, suggestion,
   * valid values, cycle, line, column), and the workflow context (file name,
   * step count, kind) to produce precise, file-specific instructions.
   *
   * Falls back to `baseSteps` for error codes without a specific rule.
   *
   * @private
   */
  private static buildContextualFixSteps(
    error: OrbytError,
    ctx: WorkflowContext,
    baseSteps: string[]
  ): string[] {
    const steps: string[] = [];

    const fileName = ctx.filePath ? (ctx.filePath.split('/').pop() ?? ctx.filePath) : undefined;
    const fileRef  = fileName ? `\`${fileName}\`` : (ctx.name ? `"${ctx.name}"` : 'the workflow file');
    const label    = ctx.name  ? `"${ctx.name}"` : fileRef;

    const diagCtx     = error.diagnostic.context ?? {};
    const field       = (diagCtx.field       as string   | undefined) ?? error.path ?? '';
    const suggestion  = (diagCtx.suggestion  as string   | undefined);
    const validValues = (diagCtx.validValues as string[] | undefined);
    const expected    = (diagCtx.expected    as string   | undefined);
    const cycle       = (diagCtx.cycle       as string[] | undefined);
    const line        = (diagCtx.line        ?? diagCtx.lineNumber)   as number | undefined;
    const col         = (diagCtx.column      ?? diagCtx.columnNumber) as number | undefined;

    switch (error.code) {

      case OrbytErrorCode.SCHEMA_UNKNOWN_FIELD:
        if (field)      steps.push(`Open ${fileRef} and remove or rename the unrecognized field \`${field}\``);
        if (suggestion) steps.push(`Did you mean \`${suggestion}\`? Rename it in ${fileRef}`);
        steps.push('Refer to the schema docs for all valid field names at this location');
        break;

      case OrbytErrorCode.SCHEMA_MISSING_FIELD:
        if (field) {
          steps.push(`Open ${fileRef} and add the missing \`${field}:\` field`);
          if (error.path) steps.push(`It belongs under: \`${error.path}\``);
        } else {
          steps.push(`Open ${fileRef} and add the required field mentioned above`);
        }
        break;

      case OrbytErrorCode.SCHEMA_INVALID_TYPE:
        if (field && expected) steps.push(`In ${fileRef}, change \`${field}\` to type \`${expected}\``);
        else if (field)        steps.push(`In ${fileRef}, check the value type of \`${field}\``);
        break;

      case OrbytErrorCode.SCHEMA_INVALID_ENUM:
        if (field) steps.push(`In ${fileRef}, update \`${field}\` to an allowed value`);
        if (validValues && validValues.length > 0)
          steps.push(`Valid options: ${validValues.map(v => `\`${v}\``).join(', ')}`);
        break;

      case OrbytErrorCode.SCHEMA_RESERVED_FIELD:
        if (field) {
          steps.push(`In ${fileRef}, rename or remove the reserved field \`${field}\``);
          steps.push('Fields prefixed with `_` are managed by the engine — do not set them manually');
        }
        break;

      case OrbytErrorCode.VALIDATION_DUPLICATE_ID:
        if (field) {
          const stepRef = ctx.stepCount != null ? ` across ${ctx.stepCount} steps` : '';
          steps.push(`In ${label}${stepRef}, search for every step using id \`${field}\` in ${fileRef}`);
          steps.push('Rename all but one to a unique id');
        }
        break;

      case OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY:
        steps.push(`In ${label}, break the circular dependency chain in ${fileRef}`);
        if (cycle && cycle.length > 0) {
          steps.push(`Cycle: ${cycle.map(s => `\`${s}\``).join(' → ')}`);
          steps.push(`Remove the \`needs\`/\`dependsOn\` from \`${cycle[cycle.length - 1]}\` back to \`${cycle[0]}\``);
        }
        break;

      case OrbytErrorCode.VALIDATION_UNKNOWN_STEP:
        if (field)
          steps.push(`In ${fileRef}, verify that step \`${field}\` is defined before it is referenced`);
        break;

      case OrbytErrorCode.VALIDATION_FORWARD_REFERENCE:
        if (field)
          steps.push(`In ${fileRef}, move the definition of step \`${field}\` above where it is first used`);
        break;

      case OrbytErrorCode.VALIDATION_EMPTY_WORKFLOW:
        steps.push(`Open ${fileRef} and add at least one step under the \`steps:\` key`);
        if (ctx.kind) steps.push(`A \`${ctx.kind}\` workflow requires at least one step to be valid`);
        break;

      case OrbytErrorCode.SCHEMA_PARSE_ERROR:
        steps.push(`Open ${fileRef} and inspect serialized .orbt structure for syntax issues`);
        if (line)
          steps.push(`Syntax error near line ${line}${col ? `, column ${col}` : ''} in ${fileRef}`);
        steps.push('Common causes: malformed commas/braces, invalid escaping, unclosed quotes');
        break;

      default:
        return baseSteps;
    }

    // Append the full file path as a reference if it hasn't been mentioned yet
    if (ctx.filePath && steps.length > 0 && !steps.some(s => s.includes(ctx.filePath!))) {
      steps.push(`File: ${ctx.filePath}`);
    }

    return steps.length > 0 ? steps : baseSteps;
  }

  /**
   * Build a context-aware root-cause sentence using workflow metadata.
   *
   * Returns `null` when the generic cause from {@link getBaseDebugInfo} is
   * already adequate — callers should fall back to the base value in that case.
   *
   * @private
   */
  private static buildContextualCause(error: OrbytError, ctx: WorkflowContext): string | null {
    const label     = ctx.name ? `"${ctx.name}"` : 'this workflow';
    const stepCount = ctx.stepCount != null ? `(${ctx.stepCount} steps)` : '';
    const diagCtx   = error.diagnostic.context ?? {};
    const cycle     = diagCtx.cycle as string[] | undefined;

    switch (error.code) {

      case OrbytErrorCode.VALIDATION_CIRCULAR_DEPENDENCY:
        return cycle && cycle.length > 0
          ? `${label} ${stepCount} has a step dependency cycle: ${cycle.map(s => `\`${s}\``).join(' → ')}`
          : `${label} ${stepCount} contains a circular step dependency`;

      case OrbytErrorCode.VALIDATION_DUPLICATE_ID: {
        const field = (diagCtx.field as string | undefined) ?? error.path ?? 'unknown';
        return `${label} ${stepCount} contains two or more steps with the id \`${field}\``;
      }

      case OrbytErrorCode.VALIDATION_EMPTY_WORKFLOW:
        return `${label} has no steps defined${ctx.kind ? ` — a \`${ctx.kind}\` workflow requires at least one` : ''}`;

      case OrbytErrorCode.SCHEMA_PARSE_ERROR:
        return ctx.filePath
          ? `The .orbt workflow definition in "${ctx.filePath.split('/').pop()}" has a syntax error and could not be parsed`
          : null;

      default:
        return null;
    }
  }
}
