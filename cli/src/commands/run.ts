/**
 * Run Command
 * 
 * Executes a workflow file and displays results.
 * This is the main command users will use.
 * 
 * Usage:
 *   orbyt run workflow.yaml
 *   orbyt run workflow.yaml --var input=data.json
 *   orbyt run workflow.yaml --dry-run
 *   orbyt run workflow.yaml --format json
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { Command } from 'commander';
import { OrbytEngine, type WorkflowResult } from '@orbytautomation/engine';
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
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command('run <workflow>')
    .description('Execute a workflow')
    .option('-v, --var <key=value...>', 'Set workflow variables (can be used multiple times)')
    .option('--vars-file <path>', 'Load variables from JSON/YAML file')
    .option('-e, --env <key=value...>', 'Set environment variables')
    .option('--env-file <path>', 'Load environment variables from file')
    .option('-t, --timeout <seconds>', 'Workflow timeout in seconds', parseInt)
    .option('--continue-on-error', 'Continue execution even if steps fail')
    .option('--dry-run', 'Validate and plan without executing')
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--verbose', 'Show detailed output')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(runWorkflow);
}

/**
 * Run workflow command handler
 */
async function runWorkflow(workflowPath: string, options: CliRunOptions): Promise<void> {
  // Determine format
  const format = (options.format || 'human') as FormatterType;
  
  // Apply verbose to format if flag is set
  if (options.verbose && format === 'human') {
    options.format = 'verbose';
  }
  
  // Create formatter
  const formatter = createFormatter(format, {
    verbose: options.verbose,
    silent: options.silent,
    noColor: options.noColor,
  });

  try {
    // Resolve and validate workflow path
    const resolvedPath = resolve(workflowPath);
    
    if (!existsSync(resolvedPath)) {
      formatter.showError(new Error(`Workflow file not found: ${workflowPath}`));
      process.exit(1);
    }

    // Parse variables
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

    // Parse environment variables
    const env: Record<string, string> = {};
    
    if (options.env && Array.isArray(options.env)) {
      Object.assign(env, parseKeyValuePairs(options.env));
    }

    // Initialize engine
    const engine = new OrbytEngine({
      logLevel: options.verbose ? 'debug' : 'info',
      verbose: options.verbose || false,
      mode: options.dryRun ? 'dry-run' : 'local',
    });

    // Wire up event bus to formatter
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

    // Run workflow
    const result: WorkflowResult = await engine.run(resolvedPath, {
      variables,
      env,
      timeout: options.timeout ? options.timeout * 1000 : undefined,
      continueOnError: options.continueOnError,
      dryRun: options.dryRun,
    });

    // Show result
    formatter.showResult(result);

    // Exit with appropriate code
    if (result.status === 'success') {
      process.exit(0);
    } else if (result.status === 'partial') {
      process.exit(2); // Partial success (some steps failed)
    } else if (result.status === 'timeout') {
      process.exit(3); // Timeout
    } else {
      process.exit(2); // Execution failed
    }

  } catch (error) {
    // Handle errors
    formatter.showError(error instanceof Error ? error : new Error(String(error)));
    
    // Exit with error code
    if (error instanceof Error) {
      // Check if it's a validation error
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        process.exit(1); // Validation error
      }
    }
    
    process.exit(4); // Internal error
  }
}
