/**
 * Execution Store
 *
 * Persists workflow execution state as JSON files under .orbyt/executions/.
 *
 * Lifecycle:
 *   begin()      — called at workflow start; writes status:"running" immediately
 *                  so a process crash is always visible in the file.
 *   stepUpdate() — called after each step completes; updates the file in real-time
 *                  so partial progress is always observable.
 *   finalize()   — called on workflow end; writes final status, summary, and duration.
 *
 * All methods are non-fatal (errors are swallowed) — the store must never
 * interrupt actual workflow execution.
 *
 * @module storage
 */

import { basename } from 'node:path';
import type { StepResult } from '../types/core-types.js';
import { FileStorageAdapter } from './FileStorageAdapter.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PersistedStepState {
  /** Step identifier */
  id: string;
  /** Execution status */
  status: 'success' | 'failure' | 'skipped' | 'timeout' | 'running';
  /** Elapsed duration in milliseconds (monotonic) */
  duration: number;
  /** ISO 8601 wall-clock start timestamp */
  startedAt: string;
  /** ISO 8601 wall-clock end timestamp */
  finishedAt: string;
  /** Number of attempts made (1 = no retry) */
  attempts: number;
  /** Error message if the step failed */
  error?: string;
}

export interface ExecutionSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  timedOutSteps: number;
  /** Total wall-time of the entire workflow in milliseconds */
  totalDurationMs: number;
}

export interface PersistedExecution {
  /** Unique execution identifier (e.g. exec-1773167099155-rd81x4y4q) */
  executionId: string;
  /** Workflow name */
  workflow: string;
  /** Current execution status */
  status: 'running' | 'completed' | 'failed' | 'timeout';
  /** ISO 8601 start timestamp */
  startedAt: string;
  /** ISO 8601 end timestamp (absent while running) */
  finishedAt?: string;
  /** Monotonic duration in ms (absent while running) */
  totalDurationMs?: number;
  /** Per-step results (updated in real-time) */
  steps: PersistedStepState[];
  /** Aggregate counts (populated on finalize) */
  summary?: ExecutionSummary;
  /** Top-level error message if the workflow failed */
  error?: string;
}

// ─── ExecutionStore ───────────────────────────────────────────────────────────

/**
 * File-based execution state store.
 *
 * One JSON file per execution run, stored in the configured directory.
 * An in-memory cache avoids re-reading the file on every step update.
 */
export class ExecutionStore {
  private readonly adapter: FileStorageAdapter;
  /** In-memory cache: executionId → current state */
  private readonly cache = new Map<string, PersistedExecution>();

  constructor(dir: string) {
    this.adapter = new FileStorageAdapter(dir);
  }

  // ─── Write API ─────────────────────────────────────────────────────────────

  /**
   * Initialise the execution record with status "running".
   * Creates the storage directory if it does not exist.
   */
  begin(executionId: string, workflowName: string, startedAt: Date): void {
    try {
      this.adapter.ensureDir();
      const state: PersistedExecution = {
        executionId,
        workflow: workflowName,
        status: 'running',
        startedAt: startedAt.toISOString(),
        steps: [],
      };
      this.cache.set(executionId, state);
      this._write(executionId, state);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Update a single step's result in the persisted record.
   * Called after each step completes so partial progress is always visible.
   */
  stepUpdate(executionId: string, step: StepResult): void {
    try {
      const state = this._getOrLoad(executionId);
      if (!state) return;

      const entry: PersistedStepState = {
        id: step.stepId,
        status: step.status,
        duration: step.duration,
        startedAt: step.startedAt.toISOString(),
        finishedAt: step.completedAt.toISOString(),
        attempts: step.attempts,
        ...(step.error ? { error: step.error.message } : {}),
      };

      const idx = state.steps.findIndex(s => s.id === step.stepId);
      if (idx === -1) {
        state.steps.push(entry);
      } else {
        state.steps[idx] = entry;
      }

      this.cache.set(executionId, state);
      this._write(executionId, state);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Write the final execution record with status, summary, and total duration.
   * Deletes the in-memory cache entry after writing to free memory.
   */
  finalize(
    executionId: string,
    status: 'completed' | 'failed' | 'timeout',
    finishedAt: Date,
    stepResults: StepResult[],
    totalDurationMs: number,
    error?: Error,
  ): void {
    try {
      const state = this._getOrLoad(executionId) ?? {
        executionId,
        workflow: 'unknown',
        status: 'running' as const,
        startedAt: finishedAt.toISOString(),
        steps: [],
      };

      state.status = status;
      state.finishedAt = finishedAt.toISOString();
      state.totalDurationMs = totalDurationMs;
      state.steps = stepResults.map(r => ({
        id: r.stepId,
        status: r.status,
        duration: r.duration,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.completedAt.toISOString(),
        attempts: r.attempts,
        ...(r.error ? { error: r.error.message } : {}),
      }));
      state.summary = {
        totalSteps: stepResults.length,
        successfulSteps: stepResults.filter(r => r.status === 'success').length,
        failedSteps: stepResults.filter(r => r.status === 'failure').length,
        skippedSteps: stepResults.filter(r => r.status === 'skipped').length,
        timedOutSteps: stepResults.filter(r => r.status === 'timeout').length,
        totalDurationMs,
      };
      if (error) state.error = error.message;

      this._write(executionId, state);
      this.cache.delete(executionId); // Release memory — execution is done
    } catch {
      // Non-fatal
    }
  }

  // ─── Read API ──────────────────────────────────────────────────────────────

  /**
   * Read a persisted execution record by ID.
   * Returns null if the record does not exist or cannot be read.
   */
  read(executionId: string): PersistedExecution | null {
    try {
      const cached = this.cache.get(executionId);
      if (cached) return { ...cached }; // Return a copy

      return this.adapter.readJson<PersistedExecution>(this._fileName(executionId));
    } catch {
      return null;
    }
  }

  /**
   * List all execution IDs present in the store, sorted newest-first by filename.
   */
  list(): string[] {
    try {
      this.adapter.ensureDir();
      return this.adapter
        .list('', { suffix: '.json', filesOnly: true })
        .map(f => basename(f, '.json'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private _getOrLoad(executionId: string): PersistedExecution | null {
    const cached = this.cache.get(executionId);
    if (cached) return cached;

    const state = this.adapter.readJson<PersistedExecution>(this._fileName(executionId));
    if (!state) return null;
    this.cache.set(executionId, state);
    return state;
  }

  private _fileName(executionId: string): string {
    return `${executionId}.json`;
  }

  private _write(executionId: string, state: PersistedExecution): void {
    this.adapter.saveJson(this._fileName(executionId), state);
  }
}
