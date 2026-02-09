/**
 * File Resolver
 * 
 * Resolves file paths with variable interpolation and glob support.
 */

import path from 'node:path';

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

    // Simple glob implementation: check if pattern contains wildcards
    if (!interpolated.includes('*') && !interpolated.includes('?')) {
      // No wildcards, just return the path
      return [path.isAbsolute(interpolated) ? interpolated : path.resolve(this.baseDir, interpolated)];
    }

    // For now, return the pattern itself if it has wildcards
    // A full implementation would require a glob library
    return [path.isAbsolute(interpolated) ? interpolated : path.resolve(this.baseDir, interpolated)];
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
