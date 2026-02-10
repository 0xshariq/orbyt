/**
 * Event Types and Interfaces for Orbyt Engine
 * 
 * The event system enables observability and extensibility by emitting
 * events at critical lifecycle moments. These events can be consumed by:
 * - Logging systems
 * - Metrics collectors
 * - Monitoring dashboards
 * - External integrations
 * - Workflow triggers (event-driven automation)
 */

/**
 * Core event interface - all events must conform to this shape
 */
export interface OrbytEvent<T = any> {
  /** Event type identifier */
  type: string;
  
  /** Unix timestamp in milliseconds */
  timestamp: number;
  
  /** ID of the workflow execution */
  workflowId?: string;
  
  /** ID of the step being executed */
  stepId?: string;
  
  /** ID of the specific execution run */
  runId?: string;
  
  /** Event-specific payload data */
  payload?: T;
}

/**
 * Engine-wide event types
 * These cover all significant lifecycle moments in the execution flow
 */
export enum EngineEventType {
  // Workflow-level events
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_PAUSED = 'workflow.paused',
  WORKFLOW_RESUMED = 'workflow.resumed',
  WORKFLOW_CANCELLED = 'workflow.cancelled',
  
  // Step-level events
  STEP_STARTED = 'step.started',
  STEP_COMPLETED = 'step.completed',
  STEP_FAILED = 'step.failed',
  STEP_SKIPPED = 'step.skipped',
  STEP_RETRYING = 'step.retrying',
  STEP_TIMEOUT = 'step.timeout',
  
  // Job queue events
  JOB_ENQUEUED = 'job.enqueued',
  JOB_DEQUEUED = 'job.dequeued',
  JOB_RETRY = 'job.retry',
  
  // Scheduling events
  SCHEDULE_TRIGGERED = 'schedule.triggered',
  TRIGGER_FIRED = 'trigger.fired',
  
  // State transitions
  STATE_CHANGED = 'state.changed',
  
  // System events
  ENGINE_STARTED = 'engine.started',
  ENGINE_STOPPED = 'engine.stopped',
  WORKER_ONLINE = 'worker.online',
  WORKER_OFFLINE = 'worker.offline',
}

/**
 * Typed event payloads for better type safety
 */

export interface WorkflowStartedPayload {
  workflowId: string;
  workflowName: string;
  runId: string;
  triggeredBy?: string;
  inputs?: Record<string, any>;
}

export interface WorkflowCompletedPayload {
  workflowId: string;
  workflowName: string;
  runId: string;
  durationMs: number;
  stepCount: number;
}

export interface WorkflowFailedPayload {
  workflowId: string;
  workflowName: string;
  runId: string;
  error: string;
  failedStep?: string;
  durationMs: number;
}

export interface StepStartedPayload {
  workflowId: string;
  runId: string;
  stepId: string;
  stepName: string;
  adapterType: string;
}

export interface StepCompletedPayload {
  workflowId: string;
  runId: string;
  stepId: string;
  stepName: string;
  adapterType: string;
  durationMs: number;
  output?: any;
}

export interface StepFailedPayload {
  workflowId: string;
  runId: string;
  stepId: string;
  stepName: string;
  adapterType: string;
  error: string;
  attempt: number;
  willRetry: boolean;
}

export interface StepRetryingPayload {
  workflowId: string;
  runId: string;
  stepId: string;
  stepName: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

export interface JobEnqueuedPayload {
  jobId: string;
  workflowId: string;
  priority: number;
  queueDepth: number;
}

export interface ScheduleTriggeredPayload {
  scheduleId: string;
  workflowId: string;
  triggerType: string;
  nextRun?: Date;
}

export interface StateChangedPayload {
  workflowId: string;
  runId: string;
  from: string;
  to: string;
}

/**
 * Helper to create well-formed events
 */
export function createEvent<T = any>(
  type: string | EngineEventType,
  payload?: T,
  context?: { workflowId?: string; stepId?: string; runId?: string }
): OrbytEvent<T> {
  return {
    type,
    timestamp: Date.now(),
    workflowId: context?.workflowId,
    stepId: context?.stepId,
    runId: context?.runId,
    payload,
  };
}
