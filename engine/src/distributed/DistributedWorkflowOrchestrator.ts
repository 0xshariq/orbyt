import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ContextStore } from '../context/ContextStore.js';
import { createExecutionNode } from '../execution/ExecutionNode.js';
import { ExecutionPlanner } from '../execution/ExecutionPlan.js';
import { StepExecutor } from '../execution/StepExecutor.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import { createEvent } from '../events/EngineEvents.js';
import type { EventBus } from '../events/EventBus.js';
import {
  EngineEventType,
  type DistributedJobQueue,
  type DistributedStepJob,
  type ExecutionOptions,
  type ParsedStep,
  type ParsedWorkflow,
  type StepResult,
  type WorkflowResult,
} from '../types/core-types.js';
import { DistributedStepWorker } from './DistributedStepWorker.js';
import type { HookManager } from '../hooks/HookManager.js';
import type { WorkflowHookContext } from '../hooks/LifecycleHooks.js';
import { ExecutionStore } from '../storage/ExecutionStore.js';
import { CheckpointStore, type CheckpointWorkflowStatus, type CheckpointReason, type StepSnapshot } from '../storage/CheckpointStore.js';

export interface DistributedWorkflowOrchestratorOptions {
  queue: DistributedJobQueue;
  stepExecutor: StepExecutor;
  workerCount?: number;
  pollIntervalMs?: number;
  eventBus?: EventBus;
  hookManager?: HookManager;
  executionStore?: ExecutionStore;
  checkpointStore?: CheckpointStore;
  leaseExtensionMs?: number;
}

/**
 * Distributed workflow runtime orchestrator.
 *
 * Responsibilities:
 * - Build DAG plan
 * - Enqueue ready step jobs
 * - Track step completion state
 * - React to worker outcomes and unlock dependent steps
 */
export class DistributedWorkflowOrchestrator {
  private readonly queue: DistributedJobQueue;
  private readonly stepExecutor: StepExecutor;
  private readonly workerCount: number;
  private readonly pollIntervalMs: number;
  private readonly eventBus?: EventBus;
  private readonly hookManager?: HookManager;
  private readonly executionStore?: ExecutionStore;
  private readonly checkpointStore?: CheckpointStore;
  private readonly leaseExtensionMs: number;

  constructor(options: DistributedWorkflowOrchestratorOptions) {
    this.queue = options.queue;
    this.stepExecutor = options.stepExecutor;
    this.workerCount = Math.max(1, options.workerCount ?? 4);
    this.pollIntervalMs = Math.max(10, options.pollIntervalMs ?? 50);
    this.eventBus = options.eventBus;
    this.hookManager = options.hookManager;
    this.executionStore = options.executionStore;
    this.checkpointStore = options.checkpointStore;
    this.leaseExtensionMs = Math.max(500, options.leaseExtensionMs ?? 5_000);
  }

