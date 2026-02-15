/**
 * Error Handler (Automatic Error Management)
 * 
 * Central error handling system that orchestrates detection, logging, and execution control.
 * Designed to work automatically without manual error handling in engine.
 * 
 * ARCHITECTURE:
 * =============
 * - AUTOMATIC in Engine: Errors are auto-detected and classified
 * - MANUAL in CLI/API/SDK: Use ErrorHandler explicitly for custom handling
 * - INTEGRATED with WorkflowLoader: Validates and detects errors on load
 * 
 * EXECUTION CONTROL:
 * ==================
 * Based on severity, automatically determines what to do:
 * - CRITICAL/FATAL → Stop entire workflow immediately
 * - ERROR → Stop entire workflow
 * - MEDIUM → Stop current step, try next step
 * - LOW/WARNING/INFO → Log and continue
 * 
 * USAGE:
 * ======
 * ```typescript
 * // In Engine (automatic):
 * try {
 *   await executeStep(step);
 * } catch (error) {
 *   const result = await ErrorHandler.handle(error, {
 *     location: `steps[${index}]`,
 *     stepId: step.id
 *   });
 *   
 *   if (result.shouldStopWorkflow) {
 *     throw result.error;
 *   }
 *   if (result.shouldStopStep) {
 *     continue; // Skip to next step
 *   }
 *   // Continue current step
 * }
 * 
 * // In CLI/API (manual):
 * try {
 *   const workflow = await WorkflowLoader.fromFile(path);
 * } catch (error) {
 *   const result = await ErrorHandler.handle(error, { location: path });
 *   console.error(result.debug?.formatted);
 *   process.exit(result.error.exitCode);
 * }
 * ```
 * 
 * @module errors/handler
 */

import { OrbytError } from './OrbytError.js';
import { ErrorDetector, type ErrorContext } from './ErrorDetector.js';
import { ErrorDebugger } from './ErrorDebugger.js';
import { formatDetailedError } from './ErrorFormatter.js';
import {
    ErrorSeverity,
    ExecutionControl,
    getExecutionControl,
    shouldStopWorkflow,
    shouldStopStep,
} from './ErrorCodes.js';

/**
 * Error handling result
 * Contains all information needed to make execution decisions
 */
export interface ErrorHandlingResult {
    /** The detected and classified OrbytError */
    error: OrbytError;

    /** Execution control action (STOP_WORKFLOW, STOP_STEP, CONTINUE) */
    control: ExecutionControl;

    /** Should stop entire workflow execution? */
    shouldStopWorkflow: boolean;

    /** Should stop current step execution? */
    shouldStopStep: boolean;

    /** Can continue execution? */
    shouldContinue: boolean;

    /** Debug information with solutions */
    debug?: {
        /** Plain English explanation */
        explanation: string;
        /** Root cause analysis */
        cause: string;
        /** Step-by-step fix instructions */
        fixSteps: string[];
        /** Quick one-line fix */
        quickFix: string;
        /** Formatted output for CLI display */
        formatted: string;
        /** Detailed output with all diagnostics */
        detailed: string;
        /** Common mistakes that lead to this error */
        commonMistakes?: string[];
        /** Estimated time to fix */
        estimatedFixTime?: string;
    };

    /** Log entry (what was logged to console/logger) */
    logEntry?: {
        level: 'error' | 'warn' | 'info';
        message: string;
        metadata: Record<string, any>;
        timestamp: Date;
    };
}

/**
 * Error handler configuration options
 */
export interface ErrorHandlerOptions {
    /** Enable automatic logging to console/logger (default: true) */
    enableLogging?: boolean;

    /** Enable debug info generation for troubleshooting (default: false in engine, true in CLI) */
    enableDebug?: boolean;

    /** Use colored output for terminal (default: true) */
    useColors?: boolean;

    /** Custom logger implementation (defaults to console) */
    logger?: {
        error: (message: string, meta?: any) => void;
        warn: (message: string, meta?: any) => void;
        info: (message: string, meta?: any) => void;
    };

    /** Additional context to include in logs */
    context?: Record<string, any>;
}

/**
 * Error Handler
 * 
 * Unified error handling system for Orbyt engine.
 * Automatically detects, classifies, logs, and controls execution based on errors.
 */
