/**
 * State Machine
 * 
 * Enforces valid state transitions for workflow and step execution.
 * This ensures state integrity and prevents invalid state combinations.
 * 
 * Purpose:
 * - Define valid state transition rules
 * - Validate transitions before they occur
 * - Provide type-safe transition methods
 * - Track transition history for debugging
 * 
 * This is about RULES, not execution. It answers:
 * - Can this state transition happen?
 * - What are the valid next states?
 * - Is this state terminal (no further transitions)?
 * 
 * @module state
 */

import { StepStatus, WorkflowStatus } from './ExecutionState.js';

/**
 * State transition record for audit trail
 */
export interface StateTransition<T> {
  /** State before transition */
  readonly from: T;
  /** State after transition */
  readonly to: T;
  /** Timestamp of transition (ms since epoch) */
  readonly timestamp: number;
  /** Optional reason for transition */
  readonly reason?: string;
}

/**
 * State machine configuration
 */
export interface StateMachineConfig<T> {
  /** Initial state */
  readonly initialState: T;
  /** Valid transitions map: from → allowed to states */
  readonly transitions: ReadonlyMap<T, readonly T[]>;
  /** Terminal states (no further transitions allowed) */
  readonly terminalStates: ReadonlySet<T>;
}

/**
 * Generic state machine for enforcing valid transitions
 */
export class StateMachine<T> {
  private currentState: T;
  private readonly config: StateMachineConfig<T>;
  private readonly history: StateTransition<T>[] = [];

  constructor(config: StateMachineConfig<T>) {
    this.config = config;
    this.currentState = config.initialState;
  }

  /**
   * Get current state
   */
  getState(): T {
    return this.currentState;
  }

  /**
   * Check if transition is valid
   */
  canTransition(to: T): boolean {
    // Terminal states cannot transition
    if (this.config.terminalStates.has(this.currentState)) {
      return false;
    }

    const allowedTransitions = this.config.transitions.get(this.currentState);
    if (!allowedTransitions) {
      return false;
    }

    return allowedTransitions.includes(to);
  }

  /**
   * Perform state transition
   * 
   * @param to - Target state
   * @param reason - Optional reason for transition
   * @throws Error if transition is invalid
   */
  transition(to: T, reason?: string): void {
    if (!this.canTransition(to)) {
      throw new Error(
        `Invalid state transition: ${String(this.currentState)} → ${String(to)}`
      );
    }

    const from = this.currentState;
    this.currentState = to;

    // Record transition
    this.history.push({
      from,
      to,
      timestamp: Date.now(),
      reason,
    });
  }

  /**
   * Check if current state is terminal
   */
  isTerminal(): boolean {
    return this.config.terminalStates.has(this.currentState);
  }

  /**
   * Get allowed transitions from current state
   */
  getAllowedTransitions(): readonly T[] {
    return this.config.transitions.get(this.currentState) || [];
  }

  /**
   * Get transition history
   */
  getHistory(): readonly StateTransition<T>[] {
    return [...this.history];
  }

  /**
   * Reset to initial state (for testing/recovery)
   */
  reset(): void {
    this.currentState = this.config.initialState;
    this.history.length = 0;
  }
}

/**
 * Step state machine configuration
 * 
 * Valid transitions:
 * PENDING → RUNNING → SUCCESS (happy path)
 * PENDING → SKIPPED (conditional)
 * RUNNING → FAILED → RETRYING → RUNNING (retry path)
 * RUNNING → TIMEOUT (timeout)
 * RUNNING → CANCELLED (cancellation)
 * any → CANCELLED (force cancel)
 */
const STEP_TRANSITIONS = new Map<StepStatus, readonly StepStatus[]>([
  [StepStatus.PENDING, [StepStatus.RUNNING, StepStatus.SKIPPED, StepStatus.CANCELLED]],
  [StepStatus.RUNNING, [StepStatus.SUCCESS, StepStatus.FAILED, StepStatus.TIMEOUT, StepStatus.CANCELLED]],
  [StepStatus.FAILED, [StepStatus.RETRYING, StepStatus.CANCELLED]],
  [StepStatus.RETRYING, [StepStatus.RUNNING, StepStatus.CANCELLED]],
  [StepStatus.SKIPPED, []], // Terminal
  [StepStatus.SUCCESS, []], // Terminal
  [StepStatus.TIMEOUT, []], // Terminal
  [StepStatus.CANCELLED, []], // Terminal
]);

