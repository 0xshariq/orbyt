import { LoggerManager } from '../logging/LoggerManager.js';
import { type ParsedStep, type ResolutionContext, type StepResult, type DistributedJobQueue, type DistributedStepJob } from '../types/core-types.js';
import { StepExecutor } from '../execution/StepExecutor.js';

export interface DistributedStepWorkerOptions {
  workerId: string;
  queue: DistributedJobQueue;
  stepExecutor: StepExecutor;
  resolveStep: (job: DistributedStepJob) => ParsedStep | undefined;
  resolveContext: (job: DistributedStepJob) => ResolutionContext;
  onStepFinished: (job: DistributedStepJob, result: StepResult) => Promise<void>;
  onStepFailed: (job: DistributedStepJob, error: Error, outcome: 'requeued' | 'failed' | 'missing') => Promise<void>;
  pollIntervalMs?: number;
}

/**
 * Distributed worker loop (process-local implementation).
 *
 * The queue protocol mirrors external worker systems:
 * - pull: claim next job
 * - ack: success
 * - nack: failure and optional requeue
 */
export class DistributedStepWorker {
  private readonly workerId: string;
  private readonly queue: DistributedJobQueue;
  private readonly stepExecutor: StepExecutor;
  private readonly resolveStep: (job: DistributedStepJob) => ParsedStep | undefined;
  private readonly resolveContext: (job: DistributedStepJob) => ResolutionContext;
  private readonly onStepFinished: (job: DistributedStepJob, result: StepResult) => Promise<void>;
  private readonly onStepFailed: (job: DistributedStepJob, error: Error, outcome: 'requeued' | 'failed' | 'missing') => Promise<void>;
  private readonly pollIntervalMs: number;

  private running = false;

  constructor(options: DistributedStepWorkerOptions) {
    this.workerId = options.workerId;
    this.queue = options.queue;
    this.stepExecutor = options.stepExecutor;
    this.resolveStep = options.resolveStep;
    this.resolveContext = options.resolveContext;
    this.onStepFinished = options.onStepFinished;
    this.onStepFailed = options.onStepFailed;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.runLoop();
  }

  stop(): void {
    this.running = false;
  }

  private async runLoop(): Promise<void> {
    const logger = LoggerManager.getLogger();

    while (this.running) {
      try {
        const job = await this.queue.pull(this.workerId);
        if (!job) {
          await this.sleep(this.pollIntervalMs);
          continue;
        }

        const step = this.resolveStep(job);
        if (!step) {
          const missingStepError = new Error(
            `Distributed step job references missing step '${job.stepId}'`,
          );
          const missingOutcome = await this.queue.nack(job.jobId, missingStepError, false);
          await this.onStepFailed(job, missingStepError, missingOutcome);
          continue;
        }

        const context = this.resolveContext(job);
        const result = await this.stepExecutor.execute(step, context);

        if (result.status === 'success' || result.status === 'skipped') {
          await this.queue.ack(job.jobId);
          await this.onStepFinished(job, result);
          continue;
        }

        const stepError = result.error ?? new Error(`Step '${step.id}' failed`);
        const outcome = await this.queue.nack(job.jobId, stepError, true);
        await this.onStepFailed(job, stepError, outcome);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`[DistributedStepWorker:${this.workerId}] Worker loop error`, err);
        await this.sleep(this.pollIntervalMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
