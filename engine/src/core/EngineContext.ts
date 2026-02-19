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
import { EngineContext, OrbytEngineConfig } from '../types/core-types.js';

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
