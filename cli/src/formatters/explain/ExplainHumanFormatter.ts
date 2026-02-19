
import chalk from 'chalk';
import { divider, LogLevel } from '@dev-ecosystem/core';
import type { ExecutionExplanation, WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from '../Formatter.js';
import type { CliEvent } from '../../types/CliEvent.js';
import { createCliLogger, type CliLogger } from '../../utils/logger.js';

// Use FormatterOptions for compatibility
export type ExplainFormatterOptions = FormatterOptions;

export class ExplainHumanFormatter implements Formatter {
  private logger: CliLogger;
  private options: FormatterOptions;

  constructor(options: FormatterOptions = {}) {
    this.options = options;
    if (options.noColor) chalk.level = 0;
    this.logger = createCliLogger({
      level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
      colors: !options.noColor,
      timestamp: true,
    });
  }

  // For explain, onEvent is a no-op
  onEvent(_event: CliEvent): void {
    // Not supported for explain formatters
  }

  // For explain, showResult is a no-op
  showResult(_result: WorkflowResult): void {
    // Not supported for explain formatters
  }

  showExplanation(explanation: ExecutionExplanation): void {
    // Header
    const headerDivider = chalk.cyan(divider(60, '━'));
    console.log(headerDivider);
    this.logger.info(chalk.bold(`▶ Workflow: ${explanation.workflowName || 'unnamed'}`));
    if (explanation.description) {
      this.logger.info(chalk.italic(`  ${explanation.description}`));
    }
    this.logger.info(`▶ Version: ${chalk.gray(explanation.version)}`);
    this.logger.info(`▶ Kind: ${chalk.gray(explanation.kind)}`);
    this.logger.info(`▶ Steps: ${chalk.yellow(explanation.stepCount)}`);
    this.logger.info(`▶ Execution Mode: ${chalk.magenta(explanation.executionStrategy)}`);
    if (explanation.adaptersUsed && explanation.adaptersUsed.length > 0) {
      this.logger.info(chalk.magentaBright(`▶ Adapters Used: ${explanation.adaptersUsed.join(', ')}`));
    }
    if (explanation.tags && explanation.tags.length > 0) {
      this.logger.info(chalk.gray(`▶ Tags: ${explanation.tags.join(', ')}`));
    }
    if (explanation.owner) {
      this.logger.info(chalk.gray(`▶ Owner: ${explanation.owner}`));
    }

    // Inputs
    if (explanation.inputs && Object.keys(explanation.inputs).length > 0) {
      this.logger.info(chalk.bold('\nInputs:'));
      for (const [key, value] of Object.entries(explanation.inputs)) {
        let typeOrDefault = '';
        if (typeof value === 'object' && value !== null) {
          typeOrDefault = `${value.type || 'any'}${value.required ? ' (required)' : ''}${value.default !== undefined ? ` = ${JSON.stringify(value.default)}` : ''}`;
        } else {
          typeOrDefault = JSON.stringify(value);
        }
        this.logger.info(`  ${chalk.yellow(key)}: ${typeOrDefault}`);
        if (this.options.verbose && typeof value === 'object' && value.description) {
          this.logger.info(chalk.gray(`    → ${value.description}`));
        }
      }
    } else {
      this.logger.info(chalk.gray('\nNo inputs defined.'));
    }

    // Steps
    this.logger.info(chalk.bold('\nExecution Plan:'));
    if (explanation.steps && explanation.steps.length > 0) {
      explanation.steps.forEach((step, i) => {
        this.logger.info(chalk.greenBright(`${i + 1}. ${step.name || step.id}`));
        this.logger.info(`   uses: ${chalk.cyan(step.uses)}`);
        if (step.needs && step.needs.length > 0) {
          this.logger.info(`   needs: [${step.needs.join(', ')}]`);
        }
        if (step.when) {
          this.logger.info(`   when: ${chalk.yellow(step.when)}`);
        }
        if (step.env && Object.keys(step.env).length > 0) {
          this.logger.info('   env:');
          Object.entries(step.env).forEach(([ekey, evalue]) => {
            this.logger.info(`     ${chalk.yellow(ekey)}: ${JSON.stringify(evalue)}`);
          });
        }
        if (this.options.verbose) {
          if (step.timeout) {
            this.logger.info(`   timeout: ${chalk.yellow(step.timeout)}`);
          }
          if (step.retry) {
            let retryStr = `max: ${step.retry.max || 1}`;
            if (step.retry.backoff) retryStr += `, backoff: ${step.retry.backoff}`;
            if (step.retry.delay) retryStr += `, delay: ${step.retry.delay}ms`;
            this.logger.info(`   retry: ${chalk.yellow(retryStr)}`);
          }
          if (step.continueOnError) {
            this.logger.info(chalk.yellow('   continueOnError: true'));
          }
          if (step.with && Object.keys(step.with).length > 0) {
            this.logger.info('   with:');
            Object.entries(step.with).forEach(([key, value]) => {
              this.logger.info(`     ${chalk.yellow(key)}: ${JSON.stringify(value)}`);
            });
          }
        }
        this.logger.info('');
      });
    } else {
      this.logger.info(chalk.gray('No steps defined.'));
    }

    // Outputs
    if (explanation.outputs && Object.keys(explanation.outputs).length > 0) {
      this.logger.info(chalk.bold('Outputs:'));
      for (const [key, value] of Object.entries(explanation.outputs)) {
        this.logger.info(`  ${chalk.green(key)}: ${JSON.stringify(value)}`);
      }
    } else {
      this.logger.info(chalk.gray('No outputs defined.'));
    }
    console.log(headerDivider);
  }

  showError(error: Error): void {
    if (!this.options.silent) {
      this.logger.error(chalk.red('Error: ') + error.message);
    }
  }

  showWarning(message: string): void {
    if (!this.options.silent) {
      this.logger.warn(chalk.yellow('Warning: ') + message);
    }
  }

  showInfo(message: string): void {
    if (!this.options.silent) {
      this.logger.info(chalk.cyan('Info: ') + message);
    }
  }
}
