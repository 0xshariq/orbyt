/**
 * Adapter Driver
 * 
 * Executes steps by delegating to registered adapters.
 * This is the primary driver for most workflow steps.
 * 
 * @module execution/drivers
 */

import { BaseDriver } from './ExecutionDriver.js';
import type { AdapterRegistry } from '../../adapters/AdapterRegistry.js';
import type { AdapterResult, AdapterContext } from '@dev-ecosystem/core';
import { DriverContext, DriverStep } from '../../types/core-types.js';

/**
 * Adapter Driver
 * 
 * Routes step execution to the appropriate adapter based on the 'uses' field.
 * Example: 'http.request.get' → HTTPAdapter, 'cli.run' → CLIAdapter
 */
export class AdapterDriver extends BaseDriver {
  readonly type = 'adapter';
  readonly name = 'Adapter Driver';
  readonly version = '1.0.0';
  readonly description = 'Executes steps using registered adapters';

  constructor(private adapterRegistry: AdapterRegistry) {
    super();
  }

  /**
   * Can handle any step with a 'uses' field that matches a registered adapter
   */
  canHandle(step: DriverStep): boolean {
    if (!step.uses) return false;
    
    // Check if any adapter supports this action
    return this.adapterRegistry.supports(step.uses);
  }

  /**
   * Execute step by delegating to appropriate adapter
   */
  async execute(
    step: DriverStep,
    context: DriverContext
  ): Promise<AdapterResult> {
    this.validateStep(step, ['uses']);

    // Resolve adapter
    const adapter = this.adapterRegistry.resolve(step.uses);
    
    // Build adapter context from driver context
    const adapterContext: AdapterContext = {
      workflowName: context.workflowName,
      stepId: context.stepId,
      executionId: context.executionId,
      log: context.log,
      secrets: context.secrets,
      tempDir: context.tempDir,
      signal: context.signal,
      timeout: context.timeout,
      cwd: context.cwd,
      env: context.env,
      stepOutputs: context.stepOutputs,
      inputs: context.inputs,
      workflowContext: context.workflowContext,
    };

    // Execute adapter
    context.log(`Executing with adapter: ${adapter.name}`);
    
    return adapter.execute(
      step.uses,
      step.with || {},
      adapterContext
    );
  }
}
