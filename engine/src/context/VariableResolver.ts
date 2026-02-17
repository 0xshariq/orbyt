/**
 * Variable Resolution Engine
 * 
 * Resolves variables in workflow step inputs at runtime.
 * Supports multiple variable sources aligned with workflow schema.
 * 
 * Syntax: ${source.path.to.value}
 * 
 * Supported sources:
 * - env: Environment variables
 * - steps: Step outputs
 * - workflow: Workflow metadata
 * - run: Execution metadata
 * - context: Runtime context
 * - inputs: Workflow inputs
 * - secrets: Secret references (resolved externally)
 * - metadata: Workflow metadata fields
 * 
 * Future sources (placeholders):
 * - telemetry: Telemetry data
 * - resources: Resource information
 * - compliance: Compliance metadata
 * 
 * Advanced features:
 * - Default values: ${env.token || "default"}
 * - Built-in functions: 
 *   - Time: ${now()}, ${uuid()}, ${timestamp()}
 *   - Context-aware: ${workflowId()}, ${workflowName()}, ${runId()}, ${attempt()}, ${triggeredBy()}
 * - Type-aware: ${steps.count} returns number, not string
 * - Math expressions: FUTURE (${steps.a + steps.b})
 * 
 * @module context
 */

import { randomUUID } from 'crypto';
import { LoggerManager } from '../logging/LoggerManager.js';

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
    description?: string;
    tags?: string[];
    owner?: string;
  };
  
  /** Current run information */
  run: {
    id: string;
    timestamp: Date;
    attempt: number;
    startedAt?: Date;
    triggeredBy?: string;
  };
  
  /** Workflow inputs (runtime parameters) */
  inputs?: Record<string, any>;
  
  /** Resolved secrets (name -> value) */
  secrets?: Record<string, any>;
  
  /** Additional runtime context */
  context?: Record<string, any>;
  
  /** Workflow metadata (extended) */
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    annotations?: Record<string, any>;
  };
  
  // Future placeholders (not yet implemented)
  /** Telemetry data (future) */
  telemetry?: Record<string, any>;
  
  /** Resource information (future) */
  resources?: Record<string, any>;
  
  /** Compliance metadata (future) */
  compliance?: Record<string, any>;
}

/**
 * Variable resolver engine
 */
export class VariableResolver {
  /** Maximum recursion depth to prevent infinite loops */
  private readonly maxDepth = 10;
  
