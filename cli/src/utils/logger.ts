/**
 * CLI Logger
 * 
 * Provides structured logging for the Orbyt CLI using ecosystem-core utilities.
 * Supports multiple output formats and log levels with proper filtering.
 * 
 * Features:
 * - Severity-based log level filtering using LogLevelSeverity
 * - Multiple output formats (pretty, text, json, structured)
 * - Color support with ANSI codes
 * - Context and error tracking
 * - Performance measurement with automatic severity adjustment
 * - Efficient level comparison using numeric severity
 * 
 * @module utils
 */

import {
    LogLevel,
    LogLevelSeverity,
    formatLog,
    createLogEntry,
    type LogEntry,
} from '@dev-ecosystem/core';

/**
 * CLI log format type
 */
export type CliLogFormat = 'json' | 'text' | 'pretty' | 'structured';

/**
 * CLI log context (key-value pairs)
 */
export type CliLogContext = Record<string, unknown>;

/**
 * CLI Logger configuration
 */
export interface CliLoggerConfig {
    /** Minimum log level to output */
    level: LogLevel;

    /** Output format */
    format: CliLogFormat;

    /** Enable colors in output */
    colors: boolean;

    /** Include timestamps */
    timestamps: boolean;

    /** CLI-specific context */
    context?: CliLogContext;
}

/**
 * CLI Logger class
 * 
 * Wraps ecosystem-core logging utilities for CLI-specific use.
 * Uses LogLevelSeverity for efficient severity-based filtering.
 */
export class CliLogger {
    private config: CliLoggerConfig;
    private logHistory: LogEntry[] = [];

    constructor(config: Partial<CliLoggerConfig> = {}) {
        this.config = {
            level: config.level ?? LogLevel.INFO,
            format: config.format ?? 'pretty',
            colors: config.colors ?? true,
            timestamps: config.timestamps ?? false,
            context: config.context ?? {},
        };
    }

    // ==================== Core Logging Methods ====================

    /**
     * Log a message at the specified level (uses severity-based filtering)
     */
    log(level: LogLevel, message: string, context?: CliLogContext): void {
        if (!this.shouldLogLevel(level)) {
            return;
        }

        const entry = createLogEntry(level, message, {
            context: { ...this.config.context, ...context },
        });

        this.logHistory.push(entry);
        this.output(entry);
    }

    /**
     * Log debug message
     */
    debug(message: string, context?: CliLogContext): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    /**
     * Log info message
     */
    info(message: string, context?: CliLogContext): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Log warning message
     */
    warn(message: string, context?: CliLogContext): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Log error message
     */
    error(message: string, error?: Error, context?: CliLogContext): void {
        const errorContext = error
            ? { ...context, error: { message: error.message, stack: error.stack, name: error.name } }
            : context;
        this.log(LogLevel.ERROR, message, errorContext);
    }

    /**
     * Log fatal error message
     */
    fatal(message: string, error?: Error, context?: CliLogContext): void {
        const errorContext = error
            ? { ...context, error: { message: error.message, stack: error.stack, name: error.name } }
            : context;
        this.log(LogLevel.FATAL, message, errorContext);
    }

    // ==================== Severity-Based Methods ====================

    /**
     * Check if a log level should be output based on severity (performance-optimized)
     */
    private shouldLogLevel(level: LogLevel): boolean {
        return LogLevelSeverity[level] >= LogLevelSeverity[this.config.level];
    }

    /**
     * Check if one level is more severe than another
     */
    isMoreSevere(level: LogLevel, compareWith: LogLevel): boolean {
        return LogLevelSeverity[level] > LogLevelSeverity[compareWith];
    }

    /**
     * Get numeric severity difference between two levels
     */
    getSeverityDiff(level1: LogLevel, level2: LogLevel): number {
        return LogLevelSeverity[level1] - LogLevelSeverity[level2];
    }

    /**
     * Get severity value for a log level
     */
    getSeverity(level: LogLevel): number {
        return LogLevelSeverity[level];
    }

    /**
     * Get current log level numeric severity
     */
    getCurrentSeverity(): number {
        return LogLevelSeverity[this.config.level];
    }

    /**
     * Set log level by numeric severity (0-4)
     */
    setLevelBySeverity(severity: number): void {
        const levels = Object.entries(LogLevelSeverity)
            .filter(([_, value]) => typeof value === 'number')
            .find(([_, value]) => value === severity);

        if (levels) {
            this.config.level = levels[0] as LogLevel;
        }
    }

    // ==================== Convenience Methods ====================

    /**
     * Check if debug logging is enabled
     */
    isDebugEnabled(): boolean {
        return this.shouldLogLevel(LogLevel.DEBUG);
    }

    /**
     * Check if info logging is enabled
     */
    isInfoEnabled(): boolean {
        return this.shouldLogLevel(LogLevel.INFO);
    }

    /**
     * Check if warn logging is enabled
     */
    isWarnEnabled(): boolean {
        return this.shouldLogLevel(LogLevel.WARN);
    }

    /**
     * Check if error logging is enabled
     */
    isErrorEnabled(): boolean {
        return this.shouldLogLevel(LogLevel.ERROR);
    }

    /**
     * Check if a specific level will be logged
     */
    willLog(level: LogLevel): boolean {
        return this.shouldLogLevel(level);
    }

    // ==================== Advanced Logging Methods ====================

    /**
     * Log with custom level
     */
    logWithLevel(level: LogLevel, message: string, context?: CliLogContext): void {
        this.log(level, message, context);
    }

    /**
     * Log message only if severity meets minimum threshold
     */
    logIfSeverity(minSeverity: number, level: LogLevel, message: string, context?: CliLogContext): void {
        if (LogLevelSeverity[level] >= minSeverity) {
            this.log(level, message, context);
        }
    }

