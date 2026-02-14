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
import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';
import { CliEventType } from '../types/CliEvent.js';

/**
 * Human-readable formatter
 */
export class HumanFormatter implements Formatter {
  private options: FormatterOptions;
  private stepStartTimes = new Map<string, number>();

  constructor(options: FormatterOptions = {}) {
    this.options = options;
    
    // Disable chalk colors if requested
    if (options.noColor) {
      chalk.level = 0;
    }
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

    console.log(); // Empty line

    if (result.status === 'success') {
      console.log(chalk.green.bold('✔ Workflow completed successfully'));
    } else if (result.status === 'partial') {
      console.log(chalk.yellow.bold('⚠ Workflow completed with failures'));
    } else if (result.status === 'timeout') {
      console.log(chalk.red.bold('✖ Workflow timed out'));
    } else {
      console.log(chalk.red.bold('✖ Workflow failed'));
    }

    // Show summary
    const { metadata } = result;
    console.log();
    console.log(chalk.bold('Summary:'));
    console.log(`  Total steps:      ${metadata.totalSteps}`);
    console.log(chalk.green(`  Successful:       ${metadata.successfulSteps}`));
    if (metadata.failedSteps > 0) {
      console.log(chalk.red(`  Failed:           ${metadata.failedSteps}`));
    }
    if (metadata.skippedSteps > 0) {
      console.log(chalk.gray(`  Skipped:          ${metadata.skippedSteps}`));
    }
    console.log(`  Duration:         ${this.formatDuration(result.duration)}`);

    if (this.options.verbose && result.stepResults.size > 0) {
      console.log();
      console.log(chalk.bold('Step Details:'));
      for (const [stepId, stepResult] of result.stepResults) {
        const status = stepResult.status === 'success'
          ? chalk.green('✔')
          : stepResult.status === 'failure'
          ? chalk.red('✖')
          : chalk.gray('⊘');
        
        console.log(`  ${status} ${stepId} (${this.formatDuration(stepResult.duration)})`);
        
        if (stepResult.error && this.options.verbose) {
          console.log(chalk.red(`    Error: ${stepResult.error.message}`));
        }
      }
    }
  }

  /**
   * Show error
   */
  showError(error: Error): void {
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
      console.warn(chalk.yellow('⚠'), message);
    }
  }

  /**
   * Show info
   */
  showInfo(message: string): void {
    if (!this.options.silent) {
      console.log(chalk.blue('ℹ'), message);
    }
  }

  // ==================== Event Handlers ====================

  private onWorkflowStarted(event: any): void {
    console.log();
    console.log(chalk.blue.bold('▶'), chalk.bold(event.workflowName || 'Workflow'));
    console.log(chalk.gray(`  ${event.totalSteps} steps to execute`));
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
    
    const adapter = chalk.dim(`${event.adapter}.${event.action}`);
    console.log(chalk.blue('●'), event.stepName || event.stepId, adapter);
  }

  private onStepCompleted(event: any): void {
    const duration = this.formatDuration(event.duration);
    console.log(chalk.green('  ✔'), chalk.gray(`completed in ${duration}`));
    
    if (this.options.verbose && event.output) {
      console.log(chalk.gray('  Output:'), JSON.stringify(event.output, null, 2));
    }
  }

  private onStepFailed(event: any): void {
    const duration = this.formatDuration(event.duration);
    console.log(chalk.red('  ✖'), chalk.red(`failed in ${duration}`));
    console.log(chalk.red('  Error:'), event.error.message);
  }

  private onStepRetrying(event: any): void {
    const delay = this.formatDuration(event.nextDelay);
    console.log(
      chalk.yellow('  ↻'),
      chalk.yellow(`retrying (${event.attempt}/${event.maxAttempts}) in ${delay}`)
    );
  }

  private onStepSkipped(event: any): void {
    console.log(chalk.gray('  ⊘'), chalk.gray(`skipped: ${event.reason}`));
  }

  // ==================== Helpers ====================

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }
}
