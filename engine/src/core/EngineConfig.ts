/**
 * Engine Configuration
 * 
 * User-facing configuration for OrbytEngine.
 * Provides sensible defaults and clear options for engine behavior.
 * 
 * @module core
 */

import { OrbytEngineConfig } from "../types/core-types.js";

/**
 * Apply default values to engine configuration
 * 
 * @param config - User-provided configuration
 * @returns Configuration with defaults applied
 */
export function applyConfigDefaults(config: OrbytEngineConfig = {}): Required<Omit<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata'>> & Pick<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata'> {
  return {
    maxConcurrentWorkflows: config.maxConcurrentWorkflows ?? 10,
    maxConcurrentSteps: config.maxConcurrentSteps ?? 10,
    defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
    mode: config.mode ?? 'local',
    enableScheduler: config.enableScheduler ?? true,
    queue: config.queue,
    retryPolicy: config.retryPolicy,
    timeoutManager: config.timeoutManager,
    adapters: config.adapters,
    hooks: config.hooks,
    logLevel: config.verbose ? 'debug' : (config.logLevel ?? 'info'),
    verbose: config.verbose ?? false,
    enableMetrics: config.enableMetrics ?? true,
    enableEvents: config.enableEvents ?? true,
    stateDir: config.stateDir ?? '.orbyt/state',
    logDir: config.logDir ?? '.orbyt/logs',
    sandboxMode: config.sandboxMode ?? 'basic',
    workingDirectory: config.workingDirectory ?? process.cwd(),
    experimental: config.experimental ?? false,
    metadata: config.metadata,
  };
}

/**
 * Validate engine configuration
 * 
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: OrbytEngineConfig): void {
  if (config.maxConcurrentWorkflows !== undefined && config.maxConcurrentWorkflows < 1) {
    throw new Error('maxConcurrentWorkflows must be at least 1');
  }

  if (config.maxConcurrentSteps !== undefined && config.maxConcurrentSteps < 1) {
    throw new Error('maxConcurrentSteps must be at least 1');
  }

  if (config.defaultTimeout !== undefined && config.defaultTimeout < 1) {
    throw new Error('defaultTimeout must be positive');
  }

  if (config.mode && !['local', 'distributed', 'dry-run'].includes(config.mode)) {
    throw new Error(`Invalid mode: ${config.mode}. Must be 'local', 'distributed', or 'dry-run'`);
  }

  if (config.logLevel && !['debug', 'info', 'warn', 'error', 'silent'].includes(config.logLevel)) {
    throw new Error(`Invalid logLevel: ${config.logLevel}`);
  }

  if (config.sandboxMode && !['none', 'basic', 'strict'].includes(config.sandboxMode)) {
    throw new Error(`Invalid sandboxMode: ${config.sandboxMode}`);
  }
}
