import { accessSync, constants as FsConstants, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Command } from 'commander';
import { OrbytEngine } from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';

interface DoctorOptions {
	format?: string;
	verbose?: boolean;
	silent?: boolean;
	noColor?: boolean;
}

interface CheckResult {
	name: string;
	ok: boolean;
	detail: string;
}

interface DoctorReport {
	engineVersion: string;
	schedulerEnabled: boolean;
	adapterCount: number;
	checks: CheckResult[];
}

interface EngineDiagnosticsAccess {
	getVersion?: () => string;
	getAdapterStats?: () => {
		total: number;
		initialized: number;
		adapters: Array<{
			name: string;
			version: string;
			supportedActions: string[];
			isInitialized: boolean;
		}>;
	};
}

export function registerEngineCommand(program: Command): void {
	program
		.command('doctor')
		.description('Run Orbyt engine diagnostics')
		.option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
		.option('--verbose', 'Show detailed diagnostics output')
		.option('--silent', 'Minimal output')
		.option('--no-color', 'Disable colored output')
		.action(runDoctor);
}

async function runDoctor(options: DoctorOptions): Promise<void> {
	const format = (options.format || 'human') as FormatterType;
	const formatter = createFormatter(format, {
		verbose: options.verbose,
		silent: options.silent,
		noColor: options.noColor,
	});

	try {
		const engine = new OrbytEngine({ logLevel: 'silent' });
		const config = engine.getConfig();
		const diagnostics = engine as unknown as EngineDiagnosticsAccess;
		const adapterStats = diagnostics.getAdapterStats ? diagnostics.getAdapterStats() : {
			total: (config.adapters?.length || 0) + 4,
			initialized: 0,
			adapters: [] as Array<{
				name: string;
				version: string;
				supportedActions: string[];
				isInitialized: boolean;
			}>,
		};

		const stateDir = config.stateDir || '';
		const logDir = config.logDir || '';
		const orbytHome = stateDir ? dirname(stateDir) : '';

		const checks: CheckResult[] = [
			checkDirectory('Orbyt home directory', orbytHome),
			checkDirectory('State directory', stateDir),
			checkDirectory('Log directory', logDir),
			{
				name: 'Scheduler configuration',
				ok: config.enableScheduler === true,
				detail: `enableScheduler=${String(config.enableScheduler)}`,
			},
			{
				name: 'Registered adapters',
				ok: adapterStats.total > 0,
				detail: `${adapterStats.total} adapter(s) registered`,
			},
		];

		const report: DoctorReport = {
			engineVersion: diagnostics.getVersion ? diagnostics.getVersion() : 'unknown',
			schedulerEnabled: config.enableScheduler === true,
			adapterCount: adapterStats.total,
			checks,
		};

		if (format === 'json') {
			process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		} else {
			if (!options.silent) {
				formatter.showInfo('Orbyt Diagnostics');
				formatter.showInfo(`Engine version: ${report.engineVersion}`);
				formatter.showInfo(`Scheduler enabled: ${String(report.schedulerEnabled)}`);
				formatter.showInfo(`Adapters registered: ${report.adapterCount}`);
				formatter.showInfo('');
			}

			for (const check of checks) {
				const prefix = check.ok ? '✓' : '✗';
				formatter.showInfo(`${prefix} ${check.name}: ${check.detail}`);
			}
		}

		const hasFailure = checks.some((check) => !check.ok);
		process.exit(hasFailure ? 1 : 0);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		formatter.showError(err);
		process.exit(1);
	}
}

function checkDirectory(name: string, dir: string): CheckResult {
	if (!dir) {
		return { name, ok: false, detail: 'Path is empty' };
	}

	try {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		accessSync(dir, FsConstants.R_OK | FsConstants.W_OK);
		return { name, ok: true, detail: dir };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { name, ok: false, detail: `${dir} (${message})` };
	}
}
