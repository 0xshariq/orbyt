import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ContextStore } from '../context/ContextStore.js';
import { createExecutionNode } from '../execution/ExecutionNode.js';
import { ExecutionPlanner } from '../execution/ExecutionPlan.js';
import { StepExecutor } from '../execution/StepExecutor.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import {
  type DistributedJobQueue,
  type DistributedStepJob,
  type ExecutionOptions,
  type ParsedStep,
  type ParsedWorkflow,
  type StepResult,
  type WorkflowResult,
} from '../types/core-types.js';
import { DistributedStepWorker } from './DistributedStepWorker.js';

export interface DistributedWorkflowOrchestratorOptions {
  queue: DistributedJobQueue;
  stepExecutor: StepExecutor;
  workerCount?: number;
  pollIntervalMs?: number;
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

  constructor(options: DistributedWorkflowOrchestratorOptions) {
    this.queue = options.queue;
    this.stepExecutor = options.stepExecutor;
    this.workerCount = Math.max(1, options.workerCount ?? 4);
    this.pollIntervalMs = Math.max(10, options.pollIntervalMs ?? 50);
  }

  async execute(workflow: ParsedWorkflow, options: ExecutionOptions = {}): Promise<WorkflowResult> {
    const startedAt = new Date();
    const workflowStart = performance.now();
    const runId = options.resumeFromRunId || this.generateRunId();
    const workflowId = workflow.name || runId;

    const logger = LoggerManager.getLogger();

    const contextStore = new ContextStore({
      executionId: runId,
      workflowId,
      workflowName: workflow.metadata?.name || workflow.name || 'unnamed-workflow',
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

        const dependents = reverseDeps.get(job.stepId) || [];
        for (const dependentId of dependents) {
          const remaining = (unresolvedDeps.get(dependentId) ?? 1) - 1;
          unresolvedDeps.set(dependentId, remaining);
          if (remaining <= 0) {
            await this.enqueueStepJob({
              workflowId,
              runId,
              step: stepsById.get(dependentId)!,
              queuedSteps,
            });
          }
        }
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

        const step = stepsById.get(job.stepId);
        const continueOnError = options.continueOnError ?? workflow.policies?.failure === 'continue';
        if (!continueOnError && !step?.continueOnError) {
          aborted = true;
          workflowError = error;
          return;
        }

        const dependents = reverseDeps.get(job.stepId) || [];
        for (const dependentId of dependents) {
          const remaining = (unresolvedDeps.get(dependentId) ?? 1) - 1;
          unresolvedDeps.set(dependentId, remaining);
          if (remaining <= 0) {
            await this.enqueueStepJob({
              workflowId,
              runId,
              step: stepsById.get(dependentId)!,
              queuedSteps,
            });
          }
        }
      },
      pollIntervalMs: this.pollIntervalMs,
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
