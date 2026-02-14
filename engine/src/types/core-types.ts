import { OwnershipContext } from "../execution/InternalExecutionContext.js";

/**
 * Workflow run options
 * User-friendly options for running a workflow
 */
export interface WorkflowRunOptions {
  /**
   * Workflow input variables
   */
  variables?: Record<string, any>;

  /**
   * Environment variables for workflow execution
   */
  env?: Record<string, any>;

  /**
   * Secrets (will not be logged)
   */
  secrets?: Record<string, any>;

  /**
   * Additional execution context
   */
  context?: Record<string, any>;

  /**
   * Execution timeout in milliseconds
   */
  timeout?: number;

  /**
   * Continue execution even if steps fail
   */
  continueOnError?: boolean;

  /**
   * Dry run mode - validate and plan but don't execute
   */
  dryRun?: boolean;

  /**
   * Who/what triggered this execution
   */
  triggeredBy?: string;

  /**
   * Ownership context (from bridge/API)
   * INTERNAL USE: Not for user workflows
   */
  _ownershipContext?: Partial<OwnershipContext>;
}

/**
 * Workflow load options
 * Options for loading a workflow from file
 */
export interface WorkflowLoadOptions {
  /**
   * Base directory for resolving relative paths
   */
  baseDir?: string;

  /**
   * Variables to inject during parsing
   */
  variables?: Record<string, any>;
}