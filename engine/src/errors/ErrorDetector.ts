/**
 * Error Detector (Smart Error Classification)
 * 
 * Automatically detects error types and assigns correct error codes.
 * Makes the engine smart enough to classify errors without manual coding.
 * Also enriches errors with debug information for developers.
 * 
 * PHILOSOPHY:
 * ==========
 * Instead of manually throwing specific error codes everywhere,
 * the detector analyzes the error context and assigns the right code.
 * Debug information is automatically attached at detection time.
 * 
 * USAGE:
 * ======
 * ```typescript
 * // Instead of manual classification:
 * if (field === 'version') {
 *   throw SchemaError.missingField('version', 'workflow');
 * }
 * 
 * // Let detector classify automatically:
 * const error = ErrorDetector.detect({
 *   type: 'missing_field',
 *   field: 'version',
 *   location: 'workflow'
 * });
 * throw error; // Already has debug info attached!
 * ```
 * 
 * @module errors/detector
 */

import { OrbytError, type ErrorDebugInfo } from './OrbytError.js';
import { OrbytErrorCode, ErrorSeverity } from './ErrorCodes.js';
import { SchemaError, ValidationError } from './WorkflowError.js';
import { StepError } from './StepError.js';
import { SecurityError } from './SecurityErrors.js';
import { ErrorDebugger } from './ErrorDebugger.js';
import {
    RESERVED_WORKFLOW_FIELDS,
    RESERVED_CONTEXT_FIELDS,
    RESERVED_STEP_FIELDS,
    RESERVED_ANNOTATION_PREFIXES,
    // getValidFields returns the correct field list for any workflow path,
    // replacing the old manual getValidFieldsForLocation implementation.
    getValidFields,
} from './FieldRegistry.js';
import {
    // findClosestMatch — best single suggestion for the error hint
    findClosestMatch,
    // findMatches — top-N suggestions stored in context for the debugger
    findMatches,
} from './TypoDetector.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import type { WorkflowContext } from '../types/log-types.js';

/**
 * Error Detector (Smart Error Classification)
 * 
 * Automatically detects error types and assigns correct error codes.
 * Makes the engine smart enough to classify errors without manual coding.
 * Also enriches errors with debug information for developers.
 * 
 * PHILOSOPHY:
 * ==========
 * Instead of manually throwing specific error codes everywhere,
 * the detector analyzes the error context and assigns the right code.
 * Debug information is automatically attached at detection time.
 * 
 * USAGE:
 * ======
 * ```typescript
 * // Instead of manual classification:
 * if (field === 'version') {
 *   throw SchemaError.missingField('version', 'workflow');
 * }
 * 
 * // Let detector classify automatically:
 * const error = ErrorDetector.detect({
 *   type: 'missing_field',
 *   field: 'version',
 *   location: 'workflow'
 * });
 * throw error; // Already has debug info attached!
 * ```
 */
export interface ErrorContext {
    /** Type of error scenario */
    type: ErrorScenario;

    /** Field name (if applicable) */
    field?: string;

    /** Location in workflow where error occurred */
    location?: string;

    /** Expected value/type */
    expected?: string;

    /** Actual value/type received */
    actual?: string;

    /** Related data for context */
    data?: Record<string, any>;

    /** Raw error message (if from exception) */
    rawMessage?: string;

    /** Stack trace (for internal errors) */
    stack?: string;
}

/**
 * Error scenarios that detector can identify
 */
export type ErrorScenario =
    // Schema errors
    | 'unknown_field'
    | 'reserved_field'
    | 'invalid_type'
    | 'missing_field'
    | 'invalid_enum'
    | 'parse_error'
    | 'invalid_adapter'

    // Validation errors
    | 'duplicate_id'
    | 'unknown_step'
    | 'circular_dependency'
    | 'forward_reference'
    | 'empty_workflow'
    | 'missing_input'
    | 'invalid_condition'
    | 'invalid_variable'

    // Step errors
    | 'step_not_found'
    | 'step_timeout'
    | 'step_failed'
    | 'step_dependency_failed'
    | 'step_invalid_config'

    // Security errors
    | 'reserved_field_override'
    | 'reserved_annotation'
    | 'permission_denied'

    // Generic/unknown
    | 'unknown';

