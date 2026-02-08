/**
 * Base Adapter Interface
 * 
 * All adapters must implement this interface.
 * Adapters translate workflow actions into actual execution.
 * 
 * @module adapters
 */

/**
 * Base adapter interface for workflow actions
 */
export interface Adapter {
  /** Unique adapter name */
  readonly name: string;
  
  /** Adapter version */
  readonly version: string;
  
  /** Adapter description */
  readonly description?: string;
  
  /** Supported action patterns (e.g., 'http.*', 'shell.exec') */
  readonly supportedActions: string[];

  /**
   * Check if adapter supports an action
   * 
   * @param action - Action name to check
   * @returns True if supported
   */
  supports(action: string): boolean;

  /**
   * Execute an action
   * 
   * @param action - Full action name (e.g., 'http.request.get')
   * @param input - Resolved input parameters
   * @param context - Execution context
   * @returns Action output
   */
  execute(
    action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<any>;

  /**
   * Optional: Initialize adapter (called once on registration)
   */
  initialize?(): Promise<void>;

  /**
   * Optional: Cleanup adapter (called on engine shutdown)
   */
  cleanup?(): Promise<void>;
}

/**
 * Adapter execution context
 */
export interface AdapterContext {
  /** Current workflow name */
  workflowName: string;
  
  /** Current step ID */
  stepId: string;
  
  /** Execution ID */
  executionId: string;
  
  /** Logger function */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void;
  
  /** Access to secrets (if configured) */
  secrets?: Record<string, string>;
  
  /** Temporary directory for step execution */
  tempDir?: string;
}

/**
 * Base adapter implementation with common logic
 */
export abstract class BaseAdapter implements Adapter {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description?: string;
  abstract readonly supportedActions: string[];

  /**
   * Check if adapter supports an action
   * 
   * Supports glob-like patterns:
   *   - 'http.*' matches 'http.request.get', 'http.request.post', etc.
   *   - 'http.request.*' matches 'http.request.get', 'http.request.post', etc.
   */
  supports(action: string): boolean {
    for (const pattern of this.supportedActions) {
      if (this.matchesPattern(action, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Execute action - must be implemented by subclass
   */
  abstract execute(
    action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<any>;

  /**
   * Match action against pattern
   */
  protected matchesPattern(action: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(action);
  }

  /**
   * Validate required input fields
   */
  protected validateInput(
    input: Record<string, any>,
    required: string[]
  ): void {
    for (const field of required) {
      if (input[field] === undefined || input[field] === null) {
        throw new Error(
          `${this.name} adapter: missing required input field '${field}'`
        );
      }
    }
  }

  /**
   * Get input with default value
   */
  protected getInput<T>(
    input: Record<string, any>,
    key: string,
    defaultValue: T
  ): T {
    return input[key] !== undefined ? input[key] : defaultValue;
  }
}
