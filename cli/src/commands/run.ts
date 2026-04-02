/**
 * Run Command
 * 
 * Executes one or more workflow files sequentially and displays results.
 * This is the main command users will use.
 * 
 * Usage:
 *   orbyt run workflow.yaml
 *   orbyt run workflow.yaml --var input=data.json
 *   orbyt run workflow.yaml --dry-run
 *   orbyt run workflow.yaml --format json
 *   orbyt run workflow1.yaml,workflow2.yaml,workflow3.yaml (sequential execution)
 * 
 * Sequential Multi-File Execution:
 *   Multiple workflows separated by comma will run sequentially.
 *   Each workflow gets:
 *   - Separate runId
 *   - Separate state
 *   - Separate billing event
 *   This is CLI-level orchestration (engine remains unchanged).
 *
 * TODO(cli-vnext): Add currently documented but not yet implemented flags:
 * - --step <stepId>
 * - --until <stepId>
 * - --fail-fast
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { Command } from 'commander';
import {
  OrbytEngine,
  WorkflowLoader,
  type MultiWorkflowExecutionMode,
  type ParsedWorkflow,
  type WorkflowBatchResult,
  type WorkflowResult,
} from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';
import type { CliRunOptions } from '../types/CliRunOptions.js';
import { parseKeyValuePairs } from '../types/CliRunOptions.js';
import {
  CliEventType,
  type WorkflowStartedEvent,
  type WorkflowCompletedEvent,
  type WorkflowFailedEvent,
  type StepStartedEvent,
  type StepCompletedEvent,
  type StepFailedEvent
} from '../types/CliEvent.js';

/**
 * Result tracking for sequential multi-file execution
 */
interface MultiWorkflowResult {
  workflowPath: string;
  result?: WorkflowResult;
  error?: Error;
  status: 'success' | 'failed' | 'partial' | 'timeout';
}

/**
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command('run <workflow>')
    .description('Execute one or more workflows (comma-separated for sequential execution)')
    .option('-v, --var <key=value...>', 'Set workflow variables (can be used multiple times)')
    .option('--vars-file <path>', 'Load variables from JSON/YAML file')
    .option('-e, --env <key=value...>', 'Set environment variables')
    .option('--env-file <path>', 'Load environment variables from file')
    .option('-t, --timeout <seconds>', 'Workflow timeout in seconds', parseInt)
    .option('--continue-on-error', 'Continue execution even if steps fail')
    // TODO(cli-vnext): add --fail-fast alias with explicit semantics distinct from --continue-on-error
    .option('--dry-run', 'Validate and plan without executing')
    // TODO(cli-vnext): add --step <stepId> and --until <stepId> once engine-level step slicing contract is finalized
    .option('--mode <mode>', 'Multi-workflow mode (sequential|parallel|mixed)')
    .option('--max-concurrency <n>', 'Max concurrent workflows for parallel mode', parseInt)
    .option('--mixed-batch-size <n>', 'Workflows per wave in mixed mode', parseInt)
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--verbose', 'Show detailed output')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(runWorkflow);
}

/**
 * Run workflow command handler
 * 
 * Supports both single and sequential multi-file execution:
 * - Single: orbyt run workflow.yaml
 * - Multiple: orbyt run a.yaml,b.yaml,c.yaml
 */
