/**
 * Execution Plan
 * 
 * PURE COORDINATION - NO EXECUTION LOGIC.
 * 
 * This coordinates DependencyResolver, CycleDetector, and TopologicalSorter
 * to create a valid execution plan. It answers:
 * - What runs?
 * - In what order?
 * - What can run in parallel?
 * - What are the constraints?
 * 
 * This is "designing the map, not driving the car."
 * Execution happens elsewhere (StepExecutor, WorkflowExecutor).
 * 
 * @module execution
 */

import { ExecutionNode } from './ExecutionNode.js';
import {
  DependencyResolver,
  CycleDetector,
  TopologicalSorter,
  type DependencyGraph,
  type TopologicalSortResult,
} from '../graph/DependencyGraph.js';

/**
 * Execution phase (group of steps that can run in parallel)
 */
export interface ExecutionPhase {
  /** Phase number (0-indexed) */
  readonly phase: number;
  
  /** Nodes that can execute in parallel */
  readonly nodes: readonly ExecutionNode[];
  
  /** Combined phase timeout (max of all node timeouts) */
  readonly timeout?: number;
}

/**
 * Complete execution plan for a workflow.
 * This is a blueprint for execution - it contains NO execution state.
 */
export interface ExecutionPlan {
  /** Ordered phases of execution */
  readonly phases: readonly ExecutionPhase[];
  
  /** The validated dependency graph */
  readonly graph: DependencyGraph;
  
  /** Total number of steps */
  readonly totalSteps: number;
  
  /** Maximum parallelism (largest phase size) */
  readonly maxParallelism: number;
  
  /** Critical path length (minimum phases needed) */
  readonly criticalPathLength: number;

  /** Topological sort result */
  readonly sortResult: TopologicalSortResult;
}

/**
 * Execution plan coordinator.
 * This orchestrates graph utilities to create execution plans.
 * 
 * NO EXECUTION LOGIC HERE - only planning and coordination.
 */
export class ExecutionPlanner {
  /**
   * Create execution plan from execution nodes.
   * 
   * This is the main entry point. It:
   * 1. Builds dependency graph (DependencyResolver)
   * 2. Validates no cycles (CycleDetector)
   * 3. Generates execution phases (TopologicalSorter)
   * 4. Packages everything into ExecutionPlan
   * 
   * @param nodes - Array of execution nodes
   * @returns Complete execution plan
   * @throws WorkflowValidationError if dependencies are invalid or cycles exist
   */
  static plan(nodes: ExecutionNode[]): ExecutionPlan {
    // Step 1: Build dependency graph
    const graph = DependencyResolver.resolve(nodes);

    // Step 2: Detect cycles (fail fast)
    CycleDetector.detectAndThrow(graph);

    // Step 3: Topological sort to get execution phases
    const sortResult = TopologicalSorter.sort(graph);

    // Step 4: Build execution phases with nodes and timeouts
    const phases: ExecutionPhase[] = sortResult.phases.map((stepIds, index) => {
      const phaseNodes = stepIds.map((stepId) => graph.nodes.get(stepId)!);
      
      return {
        phase: index,
        nodes: Object.freeze(phaseNodes),
        timeout: this.calculatePhaseTimeout(phaseNodes),
      };
    });

    // Step 5: Package into execution plan
    return {
      phases: Object.freeze(phases),
      graph,
      totalSteps: nodes.length,
      maxParallelism: Math.max(...phases.map((p) => p.nodes.length), 0),
      criticalPathLength: phases.length,
      sortResult,
    };
  }

  /**
   * Calculate timeout for a phase (max of all node timeouts).
   * If no timeouts specified, returns undefined.
   */
  private static calculatePhaseTimeout(nodes: readonly ExecutionNode[]): number | undefined {
    const timeouts = nodes
      .map((node) => node.metadata.timeout)
      .filter((t): t is number => t !== undefined);
    
    return timeouts.length > 0 ? Math.max(...timeouts) : undefined;
  }

  /**
   * Get execution order (flattened phases).
   * Returns nodes in the order they should be executed.
   * 
   * @param plan - Execution plan
   * @returns Flat array of nodes in execution order
   */
  static getFlatOrder(plan: ExecutionPlan): ExecutionNode[] {
    return plan.phases.flatMap((phase) => [...phase.nodes]);
  }

  /**
   * Get nodes that can execute immediately (phase 0).
   * These are entry points with no dependencies.
   * 
   * @param plan - Execution plan
   * @returns Nodes with no dependencies
   */
  static getInitialNodes(plan: ExecutionPlan): ExecutionNode[] {
    if (plan.phases.length === 0) {
      return [];
    }
    return [...plan.phases[0].nodes];
  }

  /**
   * Get the phase number for a specific step.
   * 
   * @param plan - Execution plan
   * @param stepId - Step ID to look up
   * @returns Phase number (0-indexed) or undefined if not found
   */
  static getPhaseForStep(plan: ExecutionPlan, stepId: string): number | undefined {
    return plan.sortResult.stepPhases.get(stepId);
  }

  /**
   * Visualize execution plan as text.
   * Useful for debugging and understanding execution flow.
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
      output += `[${[...phase.nodes].map((n) => n.stepId).join(', ')}]`;
      if (phase.timeout) {
        output += ` (timeout: ${phase.timeout}ms)`;
      }
      output += '\n';

      // Show adapter references for each node
      for (const node of phase.nodes) {
        output += `  └─ ${node.stepId}: ${node.uses}`;
        if (node.metadata.maxRetries > 0) {
          output += ` (retries: ${node.metadata.maxRetries})`;
        }
        if (node.metadata.hasCondition) {
          output += ` (conditional)`;
        }
        output += '\n';
      }
    }

    return output;
  }

  /**
   * Check if workflow can be parallelized.
   * Returns true if any phase has more than one step.
   * 
   * @param plan - Execution plan
   * @returns True if any steps can run in parallel
   */
  static canParallelize(plan: ExecutionPlan): boolean {
    return plan.phases.some((phase) => phase.nodes.length > 1);
  }

  /**
   * Get dependency chain for a specific step.
   * Returns all steps that must complete before this step can run.
   * 
   * @param plan - Execution plan
   * @param stepId - Step ID to analyze
   * @returns Array of step IDs in dependency order
   */
  static getDependencyChain(plan: ExecutionPlan, stepId: string): string[] {
    const node = plan.graph.nodes.get(stepId);
    if (!node) {
      return [];
    }

    const chain: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);

      const currentNode = plan.graph.nodes.get(id);
      if (!currentNode) {
        return;
      }

      // Visit dependencies first
      for (const dep of currentNode.dependencies) {
        visit(dep);
      }

      chain.push(id);
    };

    visit(stepId);
    return chain;
  }

  /**
   * Calculate estimated execution time based on phase timeouts.
   * This is a rough estimate assuming perfect parallelization.
   * 
   * @param plan - Execution plan
   * @returns Estimated execution time in milliseconds
   */
  static estimateExecutionTime(plan: ExecutionPlan): number {
    let totalTime = 0;

    for (const phase of plan.phases) {
      if (phase.timeout) {
        totalTime += phase.timeout;
      } else {
        // If no timeout specified, use a default estimate
        totalTime += 30000; // 30 seconds default
      }
    }

    return totalTime;
  }
}
