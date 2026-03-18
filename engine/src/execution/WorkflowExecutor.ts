/**
 * Workflow Executor
 * 
 * Orchestrates complete workflow execution:
 * - Creates execution plan
 * - Executes steps in phases (with parallelism)
 * - Manages step outputs and context
 * - Handles workflow-level errors and timeouts
 * 
 * @module execution
 */

import { StepExecutor } from './StepExecutor.js';
import { ExecutionPlanner } from './ExecutionPlan.js';
import { createExecutionNode } from './ExecutionNode.js';
import { WorkflowGuard } from '../guards/WorkflowGuard.js';
import { StepGuard } from '../guards/StepGuard.js';
import { ContextStore } from '../context/ContextStore.js';
import type { EventBus } from '../events/EventBus.js';
import type { HookManager } from '../hooks/HookManager.js';
import { createEvent } from '../events/EngineEvents.js';
import type { WorkflowHookContext } from '../hooks/LifecycleHooks.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import { EngineEventType, type ExecutionNode, type ExecutionOptions, type ExecutionPlan, type ParsedStep, type ParsedWorkflow, type ResolutionContext, type StepResult, type WorkflowResult } from '../types/core-types.js';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { ExecutionStore } from '../storage/ExecutionStore.js';
import { CheckpointStore, type CheckpointReason, type CheckpointWorkflowStatus, type ExecutionCheckpointSnapshot, type StepSnapshot } from '../storage/CheckpointStore.js';

/**
 * Workflow executor
 */
