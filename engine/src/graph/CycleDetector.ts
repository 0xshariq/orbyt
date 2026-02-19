/**
 * CycleDetector
 * 
 * Detects cycles in the dependency graph using Depth-First Search (DFS).
 * This is about VALIDATION - fail fast with clear error messages.
 * 
 * Purpose:
 * - Detect circular dependencies before execution
 * - Provide clear error messages showing the cycle path
 * - Fail fast - prevent impossible execution plans
 * 
 * Algorithm: DFS with three-color marking
 * - WHITE (unvisited): Node not yet explored
 * - GRAY (visiting): Node currently in DFS path (on stack)
 * - BLACK (visited): Node fully explored, all descendants visited
 * 
 * A cycle exists if we encounter a GRAY node during traversal.
 * 
 * What it does NOT do:
 * - Does NOT order the graph (that's TopologicalSort's job)
 * - Does NOT execute anything (that's StepExecutor's job)
 * - Does NOT schedule steps (that's WorkflowExecutor's job)
 */

import { WorkflowValidationError } from '@dev-ecosystem/core';
import { CycleDetectionResult, DependencyGraph, VisitState } from '../types/core-types.js';

/**
 * Detects cycles in dependency graphs.
 * Pure function - takes graph, returns cycle information.
 */
export class CycleDetector {
  /**
   * Check if the graph contains a cycle.
   * Uses DFS with three-color marking.
   * 
   * @param graph - The dependency graph to check
   * @returns Cycle detection result
   */
  static detect(graph: DependencyGraph): CycleDetectionResult {
    const visitState = new Map<string, VisitState>();
    const parent = new Map<string, string>();
    
    // Initialize all nodes as unvisited
    for (const stepId of graph.nodes.keys()) {
      visitState.set(stepId, VisitState.WHITE);
    }

    // Try DFS from each unvisited node
    for (const stepId of graph.nodes.keys()) {
      if (visitState.get(stepId) === VisitState.WHITE) {
        const result = this.dfs(stepId, graph, visitState, parent);
        if (result.hasCycle) {
          return result;
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Depth-first search to detect cycles.
   * 
   * @param nodeId - Current node being visited
   * @param graph - The dependency graph
   * @param visitState - Visit state for each node
   * @param parent - Parent pointers for cycle reconstruction
   * @returns Cycle detection result
   */
  private static dfs(
    nodeId: string,
    graph: DependencyGraph,
    visitState: Map<string, VisitState>,
    parent: Map<string, string>
  ): CycleDetectionResult {
    // Mark current node as being visited (GRAY)
    visitState.set(nodeId, VisitState.GRAY);

    // Visit all dependencies (outgoing edges)
    const dependencies = graph.adjacencyList.get(nodeId) || [];
    
    for (const dependency of dependencies) {
      const state = visitState.get(dependency);

      if (state === VisitState.GRAY) {
        // Found a cycle! Reconstruct the cycle path
        const cyclePath = this.reconstructCycle(nodeId, dependency, parent);
        return {
          hasCycle: true,
          cyclePath: Object.freeze([...cyclePath, dependency]), // Complete the cycle
        };
      }

      if (state === VisitState.WHITE) {
        // Unvisited node, explore it
        parent.set(dependency, nodeId);
        const result = this.dfs(dependency, graph, visitState, parent);
        if (result.hasCycle) {
          return result;
        }
      }

      // BLACK nodes are already fully explored, skip them
    }

    // All descendants explored, mark as fully visited (BLACK)
    visitState.set(nodeId, VisitState.BLACK);

    return { hasCycle: false };
  }

  /**
   * Reconstruct the cycle path from parent pointers.
   * 
   * @param start - Node where cycle was detected
   * @param cycleNode - The GRAY node that created the cycle
   * @param parent - Parent pointers
   * @returns The cycle path
   */
  private static reconstructCycle(
    start: string,
    cycleNode: string,
    parent: Map<string, string>
  ): string[] {
    const cycle: string[] = [start];
    let current = start;

    // Walk back through parents until we reach the cycle node
    while (current !== cycleNode) {
      const parentNode = parent.get(current);
      if (!parentNode) {
        // This shouldn't happen in valid DFS, but handle it gracefully
        break;
      }
      cycle.unshift(parentNode);
      current = parentNode;
    }

    return cycle;
  }

  /**
   * Check for cycles and throw if found (convenience method).
   * This is the "fail fast" version.
   * 
   * @param graph - The dependency graph to check
   * @throws WorkflowValidationError if a cycle is detected
   */
  static detectAndThrow(graph: DependencyGraph): void {
    const result = this.detect(graph);

    if (result.hasCycle && result.cyclePath) {
      const cycleStr = result.cyclePath.join(' → ');
      
      throw new WorkflowValidationError(
        `Circular dependency detected: ${cycleStr}`,
        {
          cyclePath: result.cyclePath,
          hint: 'Check the "needs" fields in your workflow. Steps cannot depend on each other in a cycle.',
          affectedSteps: result.cyclePath,
        }
      );
    }
  }

  /**
   * Find all strongly connected components (SCCs) in the graph.
   * This is more advanced than simple cycle detection - it finds
   * all groups of nodes that form cycles with each other.
   * 
   * Uses Tarjan's algorithm.
   * 
   * @param graph - The dependency graph
   * @returns Array of strongly connected components (each is an array of step IDs)
   */
  static findStronglyConnectedComponents(graph: DependencyGraph): string[][] {
    const index = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const onStack = new Map<string, boolean>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let currentIndex = 0;

    for (const nodeId of graph.nodes.keys()) {
      if (!index.has(nodeId)) {
        this.strongConnect(
          nodeId,
          graph,
          index,
          lowLink,
          onStack,
          stack,
          sccs,
          currentIndex
        );
      }
    }

    return sccs;
  }

  /**
   * Tarjan's SCC algorithm helper
   */
  private static strongConnect(
    nodeId: string,
    graph: DependencyGraph,
    index: Map<string, number>,
    lowLink: Map<string, number>,
    onStack: Map<string, boolean>,
    stack: string[],
    sccs: string[][],
    currentIndex: number
  ): number {
    // Set depth index and low link
    index.set(nodeId, currentIndex);
    lowLink.set(nodeId, currentIndex);
    currentIndex++;
    stack.push(nodeId);
    onStack.set(nodeId, true);

    // Visit all dependencies
    const dependencies = graph.adjacencyList.get(nodeId) || [];
    for (const dependency of dependencies) {
      if (!index.has(dependency)) {
        // Successor has not been visited; recurse
        currentIndex = this.strongConnect(
          dependency,
          graph,
          index,
          lowLink,
          onStack,
          stack,
          sccs,
          currentIndex
        );
        lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, lowLink.get(dependency)!));
      } else if (onStack.get(dependency)) {
        // Successor is on the stack, hence in current SCC
        lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, index.get(dependency)!));
      }
    }

    // If nodeId is a root node, pop the stack and output SCC
    if (lowLink.get(nodeId) === index.get(nodeId)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.set(w, false);
        scc.push(w);
      } while (w !== nodeId);

      // Only add SCCs with more than one node (actual cycles)
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }

    return currentIndex;
  }
}
