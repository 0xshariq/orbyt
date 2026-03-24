import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Command } from 'commander';
import type { Adapter } from '@dev-ecosystem/core';
import {
  OrbytEngine,
  WorkflowLoader,
  type OrbytEngineConfig,
  type ParsedWorkflow,
} from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';
import { parseKeyValuePairs } from '../types/CliRunOptions.js';

interface DistributedBaseOptions {
  format?: FormatterType;
  verbose?: boolean;
  silent?: boolean;
  noColor?: boolean;
  queueBackend?: 'memory' | 'file';
  queueStateDir?: string;
  workers?: number;
  pollMs?: number;
  leaseMs?: number;
  leaseExtensionMs?: number;
}

interface DistributedRunOptions extends DistributedBaseOptions {
  vars?: string[];
  env?: string[];
  timeout?: number;
  continueOnError?: boolean;
}

interface DistributedUsageOptions extends DistributedBaseOptions {
  from?: string;
  to?: string;
  groupBy?: 'none' | 'hourly' | 'daily' | 'weekly' | 'workflow' | 'adapter' | 'trigger' | 'product' | 'workspace' | 'user' | 'type';
  userId?: string;
  workspaceId?: string;
  product?: string;
  eventType?: string;
  adapterName?: string;
  adapterType?: string;
  limit?: number;
  includeEvents?: boolean;
}

class CliDistributedSmokeAdapter implements Adapter {
  readonly name = 'smoke';
  readonly version = '1.0.0';
  readonly supportedActions = ['smoke.exec'];
  readonly capabilities = {
    actions: ['smoke.exec'],
    idempotent: true,
    sideEffectLevel: 'low' as const,
  };

  supports(action: string): boolean {
    return action === 'smoke.exec';
  }

  async execute(_action: string, input: any): Promise<any> {
    return {
      ok: true,
      echo: input,
      ts: Date.now(),
    };
  }
}

export function registerDistributedCommand(program: Command): void {
  const distributed = program
    .command('distributed')
    .description('Distributed execution and diagnostics commands for Orbyt engine');

  distributed
    .command('run <workflow>')
    .description('Run a workflow using distributed mode through queue->workers runtime')
    .option('-v, --var <key=value...>', 'Set workflow variables (can be used multiple times)')
    .option('-e, --env <key=value...>', 'Set environment variables')
    .option('-t, --timeout <seconds>', 'Workflow timeout in seconds', parseInt)
    .option('--continue-on-error', 'Continue execution even if steps fail')
    .option('--queue-backend <backend>', 'Distributed queue backend (memory|file)', 'memory')
    .option('--queue-state-dir <path>', 'State directory for file queue backend')
    .option('--workers <n>', 'Distributed worker count', parseInt)
    .option('--poll-ms <n>', 'Worker poll interval in milliseconds', parseInt)
    .option('--lease-ms <n>', 'Job lease duration in milliseconds', parseInt)
    .option('--lease-extension-ms <n>', 'Job lease heartbeat interval in milliseconds', parseInt)
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--verbose', 'Show detailed output')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(runDistributedWorkflow);

  distributed
    .command('smoke')
    .description('Run a built-in distributed smoke workflow for quick engine verification')
    .option('--queue-backend <backend>', 'Distributed queue backend (memory|file)', 'memory')
    .option('--queue-state-dir <path>', 'State directory for file queue backend')
    .option('--workers <n>', 'Distributed worker count', parseInt)
    .option('--poll-ms <n>', 'Worker poll interval in milliseconds', parseInt)
    .option('--lease-ms <n>', 'Job lease duration in milliseconds', parseInt)
    .option('--lease-extension-ms <n>', 'Job lease heartbeat interval in milliseconds', parseInt)
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--verbose', 'Show detailed output')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(runDistributedSmoke);

  distributed
    .command('usage')
    .description('Query distributed usage facts from the local usage spool')
    .option('--from <date>', 'Start time (ISO date or unix ms)')
    .option('--to <date>', 'End time (ISO date or unix ms)')
    .option('--group-by <mode>', 'Grouping (none|hourly|daily|weekly|workflow|adapter|trigger|product|workspace|user|type)', 'none')
    .option('--user-id <id>', 'Filter by user id')
    .option('--workspace-id <id>', 'Filter by workspace id')
    .option('--product <name>', 'Filter by product')
    .option('--event-type <type>', 'Filter by event type')
    .option('--adapter-name <name>', 'Filter by adapter name')
    .option('--adapter-type <type>', 'Filter by adapter type')
    .option('--limit <n>', 'Max events returned when include-events is set', parseInt)
    .option('--include-events', 'Include matched raw events in output')
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--verbose', 'Show detailed output')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(runDistributedUsageQuery);
}

