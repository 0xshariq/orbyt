/**
 * CLI Command Resolver
 * 
 * Resolves CLI commands with path resolution and environment setup.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';

export interface CommandResolution {
  /**
   * Resolved command path or name
   */
  command: string;

  /**
   * Whether the command was found in PATH
   */
  found: boolean;

  /**
   * Absolute path to the command (if found)
   */
  absolutePath?: string;

  /**
   * Resolved arguments
   */
  args: string[];

  /**
   * Environment variables
   */
  env: Record<string, string>;
}

export class CLICommandResolver {
  private cwd: string;
  private env: Record<string, string>;

  constructor(cwd: string = process.cwd(), env: Record<string, string> = {}) {
    this.cwd = cwd;
    this.env = { ...process.env, ...env } as Record<string, string>;
  }

  /**
   * Resolve a CLI command
   */
  async resolve(command: string, args: string[] = []): Promise<CommandResolution> {
    // Try to find the command on disk or in PATH.
    let absolutePath: string | undefined;
    let found = false;

    // Explicit path: resolve against cwd and verify existence.
    if (command.includes('/') || command.includes('\\')) {
      const resolvedPath = path.resolve(this.cwd, command);
      if (existsSync(resolvedPath)) {
        absolutePath = resolvedPath;
        found = true;
      }
    } else {
      // Lookup command in PATH directories.
      const pathValue = this.env.PATH || process.env.PATH || '';
      const pathDirs = pathValue.split(path.delimiter).filter(Boolean);
      for (const dir of pathDirs) {
        const candidate = path.join(dir, command);
        if (existsSync(candidate)) {
          absolutePath = candidate;
          found = true;
          break;
        }
      }
    }

    // Resolve arguments (expand variables)
    const resolvedArgs = args.map(arg => this.resolveVariables(arg));

    return {
      command: absolutePath || command,
      found,
      absolutePath,
      args: resolvedArgs,
      env: this.env,
    };
  }

  /**
   * Resolve environment variables in a string
   */
  private resolveVariables(str: string): string {
    return str.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (match, varName) => {
      return this.env[varName] || match;
    });
  }

  /**
   * Set environment variables
   */
  setEnv(env: Record<string, string>): void {
    this.env = { ...this.env, ...env };
  }

  /**
   * Set working directory
   */
  setCwd(cwd: string): void {
    this.cwd = cwd;
  }
}
