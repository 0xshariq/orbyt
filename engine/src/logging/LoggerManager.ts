import { EngineLoggerConfig, LogCategoryEnum, WorkflowContext, LogCategory, EngineLogType } from '../types/log-types.js';
import { EngineLogger, CategoryLogger } from './EngineLogger.js';
import { LogLevel } from '@dev-ecosystem/core';

/**
 * Singleton Logger Manager
 *
 * Provides centralised access to the `EngineLogger` instance without
 * needing to thread it through every constructor.
 *
 * ### Quick start
 * ```typescript
 * // Once, in the engine entry point:
 * LoggerManager.initialize({ level: LogLevel.INFO, source: 'OrbytEngine', category: 'system' });
 *
 * // Anywhere else — generic:
 * LoggerManager.getLogger().info('Hello from engine');
 *
 * // Category-pinned (preferred for new code):
 * LoggerManager.runtime.info('Step started',  { stepId });
 * LoggerManager.analysis.debug('Building plan');
 * LoggerManager.system.info('Engine ready');
 * ```
 * @module logging
 */
export class LoggerManager {
    private static instance: EngineLogger | null = null;
    private static isInitialized = false;

    // ─── Init ─────────────────────────────────────────────────────────────────

    /**
     * Initialize the logger instance (call once in the main entry point).
     * Subsequent calls are ignored and return the existing instance.
     */
    static initialize(config: EngineLoggerConfig): EngineLogger {
        if (this.isInitialized) {
            return this.instance!;
        }

        const defaultConfig: EngineLoggerConfig = {
            level: LogLevel.INFO,
            format: 'json',
            colors: true,
            timestamp: true,
            source: 'Orbyt',
            structuredEvents: true,
            category: LogCategoryEnum.SYSTEM,
        };

        const mergedConfig: EngineLoggerConfig = { ...defaultConfig, ...config };
        this.instance = new EngineLogger(mergedConfig);
        this.isInitialized = true;

        this.instance.system.info('LoggerManager initialized', {
            level: mergedConfig.level,
            format: mergedConfig.format,
            source: mergedConfig.source,
            category: mergedConfig.category,
        });

        return this.instance;
    }

    // ─── Access ───────────────────────────────────────────────────────────────

    /**
     * Get the full `EngineLogger` instance.
     * @throws if called before `initialize()`
     */
    static getLogger(): EngineLogger {
        if (!this.isInitialized || !this.instance) {
            throw new Error(
                '[LoggerManager] Logger accessed before initialization. ' +
                'Call LoggerManager.initialize() first.',
            );
        }
        return this.instance;
    }

    // ─── Category sub-logger accessors ────────────────────────────────────────

    /**
     * Category-pinned logger for **runtime** operations.
     * Use inside `run()` and step-execution paths.
     * @throws if called before `initialize()`
     */
    static get runtime(): CategoryLogger {
        return this.getLogger().runtime;
    }

    /**
     * Category-pinned logger for **analysis** operations.
     * Use inside `explain()` and `validate()` paths.
     * @throws if called before `initialize()`
     */
    static get analysis(): CategoryLogger {
        return this.getLogger().analysis;
    }

    /**
     * Category-pinned logger for **system** operations.
     * Use for engine init, shutdown, adapter registration.
     * @throws if called before `initialize()`
     */
    static get system(): CategoryLogger {
        return this.getLogger().system;
    }

    /**
     * Category-pinned logger for **security** events.
     * Use for reserved-field violations, permission rejections.
     * @throws if called before `initialize()`
     */
    static get security(): CategoryLogger {
        return this.getLogger().security;
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    /** Returns `true` if the logger has been initialized. */
    static isReady(): boolean {
        return this.isInitialized && this.instance !== null;
    }

    /** Reset the logger instance. Primarily for testing. */
    static reset(): void {
        this.instance = null;
        this.isInitialized = false;
    }

    /**
     * Export collected log history.
     * @throws if called before `initialize()`
     */
    static exportLogs() {
        if (!this.instance) {
            throw new Error('[LoggerManager] Cannot export logs — logger not initialized.');
        }
        return this.instance.exportLogs();
    }

    /**
     * Get log history as a formatted JSON string.
     * @throws if called before `initialize()`
     */
    static getJSONLogs() {
        if (!this.instance) {
            throw new Error('[LoggerManager] Cannot get JSON logs — logger not initialized.');
        }
        return this.instance.getJSONLogs();
    }

    // ─── Workflow Context ─────────────────────────────────────────────────────

    /**
     * Attach a workflow context to the logger.
     * Every subsequent log will automatically include a `workflow` field.
     *
     * Call this at the start of `run()`, `explain()`, or `validate()`
     * with fields from the parsed workflow so logs are self-describing.
     *
     * @throws if called before `initialize()`
     */
    static setWorkflowContext(ctx: WorkflowContext): void {
        this.getLogger().setWorkflowContext(ctx);
    }

    /**
     * Remove the active workflow context.
     * Call this after a run/explain/validate session completes.
     *
     * @throws if called before `initialize()`
     */
    static clearWorkflowContext(): void {
        this.getLogger().clearWorkflowContext();
    }

    /**
     * Return a snapshot of the active workflow context, or `null`.
     *
     * @throws if called before `initialize()`
     */
    static getWorkflowContext(): Readonly<WorkflowContext> | null {
        return this.getLogger().getWorkflowContext();
    }

    /**
     * Partially update the active workflow context without replacing it.
     * Merges only the supplied fields into the current context.
     *
     * Useful for enriching the context after it is first set — e.g. once the
     * engine determines the execution strategy:
     *
     * ```typescript
     * LoggerManager.patchWorkflowContext({ executionStrategy: 'parallel' });
     * ```
     *
     * @throws if called before `initialize()`
     */
    static patchWorkflowContext(partial: Partial<WorkflowContext>): void {
        this.getLogger().patchWorkflowContext(partial);
    }

    /**
     * Execute code with an execution-scoped workflow context.
     * This isolates workflow metadata across concurrent runs.
     */
    static runWithWorkflowContext<T>(ctx: WorkflowContext, fn: () => T): T {
        return this.getLogger().runWithWorkflowContext(ctx, fn);
    }

    /**
     * Query the log history with optional filters.
     *
     * ```typescript
     * // All runtime errors from the last run
     * LoggerManager.filterHistory({ category: 'runtime', withErrors: true });
     * ```
     *
     * @throws if called before `initialize()`
     */
    static filterHistory(filter: {
        category?: LogCategory;
        type?: EngineLogType;
        since?: Date;
        until?: Date;
        source?: string;
        workflowName?: string;
        withErrors?: boolean;
    } = {}) {
        return this.getLogger().filterHistory(filter);
    }

    /**
     * Return all history entries grouped by phase category.
     *
     * @throws if called before `initialize()`
     */
    static getHistoryByCategory() {
        return this.getLogger().getHistoryByCategory();
    }
}
