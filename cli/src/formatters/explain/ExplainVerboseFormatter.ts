import chalk from 'chalk';
import { LogLevel } from '@dev-ecosystem/core';
import type { ExecutionExplanation, WorkflowResult } from '@orbytautomation/engine';
import type { ExplainFormatter, FormatterOptions } from '../Formatter.js';
import type { CliEvent } from '../../types/CliEvent.js';
import { createCliLogger, type CliLogger } from '../../utils/logger.js';

const LINE = '═'.repeat(60);
const SUBLINE = '─'.repeat(60);

// Output directly to stdout — no logger metadata, no timestamps
function print(line = ''): void {
  process.stdout.write(line + '\n');
}

export class ExplainVerboseFormatter implements ExplainFormatter {
  public logger: CliLogger;
  private options: FormatterOptions;

  constructor(options: FormatterOptions = {}) {
    this.options = options;
    if (options.noColor) chalk.level = 0;
    // Logger level is set to FATAL so engine-internal INFO/DEBUG messages from
    // WorkflowLoader and OrbytEngine don't leak to the terminal during explain.
    // All formatter output (showExplanation, showError, showWarning, showInfo)
    // writes directly to process.stdout/stderr and is unaffected by this level.
    this.logger = options.logger ?? createCliLogger({
      level: LogLevel.FATAL,
      colors: !options.noColor,
      timestamp: false,
    });
  }

  onEvent(_event: CliEvent): void {}
  showResult(_result: WorkflowResult): void {}

