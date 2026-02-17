import { EngineLoggerConfig } from '../types/log-types.js';
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
 * LoggerManager.initialize({ enableJsonLogs: true });
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
    static initialize(config?: EngineLoggerConfig): EngineLogger {
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
        };

        this.instance = new EngineLogger(config || defaultConfig);
        this.isInitialized = true;

        this.instance.info('LoggerManager initialized', {
            config: {
                level: config?.level || 'info',
                format: config?.format || 'text',
                structuredEvents: config?.structuredEvents ?? true,
            },
        });

        return this.instance;
    }

    /**
     * Get the logger instance (accessible from anywhere)
     * 
     * @throws Error if logger not initialized
     */
    static getLogger(): EngineLogger {
        if (!this.isInitialized || !this.instance) {
            // Auto-initialize with defaults if not explicitly initialized
            console.warn('[LoggerManager] Logger accessed before initialization. Auto-initializing with defaults.');
            return this.initialize();
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
     */
    static exportLogs() {
        if (!this.instance) {
            throw new Error('[LoggerManager] Cannot export logs - logger not initialized');
        }
        return this.instance.exportLogs();
    }

    /**
     * Get JSON logs without needing direct logger access
     */
    static getJSONLogs() {
        if (!this.instance) {
            throw new Error('[LoggerManager] Cannot get JSON logs - logger not initialized');
        }
        return this.instance.getJSONLogs();
    }
}
