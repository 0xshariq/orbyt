import type { Command } from 'commander';
import { OrbytEngine } from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';

interface AdaptersOptions {
	verify?: boolean;
	format?: string;
	verbose?: boolean;
	silent?: boolean;
	noColor?: boolean;
}

interface AdapterVerification {
	name: string;
	ok: boolean;
	detail: string;
}

interface AdapterStat {
	name: string;
	version: string;
	supportedActions: string[];
	isInitialized: boolean;
}

interface AdapterStats {
	total: number;
	initialized: number;
	adapters: AdapterStat[];
}

interface EngineDiagnosticsAccess {
	getAdapterStats?: () => AdapterStats;
}

export function registerAdaptersCommand(program: Command): void {
	program
		.command('adapters')
		.description('List registered adapters and optionally verify adapter metadata')
		.option('--verify', 'Verify adapter metadata and action declarations')
		.option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
		.option('--verbose', 'Show detailed adapter actions')
		.option('--silent', 'Minimal output')
		.option('--no-color', 'Disable colored output')
		.action(runAdapters);
}

async function runAdapters(options: AdaptersOptions): Promise<void> {
	const format = (options.format || 'human') as FormatterType;
	const formatter = createFormatter(format, {
		verbose: options.verbose,
		silent: options.silent,
		noColor: options.noColor,
	});

	try {
		const engine = new OrbytEngine({ logLevel: 'silent' });
		const diagnostics = engine as unknown as EngineDiagnosticsAccess;
		const fallbackAdapters: AdapterStat[] = [
			{ name: 'cli', version: 'builtin', supportedActions: ['cli.run'], isInitialized: false },
			{ name: 'shell', version: 'builtin', supportedActions: ['shell.exec'], isInitialized: false },
			{ name: 'http', version: 'builtin', supportedActions: ['http.request'], isInitialized: false },
			{ name: 'fs', version: 'builtin', supportedActions: ['fs.read', 'fs.write'], isInitialized: false },
		];
		const stats: AdapterStats = diagnostics.getAdapterStats
			? diagnostics.getAdapterStats()
			: {
					total: fallbackAdapters.length,
					initialized: 0,
					adapters: fallbackAdapters,
				};

		const verificationResults: AdapterVerification[] = options.verify
			? stats.adapters.map((adapter: AdapterStat) => verifyAdapter(adapter))
			: [];

		if (format === 'json') {
			process.stdout.write(`${JSON.stringify({
				total: stats.total,
				initialized: stats.initialized,
				adapters: stats.adapters,
				verification: verificationResults,
			}, null, 2)}\n`);
		} else {
			if (!options.silent) {
				formatter.showInfo('Registered Adapters');
				formatter.showInfo(`Total: ${stats.total}`);
				formatter.showInfo(`Initialized: ${stats.initialized}`);
				formatter.showInfo('');
			}

			for (const adapter of stats.adapters) {
				const initMark = adapter.isInitialized ? '✓' : '○';
				formatter.showInfo(`${initMark} ${adapter.name}@${adapter.version} (${adapter.supportedActions.length} actions)`);

				if (options.verbose && adapter.supportedActions.length > 0) {
					for (const action of adapter.supportedActions) {
						formatter.showInfo(`  - ${action}`);
					}
				}
			}

			if (options.verify) {
				formatter.showInfo('');
				formatter.showInfo('Verification');
				for (const result of verificationResults) {
					const marker = result.ok ? '✓' : '✗';
					formatter.showInfo(`${marker} ${result.name}: ${result.detail}`);
				}
			}
		}

		const hasFailures = verificationResults.some((result) => !result.ok);
		process.exit(hasFailures ? 1 : 0);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		formatter.showError(err);
		process.exit(1);
	}
}

function verifyAdapter(adapter: AdapterStat): AdapterVerification {
	if (!adapter.version || adapter.version.trim().length === 0) {
		return {
			name: adapter.name,
			ok: false,
			detail: 'Missing version',
		};
	}

	if (!adapter.supportedActions || adapter.supportedActions.length === 0) {
		return {
			name: adapter.name,
			ok: false,
			detail: 'No supported actions declared',
		};
	}

	const invalidAction = adapter.supportedActions.find((action) => action.split('.').length < 2);
	if (invalidAction) {
		return {
			name: adapter.name,
			ok: false,
			detail: `Invalid action format: ${invalidAction}`,
		};
	}

	return {
		name: adapter.name,
		ok: true,
		detail: `${adapter.supportedActions.length} actions declared`,
	};
}
