import chalk from 'chalk';
import { LogLevel } from '@dev-ecosystem/core';
import type { ExecutionExplanation, WorkflowResult } from '@orbytautomation/engine';
import type { ExplainFormatter, FormatterOptions } from '../Formatter.js';
import type { CliEvent } from '../../types/CliEvent.js';
import { createCliLogger, type CliLogger } from '../../utils/logger.js';

export type ExplainFormatterOptions = FormatterOptions;

const LINE = '━'.repeat(60);

// Output directly to stdout — no logger metadata, no timestamps
function print(line = ''): void {
  process.stdout.write(line + '\n');
}

export class ExplainHumanFormatter implements ExplainFormatter {
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
    const { complexity } = explanation;

    print(chalk.cyan(LINE));
    print(chalk.bold.white('WORKFLOW PLAN'));
    print(chalk.cyan(LINE));
    print();

    // Identity
    if (explanation.workflowName) print(`Name:        ${chalk.bold(explanation.workflowName)}`);
    if (explanation.description)  print(`Description: ${explanation.description}`);
    print(`Version:     ${explanation.version}`);
    print(`Kind:        ${explanation.kind}`);
    print();

    // Strategy
    const strategy = explanation.executionStrategy.toUpperCase();
    print(`Execution Strategy: ${chalk.cyan(strategy)}`);
    print(`Total Steps:        ${explanation.stepCount}`);
    if (complexity) {
      print(`Max Depth:          ${complexity.maxDepth}`);
      print(`Parallelizable:     ${complexity.parallelizableSteps}`);
    }
    print();

    // Adapters
    if (explanation.adaptersUsed && explanation.adaptersUsed.length > 0) {
      print('Adapters Used:');
      explanation.adaptersUsed.forEach(a => print(`  - ${a}`));
      print();
    }

    // Inputs
    if (explanation.inputs && Object.keys(explanation.inputs).length > 0) {
      print('Inputs:');
      for (const [key, val] of Object.entries(explanation.inputs)) {
        if (typeof val === 'object' && val !== null) {
          const type = val.type || 'any';
          const req  = val.required ? ' (required)' : '';
          const def  = val.default !== undefined ? ` = ${JSON.stringify(val.default)}` : '';
          print(`  ${chalk.yellow(key)}: ${type}${req}${def}`);
        } else {
          print(`  ${chalk.yellow(key)}: ${JSON.stringify(val)}`);
        }
      }
      print();
    }

    // Steps
    print('Execution Steps:');
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
      print();
    });

    // Outputs
    if (explanation.outputs && Object.keys(explanation.outputs).length > 0) {
      print('Expected Outputs:');
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
