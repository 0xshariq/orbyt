/**
 * Engine Logger
 * 
 * Provides structured logging for the Orbyt Engine using ecosystem-core utilities.
 * Supports multiple output formats and log levels with proper filtering.
 * 
 * @module core
 */

import {
  LogLevel,
  LogLevelSeverity,
  formatLog,
  createLogEntry,
  shouldLog,
  type LogEntry,
  type LogFormatOptions,
} from '@dev-ecosystem/core';

/**
 * Engine-specific log format type
 */
export type EngineLogFormat = 'pretty' | 'text' | 'json' | 'structured';

/**
 * Engine logger configuration
 */
export interface EngineLoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Output format */
  format?: EngineLogFormat;
  /** Enable colors in output */
  colors?: boolean;
  /** Include timestamps */
  timestamp?: boolean;
  /** Source identifier */
  source?: string;
}

/**
 * Engine Logger
 * 
 * Wraps ecosystem-core logging utilities with engine-specific configuration.
 */
export class EngineLogger {
  private config: Required<EngineLoggerConfig>;
  private formatOptions: LogFormatOptions;

  constructor(config: EngineLoggerConfig) {
    this.config = {
      level: config.level,
      format: config.format || 'text',
      colors: config.colors ?? true,
      timestamp: config.timestamp ?? true,
      source: config.source || 'Orbyt',
    };

    this.formatOptions = {
      format: this.config.format,
      colors: this.config.colors,
      timestamp: this.config.timestamp,
      includeSource: true,
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log a fatal error message
   */
  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check if this level should be logged
    if (!shouldLog(level, this.config.level)) {
      return;
    }

    // Create log entry
    const entry: LogEntry = createLogEntry(level, message, {
      source: this.config.source,
      context,
      error,
    });

    // Format and output
    const formatted = formatLog(entry, this.formatOptions);
    console.log(formatted);
  }

  /**
   * Update logger configuration
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Update colors setting
   */
  setColors(enabled: boolean): void {
    this.config.colors = enabled;
    this.formatOptions.colors = enabled;
  }

  /**
   * Update format
   */
  setFormat(format: EngineLogFormat): void {
    this.config.format = format;
    this.formatOptions.format = format;
  }

  /**
   * Check if a level will be logged
   */
  willLog(level: LogLevel): boolean {
    return shouldLog(level, this.config.level);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<EngineLoggerConfig> {
    return { ...this.config };
  }
}

/**
 * Create a logger instance from engine config
 */
export function createEngineLogger(
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent',
  verbose: boolean = false
): EngineLogger | null {
  // Silent mode - no logger
  if (logLevel === 'silent') {
    return null;
  }

  // Map engine log level to ecosystem LogLevel
  const levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  };

  const level = levelMap[logLevel] || LogLevel.INFO;

  return new EngineLogger({
    level,
    format: verbose ? 'pretty' : 'text',
    colors: true,
    timestamp: false, // Engine adds its own prefix
    source: 'Orbyt',
  });
}
