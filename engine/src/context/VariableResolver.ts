/**
 * Variable Resolution Engine
 * 
 * Resolves variables in workflow step inputs at runtime.
 * Supports multiple variable sources: env, steps, workflow, run, context.
 * 
 * Syntax: ${source.path.to.value}
 * 
 * @module context
 */

/**
 * Runtime context for variable resolution
 */
export interface ResolutionContext {
  /** Global environment variables */
  env: Record<string, any>;
  
  /** Step outputs (stepId -> output data) */
  steps: Map<string, any>;
  
  /** Workflow metadata */
  workflow: {
    id: string;
    name: string;
    version?: string;
  };
  
  /** Current run information */
  run: {
    id: string;
    timestamp: Date;
    attempt: number;
  };
  
  /** Additional runtime context */
  context?: Record<string, any>;
}

/**
 * Variable resolver engine
 */
export class VariableResolver {
  /**
   * Resolve all variables in the input value
   * 
   * @param input - Input value (can be string, object, array, or primitive)
   * @param ctx - Resolution context
   * @returns Input with all variables resolved
   */
  resolve(input: any, ctx: ResolutionContext): any {
    // Handle null/undefined
    if (input === null || input === undefined) {
      return input;
    }

    // Handle strings (may contain variables)
    if (typeof input === 'string') {
      return this.resolveString(input, ctx);
    }

    // Handle arrays recursively
    if (Array.isArray(input)) {
      return input.map(v => this.resolve(v, ctx));
    }

    // Handle objects recursively
    if (typeof input === 'object') {
      const result: Record<string, any> = {};
      for (const key in input) {
        result[key] = this.resolve(input[key], ctx);
      }
      return result;
    }

    // Return primitives as-is
    return input;
  }

  /**
   * Resolve variables in a string
   * 
   * Supports:
   *   - Full replacement: "${env.apiKey}" -> actual value
   *   - Inline replacement: "URL: ${env.baseUrl}/api" -> "URL: https://api.com/api"
   * 
   * @param str - String potentially containing variables
   * @param ctx - Resolution context
   * @returns String with variables resolved
   */
  private resolveString(str: string, ctx: ResolutionContext): any {
    // Check if entire string is a single variable
    const singleVarMatch = str.match(/^\$\{([^}]+)\}$/);
    if (singleVarMatch) {
      // Return actual value (might not be string)
      return this.lookup(singleVarMatch[1].trim(), ctx);
    }

    // Replace all inline variables with string values
    const regex = /\$\{([^}]+)\}/g;
    return str.replace(regex, (_, expr) => {
      const value = this.lookup(expr.trim(), ctx);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * Lookup variable value from context
   * 
   * Supports:
   *   - ${env.apiKey} -> ctx.env.apiKey
   *   - ${steps.resize.output.url} -> ctx.steps.get('resize').output.url
   *   - ${workflow.name} -> ctx.workflow.name
   *   - ${run.id} -> ctx.run.id
   *   - ${context.customValue} -> ctx.context.customValue
   * 
   * @param expression - Variable expression (without ${ })
   * @param ctx - Resolution context
   * @returns Resolved value or undefined
   */
  private lookup(expression: string, ctx: ResolutionContext): any {
    const parts = expression.split('.');
    const source = parts[0];
    const path = parts.slice(1);

    // Resolve source
    let value: any;
    
    switch (source) {
      case 'env':
        value = ctx.env;
        break;
        
      case 'steps': {
        if (path.length === 0) {
          throw new Error('steps variable requires step ID: ${steps.stepId.output}');
        }
        const stepId = path[0];
        const stepOutput = ctx.steps.get(stepId);
        if (stepOutput === undefined) {
          throw new Error(
            `Step '${stepId}' not found or has not executed yet. ` +
            `Available steps: ${Array.from(ctx.steps.keys()).join(', ')}`
          );
        }
        value = stepOutput;
        // Remove stepId from path
        path.shift();
        break;
      }
        
      case 'workflow':
        value = ctx.workflow;
        break;
        
      case 'run':
        value = ctx.run;
        break;
        
      case 'context':
        value = ctx.context || {};
        break;
        
      default:
        throw new Error(
          `Unknown variable source: '${source}'. ` +
          `Valid sources are: env, steps, workflow, run, context`
        );
    }

    // Navigate path
    for (const key of path) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * Check if a string contains variables
   * 
   * @param str - String to check
   * @returns True if string contains ${...} patterns
   */
  static hasVariables(str: string): boolean {
    return /\$\{[^}]+\}/.test(str);
  }

  /**
   * Extract all variable expressions from a string
   * 
   * @param str - String to analyze
   * @returns Array of variable expressions (without ${ })
   */
  static extractVariables(str: string): string[] {
    const regex = /\$\{([^}]+)\}/g;
    const matches: string[] = [];
    let match;
    
    while ((match = regex.exec(str)) !== null) {
      matches.push(match[1].trim());
    }
    
    return matches;
  }

  /**
   * Validate that all referenced steps exist
   * 
   * @param input - Input to validate
   * @param availableSteps - Set of available step IDs
   * @throws {Error} If referenced step doesn't exist
   */
  static validateStepReferences(
    input: any,
    availableSteps: Set<string>
  ): void {
    const checkValue = (value: any): void => {
      if (typeof value === 'string') {
        const vars = this.extractVariables(value);
        for (const varExpr of vars) {
          const parts = varExpr.split('.');
          if (parts[0] === 'steps' && parts.length > 1) {
            const stepId = parts[1];
            if (!availableSteps.has(stepId)) {
              throw new Error(
                `Variable references unknown step: '${stepId}'. ` +
                `Available steps: ${Array.from(availableSteps).join(', ')}`
              );
            }
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach(checkValue);
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(checkValue);
      }
    };
    
    checkValue(input);
  }
}
