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
  LogLevel,
  type SummaryRow,
} from '@dev-ecosystem/core';
import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';
import { CliEventType } from '../types/CliEvent.js';
import { createCliLogger, type CliLogger } from '../utils/logger.js';

/**
 * Verbose formatter for detailed output
 */
export class VerboseFormatter implements Formatter {
  private options: FormatterOptions;
  private stepStartTimes = new Map<string, number>();
  private eventCount = 0;
  private logger: CliLogger;

  constructor(options: FormatterOptions = {}) {
    this.options = options;
    // Disable chalk colors if requested
    if (options.noColor) {
      chalk.level = 0;
    }
    // Create logger for structured logging (verbose mode)
    this.logger = createCliLogger({
      level: LogLevel.DEBUG, // Always debug in verbose mode
      colors: !options.noColor,
      timestamp: true, // Enable timestamps in verbose mode
    });
  }

  /**
   * Print a summary of log counts by level and type
   */
  printLogSummary(): void {
    this.logger.printLogSummary();
  }

  /**
   * Pretty print all logs for CLI output
   */
  prettyPrintLogs(verbose = false): void {
    this.logger.prettyPrintLogs(verbose);
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
        // Track workflow start
        if (this.logger.isDebugEnabled()) {
          this.logger.debug('Workflow execution started', { 
            workflow: event.workflowName, 
            totalSteps: event.totalSteps 
          });
        }
        
        // Display on terminal
        console.log();
        console.log(chalk.bold.cyan(divider(60, '═')));
        console.log(chalk.bold.cyan(`${StatusSymbols.workflow} WORKFLOW STARTED: ${event.workflowName}`));
        console.log(chalk.bold.cyan(divider(60, '═')));
        console.log(formatKeyValue('Timestamp', timestamp, !this.options.noColor));
        console.log(formatKeyValue('Total steps', event.totalSteps, !this.options.noColor));
        console.log();
        break;

      case CliEventType.WORKFLOW_COMPLETED:
        // Track completion
        if (this.logger.isDebugEnabled()) {
          this.logger.debug('Workflow execution completed', {
            status: event.status,
            duration: event.duration,
            successful: event.successfulSteps,
            failed: event.failedSteps,
            skipped: event.skippedSteps,
          });
        }
        
        // Display on terminal
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
        // Track failure
        if (this.logger.isErrorEnabled()) {
          this.logger.error('Workflow execution failed', event.error, {
            duration: event.duration,
          });
        }
        
        // Display on terminal
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
        // Track step start
        this.stepStartTimes.set(event.stepId, Date.now());
        if (this.logger.isDebugEnabled()) {
          this.logger.debug('Step started', {
            stepId: event.stepId,
            stepName: event.stepName,
            adapter: event.adapter,
            action: event.action,
          });
        }
        
        // Display on terminal
        console.log(chalk.cyan(`${StatusSymbols.step}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Adapter: ${event.adapter}.${event.action}`));
        break;

      case CliEventType.STEP_COMPLETED:
        const startTime = this.stepStartTimes.get(event.stepId);
        const elapsed = startTime ? Date.now() - startTime : event.duration;
        
        // Track completion
        if (this.logger.isDebugEnabled()) {
          this.logger.debug('Step completed', {
            stepId: event.stepId,
            stepName: event.stepName,
            duration: elapsed,
          });
        }
        
        // Display on terminal
        console.log(chalk.green(`${StatusSymbols.success}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Duration: ${formatDuration(elapsed)}`));
        
        if (event.output && this.shouldShowOutput(event.output)) {
          console.log(chalk.dim('  Output:'));
          console.log(chalk.dim(this.formatOutput(event.output)));
        }
        console.log();
        
        // Clean up tracking
        this.stepStartTimes.delete(event.stepId);
        break;

      case CliEventType.STEP_FAILED:
        // Track failure
        if (this.logger.isErrorEnabled()) {
          this.logger.error('Step failed', event.error, {
            stepId: event.stepId,
            stepName: event.stepName,
            duration: event.duration,
          });
        }
        
        // Display on terminal
        console.log(chalk.red(`${StatusSymbols.failure}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Duration: ${formatDuration(event.duration)}`));
        console.log(chalk.red('  Error:'), event.error.message);
        if (event.error.stack && this.options.verbose) {
          console.log(chalk.dim(event.error.stack.split('\n').map(l => `  ${l}`).join('\n')));
        }
        console.log();
        break;

      case CliEventType.STEP_RETRYING:
        // Track retry
        if (this.logger.isWarnEnabled()) {
          this.logger.warn('Step retrying', {
            stepId: event.stepId,
            stepName: event.stepName,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
          });
        }
        
        // Display on terminal
        console.log(chalk.yellow(`${StatusSymbols.arrow}`), chalk.bold(event.stepName || event.stepId));
        console.log(chalk.dim(`  ${timestamp} | Attempt: ${event.attempt}/${event.maxAttempts}`));
        console.log(chalk.yellow('  Retrying after failure...'));
        break;

      case CliEventType.STEP_SKIPPED:
        // Track skip
        if (this.logger.isDebugEnabled()) {
          this.logger.debug('Step skipped', {
            stepId: event.stepId,
            stepName: event.stepName,
            reason: event.reason,
          });
        }
        
        // Display on terminal
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

    // Metadata using formatSummary utility
    console.log(chalk.bold('Metadata:'));
    
    const summaryRows: SummaryRow[] = [
      { label: 'Total steps', value: result.metadata.totalSteps },
      { label: 'Successful', value: result.metadata.successfulSteps, color: '\x1b[32m' }, // green
    ];
    
    if (result.metadata.failedSteps > 0) {
      summaryRows.push({ label: 'Failed', value: result.metadata.failedSteps, color: '\x1b[31m' }); // red
    }
    if (result.metadata.skippedSteps > 0) {
      summaryRows.push({ label: 'Skipped', value: result.metadata.skippedSteps, color: '\x1b[2m' }); // dim
    }
    summaryRows.push({ label: 'Duration', value: this.formatDuration(result.duration) });
    summaryRows.push({ label: 'Events processed', value: this.eventCount });
    
    console.log(formatSummary(summaryRows, !this.options.noColor));
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
    // Track error
    if (this.logger.isErrorEnabled()) {
      this.logger.error('CLI Error', error);
    }
    
    // Display on terminal
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
    // Track warning
    if (this.logger.isWarnEnabled()) {
      this.logger.warn(message);
    }
    // Display on terminal
    console.log(chalk.yellow('⚠'), chalk.bold('Warning:'), message);
  }

  /**
   * Display an info message
   */
  showInfo(message: string): void {
    // Track info
    if (this.logger.isInfoEnabled()) {
      this.logger.info(message);
    }
    // Display on terminal
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