  async execute(workflow: ParsedWorkflow, options: ExecutionOptions = {}): Promise<WorkflowResult> {
    const startedAt = new Date();
    const workflowStart = performance.now();
    const runId = options.resumeFromRunId || this.generateRunId();
    const workflowId = workflow.name || runId;
    const workflowName = workflow.metadata?.name || workflow.name || 'unnamed-workflow';

    const logger = LoggerManager.getLogger();

    this.executionStore?.begin(runId, workflowName, startedAt);

    const contextStore = new ContextStore({
      executionId: runId,
      workflowId,
      workflowName,
      version: workflow.metadata?.version || workflow.version,
      description: workflow.metadata?.description || workflow.description,
      tags: workflow.metadata?.tags || workflow.tags,
      owner: workflow.metadata?.owner || workflow.owner,
      env: {
        ...(workflow.context || {}),
        ...(options.env || {}),
      },
      inputs: options.inputs,
      secrets: options.secrets,
      metadata: {
        createdAt: workflow.metadata?.createdAt || new Date().toISOString(),
        updatedAt: workflow.metadata?.updatedAt,
        annotations: {},
      },
      context: options.context,
      triggeredBy: options.triggeredBy,
    });

    this.stepExecutor.setContextStore(contextStore);

    const stepResults = new Map<string, StepResult>();
    const stepsById = new Map(workflow.steps.map((step) => [step.id, step]));
    const plan = ExecutionPlanner.plan(this.convertToExecutionNodes(workflow.steps));

    const reverseDeps = this.buildReverseDeps(workflow.steps);
    const unresolvedDeps = this.buildDependencyCounters(workflow.steps);
    const queuedSteps = new Set<string>();
    const terminalSteps = new Set<string>();

    const hookContext: WorkflowHookContext = {
      workflowId,
      workflowName,
      runId,
      triggeredBy: options.triggeredBy,
      inputs: options.inputs,
      env: options.env,
      metadata: workflow.metadata,
      startTime: startedAt.getTime(),
    };

    let resumed = false;
    if (options.resumeFromRunId && this.checkpointStore) {
      resumed = this.restoreFromCheckpoint(
        workflow,
        options.resumeFromRunId,
        options.resumePolicy ?? 'strict',
        contextStore,
        stepResults,
        terminalSteps,
      );
    }

    this.saveCheckpoint(
      workflow,
      runId,
      'running',
      stepResults,
      contextStore,
      startedAt,
      resumed ? 'workflow-resumed' : 'workflow-started',
    );

    await this.eventBus?.emit(createEvent(
      EngineEventType.WORKFLOW_STARTED,
      {
        workflowId,
        workflowName,
        runId,
        triggeredBy: options.triggeredBy,
        inputs: options.inputs,
      },
      { workflowId, runId },
    ));

    if (resumed) {
      await this.eventBus?.emit(createEvent(
        EngineEventType.WORKFLOW_RESUMED,
        {
          workflowId,
          workflowName,
          runId,
          triggeredBy: options.triggeredBy,
        },
        { workflowId, runId },
      ));
      await this.hookManager?.runOnResume(hookContext);
    }

    await this.hookManager?.runBeforeWorkflow(hookContext);

    for (const completedStepId of terminalSteps) {
      this.unlockDependents(completedStepId, reverseDeps, unresolvedDeps, queuedSteps, stepsById, workflowId, runId);
    }

    let workflowError: Error | undefined;
    let aborted = false;

    const workers = Array.from({ length: this.workerCount }, (_, index) => new DistributedStepWorker({
      workerId: `dist-worker-${index + 1}`,
      queue: this.queue,
      stepExecutor: this.stepExecutor,
      resolveStep: (job) => stepsById.get(job.stepId),
      resolveContext: () => contextStore.getResolutionContext(),
      onStepFinished: async (job, result) => {
        stepResults.set(job.stepId, result);
        terminalSteps.add(job.stepId);
        this.executionStore?.stepUpdate(runId, result);
        this.saveCheckpoint(workflow, runId, 'running', stepResults, contextStore, startedAt, 'step-updated');

        await this.unlockDependents(job.stepId, reverseDeps, unresolvedDeps, queuedSteps, stepsById, workflowId, runId);
      },
      onStepFailed: async (job, error, outcome) => {
        if (outcome === 'requeued') {
          return;
        }

        const failedResult: StepResult = {
          stepId: job.stepId,
          status: 'failure',
          output: null,
          error,
          attempts: Math.max(1, job.attempts + 1),
          duration: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        };

        stepResults.set(job.stepId, failedResult);
        terminalSteps.add(job.stepId);
        this.executionStore?.stepUpdate(runId, failedResult);
        this.saveCheckpoint(workflow, runId, 'running', stepResults, contextStore, startedAt, 'step-updated');

        const step = stepsById.get(job.stepId);
        const continueOnError = options.continueOnError ?? workflow.policies?.failure === 'continue';
        if (!continueOnError && !step?.continueOnError) {
          aborted = true;
          workflowError = error;
          return;
        }

        await this.unlockDependents(job.stepId, reverseDeps, unresolvedDeps, queuedSteps, stepsById, workflowId, runId);
      },
      pollIntervalMs: this.pollIntervalMs,
      leaseExtensionMs: this.leaseExtensionMs,
    }));

    const initialSteps = ExecutionPlanner.getInitialNodes(plan)
      .map((node) => stepsById.get(node.stepId))
      .filter((step): step is ParsedStep => !!step);

    for (const step of initialSteps) {
      await this.enqueueStepJob({ workflowId, runId, step, queuedSteps });
    }

    workers.forEach((worker) => worker.start());

    try {
      const timeoutMs = options.timeout;
      const startWait = Date.now();

      while (terminalSteps.size < workflow.steps.length && !aborted) {
        const queueStats = await this.queue.getStats();
        if (queueStats.queued === 0 && queueStats.leased === 0) {
          break;
        }

        if (timeoutMs && Date.now() - startWait > timeoutMs) {
          aborted = true;
          workflowError = new Error(`Workflow '${workflowId}' exceeded timeout of ${timeoutMs}ms`);
          break;
        }

        await this.sleep(this.pollIntervalMs);
      }
    } finally {
      workers.forEach((worker) => worker.stop());
    }

    const completedAt = new Date();
    const duration = Math.round(performance.now() - workflowStart);

    const failedSteps = Array.from(stepResults.values()).filter((result) => result.status === 'failure').length;
    const status: WorkflowResult['status'] = workflowError
      ? (workflowError.message.includes('timeout') ? 'timeout' : 'failure')
      : failedSteps > 0
        ? 'partial'
        : 'success';

    const finalStoreStatus = status === 'timeout' ? 'timeout' : status === 'failure' ? 'failed' : 'completed';
    this.executionStore?.finalize(
      runId,
      finalStoreStatus,
      completedAt,
      Array.from(stepResults.values()),
      duration,
      workflowError,
    );

    this.saveCheckpoint(
      workflow,
      runId,
      finalStoreStatus,
      stepResults,
      contextStore,
      startedAt,
      status === 'timeout' ? 'workflow-timeout' : status === 'failure' ? 'workflow-failed' : 'workflow-completed',
      completedAt,
    );

    if (status === 'success' || status === 'partial') {
      await this.eventBus?.emit(createEvent(
        EngineEventType.WORKFLOW_COMPLETED,
        {
          workflowId,
          workflowName,
          runId,
          durationMs: duration,
          stepCount: workflow.steps.length,
        },
        { workflowId, runId },
      ));
      await this.hookManager?.runAfterWorkflow(hookContext);
    } else {
      await this.eventBus?.emit(createEvent(
        EngineEventType.WORKFLOW_FAILED,
        {
          workflowId,
          workflowName,
          runId,
          error: workflowError?.message || 'Distributed execution failed',
          durationMs: duration,
        },
        { workflowId, runId },
      ));
      if (workflowError) {
        await this.hookManager?.runOnError(hookContext, workflowError);
      }
    }

    logger.info('[DistributedWorkflowOrchestrator] Workflow execution finished', {
      workflowId,
      runId,
      status,
      workerCount: this.workerCount,
      totalSteps: workflow.steps.length,
      terminalSteps: terminalSteps.size,
      duration,
    });

    return {
      workflowName: workflow.name || 'unnamed-workflow',
      executionId: runId,
      status,
      stepResults,
      duration,
      startedAt,
      completedAt,
      error: workflowError,
      metadata: {
        totalSteps: workflow.steps.length,
        successfulSteps: Array.from(stepResults.values()).filter((result) => result.status === 'success').length,
        failedSteps,
        skippedSteps: Array.from(stepResults.values()).filter((result) => result.status === 'skipped').length,
        phases: plan.phases.length,
      },
    };
  }