export class ErrorHandler {
    /**
     * Handle any error - the main entry point
     * 
     * Automatically:
     * 1. Detects and classifies error type
     * 2. Determines severity level
     * 3. Logs appropriately
     * 4. Generates debug info (if enabled)
     * 5. Returns execution control decision
     * 
     * @param error - Any error (OrbytError, Error, string, or error context)
     * @param errorContext - Context about where error occurred
     * @param options - Configuration options
     * @returns Complete error handling result with execution decisions
     * 
     * @example
     * ```typescript
     * // Automatic handling in engine
     * const result = await ErrorHandler.handle(error, {
     *   location: 'workflow.steps[2]',
     *   stepId: 'fetch-data'
     * });
     * 
     * if (result.shouldStopWorkflow) {
     *   throw result.error; // Stop execution
     * }
     * ```
     */
    static async handle(
        error: unknown,
        errorContext?: Partial<ErrorContext>,
        options: ErrorHandlerOptions = {}
    ): Promise<ErrorHandlingResult> {
        const {
            enableLogging = true,
            enableDebug = false,
            useColors = true,
            logger = console,
            context = {},
        } = options;

        // STEP 1: Detect and classify error → OrbytError
        const orbytError = this.detectError(error, errorContext);

        // STEP 2: Determine execution control based on severity
        const control = getExecutionControl(orbytError.severity);
        const stopWorkflow = shouldStopWorkflow(orbytError.severity);
        const stopStep = shouldStopStep(orbytError.severity);
        const continueExecution = control === ExecutionControl.CONTINUE;

        // STEP 3: Log error if logging is enabled
        let logEntry: ErrorHandlingResult['logEntry'] | undefined;
        if (enableLogging) {
            logEntry = this.logError(orbytError, logger, context);
        }

        // STEP 4: Generate debug information if enabled
        let debug: ErrorHandlingResult['debug'] | undefined;
        if (enableDebug) {
            debug = this.generateDebugInfo(orbytError, useColors);
        }

        // STEP 5: Return complete result
        return {
            error: orbytError,
            control,
            shouldStopWorkflow: stopWorkflow,
            shouldStopStep: stopStep,
            shouldContinue: continueExecution,
            debug,
            logEntry,
        };
    }

    /**
     * Handle error from WorkflowLoader
     * Special handling for load-time errors with file path context
     * 
     * @param error - Error from loader
     * @param filePath - Path to workflow file being loaded
     * @param options - Handler options
     * @returns Error handling result
     */
    static async handleLoaderError(
        error: unknown,
        filePath: string,
        options: ErrorHandlerOptions = {}
    ): Promise<ErrorHandlingResult> {
        return this.handle(error, {
            location: filePath,
            type: this.detectLoaderErrorType(error),
        }, {
            ...options,
            enableDebug: true, // Always enable debug for loader errors
        });
    }

    /**
     * Handle error from context object
     * When you already know the error type and have context
     * 
     * @param context - Error context with type and data
     * @param options - Handler options
     * @returns Error handling result
     * 
     * @example
     * ```typescript
     * const result = await ErrorHandler.handleContext({
     *   type: 'missing_field',
     *   field: 'version',
     *   location: 'workflow'
     * });
     * ```
     */
    static async handleContext(
        context: ErrorContext,
        options: ErrorHandlerOptions = {}
    ): Promise<ErrorHandlingResult> {
        const error = ErrorDetector.detect(context);
        return this.handle(error, context, options);
    }

    /**
     * Quick handle - simplified for common use cases
     * Returns just a boolean: should stop execution?
     * 
     * @param error - Error to handle
     * @param location - Where error occurred
     * @returns True if should stop execution, false if can continue
     * 
     * @example
     * ```typescript
     * if (await ErrorHandler.shouldStop(error, 'workflow.steps[2]')) {
     *   throw error; // Stop execution
     * }
     * // Continue execution
     * ```
     */
    static async shouldStop(error: unknown, location?: string): Promise<boolean> {
        const result = await this.handle(error, { location }, {
            enableLogging: true,
            enableDebug: false
        });
        return result.shouldStopWorkflow;
    }

    /**
     * Batch handle multiple errors
     * Useful for validation that collects multiple errors
     * 
     * @param errors - Array of errors
     * @param options - Handler options
     * @returns Array of handling results
     */
    static async handleBatch(
        errors: unknown[],
        options: ErrorHandlerOptions = {}
    ): Promise<ErrorHandlingResult[]> {
        const results = await Promise.all(
            errors.map(error => this.handle(error, undefined, options))
        );
        return results;
    }

    /**
     * Get most severe error from batch
     * Returns the error that should take precedence
     * 
     * @param results - Array of error handling results
     * @returns Most severe error result
     */
    static getMostSevere(results: ErrorHandlingResult[]): ErrorHandlingResult | undefined {
        if (results.length === 0) return undefined;

        const severityOrder = [
            ErrorSeverity.CRITICAL,
            ErrorSeverity.FATAL,
            ErrorSeverity.ERROR,
            ErrorSeverity.MEDIUM,
            ErrorSeverity.LOW,
            ErrorSeverity.WARNING,
            ErrorSeverity.INFO,
        ];

        return results.reduce((mostSevere, current) => {
            const currentIndex = severityOrder.indexOf(current.error.severity);
            const mostSevereIndex = severityOrder.indexOf(mostSevere.error.severity);
            return currentIndex < mostSevereIndex ? current : mostSevere;
        });
    }