    /**
     * Measure execution time of async function with threshold-based log levels
     * 
     * Automatically selects log level based on execution duration:
     * - > error threshold: ERROR
     * - > warn threshold: WARN
     * - Otherwise: INFO (or DEBUG if info is disabled)
     */
    async measureExecution<T>(
        label: string,
        fn: () => Promise<T>,
        thresholds?: { warn?: number; error?: number }
    ): Promise<T> {
        const start = Date.now();

        try {
            const result = await fn();
            const duration = Date.now() - start;

            // Select log level based on duration thresholds
            let level = LogLevel.DEBUG;
            if (thresholds?.error && duration > thresholds.error) {
                level = LogLevel.ERROR;
            } else if (thresholds?.warn && duration > thresholds.warn) {
                level = LogLevel.WARN;
            } else if (this.isInfoEnabled()) {
                level = LogLevel.INFO;
            }

            this.log(level, `${label} completed`, { duration: `${duration}ms` });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.error(`${label} failed`, error as Error, { duration: `${duration}ms` });
            throw error;
        }
    }

    // ==================== Configuration Methods ====================

    /**
     * Update logger configuration
     */
    configure(config: Partial<CliLoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Set minimum log level
     */
    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    /**
     * Set output format
     */
    setFormat(format: CliLogFormat): void {
        this.config.format = format;
    }

    /**
     * Enable/disable colors
     */
    setColors(enabled: boolean): void {
        this.config.colors = enabled;
    }

    /**
     * Enable/disable timestamps
     */
    setTimestamps(enabled: boolean): void {
        this.config.timestamps = enabled;
    }

    /**
     * Set context that will be included in all logs
     */
    setContext(context: CliLogContext): void {
        this.config.context = context;
    }

    /**
     * Merge additional context into existing context
     */
    addContext(context: CliLogContext): void {
        this.config.context = { ...this.config.context, ...context };
    }

    /**
     * Get current configuration
     */
    getConfig(): Readonly<CliLoggerConfig> {
        return { ...this.config };
    }

    // ==================== Utility Methods ====================

    /**
     * Get log history (for debugging)
     */
    getHistory(): ReadonlyArray<LogEntry> {
        return [...this.logHistory];
    }

    /**
     * Clear log history
     */
    clearHistory(): void {
        this.logHistory = [];
    }

    /**
     * Get log count by level
     */
    getCountByLevel(level: LogLevel): number {
        return this.logHistory.filter(entry => entry.level === level).length;
    }

    /**
     * Output formatted log entry
     */
    private output(entry: LogEntry): void {
        const formatted = formatLog(entry, {
            format: this.config.format,
            colors: this.config.colors,
            timestamp: this.config.timestamps,
        });

        // Write to stderr for errors/warnings, stdout for others
        const output = this.isMoreSevere(entry.level, LogLevel.WARN)
            ? console.error
            : console.log;

        output(formatted);
    }
}

/**
 * Create a default CLI logger instance
 */
export function createCliLogger(config?: Partial<CliLoggerConfig>): CliLogger {
    return new CliLogger(config);
}

/**
 * Default logger instance for CLI (singleton pattern)
 */
let defaultLogger: CliLogger | null = null;

/**
 * Get or create the default CLI logger
 */
export function getCliLogger(): CliLogger {
    if (!defaultLogger) {
        defaultLogger = createCliLogger();
    }
    return defaultLogger;
}

/**
 * Set the default CLI logger
 */
export function setDefaultCliLogger(logger: CliLogger): void {
    defaultLogger = logger;
}

// ==================== JSON Formatting Helpers for JSONFormatter ====================

/**
 * Format CLI event as JSON string
 * 
 * Used by JsonFormatter to output events in NDJSON format.
 * Each event is a single line of JSON output.
 */
export function formatJsonEvent(event: unknown, verbose = false): string {
    const eventObj = event && typeof event === 'object' ? event as Record<string, unknown> : {};
    const jsonEvent = {
        ...eventObj,
        timestamp: event && typeof event === 'object' && 'timestamp' in event
            ? (event as any).timestamp.toISOString()
            : new Date().toISOString(),
    };

    return verbose
        ? JSON.stringify(jsonEvent, null, 2)
        : JSON.stringify(jsonEvent);
}

/**
 * Format workflow result as JSON string
 * 
 * Used by JsonFormatter to output final workflow result.
 */
export function formatJsonResult(result: unknown, verbose = false): string {
    // Convert Map stepResults to plain object for JSON serialization
    if (result && typeof result === 'object' && 'stepResults' in result) {
        const resultObj = result as any;
        const stepResultsArray: Array<[string, any]> = [];

        if (resultObj.stepResults instanceof Map) {
            for (const [key, value] of resultObj.stepResults.entries()) {
                stepResultsArray.push([key, value]);
            }
        }

        const jsonResult = {
            ...resultObj,
            stepResults: Object.fromEntries(stepResultsArray),
            error: resultObj.error ? {
                message: resultObj.error.message,
                name: resultObj.error.name,
                stack: verbose ? resultObj.error.stack : undefined,
            } : undefined,
        };

        return verbose
            ? JSON.stringify(jsonResult, null, 2)
            : JSON.stringify(jsonResult);
    }

    return verbose
        ? JSON.stringify(result, null, 2)
        : JSON.stringify(result);
}

/**
 * Format error as JSON string
 * 
 * Used by JsonFormatter to output errors in structured format.
 */
export function formatJsonError(error: Error): string {
    const jsonError = {
        type: 'error',
        timestamp: new Date().toISOString(),
        error: {
            message: error.message,
            name: error.name,
            stack: error.stack,
        },
    };

    return JSON.stringify(jsonError, null, 2);
}