/**
 * Error Detector
 * 
 * Smart system that analyzes error context and produces correct OrbytError.
 */
export class ErrorDetector {
    /**
     * Detect and create appropriate error from context
     * 
     * @param context - Error context with information about what went wrong
     * @returns Properly classified OrbytError
     * 
     * @example
     * ```typescript
     * const error = ErrorDetector.detect({
     *   type: 'missing_field',
     *   field: 'version',
     *   location: 'workflow'
     * });
     * ```
     */
    /**
     * Detect error from context and enrich with debug information
     * 
     * This is the main entry point for error detection.
     * All detected errors are automatically enriched with debug info.
     * 
     * @param context - Error context
     * @returns OrbytError with debug info attached
     */
    static detect(context: ErrorContext): OrbytError {
        const logger = LoggerManager.getLogger();
        let error: OrbytError;

        logger.debug(`[ErrorDetector] Detecting error type: ${context.type}`, {
            scenario: context.type,
            field: context.field,
            location: context.location,
        });

        // Auto-detect reserved fields
        if (context.field && this.isReservedField(context.field)) {
            error = this.handleReservedField(context);
            logger.error(`[ErrorDetector] Reserved field detected: ${context.field}`, error, {
                field: context.field,
                location: context.location,
            });
            return this.enrichWithDebugInfo(error);
        }

        // Auto-detect reserved annotations
        if (context.field && this.isReservedAnnotation(context.field)) {
            error = SecurityError.reservedAnnotation(context.field, context.location || 'unknown');
            logger.error(`[ErrorDetector] Reserved annotation detected: ${context.field}`, error);
            return this.enrichWithDebugInfo(error);
        }

        // Dispatch to specific handlers based on scenario
        switch (context.type) {
            // Schema errors
            case 'unknown_field':
                error = this.handleUnknownField(context);
                break;
            case 'reserved_field':
                error = this.handleReservedField(context);
                break;
            case 'invalid_type':
                error = this.handleInvalidType(context);
                break;
            case 'missing_field':
                error = this.handleMissingField(context);
                break;
            case 'invalid_enum':
                error = this.handleInvalidEnum(context);
                break;
            case 'parse_error':
                error = this.handleParseError(context);
                break;
            case 'invalid_adapter':
                error = this.handleInvalidAdapter(context);
                break;

            // Validation errors
            case 'duplicate_id':
                error = this.handleDuplicateId(context);
                break;
            case 'unknown_step':
                error = this.handleUnknownStep(context);
                break;
            case 'circular_dependency':
                error = this.handleCircularDependency(context);
                break;
            case 'forward_reference':
                error = this.handleForwardReference(context);
                break;
            case 'empty_workflow':
                error = ValidationError.emptyWorkflow(context.location || 'workflow');
                break;
            case 'missing_input':
                error = this.handleMissingInput(context);
                break;
            case 'invalid_condition':
                error = this.handleInvalidCondition(context);
                break;
            case 'invalid_variable':
                error = this.handleInvalidVariable(context);
                break;

            // Step errors
            case 'step_not_found':
                error = StepError.notFound(context.field || 'unknown', context.location || 'unknown');
                break;
            case 'step_timeout':
                error = this.handleStepTimeout(context);
                break;
            case 'step_failed':
                error = this.handleStepFailed(context);
                break;
            case 'step_dependency_failed':
                error = this.handleStepDependencyFailed(context);
                break;
            case 'step_invalid_config':
                error = this.handleStepInvalidConfig(context);
                break;

            // Security errors
            case 'permission_denied':
                error = this.handlePermissionDenied(context);
                break;

            // Unknown/generic
            default:
                error = this.handleUnknown(context);
        }

        // Enrich with debug information before returning
        return this.enrichWithDebugInfo(error);
    }

