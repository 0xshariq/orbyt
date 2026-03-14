import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AdapterMetadataRecord {
  adapterName: string;
  adapterVersion: string;
  supportedActions: string[];
  cachedAt: string;
}

/**
 * File-based adapter metadata cache.
 *
 * Stores one metadata file per adapter+version so repeated capability checks
 * don't require repeated runtime introspection.
 */
export class AdapterMetadataCache {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  save(metadata: AdapterMetadataRecord): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      const key = this.buildKey(metadata.adapterName, metadata.adapterVersion);
      writeFileSync(join(this.dir, `${key}.json`), JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {
      // Non-fatal cache write.
    }
  }

  load(adapterName: string, adapterVersion: string): AdapterMetadataRecord | null {
    try {
      const key = this.buildKey(adapterName, adapterVersion);
      const filePath = join(this.dir, `${key}.json`);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf-8')) as AdapterMetadataRecord;
    } catch {
      return null;
    }
  }

  list(): AdapterMetadataRecord[] {
    try {
      if (!existsSync(this.dir)) return [];
      return readdirSync(this.dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => JSON.parse(readFileSync(join(this.dir, name), 'utf-8')) as AdapterMetadataRecord);
    } catch {
      return [];
    }
  }

  delete(adapterName: string, adapterVersion: string): boolean {
    try {
      const key = this.buildKey(adapterName, adapterVersion);
      const filePath = join(this.dir, `${key}.json`);
      if (!existsSync(filePath)) return false;
      rmSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private buildKey(adapterName: string, adapterVersion: string): string {
    return createHash('sha256').update(`${adapterName}@${adapterVersion}`).digest('hex');
  }
}
