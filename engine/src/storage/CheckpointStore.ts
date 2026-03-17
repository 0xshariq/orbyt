import { basename } from 'node:path';
import { FileStorageAdapter } from './FileStorageAdapter.js';

/**
 * Workflow status snapshot used by checkpoint persistence.
 */
export type CheckpointWorkflowStatus = 'running' | 'completed' | 'failed' | 'timeout';

/**
 * Why the checkpoint was written.
 * Useful for resume heuristics and observability.
 */
export type CheckpointReason =
  | 'workflow-started'
  | 'workflow-resumed'
  | 'step-updated'
  | 'workflow-completed'
  | 'workflow-failed'
  | 'workflow-timeout';

/**
 * Minimal per-step durable state captured in each checkpoint.
 */
export interface StepSnapshot {
  id: string;
  status: 'success' | 'failure' | 'skipped' | 'timeout' | 'running' | 'pending';
  attempts: number;
  output?: unknown;
  error?: string;
  durationMs?: number;
  completedAt?: string;
}

/**
 * Durable execution snapshot used for crash recovery and future resume logic.
 */
export interface ExecutionCheckpointSnapshot {
  runId: string;
  workflowId: string;
  status: CheckpointWorkflowStatus;
  stepStates: Record<string, StepSnapshot>;
  context: {
    env?: Record<string, unknown>;
    inputs?: Record<string, unknown>;
    custom?: Record<string, unknown>;
    stepOutputs?: Record<string, unknown>;
  };
  metadata: {
    startedAt: number;
    updatedAt: number;
    completedAt?: number;
    checkpointReason: CheckpointReason;
  };
}

/**
 * File-backed checkpoint store.
 *
 * One JSON file per run ID. All operations are best-effort and non-fatal,
 * so checkpoint failures never break workflow execution.
 */
export class CheckpointStore {
  private readonly adapter: FileStorageAdapter;

  constructor(dir: string) {
    this.adapter = new FileStorageAdapter(dir);
  }

  save(snapshot: ExecutionCheckpointSnapshot): void {
    try {
      this.adapter.ensureDir();
      // Defensive clone to avoid accidental mutation side effects.
      const sanitized = this.sanitize(snapshot);
      this.adapter.saveJson(this.fileName(snapshot.runId), sanitized);
    } catch {
      // Non-fatal by design
    }
  }

  load(runId: string): ExecutionCheckpointSnapshot | null {
    try {
      return this.adapter.readJson<ExecutionCheckpointSnapshot>(this.fileName(runId));
    } catch {
      return null;
    }
  }

  delete(runId: string): void {
    try {
      this.adapter.delete(this.fileName(runId));
    } catch {
      // Non-fatal by design
    }
  }

  listRunIds(): string[] {
    try {
      this.adapter.ensureDir();
      // Stable ordering simplifies operational tooling and tests.
      return this.adapter
        .list('', { suffix: '.json', filesOnly: true })
        .map((f) => basename(f, '.json'))
        .sort();
    } catch {
      return [];
    }
  }

  private fileName(runId: string): string {
    return `${runId}.json`;
  }

  private sanitize(snapshot: ExecutionCheckpointSnapshot): ExecutionCheckpointSnapshot {
    const cloned = JSON.parse(JSON.stringify(snapshot)) as ExecutionCheckpointSnapshot;
    return cloned;
  }
}
