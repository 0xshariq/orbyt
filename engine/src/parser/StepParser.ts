/**
 * Step Parser
 * 
 * Parses individual workflow steps and resolves adapter types.
 * Converts validated step definitions into internal Step objects with semantic validation.
 * 
 * @module parser
 */

import type { StepDefinition as ZodStepDefinition } from '@dev-ecosystem/core';
import { ValidationError, SchemaError, findClosestMatch, isLikelyTypo } from '../errors/index.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import type { ParsedStep } from '../types/core-types.js';

/**
 * Parses individual workflow steps with enhanced validation
 */
export class StepParser {
  /**
   * Parse a step definition into internal representation
   * Enhanced with better validation
   * 
   * @param stepDef - Validated step definition from schema
   * @param stepIndex - Index of the step in the workflow (for error messages)
   * @returns Parsed step object ready for execution
   */
  static parse(stepDef: ZodStepDefinition, stepIndex?: number): ParsedStep {
    const stepPath = stepIndex !== undefined ? `workflow.steps[${stepIndex}]` : 'workflow.steps';

    // Validate required fields
    if (!stepDef.id) {
      throw SchemaError.missingField('id', stepPath);
    }

    // Validate ID format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(stepDef.id)) {
      throw new SchemaError({
        code: 'ORB-S-006' as any,
        message: `Invalid step ID format: "${stepDef.id}"`,
        path: `${stepPath}.id`,
        hint: 'Step IDs must start with a letter and contain only letters, numbers, hyphens, and underscores.',
        severity: 'error' as any,
      });
    }

    if (!stepDef.uses) {
      throw SchemaError.missingField('uses', `${stepPath}.${stepDef.id}`);
    }

    // Resolve adapter type from the 'uses' field (with validation)
    const adapter = this.resolveAdapter(stepDef.uses, `${stepPath}.${stepDef.id}`);

    // Validate conditional expression if present
    if (stepDef.when) {
      this.validateConditionalExpression(stepDef.when, `${stepPath}.${stepDef.id}.when`);
    }

    // Build parsed step
    const parsedStep: ParsedStep = {
      id: stepDef.id,
      adapter,
      action: stepDef.uses,
      input: stepDef.with || {},
      needs: stepDef.needs || [],
      name: stepDef.name,
      when: stepDef.when,
      continueOnError: stepDef.continueOnError || false,
      timeout: stepDef.timeout,
      env: stepDef.env,
      outputs: stepDef.outputs,
    };

    // Copy retry policy if present
    // Note: 'max' is the configuration (maximum retries allowed)
    // 'count' is runtime state (initialized during execution, not from definition)
    if (stepDef.retry) {
      parsedStep.retry = {
        max: stepDef.retry.max,
        backoff: stepDef.retry.backoff as 'linear' | 'exponential' | undefined,
        delay: stepDef.retry.delay,
        // count is initialized to 0 during execution
      };
    }