async function runWorkflow(workflowPath: string, options: CliRunOptions): Promise<void> {
  // Determine format
  const format = (options.format || 'human') as FormatterType;

  // Apply verbose to format if flag is set
  if (options.verbose && format === 'human') {
    options.format = 'verbose';
  }

  // Create formatter (single instance for all workflows)
  const formatter = createFormatter(format, {
    verbose: options.verbose,
    silent: options.silent,
    noColor: options.noColor,
  });

  try {
    // Parse workflow paths (comma-separated)
    const workflowPaths = workflowPath.split(',').map(p => p.trim()).filter(p => p.length > 0);

    // TODO(cli-vnext): when --step/--until are introduced, reject comma-separated multi-workflow input
    // for those flags to avoid ambiguous execution boundaries.

    if (workflowPaths.length === 0) {
      formatter.showError(new Error('No workflow paths provided'));
      process.exit(1);
    }

    // Resolve and validate all paths before execution
    const resolvedPaths: string[] = [];
    for (const path of workflowPaths) {
      const resolvedPath = resolve(path);

      if (!existsSync(resolvedPath)) {
        formatter.showError(new Error(`Workflow file not found: ${path}`));
        process.exit(1);
      }

      resolvedPaths.push(resolvedPath);
    }

    // Parse shared variables (applied to all workflows)
    const variables: Record<string, string> = {};

    if (options.vars && Array.isArray(options.vars)) {
      Object.assign(variables, parseKeyValuePairs(options.vars));
    }

    // Load variables file if provided
    if (options.varsFile) {
      const varsFileContent = await readFile(options.varsFile, 'utf-8');
      const varsFromFile = JSON.parse(varsFileContent);
      Object.assign(variables, varsFromFile);
    }

    // Parse shared environment variables
    const env: Record<string, string> = {};

    if (options.env && Array.isArray(options.env)) {
      Object.assign(env, parseKeyValuePairs(options.env));
    }

    // Validate mode option early
    const requestedMode = options.mode as MultiWorkflowExecutionMode | undefined;
    if (requestedMode && !['sequential', 'parallel', 'mixed'].includes(requestedMode)) {
      formatter.showError(new Error(`Invalid mode: ${requestedMode}. Use sequential|parallel|mixed.`));
      process.exit(1);
    }

    // Initialize one engine for the entire invocation.
    const engine = new OrbytEngine({
      logLevel: options.verbose ? 'debug' : 'info',
      verbose: options.verbose || false,
      mode: options.dryRun ? 'dry-run' : 'local',
    });
    wireEngineEvents(engine, formatter);

    // Preload phase: load and validate all workflows before execution starts.
    formatter.showInfo('Loading workflows...');
    const loadedWorkflows: ParsedWorkflow[] = [];
    for (const workflowPath of resolvedPaths) {
      const workflow = await WorkflowLoader.fromFile(workflowPath, { variables });
      loadedWorkflows.push(workflow);
    }
    formatter.showInfo(`Loaded ${loadedWorkflows.length} workflow(s)`);

    // Execute all workflows through engine batch API.
    const batch: WorkflowBatchResult = await engine.runMany(loadedWorkflows, {
      variables,
      env,
      timeout: options.timeout ? options.timeout * 1000 : undefined,
      continueOnError: options.continueOnError,
      // TODO(cli-vnext): map --fail-fast to continueOnError=false with explicit precedence rules.
      dryRun: options.dryRun,
      executionMode: requestedMode,
      maxParallelWorkflows: options.maxConcurrency,
      mixedBatchSize: options.mixedBatchSize,
    });

    formatter.showInfo(`Execution mode: ${batch.mode}`);

    const results: MultiWorkflowResult[] = batch.results.map((item, index) => {
      if (item.result) {
        formatter.showResult(item.result);
      } else if (item.error) {
        formatter.showError(item.error);
      }

      return {
        workflowPath: workflowPaths[index] || item.source,
        result: item.result,
        error: item.error,
        status: item.result
          ? (item.result.status === 'failure' ? 'failed' : item.result.status)
          : 'failed',
      };
    });

    if (results.length > 1) {
      showMultiWorkflowSummary(results, formatter);
    }

    process.exit(determineExitCode(results));

  } catch (error) {
    // Handle top-level errors (file system, parsing, etc.)
    formatter.showError(error instanceof Error ? error : new Error(String(error)));
    process.exit(4);
  }
}

/**
 * Wire engine events to formatter
 * 
 * Translates engine events to CLI events and forwards to formatter.
 * This is the bridge between engine and CLI display layer.
 */
