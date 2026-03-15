/**
 * Generic storage adapter contract used by engine persistence stores.
 *
 * The adapter is intentionally filesystem-oriented to keep v1 simple while
 * allowing future implementations (sqlite, postgres, object storage) to
 * implement the same methods.
 */
export interface StorageAdapter {
  ensureDir(relativePath?: string): void;
  exists(relativePath: string): boolean;
  saveJson(relativePath: string, data: unknown): void;
  readJson<T = unknown>(relativePath: string): T | null;
  delete(relativePath: string, options?: { recursive?: boolean }): void;
  list(
    relativeDir?: string,
    options?: {
      suffix?: string;
      directoriesOnly?: boolean;
      filesOnly?: boolean;
    },
  ): string[];
}