    return parsedStep;
  }

  /**
   * Resolve adapter type from 'uses' field
   * Enhanced with format validation
   * 
   * Examples:
   *   'http.request.get' -> 'http'
   *   'shell.exec' -> 'shell'
   *   'cli.run' -> 'cli'
   *   'mediaproc.image.resize' -> 'plugin'
   * 
   * @param uses - The 'uses' field from step definition
   * @param stepPath - Path for error messages
   * @returns Adapter type string
   */
  static resolveAdapter(uses: string, stepPath?: string): string {
    // Validate format: must contain at least one dot
    if (!uses.includes('.')) {
      throw new SchemaError({
        code: 'ORB-S-006' as any,
        message: `Invalid action format: "${uses}"`,
        path: stepPath ? `${stepPath}.uses` : 'step.uses',
        hint: 'Action format must be: namespace.action (e.g., "http.request" or "shell.exec")',
        severity: 'error' as any,
      });
    }

    // Extract prefix before first dot
    const prefix = uses.split('.')[0];

    // Built-in adapter types
    const builtInAdapters = ['http', 'shell', 'cli', 'fs', 'webhook'];

    if (builtInAdapters.includes(prefix)) {
      return prefix;
    }

    // Check for common typos in built-in adapters
    const closestAdapter = findClosestMatch(prefix, builtInAdapters, 0.7);
    if (closestAdapter && isLikelyTypo(prefix, closestAdapter)) {
      throw new SchemaError({
        code: 'ORB-V-008' as any,
        message: `Unknown adapter: "${prefix}"`,
        path: stepPath ? `${stepPath}.uses` : 'step.uses',
        hint: `Did you mean "${closestAdapter}"? (Built-in adapters: ${builtInAdapters.join(', ')})`,
        severity: 'error' as any,
      });
    }

    // Everything else is a plugin adapter
    return 'plugin';
  }

  /**
   * Validate conditional expression syntax (basic check)
   * Provides hints for common variable references
   * 
   * @param condition - Conditional expression string
   * @param path - Path for error messages
   */
  private static validateConditionalExpression(condition: string, path: string): void {
    // Check for empty condition
    if (!condition || condition.trim().length === 0) {
      throw new SchemaError({
        code: 'ORB-S-006' as any,
        message: 'Conditional expression cannot be empty',
        path,
        hint: 'Provide a valid expression or remove the "when" field.',
        severity: 'error' as any,
      });
    }

    // Check for common variable reference patterns and provide hints
    const validPrefixes = ['inputs.', 'secrets.', 'steps.', 'context.'];
    const hasVariable = /\$\{([^}]+)\}/.test(condition);

    if (hasVariable) {
      // Extract variables
      const variables = condition.match(/\$\{([^}]+)\}/g) || [];

      for (const variable of variables) {
        const varName = variable.slice(2, -1); // Remove ${ and }
        const hasValidPrefix = validPrefixes.some(prefix => varName.startsWith(prefix));

        if (!hasValidPrefix && !varName.startsWith('env.')) {
          throw new SchemaError({
            code: 'ORB-V-006' as any,
            message: `Invalid variable reference: "${variable}"`,
            path,
            hint: `Variables must start with one of: ${validPrefixes.join(', ')}`,
            severity: 'error' as any,
          });
        }
      }
    }
  }

  /**
   * Parse multiple steps
   * 
   * @param stepDefs - Array of step definitions
   * @returns Array of parsed steps
   */
  static parseAll(stepDefs: ZodStepDefinition[]): ParsedStep[] {
    const logger = LoggerManager.getLogger();
    logger.debug(`[StepParser] Parsing ${stepDefs.length} steps`, {
      stepCount: stepDefs.length,
    });

    const parsed = stepDefs.map((step, index) => this.parse(step, index));

    logger.debug(`[StepParser] Successfully parsed all steps`, {
      stepCount: parsed.length,
      stepIds: parsed.map(s => s.id),
    });

    return parsed;
  }

  /**
   * Validate step IDs are unique
   * 
   * @param steps - Array of parsed steps
   * @throws {ValidationError} If duplicate step IDs found
   */
  static validateUniqueIds(steps: ParsedStep[]): void {
    const idMap = new Map<string, number>();

    steps.forEach((step, index) => {
      if (idMap.has(step.id)) {
        const firstIndex = idMap.get(step.id)!;
        throw new ValidationError({
          code: 'ORB-V-001' as any,
          message: `Duplicate step ID "${step.id}"`,
          path: `workflow.steps[${index}]`,
          hint: `Step ID "${step.id}" was already defined at workflow.steps[${firstIndex}]. Step IDs must be unique.`,
          severity: 'error' as any,
        });
      }
      idMap.set(step.id, index);
    });
  }

  /**
   * Validate step dependencies (needs) refer to valid steps
   * Enhanced with better error messages and suggestions
   * 
   * @param steps - Array of parsed steps
   * @throws {ValidationError} If step references non-existent dependency
   */
  static validateDependencies(steps: ParsedStep[]): void {
    const stepIds = new Set(steps.map(s => s.id));
    const allStepIds = Array.from(stepIds);

    steps.forEach((step, index) => {
      for (const dependency of step.needs) {
        if (!stepIds.has(dependency)) {
          // Try to find similar step IDs
          const suggestion = findClosestMatch(dependency, allStepIds, 0.6);
          const hint = suggestion
            ? `Did you mean "${suggestion}"? Available steps: ${allStepIds.join(', ')}`
            : `Available steps: ${allStepIds.join(', ')}`;

          throw new ValidationError({
            code: 'ORB-V-002' as any,
            message: `Unknown step "${dependency}"`,
            path: `workflow.steps[${index}].needs`,
            hint,
            severity: 'error' as any,
          });
        }
      }
    });
  }

  /**
   * Detect circular dependencies in step graph
   * 
   * @param steps - Array of parsed steps
   * @throws {ValidationError} If circular dependency detected
   */
  static detectCircularDependencies(steps: ParsedStep[]): void {
    const stepMap = new Map(steps.map((s, i) => [s.id, { step: s, index: i }]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function visit(stepId: string, path: string[]): void {
      if (recursionStack.has(stepId)) {
        // Found cycle
        const cycleStart = path.indexOf(stepId);
        const cycle = path.slice(cycleStart).concat(stepId);
        throw ValidationError.circularDependency(
          cycle,
          'workflow.steps'
        );
      }

      if (visited.has(stepId)) {
        return; // Already processed
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      // Visit dependencies
      const stepData = stepMap.get(stepId);
      if (stepData) {
        for (const dep of stepData.step.needs) {
          visit(dep, [...path, stepId]);
        }
      }

      recursionStack.delete(stepId);
    }

    // Visit all steps
    for (const step of steps) {
      if (!visited.has(step.id)) {
        visit(step.id, []);
      }
    }
  }

  /**
   * Run all validation checks on parsed steps
   * Enhanced with comprehensive validation
   * 
   * @param steps - Array of parsed steps
   * @throws {ValidationError} If any validation fails
   */
  static validateAll(steps: ParsedStep[]): void {
    // Order matters: check basic constraints first
    this.validateUniqueIds(steps);
    this.validateDependencies(steps);
    this.detectCircularDependencies(steps);

    // Additional semantic validations
    this.validateOutputReferences(steps);
  }

  /**
   * Validate output references in step output mappings
   * Ensures steps don't reference outputs from steps that haven't executed yet
   * 
   * @param steps - Array of parsed steps
   */
  private static validateOutputReferences(steps: ParsedStep[]): void {
    // Build execution order considering dependencies
    const stepMap = new Map(steps.map(s => [s.id, s]));
    const executed = new Set<string>();

    // Simple topological order (dependencies-first)
    const getExecutionOrder = (): string[] => {
      const order: string[] = [];
      const visited = new Set<string>();

      function visit(stepId: string): void {
        if (visited.has(stepId)) return;
        visited.add(stepId);

        const step = stepMap.get(stepId);
        if (step) {
          // Visit dependencies first
          for (const dep of step.needs) {
            visit(dep);
          }
          order.push(stepId);
        }
      }

      for (const step of steps) {
        visit(step.id);
      }

      return order;
    };

    const executionOrder = getExecutionOrder();

    // Validate each step's outputs don't reference future steps
    executionOrder.forEach((stepId) => {
      const step = stepMap.get(stepId);
      if (!step || !step.outputs) return;

      // Check if output values reference other steps
      for (const [outputKey, outputValue] of Object.entries(step.outputs)) {
        // Look for ${steps.X.outputs.Y} patterns
        const stepRefs = outputValue.match(/\$\{steps\.([^.]+)\./g);
        if (stepRefs) {
          for (const ref of stepRefs) {
            const referencedStepId = ref.match(/steps\.([^.]+)/)?.[1];
            if (referencedStepId && !executed.has(referencedStepId)) {
              throw new ValidationError({
                code: 'ORB-V-005' as any,
                message: `Step "${stepId}" references output from "${referencedStepId}" which hasn't executed yet`,
                path: `workflow.steps[${steps.findIndex(s => s.id === stepId)}].outputs.${outputKey}`,
                hint: `Add "${referencedStepId}" to the "needs" array of step "${stepId}".`,
                severity: 'error' as any,
              });
            }
          }
        }
      }

      executed.add(stepId);
    });
  }
}

