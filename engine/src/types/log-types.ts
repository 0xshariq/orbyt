
import { LogLevel } from "@dev-ecosystem/core";

/**
 * Log categories (phase-based, not feature-based)
 *
 * - 'system': Engine lifecycle, infrastructure, configuration, adapter registration
 * - 'analysis': Parsing, validation, explain, plan building, cycle detection
 * - 'runtime': Actual workflow execution (steps, retries, completion, failures)
 * - 'security': Internal field violation, reserved field usage, permission rejection
 *
 * Never add feature, adapter, or business domain categories here.
 */
export type LogCategory =
  | 'system'   // Engine lifecycle, infra, config
  | 'analysis' // Parsing, validation, explain, plan
  | 'runtime'  // Workflow execution
  | 'security';// Security events

/**
 * Enum for log categories (for strict usage)
 */
export enum LogCategoryEnum {
  SYSTEM = 'system',
  ANALYSIS = 'analysis',
  RUNTIME = 'runtime',
  SECURITY = 'security',
}

/**
 * Interface for a structured engine log entry
 * Every log must have a category and source.
 */
export interface EngineLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  category: LogCategory;
  source: string; // e.g. 'WorkflowExecutor', 'WorkflowLoader', 'AdapterRegistry'
  message: string;
  context?: Record<string, unknown>;
}

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
 * Structured engine log event (with category and source)
 */
export interface EngineLogEvent {
  /** Event type */
  type: EngineLogType;
  /** Timestamp */
  timestamp: Date;
  /** Log message */
  message: string;
  /** Log category (phase) */
  category: LogCategory;
  /** Log source (component/module) */
  source: string;
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
  source: string;
  /** Enable structured event logging */
  structuredEvents?: boolean;
  /** Log category */
  category: LogCategory;

  /** Optional file output settings for persisted logs */
  fileOutput?: {
    /** Enable writing logs to disk */
    enabled?: boolean;
    /** Directory where log files will be written */
    directory?: string;
    /** File name for persisted logs */
    fileName?: string;
  };
  /**
   * Maximum number of log events to keep in the in-memory history ring-buffer.
   * Older entries are silently dropped once the limit is reached. A value of
   * `0` (the default) disables the limit so all events are retained.
   */
  maxHistorySize?: number;
}

/**
 * Workflow context — attached to the logger for the duration of a
 * run / explain / validate session.
 *
 * When set via `EngineLogger.setWorkflowContext()`, every subsequent log
 * entry automatically includes this under the `workflow` key so that log
 * consumers can filter, group and display logs per workflow file without
 * parsing the message text.
 *
 * Build it from a `ParsedWorkflow`:
 * ```typescript
 * logger.setWorkflowContext({
 *   name:              workflow.name,
 *   version:           workflow.version,
 *   kind:              workflow.kind,
 *   description:       workflow.description,
 *   stepCount:         workflow.steps.length,
 *   filePath:          '/user/project/deploy.orbt',
 *   tags:              workflow.tags,
 * });
 * ```
 */
export interface WorkflowContext {
  /** Workflow name from the .orbt workflow object file (e.g. "deploy-api") */
  name?: string;
  /** Engine-generated execution ID used to isolate logs per workflow run */
  executionId?: string;
  /** Engine-generated run ID for audit correlation */
  runId?: string;
  /** Semantic version string (e.g. "1.2.0") */
  version?: string;
  /** Document kind (e.g. "workflow", "pipeline") */
  kind?: string;
  /** Human-readable description from the file */
  description?: string;
  /** Total number of declared steps */
  stepCount?: number;
  /** Absolute path to the source .orbt workflow object file */
  filePath?: string;
  /** Tags from workflow metadata */
  tags?: string[];
  /** Inferred execution strategy */
  executionStrategy?: 'sequential' | 'parallel' | 'mixed';
}

/**
 * Export logs in formats suitable for different consumers
 */
export interface ExportedLogs {
  /** Raw JSON logs */
  raw: EngineLogEvent[];
  /** Logs grouped by type */
  grouped: Record<string, EngineLogEvent[]>;
  /** Workflow context snapshot at the time of export (if set) */
  workflowContext?: WorkflowContext;
  /** Statistics */
  stats: {
    total: number;
    byType: Record<string, number>;
    /** Count per phase category (`system`, `runtime`, `analysis`, `security`) */
    byCategory: Record<string, number>;
    withErrors: number;
    withMetrics: number;
    timeRange: { first?: Date; last?: Date };
  };
  /** Workflow execution summary for explanation */
  execution?: {
    workflow?: { name: string; status: string; duration?: number };
    steps: Array<{ id: string; name: string; status: string; duration?: number }>;
    errors: Array<{ step?: string; message: string; error?: Error }>;
    metrics: Array<{ label: string; duration?: number; memory?: number }>;
  };
}