async function runDistributedWorkflow(workflowPath: string, options: DistributedRunOptions): Promise<void> {
  try {
    const engine = new OrbytEngine(createDistributedEngineConfig(options));
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

    const variables = options.vars ? parseKeyValuePairs(options.vars) : {};
    const env = options.env ? parseKeyValuePairs(options.env) : {};

    const workflow = await WorkflowLoader.fromFile(resolvedPath, { variables });
    const result = await engine.run(workflow, {
      variables,
      env,
      timeout: options.timeout ? options.timeout * 1000 : undefined,
      continueOnError: options.continueOnError,
    });

    formatter.showResult(result);
    process.exit(result.status === 'failure' || result.status === 'timeout' ? 1 : 0);
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

async function runDistributedSmoke(options: DistributedBaseOptions): Promise<void> {
  try {
    const engine = new OrbytEngine(createDistributedEngineConfig(options));
    const formatter = createFormatter((options.format || 'human') as FormatterType, {
      verbose: options.verbose,
      silent: options.silent,
      noColor: options.noColor,
    });

    engine.registerAdapter(new CliDistributedSmokeAdapter());

    const workflow: ParsedWorkflow = {
      version: '1.0',
      kind: 'workflow',
      name: 'cli-distributed-smoke',
      steps: [
        {
          id: 's1',
          adapter: 'smoke',
          action: 'smoke.exec',
          input: { value: 1 },
          needs: [],
          continueOnError: false,
        },
        {
          id: 's2',
          adapter: 'smoke',
          action: 'smoke.exec',
          input: { value: 2 },
          needs: ['s1'],
          continueOnError: false,
        },
      ],
    };

    const result = await engine.run(workflow);
    formatter.showResult(result);

    if (result.status === 'success') {
      formatter.showInfo('Distributed smoke test passed.');
      process.exit(0);
    }

    formatter.showWarning(`Distributed smoke test finished with status: ${result.status}`);
    process.exit(1);
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

async function runDistributedUsageQuery(options: DistributedUsageOptions): Promise<void> {
  const format = (options.format || 'human') as FormatterType;
  try {
    const engine = new OrbytEngine(createDistributedEngineConfig(options));
    const formatter = createFormatter(format, {
      verbose: options.verbose,
      silent: options.silent,
      noColor: options.noColor,
    });

    const usageQuery = {
      from: parseDateInput(options.from),
      to: parseDateInput(options.to),
      groupBy: options.groupBy,
      userId: options.userId,
      workspaceId: options.workspaceId,
      product: options.product,
      eventType: options.eventType,
      adapterName: options.adapterName,
      adapterType: options.adapterType,
      limit: options.limit,
      includeEvents: options.includeEvents,
    };

    const usageApi = (engine as unknown as {
      getUsage?: (query: Record<string, unknown>) => Promise<any>;
    }).getUsage;

    if (typeof usageApi !== 'function') {
      throw new Error(
        'This installed engine version does not expose getUsage(). Upgrade @orbytautomation/engine to use distributed usage queries.',
      );
    }

    const usage = await usageApi(usageQuery);

    if (format === 'json') {
      process.stdout.write(`${JSON.stringify(usage, null, 2)}\n`);
    } else {
      formatter.showInfo(`Total events: ${usage.totalEvents}`);
      formatter.showInfo(`Billable events: ${usage.billableEvents}`);
      formatter.showInfo(`Success events: ${usage.successEvents}`);
      formatter.showInfo(`Failure events: ${usage.failureEvents}`);
      formatter.showInfo(`Duration sum (ms): ${usage.totalDurationMs}`);
      formatter.showInfo(`Groups: ${usage.grouped.length}`);

      if (usage.grouped.length > 0 && !options.silent) {
        for (const group of usage.grouped.slice(0, 20)) {
          formatter.showInfo(
            `group=${group.key} events=${group.eventCount} billable=${group.billableCount} ` +
            `success=${group.successCount} failure=${group.failureCount} durationMs=${group.totalDurationMs}`,
          );
        }
      }
    }

    process.exit(0);
  } catch (error) {
    const formatter = createFormatter(format, {
      verbose: options.verbose,
      silent: options.silent,
      noColor: options.noColor,
    });
    formatter.showError(error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

function createDistributedEngineConfig(options: DistributedBaseOptions): OrbytEngineConfig {
  const queueBackend = options.queueBackend === 'file' ? 'file' : 'memory';
  const queueStateDir = options.queueStateDir
    ? resolve(options.queueStateDir)
    : join(process.cwd(), '.orbyt', 'distributed-queue');

  const logLevel: NonNullable<OrbytEngineConfig['logLevel']> = options.verbose ? 'debug' : 'info';

  const config: OrbytEngineConfig = {
    mode: 'distributed' as const,
    enableScheduler: false,
    logLevel,
  };

  (config as any).distributed = {
    queueBackend,
    fileQueueStateDir: queueStateDir,
    workerCount: options.workers,
    pollIntervalMs: options.pollMs,
    leaseMs: options.leaseMs,
    leaseExtensionMs: options.leaseExtensionMs,
  };

  return config;
}

function parseDateInput(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.floor(asNumber);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date input: ${value}. Use ISO date or unix milliseconds.`);
  }

  return parsed;
}
