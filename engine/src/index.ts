
/**
 * Orbyt Engine - Universal Workflow Automation
 * 
 * @example
 * ```ts
 * import { OrbytEngine } from '@orbytautomation/engine';
 * 
 * const engine = new OrbytEngine();
 * const result = await engine.run('./workflow.yaml');
 * ```
 */

// ============================================================================
// PRIMARY EXPORT - Start here!
// ============================================================================

export { OrbytEngine } from './core/OrbytEngine.js';

// ============================================================================
// TYPES - Essential types for working with the engine
// ============================================================================

export type { 
  WorkflowRunOptions, 
  WorkflowLoadOptions 
} from './core/OrbytEngine.js';

export type { 
  OrbytEngineConfig,
  LogLevel,
  ExecutionMode
} from './core/EngineConfig.js';

export type {
  WorkflowResult,
  ExecutionOptions
} from './execution/WorkflowExecutor.js';

export type {
  ParsedWorkflow
} from './parser/WorkflowParser.js';

export type {
  EngineContext
} from './core/EngineContext.js';

// ============================================================================
// ADVANCED - For power users and adapter developers
// ============================================================================

// Adapters
export * from './adapters/index.js';

// Events
export * from './events/index.js';

// Hooks
export * from './hooks/index.js';

// Execution internals (for advanced use cases)
export type { StepResult } from './execution/StepExecutor.js';
export type { ExecutionPlan } from './execution/ExecutionPlan.js';

// Parser (for validation and custom tooling)
export * from './parser/index.js';

// State management
export * from './state/index.js';

// Context utilities
export * from './context/index.js';

// Automation policies
export * from './automation/index.js';

// Queue and scheduling (for distributed setups)
export * from './queue/index.js';
export * from './scheduling/index.js';

// Errors (for error handling)
export * from './errors/index.js';

// export * from './workflow/index.js';