    /**
     * Detect error from raw exception
     * Analyzes exception and tries to classify it
     *
     * @param error    - Raw error/exception
     * @param location - Where the error occurred
     * @returns Classified OrbytError with debug info
     *
    * @deprecated Since 0.5.0 — prefer {@link detectFromExceptionEnhanced} which
    *   also extracts line/column numbers from parser errors when available.
     */
    static detectFromException(error: Error, location?: string): OrbytError {
        const message = error.message.toLowerCase();
        const stack = error.stack;

        // Try to detect error type from message
        let scenario: ErrorScenario = 'unknown';

        if (message.includes('parse') || message.includes('syntax') || message.includes('malformed')) {
            scenario = 'parse_error';
        } else if (message.includes('unknown field') || message.includes('unexpected field')) {
            scenario = 'unknown_field';
        } else if (message.includes('missing') || message.includes('required')) {
            scenario = 'missing_field';
        } else if (message.includes('type') || message.includes('expected')) {
            scenario = 'invalid_type';
        } else if (message.includes('circular') || message.includes('cycle')) {
            scenario = 'circular_dependency';
        } else if (message.includes('duplicate')) {
            scenario = 'duplicate_id';
        } else if (message.includes('timeout')) {
            scenario = 'step_timeout';
        } else if (message.includes('permission') || message.includes('denied')) {
            scenario = 'permission_denied';
        }

        // Use detect() which automatically enriches with debug info
        return this.detect({
            type: scenario,
            location,
            rawMessage: error.message,
            stack,
        });
    }

    /**
     * Detect error from raw exception — enhanced variant with line/column extraction.
     *
     * Identical to {@link detectFromException} but additionally:
    * - Extracts `line` / `col` from parse errors via parser metadata when available.
     *   `linePos` property (e.g. `error.linePos[0].line`).
     * - Falls back to common message patterns: "line X, col Y", "(X:Y)".
     * - Injects position into `diagnostic.context` so formatters can show
     *   the exact location in the workflow file.
     *
     * Prefer this method over {@link detectFromException} when the original
     * exception is available and location-aware output is desired.
     *
     * @param error    - Raw error/exception from the parser or validator
     * @param location - Where the error occurred (file path or logical path)
     * @returns Classified OrbytError with line/column in `diagnostic.context`
     * @since 0.5.0
     */
    static detectFromExceptionEnhanced(error: Error, location?: string): OrbytError {
        const message = error.message.toLowerCase();
        const stack = error.stack;

        let scenario: ErrorScenario = 'unknown';

        if (message.includes('parse') || message.includes('syntax') || message.includes('malformed')) {
            scenario = 'parse_error';
        } else if (message.includes('unknown field') || message.includes('unexpected field')) {
            scenario = 'unknown_field';
        } else if (message.includes('missing') || message.includes('required')) {
            scenario = 'missing_field';
        } else if (message.includes('type') || message.includes('expected')) {
            scenario = 'invalid_type';
        } else if (message.includes('circular') || message.includes('cycle')) {
            scenario = 'circular_dependency';
        } else if (message.includes('duplicate')) {
            scenario = 'duplicate_id';
        } else if (message.includes('timeout')) {
            scenario = 'step_timeout';
        } else if (message.includes('permission') || message.includes('denied')) {
            scenario = 'permission_denied';
        }

        // For parse errors extract position so formatter can show line:col
        const position = (scenario === 'parse_error')
            ? this.extractParserPosition(error)
            : {};

        return this.detect({
            type: scenario,
            location,
            rawMessage: error.message,
            stack,
            data: { ...position },
        });
    }

    // ==================== HELPER METHODS ====================

