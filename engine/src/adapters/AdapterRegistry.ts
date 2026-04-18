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
import { LoggerManager } from '../logging/LoggerManager.js';

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
 * Adapter Registry
 * 
 * Manages the lifecycle and resolution of adapters.
 * Engine uses this to find the right adapter for each workflow step.
 */
export class AdapterRegistry {
  private adapters: Map<string, Adapter> = new Map();
  private initialized: Set<string> = new Set();
  private priorities: Map<string, number> = new Map();
  private registrationOrder: Map<string, number> = new Map();
  private nextRegistrationOrder = 0;

  /**
   * Register an adapter
   * 
   * @param adapter - Adapter to register
    *
    * Idempotent behavior:
    * - If adapter name already exists, registration is skipped.
   */
  register(adapter: Adapter, priority?: number): void {
    const logger = LoggerManager.getLogger();
    
    if (this.adapters.has(adapter.name)) {
      logger.debug(`[AdapterRegistry] Adapter '${adapter.name}' already registered, skipping`);
      return;
    }

    this.adapters.set(adapter.name, adapter);
    const resolvedPriority = Number.isFinite(priority)
      ? Number(priority)
      : Number.isFinite((adapter as any).priority)
        ? Number((adapter as any).priority)
        : 50;
    this.priorities.set(adapter.name, resolvedPriority);
    this.registrationOrder.set(adapter.name, this.nextRegistrationOrder++);
    
    logger.info(`[AdapterRegistry] Adapter registered: ${adapter.name}`, {
      adapterName: adapter.name,
      totalAdapters: this.adapters.size,
    });
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
      this.priorities.delete(adapterName);
      this.registrationOrder.delete(adapterName);
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
    const [namespace] = action.split('.');

    const candidates = Array.from(this.adapters.values()).filter(adapter => adapter.supports(action));
    if (candidates.length > 0) {
      candidates.sort((left, right) => {
        const leftNamespaceMatch = left.name === namespace ? 1 : 0;
        const rightNamespaceMatch = right.name === namespace ? 1 : 0;
        if (leftNamespaceMatch !== rightNamespaceMatch) {
          return rightNamespaceMatch - leftNamespaceMatch;
        }

        const leftPriority = this.priorities.get(left.name) ?? 50;
        const rightPriority = this.priorities.get(right.name) ?? 50;
        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }

        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) {
          return byName;
        }

        const leftOrder = this.registrationOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = this.registrationOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });

      return candidates[0];
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
    this.priorities.clear();
    this.registrationOrder.clear();
    this.nextRegistrationOrder = 0;
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
      priority: number;
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
        priority: this.priorities.get(adapter.name) ?? 50,
      })),
    };
  }
}

/**
 * Global adapter registry instance (singleton pattern)
 * Use this for convenience, or create your own instance for isolation
 */
export const globalAdapterRegistry = new AdapterRegistry();
