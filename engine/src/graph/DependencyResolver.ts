/**
 * DependencyResolver
 * 
 * Builds the dependency graph from workflow steps.
 * This is pure analysis - NO execution, NO ordering, NO retries.
 * 
 * Responsibilities:
 * 1. Read the `needs` field from each step
 * 2. Build edges between steps (stepId → dependencies)
 * 3. Detect missing step references (fail fast)
 * 4. Validate that all dependencies exist
 * 
 * What it does NOT do:
 * - Does NOT check for cycles (that's CycleDetector's job)
 * - Does NOT order steps (that's TopologicalSort's job)
 * - Does NOT execute anything (that's StepExecutor's job)
 * - Does NOT manage state (that's ExecutionState's job)
 * 
 * This is about correctness, not scheduling.
 */

import { WorkflowValidationError } from '@dev-ecosystem/core';
import { ExecutionNode } from '../execution/ExecutionNode.js';

/**
 * Represents a directed edge in the dependency graph
 */
export interface DependencyEdge {
  /** The step that depends on another */
  readonly from: string;
  /** The step that must complete first */
  readonly to: string;
}

/**
 * The complete dependency graph structure
 */
export interface DependencyGraph {
  /** All execution nodes indexed by stepId */
  readonly nodes: ReadonlyMap<string, ExecutionNode>;
  /** All dependency edges */
  readonly edges: readonly DependencyEdge[];
  /** Adjacency list: stepId → list of dependencies */
  readonly adjacencyList: ReadonlyMap<string, readonly string[]>;
  /** Reverse adjacency list: stepId → list of dependents */
  readonly reverseDependencies: ReadonlyMap<string, readonly string[]>;
}

/**
 * Resolves dependencies between workflow steps.
 * Pure function - takes nodes, returns validated graph.
 */
export class DependencyResolver {
  /**
   * Build the dependency graph from execution nodes.
   * Validates that all dependencies exist and builds edge list.
   * 
   * @param nodes - Array of execution nodes from workflow
   * @returns Validated dependency graph
   * @throws WorkflowValidationError if dependencies are invalid
   */
  static resolve(nodes: ExecutionNode[]): DependencyGraph {
    // Step 1: Build node map for quick lookup
    const nodeMap = new Map<string, ExecutionNode>();
    for (const node of nodes) {
      if (nodeMap.has(node.stepId)) {
        throw new WorkflowValidationError(
          `Duplicate step ID found: ${node.stepId}`,
          { stepId: node.stepId, hint: 'Each step must have a unique ID' }
        );
      }
      nodeMap.set(node.stepId, node);
    }

    // Step 2: Validate dependencies and build edges
    const edges: DependencyEdge[] = [];
    const adjacencyList = new Map<string, string[]>();
    const reverseDependencies = new Map<string, string[]>();

    // Initialize adjacency lists for all nodes
    for (const node of nodes) {
      adjacencyList.set(node.stepId, []);
      reverseDependencies.set(node.stepId, []);
    }

    // Build edges and validate references
    for (const node of nodes) {
      for (const dependency of node.dependencies) {
        // Validate that the dependency exists
        if (!nodeMap.has(dependency)) {
          throw new WorkflowValidationError(
            `Step "${node.stepId}" depends on non-existent step "${dependency}"`,
            {
              stepId: node.stepId,
              missingDependency: dependency,
              availableSteps: Array.from(nodeMap.keys()),
              hint: `Check that "${dependency}" is spelled correctly and exists in the workflow`,
            }
          );
        }

        // Self-dependency check
        if (node.stepId === dependency) {
          throw new WorkflowValidationError(
            `Step "${node.stepId}" cannot depend on itself`,
            {
              stepId: node.stepId,
              hint: 'Remove self-reference from needs field',
            }
          );
        }

        // Create edge
        edges.push({
          from: node.stepId,
          to: dependency,
        });

        // Update adjacency list (stepId → dependencies)
        adjacencyList.get(node.stepId)!.push(dependency);

        // Update reverse dependencies (dependency → dependents)
        reverseDependencies.get(dependency)!.push(node.stepId);
      }
    }

    // Step 3: Freeze collections for immutability
    const frozenAdjacencyList = new Map<string, readonly string[]>();
    for (const [stepId, deps] of adjacencyList) {
      frozenAdjacencyList.set(stepId, Object.freeze([...deps]));
    }

    const frozenReverseDependencies = new Map<string, readonly string[]>();
    for (const [stepId, deps] of reverseDependencies) {
      frozenReverseDependencies.set(stepId, Object.freeze([...deps]));
    }

    return {
      nodes: nodeMap,
      edges: Object.freeze(edges),
      adjacencyList: frozenAdjacencyList,
      reverseDependencies: frozenReverseDependencies,
    };
  }

  /**
   * Get all steps that have no dependencies (entry points).
   * These can be executed immediately.
   * 
   * @param graph - The dependency graph
   * @returns Array of step IDs with no dependencies
   */
  static getEntryPoints(graph: DependencyGraph): string[] {
    const entryPoints: string[] = [];
    
    for (const [stepId, dependencies] of graph.adjacencyList) {
      if (dependencies.length === 0) {
        entryPoints.push(stepId);
      }
    }

    return entryPoints;
  }

  /**
   * Get all steps that have no dependents (exit points).
   * These are the final steps in the workflow.
   * 
   * @param graph - The dependency graph
   * @returns Array of step IDs with no dependents
   */
  static getExitPoints(graph: DependencyGraph): string[] {
    const exitPoints: string[] = [];
    
    for (const [stepId, dependents] of graph.reverseDependencies) {
      if (dependents.length === 0) {
        exitPoints.push(stepId);
      }
    }

    return exitPoints;
  }

  /**
   * Calculate the in-degree for each node (number of dependencies).
   * Useful for topological sorting algorithms like Kahn's.
   * 
   * @param graph - The dependency graph
   * @returns Map of stepId → in-degree
   */
  static calculateInDegrees(graph: DependencyGraph): Map<string, number> {
    const inDegrees = new Map<string, number>();

    for (const [stepId, dependencies] of graph.adjacencyList) {
      inDegrees.set(stepId, dependencies.length);
    }

    return inDegrees;
  }

  /**
   * Calculate the out-degree for each node (number of dependents).
   * 
   * @param graph - The dependency graph
   * @returns Map of stepId → out-degree
   */
  static calculateOutDegrees(graph: DependencyGraph): Map<string, number> {
    const outDegrees = new Map<string, number>();

    for (const [stepId, dependents] of graph.reverseDependencies) {
      outDegrees.set(stepId, dependents.length);
    }

    return outDegrees;
  }
}
