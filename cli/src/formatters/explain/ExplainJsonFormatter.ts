import type { ExecutionExplanation, WorkflowResult } from '@orbytautomation/engine';
import { LogLevel } from '@dev-ecosystem/core';
import type { ExplainFormatter, FormatterOptions } from '../Formatter.js';
import type { CliEvent } from '../../types/CliEvent.js';
import { createCliLogger, type CliLogger } from '../../utils/logger.js';

/**
 * ExplainJsonFormatter outputs the workflow explanation as JSON using the provided logger.
 */
export class ExplainJsonFormatter implements ExplainFormatter {
  public logger: CliLogger;

  constructor(options: FormatterOptions = {}) {
    this.logger = options.logger ?? createCliLogger({
      level: LogLevel.INFO,
      colors: false,
      timestamp: false,
    });
  }

  onEvent(_event: CliEvent): void {
    // Not supported for explain formatters
  }

  showResult(_result: WorkflowResult): void {
    // Not supported for explain formatters
  }

  showExplanation(explanation: ExecutionExplanation): void {
    this.logger.info(JSON.stringify(explanation, null, 2));
  }

  showError(error: Error): void {
    this.logger.error(JSON.stringify({ error: error.message }));
  }

  showWarning(message: string): void {
    this.logger.warn(JSON.stringify({ warning: message }));
  }

  showInfo(message: string): void {
    this.logger.info(JSON.stringify({ info: message }));
  }
}
