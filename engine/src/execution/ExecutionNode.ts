/**
 * ExecutionNode
 * 
 * Pure data model representing a single step in the execution DAG.
 * This is deliberately "boring" - it holds data, not logic.
 * 
 * NO EXECUTION LOGIC HERE. This is the blueprint, not the builder.
 * 
 * Purpose:
 * - Model a step and its relationships
 * - Store resolved adapter reference
 * - Hold metadata for execution (retry, timeout, etc.)
 * - Track dependencies between steps
 * 
 * What it IS NOT:
 * - Not an executor (that's StepExecutor's job)
 * - Not a state machine (that's ExecutionState's job)
 * - Not a scheduler (that's WorkflowExecutor's job)
 */

import type { Adapter } from '@dev-ecosystem/core';

/**
 * Execution state for a single step
 */
export type ExecutionStatus = 
  | 'pending'      // Not started yet
  | 'running'      // Currently executing
  | 'completed'    // Successfully finished
  | 'failed'       // Execution failed
  | 'skipped';     // Skipped due to condition or failure

/**
 * Pure data model for an execution node in the DAG.
 * Contains only data - no behavior, no methods (except maybe toString for debugging).
 */
export interface ExecutionNode {
  /**
   * Unique identifier for this step (from workflow schema)
   */
  readonly stepId: string;

  /**
   * Step IDs this step depends on (from `needs` field)
   */
  readonly dependencies: readonly string[];

  /**
   * The resolved adapter instance that will execute this step
   * This is set during execution planning when adapters are resolved
   */
  readonly adapter: Adapter | null;

  /**
   * Uses clause - adapter reference from workflow schema (e.g., "fs.read")
   */
  readonly uses: string;

  /**
   * Input parameters for the adapter
   */
  readonly input: Record<string, unknown>;

  /**
   * Optional conditional expression
   * If present and evaluates to false, this step is skipped
   */
  readonly condition?: string;

  /**
   * Execution metadata
   */
  readonly metadata: ExecutionNodeMetadata;
}

/**
 * Metadata about how a step should be executed.
 * This is data ABOUT execution, not execution itself.
 */
export interface ExecutionNodeMetadata {
  /**
   * Maximum number of retry attempts (default: 0)
   */
  readonly maxRetries: number;

  /**
   * Timeout in milliseconds
   * If not specified, inherits from workflow-level timeout
   */
  readonly timeout?: number;

  /**
   * Whether this step runs conditionally
   */
  readonly hasCondition: boolean;

  /**
   * Phase number (from topological sort)
   * Steps in the same phase can run in parallel
   */
  phase?: number;
}

/**
 * Builder for creating ExecutionNode instances.
 * This makes construction cleaner and validates required fields.
 */
export class ExecutionNodeBuilder {
  private stepId?: string;
  private dependencies: string[] = [];
  private adapter: Adapter | null = null;
  private uses?: string;
  private input: Record<string, unknown> = {};
  private condition?: string;
  private maxRetries: number = 0;
  private timeout?: number;
  private phase?: number;

  setStepId(id: string): this {
    this.stepId = id;
    return this;
  }

  setDependencies(deps: string[]): this {
    this.dependencies = [...deps];
    return this;
  }

  setAdapter(adapter: Adapter | null): this {
    this.adapter = adapter;
    return this;
  }

  setUses(uses: string): this {
    this.uses = uses;
    return this;
  }

  setInput(input: Record<string, unknown>): this {
    this.input = { ...input };
    return this;
  }

  setCondition(condition: string | undefined): this {
    this.condition = condition;
    return this;
  }

  setMaxRetries(retries: number): this {
    this.maxRetries = Math.max(0, retries);
    return this;
  }

  setTimeout(timeout: number | undefined): this {
    this.timeout = timeout;
    return this;
  }

  setPhase(phase: number): this {
    this.phase = phase;
    return this;
  }

  build(): ExecutionNode {
    if (!this.stepId) {
      throw new Error('ExecutionNode requires stepId');
    }
    if (!this.uses) {
      throw new Error('ExecutionNode requires uses (adapter reference)');
    }

    return {
      stepId: this.stepId,
      dependencies: Object.freeze([...this.dependencies]),
      adapter: this.adapter,
      uses: this.uses,
      input: { ...this.input },
      condition: this.condition,
      metadata: {
        maxRetries: this.maxRetries,
        timeout: this.timeout,
        hasCondition: !!this.condition,
        phase: this.phase,
      },
    };
  }
}

/**
 * Factory function for creating ExecutionNode builder
 */
export function createExecutionNode(): ExecutionNodeBuilder {
  return new ExecutionNodeBuilder();
}
