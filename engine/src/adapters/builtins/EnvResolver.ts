/**
 * Environment Variable Resolver
 * 
 * Resolves environment variables with default values and type coercion.
 */

export interface EnvResolverOptions {
  /**
   * Prefix for environment variables
   */
  prefix?: string;

  /**
   * Default values
   */
  defaults?: Record<string, string>;

  /**
   * Allow undefined variables
   */
  allowUndefined?: boolean;
}

export class EnvResolver {
  private prefix: string;
  private defaults: Record<string, string>;
  private allowUndefined: boolean;

  constructor(options: EnvResolverOptions = {}) {
    this.prefix = options.prefix || '';
    this.defaults = options.defaults || {};
    this.allowUndefined = options.allowUndefined ?? false;
  }

  /**
   * Get an environment variable
   */
  get(key: string, defaultValue?: string): string | undefined {
    const fullKey = this.prefix + key;
    const value = process.env[fullKey] ?? this.defaults[key] ?? defaultValue;

    if (value === undefined && !this.allowUndefined) {
      throw new Error(`Environment variable ${fullKey} is not defined`);
    }

    return value;
  }

  /**
   * Get a required environment variable
   */
  getRequired(key: string): string {
    const value = this.get(key);
    if (value === undefined) {
      throw new Error(`Required environment variable ${this.prefix}${key} is not defined`);
    }
    return value;
  }

  /**
   * Get an environment variable as a number
   */
  getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key, defaultValue?.toString());
    if (value === undefined) return undefined;

    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Environment variable ${this.prefix}${key} is not a valid number: ${value}`);
    }

    return num;
  }

  /**
   * Get an environment variable as a boolean
   */
  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(key, defaultValue?.toString());
    if (value === undefined) return undefined;

    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;

    throw new Error(`Environment variable ${this.prefix}${key} is not a valid boolean: ${value}`);
  }

  /**
   * Get an environment variable as an array (comma-separated)
   */
  getArray(key: string, defaultValue?: string[]): string[] | undefined {
    const value = this.get(key, defaultValue?.join(','));
    if (value === undefined) return undefined;

    return value.split(',').map(v => v.trim()).filter(Boolean);
  }

  /**
   * Get an environment variable as JSON
   */
  getJSON<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;

    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(
        `Environment variable ${this.prefix}${key} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Set an environment variable
   */
  set(key: string, value: string): void {
    process.env[this.prefix + key] = value;
  }

  /**
   * Check if an environment variable exists
   */
  has(key: string): boolean {
    return process.env[this.prefix + key] !== undefined;
  }

  /**
   * Get all environment variables with the prefix
   */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    const prefixLength = this.prefix.length;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(this.prefix) && value !== undefined) {
        result[key.substring(prefixLength)] = value;
      }
    }

    return result;
  }

  /**
   * Resolve variables in a string
   */
  resolve(template: string): string {
    return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const [key, defaultVal] = varName.split(':').map((s: string) => s.trim());
      return this.get(key, defaultVal) || match;
    });
  }
}
