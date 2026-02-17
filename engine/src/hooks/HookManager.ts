import type {
    LifecycleHook,
    WorkflowHookContext,
    StepHookContext,
    HookResult,
} from './LifecycleHooks.js';
import { LoggerManager } from '../logging/LoggerManager.js';

/**
 * HookManager - Manages and executes lifecycle hooks
 * 
 * Responsibilities:
 * - Register user-defined hooks
 * - Execute hooks at appropriate lifecycle moments
 * - Handle hook errors gracefully
 * - Maintain hook execution order
 * 
 * Design principles:
 * - Hooks run sequentially (not parallel) for predictability
 * - Hook errors are isolated - one failing hook doesn't break the workflow
 * - Hooks can be async (awaited)
 * - Hook failures are logged but don't stop execution (unless configured)
 * 
 * @example
 * ```ts
 * const manager = new HookManager();
 * 
 * manager.register({
 *   async afterStep(ctx) {
 *     console.log('Step done:', ctx.stepName);
 *   }
 * });
 * 
 * await manager.run('afterStep', stepContext);
 * ```
 */
export class HookManager {
    private hooks: LifecycleHook[] = [];
    private failOnHookError: boolean = false;

    constructor(options?: { failOnHookError?: boolean }) {
        this.failOnHookError = options?.failOnHookError ?? false;
    }

    /**
     * Register a lifecycle hook
     * 
     * @param hook - The hook implementation
     */
    register(hook: LifecycleHook): void {
        this.hooks.push(hook);
        LoggerManager.getLogger().debug('Lifecycle hook registered', {
            hookCount: this.hooks.length,
        });
    }

    /**
     * Register multiple hooks at once
     * 
     * @param hooks - Array of hook implementations
     */
    registerMany(hooks: LifecycleHook[]): void {
        this.hooks.push(...hooks);
        LoggerManager.getLogger().debug('Multiple lifecycle hooks registered', {
            count: hooks.length,
            totalHooks: this.hooks.length,
        });
    }

    /**
     * Remove a specific hook
     * 
     * @param hook - The hook to remove
     */
    unregister(hook: LifecycleHook): void {
        const index = this.hooks.indexOf(hook);
        if (index !== -1) {
            this.hooks.splice(index, 1);
        }
    }

    /**
     * Clear all registered hooks
     */
    clear(): void {
        this.hooks = [];
    }

    /**
     * Execute a specific hook type for all registered hooks
     * 
     * @param type - The hook method name to execute
     * @param ctx - Context to pass to the hook
     * @param error - Optional error (for onError hook)
     * @returns Array of hook results
     */
    async run(
        type: keyof LifecycleHook,
        ctx: WorkflowHookContext | StepHookContext,
        error?: Error
    ): Promise<HookResult[]> {
        const results: HookResult[] = [];

        for (const hook of this.hooks) {
            const hookFn = hook[type];
            if (!hookFn) {
                continue;
            }

            try {
                // Execute hook with appropriate arguments
                if (type === 'onError') {
                    await (hookFn as any)(ctx, error);
                } else if (type === 'onRetry' && 'attempt' in ctx) {
                    const stepCtx = ctx as StepHookContext;
                    await (hookFn as any)(ctx, stepCtx.attempt, 3); // TODO: get maxAttempts from config
                } else {
                    await (hookFn as any)(ctx);
                }

                results.push({ success: true });
            } catch (err) {
                const hookError = err instanceof Error ? err : new Error(String(err));
                results.push({
                    success: false,
                    error: hookError,
                    hookName: hook.constructor?.name || 'AnonymousHook',
                });

                console.error(`[HookManager] Hook '${type}' failed:`, hookError);

                // If configured to fail on hook errors, rethrow
                if (this.failOnHookError) {
                    throw new Error(
                        `Hook '${type}' failed: ${hookError.message}`,
                        { cause: hookError }
                    );
                }
            }
        }

        return results;
    }

    /**
     * Execute beforeWorkflow hooks
     */
    async runBeforeWorkflow(ctx: WorkflowHookContext): Promise<HookResult[]> {
        return this.run('beforeWorkflow', ctx);
    }

    /**
     * Execute afterWorkflow hooks
     */
    async runAfterWorkflow(ctx: WorkflowHookContext): Promise<HookResult[]> {
        return this.run('afterWorkflow', ctx);
    }

    /**
     * Execute beforeStep hooks
     */
    async runBeforeStep(ctx: StepHookContext): Promise<HookResult[]> {
        return this.run('beforeStep', ctx);
    }

    /**
     * Execute afterStep hooks
     */
    async runAfterStep(ctx: StepHookContext): Promise<HookResult[]> {
        return this.run('afterStep', ctx);
    }

    /**
     * Execute onError hooks
     */
    async runOnError(
        ctx: WorkflowHookContext | StepHookContext,
        error: Error
    ): Promise<HookResult[]> {
        return this.run('onError', ctx, error);
    }

    /**
     * Execute onRetry hooks
     */
    async runOnRetry(ctx: StepHookContext): Promise<HookResult[]> {
        return this.run('onRetry', ctx);
    }

    /**
     * Execute onPause hooks
     */
    async runOnPause(ctx: WorkflowHookContext): Promise<HookResult[]> {
        return this.run('onPause', ctx);
    }

    /**
     * Execute onResume hooks
     */
    async runOnResume(ctx: WorkflowHookContext): Promise<HookResult[]> {
        return this.run('onResume', ctx);
    }

    /**
     * Get count of registered hooks
     */
    count(): number {
        return this.hooks.length;
    }

    /**
     * Check if any hooks are registered
     */
    hasHooks(): boolean {
        return this.hooks.length > 0;
    }

    /**
     * Get list of hook types that have implementations
     * 
     * @returns Array of hook type names that are implemented
     */
    getImplementedHooks(): (keyof LifecycleHook)[] {
        const implemented = new Set<keyof LifecycleHook>();

        for (const hook of this.hooks) {
            const keys = Object.keys(hook) as (keyof LifecycleHook)[];
            keys.forEach((key) => implemented.add(key));
        }

        return Array.from(implemented);
    }
}
