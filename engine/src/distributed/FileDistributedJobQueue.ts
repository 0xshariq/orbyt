import { FileStorageAdapter } from '../storage/FileStorageAdapter.js';
import {
  type DistributedJobQueue,
  type DistributedQueueStats,
  type DistributedStepJob,
} from '../types/core-types.js';

interface FileQueueState {
  queued: DistributedStepJob[];
  leased: DistributedStepJob[];
  completed: DistributedStepJob[];
  failed: DistributedStepJob[];
}

export interface FileDistributedJobQueueOptions {
  stateDir: string;
  leaseMs?: number;
  stateFileName?: string;
}

/**
 * File-backed distributed queue.
 *
 * This provides cross-process durability on a single machine without
 * requiring Redis. For multi-node deployments, use an external queue backend.
 */
export class FileDistributedJobQueue implements DistributedJobQueue {
  private readonly adapter: FileStorageAdapter;
  private readonly leaseMs: number;
  private readonly stateFileName: string;

  constructor(options: FileDistributedJobQueueOptions) {
    this.adapter = new FileStorageAdapter(options.stateDir);
    this.leaseMs = options.leaseMs ?? 30_000;
    this.stateFileName = options.stateFileName ?? 'distributed-queue.orbt';
    this.ensureState();
  }

  async push(job: DistributedStepJob): Promise<void> {
    const state = this.readState();
    this.requeueExpired(state);

    const now = Date.now();
    state.queued.push({
      ...job,
      status: 'queued',
      attempts: Math.max(0, job.attempts ?? 0),
      maxAttempts: Math.max(1, job.maxAttempts ?? 1),
      createdAt: job.createdAt || now,
      updatedAt: now,
      workerId: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
    });

    this.writeState(state);
  }

  async pull(workerId: string): Promise<DistributedStepJob | null> {
    const state = this.readState();
    this.requeueExpired(state);

    const job = state.queued.shift();
    if (!job) {
      this.writeState(state);
      return null;
    }

    const now = Date.now();
    const leased: DistributedStepJob = {
      ...job,
      status: 'leased',
      workerId,
      leaseExpiresAt: now + this.leaseMs,
      updatedAt: now,
    };

    state.leased.push(leased);
    this.writeState(state);
    return leased;
  }

  async ack(jobId: string): Promise<void> {
    const state = this.readState();
    this.requeueExpired(state);

    const idx = state.leased.findIndex((job) => job.jobId === jobId);
    if (idx === -1) {
      this.writeState(state);
      return;
    }

    const [job] = state.leased.splice(idx, 1);
    state.completed.push({
      ...job,
      status: 'completed',
      workerId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    });

    this.writeState(state);
  }

  async nack(jobId: string, error: Error, requeue = true): Promise<'requeued' | 'failed' | 'missing'> {
    const state = this.readState();
    this.requeueExpired(state);

    const idx = state.leased.findIndex((job) => job.jobId === jobId);
    if (idx === -1) {
      this.writeState(state);
      return 'missing';
    }

    const [job] = state.leased.splice(idx, 1);
    const updated: DistributedStepJob = {
      ...job,
      attempts: job.attempts + 1,
      lastError: error.message,
      workerId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    };

    if (requeue && updated.attempts < updated.maxAttempts) {
      updated.status = 'queued';
      state.queued.push(updated);
      this.writeState(state);
      return 'requeued';
    }

    updated.status = 'failed';
    state.failed.push(updated);
    this.writeState(state);
    return 'failed';
  }

  async extendLease(jobId: string, workerId: string, leaseMs?: number): Promise<boolean> {
    const state = this.readState();
    this.requeueExpired(state);

    const job = state.leased.find((entry) => entry.jobId === jobId);
    if (!job || job.workerId !== workerId) {
      this.writeState(state);
      return false;
    }

    job.leaseExpiresAt = Date.now() + (leaseMs ?? this.leaseMs);
    job.updatedAt = Date.now();
    this.writeState(state);
    return true;
  }

  async getStats(): Promise<DistributedQueueStats> {
    const state = this.readState();
    this.requeueExpired(state);
    this.writeState(state);

    return {
      queued: state.queued.length,
      leased: state.leased.length,
      completed: state.completed.length,
      failed: state.failed.length,
    };
  }

  private ensureState(): void {
    this.adapter.ensureDir();
    if (!this.adapter.exists(this.stateFileName)) {
      this.writeState({
        queued: [],
        leased: [],
        completed: [],
        failed: [],
      });
    }
  }

  private readState(): FileQueueState {
    this.ensureState();
    return this.adapter.readJson<FileQueueState>(this.stateFileName) ?? {
      queued: [],
      leased: [],
      completed: [],
      failed: [],
    };
  }

  private writeState(state: FileQueueState): void {
    this.adapter.saveJson(this.stateFileName, state);
  }

  private requeueExpired(state: FileQueueState): void {
    if (state.leased.length === 0) {
      return;
    }

    const now = Date.now();
    const remainingLeased: DistributedStepJob[] = [];

    for (const job of state.leased) {
      if (!job.leaseExpiresAt || job.leaseExpiresAt > now) {
        remainingLeased.push(job);
        continue;
      }

      state.queued.push({
        ...job,
        status: 'queued',
        workerId: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
    }

    state.leased = remainingLeased;
  }
}
