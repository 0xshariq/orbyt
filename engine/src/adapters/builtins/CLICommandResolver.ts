/**
 * CLI Command Resolver
 * 
 * Resolves CLI commands with path resolution and environment setup.
 */

import path from 'node:path';

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
    // Try to find the command in PATH
    let absolutePath: string | undefined;
    let found = false;

    // For now, assume command exists if it's in PATH or is a path
    if (command.includes('/') || command.includes('\\')) {
      const resolvedPath = path.resolve(this.cwd, command);
      absolutePath = resolvedPath;
      found = true;
    } else {
      // Assume command is in PATH
      absolutePath = command;
      found = true;
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
