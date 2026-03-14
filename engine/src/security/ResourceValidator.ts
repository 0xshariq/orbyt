import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { ParsedStep, ResolutionContext } from '../types/core-types.js';
import { StepError } from '../errors/StepError.js';

const INPUT_PATH_KEYS = new Set(['input', 'path', 'source', 'src', 'file', 'from']);
const OUTPUT_PATH_KEYS = new Set([
  'output',
  'destination',
  'dest',
  'target',
  'to',
  'outFile',
  'outDir',
  'directory',
  'dir',
]);

/**
 * Resource/path guardrails executed before adapter invocation.
 *
 * Goals:
 * - Detect missing input paths early with actionable errors
 * - Validate output parent directory existence/writability
 * - Prevent high-risk overwrites for known mutating fs actions
 */
export class ResourceValidator {
  validate(step: ParsedStep, input: Record<string, any>, context?: ResolutionContext): void {
    const workingDir = this.resolveWorkingDir(context);

    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== 'string') continue;
      if (!this.isLocalPathCandidate(value)) continue;

      if (INPUT_PATH_KEYS.has(key)) {
        this.validateInputPath(step, key, value, workingDir);
      }

      if (OUTPUT_PATH_KEYS.has(key)) {
        this.validateOutputPath(step, key, value, workingDir, input);
      }
    }
  }

  private validateInputPath(step: ParsedStep, key: string, pathValue: string, workingDir: string): void {
    const resolvedPath = this.resolvePath(pathValue, workingDir);
    if (!existsSync(resolvedPath)) {
      throw StepError.invalidConfig(
        step.id,
        `Input path does not exist (${key}=${pathValue})`,
        step.name,
      );
    }
  }

  private validateOutputPath(
    step: ParsedStep,
    key: string,
    pathValue: string,
    workingDir: string,
    input: Record<string, any>,
  ): void {
    const resolvedPath = this.resolvePath(pathValue, workingDir);

    // If value points to a directory, validate that directory directly.
    const treatedAsDirectory = this.isDirectoryHint(key, pathValue);
    const parentDir = treatedAsDirectory ? resolvedPath : dirname(resolvedPath);

    if (!existsSync(parentDir)) {
      throw StepError.invalidConfig(
        step.id,
        `Output directory does not exist (${key} parent=${parentDir})`,
        step.name,
      );
    }

    try {
      const st = statSync(parentDir);
      if (!st.isDirectory()) {
        throw StepError.invalidConfig(
          step.id,
          `Output parent is not a directory (${parentDir})`,
          step.name,
        );
      }
      accessSync(parentDir, constants.W_OK);
    } catch (error) {
      if (error instanceof Error && !(error instanceof StepError)) {
        throw StepError.invalidConfig(
          step.id,
          `Output directory is not writable (${parentDir})`,
          step.name,
        );
      }
      throw error;
    }

    // Conservative overwrite safety: enforce explicit intent for high-risk fs mutations.
    if (this.isHighRiskFsMutation(step.action) && existsSync(resolvedPath)) {
      const allowOverwrite = input.overwrite === true || input.force === true;
      if (!allowOverwrite) {
        throw StepError.invalidConfig(
          step.id,
          `Refusing to overwrite existing path (${resolvedPath}) without overwrite/force flag`,
          step.name,
        );
      }
    }
  }

  private isHighRiskFsMutation(action: string): boolean {
    return action === 'fs.write' || action === 'fs.copy' || action === 'fs.move' || action === 'fs.delete';
  }

  private isDirectoryHint(key: string, rawValue: string): boolean {
    if (key === 'dir' || key === 'directory' || key === 'outDir') return true;
    return rawValue.endsWith('/') || rawValue.endsWith('\\');
  }

  private resolveWorkingDir(context?: ResolutionContext): string {
    const contextDir = context?.env?.PWD;
    if (typeof contextDir === 'string' && contextDir.length > 0) return contextDir;
    return process.cwd();
  }

  private resolvePath(pathValue: string, workingDir: string): string {
    return isAbsolute(pathValue) ? pathValue : resolve(workingDir, pathValue);
  }

  private isLocalPathCandidate(value: string): boolean {
    const v = value.trim();
    if (!v) return false;

    // Skip URL-like values.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) return false;

    // Common local path shapes.
    return (
      v.startsWith('.') ||
      v.startsWith('/') ||
      v.startsWith('~') ||
      v.includes('/') ||
      v.includes('\\')
    );
  }
}
