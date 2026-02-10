/**
 * Lifecycle Hooks - User-level extensibility points
 * 
 * While EventBus is for engine-internal communication and observability,
 * hooks provide user-facing extensibility to inject custom logic into
 * the workflow execution lifecycle.
 * 
 * Difference between Events and Hooks:
 * 
 * Events (Engine-level):
 * - Emitted by engine components
 * - For observability, logging, metrics
 * - Multiple independent listeners
 * - Fire-and-forget
 * 
 * Hooks (User-level):
 * - Registered by users/plugins
 * - For extending behavior
 * - Sequential execution
 * - Can modify context or interrupt flow
 */

/**
 * Context passed to workflow-level hooks
 */
export interface WorkflowHookContext {
  workflowId: string;
  workflowName: string;
  runId: string;
  triggeredBy?: string;
  inputs?: Record<string, any>;
  env?: Record<string, string>;
  metadata?: Record<string, any>;
  startTime: number;
}

/**
 * Context passed to step-level hooks
 */
export interface StepHookContext {
  workflowId: string;
  workflowName: string;
  runId: string;
  stepId: string;
  stepName: string;
  adapterType: string;
  attempt: number;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

/**
 * Lifecycle hook interface
 * 
 * All methods are optional - implement only what you need.
 * All methods are async to support I/O operations.
 * 
 * @example
 * ```ts
 * const loggingHook: LifecycleHook = {
 *   async afterStep(ctx) {
 *     console.log(`Step ${ctx.stepName} completed`);
 *   }
 * };
 * 
 * const notificationHook: LifecycleHook = {
 *   async afterWorkflow(ctx) {
 *     await sendSlackMessage(`Workflow ${ctx.workflowName} done!`);
 *   },
 *   async onError(ctx, error) {
 *     await sendAlert(`Workflow failed: ${error.message}`);
 *   }
 * };
 * ```
 */
export interface LifecycleHook {
  /**
   * Called before workflow execution begins
   * Use for: validation, setup, initialization
   */
  beforeWorkflow?(ctx: WorkflowHookContext): Promise<void> | void;

  /**
   * Called after workflow completes successfully
   * Use for: cleanup, notifications, reporting
   */
  afterWorkflow?(ctx: WorkflowHookContext): Promise<void> | void;

  /**
   * Called before each step executes
   * Use for: logging, metrics, preparation
   */
  beforeStep?(ctx: StepHookContext): Promise<void> | void;

  /**
   * Called after each step completes successfully
   * Use for: logging, metrics, validation
   */
  afterStep?(ctx: StepHookContext): Promise<void> | void;

  /**
   * Called when a workflow or step fails
   * Use for: error handling, alerts, recovery
   */
  onError?(ctx: WorkflowHookContext | StepHookContext, error: Error): Promise<void> | void;

  /**
   * Called when a step is retrying
   * Use for: logging retry attempts, backoff notifications
   */
  onRetry?(ctx: StepHookContext, attempt: number, maxAttempts: number): Promise<void> | void;

  /**
   * Called when a workflow is paused
   * Use for: state persistence, notifications
   */
  onPause?(ctx: WorkflowHookContext): Promise<void> | void;

  /**
   * Called when a workflow is resumed
   * Use for: state restoration, notifications
   */
  onResume?(ctx: WorkflowHookContext): Promise<void> | void;
}

/**
 * Hook execution result
 */
export interface HookResult {
  success: boolean;
  error?: Error;
  hookName?: string;
}
