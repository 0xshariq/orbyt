/**
 * Validate Command
 * 
 * Validates one or more workflow files without executing them.
 * Checks YAML/JSON syntax, schema compliance, and security violations.
 * 
 * Features:
 * - Automatic error detection via ErrorDetector
 * - Rich debug output via ErrorDebugger (with error codes, fix steps, examples)
 * - Multi-workflow validation support (comma-separated)
 * - Verbose mode with workflow metadata display
 * - Exit codes for CI/CD integration
 * 
 * Usage:
 *   orbyt validate workflow.yaml
 *   orbyt validate workflow1.yaml,workflow2.yaml,workflow3.yaml (validate multiple)
 *   orbyt validate workflow.yaml --verbose (show detailed workflow info)
 * 
 * Exit codes:
 *   0 - All workflows valid
 *   1 - One or more workflows invalid
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import type { Command } from 'commander';
import { WorkflowLoader } from '@orbytautomation/engine';
import { createFormatter, type FormatterType } from '../formatters/createFormatter.js';
import type { CliValidateOptions } from '../types/CliValidateOptions.js';

/**
 * Validation result for a single workflow
 */
interface ValidationResult {
  workflowPath: string;
  isValid: boolean;
  error?: Error;
  detailedErrors?: DetailedValidationError[];
}

/**
 * Detailed validation error with line numbers and suggestions
 */
interface DetailedValidationError {
  message: string;
  line?: number;
  column?: number;
  path?: string;
  hint?: string;
  snippet?: string;
  type: 'yaml' | 'schema' | 'security' | 'unknown';
}

/**
 * Register the validate command
 */
export function registerValidateCommand(program: Command): void {
  program
    .command('validate <workflow>')
    .description('Validate one or more workflows without executing (comma-separated for multiple)')
    .option('-f, --format <format>', 'Output format (human|json|verbose|null)', 'human')
    .option('--verbose', 'Show detailed validation info')
    .option('--silent', 'Minimal output')
    .option('--no-color', 'Disable colored output')
    .action(validateWorkflow);
}

/**
 * Validate workflow command handler
 * 
 * Supports both single and multiple validations:
 * - Single: orbyt validate workflow.yaml
 * - Multiple: orbyt validate a.yaml,b.yaml,c.yaml
 */
