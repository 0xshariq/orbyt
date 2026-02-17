/**
 * Explain Command
 * 
 * Explains what the engine will do when executing a workflow without actually running it.
 * Shows:
 * - Step execution order
 * - Dependencies between steps
 * - Adapter usage for each step
 * - Retry and timeout configuration
 * - Circular dependency detection
 * 
 * Usage:
 *   orbyt explain workflow.yaml
 *   orbyt explain workflow.yaml --graph (show ASCII dependency graph)
 *   orbyt explain workflow.yaml --json (machine-readable JSON output)
 *   orbyt explain workflow.yaml --verbose (show detailed configuration)
 * 
 * Exit codes:
 *   0 - Plan valid
 *   1 - Validation error
 *   2 - Circular dependencies detected
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import type { Command } from 'commander';
import { WorkflowLoader, type ExecutionExplanation } from '@orbytautomation/engine';
import { OrbytEngine } from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';
import type { CliExplainOptions } from '../types/CliExplainOptions.js';

/**
 * Register the explain command
 */
export function registerExplainCommand(program: Command): void {
  program
    .command('explain <workflow>')
    .description('Explain what the engine will do without executing the workflow')
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--graph', 'Show ASCII dependency graph')
    .option('--verbose', 'Show detailed configuration')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(explainWorkflow);
}

/**
 * Explain workflow command handler
 */
async function explainWorkflow(workflowPath: string, options: CliExplainOptions): Promise<void> {
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
    // Resolve and check path exists
    const resolvedPath = resolve(workflowPath);

    if (!existsSync(resolvedPath)) {
      formatter.showError(new Error(`Workflow file not found: ${workflowPath}`));
      process.exit(5); // CLI misuse
    }

    // Load workflow and get explanation from engine
    const workflow = await WorkflowLoader.fromFile(resolvedPath);
    
    // Create engine instance
    const engine = new OrbytEngine({
      logLevel: options.verbose ? 'debug' : 'info',
      verbose: options.verbose || false,
    });

    // Get execution explanation from engine
    const explanation = await engine.explain(workflow);

    // Check for circular dependencies
    if (explanation.hasCycles) {
      formatter.showError(new Error(`✖ Circular dependencies detected!`));
      
      if (explanation.cycles && explanation.cycles.length > 0) {
        formatter.showError(new Error(`\nCycles found:`));
        explanation.cycles.forEach((cycle, idx) => {
          formatter.showError(new Error(`  ${idx + 1}. ${cycle.join(' → ')}`));
        });
      }
      
      process.exit(2); // Cycle detected
    }

    // Output based on format
    if (format === 'json') {
      // JSON output - machine-readable
      console.log(JSON.stringify(explanation, null, 2));
    } else if (options.graph) {
      // Graph output - ASCII DAG
      showGraph(explanation, formatter);
    } else {
      // Human-readable output
      showHumanExplanation(explanation, formatter, options.verbose || false);
    }

    // Exit success
    process.exit(0);

  } catch (error) {
    // Validation or parsing error
    const err = error instanceof Error ? error : new Error(String(error));
    formatter.showError(new Error(`✖ Failed to explain workflow: ${workflowPath}`));
    formatter.showError(err);
    process.exit(1); // Validation error
  }
}

/**
 * Show human-readable explanation
 */
