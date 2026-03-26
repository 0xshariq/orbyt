import { accessSync, constants as FsConstants, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

interface UsageSpoolReport {
	baseDir: string;
	pendingCount: number;
	sentCount: number;
	failedCount: number;
	eventArchiveDays: number;
	collectorHealth: {
		healthy: boolean;
		detail?: string;
		lastSuccessAt?: number;
	};
}

interface UsageAggregateRunResult {
	processedDays: number;
	updatedBuckets: number;
	watermarkDay?: string;
	aggregateFile: string;
	watermarkFile: string;
}

interface EngineDiagnosticsAccess {
	getVersion?: () => string;
	getUsageCollectorHealth?: () => Promise<{
		healthy: boolean;
		detail?: string;
		lastSuccessAt?: number;
	}>;
	runDailyUsageAggregation?: () => UsageAggregateRunResult;
	getDailyUsageAggregates?: (options?: {
		day?: string;
		workspaceId?: string;
		product?: string;
		limit?: number;
	}) => Array<Record<string, unknown>>;
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

	program
		.command('usage-spool')
		.description('Inspect local usage spool health and queue sizes')
		.option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
		.option('--verbose', 'Show detailed diagnostics output')
		.option('--silent', 'Minimal output')
		.option('--no-color', 'Disable colored output')
		.action(runUsageSpool);

	program
		.command('usage-aggregate')
		.description('Build and inspect persisted daily usage aggregates')
		.option('--day <yyyy-mm-dd>', 'Filter aggregate rows by day')
		.option('--workspace-id <id>', 'Filter aggregate rows by workspace id')
		.option('--product <name>', 'Filter aggregate rows by product')
		.option('--limit <n>', 'Maximum rows to print', parseInt)
		.option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
		.option('--verbose', 'Show detailed diagnostics output')
		.option('--silent', 'Minimal output')
		.option('--no-color', 'Disable colored output')
		.action(runUsageAggregate);
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

async function runUsageSpool(options: DoctorOptions): Promise<void> {
	const format = (options.format || 'human') as FormatterType;
	const formatter = createFormatter(format, {
		verbose: options.verbose,
		silent: options.silent,
		noColor: options.noColor,
	});

	try {
		const engine = new OrbytEngine({ logLevel: 'silent' });
		const diagnostics = engine as unknown as EngineDiagnosticsAccess;
		const config = engine.getConfig();
		const baseDir = ((config as unknown as { usageSpool?: { baseDir?: string } }).usageSpool?.baseDir) || '';

		const collectorHealth = diagnostics.getUsageCollectorHealth
			? await diagnostics.getUsageCollectorHealth()
			: {
				healthy: true,
				detail: 'collector health API unavailable in this engine build',
			};

		const report: UsageSpoolReport = {
			baseDir,
			pendingCount: countFiles(join(baseDir, 'pending'), '.json'),
			sentCount: countFiles(join(baseDir, 'sent'), '.json'),
			failedCount: countFiles(join(baseDir, 'failed'), '.json'),
			eventArchiveDays: countFiles(join(baseDir, 'events'), '.jsonl'),
			collectorHealth,
		};

		if (format === 'json') {
			process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		} else {
			formatter.showInfo('Usage Spool Diagnostics');
			formatter.showInfo(`Base directory: ${report.baseDir}`);
			formatter.showInfo(`Pending envelopes: ${report.pendingCount}`);
			formatter.showInfo(`Sent envelopes: ${report.sentCount}`);
			formatter.showInfo(`Failed envelopes: ${report.failedCount}`);
			formatter.showInfo(`Archived event days: ${report.eventArchiveDays}`);
			formatter.showInfo(
				`Collector health: ${report.collectorHealth.healthy ? 'healthy' : 'unhealthy'} ` +
				`(${report.collectorHealth.detail || 'no detail'})`,
			);

			if (report.collectorHealth.lastSuccessAt) {
				formatter.showInfo(`Collector last success: ${new Date(report.collectorHealth.lastSuccessAt).toISOString()}`);
			}
		}

		process.exit(report.collectorHealth.healthy ? 0 : 1);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		formatter.showError(err);
		process.exit(1);
	}
}

function countFiles(dir: string, suffix: '.json' | '.jsonl'): number {
	if (!dir || !existsSync(dir)) {
		return 0;
	}

	try {
		return readdirSync(dir).filter((name) => name.endsWith(suffix)).length;
	} catch {
		return 0;
	}
}

async function runUsageAggregate(options: {
	day?: string;
	workspaceId?: string;
	product?: string;
	limit?: number;
	format?: string;
	verbose?: boolean;
	silent?: boolean;
	noColor?: boolean;
}): Promise<void> {
	const format = (options.format || 'human') as FormatterType;
	const formatter = createFormatter(format, {
		verbose: options.verbose,
		silent: options.silent,
		noColor: options.noColor,
	});

	try {
		const engine = new OrbytEngine({ logLevel: 'silent' });
		const diagnostics = engine as unknown as EngineDiagnosticsAccess;

		if (typeof diagnostics.runDailyUsageAggregation !== 'function' || typeof diagnostics.getDailyUsageAggregates !== 'function') {
			throw new Error('This installed engine version does not expose daily usage aggregation APIs. Upgrade @orbytautomation/engine.');
		}

		const runResult = diagnostics.runDailyUsageAggregation();
		const rows = diagnostics.getDailyUsageAggregates({
			day: options.day,
			workspaceId: options.workspaceId,
			product: options.product,
			limit: options.limit,
		});

		if (format === 'json') {
			process.stdout.write(`${JSON.stringify({ runResult, rows }, null, 2)}\n`);
		} else {
			formatter.showInfo('Daily Usage Aggregation');
			formatter.showInfo(`Processed days: ${runResult.processedDays}`);
			formatter.showInfo(`Updated buckets: ${runResult.updatedBuckets}`);
			formatter.showInfo(`Watermark day: ${runResult.watermarkDay || 'none'}`);
			formatter.showInfo(`Aggregate file: ${runResult.aggregateFile}`);
			formatter.showInfo(`Watermark file: ${runResult.watermarkFile}`);
			formatter.showInfo(`Rows returned: ${rows.length}`);

			if (!options.silent && rows.length > 0) {
				for (const row of rows.slice(0, options.limit && options.limit > 0 ? options.limit : 20)) {
					formatter.showInfo(JSON.stringify(row));
				}
			}
		}

		process.exit(0);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		formatter.showError(err);
		process.exit(1);
	}
}
