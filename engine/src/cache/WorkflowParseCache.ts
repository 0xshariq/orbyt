import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedWorkflow } from '../types/core-types.js';

export interface CachedWorkflowRecord {
  cacheKey: string;
  source: string;
  sourceHash: string;
  cachedAt: string;
  workflow: ParsedWorkflow;
}

/**
 * File-based cache for parsed workflow objects.
 *
 * A cache key is derived from source identifier (path/content tag) + hash of
 * source content. This ensures stale entries are naturally bypassed whenever
 * workflow content changes.
 */
export class WorkflowParseCache {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  save(source: string, sourceHash: string, workflow: ParsedWorkflow): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      const key = this.buildKey(source, sourceHash);
      const record: CachedWorkflowRecord = {
        cacheKey: key,
        source,
        sourceHash,
        cachedAt: new Date().toISOString(),
        workflow,
      };
      writeFileSync(join(this.dir, `${key}.json`), JSON.stringify(record, null, 2), 'utf-8');
    } catch {
      // Non-fatal cache write.
    }
  }

  load(source: string, sourceHash: string): CachedWorkflowRecord | null {
    try {
      const key = this.buildKey(source, sourceHash);
      const filePath = join(this.dir, `${key}.json`);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf-8')) as CachedWorkflowRecord;
    } catch {
      return null;
    }
  }

  list(): CachedWorkflowRecord[] {
    try {
      if (!existsSync(this.dir)) return [];
      return readdirSync(this.dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const raw = readFileSync(join(this.dir, name), 'utf-8');
          return JSON.parse(raw) as CachedWorkflowRecord;
        });
    } catch {
      return [];
    }
  }

  delete(source: string, sourceHash: string): boolean {
    try {
      const key = this.buildKey(source, sourceHash);
      const filePath = join(this.dir, `${key}.json`);
      if (!existsSync(filePath)) return false;
      rmSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      if (!existsSync(this.dir)) return;
      for (const name of readdirSync(this.dir)) {
        if (name.endsWith('.json')) {
          rmSync(join(this.dir, name));
        }
      }
    } catch {
      // Non-fatal cache cleanup.
    }
  }

  private buildKey(source: string, sourceHash: string): string {
    return createHash('sha256').update(`${source}::${sourceHash}`).digest('hex');
  }
}
