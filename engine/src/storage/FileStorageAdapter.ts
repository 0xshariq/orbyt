import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StorageAdapter } from './StorageAdapter.js';

/**
 * File-based implementation of StorageAdapter.
 */
export class FileStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  ensureDir(relativePath = ''): void {
    mkdirSync(this.resolve(relativePath), { recursive: true });
  }

  exists(relativePath: string): boolean {
    return existsSync(this.resolve(relativePath));
  }

  saveJson(relativePath: string, data: unknown): void {
    const fullPath = this.resolve(relativePath);
    const parent = this.parentDir(relativePath);
    this.ensureDir(parent);
    writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  readJson<T = unknown>(relativePath: string): T | null {
    const fullPath = this.resolve(relativePath);
    if (!existsSync(fullPath)) return null;

    try {
      return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
    } catch {
      return null;
    }
  }

  delete(relativePath: string, options?: { recursive?: boolean }): void {
    const fullPath = this.resolve(relativePath);
    if (!existsSync(fullPath)) return;
    rmSync(fullPath, { recursive: options?.recursive ?? false });
  }

  list(
    relativeDir = '',
    options?: {
      suffix?: string;
      directoriesOnly?: boolean;
      filesOnly?: boolean;
    },
  ): string[] {
    const fullDir = this.resolve(relativeDir);
    if (!existsSync(fullDir)) return [];

    const entries = readdirSync(fullDir, { withFileTypes: true });
    return entries
      .filter((entry) => {
        if (options?.directoriesOnly && !entry.isDirectory()) return false;
        if (options?.filesOnly && !entry.isFile()) return false;
        if (options?.suffix && !entry.name.endsWith(options.suffix)) return false;
        return true;
      })
      .map((entry) => entry.name);
  }

  private resolve(relativePath: string): string {
    return join(this.baseDir, relativePath);
  }

  private parentDir(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    return idx === -1 ? '' : normalized.slice(0, idx);
  }
}
