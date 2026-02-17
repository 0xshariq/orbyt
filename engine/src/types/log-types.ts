import { LogLevel } from "@dev-ecosystem/core";


/**
 * Engine-specific log format type
 */
export type EngineLogFormat = 'pretty' | 'text' | 'json' | 'structured';

/**
 * Engine log event types - All possible log events in the engine
 */
export enum EngineLogType {
  // Workflow Lifecycle
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_VALIDATION = 'workflow.validation',

  // Step Lifecycle
  STEP_STARTED = 'step.started',
  STEP_COMPLETED = 'step.completed',
  STEP_FAILED = 'step.failed',
  STEP_RETRY = 'step.retry',
  STEP_TIMEOUT = 'step.timeout',

  // Explanation
  EXPLANATION_GENERATED = 'explanation.generated',
  EXPLANATION_CYCLES = 'explanation.cycles',

  // Adapter & Plugin
  ADAPTER_LOADED = 'adapter.loaded',
  ADAPTER_FAILED = 'adapter.failed',
  PLUGIN_INSTALLED = 'plugin.installed',
  PLUGIN_VERIFIED = 'plugin.verified',

  // Error & Debug
  ERROR_DETECTED = 'error.detected',
  ERROR_DEBUGGED = 'error.debugged',
  VALIDATION_ERROR = 'validation.error',

  // Performance
  PERFORMANCE_METRIC = 'performance.metric',
  EXECUTION_TIME = 'execution.time',

  // System
  ENGINE_STARTED = 'engine.started',
  ENGINE_STOPPED = 'engine.stopped',
  QUEUE_PROCESSING = 'queue.processing',

  // Generic
  INFO = 'info',
  DEBUG = 'debug',
  WARNING = 'warning',
  ERROR = 'error',
}

/**
 * Structured engine log event
 */
export interface EngineLogEvent {
  /** Event type */
  type: EngineLogType;
  /** Timestamp */
  timestamp: Date;
  /** Log message */
  message: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Error object if applicable */
  error?: Error;
  /** Performance metrics if applicable */
  metrics?: {
    duration?: number;
    memory?: number;
    cpu?: number;
  };
}

/**
 * Categorized Log Events for filtering and tooling
 */

/** Parse-related log events */
export type ParseLogEvent = EngineLogEvent & {
  type: EngineLogType.WORKFLOW_VALIDATION;
};

/** Validation-related log events */
export type ValidationLogEvent = EngineLogEvent & {
  type: EngineLogType.WORKFLOW_VALIDATION | EngineLogType.VALIDATION_ERROR;
};

/** Execution-related log events */
export type ExecutionLogEvent = EngineLogEvent & {
  type:
  | EngineLogType.WORKFLOW_STARTED
  | EngineLogType.WORKFLOW_COMPLETED
  | EngineLogType.WORKFLOW_FAILED
  | EngineLogType.STEP_STARTED
  | EngineLogType.STEP_COMPLETED
  | EngineLogType.STEP_FAILED
  | EngineLogType.STEP_RETRY
  | EngineLogType.STEP_TIMEOUT
  | EngineLogType.EXECUTION_TIME
  | EngineLogType.QUEUE_PROCESSING;
};

/** Error-related log events */
export type ErrorLogEvent = EngineLogEvent & {
  type:
  | EngineLogType.ERROR_DETECTED
  | EngineLogType.ERROR_DEBUGGED
  | EngineLogType.VALIDATION_ERROR
  | EngineLogType.WORKFLOW_FAILED
  | EngineLogType.STEP_FAILED
  | EngineLogType.ADAPTER_FAILED
  | EngineLogType.ERROR;
};

/** Lifecycle-related log events */
export type LifecycleLogEvent = EngineLogEvent & {
  type:
  | EngineLogType.ENGINE_STARTED
  | EngineLogType.ENGINE_STOPPED
  | EngineLogType.ADAPTER_LOADED
  | EngineLogType.PLUGIN_INSTALLED
  | EngineLogType.PLUGIN_VERIFIED;
};

/** Performance-related log events */
export type PerformanceLogEvent = EngineLogEvent & {
  type:
  | EngineLogType.PERFORMANCE_METRIC
  | EngineLogType.EXECUTION_TIME;
};

/** Union of all categorized log events */
export type CategorizedLogEvent =
  | ParseLogEvent
  | ValidationLogEvent
  | ExecutionLogEvent
  | ErrorLogEvent
  | LifecycleLogEvent
  | PerformanceLogEvent;

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
  /** Enable structured event logging */
  structuredEvents?: boolean;
}