  /**
   * Resolve all variables in the input value
   * 
   * @param input - Input value (can be string, object, array, or primitive)
   * @param ctx - Resolution context
   * @param depth - Current recursion depth (internal)
   * @returns Input with all variables resolved
   */
  resolve(input: any, ctx: ResolutionContext, depth: number = 0): any {
    // Prevent infinite recursion
    if (depth > this.maxDepth) {
      throw new Error(
        `Maximum variable resolution depth (${this.maxDepth}) exceeded. ` +
        'Check for circular variable references.'
      );
    }
    // Handle null/undefined
    if (input === null || input === undefined) {
      return input;
    }

    // Handle strings (may contain variables)
    if (typeof input === 'string') {
      return this.resolveString(input, ctx, depth);
    }

    // Handle arrays recursively
    if (Array.isArray(input)) {
      return input.map(v => this.resolve(v, ctx, depth + 1));
    }

    // Handle objects recursively
    if (typeof input === 'object') {
      const result: Record<string, any> = {};
      for (const key in input) {
        result[key] = this.resolve(input[key], ctx, depth + 1);
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
   *   - Default values: "${env.token || 'default'}" -> uses default if token undefined
   *   - Built-in functions: "${now()}" -> current timestamp
   * 
   * @param str - String potentially containing variables
   * @param ctx - Resolution context
   * @param depth - Current recursion depth
   * @returns String with variables resolved
   */
  private resolveString(str: string, ctx: ResolutionContext, depth: number): any {
    // Check if entire string is a single variable (type-aware resolution)
    const singleVarMatch = str.match(/^\$\{([^}]+)\}$/);
    if (singleVarMatch) {
      // Return actual value (might not be string)
      return this.evaluateExpression(singleVarMatch[1].trim(), ctx, depth);
    }

    // Replace all inline variables with string values
    const regex = /\$\{([^}]+)\}/g;
    return str.replace(regex, (_, expr) => {
      const value = this.evaluateExpression(expr.trim(), ctx, depth);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * Evaluate expression (supports default values and functions)
   * 
   * Examples:
   *   - env.apiKey -> lookup('env.apiKey')
   *   - env.token || "default" -> lookup with fallback
   *   - now() -> built-in function
   * 
   * @param expression - Expression to evaluate
   * @param ctx - Resolution context
   * @param depth - Current recursion depth
   * @returns Evaluated value
   */
  private evaluateExpression(expression: string, ctx: ResolutionContext, depth: number): any {
    // Check for default value operator (||)
    const defaultMatch = expression.match(/^(.+?)\|\|(.+)$/);
    if (defaultMatch) {
      const [, mainExpr, defaultExpr] = defaultMatch;
      try {
        const value = this.evaluateExpression(mainExpr.trim(), ctx, depth + 1);
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      } catch (err) {
        // If lookup fails, use default
      }
      // Parse default value (could be string literal or another expression)
      const defaultVal = defaultExpr.trim();
      // Handle string literals
      if ((defaultVal.startsWith("'") && defaultVal.endsWith("'")) ||
          (defaultVal.startsWith('"') && defaultVal.endsWith('"'))) {
        return defaultVal.slice(1, -1);
      }
      // Handle number literals
      if (!isNaN(Number(defaultVal))) {
        return Number(defaultVal);
      }
      // Handle boolean literals
      if (defaultVal === 'true') return true;
      if (defaultVal === 'false') return false;
      if (defaultVal === 'null') return null;
      // Otherwise evaluate as expression
      return this.evaluateExpression(defaultVal, ctx, depth + 1);
    }
    
    // Check for built-in functions
    if (expression.endsWith('()')) {
      return this.callBuiltInFunction(expression.slice(0, -2), ctx);
    }
    
    // Standard variable lookup
    return this.lookup(expression, ctx);
  }
  
  /**
   * Call a built-in function
   * 
   * Supported functions:
   *   - now() -> current ISO timestamp
   *   - uuid() -> random UUID v4
   *   - timestamp() -> current Unix timestamp (milliseconds)
   *   - workflowId() -> current workflow ID from context
   *   - workflowName() -> current workflow name from context
   *   - runId() -> current execution run ID from context
   *   - attempt() -> current execution attempt number from context
   *   - triggeredBy() -> who/what triggered the workflow from context
   * 
   * @param funcName - Function name
   * @param ctx - Resolution context for context-aware functions
   * @returns Function result
   */
  private callBuiltInFunction(funcName: string, ctx: ResolutionContext): any {
    switch (funcName) {
      // Time-based functions (context-independent)
      case 'now':
        return new Date().toISOString();
        
      case 'uuid':
        return randomUUID();
        
      case 'timestamp':
        return Date.now();
      
      // Context-aware workflow functions
      case 'workflowId':
        return ctx.workflow.id;
        
      case 'workflowName':
        return ctx.workflow.name;
      
      // Context-aware run functions  
      case 'runId':
        return ctx.run.id;
        
      case 'attempt':
        return ctx.run.attempt;
        
      case 'triggeredBy':
        return ctx.run.triggeredBy || 'unknown';
        
      // Future functions (placeholders)
      case 'env':
        throw new Error('env() function not yet supported. Use ${env.VAR_NAME} syntax instead.');
        
      default:
        throw new Error(
          `Unknown function: '${funcName}()'. ` +
          `Available functions: now(), uuid(), timestamp(), workflowId(), workflowName(), runId(), attempt(), triggeredBy()`
        );
    }
  }

  /**
   * Lookup variable value from context
   * 
   * Supports:
   *   - ${env.apiKey} -> ctx.env.apiKey
   *   - ${steps.resize.output.url} -> ctx.steps.get('resize').output.url
   *   - ${workflow.name} -> ctx.workflow.name
   *   - ${run.id} -> ctx.run.id
   *   - ${inputs.userId} -> ctx.inputs.userId
   *   - ${secrets.apiKey} -> ctx.secrets.apiKey
   *   - ${metadata.createdAt} -> ctx.metadata.createdAt
   *   - ${context.customValue} -> ctx.context.customValue
   *   - ${telemetry.*} -> Future placeholder
   *   - ${resources.*} -> Future placeholder
   *   - ${compliance.*} -> Future placeholder
   * 
   * @param expression - Variable expression (without ${ })
   * @param ctx - Resolution context
   * @returns Resolved value or undefined
   */
  private lookup(expression: string, ctx: ResolutionContext): any {
    const logger = LoggerManager.getLogger();
    const parts = expression.split('.');
    const source = parts[0];
    const path = parts.slice(1);

    logger.debug(`[VariableResolver] Resolving variable: ${expression}`, {
      expression,
      source,
      pathLength: path.length,
    });

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
            `Available steps: ${Array.from(ctx.steps.keys()).join(', ') || 'none'}`
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
        
      case 'inputs':
        if (!ctx.inputs) {
          throw new Error('No inputs defined for this workflow execution');
        }
        value = ctx.inputs;
        break;
        
      case 'secrets':
        if (!ctx.secrets) {
          throw new Error('No secrets available in this context. Secrets must be resolved before execution.');
        }
        value = ctx.secrets;
        break;
        
      case 'metadata':
        if (!ctx.metadata) {
          throw new Error('No metadata available in this context');
        }
        value = ctx.metadata;
        break;
        
      case 'context':
        value = ctx.context || {};
        break;
        
      // Future placeholders
      case 'telemetry':
        if (!ctx.telemetry) {
          throw new Error('Telemetry variables are not yet supported (future feature)');
        }
        value = ctx.telemetry;
        break;
        
      case 'resources':
        if (!ctx.resources) {
          throw new Error('Resource variables are not yet supported (future feature)');
        }
        value = ctx.resources;
        break;
        
      case 'compliance':
        if (!ctx.compliance) {
          throw new Error('Compliance variables are not yet supported (future feature)');
        }
        value = ctx.compliance;
        break;
        
      default:
        throw new Error(
          `Unknown variable source: '${source}'. ` +
          `Valid sources are: env, steps, workflow, run, inputs, secrets, metadata, context. ` +
          `Future sources: telemetry, resources, compliance`
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
