/**
 * Null Formatter
 * 
 * Produces no output. Useful for:
 * - Testing
 * - Scripting (only care about exit code)
 * - Background jobs
 * - CI/CD pipelines where logs are captured elsewhere
 */

import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';

/**
 * Null formatter that produces no output
 */
export class NullFormatter implements Formatter {
  constructor(_options: FormatterOptions = {}) {
    // No-op constructor
  }

  /**
   * Handle CLI events (no-op)
   */
  onEvent(_event: CliEvent): void {
    // Intentionally empty - no output
  }

  /**
   * Show final result (no-op)
   */
  showResult(_result: WorkflowResult): void {
    // Intentionally empty - no output
  }

  /**
   * Display an error (no-op)
   */
  showError(_error: Error): void {
    // Intentionally empty - no output
  }

  /**
   * Display a warning (no-op)
   */
  showWarning(_message: string): void {
    // Intentionally empty - no output
  }

  /**
   * Display an info message (no-op)
   */
  showInfo(_message: string): void {
    // Intentionally empty - no output
  }
}