  private async enqueueStepJob(params: {
    workflowId: string;
    runId: string;
    step: ParsedStep;
    queuedSteps: Set<string>;
  }): Promise<void> {
    const { workflowId, runId, step, queuedSteps } = params;

    if (queuedSteps.has(step.id)) {
      return;
    }

    const job: DistributedStepJob = {
      jobId: this.generateJobId(),
      runId,
      workflowId,
      stepId: step.id,
      uses: step.action,
      input: step.input,
      attempts: 0,
      maxAttempts: (step.retry?.max ?? 0) + 1,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    queuedSteps.add(step.id);
    await this.queue.push(job);
  }

  private buildDependencyCounters(steps: ParsedStep[]): Map<string, number> {
    const counters = new Map<string, number>();
    for (const step of steps) {
      counters.set(step.id, step.needs?.length ?? 0);
    }
    return counters;
  }

  private buildReverseDeps(steps: ParsedStep[]): Map<string, string[]> {
    const reverse = new Map<string, string[]>();

    for (const step of steps) {
      if (!reverse.has(step.id)) {
        reverse.set(step.id, []);
      }

      for (const dependency of step.needs || []) {
        const existing = reverse.get(dependency) ?? [];
        existing.push(step.id);
        reverse.set(dependency, existing);
      }
    }

    return reverse;
  }

  private async unlockDependents(
    completedStepId: string,
    reverseDeps: Map<string, string[]>,
    unresolvedDeps: Map<string, number>,
    queuedSteps: Set<string>,
    stepsById: Map<string, ParsedStep>,
    workflowId: string,
    runId: string,
  ): Promise<void> {
    const dependents = reverseDeps.get(completedStepId) || [];
    for (const dependentId of dependents) {
      const remaining = (unresolvedDeps.get(dependentId) ?? 1) - 1;
      unresolvedDeps.set(dependentId, remaining);
      if (remaining <= 0) {
        const step = stepsById.get(dependentId);
        if (step) {
          await this.enqueueStepJob({
            workflowId,
            runId,
            step,
            queuedSteps,
          });
        }
      }
    }
  }

  private restoreFromCheckpoint(
    workflow: ParsedWorkflow,
    runId: string,
    policy: 'strict' | 'best-effort',
    contextStore: ContextStore,
    stepResults: Map<string, StepResult>,
    terminalSteps: Set<string>,
  ): boolean {
    if (!this.checkpointStore) {
      return false;
    }

    const snapshot = this.checkpointStore.load(runId);
    if (!snapshot) {
      if (policy === 'strict') {
        throw new Error(`Resume failed: checkpoint not found for runId '${runId}'`);
      }
      return false;
    }

    if (snapshot.workflowId !== (workflow.name || runId)) {
      if (policy === 'strict') {
        throw new Error(`Resume failed: checkpoint workflow '${snapshot.workflowId}' mismatch`);
      }
      return false;
    }

    if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'timeout') {
      if (policy === 'strict') {
        throw new Error(`Resume failed: checkpoint for runId '${runId}' is terminal (${snapshot.status})`);
      }
      return false;
    }

    for (const [stepId, output] of Object.entries(snapshot.context.stepOutputs ?? {})) {
      contextStore.setStepOutput(stepId, output);
    }

    for (const [stepId, state] of Object.entries(snapshot.stepStates)) {
      if (state.status !== 'success' && state.status !== 'skipped') {
        continue;
      }

      const now = new Date();
      const completedAt = state.completedAt ? new Date(state.completedAt) : now;
      const status: 'success' | 'skipped' = state.status === 'success' ? 'success' : 'skipped';
      const stepResult: StepResult = {
        stepId,
        status,
        output: state.output ?? null,
        attempts: state.attempts || 1,
        duration: state.durationMs ?? 0,
        startedAt: now,
        completedAt,
      };
      stepResults.set(stepId, stepResult);
      terminalSteps.add(stepId);
    }

    return true;
  }

  private saveCheckpoint(
    workflow: ParsedWorkflow,
    runId: string,
    status: CheckpointWorkflowStatus,
    stepResults: Map<string, StepResult>,
    contextStore: ContextStore,
    startedAt: Date,
    reason: CheckpointReason,
    completedAt?: Date,
  ): void {
    if (!this.checkpointStore) {
      return;
    }

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

    const context = contextStore.getResolutionContext();
    this.checkpointStore.save({
      runId,
      workflowId: workflow.name || runId,
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
    });
  }

  private convertToExecutionNodes(steps: ParsedStep[]) {
    return steps.map((step) => {
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
        .setAdapter(null)
        .build();
    });
  }

  private parseTimeoutString(timeout: string): number {
    const match = timeout.match(/^([0-9]+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${timeout}. Expected format: <number><unit>`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'ms') return value;
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;

    throw new Error(`Unsupported timeout unit: ${unit}`);
  }

  private generateRunId(): string {
    return `dist-exec-${Date.now()}-${randomUUID().split('-')[0]}`;
  }

  private generateJobId(): string {
    return `dist-job-${Date.now()}-${randomUUID().split('-')[0]}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
