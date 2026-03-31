/**
 * Config Loader for Orbyt CLI
 *
 * Loads runtime configuration from ~/.orbyt/config/config.json.
 * Applies configuration to OrbytEngine instance, including:
 * - Pricing catalog snapshot
 * - Quota policies
 * - Other runtime settings
 *
 * @module cli/utils/configLoader
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { OrbytEngine } from '@orbytautomation/engine';
import type { BillingPricingCatalog } from '@dev-ecosystem/core';

/**
 * Runtime config structure stored at ~/.orbyt/config/config.json
 */
export interface OrbytRuntimeConfig {
  version: number;
  createdAt: string;
  source: 'orbyt-engine' | 'orbyt-cli';
  engine: {
    version: string;
    mode: string;
    logLevel: string;
    maxConcurrentWorkflows: number;
    maxConcurrentSteps: number;
    defaultTimeout: number;
    enableScheduler: boolean;
    enableMetrics: boolean;
    enableEvents: boolean;
    sandboxMode: boolean;
  };
  paths: {
    stateDir: string;
    logDir: string;
    cacheDir: string;
    runtimeDir: string;
    workingDirectory: string;
  };
  usageSpool?: {
    enabled?: boolean;
    baseDir?: string;
    batchSize?: number;
    flushIntervalMs?: number;
    billingEndpoint?: string;
  };
  pricingCatalog?: BillingPricingCatalog;
  quotaPolicies?: {
    free?: Record<string, unknown>;
    pro?: Record<string, unknown>;
    enterprise?: Record<string, unknown>;
  };
}

/**
 * Get config file path
 */
export function getConfigFilePath(): string {
  return join(homedir(), '.orbyt', 'config', 'config.json');
}

/**
 * Check if config file exists
 */
export function hasConfigFile(): boolean {
  return existsSync(getConfigFilePath());
}

/**
 * Load runtime config from ~/.orbyt/config/config.json
 *
 * @throws Error if file doesn't exist or is malformed
 */
export function loadRuntimeConfig(): OrbytRuntimeConfig {
  const configPath = getConfigFilePath();

  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}. ` +
      `Run 'orbyt doctor' to initialize, or ensure engine has been started.`,
    );
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content) as OrbytRuntimeConfig;
  } catch (error) {
    throw new Error(
      `Failed to parse config file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Apply loaded config to OrbytEngine instance
 *
 * Sets pricing catalog and quota policies if they exist in the config.
 *
 * @param engine - OrbytEngine instance to configure
 * @param config - Runtime config to apply (optional - will be loaded if not provided)
 */
export async function applyConfigToEngine(
  engine: OrbytEngine,
  config?: OrbytRuntimeConfig,
): Promise<void> {
  // Load config if not provided
  const runtimeConfig = config ?? loadRuntimeConfig();

  // Apply pricing catalog if configured
  if (runtimeConfig.pricingCatalog) {
    try {
      engine.setPricingCatalog(runtimeConfig.pricingCatalog);
    } catch (error) {
      console.warn(
        'Warning: Failed to apply pricing catalog from config:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // Note: Quota policies are typically applied at engine construction time via OrbytEngineConfig,
  // not after the fact. This is here for reference/future use.
  if (runtimeConfig.quotaPolicies) {
    console.debug('Quota policies loaded from config (applied at engine initialization)');
  }
}

/**
 * Safely load and apply config, with fallback behavior for missing config
 *
 * @param engine - OrbytEngine instance
 * @param options - Load options
 * @returns true if config was successfully applied, false if not found but optional
 */
export async function loadAndApplyConfig(
  engine: OrbytEngine,
  options: { optional?: boolean; verbose?: boolean } = {},
): Promise<boolean> {
  const { optional = true, verbose = false } = options;

  try {
    const config = loadRuntimeConfig();
    await applyConfigToEngine(engine, config);

    if (verbose) {
      const pricingInfo = config.pricingCatalog
        ? ` (pricing v${config.pricingCatalog.version})`
        : '';
      console.log(`✓ Applied runtime config from ~/.orbyt/config/config.json${pricingInfo}`);
    }

    return true;
  } catch (error) {
    if (optional) {
      if (verbose) {
        console.debug(
          'Runtime config not found (optional). Skipping config load.',
          error instanceof Error ? error.message : String(error),
        );
      }
      return false;
    }

    throw error;
  }
}

/**
 * Get pricing catalog from runtime config
 *
 * @param config - Runtime config (optional - will load if not provided)
 * @returns Pricing catalog if configured, undefined otherwise
 */
export function getPricingCatalogFromConfig(
  config?: OrbytRuntimeConfig,
): BillingPricingCatalog | undefined {
  const runtimeConfig = config ?? (hasConfigFile() ? loadRuntimeConfig() : undefined);
  return runtimeConfig?.pricingCatalog;
}
