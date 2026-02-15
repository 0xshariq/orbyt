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
 */

import type { WorkflowResult } from '@orbytautomation/engine';
import type { Formatter, FormatterOptions } from './Formatter.js';
import type { CliEvent } from '../types/CliEvent.js';

/**
 * JSON output formatter
 */
export class JsonFormatter implements Formatter {
  private events: CliEvent[] = [];
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

    // Store event for final output
    this.events.push(event);

    // Output event as JSON line (NDJSON format)
    const jsonEvent = {
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      ...this.extractEventData(event),
    };

    console.log(JSON.stringify(jsonEvent));
  }

  /**
   * Show final result as JSON
   */
  showResult(result: WorkflowResult): void {
    if (this.options.silent) {
      return;
    }

    // Convert step results map to array
    const stepResults = Array.from(result.stepResults.entries()).map(([id, stepResult]) => ({
      id,
      status: stepResult.status,
      duration: stepResult.duration,
      error: stepResult.error ? {
        message: stepResult.error.message,
        name: stepResult.error.name,
        stack: stepResult.error.stack,
      } : undefined,
      output: stepResult.output,
    }));

    const jsonResult = {
      type: 'workflow.result',
      timestamp: new Date().toISOString(),
      status: result.status,
      duration: result.duration,
      metadata: result.metadata,
      stepResults,
      error: result.error ? {
        message: result.error.message,
        name: result.error.name,
        stack: result.error.stack,
      } : undefined,
    };

    console.log(JSON.stringify(jsonResult, null, this.options.verbose ? 2 : undefined));
  }

  /**
   * Display an error as JSON
   */
  showError(error: Error): void {
    const jsonError = {
      type: 'error',
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
    };

    console.error(JSON.stringify(jsonError));
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

  /**
   * Extract relevant data from event based on type
   */
  private extractEventData(event: CliEvent): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Extract common fields
    if ('workflowName' in event) {
      data.workflowName = event.workflowName;
    }
    if ('stepId' in event) {
      data.stepId = event.stepId;
    }
    if ('stepName' in event) {
      data.stepName = event.stepName;
    }
    if ('duration' in event) {
      data.duration = event.duration;
    }
    if ('status' in event) {
      data.status = event.status;
    }
    if ('error' in event && event.error) {
      data.error = {
        message: event.error.message,
        name: event.error.name,
      };
    }
    if ('totalSteps' in event) {
      data.totalSteps = event.totalSteps;
    }
    if ('successfulSteps' in event) {
      data.successfulSteps = event.successfulSteps;
    }
    if ('failedSteps' in event) {
      data.failedSteps = event.failedSteps;
    }
    if ('skippedSteps' in event) {
      data.skippedSteps = event.skippedSteps;
    }
    if ('adapter' in event) {
      data.adapter = event.adapter;
    }
    if ('action' in event) {
      data.action = event.action;
    }
    if ('output' in event) {
      data.output = event.output;
    }

    return data;
  }
}
