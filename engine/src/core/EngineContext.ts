/**
 * Engine Context
 * 
 * Runtime context passed through the engine during workflow execution.
 * Provides access to engine components and execution state.
 * 
 * @module core
 */

import type { EventBus } from '../events/EventBus.js';
import type { HookManager } from '../hooks/HookManager.js';
import type { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import type { ExecutionEngine } from '../execution/ExecutionEngine.js';
import type { StepExecutor } from '../execution/StepExecutor.js';
import type { WorkflowExecutor } from '../execution/WorkflowExecutor.js';
import type { OrbytEngineConfig } from './EngineConfig.js';

/**
 * Engine runtime context
 * 
 * Provides access to engine internals during execution.
 * This is the "global" context available to all components.
 * 
 * Different from WorkflowHookContext or StepHookContext which are
 * specific to individual workflow/step executions.
 * 
 * @example
 * ```ts
 * // Inside a custom adapter
 * async execute(step, context, engineContext) {
 *   // Access engine components
 *   engineContext.eventBus.emit(event);
 *   const otherAdapter = engineContext.adapterRegistry.get('http');
 * }
 * ```
 */
export interface EngineContext {
  /**
   * Engine configuration
   */
  config: OrbytEngineConfig;
  
  /**
   * Event bus for emitting and listening to engine events
   */
  eventBus: EventBus;
  
  /**
   * Hook manager for lifecycle hooks
   */
  hookManager: HookManager;
  
  /**
   * Adapter registry - all registered adapters
   */
  adapterRegistry: AdapterRegistry;
  
  /**
   * Execution engine instance
   */
  executionEngine: ExecutionEngine;
  
  /**
   * Step executor instance
   */
  stepExecutor: StepExecutor;
  
  /**
   * Workflow executor instance
   */
  workflowExecutor: WorkflowExecutor;
  
  /**
   * Working directory for this engine instance
   */
  workingDirectory: string;
  
  /**
   * Engine start time
   */
  startedAt: Date;
  
  /**
   * Custom metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Create an engine context from components
 * 
 * @param components - Engine components
 * @returns Engine context
 */
export function createEngineContext(components: {
  config: OrbytEngineConfig;
  eventBus: EventBus;
  hookManager: HookManager;
  adapterRegistry: AdapterRegistry;
  executionEngine: ExecutionEngine;
  stepExecutor: StepExecutor;
  workflowExecutor: WorkflowExecutor;
  workingDirectory: string;
  metadata?: Record<string, any>;
}): EngineContext {
  return {
    config: components.config,
    eventBus: components.eventBus,
    hookManager: components.hookManager,
    adapterRegistry: components.adapterRegistry,
    executionEngine: components.executionEngine,
    stepExecutor: components.stepExecutor,
    workflowExecutor: components.workflowExecutor,
    workingDirectory: components.workingDirectory,
    startedAt: new Date(),
    metadata: components.metadata,
  };
}
