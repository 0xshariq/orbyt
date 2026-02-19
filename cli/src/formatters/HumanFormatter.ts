/**
 * Human-Readable Formatter
 * 
 * Formats workflow execution for human consumption.
 * Uses symbols and colors for clear, scannable output.
 * 
 * Symbols:
 * - ▶ Workflow started
 * - ● Step running
 * - ✔ Success
 * - ✖ Failure
 * - ↻ Retrying
 * - ⊘ Skipped
 */

import chalk from 'chalk';
import {
  StatusSymbols,
  formatDuration,
  formatStepLine,
  sectionHeader,
  divider,
  formatSummary,
  LogLevel,
  type SummaryRow,
} from '@dev-ecosystem/core';
import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';
import { CliEventType } from '../types/CliEvent.js';
import { createCliLogger, type CliLogger } from '../utils/logger.js';

/**
 * Human-readable formatter
 */
export class HumanFormatter implements Formatter {
  private options: FormatterOptions;
  private stepStartTimes = new Map<string, number>();
  private logger: CliLogger;

  constructor(options: FormatterOptions = {}) {
    this.options = options;
    // Disable chalk colors if requested
    if (options.noColor) {
      chalk.level = 0;
    }
    // Create logger for structured logging
    this.logger = createCliLogger({
      level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
      colors: !options.noColor,
      timestamp: true, // Enable human-readable timestamps
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
   * Handle CLI events
   */
  onEvent(event: CliEvent): void {
    if (this.options.silent) {
      return;
    }

    switch (event.type) {
      case CliEventType.WORKFLOW_STARTED:
        this.onWorkflowStarted(event);
        break;
      case CliEventType.WORKFLOW_COMPLETED:
        this.onWorkflowCompleted(event);
        break;
      case CliEventType.WORKFLOW_FAILED:
        this.onWorkflowFailed(event);
        break;
      case CliEventType.STEP_STARTED:
        this.onStepStarted(event);
        break;
      case CliEventType.STEP_COMPLETED:
        this.onStepCompleted(event);
        break;
      case CliEventType.STEP_FAILED:
        this.onStepFailed(event);
        break;
      case CliEventType.STEP_RETRYING:
        this.onStepRetrying(event);
        break;
      case CliEventType.STEP_SKIPPED:
        this.onStepSkipped(event);
        break;
    }
  }

  /**
   * Show final result
   */
  showResult(result: WorkflowResult): void {
    if (this.options.silent) {
      return;
    }

    console.log();
    console.log(chalk.cyan(divider(60, '═')));

    if (result.status === 'success') {
      console.log(chalk.green.bold(`${StatusSymbols.success} Workflow completed successfully`));
    } else if (result.status === 'partial') {
      console.log(chalk.yellow.bold(`${StatusSymbols.warning} Workflow completed with failures`));
    } else if (result.status === 'timeout') {
      console.log(chalk.red.bold(`${StatusSymbols.failure} Workflow timed out`));
    } else {
      console.log(chalk.red.bold(`${StatusSymbols.failure} Workflow failed`));
    }

    console.log(chalk.cyan(divider(60, '═')));
    console.log();

    // Show summary using formatSummary utility
    const { metadata } = result;
    console.log(chalk.bold('Summary:'));
    
    const summaryRows: SummaryRow[] = [
      { label: 'Total steps', value: metadata.totalSteps },
      { label: 'Successful', value: metadata.successfulSteps, color: '\x1b[32m' }, // green
    ];
    
    if (metadata.failedSteps > 0) {
      summaryRows.push({ label: 'Failed', value: metadata.failedSteps, color: '\x1b[31m' }); // red
    }
    if (metadata.skippedSteps > 0) {
      summaryRows.push({ label: 'Skipped', value: metadata.skippedSteps, color: '\x1b[2m' }); // dim
    }
    summaryRows.push({ label: 'Duration', value: formatDuration(result.duration) });
    
    console.log(formatSummary(summaryRows, !this.options.noColor));

    if (this.options.verbose && result.stepResults.size > 0) {
      console.log();
      console.log(chalk.bold('Step Details:'));
      
      for (const [stepId, stepResult] of result.stepResults) {
        const statusText = stepResult.status === 'success' ? 'success'
          : stepResult.status === 'failure' ? 'failure'
          : 'skipped';
        
        const line = formatStepLine(
          stepId,
          statusText as any,
          undefined,
          stepResult.duration,
          !this.options.noColor
        );
        console.log(`  ${line}`);
        
        if (stepResult.error && this.options.verbose) {
          console.log(chalk.red(`      Error: ${stepResult.error.message}`));
        }
      }
    }
    
    console.log();
  }

  /**
   * Show error
   */
  showError(error: Error): void {
    // Track error
    if (this.logger.isErrorEnabled()) {
      this.logger.error('Workflow execution failed', error);
    }
    
    // Display on terminal
    console.error();
    console.error(chalk.red.bold('✖ Error:'), error.message);
    
    if (this.options.verbose && error.stack) {
      console.error();
      console.error(chalk.gray('Stack trace:'));
      console.error(chalk.gray(error.stack));
    }
    
    // Show error hints if available
    if ('hint' in error && typeof error.hint === 'string') {
      console.error();
      console.error(chalk.yellow('💡 Hint:'), error.hint);
    }
  }

  /**
   * Show warning
   */
  showWarning(message: string): void {
    if (!this.options.silent) {
      // Log for tracking
      this.logger.warn(message);
      // Display on terminal
      console.warn(chalk.yellow('⚠'), message);
    }
  }

  /**
   * Show info
   */
  showInfo(message: string): void {
    if (!this.options.silent) {
      // Log for tracking
      this.logger.info(message);
      // Display on terminal
      console.log(chalk.blue('ℹ'), message);
    }
  }

  // ==================== Event Handlers ====================

  private onWorkflowStarted(event: any): void {
    // Track workflow start
    if (this.logger.isDebugEnabled()) {
      this.logger.debug('Workflow execution started', { 
        workflow: event.workflowName, 
        totalSteps: event.totalSteps 
      });
    }
    
    // Display on terminal
    console.log();
    console.log(chalk.cyan(divider(60, '━')));
    console.log(sectionHeader(event.workflowName || 'Workflow', !this.options.noColor));
    console.log(chalk.dim(`   ${event.totalSteps} step${event.totalSteps === 1 ? '' : 's'} to execute`));
    console.log(chalk.cyan(divider(60, '━')));
    console.log();
  }

  private onWorkflowCompleted(_event: any): void {
    // We'll show the full result in showResult(), so just a separator
    console.log();
  }

  private onWorkflowFailed(_event: any): void {
    // Error will be shown via showError()
  }

  private onStepStarted(event: any): void {
    this.stepStartTimes.set(event.stepId, Date.now());
    
    const stepName = event.stepName || event.stepId;
    const adapter = `${event.adapter}.${event.action}`;
    
    // Use formatStepLine utility
    const line = formatStepLine(
      stepName,
      'running',
      adapter,
      undefined,
      !this.options.noColor
    );
    console.log(line);
  }

  private onStepCompleted(event: any): void {
    const startTime = this.stepStartTimes.get(event.stepId);
    const duration = startTime ? Date.now() - startTime : event.duration;
    
    // Track completion
    if (this.logger.isDebugEnabled()) {
      this.logger.debug('Step completed', {
        stepId: event.stepId,
        stepName: event.stepName,
        duration,
      });
    }
    
    // Display on terminal
    console.log(chalk.green(`  ${StatusSymbols.success}`), chalk.dim(`completed in ${formatDuration(duration)}`));
    
    if (this.options.verbose && event.output) {
      const output = typeof event.output === 'string' 
        ? event.output.trim()
        : JSON.stringify(event.output, null, 2);
      
      if (output) {
        console.log(chalk.dim('    Output:'));
        output.split('\n').forEach((line: string) => {
          console.log(chalk.dim(`      ${line}`));
        });
      }
    }
    
    // Clean up tracking
    this.stepStartTimes.delete(event.stepId);
  }

  private onStepFailed(event: any): void {
    const duration = formatDuration(event.duration);
    console.log(chalk.red(`  ${StatusSymbols.failure}`), chalk.red(`failed in ${duration}`));
    console.log(chalk.red('    Error:'), event.error.message);
    
    if (this.options.verbose && event.error.stack) {
      console.log(chalk.dim('    Stack:'));
      event.error.stack.split('\n').slice(1, 4).forEach((line: string) => {
        console.log(chalk.dim(`      ${line.trim()}`));
      });
    }
  }

  private onStepRetrying(event: any): void {
    const delay = formatDuration(event.nextDelay);
    console.log(
      chalk.yellow(`  ${StatusSymbols.arrow}`),
      chalk.yellow(`retrying (${event.attempt}/${event.maxAttempts}) after ${delay}`)
    );
  }

  private onStepSkipped(event: any): void {
    console.log(chalk.gray(`  ${StatusSymbols.skipped}`), chalk.gray(`skipped: ${event.reason}`));
  }
}
