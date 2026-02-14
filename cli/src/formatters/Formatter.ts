/**
 * Base Formatter Interface
 * 
 * All formatters must implement this interface.
 * Formatters are the ONLY place where console output is allowed in the CLI.
 */

import type { WorkflowResult } from '@orbytautomation/engine';
import type { CliEvent } from '../types/CliEvent.js';

/**
 * Formatter options
 */
export interface FormatterOptions {
  /** Enable verbose output */
  verbose?: boolean;
  
  /** Disable colors */
  noColor?: boolean;
  
  /** Silent mode (minimal output) */
  silent?: boolean;
}

/**
 * Base formatter interface
 * 
 * Formatters receive events during workflow execution and format output.
 * This is the observer pattern - CLI observes engine events via formatters.
 */
export interface Formatter {
  /**
   * Handle a CLI event (workflow/step started/completed/failed)
   * 
   * @param event - The event to handle
   */
  onEvent(event: CliEvent): void;
  
  /**
   * Display final workflow result
   * 
   * @param result - The workflow execution result
   */
  showResult(result: WorkflowResult): void;
  
  /**
   * Display an error
   * 
   * @param error - The error to display
   */
  showError(error: Error): void;
  
  /**
   * Display a warning
   * 
   * @param message - Warning message
   */
  showWarning(message: string): void;
  
  /**
   * Display an info message
   * 
   * @param message - Info message
   */
  showInfo(message: string): void;
}