export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private executionId: string;
  private contextStore?: ContextStore;
  private eventBus?: EventBus;
  private hookManager?: HookManager;
  private stateDir: string = join(process.cwd(), '.orbyt', 'executions');
  private checkpointDir: string = join(process.cwd(), '.orbyt', 'checkpoints');

  constructor(stepExecutor: StepExecutor) {
    this.stepExecutor = stepExecutor;
    this.executionId = this.generateExecutionId();
  }

  /**
   * Set event bus for emitting workflow lifecycle events
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Set hook manager for calling lifecycle hooks
   */
  setHookManager(hookManager: HookManager): void {
    this.hookManager = hookManager;
  }

  /**
   * Set the directory where execution state JSON files are written.
   * Defaults to <cwd>/.orbyt/executions
   */
  setStateDir(dir: string): void {
    this.stateDir = dir;
    this.checkpointDir = join(dir, '..', 'checkpoints');
  }

  /**
   * Execute a complete workflow
   * 
   * @param workflow - Parsed workflow
   * @param options - Execution options
   * @returns Workflow execution result
   */
  async execute(
    workflow: ParsedWorkflow,
    options: ExecutionOptions = {}
  ): Promise<WorkflowResult> {
    // Use original run ID for resumed workflows, otherwise generate a new run ID.
    this.executionId = options.resumeFromRunId || this.generateExecutionId();

    const startedAt = new Date();
    const workflowStart = performance.now();
    const stepResults = new Map<string, StepResult>();
    const workflowName = workflow.metadata?.name || workflow.name || 'unnamed';

    // Initialise state store (best-effort — never throws)
    const stateStore = new ExecutionStore(this.stateDir);
    stateStore.begin(this.executionId, workflowName, startedAt);
    const checkpointStore = new CheckpointStore(this.checkpointDir);

    // Log workflow execution started
    LoggerManager.getLogger().workflowStarted(workflowName, {
      executionId: this.executionId,
      triggeredBy: options.triggeredBy,
      inputCount: options.inputs ? Object.keys(options.inputs).length : 0,
      stepCount: workflow.steps.length,
    });

    // Validate workflow
    this.validateWorkflow(workflow);

    // Create ContextStore for this execution
    this.contextStore = this.createContextStore(workflow, options);

    let resumed = false;
    if (options.resumeFromRunId) {
      resumed = this.tryRestoreFromCheckpoint(
        checkpointStore,
        options.resumeFromRunId,
        workflow,
        stepResults,
        options.resumePolicy ?? 'strict',
      );
    }

    // Log workflow inputs
    const logger = LoggerManager.getLogger();
    if (options.inputs) {
      for (const [key, value] of Object.entries(options.inputs)) {
        if (!key.startsWith('_')) {
          logger.inputProcessed(key, value, 'workflow.inputs');
        }
      }
    }

    // Log workflow context
    if (options.context) {
      for (const [key, value] of Object.entries(options.context)) {
        if (!key.startsWith('_')) {
          logger.fieldExecution('context', key, value);
        }
      }
    }

    // Create hook context
    const hookContext: WorkflowHookContext = {
      workflowId: workflow.name || this.executionId,
      workflowName,
      runId: this.executionId,
      triggeredBy: options.triggeredBy,
      inputs: options.inputs,
      env: options.env,
      metadata: workflow.metadata,
      startTime: startedAt.getTime(),
    };

    // Emit workflow.started event
    if (this.eventBus) {
      await this.eventBus.emit(createEvent(
        EngineEventType.WORKFLOW_STARTED,
        {
          workflowId: workflow.name || this.executionId,
          workflowName,
          runId: this.executionId,
          triggeredBy: options.triggeredBy,
          inputs: options.inputs,
        },
        {
          workflowId: workflow.name || this.executionId,
          runId: this.executionId,
        }
      ));
    }

    if (resumed && this.eventBus) {
      await this.eventBus.emit(createEvent(
        EngineEventType.WORKFLOW_RESUMED,
        {
          workflowId: workflow.name || this.executionId,
          workflowName,
          runId: this.executionId,
          triggeredBy: options.triggeredBy,
        },
        {
          workflowId: workflow.name || this.executionId,
          runId: this.executionId,
        }
      ));
    }

    // Call onResume hook after checkpoint restoration and resume event emission.
    if (resumed && this.hookManager) {
      await this.hookManager.runOnResume(hookContext);
    }

    // Call beforeWorkflow hook
    if (this.hookManager) {
      await this.hookManager.runBeforeWorkflow(hookContext);
    }

    // Configure StepExecutor with ContextStore
    this.stepExecutor.setContextStore(this.contextStore);

    // Save baseline checkpoint at workflow start.
    this.saveCheckpoint(
      checkpointStore,
      workflow,
      'running',
      stepResults,
      this.contextStore.getResolutionContext(),
      startedAt,
      resumed ? 'workflow-resumed' : 'workflow-started',
    );

    // Convert ParsedStep[] to ExecutionNode[] for planning
    const executionNodes = this.convertToExecutionNodes(workflow.steps);

    // Create step lookup map for execution
    const stepMap = new Map(workflow.steps.map(s => [s.id, s]));

    // Create execution plan
    const plan = ExecutionPlanner.plan(executionNodes);

    // Log execution plan details
    logger.info(`[Plan] Execution plan created with ${plan.phases.length} phase(s)`, {
      totalPhases: plan.phases.length,
      totalSteps: workflow.steps.length,
      maxParallelism: plan.maxParallelism,
    });

    // Get context from ContextStore
    const context = this.contextStore.getResolutionContext();

    // Execute with timeout if specified
    try {
      const timeout = options.timeout || (workflow.defaults?.timeout ? this.parseTimeoutString(workflow.defaults.timeout) : undefined);

      if (timeout) {
        await this.executeWithTimeout(
          workflow,
          plan,
          context,
          stepResults,
          options,
          stepMap,
          timeout,
          checkpointStore,
          startedAt,
        );
      } else {
        await this.executeWorkflowPlan(
          workflow,
          plan,
          context,
          stepResults,
          options,
          stepMap,
          checkpointStore,
          startedAt,
        );
      }

      const completedAt = new Date();
      const result = this.buildResult(
        workflow,
        stepResults,
        'success',
        startedAt,
        completedAt,
        plan,
        undefined,
        Math.round(performance.now() - workflowStart)
      );

      // Persist final state
      stateStore.finalize(
        this.executionId,
        'completed',
        completedAt,
        Array.from(stepResults.values()),
        Math.round(performance.now() - workflowStart)
      );
      this.saveCheckpoint(
        checkpointStore,
        workflow,
        'completed',
        stepResults,
        context,
        startedAt,
        'workflow-completed',
        completedAt,
      );

      // Emit workflow.completed event
      if (this.eventBus) {
        await this.eventBus.emit(createEvent(
          EngineEventType.WORKFLOW_COMPLETED,
          {
            workflowId: workflow.name || this.executionId,
            workflowName,
            runId: this.executionId,
            durationMs: result.duration,
            stepCount: result.metadata.totalSteps,
          },
          {
            workflowId: workflow.name || this.executionId,
            runId: this.executionId,
          }
        ));
      }

      // Call afterWorkflow hook
      if (this.hookManager) {
        await this.hookManager.runAfterWorkflow(hookContext);
      }

      return result;
    } catch (error) {
      const completedAt = new Date();
      const status = error instanceof Error && error.message.includes('timeout')
        ? 'timeout'
        : 'failure';

      const workflowError = error instanceof Error ? error : new Error(String(error));

      // Emit workflow.failed event
      if (this.eventBus) {
        await this.eventBus.emit(createEvent(
          EngineEventType.WORKFLOW_FAILED,
          {
            workflowId: workflow.name || this.executionId,
            workflowName,
            runId: this.executionId,
            error: workflowError.message,
            durationMs: Math.round(performance.now() - workflowStart),
          },
          {
            workflowId: workflow.name || this.executionId,
            runId: this.executionId,
          }
        ));
      }

      // Call onError hook
      if (this.hookManager) {
        await this.hookManager.runOnError(hookContext, workflowError);
      }

      // Persist final state
      stateStore.finalize(
        this.executionId,
        status === 'timeout' ? 'timeout' : 'failed',
        completedAt,
        Array.from(stepResults.values()),
        Math.round(performance.now() - workflowStart),
        workflowError
      );

      this.saveCheckpoint(
        checkpointStore,
        workflow,
        status === 'timeout' ? 'timeout' : 'failed',
        stepResults,
        context,
        startedAt,
        status === 'timeout' ? 'workflow-timeout' : 'workflow-failed',
        completedAt,
      );

      return this.buildResult(
        workflow,
        stepResults,
        status,
        startedAt,
        completedAt,
        plan,
        workflowError,
        Math.round(performance.now() - workflowStart)
      );
    }
  }

  /**
   * Execute workflow with timeout
   */
  private async executeWithTimeout(
    workflow: ParsedWorkflow,
    plan: ExecutionPlan,
    context: ResolutionContext,
    stepResults: Map<string, StepResult>,
    options: ExecutionOptions,
    stepMap: Map<string, ParsedStep>,
    timeoutMs: number,
    checkpointStore: CheckpointStore,
    startedAt: Date,
  ): Promise<void> {
    const executionPromise = this.executeWorkflowPlan(workflow, plan, context, stepResults, options, stepMap, checkpointStore, startedAt);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(
          `Workflow '${workflow.name}' exceeded timeout of ${timeoutMs}ms`
        ));
      }, timeoutMs);
    });

    try {
      await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Execute workflow plan phase by phase
   */
  private async executeWorkflowPlan(
    workflow: ParsedWorkflow,
    plan: ExecutionPlan,
    context: ResolutionContext,
    stepResults: Map<string, StepResult>,
    options: ExecutionOptions,
    stepMap: Map<string, ParsedStep>,
    checkpointStore: CheckpointStore,
    startedAt: Date,
  ): Promise<void> {
    const continueOnError = options.continueOnError ?? workflow.policies?.failure === 'continue';

    // Execute each phase
    for (const phase of plan.phases) {
      // Execute all nodes in phase concurrently
      // Map ExecutionNode back to ParsedStep for execution
      // Note: StepExecutor will use ContextStore automatically (no need to pass context)
      const phasePromises = phase.nodes.map(node => {
        const step = stepMap.get(node.stepId);
        if (!step) {
          throw new Error(`Step not found: ${node.stepId}`);
        }

        const existing = stepResults.get(step.id);
        if (existing && (existing.status === 'success' || existing.status === 'skipped')) {
          return Promise.resolve(existing);
        }

        return this.stepExecutor.execute(step);
      });

      const results = await Promise.allSettled(phasePromises);

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const node = phase.nodes[i];
        const step = stepMap.get(node.stepId)!;

        if (result.status === 'fulfilled') {
          const stepResult = result.value;
          stepResults.set(step.id, stepResult);
          this.saveCheckpoint(
            checkpointStore,
            workflow,
            'running',
            stepResults,
            context,
            startedAt,
            'step-updated',
          );

          // Update context with step output
          if (stepResult.status === 'success') {
            context.steps.set(step.id, stepResult.output);
          }

          // Check if step failed and we should stop
          if (
            stepResult.status === 'failure' &&
            !continueOnError &&
            !step.continueOnError
          ) {
            throw new Error(
              `Step '${step.id}' failed: ${stepResult.error?.message || 'Unknown error'}`
            );
          }
        } else {
          // Step execution threw an error
          const error = result.reason;
          stepResults.set(step.id, {
            stepId: step.id,
            status: 'failure',
            output: null,
            error: error instanceof Error ? error : new Error(String(error)),
            attempts: 1,
            duration: 0,
            startedAt: new Date(),
            completedAt: new Date(),
          });
          this.saveCheckpoint(
            checkpointStore,
            workflow,
            'running',
            stepResults,
            context,
            startedAt,
            'step-updated',
          );

          if (!continueOnError && !step.continueOnError) {
            throw error;
          }
        }
      }
    }
  }

  /**
   * Validate workflow before execution
   */
  private validateWorkflow(workflow: ParsedWorkflow): void {
    const availableSteps = new Set(workflow.steps.map(s => s.id));

    // Validate workflow structure
    WorkflowGuard.validate(workflow.steps);

    // Validate each step
    for (const step of workflow.steps) {
      StepGuard.validate(step, availableSteps);
    }
  }

  /**
   * Convert ParsedStep[] to ExecutionNode[]
   * This bridges the parser output with the execution planning system
   */
  private convertToExecutionNodes(steps: ParsedStep[]): ExecutionNode[] {
    return steps.map(step => {
      const timeout = step.timeout ? this.parseTimeoutString(step.timeout) : undefined;
      const maxRetries = step.retry?.max ?? 0;

      return createExecutionNode()
        .setStepId(step.id)
        .setUses(step.action)
        .setInput(step.input)
        .setDependencies(step.needs)
        .setCondition(step.when)
        .setMaxRetries(maxRetries)
        .setTimeout(timeout)
        .setAdapter(null) // Adapter will be resolved later by StepExecutor
        .build();
    });
  }

  /**
   * Create ContextStore for workflow execution
   */
  private createContextStore(
    workflow: ParsedWorkflow,
    options: ExecutionOptions
  ): ContextStore {
    // Use metadata object if available, otherwise use top-level fields
    const name = workflow.metadata?.name || workflow.name || 'unnamed-workflow';
    const description = workflow.metadata?.description || workflow.description;
    const tags = workflow.metadata?.tags || workflow.tags;
    const owner = workflow.metadata?.owner || workflow.owner;
    const version = workflow.metadata?.version || workflow.version;

    return new ContextStore({
      executionId: this.executionId,
      workflowId: name,
      workflowName: name,
      version,
      description,
      tags,
      owner,
      inputs: options.inputs,
      secrets: options.secrets,
      env: {
        ...(workflow.context || {}),
        ...options.env,
      },
      metadata: {
        createdAt: workflow.metadata?.createdAt || new Date().toISOString(),
        updatedAt: workflow.metadata?.updatedAt,
        annotations: {},
      },
      context: options.context,
      triggeredBy: options.triggeredBy,
    });
  }

  /**
   * Build workflow execution result
   */
  private buildResult(
    workflow: ParsedWorkflow,
    stepResults: Map<string, StepResult>,
    status: 'success' | 'failure' | 'timeout',
    startedAt: Date,
    completedAt: Date,
    plan: ExecutionPlan,
    error?: Error,
    durationMs?: number
  ): WorkflowResult {
    const results = Array.from(stepResults.values());

    return {
      workflowName: workflow.name || 'unnamed-workflow',
      executionId: this.executionId,
      status,
      stepResults,
      duration: durationMs ?? completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
      error,
      metadata: {
        totalSteps: workflow.steps.length,
        successfulSteps: results.filter(r => r.status === 'success').length,
        failedSteps: results.filter(r => r.status === 'failure').length,
        skippedSteps: results.filter(r => r.status === 'skipped').length,
        phases: plan.phases.length,
      },
    };
  }

  /**
   * Parse timeout string to milliseconds
   * @param timeout - Timeout string like "30s", "5m", "1h"
   * @returns Timeout in milliseconds
   */
  private parseTimeoutString(timeout: string): number {
    const match = timeout.match(/^([0-9]+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${timeout}. Expected format: <number><unit> (e.g., 30s, 5m, 1h)`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported timeout unit: ${unit}`);
    }
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private saveCheckpoint(
    store: CheckpointStore,
    workflow: ParsedWorkflow,
    status: CheckpointWorkflowStatus,
    stepResults: Map<string, StepResult>,
    context: ResolutionContext,
    startedAt: Date,
    reason: CheckpointReason,
    completedAt?: Date,
  ): void {
    const stepStates: Record<string, StepSnapshot> = {};
    for (const [stepId, result] of stepResults.entries()) {
      stepStates[stepId] = {
        id: stepId,
        status: result.status,
        attempts: result.attempts,
        output: result.output,
        error: result.error?.message,
        durationMs: result.duration,
        completedAt: result.completedAt.toISOString(),
      };
    }

    const snapshot: ExecutionCheckpointSnapshot = {
      runId: this.executionId,
      workflowId: workflow.name || this.executionId,
      status,
      stepStates,
      context: {
        env: context.env,
        inputs: context.inputs,
        custom: context.context,
        stepOutputs: Object.fromEntries(context.steps.entries()),
      },
      metadata: {
        startedAt: startedAt.getTime(),
        updatedAt: Date.now(),
        completedAt: completedAt?.getTime(),
        checkpointReason: reason,
      },
    };

    store.save(snapshot);
  }

  private tryRestoreFromCheckpoint(
    checkpointStore: CheckpointStore,
    runId: string,
    workflow: ParsedWorkflow,
    stepResults: Map<string, StepResult>,
    policy: 'strict' | 'best-effort',
  ): boolean {
    const snapshot = checkpointStore.load(runId);
    if (!snapshot) {
      if (policy === 'strict') {
        throw new Error(`Resume failed: checkpoint not found for runId '${runId}'`);
      }
      return false;
    }

    if (snapshot.workflowId !== (workflow.name || runId)) {
      if (policy === 'strict') {
        throw new Error(
          `Resume failed: checkpoint workflow '${snapshot.workflowId}' does not match requested workflow '${workflow.name || runId}'`,
        );
      }
      return false;
    }

    if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'timeout') {
      if (policy === 'strict') {
        throw new Error(`Resume failed: checkpoint for runId '${runId}' is already terminal (${snapshot.status})`);
      }
      return false;
    }

    const nonRetryEligibleFailures = this.collectNonRetryEligibleFailures(workflow, snapshot);
    if (nonRetryEligibleFailures.length > 0) {
      const details = nonRetryEligibleFailures
        .map((item) => `${item.stepId}(attempts=${item.attempts}, maxRetry=${item.maxRetry})`)
        .join(', ');
      const message =
        `Resume retry-eligibility check found ${nonRetryEligibleFailures.length} failed ` +
        `step(s) with exhausted retries: ${details}`;

      if (policy === 'strict') {
        throw new Error(`${message}. Use resumePolicy='best-effort' to restart without strict resume guarantees.`);
      }

      LoggerManager.getLogger().warn(
        `[WorkflowExecutor] ${message}. Continuing because resumePolicy='best-effort'.`,
        {
          runId,
          workflowId: workflow.name || runId,
          nonRetryEligibleFailures,
        },
      );
    }

    const idempotencyRisks = this.collectResumeIdempotencyRisks(workflow, snapshot);
    if (idempotencyRisks.length > 0) {
      const details = idempotencyRisks
        .map((risk) => `${risk.stepId}(${risk.adapterName})`)
        .join(', ');
      const message =
        `Resume idempotency check found ${idempotencyRisks.length} non-idempotent ` +
        `pending step(s): ${details}`;

      if (policy === 'strict') {
        throw new Error(`${message}. Use resumePolicy='best-effort' to allow continuation with warning.`);
      }

      LoggerManager.getLogger().warn(
        `[WorkflowExecutor] ${message}. Continuing because resumePolicy='best-effort'.`,
        {
          runId,
          workflowId: workflow.name || runId,
          idempotencyRisks,
        },
      );
    }

    if (this.contextStore) {
      for (const [stepId, output] of Object.entries(snapshot.context.stepOutputs ?? {})) {
        this.contextStore.setStepOutput(stepId, output);
      }
    }

    for (const [stepId, step] of Object.entries(snapshot.stepStates)) {
      if (step.status !== 'success' && step.status !== 'skipped') {
        continue;
      }

      const now = new Date();
      const completedAt = step.completedAt ? new Date(step.completedAt) : now;
      const status: 'success' | 'skipped' = step.status === 'success' ? 'success' : 'skipped';

      stepResults.set(stepId, {
        stepId,
        status,
        output: step.output ?? null,
        attempts: step.attempts || 1,
        duration: step.durationMs ?? 0,
        startedAt: now,
        completedAt,
      });
    }

    return true;
  }

  private collectResumeIdempotencyRisks(
    workflow: ParsedWorkflow,
    snapshot: ExecutionCheckpointSnapshot,
  ): Array<{ stepId: string; adapterName: string; action: string; sideEffectLevel: 'low' | 'medium' | 'high' | 'unknown' }> {
    const registry = this.stepExecutor.getAdapterRegistry();
    const risks: Array<{ stepId: string; adapterName: string; action: string; sideEffectLevel: 'low' | 'medium' | 'high' | 'unknown' }> = [];

    for (const step of workflow.steps) {
      const snapshotState = snapshot.stepStates[step.id];
      const alreadyCompleted =
        snapshotState?.status === 'success' || snapshotState?.status === 'skipped';

      if (alreadyCompleted) {
        continue;
      }

      const action = String(step.action || '').trim();
      const actionNamespace = action.split('.')[0];
      const adapterName = step.adapter || actionNamespace;
      const adapter = registry.get(adapterName) || (actionNamespace ? registry.get(actionNamespace) : undefined);
      const isIdempotent = adapter?.capabilities?.idempotent === true;
      const sideEffectLevel = (adapter?.capabilities as any)?.sideEffectLevel ?? 'unknown';

      if (!isIdempotent) {
        risks.push({
          stepId: step.id,
          adapterName,
          action,
          sideEffectLevel,
        });
      }
    }

    return risks;
  }

  private collectNonRetryEligibleFailures(
    workflow: ParsedWorkflow,
    snapshot: ExecutionCheckpointSnapshot,
  ): Array<{ stepId: string; attempts: number; maxRetry: number }> {
    const exhausted: Array<{ stepId: string; attempts: number; maxRetry: number }> = [];

    for (const step of workflow.steps) {
      const snapshotState = snapshot.stepStates[step.id];
      if (!snapshotState || snapshotState.status !== 'failure') {
        continue;
      }

      const maxRetry = step.retry?.max ?? 0;
      const attempts = snapshotState.attempts ?? 1;

      // attempts include the initial attempt. If attempts > maxRetry, retries are exhausted.
      if (attempts > maxRetry) {
        exhausted.push({
          stepId: step.id,
          attempts,
          maxRetry,
        });
      }
    }

    return exhausted;
  }

  /**
   * Get execution ID
   */
  getExecutionId(): string {
    return this.executionId;
  }
}

