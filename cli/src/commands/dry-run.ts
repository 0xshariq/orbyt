/**
 * Dry Run Command
 *
 * Executes workflow planning/validation path without running steps.
 * Uses engine dry-run mode to return a workflow result preview.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { OrbytEngine, WorkflowLoader } from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';
import { parseKeyValuePairs } from '../types/CliRunOptions.js';

interface CliDryRunOptions {
	vars?: string[];
	varsFile?: string;
	env?: string[];
	timeout?: number;
	format?: FormatterType;
	verbose?: boolean;
	silent?: boolean;
	noColor?: boolean;
}

export function registerDryRunCommand(program: Command): void {
	program
		.command('dry-run <workflow>')
		.description('Validate and plan a workflow without executing steps')
		.option('-v, --var <key=value...>', 'Set workflow variables (can be used multiple times)')
		.option('--vars-file <path>', 'Load variables from JSON file')
		.option('-e, --env <key=value...>', 'Set environment variables')
		.option('-t, --timeout <seconds>', 'Workflow timeout in seconds', parseInt)
		.option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
		.option('--verbose', 'Show detailed output')
		.option('--silent', 'Minimal output')
		.option('--no-color', 'Disable colored output')
		.action(runDryWorkflow);
}

async function runDryWorkflow(workflowPath: string, options: CliDryRunOptions): Promise<void> {
	const format = (options.format || 'human') as FormatterType;
	if (options.verbose && format === 'human') {
		options.format = 'verbose';
	}

	try {
		const engine = new OrbytEngine({
			logLevel: options.verbose ? 'debug' : 'info',
			verbose: options.verbose || false,
			mode: 'dry-run',
		});

		const formatter = createFormatter((options.format || 'human') as FormatterType, {
			verbose: options.verbose,
			silent: options.silent,
			noColor: options.noColor,
		});

		const resolvedPath = resolve(workflowPath);
		if (!existsSync(resolvedPath)) {
			formatter.showError(new Error(`Workflow file not found: ${workflowPath}`));
			process.exit(1);
		}

		const variables: Record<string, string> = {};
		if (options.vars && Array.isArray(options.vars)) {
			Object.assign(variables, parseKeyValuePairs(options.vars));
		}

		if (options.varsFile) {
			const varsFileContent = await readFile(options.varsFile, 'utf-8');
			const varsFromFile = JSON.parse(varsFileContent);
			Object.assign(variables, varsFromFile);
		}

		const env: Record<string, string> = {};
		if (options.env && Array.isArray(options.env)) {
			Object.assign(env, parseKeyValuePairs(options.env));
		}

		const workflow = await WorkflowLoader.fromFile(resolvedPath, { variables });

		const result = await engine.run(workflow, {
			variables,
			env,
			timeout: options.timeout ? options.timeout * 1000 : undefined,
			dryRun: true,
		});

		formatter.showResult(result);
		process.exit(result.status === 'success' ? 0 : 1);
	} catch (error) {
		const formatter = createFormatter((options.format || 'human') as FormatterType, {
			verbose: options.verbose,
			silent: options.silent,
			noColor: options.noColor,
		});
		formatter.showError(error instanceof Error ? error : new Error(String(error)));
		process.exit(1);
	}
}
