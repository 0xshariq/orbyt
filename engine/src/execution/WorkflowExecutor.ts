/**
 * Workflow Executor
 * 
 * Orchestrates complete workflow execution:
 * - Creates execution plan
 * - Executes steps in phases (with parallelism)
 * - Manages step outputs and context
 * - Handles workflow-level errors and timeouts
 * 
 * @module execution
 */

import type { ParsedWorkflow } from '../parser/WorkflowParser.js';
import type { ResolutionContext } from '../context/VariableResolver.js';
import type { StepResult } from './StepExecutor.js';
import { StepExecutor } from './StepExecutor.js';
import { ExecutionPlanner, type ExecutionPlan } from './ExecutionPlan.js';
import { WorkflowGuard } from '../guards/WorkflowGuard.js';
import { StepGuard } from '../guards/StepGuard.js';

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  /** Workflow name */
  workflowName: string;
  
  /** Overall status */
  status: 'success' | 'failure' | 'partial' | 'timeout';
  
  /** All step results */
  stepResults: Map<string, StepResult>;
  
  /** Total execution duration (ms) */
  duration: number;
  
  /** Start timestamp */
  startedAt: Date;
  
  /** End timestamp  */
  completedAt: Date;
  
  /** Error if workflow failed */
  error?: Error;
  
  /** Execution metadata */
  metadata: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;
    phases: number;
  };
}

/**
 * Workflow execution options
 */
export interface ExecutionOptions {
  /** Workflow timeout (ms) */
  timeout?: number;
  
  /** Initial environment variables */
  env?: Record<string, any>;
  
  /** Workflow inputs */
  inputs?: Record<string, any>;
  
  /** Additional context */
  context?: Record<string, any>;
  
  /** Continue on step failure */
  continueOnError?: boolean;
}

/**
 * Workflow executor
 */
export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private executionId: string;

  constructor(stepExecutor: StepExecutor) {
    this.stepExecutor = stepExecutor;
    this.executionId = this.generateExecutionId();
  }

  /**
   * Execute a complete workflow
   * 
   * @param workflow - Parsed workflow
   * @param options - Execution options
   * @returns Workflow execution result
   */
  async execute(
    workflow: ParsedWorkflow,
    options: ExecutionOptions = {}
  ): Promise<WorkflowResult> {
    const startedAt = new Date();
    const stepResults = new Map<string, StepResult>();

    // Validate workflow
    this.validateWorkflow(workflow);

    // Create execution plan
    const plan = ExecutionPlanner.plan(workflow.steps);

    // Build initial context
    const context = this.buildContext(workflow, options);

    // Execute with timeout if specified
    try {
      const timeout = options.timeout || workflow.timeout;
      
      if (timeout) {
        await this.executeWithTimeout(
          workflow,
          plan,
          context,
          stepResults,
          options,
          timeout
        );
      } else {
        await this.executeWorkflowPlan(
          workflow,
          plan,
          context,
          stepResults,
          options
        );
      }

      const completedAt = new Date();
      return this.buildResult(
        workflow,
        stepResults,
        'success',
        startedAt,
        completedAt,
        plan
      );
    } catch (error) {
      const completedAt = new Date();
      const status = error instanceof Error && error.message.includes('timeout') 
        ? 'timeout' 
        : 'failure';
      
      return this.buildResult(
        workflow,
        stepResults,
        status,
        startedAt,
        completedAt,
        plan,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Execute workflow with timeout
   */
  private async executeWithTimeout(
    workflow: ParsedWorkflow,
    plan: ExecutionPlan,
    context: ResolutionContext,
    stepResults: Map<string, StepResult>,
    options: ExecutionOptions,
    timeoutMs: number
  ): Promise<void> {
    return Promise.race([
      this.executeWorkflowPlan(workflow, plan, context, stepResults, options),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error(
            `Workflow '${workflow.name}' exceeded timeout of ${timeoutMs}ms`
          ));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Execute workflow plan phase by phase
   */
  private async executeWorkflowPlan(
    workflow: ParsedWorkflow,
    plan: ExecutionPlan,
    context: ResolutionContext,
    stepResults: Map<string, StepResult>,
    options: ExecutionOptions
  ): Promise<void> {
    const continueOnError = options.continueOnError ?? workflow.onFailure === 'continue';

    // Execute each phase
    for (const phase of plan.phases) {
      // Execute all steps in phase concurrently
      const phasePromises = phase.steps.map(step =>
        this.stepExecutor.execute(step, context)
      );

      const results = await Promise.allSettled(phasePromises);

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const step = phase.steps[i];

        if (result.status === 'fulfilled') {
          const stepResult = result.value;
          stepResults.set(step.id, stepResult);

          // Update context with step output
          if (stepResult.status === 'success') {
            context.steps.set(step.id, stepResult.output);
          }

          // Check if step failed and we should stop
          if (
            stepResult.status === 'failure' && 
            !continueOnError && 
            !step.continueOnError
          ) {
            throw new Error(
              `Step '${step.id}' failed: ${stepResult.error?.message || 'Unknown error'}`
            );
          }
        } else {
          // Step execution threw an error
          const error = result.reason;
          stepResults.set(step.id, {
            stepId: step.id,
            status: 'failure',
            output: null,
            error: error instanceof Error ? error : new Error(String(error)),
            attempts: 1,
            duration: 0,
            startedAt: new Date(),
            completedAt: new Date(),
          });

          if (!continueOnError && !step.continueOnError) {
            throw error;
          }
        }
      }
    }
  }

  /**
   * Validate workflow before execution
   */
  private validateWorkflow(workflow: ParsedWorkflow): void {
    const availableSteps = new Set(workflow.steps.map(s => s.id));

    // Validate workflow structure
    WorkflowGuard.validate(workflow.steps);

    // Validate each step
    for (const step of workflow.steps) {
      StepGuard.validate(step, availableSteps);
    }
  }

  /**
   * Build execution context
   */
  private buildContext(
    workflow: ParsedWorkflow,
    options: ExecutionOptions
  ): ResolutionContext {
    return {
      env: {
        ...workflow.env,
        ...options.env,
        ...options.inputs,
      },
      steps: new Map(),
      workflow: {
        id: workflow.name,
        name: workflow.name,
        version: workflow.version,
      },
      run: {
        id: this.executionId,
        timestamp: new Date(),
        attempt: 1,
      },
      context: options.context,
    };
  }

  /**
   * Build workflow execution result
   */
  private buildResult(
    workflow: ParsedWorkflow,
    stepResults: Map<string, StepResult>,
    status: 'success' | 'failure' | 'timeout',
    startedAt: Date,
    completedAt: Date,
    plan: ExecutionPlan,
    error?: Error
  ): WorkflowResult {
    const results = Array.from(stepResults.values());
    
    return {
      workflowName: workflow.name,
      status,
      stepResults,
      duration: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
      error,
      metadata: {
        totalSteps: workflow.steps.length,
        successfulSteps: results.filter(r => r.status === 'success').length,
        failedSteps: results.filter(r => r.status === 'failure').length,
        skippedSteps: results.filter(r => r.status === 'skipped').length,
        phases: plan.phases.length,
      },
    };
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get execution ID
   */
  getExecutionId(): string {
    return this.executionId;
  }
}
