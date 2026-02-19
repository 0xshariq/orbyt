/**
 * Workflow Guard
 * 
 * Validates workflow-level concerns:
 * - Circular dependency detection
 * - Step dependency validation
 * - Workflow structure validation
 * 
 * @module guards
 */

import { ParsedStep } from "../types/core-types.js";



/**
 * Workflow validation guard
 */
export class WorkflowGuard {
  /**
   * Validate entire workflow structure
   * 
   * @param steps - Array of workflow steps
   * @throws {Error} If validation fails
   */
  static validate(steps: ParsedStep[]): void {
    this.validateStepIds(steps);
    this.validateDependencies(steps);
    this.detectCircularDependencies(steps);
  }

  /**
   * Validate all step IDs are unique
   * 
   * @param steps - Array of workflow steps
   * @throws {Error} If duplicate IDs found
   */
  private static validateStepIds(steps: ParsedStep[]): void {
    const ids = steps.map(s => s.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    
    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate step IDs found: ${[...new Set(duplicates)].join(', ')}`
      );
    }
  }

  /**
   * Validate all step dependencies exist
   * 
   * @param steps - Array of workflow steps
   * @throws {Error} If dependency references non-existent step
   */
  private static validateDependencies(steps: ParsedStep[]): void {
    const stepIds = new Set(steps.map(s => s.id));
    
    for (const step of steps) {
      for (const depId of step.needs) {
        if (!stepIds.has(depId)) {
          throw new Error(
            `Step '${step.id}' depends on non-existent step '${depId}'`
          );
        }
      }
    }
  }

  /**
   * Detect circular dependencies in workflow
   * 
   * Uses depth-first search with cycle detection.
   * 
   * @param steps - Array of workflow steps
   * @throws {Error} If circular dependency detected
   */
  private static detectCircularDependencies(steps: ParsedStep[]): void {
    // Build adjacency map
    const graph = new Map<string, string[]>();
    for (const step of steps) {
      graph.set(step.id, step.needs);
    }

    // Track visited nodes during DFS
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const dfs = (stepId: string, path: string[]): void => {
      if (visiting.has(stepId)) {
        // Found cycle
        const cycleStart = path.indexOf(stepId);
        const cycle = [...path.slice(cycleStart), stepId];
        throw new Error(
          `Circular dependency detected: ${cycle.join(' -> ')}`
        );
      }

      if (visited.has(stepId)) {
        return; // Already processed
      }

      visiting.add(stepId);
      const dependencies = graph.get(stepId) || [];
      
      for (const depId of dependencies) {
        dfs(depId, [...path, stepId]);
      }

      visiting.delete(stepId);
      visited.add(stepId);
    };

    // Check from each step
    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id, []);
      }
    }
  }

  /**
   * Calculate topological order (execution order respecting dependencies)
   * 
   * @param steps - Array of workflow steps
   * @returns Steps ordered by dependencies
   * @throws {Error} If circular dependency exists
   */
  static getExecutionOrder(steps: ParsedStep[]): ParsedStep[] {
    // Build adjacency map and in-degree count
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const stepMap = new Map<string, ParsedStep>();

    for (const step of steps) {
      stepMap.set(step.id, step);
      graph.set(step.id, step.needs);
      inDegree.set(step.id, 0);
    }

    // Count in-degrees
    for (const step of steps) {
      for (const depId of step.needs) {
        inDegree.set(depId, (inDegree.get(depId) || 0) + 1);
      }
    }

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const result: ParsedStep[] = [];

    // Start with nodes that have no dependencies
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }

    while (queue.length > 0) {
      const stepId = queue.shift()!;
      const step = stepMap.get(stepId)!;
      result.push(step);

      // Process dependents
      for (const [otherId, deps] of graph.entries()) {
        if (deps.includes(stepId)) {
          const newDegree = (inDegree.get(otherId) || 0) - 1;
          inDegree.set(otherId, newDegree);
          
          if (newDegree === 0) {
            queue.push(otherId);
          }
        }
      }
    }

    // Check if all steps were processed
    if (result.length !== steps.length) {
      throw new Error(
        'Circular dependency detected - cannot determine execution order'
      );
    }

    return result;
  }

  /**
   * Get all steps that depend on a given step
   * 
   * @param stepId - Step ID to check
   * @param steps - Array of workflow steps
   * @returns Array of step IDs that depend on the given step
   */
  static getDependents(stepId: string, steps: ParsedStep[]): string[] {
    return steps
      .filter(step => step.needs.includes(stepId))
      .map(step => step.id);
  }

  /**
   * Get all dependencies of a step (recursive)
   * 
   * @param stepId - Step ID to check
   * @param steps - Array of workflow steps
   * @returns Set of all transitive dependencies
   */
  static getAllDependencies(stepId: string, steps: ParsedStep[]): Set<string> {
    const stepMap = new Map(steps.map(s => [s.id, s]));
    const dependencies = new Set<string>();

    const collect = (id: string): void => {
      const step = stepMap.get(id);
      if (!step) return;

      for (const depId of step.needs) {
        if (!dependencies.has(depId)) {
          dependencies.add(depId);
          collect(depId);
        }
      }
    };

    collect(stepId);
    return dependencies;
  }
}
