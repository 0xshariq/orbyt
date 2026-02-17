
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

export * from './core/index.js'

// ============================================================================
// ADVANCED - For power users and adapter developers
// ============================================================================

// Adapters
export * from './adapters/index.js';

// Events
export * from './events/index.js';

// Hooks
export * from './hooks/index.js';

// Internal execution context (for bridge/API integrations)
export type * from './execution/index.js';
export * from './execution/index.js';

// Explanation types (for CLI and API integrations)
export type { ExecutionExplanation, ExplainedStep } from './explanation/index.js';

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

// Security (read-only - for understanding reserved fields)
export * from './security/index.js';

// export * from './workflow/index.js';
export * from './loader/index.js';

export * from './explanation/index.js';

export * from './logging/index.js';