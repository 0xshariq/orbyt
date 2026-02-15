/**
 * JSON Formatter
 * 
 * Outputs structured JSON for:
 * - Machine parsing
 * - Log aggregation
 * - CI/CD integration
 * - Monitoring systems
 * 
 * Each event is a separate JSON line (JSONL/NDJSON format)
 * Final result is also JSON.
 * 
 * Uses logger for consistent output formatting.
 */

import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';
import { formatJsonEvent, formatJsonResult, formatJsonError } from '../utils/logger.js';

/**
 * JSON output formatter
 * 
 * Outputs machine-readable JSON for CI/CD and log aggregation systems.
 */
export class JsonFormatter implements Formatter {
  private options: FormatterOptions;

  constructor(options: FormatterOptions = {}) {
    this.options = options;
  }

  /**
   * Handle CLI events - output as JSON line
   */
  onEvent(event: CliEvent): void {
    if (this.options.silent) {
      return;
    }

    // Use logger to format and output event as JSON line (NDJSON format)
    const output = formatJsonEvent(event, this.options.verbose);
    console.log(output);
  }

  /**
   * Show final result as JSON
   */
  showResult(result: WorkflowResult): void {
    if (this.options.silent) {
      return;
    }

    // Use logger to format and output result as JSON
    const output = formatJsonResult(result, this.options.verbose);
    console.log(output);
  }

  /**
   * Display an error as JSON
   */
  showError(error: Error): void {
    // Use logger to format and output error as JSON
    const output = formatJsonError(error);
    console.error(output);
  }

  /**
   * Display a warning as JSON
   */
  showWarning(message: string): void {
    const jsonWarning = {
      type: 'warning',
      timestamp: new Date().toISOString(),
      message,
    };

    console.log(JSON.stringify(jsonWarning));
  }

  /**
   * Display an info message as JSON
   */
  showInfo(message: string): void {
    const jsonInfo = {
      type: 'info',
      timestamp: new Date().toISOString(),
      message,
    };

    console.log(JSON.stringify(jsonInfo));
  }
}