async function validateWorkflow(workflowPath: string, options: CliValidateOptions): Promise<void> {
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
    // Parse workflow paths (comma-separated)
    const workflowPaths = workflowPath.split(',').map(p => p.trim()).filter(p => p.length > 0);

    if (workflowPaths.length === 0) {
      formatter.showError(new Error('No workflow paths provided'));
      process.exit(1);
    }

    // Resolve and check all paths exist
    const resolvedPaths: string[] = [];
    for (const path of workflowPaths) {
      const resolvedPath = resolve(path);

      if (!existsSync(resolvedPath)) {
        formatter.showError(new Error(`Workflow file not found: ${path}`));
        process.exit(1);
      }

      resolvedPaths.push(resolvedPath);
    }

    // Track validation results
    const results: ValidationResult[] = [];
    const isMultiWorkflow = resolvedPaths.length > 1;

    // Validate each workflow
    for (let i = 0; i < resolvedPaths.length; i++) {
      const workflowPath = resolvedPaths[i];
      const displayPath = workflowPaths[i];

      // Show workflow header for multi-workflow validation
      if (isMultiWorkflow) {
        formatter.showInfo(`\n${'='.repeat(60)}`);
        formatter.showInfo(`Workflow ${i + 1}/${resolvedPaths.length}: ${displayPath}`);
        formatter.showInfo('='.repeat(60));
      }

      try {
        // Validate using WorkflowLoader.validate()
        // Now validate() returns ParsedWorkflow with metadata, so we can use it in both modes
        const parsedWorkflow = await WorkflowLoader.validate(workflowPath);
        
        // Validation successful
        results.push({
          workflowPath: displayPath,
          isValid: true,
        });

        if (!options.silent) {
          formatter.showInfo(`✔ Workflow is valid: ${displayPath}`);
        }

        // In verbose mode, show detailed workflow metadata
        if (options.verbose) {
          if (parsedWorkflow.metadata?.name || parsedWorkflow.name) {
            formatter.showInfo(`  Name: ${parsedWorkflow.metadata?.name || parsedWorkflow.name}`);
          }
          if (parsedWorkflow.metadata?.description || parsedWorkflow.description) {
            formatter.showInfo(`  Description: ${parsedWorkflow.metadata?.description || parsedWorkflow.description}`);
          }
          if (parsedWorkflow.version) {
            formatter.showInfo(`  Version: ${parsedWorkflow.version}`);
          }
          if (parsedWorkflow.kind) {
            formatter.showInfo(`  Kind: ${parsedWorkflow.kind}`);
          }
          if (parsedWorkflow.steps?.length) {
            formatter.showInfo(`  Steps: ${parsedWorkflow.steps.length}`);
            
            // Show step names
            parsedWorkflow.steps.forEach((step, idx) => {
              formatter.showInfo(`    ${idx + 1}. ${step.name || `Step ${idx + 1}`} (${step.action})`);
            });
          }
          if (parsedWorkflow.metadata?.tags?.length) {
            formatter.showInfo(`  Tags: ${parsedWorkflow.metadata.tags.join(', ')}`);
          }
          if (parsedWorkflow.metadata?.owner || parsedWorkflow.owner) {
            formatter.showInfo(`  Owner: ${parsedWorkflow.metadata?.owner || parsedWorkflow.owner}`);
          }
        }

      } catch (error) {
        // Validation failed - use ErrorDebugger output if available
        const validationError = error instanceof Error ? error : new Error(String(error));
        
        results.push({
          workflowPath: displayPath,
          isValid: false,
          error: validationError,
        });

        formatter.showError(new Error(`✖ Workflow validation failed: ${displayPath}\n`));
        
        // Check if ErrorDetector enriched this error with debug output
        const errorWithDebug = validationError as Error & { __debugOutput?: string };
        
        if (errorWithDebug.__debugOutput) {
          // Display the formatted error from ErrorDebugger
          console.log(errorWithDebug.__debugOutput);
        } else {
          // Fallback to basic error display
          formatter.showError(validationError);
        }
      }
    }

    // Show overall summary for multi-workflow validation
    if (isMultiWorkflow) {
      showValidationSummary(results, formatter);
    }

    // Exit with appropriate code
    const exitCode = determineExitCode(results);
    process.exit(exitCode);

  } catch (error) {
    // Unexpected error
    const err = error instanceof Error ? error : new Error(String(error));
    formatter.showError(err);
    process.exit(1);
  }
}

/**
 * Show overall validation summary for multiple workflows
 */
function showValidationSummary(results: ValidationResult[], formatter: ReturnType<typeof createFormatter>): void {
  const totalCount = results.length;
  const validCount = results.filter(r => r.isValid).length;
  const invalidCount = totalCount - validCount;

  formatter.showInfo(`\n${'='.repeat(60)}`);
  formatter.showInfo('VALIDATION SUMMARY');
  formatter.showInfo('='.repeat(60));
  formatter.showInfo(`Total workflows: ${totalCount}`);
  
  if (validCount > 0) {
    formatter.showInfo(`  ✔ Valid: ${validCount}`);
  }
  
  if (invalidCount > 0) {
    formatter.showInfo(`  ✖ Invalid: ${invalidCount}`);
  }

  // List invalid workflows
  if (invalidCount > 0) {
    formatter.showInfo('\nInvalid workflows:');
    results
      .filter(r => !r.isValid)
      .forEach(r => {
        formatter.showInfo(`  - ${r.workflowPath}: ${r.error?.message || 'Unknown error'}`);
      });
  }
}

/**
 * Determine exit code based on validation results
 * 
 * Exit codes:
 *   0 - All workflows valid
 *   1 - One or more workflows invalid
 */
function determineExitCode(results: ValidationResult[]): number {
  const hasInvalid = results.some(r => !r.isValid);
  return hasInvalid ? 1 : 0;
}

/**
 * Old detailed error display function - REPLACED BY ErrorDebugger
 * 
 * The error detection system now automatically enriches errors with debug output
 * via ErrorDetector.enrichWithDebugInfo(), which uses ErrorDebugger.format().
 * This provides:
 * - Error codes with proper categorization
 * - Severity levels and execution control
 * - Typo detection with field suggestions
 * - Fix steps with examples
 * - Estimated fix time
 * - Common mistakes to avoid
 * 
 * The enriched error is stored in error.__debugOutput and displayed by the
 * validate command handler above.
 */
