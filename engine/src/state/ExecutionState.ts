/**
 * Execution State
 * 
 * Tracks workflow and step execution state for observability,
 * recovery, and resume capabilities.
 * 
 * @module state
 */

/**
 * Step execution status
 * 
 * Lifecycle:
 * PENDING → RUNNING → SUCCESS → COMPLETED
 * OR
 * PENDING → RUNNING → FAILED → RETRYING → RUNNING → SUCCESS → COMPLETED
 * OR  
 * PENDING → SKIPPED
 */
export enum StepStatus {
  /** Step is queued, not yet started */
  PENDING = 'PENDING',
  
  /** Step is currently executing */
  RUNNING = 'RUNNING',
  
  /** Step completed successfully */
  SUCCESS = 'SUCCESS',
  
  /** Step failed */
  FAILED = 'FAILED',
  
  /** Step is retrying after failure */
  RETRYING = 'RETRYING',
  
  /** Step was skipped (conditional execution) */
  SKIPPED = 'SKIPPED',
  
  /** Step timed out */
  TIMEOUT = 'TIMEOUT',
  
  /** Step was cancelled */
  CANCELLED = 'CANCELLED',
}

/**
 * Workflow execution status
 */
export enum WorkflowStatus {
  /** Workflow is queued, not yet started */
  QUEUED = 'QUEUED',
  
  /** Workflow is currently executing */
  RUNNING = 'RUNNING',
  
  /** Workflow completed successfully (all steps success) */
  COMPLETED = 'COMPLETED',
  
  /** Workflow failed (one or more steps failed) */
  FAILED = 'FAILED',
  
  /** Workflow partially completed (some steps failed but continueOnError=true) */
  PARTIAL = 'PARTIAL',
  
  /** Workflow timed out */
  TIMEOUT = 'TIMEOUT',
  
  /** Workflow was cancelled */
  CANCELLED = 'CANCELLED',
  
  /** Workflow is paused (future feature) */
  PAUSED = 'PAUSED',
}

/**
 * Step execution state
 */
export interface StepExecutionState {
  /** Unique step ID */
  stepId: string;
  
  /** Current status */
  status: StepStatus;
  
  /** Number of execution attempts */
  attempts: number;
  
  /** Start timestamp (ms since epoch) */
  startTime?: number;
  
  /** End timestamp (ms since epoch) */
  endTime?: number;
  
  /** Error information if failed */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  
  /** Step output data (if successful) */
  output?: any;
  
  /** Execution duration in milliseconds */
  duration?: number;
  
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Workflow execution state
 */
export interface WorkflowExecutionState {
  /** Unique workflow execution ID */
  executionId: string;
  
  /** Workflow name/ID */
  workflowId: string;
  
  /** Current workflow status */
  status: WorkflowStatus;
  
  /** State of all steps (keyed by step ID) */
  steps: Record<string, StepExecutionState>;
  
  /** Workflow start timestamp (ms since epoch) */
  startedAt?: number;
  
  /** Workflow completion timestamp (ms since epoch) */
  finishedAt?: number;
  
  /** Total workflow duration in milliseconds */
  duration?: number;
  
  /** Workflow-level error (if failed) */
  error?: {
    message: string;
    stepId?: string; // Which step caused workflow failure
    code?: string;
  };
  
  /** Execution metadata */
  metadata: {
    /** Total number of steps */
    totalSteps: number;
    
    /** Number of completed steps */
    completedSteps: number;
    
    /** Number of failed steps */
    failedSteps: number;
    
    /** Number of skipped steps */
    skippedSteps: number;
    
    /** Current phase being executed */
    currentPhase?: number;
    
    /** Total number of phases */
    totalPhases?: number;
  };
  
  /** Last state update timestamp */
  updatedAt: number;
  
  /** Execution context snapshot */
  context?: {
    env?: Record<string, any>;
    inputs?: Record<string, any>;
  };
}

/**
 * Execution State Manager
 * 
 * Manages workflow and step state with thread-safe updates.
 */
export class ExecutionStateManager {
  private states: Map<string, WorkflowExecutionState> = new Map();
  
  /**
   * Initialize a new workflow execution state
   */
  initializeWorkflow(
    executionId: string,
    workflowId: string,
    stepIds: string[],
    context?: { env?: Record<string, any>; inputs?: Record<string, any> }
  ): WorkflowExecutionState {
    const now = Date.now();
    
    const steps: Record<string, StepExecutionState> = {};
    for (const stepId of stepIds) {
      steps[stepId] = {
        stepId,
        status: StepStatus.PENDING,
        attempts: 0,
        updatedAt: now,
      };
    }
    
    const state: WorkflowExecutionState = {
      executionId,
      workflowId,
      status: WorkflowStatus.QUEUED,
      steps,
      metadata: {
        totalSteps: stepIds.length,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
      },
      updatedAt: now,
      context,
    };
    
    this.states.set(executionId, state);
    return state;
  }
  
  /**
   * Get workflow execution state
   */
  getState(executionId: string): WorkflowExecutionState | undefined {
    return this.states.get(executionId);
  }
  
