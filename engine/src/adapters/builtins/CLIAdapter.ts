/**
 * CLI Adapter
 * 
 * Executes CLI commands with structured argument handling.
 * More structured than ShellAdapter for invoking external tools.
 * 
 * Supported actions:
 *   - cli.run - Execute CLI command with args
 *   - cli.exec - Execute CLI command (alias)
 * 
 * @module adapters/builtins
 */

import { spawn } from 'child_process';
import { BaseAdapter, type AdapterContext } from '../Adapter.js';
import type { AdapterResult } from '../AdapterResult.js';
import { AdapterResultBuilder } from '../AdapterResult.js';

/**
 * CLI execution result
 */
interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  args: string[];
  duration: number;
  success: boolean;
}

/**
 * CLI adapter for executing commands
 */
export class CLIAdapter extends BaseAdapter {
  readonly name = 'cli';
  readonly version = '1.0.0';
  readonly description = 'CLI command execution adapter';
  readonly supportedActions = ['cli.*'];
  readonly capabilities = {
    actions: ['cli.run', 'cli.exec'],
    concurrent: true,
    cacheable: false,
    idempotent: false,
    resources: {
      filesystem: true,
    },
    cost: 'low' as const,
  };

  async execute(
    action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<AdapterResult> {
    this.validateInput(input, ['command']);

    const command = input.command;
    const args = input.args || [];
    const cwd = input.cwd;
    const env = { ...process.env, ...(input.env || {}) };
    const timeout = input.timeout;
    const stdin = input.stdin;
    const throwOnError = this.getInput(input, 'throwOnError', true);

    context.log(`Executing ${action}: ${command} ${args.join(' ')}`);

    const startTime = Date.now();

    try {
      const result = await this.executeCLI(
        command,
        args,
        { cwd, env, timeout, stdin },
        context
      );

      const duration = Date.now() - startTime;

      // Build result using new format
      const builder = new AdapterResultBuilder()
        .duration(duration)
        .log(`Executed: ${command} ${args.join(' ')}`);

      if (result.success) {
        builder
          .success({
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            command: result.command,
            args: result.args,
          })
          .effect('process:executed');
      } else {
        builder.failure({
          message: `CLI command failed with exit code ${result.exitCode}`,
          code: result.exitCode.toString(),
          details: {
            stdout: result.stdout,
            stderr: result.stderr,
            command: result.command,
            args: result.args,
          },
        });

        if (throwOnError) {
          const builtResult = builder.build();
          throw new Error(builtResult.error!.message);
        }
      }

      if (result.stderr) {
        builder.log(result.stderr);
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
        .log(`CLI execution error: ${error.message}`)
        .build();
    }
  }

  /**
   * Execute CLI command
   */
  private executeCLI(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      stdin?: string;
    },
    context: AdapterContext
  ): Promise<CLIResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Spawn process
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env as any,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      // Send stdin if provided
      if (options.stdin && child.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

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
      child.on('exit', (code, _signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;
        const exitCode = code ?? -1;

        const result: CLIResult = {
          stdout,
          stderr,
          exitCode,
          command,
          args,
          duration,
          success: exitCode === 0 && !timedOut,
        };

        if (timedOut) {
          context.log(
            `CLI command timed out after ${options.timeout}ms`,
            'error'
          );
          reject(new Error(`Command timed out after ${options.timeout}ms`));
          return;
        }

        context.log(
          `CLI command completed with exit code ${exitCode} in ${duration}ms`
        );

        resolve(result);
      });

      // Handle errors
      child.on('error', (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        context.log(`CLI command error: ${error.message}`, 'error');
        reject(error);
      });
    });
  }
}
