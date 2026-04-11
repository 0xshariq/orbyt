/**
 * Generic storage adapter contract used by engine persistence stores.
 *
 * The adapter is intentionally filesystem-oriented to keep v1 simple while
 * allowing future implementations (sqlite, postgres, object storage) to
 * implement the same methods.
 *
 * Purpose:
 * - Provide one stable persistence API for all engine stores
 * - Keep store logic independent from concrete storage backends
 * - Support .orbt JSON persistence and future backend swaps without
 *   changing store code
 *
 * Usage:
 * - Stores (ExecutionStore, ScheduleStore, WorkflowStore, CheckpointStore)
 *   depend on this interface, not on direct fs calls.
 * - A backend (for example FileStorageAdapter) implements this contract.
 * - Stores then call `ensureDir`, `saveJson`, `readJson`, `list`, and
 *   `delete` for all persistence operations.
 *
 * Example:
 * ```ts
 * const adapter: StorageAdapter = new FileStorageAdapter('.orbyt/executions');
 * adapter.ensureDir();
 * adapter.saveJson('exec-123.orbt', { status: 'running' });
 * const state = adapter.readJson<{ status: string }>('exec-123.orbt');
 * ```
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface StorageWriteOptions {
  /**
   * Pretty-print JSON output for readability/debugging.
   * Implementations may ignore this when not applicable.
   */
  pretty?: boolean;

  /**
   * Hint to perform atomic writes (temp file + rename).
   * Implementations may ignore this when not supported.
   */
  atomic?: boolean;
}

export interface StorageDeleteOptions {
  /**
   * Recursively delete directories.
   */
  recursive?: boolean;

  /**
   * Ignore missing paths and best-effort delete.
   */
  force?: boolean;
}

export interface StorageListOptions {
  /**
   * Filter results by file-name suffix.
   */
  suffix?: string;

  /**
   * Return directories only.
   */
  directoriesOnly?: boolean;

  /**
   * Return files only.
   */
  filesOnly?: boolean;

  /**
   * Traverse subdirectories.
   */
  recursive?: boolean;
}

export interface StorageAdapter {
  /** Ensure that a directory exists relative to adapter base path. */
  ensureDir(relativePath?: string): void;

  /** Check if a file or directory exists relative to adapter base path. */
  exists(relativePath: string): boolean;

  /** Persist JSON-serializable data at relative path. */
  saveJson(relativePath: string, data: unknown, options?: StorageWriteOptions): void;

  /** Read JSON data and deserialize it into caller-provided shape. */
  readJson<T = unknown>(relativePath: string): T | null;

  /** Delete file/directory at relative path. */
  delete(relativePath: string, options?: StorageDeleteOptions): void;

  /**
   * List entries inside a relative directory.
   * Returns file/directory names relative to `relativeDir`.
   */
  list(
    relativeDir?: string,
    options?: StorageListOptions,
  ): string[];

  /** Optional raw text write support for non-JSON payloads. */
  saveText?(relativePath: string, data: string): void;

  /** Optional raw text read support for non-JSON payloads. */
  readText?(relativePath: string): string | null;
}
