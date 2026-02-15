/**
 * Validate Command
 * 
 * Validates one or more workflow files without executing them.
 * Checks YAML/JSON syntax, schema compliance, and security violations.
 * 
 * Features:
 * - Line number extraction from errors
 * - Field name typo detection and suggestions
 * - YAML syntax error highlighting
 * - Actionable fix suggestions
 * 
 * Usage:
 *   orbyt validate workflow.yaml
 *   orbyt validate workflow1.yaml,workflow2.yaml,workflow3.yaml (validate multiple)
 * 
 * Exit codes:
 *   0 - All workflows valid
 *   1 - One or more workflows invalid
 */

import { existsSync, readFileSync } from 'fs';
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
        // Validate using WorkflowLoader
        await WorkflowLoader.validate(workflowPath);

        // Validation successful
        results.push({
          workflowPath: displayPath,
          isValid: true,
        });

        if (!options.silent) {
          formatter.showInfo(`✔ Workflow is valid: ${displayPath}`);
        }

        // Show detailed info in verbose mode
        if (options.verbose) {
          try {
            // Read file content and parse YAML to extract metadata
            const fileContent = readFileSync(workflowPath, 'utf-8');
            const workflowData = JSON.parse(fileContent.includes('{') ? fileContent : `{${fileContent}}`);
            
            // Extract workflow info from parsed data
            const stepCount = workflowData?.workflow?.steps?.length || 0;
            const hasMetadata = workflowData?.metadata;
            
            if (stepCount > 0) {
              formatter.showInfo(`  Steps: ${stepCount}`);
            }
            if (hasMetadata?.name) {
              formatter.showInfo(`  Name: ${hasMetadata.name}`);
            }
            if (hasMetadata?.description) {
              formatter.showInfo(`  Description: ${hasMetadata.description}`);
            }
          } catch (err) {
            // If we can't parse details, that's okay - validation already passed
          }
        }

      } catch (error) {
        // Validation failed - parse error for detailed diagnostics
        const validationError = error instanceof Error ? error : new Error(String(error));
        
        results.push({
          workflowPath: displayPath,
          isValid: false,
          error: validationError,
        });

        formatter.showError(new Error(`✖ Workflow validation failed: ${displayPath}`));
        
        // Show detailed error with debugger
        displayDetailedError(validationError, workflowPath, formatter);
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
 * Display detailed error information with line numbers and code snippets
 * 
 * This is our error debugger that parses errors from WorkflowLoader.validate()
 * and displays them in a user-friendly format with context.
 */
function displayDetailedError(
  error: Error,
  workflowPath: string,
  formatter: ReturnType<typeof createFormatter>
): void {
  const errorMessage = error.message;
  
  // Try to read the workflow file for context
  let fileLines: string[] = [];
  try {
    const fileContent = readFileSync(workflowPath, 'utf-8');
    fileLines = fileContent.split('\n');
  } catch (err) {
    // If we can't read the file, just show the error message
    formatter.showError(error);
    return;
  }
  
  // Parse different types of errors
  const lineNumber = extractLineNumber(errorMessage);
  const columnNumber = extractColumnNumber(errorMessage);
  const errorType = determineErrorType(errorMessage);
  
  // Show error type header
  formatter.showError(new Error(`\n❌ ${errorType.toUpperCase()} ERROR`));
  formatter.showError(new Error('━'.repeat(60)));
  
  // Show error message
  formatter.showError(new Error(`\n${errorMessage}`));
  
  // If we have line/column info, show code snippet
  if (lineNumber !== null && lineNumber > 0 && lineNumber <= fileLines.length) {
    formatter.showError(new Error(`\n📍 Location: Line ${lineNumber}${columnNumber ? `, Column ${columnNumber}` : ''}`));
    formatter.showError(new Error('━'.repeat(60)));
    
    // Show code snippet with context (3 lines before and after)
    const startLine = Math.max(1, lineNumber - 3);
    const endLine = Math.min(fileLines.length, lineNumber + 3);
    
    formatter.showError(new Error('\nCode Context:'));
    for (let i = startLine; i <= endLine; i++) {
      const lineContent = fileLines[i - 1];
      const linePrefix = i === lineNumber ? '❯' : ' ';
      const lineMarker = i === lineNumber ? ' ← Error here' : '';
      formatter.showError(new Error(`${linePrefix} ${String(i).padStart(4)} │ ${lineContent}${lineMarker}`));
    }
  }
  
  // Extract and show fix suggestions from error message
  const suggestions = extractFixSuggestions(errorMessage);
  if (suggestions.length > 0) {
    formatter.showError(new Error('\n💡 Suggestions:'));
    formatter.showError(new Error('━'.repeat(60)));
    suggestions.forEach((suggestion, index) => {
      formatter.showError(new Error(`${index + 1}. ${suggestion}`));
    });
  }
  
  // Show common fixes based on error type
  const commonFixes = getCommonFixes(errorType, errorMessage);
  if (commonFixes.length > 0) {
    formatter.showError(new Error('\n🔧 Common Fixes:'));
    formatter.showError(new Error('━'.repeat(60)));
    commonFixes.forEach((fix, index) => {
      formatter.showError(new Error(`${index + 1}. ${fix}`));
    });
  }
  
  formatter.showError(new Error('━'.repeat(60) + '\n'));
}

/**
 * Extract line number from error message
 */
function extractLineNumber(errorMessage: string): number | null {
  // Try various patterns:
  // - "at line 5"
  // - "on line 5"
  // - "line 5:"
  // - "[5:10]" (line:column)
  
  const patterns = [
    /(?:at|on)\s+line\s+(\d+)/i,
    /line\s+(\d+):/i,
    /\[(\d+):\d+\]/,
    /line:\s*(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

/**
 * Extract column number from error message
 */
function extractColumnNumber(errorMessage: string): number | null {
  const patterns = [
    /column\s+(\d+)/i,
    /\[\d+:(\d+)\]/,
    /col:\s*(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

/**
 * Determine error type from message
 */
function determineErrorType(errorMessage: string): string {
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('yaml') || lowerMessage.includes('parse') || lowerMessage.includes('syntax')) {
    return 'YAML Syntax';
  }
  
  if (lowerMessage.includes('schema') || lowerMessage.includes('validation')) {
    return 'Schema Validation';
  }
  
  if (lowerMessage.includes('security') || lowerMessage.includes('reserved')) {
    return 'Security';
  }
  
  if (lowerMessage.includes('unknown field') || lowerMessage.includes('unrecognized')) {
    return 'Unknown Field';
  }
  
  if (lowerMessage.includes('required') || lowerMessage.includes('missing')) {
    return 'Missing Required Field';
  }
  
  if (lowerMessage.includes('duplicate') || lowerMessage.includes('conflict')) {
    return 'Duplicate';
  }
  
  if (lowerMessage.includes('dependency') || lowerMessage.includes('circular')) {
    return 'Dependency';
  }
  
  return 'Validation';
}

/**
 * Extract fix suggestions from error message
 * Looks for "Did you mean" or similar suggestions
 */
function extractFixSuggestions(errorMessage: string): string[] {
  const suggestions: string[] = [];
  
  // Pattern: "Did you mean 'xyz'?"
  const didYouMeanPattern = /Did you mean ['"]([^'"]+)['"]?/gi;
  let match;
  while ((match = didYouMeanPattern.exec(errorMessage)) !== null) {
    suggestions.push(`Try using "${match[1]}" instead`);
  }
  
  // Pattern: "Suggestion: xyz"
  const suggestionPattern = /Suggestion:\s*(.+?)(?:\.|$)/gi;
  while ((match = suggestionPattern.exec(errorMessage)) !== null) {
    suggestions.push(match[1].trim());
  }
  
  // Pattern: "Hint: xyz"
  const hintPattern = /Hint:\s*(.+?)(?:\.|$)/gi;
  while ((match = hintPattern.exec(errorMessage)) !== null) {
    suggestions.push(match[1].trim());
  }
  
  return suggestions;
}

/**
 * Get common fixes based on error type
 */
function getCommonFixes(errorType: string, errorMessage: string): string[] {
  const fixes: string[] = [];
  
  switch (errorType) {
    case 'YAML Syntax':
      fixes.push('Check for missing colons (:) after keys');
      fixes.push('Verify proper indentation (use spaces, not tabs)');
      fixes.push('Ensure strings with special characters are quoted');
      fixes.push('Check for unmatched brackets or quotes');
      break;
    
    case 'Schema Validation':
      fixes.push('Verify all required fields are present (version, kind, workflow)');
      fixes.push('Check field names for typos');
      fixes.push('Ensure field values match the expected types');
      fixes.push('Review the Orbyt workflow schema documentation');
      break;
    
    case 'Security':
      fixes.push('Remove fields starting with "_" (reserved for engine)');
      fixes.push('Do not set internal fields like _billing, _identity, _execution');
      fixes.push('Let the engine inject security and billing context');
      break;
    
    case 'Unknown Field':
      fixes.push('Check spelling of field names');
      fixes.push('Verify the field is supported in your workflow schema version');
      fixes.push('Remove fields that are not part of the schema');
      break;
    
    case 'Missing Required Field':
      fixes.push('Add the missing required field to your workflow');
      fixes.push('Check the schema for which fields are required');
      fixes.push('Ensure "version", "kind", and "workflow" are all present');
      break;
    
    case 'Duplicate':
      if (errorMessage.toLowerCase().includes('step')) {
        fixes.push('Ensure each step has a unique "id" field');
        fixes.push('Rename duplicate step IDs to make them unique');
      }
      break;
    
    case 'Dependency':
      if (errorMessage.toLowerCase().includes('circular')) {
        fixes.push('Check "needs" fields for circular dependencies');
        fixes.push('Draw a dependency graph to identify cycles');
      } else {
        fixes.push('Verify all step IDs referenced in "needs" exist');
        fixes.push('Check for typos in step dependency names');
      }
      break;
  }
  
  return fixes;
}
