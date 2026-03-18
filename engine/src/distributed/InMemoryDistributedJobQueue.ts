import {
  type DistributedJobQueue,
  type DistributedQueueStats,
  type DistributedStepJob,
} from '../types/core-types.js';

export interface InMemoryDistributedJobQueueOptions {
  leaseMs?: number;
}

/**
 * In-memory distributed queue with lease semantics.
 *
 * This models ack/nack behavior used by external queue systems while
 * remaining process-local for development and incremental adoption.
 */
export class InMemoryDistributedJobQueue implements DistributedJobQueue {
  private readonly queued: DistributedStepJob[] = [];
  private readonly leased = new Map<string, DistributedStepJob>();
  private readonly completed = new Map<string, DistributedStepJob>();
  private readonly failed = new Map<string, DistributedStepJob>();
  private readonly leaseMs: number;

  constructor(options: InMemoryDistributedJobQueueOptions = {}) {
    this.leaseMs = options.leaseMs ?? 30_000;
  }

  async push(job: DistributedStepJob): Promise<void> {
    this.requeueExpired();

    const now = Date.now();
    const normalized: DistributedStepJob = {
      ...job,
      status: 'queued',
      attempts: Math.max(0, job.attempts ?? 0),
      maxAttempts: Math.max(1, job.maxAttempts ?? 1),
      createdAt: job.createdAt || now,
      updatedAt: now,
      workerId: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
    };

    this.queued.push(normalized);
  }

  async pull(workerId: string): Promise<DistributedStepJob | null> {
    this.requeueExpired();

    const job = this.queued.shift();
    if (!job) {
      return null;
    }

    const now = Date.now();
    const leasedJob: DistributedStepJob = {
      ...job,
      status: 'leased',
      workerId,
      leaseExpiresAt: now + this.leaseMs,
      updatedAt: now,
    };

    this.leased.set(leasedJob.jobId, leasedJob);
    return leasedJob;
  }

  async ack(jobId: string): Promise<void> {
    this.requeueExpired();

    const job = this.leased.get(jobId);
    if (!job) {
      return;
    }

    this.leased.delete(jobId);
    this.completed.set(jobId, {
      ...job,
      status: 'completed',
      workerId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    });
  }

  async nack(jobId: string, error: Error, requeue = true): Promise<'requeued' | 'failed' | 'missing'> {
    this.requeueExpired();

    const job = this.leased.get(jobId);
    if (!job) {
      return 'missing';
    }

    this.leased.delete(jobId);

    const now = Date.now();
    const updated: DistributedStepJob = {
      ...job,
      attempts: job.attempts + 1,
      lastError: error.message,
      workerId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    };

    const canRetry = requeue && updated.attempts < updated.maxAttempts;
    if (canRetry) {
      updated.status = 'queued';
      this.queued.push(updated);
      return 'requeued';
    }

    updated.status = 'failed';
    this.failed.set(updated.jobId, updated);
    return 'failed';
  }

  async extendLease(jobId: string, workerId: string, leaseMs?: number): Promise<boolean> {
    this.requeueExpired();

    const job = this.leased.get(jobId);
    if (!job || job.workerId !== workerId) {
      return false;
    }

    const now = Date.now();
    job.leaseExpiresAt = now + (leaseMs ?? this.leaseMs);
    job.updatedAt = now;
    return true;
  }

  async getStats(): Promise<DistributedQueueStats> {
    this.requeueExpired();

    return {
      queued: this.queued.length,
      leased: this.leased.size,
      completed: this.completed.size,
      failed: this.failed.size,
    };
  }

  private requeueExpired(): void {
    if (this.leased.size === 0) {
      return;
    }

    const now = Date.now();
    for (const [jobId, job] of this.leased.entries()) {
      if (!job.leaseExpiresAt || job.leaseExpiresAt > now) {
        continue;
      }

      this.leased.delete(jobId);
      this.queued.push({
        ...job,
        status: 'queued',
        workerId: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
    }
  }
}
