/**
 * Secret Provider Interface
 * 
 * Abstract interface for secret storage backends.
 */

export interface SecretProvider {
  /**
   * Unique identifier for this provider
   */
  readonly name: string;

  /**
   * Initialize the provider
   */
  initialize(): Promise<void>;

  /**
   * Get a secret value
   */
  get(key: string): Promise<string | undefined>;

  /**
   * Set a secret value
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Delete a secret
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a secret exists
   */
  has(key: string): Promise<boolean>;

  /**
   * List all secret keys
   */
  list(): Promise<string[]>;

  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;
}

/**
 * In-Memory Secret Provider (for testing/development)
 */
export class MemorySecretProvider implements SecretProvider {
  public readonly name = 'memory';
  private secrets: Map<string, string> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.secrets.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.secrets.has(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }

  async cleanup(): Promise<void> {
    this.secrets.clear();
  }
}

/**
 * Environment Variable Secret Provider
 */
export class EnvSecretProvider implements SecretProvider {
  public readonly name = 'env';
  private prefix: string;

  constructor(prefix: string = 'ORBYT_SECRET_') {
    this.prefix = prefix;
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async get(key: string): Promise<string | undefined> {
    return process.env[this.prefix + key];
  }

  async set(key: string, value: string): Promise<void> {
    process.env[this.prefix + key] = value;
  }

  async delete(key: string): Promise<boolean> {
    if (process.env[this.prefix + key]) {
      delete process.env[this.prefix + key];
      return true;
    }
    return false;
  }

  async has(key: string): Promise<boolean> {
    return process.env[this.prefix + key] !== undefined;
  }

  async list(): Promise<string[]> {
    return Object.keys(process.env)
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.substring(this.prefix.length));
  }

  async cleanup(): Promise<void> {
    // Don't clear environment variables on cleanup
  }
}
