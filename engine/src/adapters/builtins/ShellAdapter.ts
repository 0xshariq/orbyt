/**
 * Shell Adapter
 * 
 * Executes shell commands.
 * 
 * Supported actions:
 *   - shell.exec - Execute shell command
 *   - shell.script - Execute shell script
 * 
 * @module adapters/builtins
 */

import { spawn } from 'child_process';
import { BaseAdapter, type AdapterContext } from '../Adapter.js';

/**
 * Shell execution result
 */
interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: string | null;
  duration: number;
  command: string;
}

/**
 * Shell adapter for executing commands
 */
export class ShellAdapter extends BaseAdapter {
  readonly name = 'shell';
  readonly version = '1.0.0';
  readonly description = 'Shell command execution adapter';
  readonly supportedActions = ['shell.*'];

  async execute(
    action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<ShellResult> {
    if (action === 'shell.script') {
      return this.executeScript(input, context);
    }
    
    return this.executeCommand(input, context);
  }

  /**
   * Execute a shell command
   */
  private async executeCommand(
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<ShellResult> {
    this.validateInput(input, ['command']);

    const command = input.command;
    const args = input.args || [];
    const cwd = input.cwd;
    const env = { ...process.env, ...(input.env || {}) };
    const timeout = input.timeout;
    const shell = this.getInput(input, 'shell', true);

    context.log(`Executing command: ${command} ${args.join(' ')}`);

    return this.exec(command, args, { cwd, env, timeout, shell }, context);
  }

  /**
   * Execute a shell script
   */
  private async executeScript(
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<ShellResult> {
    this.validateInput(input, ['script']);

    const script = input.script;
    const cwd = input.cwd;
    const env = { ...process.env, ...(input.env || {}) };
    const timeout = input.timeout;
    const shell = this.getInput(input, 'shell', '/bin/bash');

    context.log(`Executing script (${script.length} bytes)`);

    // Execute script via shell stdin
    return this.exec(shell, ['-c', script], { cwd, env, timeout, shell: false }, context);
  }

  /**
   * Low-level command execution
   */
  private exec(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      shell?: boolean | string;
    },
    context: AdapterContext
  ): Promise<ShellResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Spawn process
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env as any,
        shell: options.shell,
        windowsHide: true,
      });

      // Collect stdout
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle timeout
      let timeoutHandle: NodeJS.Timeout | undefined;
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          
          // Force kill after 5s
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }, options.timeout);
      }

      // Handle exit
      child.on('exit', (code, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;
        const result: ShellResult = {
          stdout,
          stderr,
          exitCode: code ?? -1,
          signal: signal,
          duration,
          command: `${command} ${args.join(' ')}`,
        };

        if (timedOut) {
          context.log(
            `Command timed out after ${options.timeout}ms: ${result.command}`,
            'error'
          );
          reject(new Error(`Command timed out after ${options.timeout}ms`));
          return;
        }

        context.log(
          `Command completed with exit code ${code} in ${duration}ms`
        );

        // Check if we should throw on non-zero exit
        const throwOnError = true; // Default behavior
        if (throwOnError && code !== 0) {
          const error = new Error(
            `Command failed with exit code ${code}\n` +
            `Command: ${result.command}\n` +
            `Stderr: ${stderr}`
          );
          reject(error);
          return;
        }

        resolve(result);
      });

      // Handle errors
      child.on('error', (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        context.log(
          `Command error: ${error.message}`,
          'error'
        );

        reject(error);
      });
    });
  }
}