function showHumanExplanation(
  explanation: ExecutionExplanation,
  formatter: ReturnType<typeof createFormatter>,
  verbose: boolean
): void {
  // Header
  formatter.showInfo(`▶ Workflow: ${explanation.workflowName || 'unnamed'}`);
  if (explanation.description) {
    formatter.showInfo(`  ${explanation.description}`);
  }
  formatter.showInfo(`▶ Version: ${explanation.version}`);
  formatter.showInfo(`▶ Kind: ${explanation.kind}`);
  formatter.showInfo(`▶ Steps: ${explanation.stepCount}`);
  formatter.showInfo(`▶ Execution Mode: ${explanation.executionStrategy}`);
  
  if (explanation.phases && explanation.phases > 1) {
    formatter.showInfo(`▶ Phases: ${explanation.phases}`);
  }
  
  // Show adapters being used
  if (explanation.adaptersUsed && explanation.adaptersUsed.length > 0) {
    formatter.showInfo(`▶ Adapters Used: ${explanation.adaptersUsed.join(', ')}`);
  }
  
  // Show tags and owner if present
  if (explanation.tags && explanation.tags.length > 0) {
    formatter.showInfo(`▶ Tags: ${explanation.tags.join(', ')}`);
  }
  
  if (explanation.owner) {
    formatter.showInfo(`▶ Owner: ${explanation.owner}`);
  }
  
  // Show workflow-level configuration
  if (verbose || explanation.inputs || explanation.secrets || explanation.context || explanation.outputs) {
    formatter.showInfo(`\nWorkflow Configuration:\n`);
    
    // Show inputs
    if (explanation.inputs && Object.keys(explanation.inputs).length > 0) {
      formatter.showInfo(`Inputs:`);
      Object.entries(explanation.inputs).forEach(([key, value]) => {
        const typeOrDefault = typeof value === 'object' && value !== null 
          ? `${value.type || 'any'}${value.required ? ' (required)' : ''}${value.default !== undefined ? ` = ${JSON.stringify(value.default)}` : ''}`
          : JSON.stringify(value);
        formatter.showInfo(`  ${key}: ${typeOrDefault}`);
        if (verbose && typeof value === 'object' && value.description) {
          formatter.showInfo(`    → ${value.description}`);
        }
      });
      formatter.showInfo('');
    }
    
    // Show secrets (keys only, never values)
    if (explanation.secrets && explanation.secrets.keys && explanation.secrets.keys.length > 0) {
      formatter.showInfo(`Secrets (${explanation.secrets.vault || 'default vault'}):`);
      explanation.secrets.keys.forEach(key => {
        formatter.showInfo(`  🔒 ${key}`);
      });
      formatter.showInfo('');
    }
    
    // Show context variables
    if (explanation.context && Object.keys(explanation.context).length > 0) {
      formatter.showInfo(`Context:`);
      Object.entries(explanation.context).forEach(([key, value]) => {
        formatter.showInfo(`  ${key}: ${JSON.stringify(value)}`);
      });
      formatter.showInfo('');
    }
    
    // Show defaults
    if (explanation.defaults) {
      formatter.showInfo(`Defaults:`);
      if (explanation.defaults.timeout) {
        formatter.showInfo(`  timeout: ${explanation.defaults.timeout}`);
      }
      if (explanation.defaults.adapter) {
        formatter.showInfo(`  adapter: ${explanation.defaults.adapter}`);
      }
      formatter.showInfo('');
    }
    
    // Show policies
    if (explanation.policies) {
      formatter.showInfo(`Policies:`);
      if (explanation.policies.failure) {
        formatter.showInfo(`  failure: ${explanation.policies.failure}`);
      }
      if (explanation.policies.concurrency) {
        formatter.showInfo(`  concurrency: ${explanation.policies.concurrency}`);
      }
      if (explanation.policies.sandbox) {
        formatter.showInfo(`  sandbox: ${explanation.policies.sandbox}`);
      }
      formatter.showInfo('');
    }
  }
  
  formatter.showInfo(`\nExecution Plan:\n`);

  // Show each step
  for (let i = 0; i < explanation.steps.length; i++) {
    const step = explanation.steps[i];
    
    formatter.showInfo(`${i + 1}. ${step.name || step.id}`);
    formatter.showInfo(`   uses: ${step.uses}`);
    
    if (step.needs && step.needs.length > 0) {
      formatter.showInfo(`   needs: [${step.needs.join(', ')}]`);
    }
    
    if (step.when) {
      formatter.showInfo(`   when: ${step.when}`);
    }
    
    if (verbose) {
      // Show detailed configuration in verbose mode
      if (step.timeout) {
        formatter.showInfo(`   timeout: ${step.timeout}`);
      }
      
      if (step.retry) {
        let retryStr = `max: ${step.retry.max || 1}`;
        if (step.retry.backoff) {
          retryStr += `, backoff: ${step.retry.backoff}`;
        }
        if (step.retry.delay) {
          retryStr += `, delay: ${step.retry.delay}ms`;
        }
        formatter.showInfo(`   retry: ${retryStr}`);
      }
      
      if (step.continueOnError) {
        formatter.showInfo(`   continueOnError: true`);
      }
      
      if (step.with && Object.keys(step.with).length > 0) {
        formatter.showInfo(`   with:`);
        Object.entries(step.with).forEach(([key, value]) => {
          formatter.showInfo(`     ${key}: ${JSON.stringify(value)}`);
        });
      }
    } else {
      // In non-verbose mode, just show timeout/retry if present
      if (step.retry) {
        formatter.showInfo(`   retry: ${step.retry.max || 1}`);
      }
      if (step.timeout) {
        formatter.showInfo(`   timeout: ${step.timeout}`);
      }
    }
    
    formatter.showInfo(''); // Blank line between steps
  }

  // Footer
  formatter.showInfo(`✔ Plan valid. No cycles detected.`);
}

/**
 * Show ASCII dependency graph
 */
function showGraph(
  explanation: ExecutionExplanation,
  formatter: ReturnType<typeof createFormatter>
): void {
  formatter.showInfo(`\n▶ Workflow: ${explanation.workflowName || 'unnamed'}\n`);
  formatter.showInfo(`Dependency Graph:\n`);

  // Build a simple ASCII graph
  const stepMap = new Map(explanation.steps.map(s => [s.id, s]));
  const visited = new Set<string>();
  
  // Find root nodes (steps with no dependencies)
  const roots = explanation.steps.filter(s => !s.needs || s.needs.length === 0);
  
  function printNode(stepId: string, indent: string = '', isLast: boolean = true): void {
    if (visited.has(stepId)) return;
    visited.add(stepId);
    
    const step = stepMap.get(stepId);
    if (!step) return;
    
    const connector = isLast ? '└─' : '├─';
    const name = step.name || step.id;
    formatter.showInfo(`${indent}${connector} ${name}`);
    
    // Find children (steps that depend on this step)
    const children = explanation.steps.filter(s => 
      s.needs && s.needs.includes(stepId)
    );
    
    const childIndent = indent + (isLast ? '   ' : '│  ');
    
    if (children.length > 0) {
      children.forEach((child, idx) => {
        const isLastChild = idx === children.length - 1;
        formatter.showInfo(`${childIndent}${isLastChild ? '' : '│'}`);
        printNode(child.id, childIndent, isLastChild);
      });
    }
  }
  
  // Print from each root
  roots.forEach((root, idx) => {
    printNode(root.id, '', idx === roots.length - 1);
  });
  
  formatter.showInfo(`\n✔ Plan valid. No cycles detected.`);
}
