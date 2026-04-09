/**
 * Workflow Store
 *
 * Persists versioned workflow definitions under .orbyt/workflows/.
 * Each workflow gets its own subdirectory; each save creates a new versioned file.
 *
 * Layout:
 *   .orbyt/workflows/<workflowName>/v1.orbt
 *   .orbyt/workflows/<workflowName>/v2.orbt
 *   ...
 *
 * Primary purpose: replay a failed run against the exact workflow definition
 * that was used — not against a potentially-modified current version.
 *
 * All methods are non-fatal (errors are swallowed) — the store must never
 * interrupt actual workflow execution.
 *
 * @module storage
 */

import type { ParsedWorkflow } from '../types/core-types.js';
import { FileStorageAdapter } from './FileStorageAdapter.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PersistedWorkflow {
  /** Workflow identifier (name or generated) */
  workflowId: string;
  /** Version number (1-based, auto-incremented) */
  version: number;
  /** ISO 8601 timestamp of when this version was saved */
  savedAt: string;
  /** The full parsed workflow definition */
  definition: ParsedWorkflow;
}

// ─── WorkflowStore ────────────────────────────────────────────────────────────

/**
 * File-based workflow definition store.
 *
 * Stores multiple versions of each workflow definition so a failed execution
 * can always be replayed against the exact definition that produced it.
 *
 * An in-memory cache for the latest version of each workflow avoids
 * re-reading the file on every `save()` call.
 */
export class WorkflowStore {
  private readonly adapter: FileStorageAdapter;
  /** Cache: workflowId → latest saved version number */
  private readonly latestVersionCache = new Map<string, number>();

  constructor(dir: string) {
    this.adapter = new FileStorageAdapter(dir);
  }

  // ─── Write API ─────────────────────────────────────────────────────────────

  /**
   * Save a workflow definition.
   * A new version file is created on each call; the version number is
   * determined by inspecting existing files (or the cache).
   */
  save(workflow: ParsedWorkflow): void {
    try {
      const workflowId = this._resolveId(workflow);
      this.adapter.ensureDir(workflowId);

      const nextVersion = this._nextVersion(workflowId);
      const record: PersistedWorkflow = {
        workflowId,
        version: nextVersion,
        savedAt: new Date().toISOString(),
        definition: workflow,
      };

      this.adapter.saveJson(this._versionPath(workflowId, nextVersion), record);
      this.latestVersionCache.set(workflowId, nextVersion);
    } catch {
      // Non-fatal
    }
  }

  // ─── Read API ──────────────────────────────────────────────────────────────

  /**
   * Load the most recently saved version of a workflow.
   * Returns null if the workflow has never been saved.
   */
  loadLatest(workflowId: string): PersistedWorkflow | null {
    try {
      const versions = this.listVersions(workflowId);
      if (versions.length === 0) return null;
      return this._readVersion(workflowId, versions[0]);
    } catch {
      return null;
    }
  }

  /**
   * Load a specific version of a workflow.
   * When `version` is omitted the latest version is returned.
   */
  load(workflowId: string, version?: number): PersistedWorkflow | null {
    try {
      if (version === undefined) return this.loadLatest(workflowId);
      return this._readVersion(workflowId, version);
    } catch {
      return null;
    }
  }

  /**
   * Return all saved version numbers for a workflow, sorted newest-first.
   */
  listVersions(workflowId: string): number[] {
    try {
      if (!this.adapter.exists(workflowId)) return [];
      return this.adapter
        .list(workflowId, { suffix: '.orbt', filesOnly: true })
        .filter(f => /^v\d+\.orbt$/.test(f))
        .map(f => parseInt(f.slice(1, -5), 10))
        .sort((a, b) => b - a); // newest first
    } catch {
      return [];
    }
  }

  /**
   * Return all workflow IDs that have at least one saved version.
   */
  list(): string[] {
    try {
      this.adapter.ensureDir();
      return this.adapter
        .list('', { directoriesOnly: true })
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Delete a specific version of a workflow, or all versions if `version`
   * is omitted (removes the entire workflow subdirectory).
   */
  delete(workflowId: string, version?: number): void {
    try {
      if (version !== undefined) {
        const filePath = this._versionPath(workflowId, version);
        if (this.adapter.exists(filePath)) this.adapter.delete(filePath);
        // Invalidate cache if we deleted the latest version
        if (this.latestVersionCache.get(workflowId) === version) {
          this.latestVersionCache.delete(workflowId);
        }
      } else {
        if (this.adapter.exists(workflowId)) this.adapter.delete(workflowId, { recursive: true });
        this.latestVersionCache.delete(workflowId);
      }
    } catch {
      // Non-fatal
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /** Derive a stable ID from the workflow — prefer `name`, fallback to `metadata.name`. */
  private _resolveId(workflow: ParsedWorkflow): string {
    const raw = workflow.name ?? workflow.metadata?.name ?? 'unnamed';
    // Sanitise for use as a directory name (keep alphanumeric, hyphen, underscore, dot)
    return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Calculate the next version number.
   * Reads the cache first; if not cached, scans the directory.
   */
  private _nextVersion(workflowId: string): number {
    const cached = this.latestVersionCache.get(workflowId);
    if (cached !== undefined) return cached + 1;

    try {
      const existing = this.adapter
        .list(workflowId, { suffix: '.orbt', filesOnly: true })
        .filter(f => /^v\d+\.orbt$/.test(f))
        .map(f => parseInt(f.slice(1, -5), 10));
      return existing.length === 0 ? 1 : Math.max(...existing) + 1;
    } catch {
      return 1;
    }
  }

  private _readVersion(workflowId: string, version: number): PersistedWorkflow | null {
    return this.adapter.readJson<PersistedWorkflow>(this._versionPath(workflowId, version));
  }

  private _versionPath(workflowId: string, version: number): string {
    return `${workflowId}/v${version}.orbt`;
  }
}
