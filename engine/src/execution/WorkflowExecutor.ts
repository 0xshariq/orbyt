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
import type { ParsedStep } from '../parser/StepParser.js';
import type { ResolutionContext } from '../context/VariableResolver.js';
import type { StepResult } from './StepExecutor.js';
import { StepExecutor } from './StepExecutor.js';
import { ExecutionPlanner, type ExecutionPlan } from './ExecutionPlan.js';
import { createExecutionNode, type ExecutionNode } from './ExecutionNode.js';
import { WorkflowGuard } from '../guards/WorkflowGuard.js';
import { StepGuard } from '../guards/StepGuard.js';
import { ContextStore } from '../context/ContextStore.js';

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
  
  /** Resolved secrets */
  secrets?: Record<string, any>;
  
  /** Additional context */
  context?: Record<string, any>;
  
  /** Continue on step failure */
  continueOnError?: boolean;
  
  /** Trigger source (who/what triggered this execution) */
  triggeredBy?: string;
}

/**
 * Workflow executor
 */
export class WorkflowExecutor {
  private stepExecutor: StepExecutor;
  private executionId: string;
  private contextStore?: ContextStore;

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

    // Create ContextStore for this execution
    this.contextStore = this.createContextStore(workflow, options);
    
    // Configure StepExecutor with ContextStore
    this.stepExecutor.setContextStore(this.contextStore);

    // Convert ParsedStep[] to ExecutionNode[] for planning
    const executionNodes = this.convertToExecutionNodes(workflow.steps);

    // Create step lookup map for execution
    const stepMap = new Map(workflow.steps.map(s => [s.id, s]));

    // Create execution plan
    const plan = ExecutionPlanner.plan(executionNodes);

    // Get context from ContextStore
    const context = this.contextStore.getResolutionContext();

    // Execute with timeout if specified
    try {
      const timeout = options.timeout || (workflow.defaults?.timeout ? this.parseTimeoutString(workflow.defaults.timeout) : undefined);
      
      if (timeout) {
        await this.executeWithTimeout(
          workflow,
          plan,
          context,
          stepResults,
          options,
          stepMap,
          timeout
        );
      } else {
        await this.executeWorkflowPlan(
          workflow,
          plan,
          context,
          stepResults,
          options,
          stepMap
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
    stepMap: Map<string, ParsedStep>,
    timeoutMs: number
  ): Promise<void> {
    return Promise.race([
      this.executeWorkflowPlan(workflow, plan, context, stepResults, options, stepMap),
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
    options: ExecutionOptions,
    stepMap: Map<string, ParsedStep>
  ): Promise<void> {
    const continueOnError = options.continueOnError ?? workflow.policies?.failure === 'continue';

    // Execute each phase
    for (const phase of plan.phases) {
      // Execute all nodes in phase concurrently
      // Map ExecutionNode back to ParsedStep for execution
      // Note: StepExecutor will use ContextStore automatically (no need to pass context)
      const phasePromises = phase.nodes.map(node => {
        const step = stepMap.get(node.stepId);
        if (!step) {
          throw new Error(`Step not found: ${node.stepId}`);
        }
        return this.stepExecutor.execute(step);
      });

      const results = await Promise.allSettled(phasePromises);

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const node = phase.nodes[i];
        const step = stepMap.get(node.stepId)!;

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
   * Convert ParsedStep[] to ExecutionNode[]
   * This bridges the parser output with the execution planning system
   */
  private convertToExecutionNodes(steps: ParsedStep[]): ExecutionNode[] {
    return steps.map(step => {
      const timeout = step.timeout ? this.parseTimeoutString(step.timeout) : undefined;
      const maxRetries = step.retry?.max ?? 0;

      return createExecutionNode()
        .setStepId(step.id)
        .setUses(step.action)
        .setInput(step.input)
        .setDependencies(step.needs)
        .setCondition(step.when)
        .setMaxRetries(maxRetries)
        .setTimeout(timeout)
        .setAdapter(null) // Adapter will be resolved later by StepExecutor
        .build();
    });
  }

  /**
   * Create ContextStore for workflow execution
   */
  private createContextStore(
    workflow: ParsedWorkflow,
    options: ExecutionOptions
  ): ContextStore {
    // Use metadata object if available, otherwise use top-level fields
    const name = workflow.metadata?.name || workflow.name || 'unnamed-workflow';
    const description = workflow.metadata?.description || workflow.description;
    const tags = workflow.metadata?.tags || workflow.tags;
    const owner = workflow.metadata?.owner || workflow.owner;
    const version = workflow.metadata?.version || workflow.version;
    
    return new ContextStore({
      executionId: this.executionId,
      workflowId: name,
      workflowName: name,
      version,
      description,
      tags,
      owner,
      inputs: options.inputs,
      secrets: options.secrets,
      env: {
        ...(workflow.context || {}),
        ...options.env,
      },
      metadata: {
        createdAt: workflow.metadata?.createdAt || new Date().toISOString(),
        updatedAt: workflow.metadata?.updatedAt,
        annotations: {},
      },
      context: options.context,
      triggeredBy: options.triggeredBy,
    });
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
      workflowName: workflow.name || 'unnamed-workflow',
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
   * Parse timeout string to milliseconds
   * @param timeout - Timeout string like "30s", "5m", "1h"
   * @returns Timeout in milliseconds
   */
  private parseTimeoutString(timeout: string): number {
    const match = timeout.match(/^([0-9]+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${timeout}. Expected format: <number><unit> (e.g., 30s, 5m, 1h)`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported timeout unit: ${unit}`);
    }
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
