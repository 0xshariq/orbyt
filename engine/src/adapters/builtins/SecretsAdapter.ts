/**
 * Secrets Adapter
 * 
 * Manages secrets using pluggable secret providers.
 */

import { Adapter, AdapterContext, AdapterCapabilities, AdapterMetadata } from '../Adapter.js';
import { AdapterResult, AdapterResultBuilder } from '../AdapterResult.js';
import { WorkflowValidationError, OrbytErrorCodes } from '@dev-ecosystem/core';
import { SecretProvider, MemorySecretProvider } from './SecretProvider.js';

export interface SecretsAdapterConfig {
  provider?: SecretProvider;
}

/**
 * Secrets Adapter
 * 
 * Supported actions:
 * - secrets.get: Get a secret value
 * - secrets.set: Set a secret value
 * - secrets.delete: Delete a secret
 * - secrets.has: Check if a secret exists
 * - secrets.list: List all secret keys
 */
export class SecretsAdapter implements Adapter {
  public readonly name = 'secrets';
  public readonly version = '1.0.0';
  public readonly description = 'Manages secrets with pluggable storage backends';

  public readonly capabilities: AdapterCapabilities = {
    actions: ['secrets.get', 'secrets.set', 'secrets.delete', 'secrets.has', 'secrets.list'],
    concurrent: true,
    cacheable: false, // Secrets should not be cached
    idempotent: false,
    resources: {
      network: false, // May be true for remote providers
    },
    cost: 'low',
  };

  public readonly metadata: AdapterMetadata = {
    name: 'Secrets Adapter',
    version: '1.0.0',
    author: 'Orbyt Team',
    tags: ['secrets', 'security', 'credentials'],
  };

  public readonly supportedActions = ['secrets.get', 'secrets.set', 'secrets.delete', 'secrets.has', 'secrets.list'];

  private provider: SecretProvider;

  constructor(config: SecretsAdapterConfig = {}) {
    this.provider = config.provider || new MemorySecretProvider();
  }

  async initialize(): Promise<void> {
    await this.provider.initialize();
  }

  async cleanup(): Promise<void> {
    await this.provider.cleanup();
  }

  supports(action: string): boolean {
    return action.startsWith('secrets.');
  }

  async execute(action: string, input: Record<string, any>, context: AdapterContext): Promise<AdapterResult> {
    const builder = new AdapterResultBuilder();
    const startTime = Date.now();
    
    // Log execution context for debugging
    context.log(`Executing secrets.${action} for workspace: ${context.cwd || process.cwd()}`, 'info');

    try {
      let result: unknown;

      switch (action) {
        case 'secrets.get':
          result = await this.getSecret(input);
          break;

        case 'secrets.set':
          result = await this.setSecret(input);
          break;

        case 'secrets.delete':
          result = await this.deleteSecret(input);
          break;

        case 'secrets.has':
          result = await this.hasSecret(input);
          break;

        case 'secrets.list':
          result = await this.listSecrets();
          break;

        default:
          throw new WorkflowValidationError(
            `Unsupported secrets action: ${action}`,
            { action, hint: 'Supported actions: get, set, delete, has, list' }
          );
      }

      return builder
        .success(result)
        .effect(`secrets:${action.replace('secrets.', '')}`)
        .metrics({
          durationMs: Date.now() - startTime,
        })
        .build();
    } catch (error) {
      const err = error as Error;
      const errorCode = (error as any).code || OrbytErrorCodes.ADAPTER_EXECUTION_FAILED;
      return builder
        .failure({
          code: errorCode,
          message: err.message,
        })
        .metrics({
          durationMs: Date.now() - startTime,
        })
        .build();
    }
  }

  private async getSecret(input: Record<string, any>): Promise<{ key: string; value?: string; found: boolean }> {
    const key = input.key as string;

    if (!key) {
      throw new WorkflowValidationError(
        'Missing required parameter: key',
        { parameter: 'key' }
      );
    }

    const value = await this.provider.get(key);

    return {
      key,
      value,
      found: value !== undefined,
    };
  }

  private async setSecret(input: Record<string, any>): Promise<{ key: string; success: boolean }> {
    const key = input.key as string;
    const value = input.value as string;

    if (!key || value === undefined) {
      throw new WorkflowValidationError(
        'Missing required parameters: key, value',
        { parameters: ['key', 'value'] }
      );
    }

    await this.provider.set(key, value);

    return { key, success: true };
  }

  private async deleteSecret(input: Record<string, any>): Promise<{ key: string; deleted: boolean }> {
    const key = input.key as string;

    if (!key) {
      throw new WorkflowValidationError(
        'Missing required parameter: key',
        { parameter: 'key' }
      );
    }

    const deleted = await this.provider.delete(key);

    return { key, deleted };
  }

  private async hasSecret(input: Record<string, any>): Promise<{ key: string; exists: boolean }> {
    const key = input.key as string;

    if (!key) {
      throw new WorkflowValidationError(
        'Missing required parameter: key',
        { parameter: 'key' }
      );
    }

    const exists = await this.provider.has(key);

    return { key, exists };
  }

  private async listSecrets(): Promise<{ keys: string[]; count: number }> {
    const keys = await this.provider.list();

    return { keys, count: keys.length };
  }

  /**
   * Change the secret provider
   */
  setProvider(provider: SecretProvider): void {
    this.provider = provider;
  }

  /**
   * Get the current provider
   */
  getProvider(): SecretProvider {
    return this.provider;
  }
}
