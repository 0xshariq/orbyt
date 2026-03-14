import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';

export interface RuntimeContextSnapshot {
  executionId: string;
  workflowId: string;
  stepId?: string;
  timestamp: string;
  context: Record<string, unknown>;
}

/**
 * Stores runtime artifacts that are safe to regenerate but useful for
 * diagnostics, replay tooling, and future optimization paths.
 */
export class RuntimeArtifactStore {
  private readonly rootDir: string;
  private readonly dagDir: string;
  private readonly contextDir: string;
  private readonly lockDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.dagDir = join(rootDir, 'dag');
    this.contextDir = join(rootDir, 'context');
    this.lockDir = join(rootDir, 'locks');
  }

  ensureDirs(): void {
    try {
      mkdirSync(this.dagDir, { recursive: true });
      mkdirSync(this.contextDir, { recursive: true });
      mkdirSync(this.lockDir, { recursive: true });
    } catch {
      // Non-fatal runtime bootstrap.
    }
  }

  saveDagPlan(workflowId: string, plan: unknown): void {
    try {
      this.ensureDirs();
      writeFileSync(join(this.dagDir, `${workflowId}.json`), JSON.stringify(plan, null, 2), 'utf-8');
    } catch {
      // Non-fatal artifact write.
    }
  }

  loadDagPlan<T = unknown>(workflowId: string): T | null {
    try {
      const filePath = join(this.dagDir, `${workflowId}.json`);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
    } catch {
      return null;
    }
  }

  saveContextSnapshot(snapshot: RuntimeContextSnapshot): void {
    try {
      this.ensureDirs();
      writeFileSync(
        join(this.contextDir, `${snapshot.executionId}.json`),
        JSON.stringify(snapshot, null, 2),
        'utf-8',
      );
    } catch {
      // Non-fatal artifact write.
    }
  }

  loadContextSnapshot(executionId: string): RuntimeContextSnapshot | null {
    try {
      const filePath = join(this.contextDir, `${executionId}.json`);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf-8')) as RuntimeContextSnapshot;
    } catch {
      return null;
    }
  }

  acquireExecutionLock(executionId: string): boolean {
    try {
      this.ensureDirs();
      const lockPath = join(this.lockDir, `${executionId}.lock`);
      const fd = openSync(lockPath, 'wx');
      closeSync(fd);
      return true;
    } catch {
      return false;
    }
  }

  releaseExecutionLock(executionId: string): boolean {
    try {
      const lockPath = join(this.lockDir, `${executionId}.lock`);
      if (!existsSync(lockPath)) return false;
      rmSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }

  getRootDir(): string {
    return this.rootDir;
  }
}
