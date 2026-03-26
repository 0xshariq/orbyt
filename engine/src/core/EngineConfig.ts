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
export function applyConfigDefaults(config: OrbytEngineConfig = {}): Required<Omit<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata' | 'usageCollector' | 'usageSpool' | 'scheduler' | 'distributed'>> & Pick<OrbytEngineConfig, 'queue' | 'retryPolicy' | 'timeoutManager' | 'adapters' | 'hooks' | 'metadata' | 'usageCollector' | 'usageSpool' | 'scheduler' | 'distributed'> {
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
        workerCount: config.scheduler?.job?.workerCount ?? 4,
        workerBackend: config.scheduler?.job?.workerBackend ?? 'node',
        tokioWorkerCommand: config.scheduler?.job?.tokioWorkerCommand ?? 'orbyt-tokio-worker',
        tokioWorkerArgs: config.scheduler?.job?.tokioWorkerArgs ?? [],
      },
    },
    distributed: {
      jobQueue: config.distributed?.jobQueue,
      queueBackend: config.distributed?.queueBackend ?? 'memory',
      fileQueueStateDir: config.distributed?.fileQueueStateDir ?? join(ORBYT_HOME, 'distributed-queue'),
      workerCount: config.distributed?.workerCount ?? config.scheduler?.job?.workerCount ?? 4,
      pollIntervalMs: config.distributed?.pollIntervalMs ?? 50,
      leaseMs: config.distributed?.leaseMs ?? 30_000,
      leaseExtensionMs: config.distributed?.leaseExtensionMs ?? 5_000,
    },
    metadata: config.metadata,
    usageCollector: config.usageCollector,
    usageSpool: {
      enabled: config.usageSpool?.enabled ?? true,
      baseDir: config.usageSpool?.baseDir ?? join(ORBYT_HOME, 'usage'),
      batchSize: config.usageSpool?.batchSize ?? 200,
      flushIntervalMs: config.usageSpool?.flushIntervalMs ?? 60_000,
      maxRetryAttempts: config.usageSpool?.maxRetryAttempts ?? 10,
      sentRetentionDays: config.usageSpool?.sentRetentionDays ?? 7,
      failedRetentionDays: config.usageSpool?.failedRetentionDays ?? 30,
      billingEndpoint: config.usageSpool?.billingEndpoint,
      billingApiKey: config.usageSpool?.billingApiKey,
      requestTimeoutMs: config.usageSpool?.requestTimeoutMs ?? 10_000,
    },
    quotaPolicies: {
      free: config.quotaPolicies?.free ?? {
        workflowRuns: 200,
        stepExecutions: 5000,
        adapterCalls: 5000,
        computeMs: 2 * 60 * 60 * 1000,
        warningRatio: 0.85,
      },
      pro: config.quotaPolicies?.pro ?? {
        workflowRuns: 5000,
        stepExecutions: 100000,
        adapterCalls: 100000,
        computeMs: 24 * 60 * 60 * 1000,
        warningRatio: 0.9,
      },
      enterprise: config.quotaPolicies?.enterprise,
    },
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

  if (config.usageSpool?.sentRetentionDays !== undefined && config.usageSpool.sentRetentionDays < 1) {
    throw new Error('usageSpool.sentRetentionDays must be at least 1 day');
  }

  if (config.usageSpool?.failedRetentionDays !== undefined && config.usageSpool.failedRetentionDays < 1) {
    throw new Error('usageSpool.failedRetentionDays must be at least 1 day');
  }

  if (config.scheduler?.job?.workerBackend !== undefined && !['node', 'tokio'].includes(config.scheduler.job.workerBackend)) {
    throw new Error("scheduler.job.workerBackend must be either 'node' or 'tokio'");
  }

  if (config.distributed?.queueBackend !== undefined && !['memory', 'file'].includes(config.distributed.queueBackend)) {
    throw new Error("distributed.queueBackend must be either 'memory' or 'file'");
  }

  if (config.distributed?.workerCount !== undefined && config.distributed.workerCount < 1) {
    throw new Error('distributed.workerCount must be at least 1');
  }

  if (config.distributed?.pollIntervalMs !== undefined && config.distributed.pollIntervalMs < 10) {
    throw new Error('distributed.pollIntervalMs must be at least 10ms');
  }

  if (config.distributed?.leaseMs !== undefined && config.distributed.leaseMs < 1000) {
    throw new Error('distributed.leaseMs must be at least 1000ms');
  }

  if (config.distributed?.leaseExtensionMs !== undefined && config.distributed.leaseExtensionMs < 500) {
    throw new Error('distributed.leaseExtensionMs must be at least 500ms');
  }

  const validateQuotaPolicy = (name: 'free' | 'pro' | 'enterprise', policy?: OrbytEngineConfig['quotaPolicies'] extends infer T ? T extends object ? T[keyof T] : never : never): void => {
    if (!policy) return;

    if (policy.workflowRuns < 1) {
      throw new Error(`quotaPolicies.${name}.workflowRuns must be at least 1`);
    }
    if (policy.stepExecutions < 1) {
      throw new Error(`quotaPolicies.${name}.stepExecutions must be at least 1`);
    }
    if (policy.adapterCalls < 1) {
      throw new Error(`quotaPolicies.${name}.adapterCalls must be at least 1`);
    }
    if (policy.computeMs < 1) {
      throw new Error(`quotaPolicies.${name}.computeMs must be at least 1`);
    }
    if (!(policy.warningRatio > 0 && policy.warningRatio <= 1)) {
      throw new Error(`quotaPolicies.${name}.warningRatio must be > 0 and <= 1`);
    }
  };

  validateQuotaPolicy('free', config.quotaPolicies?.free);
  validateQuotaPolicy('pro', config.quotaPolicies?.pro);
  validateQuotaPolicy('enterprise', config.quotaPolicies?.enterprise);
}