    /**
    * Extract line and column information from a parser error.
     *
    * Some parsers attach a `linePos` array to parse errors.
     * As a fallback, common "(line X, col Y)" and "X:Y" patterns in
     * the error message are also checked.
     *
     * Only called internally for `parse_error` scenarios.
     *
    * @param error - Error object from parser/validator stages
     * @returns `{ line, col }` if found, empty object otherwise
     * @private
     */
    private static extractParserPosition(
        error: Error
    ): { line?: number; col?: number } {
        // Some parser libraries attach linePos to parse errors
        const yamlErr = error as any;
        if (Array.isArray(yamlErr.linePos) && yamlErr.linePos.length > 0) {
            const pos = yamlErr.linePos[0] as { line?: number; col?: number };
            if (typeof pos.line === 'number') {
                return { line: pos.line, col: typeof pos.col === 'number' ? pos.col : undefined };
            }
        }

        const msg = error.message;

        // "at line 5, column 3" / "line 5, col 3"
        const longMatch = msg.match(/line\s+(\d+)[,\s]+col(?:umn)?\s+(\d+)/i);
        if (longMatch) {
            return { line: parseInt(longMatch[1], 10), col: parseInt(longMatch[2], 10) };
        }

        // "(5:3)" compact form
        const compactMatch = msg.match(/\((\d+):(\d+)\)/);
        if (compactMatch) {
            return { line: parseInt(compactMatch[1], 10), col: parseInt(compactMatch[2], 10) };
        }

        // Just a line reference "at line 5"
        const lineOnly = msg.match(/(?:at )?line\s+(\d+)/i);
        if (lineOnly) {
            return { line: parseInt(lineOnly[1], 10) };
        }

        return {};
    }

    /**
     * Check if field is reserved by engine
     */
    private static isReservedField(field: string): boolean {
        return (
            (RESERVED_WORKFLOW_FIELDS as readonly string[]).includes(field) ||
            (RESERVED_CONTEXT_FIELDS as readonly string[]).includes(field) ||
            (RESERVED_STEP_FIELDS as readonly string[]).includes(field) ||
            field.startsWith('_') ||
            field.startsWith('__')
        );
    }

    /**
     * Check if annotation uses reserved namespace
     */
    private static isReservedAnnotation(annotation: string): boolean {
        return RESERVED_ANNOTATION_PREFIXES.some(prefix => annotation.startsWith(prefix));
    }

    /**
     * Determine field type for security errors
     */
    private static getFieldType(field: string): 'billing' | 'execution' | 'identity' | 'ownership' | 'usage' | 'internal' {
        if (field.includes('billing') || field.includes('price') || field.includes('cost')) {
            return 'billing';
        }
        if (field.includes('execution') || field.includes('run') || field.includes('workflow')) {
            return 'execution';
        }
        if (field.includes('user') || field.includes('org') || field.includes('owner')) {
            return 'identity';
        }
        if (field.includes('usage') || field.includes('counter') || field.includes('consumed')) {
            return 'usage';
        }
        return 'internal';
    }

    // ==================== ERROR HANDLERS ====================

    private static handleUnknownField(context: ErrorContext): OrbytError {
        const field = context.field || 'unknown';
        const location = context.location || 'unknown';

        // Look up valid fields for this path via FieldRegistry (covers all sections:
        // metadata, context, defaults, policies, retry, usage, workflow.steps[N], …)
        const validFields = this.getValidFieldsForLocation(location);

        // Best single match — drives the hint text in the error message
        const bestMatch = findClosestMatch(field, validFields, 0.6);

        // Top-3 close matches — stored in diagnostic.context so ErrorDebugger
        // can present them as concrete alternatives instead of static strings.
        const suggestions = findMatches(field, validFields, 3, 0.5);

        const error = SchemaError.unknownField(field, location, bestMatch);

        // Enrich diagnostic context with the full suggestion list.
        // diagnostic.context is a plain object so mutation is safe here.
        if (error.diagnostic.context && suggestions.length > 0) {
            (error.diagnostic.context as Record<string, unknown>).suggestions = suggestions;
        }

        return error;
    }

