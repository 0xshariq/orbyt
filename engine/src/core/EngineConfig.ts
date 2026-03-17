/**
 * Engine Configuration
 * 
 * User-facing configuration for OrbytEngine.
 * Provides sensible defaults and clear options for engine behavior.
 * 
 * @module core
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { OrbytEngineConfig } from "../types/core-types.js";

/** Canonical root for all Orbyt data — cross-platform home directory */
const ORBYT_HOME = join(homedir(), '.orbyt');

/**
 * Apply default values to engine configuration
 * 
 * @param config - User-provided configuration
 * @returns Configuration with defaults applied
 */
export function applyConfigDefaults(config: OrbytEngineConfig = {}): Required<Omit<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata' | 'usageCollector' | 'usageSpool' | 'scheduler'>> & Pick<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata' | 'usageCollector' | 'usageSpool' | 'scheduler'> {
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
    stateDir: config.stateDir ?? join(ORBYT_HOME, 'state'),
    logDir: config.logDir ?? join(ORBYT_HOME, 'logs'),
    cacheDir: config.cacheDir ?? join(ORBYT_HOME, 'cache'),
    runtimeDir: config.runtimeDir ?? join(ORBYT_HOME, 'runtime'),
    sandboxMode: config.sandboxMode ?? 'basic',
    workingDirectory: config.workingDirectory ?? process.cwd(),
    experimental: config.experimental ?? false,
    scheduler: {
      job: {
        workerBackend: config.scheduler?.job?.workerBackend ?? 'node',
        tokioWorkerCommand: config.scheduler?.job?.tokioWorkerCommand ?? 'orbyt-tokio-worker',
        tokioWorkerArgs: config.scheduler?.job?.tokioWorkerArgs ?? [],
      },
    },
    metadata: config.metadata,
    usageCollector: config.usageCollector,
    usageSpool: {
      enabled: config.usageSpool?.enabled ?? true,
      baseDir: config.usageSpool?.baseDir ?? join(ORBYT_HOME, 'usage'),
      batchSize: config.usageSpool?.batchSize ?? 200,
      flushIntervalMs: config.usageSpool?.flushIntervalMs ?? 60_000,
      maxRetryAttempts: config.usageSpool?.maxRetryAttempts ?? 10,
      billingEndpoint: config.usageSpool?.billingEndpoint,
      billingApiKey: config.usageSpool?.billingApiKey,
      requestTimeoutMs: config.usageSpool?.requestTimeoutMs ?? 10_000,
    }
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

  if (config.usageSpool?.batchSize !== undefined && config.usageSpool.batchSize < 1) {
    throw new Error('usageSpool.batchSize must be at least 1');
  }

  if (config.usageSpool?.flushIntervalMs !== undefined && config.usageSpool.flushIntervalMs < 1000) {
    throw new Error('usageSpool.flushIntervalMs must be at least 1000ms');
  }

  if (config.usageSpool?.maxRetryAttempts !== undefined && config.usageSpool.maxRetryAttempts < 1) {
    throw new Error('usageSpool.maxRetryAttempts must be at least 1');
  }

  if (config.scheduler?.job?.workerBackend !== undefined && !['node', 'tokio'].includes(config.scheduler.job.workerBackend)) {
    throw new Error("scheduler.job.workerBackend must be either 'node' or 'tokio'");
  }
}
