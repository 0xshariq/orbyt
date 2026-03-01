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
import { createExplainFormatter, type ExplainFormatterType } from '../formatters/explain/createExplainFormatter.js';
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
  let format = (options.format || 'human') as ExplainFormatterType;
  if (options.verbose && format === 'human') {
    format = 'verbose';
  }
  const formatter = createExplainFormatter(format, options);

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
      formatter.showExplanation(explanation);
    } else if (options.graph) {
      // Graph output - ASCII DAG
      showGraph(explanation, formatter);
    } else {
      // Human/verbose output
      formatter.showExplanation(explanation);
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

  
  // Show tags and owner if present

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