    /**
     * Get valid field names for a workflow path location.
     *
     * Delegates to {@link getValidFields} from FieldRegistry which uses the
     * `FIELD_REGISTRY` map and regex matching — covering `metadata`, `context`,
     * `defaults`, `policies`, `permissions`, `retry`, `usage`, `secrets`,
     * `workflow.steps`, `workflow.steps[N]`, and every other registered section.
     *
     * Falls back to ROOT_FIELDS for any unrecognised path.
     */
    private static getValidFieldsForLocation(location: string): string[] {
        return [...getValidFields(location)];
    }

    private static handleReservedField(context: ErrorContext): SecurityError {
        const field = context.field || 'unknown';
        const fieldType = this.getFieldType(field);
        return SecurityError.reservedFieldOverride(
            field,
            context.location || 'unknown',
            fieldType
        );
    }

    private static handleInvalidType(context: ErrorContext): SchemaError {
        return SchemaError.invalidType(
            context.field || 'unknown',
            context.expected || 'unknown',
            context.actual || 'unknown',
            context.location || 'unknown'
        );
    }

    private static handleMissingField(context: ErrorContext): SchemaError {
        return SchemaError.missingField(
            context.field || 'unknown',
            context.location || 'unknown'
        );
    }

    private static handleInvalidEnum(context: ErrorContext): SchemaError {
        const validValues = context.data?.validValues || [];
        return SchemaError.invalidEnum(
            context.field || 'unknown',
            context.actual || 'unknown',
            validValues,
            context.location || 'unknown'
        );
    }

    private static handleParseError(context: ErrorContext): SchemaError {
        // Accept both `column` (caller-supplied) and `col` (extracted by
        // extractParserPosition from parser metadata when available).
        const col = context.data?.column ?? context.data?.col;
        return SchemaError.parseError(
            context.location || 'unknown',
            context.data?.line,
            col,
            context.rawMessage
        );
    }

    private static handleInvalidAdapter(context: ErrorContext): SchemaError {
        return SchemaError.invalidAdapter(
            context.field || context.actual || 'unknown',
            context.location || 'unknown',
            context.data?.validAdapters
        );
    }

    private static handleDuplicateId(context: ErrorContext): ValidationError {
        return ValidationError.duplicateId(
            context.field || 'unknown',
            context.location || 'unknown',
            context.data?.firstOccurrence
        );
    }

    private static handleUnknownStep(context: ErrorContext): ValidationError {
        return ValidationError.unknownStep(
            context.field || 'unknown',
            context.location || 'unknown',
            context.data?.availableSteps
        );
    }

    private static handleCircularDependency(context: ErrorContext): ValidationError {
        const cycle = context.data?.cycle || [context.field || 'unknown'];
        return ValidationError.circularDependency(cycle, context.location || 'unknown');
    }

    private static handleForwardReference(context: ErrorContext): ValidationError {
        return ValidationError.forwardReference(
            context.field || 'unknown',
            context.data?.referencedStep || 'unknown',
            context.location || 'unknown'
        );
    }

    private static handleMissingInput(context: ErrorContext): ValidationError {
        return ValidationError.missingInput(
            context.field || 'unknown',
            context.location || 'unknown'
        );
    }

    private static handleInvalidCondition(context: ErrorContext): ValidationError {
        return ValidationError.invalidCondition(
            context.actual || context.rawMessage || 'unknown',
            context.location || 'unknown',
            context.data?.reason
        );
    }

    private static handleInvalidVariable(context: ErrorContext): ValidationError {
        return ValidationError.invalidVariable(
            context.field || 'unknown',
            context.location || 'unknown',
            context.data?.availableVars
        );
    }

    private static handleStepTimeout(context: ErrorContext): StepError {
        return StepError.timeout(
            context.field || 'unknown',
            context.location || 'unknown',
            context.data?.timeout
        );
    }

    private static handleStepFailed(context: ErrorContext): StepError {
        const error = context.rawMessage ? new Error(context.rawMessage) : new Error('Step execution failed');
        return StepError.executionFailed(
            context.field || 'unknown',
            context.location || 'unknown',
            error,
            context.data?.exitCode
        );
    }

