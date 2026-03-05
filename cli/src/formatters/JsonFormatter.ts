import type { CliEvent } from '../types/CliEvent.js';
import { CliLogger } from '../utils/logger.js';
import type { Formatter, FormatterOptions } from './Formatter.js';

/**
 * JsonFormatter outputs all events and messages as JSON using the provided logger.
 */
export class JsonFormatter implements Formatter {
  public logger: CliLogger;

  constructor(options: FormatterOptions) {
    this.logger = options.logger ?? new CliLogger({});
  }

  onEvent(event: CliEvent) {
    if (this.logger) {
      this.logger.info(JSON.stringify(event));
    }
  }

  showResult(result: any) {
    if (this.logger) {
      this.logger.info(JSON.stringify({ result }));
    }
  }

  showError(error: Error | string) {
    if (this.logger) {
      this.logger.error(JSON.stringify({ error: error instanceof Error ? error.message : error }));
    }
  }

  showWarning(warning: string) {
    if (this.logger) {
      this.logger.warn(JSON.stringify({ warning }));
    }
  }

  showInfo(info: string) {
    if (this.logger) {
      this.logger.info(JSON.stringify({ info }));
    }
  }
}
