/**
 * Driver Resolver
 * 
 * Resolves and dispatches steps to the appropriate execution driver.
 * 
 * @module execution/drivers
 */

import type { ExecutionDriver, DriverStep, DriverContext } from './ExecutionDriver.js';
import type { AdapterResult } from '../../adapters/AdapterResult.js';
import { OrbytError } from '../../errors/OrbytError.js';
import { OrbytErrorCode, ErrorSeverity } from '../../errors/ErrorCodes.js';

/**
 * Driver not found error
 */
export class DriverNotFoundError extends OrbytError {
  constructor(stepId: string, uses: string, availableDrivers: string[]) {
    super({
      code: OrbytErrorCode.EXECUTION_ADAPTER_ERROR,
      message: `No driver found to execute step '${stepId}' with uses '${uses}'`,
      severity: ErrorSeverity.ERROR,
      path: `workflow.steps.${stepId}`,
      hint: `Available drivers: ${availableDrivers.join(', ')}. Check your step configuration.`,
      context: {
        stepId,
        uses,
        availableDrivers,
      },
    });
  }
}

/**
 * Driver Resolver
 * 
 * Manages driver registration and resolves steps to appropriate drivers.
 */
export class DriverResolver {
  private drivers: ExecutionDriver[] = [];
  private initialized = new Set<string>();

  /**
   * Register a driver
   */
  register(driver: ExecutionDriver): void {
    // Check for duplicate
    const existing = this.drivers.find(d => d.type === driver.type);
    if (existing) {
      throw new Error(`Driver '${driver.type}' is already registered`);
    }
    
    this.drivers.push(driver);
  }

  /**
   * Register multiple drivers
   */
  registerAll(drivers: ExecutionDriver[]): void {
    for (const driver of drivers) {
      this.register(driver);
    }
  }

  /**
   * Unregister a driver
   */
  unregister(driverType: string): boolean {
    const index = this.drivers.findIndex(d => d.type === driverType);
    if (index !== -1) {
      const driver = this.drivers[index];
      
      // Cleanup if initialized
      if (this.initialized.has(driverType) && driver.cleanup) {
        driver.cleanup().catch(err => {
          console.error(`Error cleaning up driver ${driverType}:`, err);
        });
      }
      
      this.initialized.delete(driverType);
      this.drivers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Resolve driver for a step
   * 
   * @param step - Step to resolve driver for
   * @returns Driver that can handle this step
   * @throws {DriverNotFoundError} If no driver can handle the step
   */
  resolve(step: DriverStep): ExecutionDriver {
    for (const driver of this.drivers) {
      if (driver.canHandle(step)) {
        return driver;
      }
    }
    
    // No driver found
    const availableDrivers = this.drivers.map(d => d.type);
    throw new DriverNotFoundError(step.id, step.uses, availableDrivers);
  }

  /**
   * Execute a step using the appropriate driver
   * 
   * @param step - Step to execute
   * @param context - Execution context
   * @returns Execution result
   */
  async execute(
    step: DriverStep,
    context: DriverContext
  ): Promise<AdapterResult> {
    // Resolve driver
    const driver = this.resolve(step);
    
    // Initialize driver if needed
    if (!this.initialized.has(driver.type) && driver.initialize) {
      await driver.initialize();
      this.initialized.add(driver.type);
    }
    
    // Execute step
    context.log(`Using driver: ${driver.name} (${driver.type})`);
    return driver.execute(step, context);
  }

  /**
   * Get all registered drivers
   */
  getAll(): ExecutionDriver[] {
    return [...this.drivers];
  }

  /**
   * Get driver by type
   */
  get(type: string): ExecutionDriver | undefined {
    return this.drivers.find(d => d.type === type);
  }

  /**
   * Initialize all drivers
   */
  async initializeAll(): Promise<void> {
    const initPromises = this.drivers
      .filter(d => d.initialize && !this.initialized.has(d.type))
      .map(async d => {
        await d.initialize!();
        this.initialized.add(d.type);
      });
    
    await Promise.all(initPromises);
  }

  /**
   * Cleanup all drivers
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = this.drivers
      .filter(d => d.cleanup)
      .map(d => d.cleanup!());
    
    await Promise.allSettled(cleanupPromises);
    this.initialized.clear();
  }

  /**
   * Clear all drivers
   */
  clear(): void {
    this.drivers = [];
    this.initialized.clear();
  }

  /**
   * Get resolver statistics
   */
  getStats(): {
    total: number;
    initialized: number;
    drivers: Array<{
      type: string;
      name: string;
      version: string;
      isInitialized: boolean;
    }>;
  } {
    return {
      total: this.drivers.length,
      initialized: this.initialized.size,
      drivers: this.drivers.map(d => ({
        type: d.type,
        name: d.name,
        version: d.version,
        isInitialized: this.initialized.has(d.type),
      })),
    };
  }
}

/**
 * Global driver resolver instance (singleton pattern)
 */
export const globalDriverResolver = new DriverResolver();
