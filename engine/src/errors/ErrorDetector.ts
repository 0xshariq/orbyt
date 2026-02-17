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

import { OrbytError } from './OrbytError.js';
import { SchemaError, ValidationError } from './WorkflowError.js';
import { StepError } from './StepError.js';
import { SecurityError } from './SecurityErrors.js';
import { ErrorDebugger } from './ErrorDebugger.js';
import {
    RESERVED_WORKFLOW_FIELDS,
    RESERVED_CONTEXT_FIELDS,
    RESERVED_STEP_FIELDS,
    RESERVED_ANNOTATION_PREFIXES,
    ROOT_FIELDS,
    WORKFLOW_FIELDS,
    STEP_FIELDS,
    CONTEXT_FIELDS,
    METADATA_FIELDS
} from './FieldRegistry.js';
import { findClosestMatch } from './TypoDetector.js';
import { LoggerManager } from '../logging/LoggerManager.js';

/**
 * Error context for detection
 * Provides information about what went wrong
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
     * @param error - Raw error/exception
     * @param location - Where the error occurred
     * @returns Classified OrbytError with debug info
     */
    static detectFromException(error: Error, location?: string): OrbytError {
        const message = error.message.toLowerCase();
        const stack = error.stack;

        // Try to detect error type from message
        let scenario: ErrorScenario = 'unknown';

        if (message.includes('yaml') || message.includes('parse') || message.includes('syntax')) {
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

    // ==================== HELPER METHODS ====================

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

        // Get valid fields based on location
        const validFields = this.getValidFieldsForLocation(location);

        // Use TypoDetector to find closest match
        const suggestion = findClosestMatch(field, validFields, 0.6);

        return SchemaError.unknownField(field, location, suggestion);
    }

    /**
     * Get valid field names based on location in workflow
     */
    private static getValidFieldsForLocation(location: string): string[] {
        const locationLower = location.toLowerCase();

        // Root level fields
        if (locationLower === 'workflow' || locationLower.startsWith('workflow.')) {
            if (locationLower.includes('steps[') || locationLower.includes('.step')) {
                return [...STEP_FIELDS];
            }
            if (locationLower.includes('context')) {
                return [...CONTEXT_FIELDS];
            }
            if (locationLower.includes('metadata')) {
                return [...METADATA_FIELDS];
            }
            return [...ROOT_FIELDS, ...WORKFLOW_FIELDS];
        }

        // Step fields
        if (locationLower.includes('step')) {
            return [...STEP_FIELDS];
        }

        // Default: return all common fields
        return [
            ...ROOT_FIELDS,
            ...WORKFLOW_FIELDS,
            ...STEP_FIELDS,
            ...CONTEXT_FIELDS,
            ...METADATA_FIELDS
        ];
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
        return SchemaError.parseError(
            context.location || 'unknown',
            context.data?.line,
            context.data?.column,
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
        // Create generic schema error for unknown cases
        return SchemaError.parseError(
            context.location || 'unknown',
            undefined,
            undefined,
            context.rawMessage || 'Unknown error occurred'
        );
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
        // Generate and store formatted debug output for console display
        // This is done here so it's available when needed in WorkflowLoader
        (error as any).__debugOutput = ErrorDebugger.format(error);

        return error;
    }
}
