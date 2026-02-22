import { EngineLoggerConfig, LogCategoryEnum } from '../types/log-types.js';
import { EngineLogger } from './EngineLogger.js';
import { LogLevel } from '@dev-ecosystem/core';

/**
 * Singleton Logger Manager
 * 
 * Provides centralized access to the EngineLogger instance without
 * needing to pass it through constructors.
 * 
 * Usage:
 * ```typescript
 * // In main entry point (OrbytEngine)
 * const mapLogLevel = (level: LogLevel): CoreLogLevel => {
       const mapping: Record<LogLevel, CoreLogLevel> = {
         'debug': CoreLogLevel.DEBUG,
         'info': CoreLogLevel.INFO,
         'warn': CoreLogLevel.WARN,
         'error': CoreLogLevel.ERROR,
         'silent': CoreLogLevel.FATAL,
       };
       return mapping[level] || CoreLogLevel.INFO;
     };
// Initialize logger with engine-specific configuration
 * LoggerManager.initialize({ level: mapLogLevel(this.config.logLevel),  format: 'text',  colors: true,  timestamp: true,  source: 'OrbytEngine',  structuredEvents: true,  category: 'system', });
 * 
 * // In any other file (parsers, executors, validators, etc.)
 * const logger = LoggerManager.getLogger();
 * logger.parsingStarted('MyWorkflow.yaml');
 * ```
 */
export class LoggerManager {
    private static instance: EngineLogger | null = null;
    private static isInitialized = false;

    /**
     * Initialize the logger instance (call once in main entry point)
     */
    static initialize(config: EngineLoggerConfig): EngineLogger {
        if (this.isInitialized) {
            console.warn('[LoggerManager] Logger already initialized. Returning existing instance.');
            return this.instance!;
        }

        const defaultConfig: EngineLoggerConfig = {
            level: LogLevel.INFO,
            format: 'text',
            colors: true,
            timestamp: true,
            source: 'Orbyt',
            structuredEvents: true,
            category: LogCategoryEnum.SYSTEM
        };

        // Merge extra arguments
        const mergedConfig = { ...defaultConfig, ...config };
        this.instance = new EngineLogger(mergedConfig);
        this.isInitialized = true;

        this.instance.info(
            'LoggerManager initialized',
            {
                config: {
                    level: mergedConfig.level,
                    format: mergedConfig.format,
                    structuredEvents: mergedConfig.structuredEvents,
                    category: mergedConfig.category,
                    source: mergedConfig.source,
                },
            },
            mergedConfig.category,
            mergedConfig.source
        );

        return this.instance;
    }

    /**
     * Get the logger instance (accessible from anywhere)
     * 
     * @throws Error if logger not initialized
     */
    static getLogger(): EngineLogger {
        if (!this.isInitialized || !this.instance) {
            throw new Error('[LoggerManager] Logger accessed before initialization. Please call LoggerManager.initialize() with required source and category.');
        }
        return this.instance;
    }

    /**
     * Check if logger is initialized
     */
    static isReady(): boolean {
        return this.isInitialized && this.instance !== null;
    }

    /**
     * Reset the logger instance (useful for testing)
     */
    static reset(): void {
        this.instance = null;
        this.isInitialized = false;
    }

    /**
     * Get logs without needing direct logger access
     * All logs are categorized and sourced.
     */
    static exportLogs() {
        if (!this.instance) {
            throw new Error('[LoggerManager] Cannot export logs - logger not initialized');
        }
        return this.instance.exportLogs();
    }

    /**
     * Get JSON logs without needing direct logger access
     * All logs are categorized and sourced.
     */
    static getJSONLogs() {
        if (!this.instance) {
            throw new Error('[LoggerManager] Cannot get JSON logs - logger not initialized');
        }
        return this.instance.getJSONLogs();
    }
}
