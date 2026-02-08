/**
 * Execution Plan
 * 
 * Creates an execution plan from workflow steps.
 * Handles dependency resolution and parallel execution grouping.
 * 
 * @module execution
 */

import type { ParsedStep } from '../parser/StepParser.js';
import { WorkflowGuard } from '../guards/WorkflowGuard.js';

/**
 * Execution phase (group of steps that can run in parallel)
 */
export interface ExecutionPhase {
  /** Phase number (0-indexed) */
  phase: number;
  
  /** Steps that can execute in parallel */
  steps: ParsedStep[];
  
  /** Combined phase timeout (max of all step timeouts) */
  timeout?: number;
}

/**
 * Complete execution plan for a workflow
 */
export interface ExecutionPlan {
  /** Ordered phases of execution */
  phases: ExecutionPhase[];
  
  /** Total number of steps */
  totalSteps: number;
  
  /** Maximum parallelism (largest phase size) */
  maxParallelism: number;
  
  /** Critical path length (minimum phases needed) */
  criticalPathLength: number;
}

/**
 * Execution plan builder
 */
export class ExecutionPlanner {
  /**
   * Create execution plan from workflow steps
   * 
   * Groups steps into phases where steps in the same phase
   * have no dependencies on each other and can run in parallel.
   * 
   * @param steps - Workflow steps
   * @returns Execution plan with phases
   */
  static plan(steps: ParsedStep[]): ExecutionPlan {
    // Validate workflow first
    WorkflowGuard.validate(steps);

    // Build dependency graph
    const phases: ExecutionPhase[] = [];
    const processed = new Set<string>();

    let phaseNum = 0;

    while (processed.size < steps.length) {
      // Find steps ready to execute (all dependencies processed)
      const readySteps = steps.filter(step => {
        if (processed.has(step.id)) return false;
        return step.needs.every(depId => processed.has(depId));
      });

      if (readySteps.length === 0) {
        throw new Error(
          'Cannot create execution plan - circular dependencies or missing steps'
        );
      }

      // Create phase
      const phase: ExecutionPhase = {
        phase: phaseNum++,
        steps: readySteps,
        timeout: this.calculatePhaseTimeout(readySteps),
      };

      phases.push(phase);

      // Mark as processed
      for (const step of readySteps) {
        processed.add(step.id);
      }
    }

    return {
      phases,
      totalSteps: steps.length,
      maxParallelism: Math.max(...phases.map(p => p.steps.length)),
      criticalPathLength: phases.length,
    };
  }

  /**
   * Calculate timeout for a phase (max of all step timeouts)
   */
  private static calculatePhaseTimeout(steps: ParsedStep[]): number | undefined {
    const timeouts = steps
      .map(s => s.timeout ? this.parseTimeoutString(s.timeout) : undefined)
      .filter((t): t is number => t !== undefined);
    
    return timeouts.length > 0 ? Math.max(...timeouts) : undefined;
  }

  /**
   * Parse timeout string to milliseconds
   * @param timeout - Timeout string like "30s", "5m", "1h"
   * @returns Timeout in milliseconds
   */
  private static parseTimeoutString(timeout: string): number {
    const match = timeout.match(/^([0-9]+)(ms|s|m|h|d)$/);
    if (!match) {
      return 30000; // Default 30s if invalid format
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
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 30000;
    }
  }

  /**
   * Get execution order (flattened phases)
   * 
   * @param plan - Execution plan
   * @returns Flat array of steps in execution order
   */
  static getFlatOrder(plan: ExecutionPlan): ParsedStep[] {
    return plan.phases.flatMap(phase => phase.steps);
  }

  /**
   * Get steps that can execute immediately (phase 0)
   * 
   * @param steps - Workflow steps
   * @returns Steps with no dependencies
   */
  static getInitialSteps(steps: ParsedStep[]): ParsedStep[] {
    return steps.filter(step => step.needs.length === 0);
  }

  /**
   * Get next executable steps after completing current steps
   * 
   * @param allSteps - All workflow steps
   * @param completedStepIds - Set of completed step IDs
   * @returns Steps now ready to execute
   */
  static getNextSteps(
    allSteps: ParsedStep[],
    completedStepIds: Set<string>
  ): ParsedStep[] {
    return allSteps.filter(step => {
      // Skip if already completed
      if (completedStepIds.has(step.id)) return false;
      
      // Check if all dependencies are completed
      return step.needs.every(depId => completedStepIds.has(depId));
    });
  }

  /**
   * Visualize execution plan as text
   * 
   * @param plan - Execution plan
   * @returns Text visualization
   */
  static visualize(plan: ExecutionPlan): string {
    let output = '📋 Execution Plan\n';
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    output += `Total Steps: ${plan.totalSteps}\n`;
    output += `Phases: ${plan.phases.length}\n`;
    output += `Max Parallelism: ${plan.maxParallelism}\n`;
    output += `Critical Path: ${plan.criticalPathLength} phases\n\n`;

    for (const phase of plan.phases) {
      output += `Phase ${phase.phase}: `;
      output += `[${phase.steps.map(s => s.id).join(', ')}]`;
      if (phase.timeout) {
        output += ` (timeout: ${phase.timeout}ms)`;
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Check if workflow can be parallelized
   * 
   * @param steps - Workflow steps
   * @returns True if any steps can run in parallel
   */
  static canParallelize(steps: ParsedStep[]): boolean {
    const plan = this.plan(steps);
    return plan.phases.some(phase => phase.steps.length > 1);
  }
}