const STEP_TERMINAL_STATES = new Set<StepStatus>([
  StepStatus.SUCCESS,
  StepStatus.SKIPPED,
  StepStatus.TIMEOUT,
  StepStatus.CANCELLED,
]);

/**
 * Workflow state machine configuration
 * 
 * Valid transitions:
 * QUEUED → RUNNING (start)
 * RUNNING → COMPLETED (all steps success)
 * RUNNING → FAILED (step failed, no continueOnError)
 * RUNNING → PARTIAL (some steps failed, continueOnError)
 * RUNNING → TIMEOUT (workflow timeout)
 * RUNNING → CANCELLED (user cancelled)
 * RUNNING → PAUSED (pause feature - future)
 * PAUSED → RUNNING (resume - future)
 * PAUSED → CANCELLED (cancel while paused)
 */
const WORKFLOW_TRANSITIONS = new Map<WorkflowStatus, readonly WorkflowStatus[]>([
  [WorkflowStatus.QUEUED, [WorkflowStatus.RUNNING, WorkflowStatus.CANCELLED]],
  [WorkflowStatus.RUNNING, [
    WorkflowStatus.COMPLETED,
    WorkflowStatus.FAILED,
    WorkflowStatus.PARTIAL,
    WorkflowStatus.TIMEOUT,
    WorkflowStatus.CANCELLED,
    WorkflowStatus.PAUSED,
  ]],
  [WorkflowStatus.PAUSED, [WorkflowStatus.RUNNING, WorkflowStatus.CANCELLED]],
  [WorkflowStatus.COMPLETED, []], // Terminal
  [WorkflowStatus.FAILED, []], // Terminal
  [WorkflowStatus.PARTIAL, []], // Terminal
  [WorkflowStatus.TIMEOUT, []], // Terminal
  [WorkflowStatus.CANCELLED, []], // Terminal
]);

const WORKFLOW_TERMINAL_STATES = new Set<WorkflowStatus>([
  WorkflowStatus.COMPLETED,
  WorkflowStatus.FAILED,
  WorkflowStatus.PARTIAL,
  WorkflowStatus.TIMEOUT,
  WorkflowStatus.CANCELLED,
]);

/**
 * Create step state machine
 */
export function createStepStateMachine(): StateMachine<StepStatus> {
  return new StateMachine<StepStatus>({
    initialState: StepStatus.PENDING,
    transitions: STEP_TRANSITIONS,
    terminalStates: STEP_TERMINAL_STATES,
  });
}

/**
 * Create workflow state machine
 */
export function createWorkflowStateMachine(): StateMachine<WorkflowStatus> {
  return new StateMachine<WorkflowStatus>({
    initialState: WorkflowStatus.QUEUED,
    transitions: WORKFLOW_TRANSITIONS,
    terminalStates: WORKFLOW_TERMINAL_STATES,
  });
}

/**
 * Validate step state transition
 * Throws if invalid
 */
export function validateStepTransition(
  from: StepStatus,
  to: StepStatus
): void {
  const allowed = STEP_TRANSITIONS.get(from) || [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid step state transition: ${from} → ${to}. ` +
      `Allowed: ${allowed.join(', ') || 'none (terminal state)'}`
    );
  }
}

/**
 * Validate workflow state transition
 * Throws if invalid
 */
export function validateWorkflowTransition(
  from: WorkflowStatus,
  to: WorkflowStatus
): void {
  const allowed = WORKFLOW_TRANSITIONS.get(from) || [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid workflow state transition: ${from} → ${to}. ` +
      `Allowed: ${allowed.join(', ') || 'none (terminal state)'}`
    );
  }
}

/**
 * Check if step status is terminal
 */
export function isStepTerminal(status: StepStatus): boolean {
  return STEP_TERMINAL_STATES.has(status);
}

/**
 * Check if workflow status is terminal
 */
export function isWorkflowTerminal(status: WorkflowStatus): boolean {
  return WORKFLOW_TERMINAL_STATES.has(status);
}

/**
 * Get allowed transitions from a step state
 */
export function getStepTransitions(from: StepStatus): readonly StepStatus[] {
  return STEP_TRANSITIONS.get(from) || [];
}

/**
 * Get allowed transitions from a workflow state
 */
export function getWorkflowTransitions(from: WorkflowStatus): readonly WorkflowStatus[] {
  return WORKFLOW_TRANSITIONS.get(from) || [];
}