  showExplanation(explanation: ExecutionExplanation): void {
    const { complexity, timeEstimation, dataFlow, conditionalPaths } = explanation;

    print(chalk.cyan(LINE));
    print(chalk.bold.white('WORKFLOW PLAN  (verbose)'));
    print(chalk.cyan(LINE));
    print();

    // Identity
    if (explanation.workflowName) print(`Name:        ${chalk.bold(explanation.workflowName)}`);
    if (explanation.description)  print(`Description: ${explanation.description}`);
    print(`Version:     ${explanation.version}`);
    print(`Kind:        ${explanation.kind}`);
    if (explanation.owner)  print(`Owner:       ${explanation.owner}`);
    if (explanation.tags && explanation.tags.length > 0) print(`Tags:        ${explanation.tags.join(', ')}`);
    print();

    // Strategy + Complexity
    print(chalk.bold('Execution Strategy:'));
    print(`  Mode:           ${chalk.cyan(explanation.executionStrategy.toUpperCase())}`);
    print(`  Total Steps:    ${explanation.stepCount}`);
    if (complexity) {
      print(`  Max Depth:      ${complexity.maxDepth}`);
      print(`  Parallelizable: ${complexity.parallelizableSteps} steps`);
      print(`  Sequential:     ${complexity.sequentialSteps} steps`);
    }
    print();

    // Adapters breakdown
    if (explanation.adapterActions && Object.keys(explanation.adapterActions).length > 0) {
      print(chalk.bold('Adapters:'));
      for (const [adapter, actions] of Object.entries(explanation.adapterActions)) {
        print(`  ${adapter}: ${actions.join(', ')}`);
      }
      print();
    } else if (explanation.adaptersUsed && explanation.adaptersUsed.length > 0) {
      print(chalk.bold('Adapters Used:'));
      explanation.adaptersUsed.forEach(a => print(`  - ${a}`));
      print();
    }

    // Inputs
    print(chalk.bold('Inputs:'));
    if (explanation.inputs && Object.keys(explanation.inputs).length > 0) {
      for (const [key, val] of Object.entries(explanation.inputs)) {
        if (typeof val === 'object' && val !== null) {
          const type = val.type || 'any';
          const req  = val.required ? chalk.red(' (required)') : '';
          const def  = val.default !== undefined ? chalk.dim(` = ${JSON.stringify(val.default)}`) : '';
          print(`  ${chalk.yellow(key)}: ${type}${req}${def}`);
          if (val.description) print(chalk.gray(`    → ${val.description}`));
        } else {
          print(`  ${chalk.yellow(key)}: ${JSON.stringify(val)}`);
        }
      }
    } else {
      print(chalk.dim('  No inputs defined.'));
    }
    print();

    // Steps — full detail
    print(chalk.bold('Execution Steps:'));
    print();
    explanation.steps.forEach((step, i) => {
      print(`${i + 1}. ${chalk.bold(step.name || step.id)}`);
      print(`   id:             ${chalk.dim(step.id)}`);
      print(`   uses:           ${chalk.cyan(step.uses)}`);
      print(`   continueOnError: ${step.continueOnError ?? false}`);
      if (step.needs && step.needs.length > 0) {
        print(`   needs:          [${step.needs.join(', ')}]`);
      }
      if (step.when) {
        print(`   when:           ${chalk.yellow(step.when)}`);
      }
      if (step.timeout) {
        print(`   timeout:        ${chalk.yellow(step.timeout)}`);
      }
      if (step.retry) {
        let retryStr = `max: ${step.retry.max || 1}`;
        if (step.retry.backoff) retryStr += `, backoff: ${step.retry.backoff}`;
        if (step.retry.delay)   retryStr += `, delay: ${step.retry.delay}ms`;
        print(`   retry:          ${chalk.yellow(retryStr)}`);
      }
      if (step.with && Object.keys(step.with).length > 0) {
        print('   with:');
        Object.entries(step.with).forEach(([k, v]) => print(`     ${chalk.yellow(k)}: ${JSON.stringify(v)}`));
      }
      if (step.env && Object.keys(step.env).length > 0) {
        print('   env:');
        Object.entries(step.env).forEach(([k, v]) => print(`     ${chalk.yellow(k)}: ${JSON.stringify(v)}`));
      }
      if (step.outputs && Object.keys(step.outputs).length > 0) {
        print('   outputs:');
        Object.entries(step.outputs).forEach(([k, v]) => print(`     ${chalk.green(k)}: ${JSON.stringify(v)}`));
      }
      print(chalk.dim(SUBLINE));
    });
    print();

    // Time Estimation
    if (timeEstimation) {
      print(chalk.bold('Time Estimation:'));
      print(`  Total: ${timeEstimation.total.min}–${timeEstimation.total.max}ms (avg: ${timeEstimation.total.avg}ms)`);
      if (timeEstimation.criticalPath && timeEstimation.criticalPath.steps.length > 0) {
        print(`  Critical Path: ${timeEstimation.criticalPath.steps.join(' → ')} (${timeEstimation.criticalPath.duration}ms)`);
      }
      if (timeEstimation.bottlenecks && timeEstimation.bottlenecks.length > 0) {
        print('  Bottlenecks:');
        timeEstimation.bottlenecks.forEach(b => {
          print(`    • ${b.step}: ${b.reason} (impact: ${b.impact}ms)`);
        });
      }
      print();
    }

    // Data Flow
    if (dataFlow && dataFlow.length > 0) {
      const inputSteps  = dataFlow.filter(d => d.inputs.length > 0).length;
      const outputSteps = dataFlow.filter(d => d.outputs.length > 0).length;
      print(chalk.bold('Data Flow:'));
      print(`  ${inputSteps} steps use workflow inputs`);
      print(`  ${outputSteps} steps produce outputs`);
      print();
    }

    // Conditional Paths
    if (conditionalPaths) {
      print(chalk.bold('Conditional Paths:'));
      print(`  Total Possible Paths: ${conditionalPaths.totalPaths}`);
      const condSteps = conditionalPaths.conditionalSteps?.length ?? 0;
      const alwaysRun = conditionalPaths.alwaysExecutes?.length ?? (explanation.stepCount - condSteps);
      print(`  Conditional Steps: ${condSteps}`);
      print(`  Always Execute: ${alwaysRun} steps`);
      if (conditionalPaths.unreachableSteps?.length > 0) {
        print(`  Unreachable Steps: ${conditionalPaths.unreachableSteps.join(', ')}`);
      }
      print();
    }

    // Dependency Graph
    if (explanation.dependencyGraph && Object.keys(explanation.dependencyGraph).length > 0) {
      print(chalk.bold('Dependency Graph:'));
      for (const [step, deps] of Object.entries(explanation.dependencyGraph)) {
        if (deps.length > 0) {
          print(`  ${step} → [${deps.join(', ')}]`);
        }
      }
      print();
    }

    // Outputs
    if (explanation.outputs && Object.keys(explanation.outputs).length > 0) {
      print(chalk.bold('Expected Outputs:'));
      for (const [key, val] of Object.entries(explanation.outputs)) {
        print(`  ${chalk.green(key)}: ${val}`);
      }
      print();
    }

    // Validation
    if (explanation.hasCycles) {
      print(chalk.red('Validation: ✖ Circular dependencies detected'));
    } else {
      print(chalk.green('Validation: ✔ No cycles detected'));
    }
    print(chalk.cyan(LINE));
  }

  showError(error: Error): void {
    if (!this.options.silent) {
      process.stderr.write(chalk.red(`Error: ${error.message}`) + '\n');
    }
  }

  showWarning(message: string): void {
    if (!this.options.silent) {
      process.stdout.write(chalk.yellow(`Warning: ${message}`) + '\n');
    }
  }

  showInfo(message: string): void {
    if (!this.options.silent) {
      process.stdout.write(chalk.dim(message) + '\n');
    }
  }
}
