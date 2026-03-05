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

export class VerboseFormatter implements Formatter {
	public logger: CliLogger;
	private options: FormatterOptions;
	private stepStartTimes = new Map<string, number>();

	constructor(options: FormatterOptions = {}) {
		this.options = options;
		if (options.noColor) {
			chalk.level = 0;
		}
		this.logger = options.logger ?? createCliLogger({
			level: LogLevel.DEBUG,
			colors: !options.noColor,
			timestamp: true,
		});
	}

	onEvent(event: CliEvent): void {
		if (this.options.silent) return;
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

	showResult(result: WorkflowResult): void {
		if (this.options.silent) return;
		this.logger.info('');
		this.logger.info(chalk.cyan(divider(60, '═')));
		if (result.status === 'success') {
			this.logger.info(chalk.green.bold(`${StatusSymbols.success} Workflow completed successfully`));
		} else if (result.status === 'partial') {
			this.logger.info(chalk.yellow.bold(`${StatusSymbols.warning} Workflow completed with failures`));
		} else if (result.status === 'timeout') {
			this.logger.info(chalk.red.bold(`${StatusSymbols.failure} Workflow timed out`));
		} else {
			this.logger.info(chalk.red.bold(`${StatusSymbols.failure} Workflow failed`));
		}
		this.logger.info(chalk.cyan(divider(60, '═')));
		this.logger.info('');
		const { metadata } = result;
		this.logger.info(chalk.bold('Summary:'));
		const summaryRows: SummaryRow[] = [
			{ label: 'Total steps', value: metadata.totalSteps },
			{ label: 'Successful', value: metadata.successfulSteps, color: '\x1b[32m' },
		];
		if (metadata.failedSteps > 0) {
			summaryRows.push({ label: 'Failed', value: metadata.failedSteps, color: '\x1b[31m' });
		}
		if (metadata.skippedSteps > 0) {
			summaryRows.push({ label: 'Skipped', value: metadata.skippedSteps, color: '\x1b[2m' });
		}
		summaryRows.push({ label: 'Duration', value: formatDuration(result.duration) });
		this.logger.info(formatSummary(summaryRows, !this.options.noColor));
		if (this.options.verbose && result.stepResults.size > 0) {
			this.logger.info('');
			this.logger.info(chalk.bold('Step Details:'));
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
				this.logger.info(`  ${line}`);
				if (stepResult.error && this.options.verbose) {
					this.logger.error(chalk.red(`      Error: ${stepResult.error.message}`));
				}
			}
		}
		this.logger.info('');
	}

	showError(error: Error): void {
		if (this.logger.isErrorEnabled()) {
			this.logger.error('Workflow execution failed', error);
		}
		this.logger.error(chalk.red.bold('✖ Error: ') + error.message);
		if (this.options.verbose && error.stack) {
			this.logger.error(chalk.gray('Stack trace:'));
			this.logger.error(chalk.gray(error.stack));
		}
		if ('hint' in error && typeof error.hint === 'string') {
			this.logger.warn(chalk.yellow('💡 Hint: ') + error.hint);
		}
	}

	showWarning(message: string): void {
		if (!this.options.silent) {
			this.logger.warn(chalk.yellow('⚠ ') + message);
		}
	}

	showInfo(message: string): void {
		if (!this.options.silent) {
			this.logger.info(chalk.cyan('ℹ ') + message);
		}
	}

	private onWorkflowStarted(event: any): void {
		if (this.logger.isDebugEnabled()) {
			this.logger.debug('Workflow execution started', {
				workflow: event.workflowName,
				totalSteps: event.totalSteps
			});
		}
		this.logger.info('');
		this.logger.info(chalk.cyan(divider(60, '━')));
		this.logger.info(sectionHeader(event.workflowName || 'Workflow', !this.options.noColor));
		this.logger.info('');
	}

	private onWorkflowCompleted(_event: any): void {
		this.logger.info('');
	}

	private onWorkflowFailed(event: any): void {
		if (this.logger.isErrorEnabled()) {
			this.logger.error('Workflow execution failed', event.error);
		}
		this.logger.error(chalk.red.bold('Workflow failed.'));
		this.logger.info('');
	}

	private onStepStarted(event: any): void {
		this.stepStartTimes.set(event.stepId, Date.now());
		const stepName = event.stepName || event.stepId;
		const line = formatStepLine(
			stepName,
			'running',
			event.adapter,
			undefined,
			!this.options.noColor
		);
		this.logger.info(line);
	}

	private onStepCompleted(event: any): void {
		const startTime = this.stepStartTimes.get(event.stepId);
		const duration = startTime ? Date.now() - startTime : undefined;
		this.logger.info(chalk.green(`  ${StatusSymbols.success}`) + chalk.dim(` completed in ${formatDuration(duration ?? 0)}`));
		if (this.options.verbose && event.output) {
			const output = typeof event.output === 'string'
				? event.output.trim()
				: JSON.stringify(event.output, null, 2);
			if (output) {
				this.logger.info(chalk.dim('    Output:'));
				output.split('\n').forEach((line: string) => {
					this.logger.info(chalk.dim(`      ${line}`));
				});
			}
		}
		this.logger.info('');
		this.stepStartTimes.delete(event.stepId);
	}

	private onStepFailed(event: any): void {
		const duration = formatDuration(event.duration);
		this.logger.error(chalk.red(`  ${StatusSymbols.failure}`) + chalk.red(` failed in ${duration}`));
		this.logger.error(chalk.red('    Error: ') + event.error.message);
		if (this.options.verbose && event.error.stack) {
			this.logger.error(chalk.dim('    Stack:'));
			event.error.stack.split('\n').slice(1, 4).forEach((line: string) => {
				this.logger.error(chalk.dim(`      ${line}`));
			});
		}
		this.logger.info('');
	}

	private onStepRetrying(event: any): void {
		const delay = event.delay || 0;
		this.logger.warn(
			chalk.yellow(`  ${StatusSymbols.arrow}`) +
			chalk.yellow(` retrying (${event.attempt}/${event.maxAttempts}) after ${delay}`)
		);
	}

	private onStepSkipped(event: any): void {
		this.logger.info(chalk.gray(`  ${StatusSymbols.skipped}`) + chalk.gray(` skipped: ${event.reason}`));
	}
}
