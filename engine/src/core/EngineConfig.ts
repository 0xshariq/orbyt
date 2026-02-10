/**
 * Engine Configuration
 * 
 * User-facing configuration for OrbytEngine.
 * Provides sensible defaults and clear options for engine behavior.
 * 
 * @module core
 */

import type { RetryPolicy } from '../automation/RetryPolicy.js';
import type { TimeoutManager } from '../automation/TimeoutManager.js';
import type { JobQueue } from '../queue/JobQueue.js';
import type { LifecycleHook } from '../hooks/LifecycleHooks.js';
import type { Adapter } from '@dev-ecosystem/core';

/**
 * Logging level for engine output
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Execution mode
 */
export type ExecutionMode = 'local' | 'distributed' | 'dry-run';

/**
 * Engine configuration options
 * 
 * Provides a clean, user-friendly API for configuring OrbytEngine.
 * All options are optional with sensible defaults.
 * 
 * @example
 * ```ts
 * const config: OrbytEngineConfig = {
 *   maxConcurrentWorkflows: 5,
 *   logLevel: 'info',
 *   enableScheduler: true,
 *   adapters: [httpAdapter, shellAdapter],
 *   hooks: [loggingHook, metricsHook]
 * };
 * 
 * const engine = new OrbytEngine(config);
 * ```
 */
export interface OrbytEngineConfig {
  // === Execution Configuration ===
  
  /**
   * Maximum number of workflows that can run concurrently
   * @default 10
   */
  maxConcurrentWorkflows?: number;
  
  /**
   * Default timeout for workflows (milliseconds)
   * @default 300000 (5 minutes)
   */
  defaultTimeout?: number;
  
  /**
   * Execution mode
   * - 'local': Execute locally with full features
   * - 'distributed': Execute in distributed mode (future)
   * - 'dry-run': Validate and plan but don't execute
   * @default 'local'
   */
  mode?: ExecutionMode;
  
  // === Scheduler Configuration ===
  
  /**
   * Enable the internal scheduler for cron/scheduled workflows
   * @default true
   */
  enableScheduler?: boolean;
  
  // === Queue Configuration ===
  
  /**
   * Custom job queue implementation
   * If not provided, uses InMemoryQueue
   */
  queue?: JobQueue;
  
  // === Automation Policies ===
  
  /**
   * Global retry policy for all steps
   * Can be overridden per-step in workflow definition
   */
  retryPolicy?: RetryPolicy;
  
  /**
   * Global timeout manager
   */
  timeoutManager?: TimeoutManager;
  
  // === Adapters ===
  
  /**
   * Adapters to register with the engine
   * These will be available for use in workflows
   */
  adapters?: Adapter[];
  
  // === Hooks ===
  
  /**
   * Lifecycle hooks for extending engine behavior
   * Hooks are called at key execution moments
   */
  hooks?: LifecycleHook[];
  
  // === Logging & Observability ===
  
  /**
   * Logging level
   * @default 'info'
   */
  logLevel?: LogLevel;
  
  /**
   * Enable verbose output (equivalent to logLevel='debug')
   * @default false
   */
  verbose?: boolean;
  
  /**
   * Enable metrics collection
   * @default true
   */
  enableMetrics?: boolean;
  
  /**
   * Enable event emission
   * @default true
   */
  enableEvents?: boolean;
  
  // === Storage & State ===
  
  /**
   * Directory for storing execution state and logs
   * @default '.orbyt/state'
   */
  stateDir?: string;
  
  /**
   * Directory for storing execution logs
   * @default '.orbyt/logs'
   */
  logDir?: string;
  
  // === Security ===
  
  /**
   * Sandbox mode for step execution
   * - 'none': No sandboxing
   * - 'basic': Basic restrictions
   * - 'strict': Strict isolation (future)
   * @default 'basic'
   */
  sandboxMode?: 'none' | 'basic' | 'strict';
  
  /**
   * Working directory for workflow execution
   * @default process.cwd()
   */
  workingDirectory?: string;
  
  // === Advanced Options ===
  
  /**
   * Enable experimental features
   * @default false
   */
  experimental?: boolean;
  
  /**
   * Custom metadata to attach to all executions
   */
  metadata?: Record<string, any>;
}

/**
 * Apply default values to engine configuration
 * 
 * @param config - User-provided configuration
 * @returns Configuration with defaults applied
 */
export function applyConfigDefaults(config: OrbytEngineConfig = {}): Required<Omit<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata'>> & Pick<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata'> {
  return {
    maxConcurrentWorkflows: config.maxConcurrentWorkflows ?? 10,
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