    private static handleStepDependencyFailed(context: ErrorContext): StepError {
        return StepError.dependencyFailed(
            context.field || 'unknown',
            context.data?.dependency || 'unknown',
            context.location || 'unknown'
        );
    }

    private static handleStepInvalidConfig(context: ErrorContext): StepError {
        return StepError.invalidConfig(
            context.field || 'unknown',
            context.location || 'unknown',
            context.rawMessage
        );
    }

    private static handlePermissionDenied(context: ErrorContext): SecurityError {
        return SecurityError.permissionDenied(
            context.field || context.data?.resource || 'unknown',
            context.location || 'unknown',
            context.data?.requiredPermission
        );
    }

    private static handleUnknown(context: ErrorContext): OrbytError {
        // Use RUNTIME_INTERNAL_ERROR — an unknown error type is not a parse
        // error; it indicates an unclassified internal condition.
        return new OrbytError({
            code: OrbytErrorCode.RUNTIME_INTERNAL_ERROR,
            message: context.rawMessage || 'An unexpected error occurred',
            path: context.location,
            severity: ErrorSeverity.ERROR,
        });
    }

    /**
     * Enrich error with debug information
     * 
     * This is called automatically after error detection to attach
     * detailed debug info including explanations, fix steps, examples, etc.
     * 
     * @param error - Detected OrbytError
     * @returns Same error with debug info attached (for console display)
     * @private
     */
    private static enrichWithDebugInfo(error: OrbytError): OrbytError {
        // Use context-aware format — automatically reads WorkflowContext from
        // LoggerManager (set by WorkflowLoader after parsing) so the debug
        // output references the actual file name and field locations.
        // Falls back to generic format when no context is available.
        (error as any).__debugOutput = ErrorDebugger.formatWithContext(error);

        return error;
    }

    // ==================== DEBUG PROXY METHODS ====================
    // ErrorHandler must NOT import ErrorDebugger directly — it should always
    // reach debug capabilities through ErrorDetector (the classification layer).
    // These three methods are thin proxies; all logic stays in ErrorDebugger.

    /**
     * Analyze an error and return structured debug information.
     *
     * Proxies to `ErrorDebugger.analyzeWithContext()` — callers outside
     * this module should use this instead of calling ErrorDebugger directly
     * to respect the layer hierarchy.
     *
     * @param error       - OrbytError to analyze
     * @param workflowCtx - Optional workflow context (auto-read from LoggerManager if omitted)
     */
    static analyzeDebugInfo(error: OrbytError, workflowCtx?: WorkflowContext): ErrorDebugInfo {
        return ErrorDebugger.analyzeWithContext(error, workflowCtx);
    }

    /**
     * Format debug information for terminal display.
     *
     * Proxies to `ErrorDebugger.formatWithContext()` — use this instead of
     * importing ErrorDebugger in handler / formatter code.
     *
     * @param error       - OrbytError to format
     * @param workflowCtx - Optional workflow context (auto-read from LoggerManager if omitted)
     * @param useColors   - Whether to include ANSI color codes (default: true)
     */
    static formatDebugOutput(
        error: OrbytError,
        workflowCtx?: WorkflowContext,
        useColors: boolean = true,
    ): string {
        return ErrorDebugger.formatWithContext(error, workflowCtx, useColors);
    }

    /**
     * Return a one-line human-readable debug summary.
     *
     * Proxies to `ErrorDebugger.quickDebugWithContext()` — use this instead
     * of importing ErrorDebugger in handler / formatter code.
     *
     * @param error       - OrbytError to summarize
     * @param workflowCtx - Optional workflow context (auto-read from LoggerManager if omitted)
     */
    static quickDebugSummary(error: OrbytError, workflowCtx?: WorkflowContext): string {
        return ErrorDebugger.quickDebugWithContext(error, workflowCtx);
    }
}
