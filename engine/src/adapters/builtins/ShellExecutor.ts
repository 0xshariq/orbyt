/**
 * Shell Executor
 * 
 * Executes shell commands with security controls.
 */

import { spawn } from 'node:child_process';
import { AdapterExecutionError } from '@dev-ecosystem/core';

export interface ShellExecutionOptions {
  /**
   * Shell command to execute
   */
  command: string;

  /**
   * Working directory
   */
  cwd?: string;

  /**
   * Environment variables
   */
  env?: Record<string, string>;

  /**
   * Shell to use
   */
  shell?: string | boolean;

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Standard input
   */
  stdin?: string;

  /**
   * Abort signal
   */
  signal?: AbortSignal;
}

export interface ShellExecutionResult {
  /**
   * Standard output
   */
  stdout: string;

  /**
   * Standard error
   */
  stderr: string;

  /**
   * Exit code
   */
  exitCode: number;

  /**
   * Execution time in milliseconds
   */
  duration: number;

  /**
   * Signal that terminated the process (if any)
   */
  signal?: string;
}

export class ShellExecutor {
  /**
   * Execute a shell command
   */
  static async execute(options: ShellExecutionOptions): Promise<ShellExecutionResult> {
    const startTime = Date.now();
    const shell = options.shell ?? true;

    return new Promise((resolve, reject) => {
      const proc = spawn(options.command, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell,
        signal: options.signal,
      });

      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | undefined;

      // Collect stdout
      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Collect stderr
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle timeout
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }, options.timeout);
      }

      // Write stdin if provided
      if (options.stdin) {
        proc.stdin.write(options.stdin);
        proc.stdin.end();
      }

      // Handle process exit
      proc.on('close', (exitCode, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;

        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? -1,
          duration,
          signal: signal || undefined,
        });
      });

      // Handle process errors
      proc.on('error', (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        reject(
          new AdapterExecutionError(
            `Shell execution failed: ${error.message}`,
            { command: options.command, error: error.message }
          )
        );
      });
    });
  }

  /**
   * Execute multiple commands sequentially
   */
  static async executeSequential(
    commands: string[],
    options: Omit<ShellExecutionOptions, 'command'>
  ): Promise<ShellExecutionResult[]> {
    const results: ShellExecutionResult[] = [];

    for (const command of commands) {
      const result = await this.execute({ ...options, command });
      results.push(result);

      // Stop on first failure
      if (result.exitCode !== 0) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute multiple commands in parallel
   */
  static async executeParallel(
    commands: string[],
    options: Omit<ShellExecutionOptions, 'command'>
  ): Promise<ShellExecutionResult[]> {
    return Promise.all(commands.map(command => this.execute({ ...options, command })));
  }
}
