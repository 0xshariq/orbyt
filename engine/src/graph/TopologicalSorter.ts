/**
 * TopologicalSorter
 * 
 * Performs topological sorting on a dependency graph using Kahn's algorithm.
 * This is what makes parallel execution possible.
 * 
 * Purpose:
 * - Convert DAG into execution phases
 * - Group independent steps into phases (parallelization!)
 * - Ensure dependencies are satisfied before execution
 * - This is "the moment Orbyt becomes real" - we go from sequential to parallel
 * 
 * Algorithm: Kahn's Algorithm (BFS-based)
 * 1. Start with all nodes that have no dependencies (in-degree = 0)
 * 2. Remove them and their edges, collect them as Phase 1
 * 3. Find new nodes with in-degree = 0 (Phase 2)
 * 4. Repeat until all nodes are processed
 * 
 * Result: [['validate'], ['process', 'lint'], ['upload']]
 *         Phase 1: validate (runs alone)
 *         Phase 2: process and lint (run in parallel!)
 *         Phase 3: upload (runs after both complete)
 * 
 * What it does NOT do:
 * - Does NOT execute steps (that's StepExecutor's job)
 * - Does NOT manage state (that's ExecutionState's job)
 * - Does NOT add retries (that's StepExecutor's job)
 */

import { WorkflowValidationError } from '@dev-ecosystem/core';
import { DependencyGraph, DependencyResolver } from './DependencyResolver.js';

/**
 * Result of topological sorting
 */
export interface TopologicalSortResult {
  /** 
   * Execution phases - each inner array is a phase,
   * steps in the same phase can run in parallel
   */
  readonly phases: readonly (readonly string[])[];
  
  /**
   * Total number of phases
   */
  readonly phaseCount: number;

  /**
   * Map of stepId → phase number (0-indexed)
   */
  readonly stepPhases: ReadonlyMap<string, number>;
}

/**
 * Performs topological sorting to determine execution order.
 * Pure function - takes validated graph, returns execution phases.
 */
export class TopologicalSorter {
  /**
   * Sort the dependency graph into execution phases using Kahn's algorithm.
   * 
   * This is BFS-based and naturally groups independent steps into phases.
   * 
   * @param graph - The dependency graph (must be acyclic)
   * @returns Topological sort result with execution phases
   * @throws WorkflowValidationError if graph contains cycles
   */
  static sort(graph: DependencyGraph): TopologicalSortResult {
    // Calculate in-degrees (number of dependencies for each node)
    const inDegrees = DependencyResolver.calculateInDegrees(graph);
    
    // Track which nodes have been processed
    const processed = new Set<string>();
    
    // Store phases
    const phases: string[][] = [];
    
    // Map of stepId → phase number
    const stepPhases = new Map<string, number>();

    // Kahn's algorithm
    let currentPhaseIndex = 0;
    
    while (processed.size < graph.nodes.size) {
      // Find all nodes with in-degree 0 (ready to execute)
      const currentPhase: string[] = [];
      
      for (const [stepId, inDegree] of inDegrees) {
        if (inDegree === 0 && !processed.has(stepId)) {
          currentPhase.push(stepId);
        }
      }

      // If no nodes are ready but we haven't processed everything,
      // there must be a cycle
      if (currentPhase.length === 0 && processed.size < graph.nodes.size) {
        const remaining = Array.from(graph.nodes.keys()).filter(
          (id) => !processed.has(id)
        );
        
        throw new WorkflowValidationError(
          'Cannot create execution plan: circular dependency detected during topological sort',
          {
            remainingSteps: remaining,
            hint: 'Use CycleDetector.detectAndThrow() before calling TopologicalSorter.sort()',
          }
        );
      }

      // Process current phase
      for (const stepId of currentPhase) {
        processed.add(stepId);
        stepPhases.set(stepId, currentPhaseIndex);

        // Reduce in-degree of all dependents
        const dependents = graph.reverseDependencies.get(stepId) || [];
        for (const dependent of dependents) {
          const currentInDegree = inDegrees.get(dependent)!;
          inDegrees.set(dependent, currentInDegree - 1);
        }
      }

      if (currentPhase.length > 0) {
        phases.push(currentPhase);
        currentPhaseIndex++;
      }
    }

    return {
      phases: phases.map((phase) => Object.freeze([...phase])),
      phaseCount: phases.length,
      stepPhases,
    };
  }

