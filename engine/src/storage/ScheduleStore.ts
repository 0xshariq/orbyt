/**
 * Schedule Store
 *
 * Persists workflow schedule state under .orbyt/schedules/.
 * One .orbt file per schedule; enables restart recovery so the scheduler
 * can reload all known schedules without re-registration by callers.
 *
 * Layout:
 *   .orbyt/schedules/<scheduleId>.orbt
 *
 * Primary purposes:
 *   - Persist cron/interval schedules so they survive process restarts
 *   - Track last-run / next-run timestamps for missed-run recovery
 *   - Record consecutive error counts for circuit-breaker logic
 *
 * All methods are non-fatal (errors are swallowed) — the store must never
 * interrupt the scheduler or workflow execution.
 *
 * @module storage
 */

import { basename } from 'node:path';
import type { ScheduleStatus, ScheduleTriggerType } from '../types/core-types.js';
import { FileStorageAdapter } from './FileStorageAdapter.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PersistedSchedule {
  /** Unique schedule identifier */
  scheduleId: string;
  /** Identifier of the workflow this schedule triggers */
  workflowId: string;
  /** Human-readable workflow name (for display only) */
  workflowName: string;
  /**
   * Trigger type — covers all scheduling modalities:
   *   'cron'     — cron expression (cronExpression field required)
   *   'interval' — fixed interval (intervalMs field required)
   *   'once'     — one-shot at a future time (nextRunAt used as fire time)
   *   'event'    — external event bus trigger (eventSource field required)
   *   'webhook'  — inbound HTTP call (webhookEndpoint + optional webhookSecret)
   *   'manual'   — user-triggered; stored for replay/audit history
   */
  triggerType: ScheduleTriggerType;

  // ── Cron / interval fields ──────────────────────────────────────────────────
  /** Cron expression (required when triggerType is 'cron') */
  cronExpression?: string;
  /** Interval in milliseconds (required when triggerType is 'interval') */
  intervalMs?: number;
  /** Timezone for cron evaluation (default: UTC) */
  timezone?: string;

  // ── Event trigger fields ────────────────────────────────────────────────────
  /**
   * Event source identifier (required when triggerType is 'event').
   * E.g. 'analytics.report.ready', 'billing.invoice.created'.
   */
  eventSource?: string;
  /** Optional filter expression evaluated against the event payload */
  eventFilter?: string;

  // ── Webhook trigger fields ──────────────────────────────────────────────────
  /**
   * Inbound webhook path / endpoint (required when triggerType is 'webhook').
   * E.g. '/hooks/deploy' or 'https://hooks.example.com/deploy'.
   */
  webhookEndpoint?: string;
  /**
   * HMAC secret used for payload signature verification.
   * Stored as-is; callers should pass an already-encrypted value.
   */
  webhookSecret?: string;
  /** HTTP method expected on the webhook endpoint (default: POST) */
  webhookMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH';

  // ── Status & lifecycle ──────────────────────────────────────────────────────
  /**
   * Current schedule status.
   * 'active'   — running normally
   * 'paused'   — temporarily disabled (can be re-enabled)
   * 'disabled' — permanently disabled
   * 'expired'  — end date passed or maxExecutions reached
   */
  status: ScheduleStatus;
  /** ISO 8601 timestamp of when this schedule was first created */
  createdAt: string;
  /** ISO 8601 timestamp of when this schedule was last updated */
  updatedAt: string;

  // ── Run history ─────────────────────────────────────────────────────────────
  /** ISO 8601 timestamp of the last trigger fire */
  lastRunAt?: string;
  /** Result of the last execution */
  lastStatus?: 'completed' | 'failed' | 'timeout';
  /** ISO 8601 timestamp of the next scheduled trigger (cron/interval/once) */
  nextRunAt?: string;

  // ── Limits ──────────────────────────────────────────────────────────────────
  /** Hard stop date — schedule will not fire after this (ISO 8601) */
  endDate?: string;
  /** Maximum number of executions (undefined = unlimited) */
  maxExecutions?: number;
  /** Number of times the schedule has fired */
  executionCount: number;
  /** Consecutive error count — reset to 0 on success */
  errorCount: number;
  /** Error message from the most recent failure */
  lastError?: string;

  // ── Payload ─────────────────────────────────────────────────────────────────
  /** Static input data merged into each triggered execution */
  input?: Record<string, any>;
}

// ─── ScheduleStore ────────────────────────────────────────────────────────────

/**
 * File-based schedule state store.
 *
 * An in-memory cache avoids re-reading files on every access.
 * The cache is always the source of truth for in-flight updates;
 * the file acts as the durable record for restarts.
 */
