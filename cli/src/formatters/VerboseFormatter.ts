/**
 * Verbose Formatter
 * 
 * Shows maximum detail for debugging and development:
 * - All events with timestamps
 * - Step outputs
 * - Error details with stack traces
 * - Metadata and context
 * - Execution statistics
 * 
 * Use with --verbose flag or -v
 */

import chalk from 'chalk';
import {
  StatusSymbols,
  formatDuration,
  divider,
  formatSummary,
  formatKeyValue,
  type SummaryRow,
} from '@dev-ecosystem/core';
import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';
import { CliEventType } from '../types/CliEvent.js';

/**
 * Verbose formatter for detailed output
 */
export class VerboseFormatter implements Formatter {
  private options: FormatterOptions;
  private stepStartTimes = new Map<string, number>();
  private eventCount = 0;

  constructor(options: FormatterOptions = {}) {
    this.options = options;
    
    // Disable chalk colors if requested
    if (options.noColor) {
      chalk.level = 0;
    }
  }

  /**
   * Handle CLI events with verbose output
   */
  onEvent(event: CliEvent): void {
    if (this.options.silent) {
      return;
    }

    this.eventCount++;
    const timestamp = this.formatTimestamp(event.timestamp);

    switch (event.type) {
      case CliEventType.WORKFLOW_STARTED:
        console.log();
        console.log(chalk.bold.cyan(divider(60, '═')));
        console.log(chalk.bold.cyan(`${StatusSymbols.workflow} WORKFLOW STARTED: ${event.workflowName}`));
        console.log(chalk.bold.cyan(divider(60, '═')));
        console.log(formatKeyValue('Timestamp', timestamp, !this.options.noColor));
        console.log(formatKeyValue('Total steps', event.totalSteps, !this.options.noColor));
        console.log();
        break;

      case CliEventType.WORKFLOW_COMPLETED:
        console.log();
        console.log(chalk.bold.green(divider(60, '═')));
        console.log(chalk.bold.green(`${StatusSymbols.success} WORKFLOW COMPLETED: ${event.status.toUpperCase()}`));
        console.log(chalk.bold.green(divider(60, '═')));
        console.log(formatKeyValue('Timestamp', timestamp, !this.options.noColor));
        console.log(formatKeyValue('Duration', formatDuration(event.duration), !this.options.noColor));
        console.log(chalk.green(`${StatusSymbols.success} Successful: ${event.successfulSteps}/${event.successfulSteps + event.failedSteps + event.skippedSteps}`));
        if (event.failedSteps > 0) {
          console.log(chalk.red(`${StatusSymbols.failure} Failed: ${event.failedSteps}`));
        }
        if (event.skippedSteps > 0) {
          console.log(chalk.gray(`${StatusSymbols.skipped} Skipped: ${event.skippedSteps}`));
        }
        console.log();
        break;

      case CliEventType.WORKFLOW_FAILED:
        console.log();
        console.log(chalk.bold.red(divider(60, '═')));
        console.log(chalk.bold.red(`${StatusSymbols.failure} WORKFLOW FAILED`));
        console.log(chalk.bold.red(divider(60, '═')));
        console.log(formatKeyValue('Timestamp', timestamp, !this.options.noColor));
        console.log(formatKeyValue('Duration', formatDuration(event.duration), !this.options.noColor));
        console.log();
        console.log(chalk.red('Error:'), event.error.message);
        if (event.error.stack) {
          console.log(chalk.dim(event.error.stack));
        }
        console.log();
        break;

      case CliEventType.STEP_STARTED:
        this.stepStartTimes.set(event.stepId, Date.now());
        console.log(chalk.cyan(`${StatusSymbols.step}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Adapter: ${event.adapter}.${event.action}`));
        break;

      case CliEventType.STEP_COMPLETED:
        const startTime = this.stepStartTimes.get(event.stepId);
        const elapsed = startTime ? Date.now() - startTime : event.duration;
        console.log(chalk.green(`${StatusSymbols.success}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Duration: ${formatDuration(elapsed)}`));
        
        if (event.output && this.shouldShowOutput(event.output)) {
          console.log(chalk.dim('  Output:'));
          console.log(chalk.dim(this.formatOutput(event.output)));
        }
        console.log();
        break;

      case CliEventType.STEP_FAILED:
        console.log(chalk.red(`${StatusSymbols.failure}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Duration: ${formatDuration(event.duration)}`));
        console.log(chalk.red('  Error:'), event.error.message);
        if (event.error.stack && this.options.verbose) {
          console.log(chalk.dim(event.error.stack.split('\n').map(l => `  ${l}`).join('\n')));
        }
        console.log();
        break;

      case CliEventType.STEP_RETRYING:
        console.log(chalk.yellow(`${StatusSymbols.arrow}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Attempt: ${event.attempt}/${event.maxAttempts}`));
        console.log(chalk.yellow('  Retrying after failure...'));
        break;

      case CliEventType.STEP_SKIPPED:
        console.log(chalk.gray(`${StatusSymbols.skipped}`), chalk.dim(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Reason: ${event.reason}`));
  console.log();
        break;
    }
  }

  /**
   * Show final result with full details
   */
  showResult(result: WorkflowResult): void {
    if (this.options.silent) {
      return;
    }

    console.log();
    console.log(chalk.bold('═'.repeat(60)));
    console.log(chalk.bold('EXECUTION SUMMARY'));
    console.log(chalk.bold('═'.repeat(60)));
    console.log();

    // Status
    const statusIcon = result.status === 'success' ? chalk.green('✔') : chalk.red('✖');
    const statusText = result.status.toUpperCase();
    console.log(chalk.bold('Status:'), statusIcon, chalk.bold(statusText));
    console.log();

    // Metadata
    console.log(chalk.bold('Metadata:'));
    console.log(`  Total steps:      ${result.metadata.totalSteps}`);
    console.log(chalk.green(`  Successful:       ${result.metadata.successfulSteps}`));
    if (result.metadata.failedSteps > 0) {
      console.log(chalk.red(`  Failed:           ${result.metadata.failedSteps}`));
    }
    if (result.metadata.skippedSteps > 0) {
      console.log(chalk.gray(`  Skipped:          ${result.metadata.skippedSteps}`));
    }
    console.log(`  Duration:         ${this.formatDuration(result.duration)}`);
    console.log(`  Events processed: ${this.eventCount}`);
    console.log();

    // Step-by-step results
    if (result.stepResults.size > 0) {
      console.log(chalk.bold('Step Results:'));
      for (const [stepId, stepResult] of result.stepResults) {
        const icon = stepResult.status === 'success' ? chalk.green('✔') : chalk.red('✖');
        const duration = this.formatDuration(stepResult.duration);
        
        console.log(`  ${icon} ${stepId} ${chalk.dim(`(${duration})`)}`);
        
        if (stepResult.error) {
          console.log(chalk.red(`     Error: ${stepResult.error.message}`));
        }
        
        if (stepResult.output && this.shouldShowOutput(stepResult.output)) {
          console.log(chalk.dim('     Output:'));
          const outputLines = this.formatOutput(stepResult.output).split('\n');
          outputLines.forEach(line => console.log(chalk.dim(`       ${line}`)));
        }
      }
      console.log();
    }

    // Errors
    if (result.error) {
      console.log(chalk.bold.red('Workflow Error:'));
      console.log(chalk.red(`  ${result.error.message}`));
      if (result.error.stack) {
        console.log(chalk.dim(result.error.stack.split('\n').map(l => `  ${l}`).join('\n')));
      }
      console.log();
    }

    console.log(chalk.bold('═'.repeat(60)));
    console.log();
  }

  /**
   * Display an error with full details
   */
  showError(error: Error): void {
    console.log();
    console.log(chalk.red.bold('✖ ERROR'));
    console.log();
    console.log(chalk.red('Message:'), error.message);
    console.log(chalk.red('Type:'), error.name);
    
    if (error.stack) {
      console.log();
      console.log(chalk.dim('Stack trace:'));
      console.log(chalk.dim(error.stack));
    }
    console.log();
  }

  /**
   * Display a warning
   */
  showWarning(message: string): void {
    console.log(chalk.yellow('⚠'), chalk.bold('Warning:'), message);
  }

  /**
   * Display an info message
   */
  showInfo(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Format duration in milliseconds
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Check if output should be shown
   */
  private shouldShowOutput(output: unknown): boolean {
    if (!output) return false;
    if (typeof output === 'string' && output.trim().length === 0) return false;
    if (typeof output === 'object' && Object.keys(output).length === 0) return false;
    return true;
  }

  /**
   * Format output for display
   */
  private formatOutput(output: unknown): string {
    if (typeof output === 'string') {
      return output.trim();
    }
    return JSON.stringify(output, null, 2);
  }
}