function wireEngineEvents(engine: OrbytEngine, formatter: any): void {
  const eventBus = engine.getEventBus();

  eventBus.on('workflow.started', (event: any) => {
    const cliEvent: WorkflowStartedEvent = {
      type: CliEventType.WORKFLOW_STARTED,
      timestamp: new Date(event.timestamp),
      workflowName: event.workflowName || 'Workflow',
      totalSteps: event.totalSteps || 0,
    };
    formatter.onEvent(cliEvent);
  });

  eventBus.on('workflow.completed', (event: any) => {
    const cliEvent: WorkflowCompletedEvent = {
      type: CliEventType.WORKFLOW_COMPLETED,
      timestamp: new Date(event.timestamp),
      workflowName: event.workflowName || 'Workflow',
      status: event.status === 'success' ? 'success' : 'partial',
      duration: event.durationMs || 0,
      successfulSteps: event.successfulSteps || 0,
      failedSteps: event.failedSteps || 0,
      skippedSteps: event.skippedSteps || 0,
    };
    formatter.onEvent(cliEvent);
  });

  eventBus.on('workflow.failed', (event: any) => {
    const cliEvent: WorkflowFailedEvent = {
      type: CliEventType.WORKFLOW_FAILED,
      timestamp: new Date(event.timestamp),
      workflowName: event.workflowName || 'Workflow',
      error: event.error || new Error('Workflow failed'),
      duration: event.durationMs || 0,
    };
    formatter.onEvent(cliEvent);
  });

  eventBus.on('step.started', (event: any) => {
    const cliEvent: StepStartedEvent = {
      type: CliEventType.STEP_STARTED,
      timestamp: new Date(event.timestamp),
      stepId: event.stepId,
      stepName: event.stepName || event.stepId,
      adapter: event.adapter || 'unknown',
      action: event.action || 'execute',
    };
    formatter.onEvent(cliEvent);
  });

  eventBus.on('step.completed', (event: any) => {
    const cliEvent: StepCompletedEvent = {
      type: CliEventType.STEP_COMPLETED,
      timestamp: new Date(event.timestamp),
      stepId: event.stepId,
      stepName: event.stepName || event.stepId,
      duration: event.durationMs || 0,
      output: event.output,
    };
    formatter.onEvent(cliEvent);
  });

  eventBus.on('step.failed', (event: any) => {
    const cliEvent: StepFailedEvent = {
      type: CliEventType.STEP_FAILED,
      timestamp: new Date(event.timestamp),
      stepId: event.stepId,
      stepName: event.stepName || event.stepId,
      error: event.error || new Error('Step failed'),
      duration: event.durationMs || 0,
    };
    formatter.onEvent(cliEvent);
  });
}

/**
 * Show overall summary for multi-workflow execution
 */
function showMultiWorkflowSummary(results: MultiWorkflowResult[], formatter: any): void {
  formatter.showInfo('\n' + '='.repeat(60));
  formatter.showInfo('OVERALL SUMMARY');
  formatter.showInfo('='.repeat(60));

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const partialCount = results.filter(r => r.status === 'partial').length;
  const timeoutCount = results.filter(r => r.status === 'timeout').length;

  formatter.showInfo(`Total workflows: ${results.length}`);
  formatter.showInfo(`  ✔ Successful: ${successCount}`);
  if (failedCount > 0) formatter.showWarning(`  ✖ Failed: ${failedCount}`);
  if (partialCount > 0) formatter.showWarning(`  ⚠ Partial: ${partialCount}`);
  if (timeoutCount > 0) formatter.showWarning(`  ⏱ Timeout: ${timeoutCount}`);

  formatter.showInfo('\nWorkflow Results:');
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const statusIcon = result.status === 'success' ? '✔'
      : result.status === 'partial' ? '⚠'
        : '✖';

    formatter.showInfo(`  ${statusIcon} ${result.workflowPath} - ${result.status.toUpperCase()}`);
  }

  formatter.showInfo('='.repeat(60));
}

/**
 * Determine exit code based on overall results
 * 
 * Exit codes:
 * - 0: All workflows succeeded
 * - 2: Some workflows failed or partial
 * - 3: Some workflows timed out
 * - 4: Internal error
 */
function determineExitCode(results: MultiWorkflowResult[]): number {
  const hasTimeout = results.some(r => r.status === 'timeout');
  const hasFailed = results.some(r => r.status === 'failed');
  const hasPartial = results.some(r => r.status === 'partial');
  const allSuccess = results.every(r => r.status === 'success');

  if (allSuccess) return 0;
  if (hasTimeout) return 3;
  if (hasFailed || hasPartial) return 2;

  return 4; // Fallback
}
