/**
 * Adapter Registry
 * 
 * Central registry for managing and resolving adapters.
 * Follows the registry pattern for pluggable execution.
 * 
 * @module adapters
 */

import type { Adapter } from '@dev-ecosystem/core';
import { OrbytError } from '../errors/OrbytError.js';
import { OrbytErrorCode, ErrorSeverity } from '../errors/ErrorCodes.js';

/**
 * Adapter not found error
 */
export class AdapterNotFoundError extends OrbytError {
  constructor(action: string, availableAdapters: string[]) {
    super({
      code: OrbytErrorCode.VALIDATION_UNKNOWN_ADAPTER,
      message: `No adapter found for action '${action}'`,
      severity: ErrorSeverity.ERROR,
      hint: `Available adapters: ${availableAdapters.join(', ')}. Check your workflow uses field or register the required adapter.`,
      context: {
        action,
        availableAdapters,
      },
    });
  }
}

/**
 * Duplicate adapter error
 */
export class DuplicateAdapterError extends OrbytError {
  constructor(adapterName: string) {
    super({
      code: OrbytErrorCode.VALIDATION_DUPLICATE_ID,
      message: `Adapter '${adapterName}' is already registered`,
      severity: ErrorSeverity.ERROR,
      hint: 'Use a different adapter name or unregister the existing one first',
      context: {
        adapterName,
      },
    });
  }
}

/**
 * Adapter Registry
 * 
 * Manages the lifecycle and resolution of adapters.
 * Engine uses this to find the right adapter for each workflow step.
 */
export class AdapterRegistry {
  private adapters: Map<string, Adapter> = new Map();
  private initialized: Set<string> = new Set();

  /**
   * Register an adapter
   * 
   * @param adapter - Adapter to register
   * @throws {DuplicateAdapterError} If adapter name already registered
   */
  register(adapter: Adapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new DuplicateAdapterError(adapter.name);
    }

    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Register multiple adapters
   * 
   * @param adapters - Array of adapters to register
   */
  registerAll(adapters: Adapter[]): void {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  /**
   * Unregister an adapter
   * 
   * @param adapterName - Name of adapter to unregister
   * @returns True if adapter was unregistered
   */
  unregister(adapterName: string): boolean {
    const adapter = this.adapters.get(adapterName);
    if (adapter) {
      // Cleanup if initialized
      if (this.initialized.has(adapterName) && adapter.cleanup) {
        adapter.cleanup().catch(err => {
          console.error(`Error cleaning up adapter ${adapterName}:`, err);
        });
      }
      this.initialized.delete(adapterName);
      return this.adapters.delete(adapterName);
    }
    return false;
  }

  /**
   * Find adapter that supports an action
   * 
   * @param action - Action name (e.g., 'http.request.get', 'cli.run')
   * @returns Adapter instance
   * @throws {AdapterNotFoundError} If no adapter supports the action
   */
  resolve(action: string): Adapter {
    // Try to find adapter by exact name match first
    const [namespace] = action.split('.');
    const adapter = this.adapters.get(namespace);
    
    if (adapter && adapter.supports(action)) {
      return adapter;
    }

    // Search all adapters for support
    for (const adapter of this.adapters.values()) {
      if (adapter.supports(action)) {
        return adapter;
      }
    }

    // No adapter found - build helpful error
    const availableAdapters = Array.from(this.adapters.keys());
    throw new AdapterNotFoundError(action, availableAdapters);
  }

  /**
   * Check if an action is supported
   * 
   * @param action - Action name to check
   * @returns True if any adapter supports the action
   */
  supports(action: string): boolean {
    try {
      this.resolve(action);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get adapter by name
   * 
   * @param name - Adapter name
   * @returns Adapter instance or undefined
   */
  get(name: string): Adapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapters
   * 
   * @returns Array of all adapters
   */
  getAll(): Adapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all adapter names
   * 
   * @returns Array of adapter names
   */
  getNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Initialize an adapter (call its initialize() method if present)
   * 
   * @param adapterName - Name of adapter to initialize
   */
  async initialize(adapterName: string): Promise<void> {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new AdapterNotFoundError(
        adapterName,
        Array.from(this.adapters.keys())
      );
    }

    // Skip if already initialized
    if (this.initialized.has(adapterName)) {
      return;
    }

    // Call initialize if present
    if (adapter.initialize) {
      await adapter.initialize();
    }

    this.initialized.add(adapterName);
  }

  /**
   * Initialize all registered adapters
   */
  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.adapters.keys()).map(name =>
      this.initialize(name)
    );
    await Promise.all(initPromises);
  }

  /**
   * Cleanup specific adapter
   * 
   * @param adapterName - Name of adapter to cleanup
   */
  async cleanup(adapterName: string): Promise<void> {
    const adapter = this.adapters.get(adapterName);
    if (adapter && adapter.cleanup) {
      await adapter.cleanup();
    }
    this.initialized.delete(adapterName);
  }

  /**
   * Cleanup all adapters
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.adapters.values())
      .filter(adapter => adapter.cleanup)
      .map(adapter => adapter.cleanup!());
    
    await Promise.allSettled(cleanupPromises);
    this.initialized.clear();
  }

  /**
   * Clear all registered adapters
   */
  clear(): void {
    this.adapters.clear();
    this.initialized.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    initialized: number;
    adapters: Array<{
      name: string;
      version: string;
      supportedActions: string[];
      isInitialized: boolean;
    }>;
  } {
    return {
      total: this.adapters.size,
      initialized: this.initialized.size,
      adapters: Array.from(this.adapters.values()).map(adapter => ({
        name: adapter.name,
        version: adapter.version,
        supportedActions: adapter.supportedActions,
        isInitialized: this.initialized.has(adapter.name),
      })),
    };
  }
}

/**
 * Global adapter registry instance (singleton pattern)
 * Use this for convenience, or create your own instance for isolation
 */
export const globalAdapterRegistry = new AdapterRegistry();