  /**
   * Sort using DFS-based algorithm (alternative to Kahn's).
   * This produces a valid topological order but doesn't naturally
   * group into phases like Kahn's does.
   * 
   * Use this if you need a single linear order rather than phases.
   * 
   * @param graph - The dependency graph
   * @returns Array of step IDs in topological order
   */
  static sortLinear(graph: DependencyGraph): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);

      // Visit all dependencies first
      const dependencies = graph.adjacencyList.get(nodeId) || [];
      for (const dependency of dependencies) {
        visit(dependency);
      }

      // Add to result after visiting dependencies
      result.push(nodeId);
    };

    // Visit all nodes
    for (const nodeId of graph.nodes.keys()) {
      visit(nodeId);
    }

    return result;
  }

  /**
   * Calculate the critical path through the dependency graph.
   * The critical path is the longest path from entry to exit points.
   * 
   * This is useful for:
   * - Estimating minimum workflow execution time
   * - Identifying bottlenecks
   * - Optimizing parallelization
   * 
   * @param graph - The dependency graph
   * @param stepDurations - Map of stepId → estimated duration (ms)
   * @returns Critical path information
   */
  static calculateCriticalPath(
    graph: DependencyGraph,
    stepDurations: Map<string, number>
  ): CriticalPathResult {
    const sortResult = this.sort(graph);
    const earliestStart = new Map<string, number>();
    const latestStart = new Map<string, number>();

    // Forward pass: calculate earliest start times
    for (const phase of sortResult.phases) {
      for (const stepId of phase) {
        const dependencies = graph.adjacencyList.get(stepId) || [];
        
        if (dependencies.length === 0) {
          earliestStart.set(stepId, 0);
        } else {
          let maxEarliest = 0;
          for (const dep of dependencies) {
            const depEarliest = earliestStart.get(dep)!;
            const depDuration = stepDurations.get(dep) || 0;
            maxEarliest = Math.max(maxEarliest, depEarliest + depDuration);
          }
          earliestStart.set(stepId, maxEarliest);
        }
      }
    }

    // Find maximum earliest start (workflow end time)
    let workflowDuration = 0;
    for (const [stepId, earliest] of earliestStart) {
      const duration = stepDurations.get(stepId) || 0;
      workflowDuration = Math.max(workflowDuration, earliest + duration);
    }

    // Backward pass: calculate latest start times
    const exitPoints = DependencyResolver.getExitPoints(graph);
    for (const exitPoint of exitPoints) {
      const duration = stepDurations.get(exitPoint) || 0;
      latestStart.set(exitPoint, workflowDuration - duration);
    }

    // Process phases in reverse
    for (let i = sortResult.phases.length - 1; i >= 0; i--) {
      for (const stepId of sortResult.phases[i]) {
        if (latestStart.has(stepId)) {
          continue; // Already set as exit point
        }

        const dependents = graph.reverseDependencies.get(stepId) || [];
        const duration = stepDurations.get(stepId) || 0;
        
        let minLatest = workflowDuration;
        for (const dependent of dependents) {
          const dependentLatest = latestStart.get(dependent)!;
          minLatest = Math.min(minLatest, dependentLatest);
        }
        
        latestStart.set(stepId, minLatest - duration);
      }
    }

    // Calculate slack (float) for each step
    const slack = new Map<string, number>();
    for (const stepId of graph.nodes.keys()) {
      const earliest = earliestStart.get(stepId)!;
      const latest = latestStart.get(stepId)!;
      slack.set(stepId, latest - earliest);
    }

    // Find critical path (steps with zero slack)
    const criticalPath: string[] = [];
    for (const [stepId, slackValue] of slack) {
      if (slackValue === 0) {
        criticalPath.push(stepId);
      }
    }

    return {
      criticalPath,
      workflowDuration,
      earliestStart,
      latestStart,
      slack,
    };
  }
}

/**
 * Result of critical path analysis
 */
export interface CriticalPathResult {
  /** Steps on the critical path (zero slack) */
  readonly criticalPath: readonly string[];
  /** Estimated total workflow duration */
  readonly workflowDuration: number;
  /** Earliest start time for each step */
  readonly earliestStart: ReadonlyMap<string, number>;
  /** Latest start time for each step without delaying workflow */
  readonly latestStart: ReadonlyMap<string, number>;
  /** Slack (float) for each step - how much it can be delayed */
  readonly slack: ReadonlyMap<string, number>;
}
