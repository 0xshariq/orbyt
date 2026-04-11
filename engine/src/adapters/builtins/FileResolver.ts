/**
 * File Resolver
 * 
 * Resolves file paths with variable interpolation and glob support.
 */

import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

export interface FileResolverOptions {
  /**
   * Base directory for relative paths
   */
  baseDir: string;

  /**
   * Variables for interpolation
   */
  variables?: Record<string, string>;

  /**
   * Enable glob pattern matching
   */
  enableGlob?: boolean;
}

export class FileResolver {
  private baseDir: string;
  private variables: Record<string, string>;
  private enableGlob: boolean;

  constructor(options: FileResolverOptions) {
    this.baseDir = options.baseDir;
    this.variables = options.variables || {};
    this.enableGlob = options.enableGlob ?? true;
  }

  /**
   * Resolve a single file path
   */
  async resolvePath(filePath: string): Promise<string> {
    // Interpolate variables
    const interpolated = this.interpolateVariables(filePath);

    // Resolve to absolute path
    const resolved = path.isAbsolute(interpolated)
      ? interpolated
      : path.resolve(this.baseDir, interpolated);

    return resolved;
  }

  /**
   * Resolve paths with glob support
   */
  async resolveGlob(pattern: string): Promise<string[]> {
    if (!this.enableGlob) {
      return [await this.resolvePath(pattern)];
    }

    // Interpolate variables
    const interpolated = this.interpolateVariables(pattern);

    // Simple glob implementation: support * and ? in file name segment.
    if (!interpolated.includes('*') && !interpolated.includes('?')) {
      // No wildcards, just return the path
      return [path.isAbsolute(interpolated) ? interpolated : path.resolve(this.baseDir, interpolated)];
    }

    const absolutePattern = path.isAbsolute(interpolated)
      ? interpolated
      : path.resolve(this.baseDir, interpolated);

    const dir = path.dirname(absolutePattern);
    const filePattern = path.basename(absolutePattern);

    if (!existsSync(dir)) {
      return [];
    }

    const regex = this.globToRegExp(filePattern);
    const matches = readdirSync(dir)
      .filter((entry) => regex.test(entry))
      .map((entry) => path.join(dir, entry))
      .sort();

    return matches;
  }

  private globToRegExp(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Interpolate variables in a string
   */
  private interpolateVariables(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = this.variables[varName];
      if (value === undefined) {
        return match; // Return original if variable not found
      }
      return value;
    });
  }

  /**
   * Update variables
   */
  setVariables(variables: Record<string, string>): void {
    this.variables = { ...this.variables, ...variables };
  }

  /**
   * Get current base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Change base directory
   */
  setBaseDir(baseDir: string): void {
    this.baseDir = baseDir;
  }
}
