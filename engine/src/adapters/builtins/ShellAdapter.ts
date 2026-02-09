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
import type { AdapterResult } from '../AdapterResult.js';
import { AdapterResultBuilder } from '../AdapterResult.js';

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
  readonly capabilities = {
    actions: ['shell.exec', 'shell.script'],
    concurrent: true,
    cacheable: false,
    idempotent: false,
    resources: {
      filesystem: true,
      network: false, // May access network depending on command
    },
    cost: 'medium' as const, // Higher risk/cost than CLI
  };

  async execute(
    action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<AdapterResult> {
    const startTime = Date.now();

    try {
      let result: ShellResult;

      if (action === 'shell.script') {
        result = await this.executeScript(input, context);
      } else {
        result = await this.executeCommand(input, context);
      }

      const duration = Date.now() - startTime;

      // Build adapter result
      const builder = new AdapterResultBuilder()
        .duration(duration)
        .log(`Executed: ${result.command}`);

      if (result.exitCode === 0) {
        builder
          .success({
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            signal: result.signal,
            command: result.command,
          })
          .effect('shell:executed');
      } else {
        builder.failure({
          message: `Shell command failed with exit code ${result.exitCode}`,
          code: result.exitCode.toString(),
          details: {
            stdout: result.stdout,
            stderr: result.stderr,
            signal: result.signal,
            command: result.command,
          },
        });
      }

      if (result.stderr) {
        builder.log(result.stderr);
      }

      // Add security warning if needed
      if (result.command.includes('rm') || result.command.includes('delete')) {
        builder.warning('Destructive command executed - filesystem modified');
      }

      return builder.build();
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return new AdapterResultBuilder()
        .duration(duration)
        .failure({
          message: error.message,
          stack: error.stack,
        })
        .log(`Shell execution error: ${error.message}`)
        .build();
    }
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