export class ScheduleStore {
  private readonly adapter: FileStorageAdapter;
  /** In-memory cache: scheduleId → current state */
  private readonly cache = new Map<string, PersistedSchedule>();

  constructor(dir: string) {
    this.adapter = new FileStorageAdapter(dir);
  }

  // ─── Write API ─────────────────────────────────────────────────────────────

  /**
   * Persist a schedule record.
   * Creates the storage directory on first call.
   * If the schedule already exists it is fully replaced.
   */
  save(schedule: PersistedSchedule): void {
    try {
      this.adapter.ensureDir();
      const updated: PersistedSchedule = {
        ...schedule,
        updatedAt: new Date().toISOString(),
      };
      this.cache.set(schedule.scheduleId, updated);
      this._write(schedule.scheduleId, updated);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Record the outcome of a schedule trigger.
   *
   * - Updates `lastRunAt`, `lastStatus`, `nextRunAt`
   * - Increments `executionCount`
   * - On success: resets `errorCount` and clears `lastError`
   * - On failure: increments `errorCount` and stores `lastError`
   */
  updateLastRun(
    scheduleId: string,
    status: 'completed' | 'failed' | 'timeout',
    runAt: Date,
    nextRunAt?: Date,
    error?: string,
  ): void {
    try {
      const record = this._getOrLoad(scheduleId);
      if (!record) return;

      record.lastRunAt = runAt.toISOString();
      record.lastStatus = status;
      record.executionCount = (record.executionCount ?? 0) + 1;
      if (nextRunAt) record.nextRunAt = nextRunAt.toISOString();

      if (status === 'completed') {
        record.errorCount = 0;
        delete record.lastError;
      } else {
        record.errorCount = (record.errorCount ?? 0) + 1;
        if (error) record.lastError = error;
      }

      record.updatedAt = new Date().toISOString();
      this.cache.set(scheduleId, record);
      this._write(scheduleId, record);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Mark a schedule as active.
   * No-op if the schedule does not exist.
   */
  enable(scheduleId: string): void {
    this._setStatus(scheduleId, 'active');
  }

  /**
   * Mark a schedule as paused — it will not fire until re-enabled.
   * No-op if the schedule does not exist.
   */
  disable(scheduleId: string): void {
    this._setStatus(scheduleId, 'paused');
  }

  /**
   * Remove a schedule from both the cache and disk.
   * Safe to call if the schedule does not exist.
   */
  delete(scheduleId: string): void {
    try {
      this.cache.delete(scheduleId);
      const filePath = this._fileName(scheduleId);
      if (this.adapter.exists(filePath)) this.adapter.delete(filePath);
    } catch {
      // Non-fatal
    }
  }

  // ─── Read API ──────────────────────────────────────────────────────────────

  /**
   * Read a single schedule by ID.
   * Returns null if not found.
   */
  load(scheduleId: string): PersistedSchedule | null {
    try {
      const cached = this.cache.get(scheduleId);
      if (cached) return { ...cached };

      return this.adapter.readJson<PersistedSchedule>(this._fileName(scheduleId));
    } catch {
      return null;
    }
  }

  /**
   * Return all persisted schedules, sorted by `createdAt` ascending.
   */
  list(): PersistedSchedule[] {
    try {
      this.adapter.ensureDir();
      return this.adapter
        .list('', { suffix: '.orbt', filesOnly: true })
        .filter(f => f.endsWith('.orbt'))
        .flatMap(f => {
          try {
            const id = basename(f, '.orbt');
            const record = this._getOrLoad(id);
            return record ? [record] : [];
          } catch {
            return [];
          }
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  }

  /**
   * Return only schedules that are currently active.
   */
  listEnabled(): PersistedSchedule[] {
    return this.list().filter(s => s.status === 'active');
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private _setStatus(scheduleId: string, status: ScheduleStatus): void {
    try {
      const record = this._getOrLoad(scheduleId);
      if (!record) return;
      record.status = status;
      record.updatedAt = new Date().toISOString();
      this.cache.set(scheduleId, record);
      this._write(scheduleId, record);
    } catch {
      // Non-fatal
    }
  }

  private _getOrLoad(scheduleId: string): PersistedSchedule | null {
    const cached = this.cache.get(scheduleId);
    if (cached) return cached;

    const record = this.adapter.readJson<PersistedSchedule>(this._fileName(scheduleId));
    if (!record) return null;
    this.cache.set(scheduleId, record);
    return record;
  }

  private _fileName(scheduleId: string): string {
    return `${scheduleId}.orbt`;
  }

  private _write(scheduleId: string, record: PersistedSchedule): void {
    this.adapter.saveJson(this._fileName(scheduleId), record);
  }
}
