/**
 * Base Formatter Interface
 * 
 * All formatters must implement this interface.
 * Formatters are the ONLY place where console output is allowed in the CLI.
 * 
 * Separation of Concerns:
 * - Formatter: Decides WHAT to display and WHEN (observer pattern)
 * - Logger: Decides HOW to format (colors, alignment, structure)
 * - Console: Where output goes (stdout/stderr)
 * 
 * Flow:
 * 1. Engine emits events during workflow execution
 * 2. CLI receives events and passes to formatter.onEvent()
 * 3. Formatter uses logger functions to format the event
 * 4. Formatter outputs formatted text to console
 * 
 * This separation allows:
 * - Different output formats (human, json, verbose, null)
 * - Consistent formatting logic across formatters
 * - Easy testing (mock console output)
 * - Library usage (null formatter for programmatic use)
 */

import type { WorkflowResult } from '@orbytautomation/engine';
import type { CliEvent } from '../types/CliEvent.js';

/**
 * Formatter options
 * 
 * These options control formatter behavior and output style.
 */
export interface FormatterOptions {
  /** Enable verbose output (more details, context, timing) */
  verbose?: boolean;
  
  /** Disable colors (for CI/CD or terminals without color support) */
  noColor?: boolean;
  
  /** Silent mode (minimal output, only errors and final result) */
  silent?: boolean;
}

/**
 * Base formatter interface
 * 
 * Formatters receive events during workflow execution and format output.
 * This is the observer pattern - CLI observes engine events via formatters.
 * 
 * Implementation Guide:
 * - Use logger functions for formatting (formatWorkflowStart, formatStepComplete, etc.)
 * - Call console.log/console.error for output (formatters are the only place with console access)
 * - Check options.silent before outputting non-critical information
 * - Respect options.noColor when using logger functions
 * - Use options.verbose to include additional context/timing information
 */
export interface Formatter {
  /**
   * Handle a CLI event (workflow/step started/completed/failed)
   * 
   * This is called for every workflow and step lifecycle event.
   * Formatters should handle all event types defined in CliEvent.
   * 
   * @param event - The event to handle
   */
  onEvent(event: CliEvent): void;
  
  /**
   * Display final workflow result
   * 
   * Called once after workflow execution completes (success or failure).
   * Should display summary information and final status.
   * 
   * @param result - The workflow execution result
   */
  showResult(result: WorkflowResult): void;
  
  /**
   * Display an error
   * 
   * Called for CLI-level errors (not workflow errors).
   * Examples: file not found, invalid config, adapter loading failure.
   * 
   * @param error - The error to display
   */
  showError(error: Error): void;
  
  /**
   * Display a warning
   * 
   * Called for non-critical issues that don't stop execution.
   * Examples: deprecated features, missing optional config.
   * 
   * @param message - Warning message
   */
  showWarning(message: string): void;
  
  /**
   * Display an info message
   * 
   * Called for general information messages.
   * Examples: loading workflow, initializing engine.
   * 
   * @param message - Info message
   */
  showInfo(message: string): void;
}