  /**
   * Update workflow status
   */
  updateWorkflowStatus(
    executionId: string,
    status: WorkflowStatus,
    error?: { message: string; stepId?: string; code?: string }
  ): void {
    const state = this.states.get(executionId);
    if (!state) {
      throw new Error(`Workflow execution ${executionId} not found`);
    }
    
    const now = Date.now();
    state.status = status;
    state.updatedAt = now;
    
    if (status === WorkflowStatus.RUNNING && !state.startedAt) {
      state.startedAt = now;
    }
    
    if (this.isTerminalStatus(status) && !state.finishedAt) {
      state.finishedAt = now;
      if (state.startedAt) {
        state.duration = state.finishedAt - state.startedAt;
      }
    }
    
    if (error) {
      state.error = error;
    }
  }
  
  /**
   * Update step status
   */
  updateStepStatus(
    executionId: string,
    stepId: string,
    status: StepStatus,
    data?: {
      error?: { message: string; code?: string; stack?: string };
      output?: any;
      attempts?: number;
    }
  ): void {
    const state = this.states.get(executionId);
    if (!state) {
      throw new Error(`Workflow execution ${executionId} not found`);
    }
    
    const stepState = state.steps[stepId];
    if (!stepState) {
      throw new Error(`Step ${stepId} not found in execution ${executionId}`);
    }
    
    const now = Date.now();
    stepState.status = status;
    stepState.updatedAt = now;
    
    // Track start time
    if (status === StepStatus.RUNNING && !stepState.startTime) {
      stepState.startTime = now;
    }
    
    // Track end time and duration
    if (this.isTerminalStepStatus(status) && !stepState.endTime) {
      stepState.endTime = now;
      if (stepState.startTime) {
        stepState.duration = stepState.endTime - stepState.startTime;
      }
    }
    
    // Update attempts
    if (data?.attempts !== undefined) {
      stepState.attempts = data.attempts;
    }
    
    // Store error
    if (data?.error) {
      stepState.error = data.error;
    }
    
    // Store output
    if (data?.output !== undefined) {
      stepState.output = data.output;
    }
    
    // Update workflow metadata counts
    this.updateWorkflowMetadata(state);
  }
  
  /**
   * Get step state
   */
  getStepState(executionId: string, stepId: string): StepExecutionState | undefined {
    const state = this.states.get(executionId);
    return state?.steps[stepId];
  }
  
  /**
   * Check if step has completed (success or terminal failure)
   */
  isStepCompleted(executionId: string, stepId: string): boolean {
    const stepState = this.getStepState(executionId, stepId);
    if (!stepState) return false;
    
    return this.isTerminalStepStatus(stepState.status);
  }
  
  /**
   * Check if step succeeded
   */
  isStepSuccessful(executionId: string, stepId: string): boolean {
    const stepState = this.getStepState(executionId, stepId);
    return stepState?.status === StepStatus.SUCCESS;
  }
  
  /**
   * Get all failed steps
   */
  getFailedSteps(executionId: string): StepExecutionState[] {
    const state = this.states.get(executionId);
    if (!state) return [];
    
    return Object.values(state.steps).filter(
      step => step.status === StepStatus.FAILED || step.status === StepStatus.TIMEOUT
    );
  }
  
  /**
   * Get all completed steps
   */
  getCompletedSteps(executionId: string): StepExecutionState[] {
    const state = this.states.get(executionId);
    if (!state) return [];
    
    return Object.values(state.steps).filter(step => 
      this.isTerminalStepStatus(step.status)
    );
  }
  
  /**
   * Clear execution state (cleanup)
   */
  clearState(executionId: string): boolean {
    return this.states.delete(executionId);
  }
  
  /**
   * Get all execution IDs
   */
  getAllExecutionIds(): string[] {
    return Array.from(this.states.keys());
  }
  
  /**
   * Check if status is terminal (workflow)
   */
  private isTerminalStatus(status: WorkflowStatus): boolean {
    return [
      WorkflowStatus.COMPLETED,
      WorkflowStatus.FAILED,
      WorkflowStatus.PARTIAL,
      WorkflowStatus.TIMEOUT,
      WorkflowStatus.CANCELLED,
    ].includes(status);
  }
  
  /**
   * Check if status is terminal (step)
   */
  private isTerminalStepStatus(status: StepStatus): boolean {
    return [
      StepStatus.SUCCESS,
      StepStatus.FAILED,
      StepStatus.TIMEOUT,
      StepStatus.CANCELLED,
      StepStatus.SKIPPED,
    ].includes(status);
  }
  
  /**
   * Update workflow metadata counts based on step states
   */
  private updateWorkflowMetadata(state: WorkflowExecutionState): void {
    const steps = Object.values(state.steps);
    
    state.metadata.completedSteps = steps.filter(
      s => s.status === StepStatus.SUCCESS
    ).length;
    
    state.metadata.failedSteps = steps.filter(
      s => s.status === StepStatus.FAILED || s.status === StepStatus.TIMEOUT
    ).length;
    
    state.metadata.skippedSteps = steps.filter(
      s => s.status === StepStatus.SKIPPED
    ).length;
  }
}
