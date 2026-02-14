/**
 * CLI Event Types
 * 
 * Events emitted during workflow execution that the CLI layer observes.
 * These events drive the formatter output.
 */

/**
 * Event types that the CLI layer cares about
 */
export enum CliEventType {
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  STEP_STARTED = 'step.started',
  STEP_COMPLETED = 'step.completed',
  STEP_FAILED = 'step.failed',
  STEP_RETRYING = 'step.retrying',
  STEP_SKIPPED = 'step.skipped',
}

/**
 * Base CLI event
 */
export interface BaseCliEvent {
  type: CliEventType;
  timestamp: Date;
}

/**
 * Workflow started event
 */
export interface WorkflowStartedEvent extends BaseCliEvent {
  type: CliEventType.WORKFLOW_STARTED;
  workflowName: string;
  totalSteps: number;
}

/**
 * Workflow completed event
 */
export interface WorkflowCompletedEvent extends BaseCliEvent {
  type: CliEventType.WORKFLOW_COMPLETED;
  workflowName: string;
  status: 'success' | 'partial';
  duration: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
}

/**
 * Workflow failed event
 */
export interface WorkflowFailedEvent extends BaseCliEvent {
  type: CliEventType.WORKFLOW_FAILED;
  workflowName: string;
  error: Error;
  duration: number;
}

/**
 * Step started event
 */
export interface StepStartedEvent extends BaseCliEvent {
  type: CliEventType.STEP_STARTED;
  stepId: string;
  stepName: string;
  adapter: string;
  action: string;
}

/**
 * Step completed event
 */
export interface StepCompletedEvent extends BaseCliEvent {
  type: CliEventType.STEP_COMPLETED;
  stepId: string;
  stepName: string;
  duration: number;
  output?: any;
}

/**
 * Step failed event
 */
export interface StepFailedEvent extends BaseCliEvent {
  type: CliEventType.STEP_FAILED;
  stepId: string;
  stepName: string;
  error: Error;
  duration: number;
}

/**
 * Step retrying event
 */
export interface StepRetryingEvent extends BaseCliEvent {
  type: CliEventType.STEP_RETRYING;
  stepId: string;
  stepName: string;
  attempt: number;
  maxAttempts: number;
  nextDelay: number;
}

/**
 * Step skipped event
 */
export interface StepSkippedEvent extends BaseCliEvent {
  type: CliEventType.STEP_SKIPPED;
  stepId: string;
  stepName: string;
  reason: string;
}

/**
 * Union type of all CLI events
 */
export type CliEvent =
  | WorkflowStartedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | StepRetryingEvent
  | StepSkippedEvent;
