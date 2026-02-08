/**
 * Mock Adapter
 * 
 * Mock adapter for testing workflows without real execution.
 * Simulates adapter behavior with configurable responses.
 * 
 * @module testing
 * @status stub - will be enhanced when testing framework is needed
 */

import type { Adapter } from '../adapters/Adapter.js';

/**
 * Mock adapter configuration
 */
export interface MockAdapterConfig {
  /** Adapter name */
  name: string;
  
  /** Simulated delay (ms) */
  delay?: number;
  
  /** Mock response */
  response?: any;
  
  /** Should fail */
  shouldFail?: boolean;
  
  /** Error to throw */
  error?: Error;
}

/**
 * Mock Adapter
 * 
 * Simulates adapter execution for testing
 */
export class MockAdapter implements Adapter {
  readonly name: string;
  readonly version = '0.1.0';
  readonly supportedActions: string[] = ['*'];
  private config: MockAdapterConfig;
  private callCount = 0;
  private calls: Array<{ action: string; input: any; timestamp: Date }> = [];

  constructor(config: MockAdapterConfig) {
    this.name = config.name;
    this.config = config;
  }

  /**
   * Check if action is supported (mock always supports all actions)
   */
  supports(_action: string): boolean {
    return true;
  }

  /**
   * Execute mock action
   * 
   * @param action - Action to execute
   * @param input - Action input
   * @param _context - Execution context
   * @returns Mock response
   */
  async execute(action: string, input: any, _context?: any): Promise<any> {
    this.callCount++;
    this.calls.push({
      action,
      input,
      timestamp: new Date(),
    });

    // Simulate delay
    if (this.config.delay) {
      await this.sleep(this.config.delay);
    }

    // Simulate failure
    if (this.config.shouldFail) {
      throw this.config.error || new Error(`Mock adapter failed: ${action}`);
    }

    // Return mock response
    return this.config.response || {
      success: true,
      action,
      input,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get call count
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get all calls
   */
  getCalls() {
    return [...this.calls];
  }

  /**
   * Get last call
   */
  getLastCall() {
    return this.calls[this.calls.length - 1];
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.callCount = 0;
    this.calls = [];
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a mock adapter that always succeeds
   */
  static createSuccess(name: string, response?: any): MockAdapter {
    return new MockAdapter({
      name,
      response,
      shouldFail: false,
    });
  }

  /**
   * Create a mock adapter that always fails
   */
  static createFailure(name: string, error?: Error): MockAdapter {
    return new MockAdapter({
      name,
      shouldFail: true,
      error: error || new Error(`${name} failed`),
    });
  }

  /**
   * Create a slow mock adapter (simulates network delay)
   */
  static createSlow(name: string, delay: number): MockAdapter {
    return new MockAdapter({
      name,
      delay,
    });
  }
}