    /**
     * Check if any errors in batch should stop workflow
     * 
     * @param results - Array of error handling results
     * @returns True if any error should stop workflow
     */
    static shouldStopWorkflowForBatch(results: ErrorHandlingResult[]): boolean {
        return results.some(result => result.shouldStopWorkflow);
    }

    // ==================== PRIVATE HELPERS ====================

    /**
     * Detect and classify error into OrbytError
     */
    private static detectError(
        error: unknown,
        context?: Partial<ErrorContext>
    ): OrbytError {
        // Already an OrbytError - return as-is
        if (error instanceof OrbytError) {
            return error;
        }

        // Standard Error - try to classify
        if (error instanceof Error) {
            return ErrorDetector.detectFromException(error, context?.location);
        }

        // Error context object - detect from context
        if (typeof error === 'object' && error !== null && 'type' in error) {
            return ErrorDetector.detect(error as ErrorContext);
        }

        // String error message - create generic error
        if (typeof error === 'string') {
            return ErrorDetector.detect({
                type: 'unknown',
                rawMessage: error,
                location: context?.location,
            });
        }

        // Unknown error type - create generic error
        return ErrorDetector.detect({
            type: 'unknown',
            rawMessage: String(error),
            location: context?.location,
        });
    }

    /**
     * Detect error type from WorkflowLoader errors
     */
    private static detectLoaderErrorType(error: unknown): ErrorContext['type'] {
        if (!(error instanceof Error)) return 'unknown';

        const message = error.message.toLowerCase();

        if (message.includes('file not found') || message.includes('enoent')) {
            return 'unknown'; // Will be classified as RUNTIME_FILE_NOT_FOUND
        }

        if (message.includes('yaml') || message.includes('syntax')) {
            return 'parse_error';
        }

        if (message.includes('json')) {
            return 'parse_error';
        }

        if (message.includes('reserved field')) {
            return 'reserved_field';
        }

        if (message.includes('unknown field')) {
            return 'unknown_field';
        }

        if (message.includes('missing') || message.includes('required')) {
            return 'missing_field';
        }

        return 'unknown';
    }

    /**
     * Log error with appropriate level
     */
    private static logError(
        error: OrbytError,
        logger: ErrorHandlerOptions['logger'],
        context: Record<string, any>
    ): ErrorHandlingResult['logEntry'] {
        const metadata = {
            code: error.code,
            exitCode: error.exitCode,
            severity: error.severity,
            path: error.path,
            category: error.category,
            isUserError: error.isUserError,
            isRetryable: error.isRetryable,
            hint: error.hint,
            context: error.diagnostic.context,
            ...context,
        };

        const message = `[${error.code}] ${error.message}`;
        const timestamp = new Date();

        // Log based on severity
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
            case ErrorSeverity.FATAL:
            case ErrorSeverity.ERROR:
                logger?.error?.(message, metadata);
                return { level: 'error', message, metadata, timestamp };

            case ErrorSeverity.MEDIUM:
            case ErrorSeverity.LOW:
            case ErrorSeverity.WARNING:
                logger?.warn?.(message, metadata);
                return { level: 'warn', message, metadata, timestamp };

            case ErrorSeverity.INFO:
                logger?.info?.(message, metadata);
                return { level: 'info', message, metadata, timestamp };

            default:
                logger?.error?.(message, metadata);
                return { level: 'error', message, metadata, timestamp };
        }
    }

    /**
     * Generate complete debug information
     */
    private static generateDebugInfo(
        error: OrbytError,
        useColors: boolean
    ): ErrorHandlingResult['debug'] {
        const debugInfo = ErrorDebugger.analyze(error);
        const formatted = ErrorDebugger.format(error, useColors);
        const detailed = formatDetailedError(error, useColors);
        const quickFix = ErrorDebugger.quickDebug(error);

        return {
            explanation: debugInfo.explanation,
            cause: debugInfo.cause,
            fixSteps: debugInfo.fixSteps,
            quickFix,
            formatted,
            detailed,
            commonMistakes: debugInfo.commonMistakes,
            estimatedFixTime: debugInfo.estimatedFixTime,
        };
    }
}

/**
 * Global error handler instance for convenience
 * Can be used for setting default options
 */
export class GlobalErrorHandler {
    private static defaultOptions: ErrorHandlerOptions = {
        enableLogging: true,
        enableDebug: false,
        useColors: true,
    };

    /**
     * Configure default options for all error handling
     */
    static configure(options: Partial<ErrorHandlerOptions>): void {
        this.defaultOptions = { ...this.defaultOptions, ...options };
    }

    /**
     * Handle error with default options
     */
    static async handle(
        error: unknown,
        context?: Partial<ErrorContext>
    ): Promise<ErrorHandlingResult> {
        return ErrorHandler.handle(error, context, this.defaultOptions);
    }

    /**
     * Get current default options
     */
    static getOptions(): ErrorHandlerOptions {
        return { ...this.defaultOptions };
    }
}
