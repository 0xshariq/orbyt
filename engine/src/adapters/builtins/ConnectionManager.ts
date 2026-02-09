/**
 * Connection Manager
 * 
 * Manages pooled connections to external services (databases, queues, etc.)
 */

export interface Connection {
  /**
   * Unique identifier for this connection
   */
  readonly id: string;

  /**
   * Check if connection is alive
   */
  isAlive(): Promise<boolean>;

  /**
   * Close the connection
   */
  close(): Promise<void>;
}

export interface ConnectionConfig {
  /**
   * Connection identifier
   */
  id: string;

  /**
   * Connection URL or configuration
   */
  url: string;

  /**
   * Maximum number of connections in pool
   */
  maxConnections?: number;

  /**
   * Idle timeout in milliseconds
   */
  idleTimeout?: number;

  /**
   * Connection timeout in milliseconds
   */
  connectionTimeout?: number;
}

export interface ConnectionFactory<T extends Connection> {
  /**
   * Create a new connection
   */
  create(config: ConnectionConfig): Promise<T>;
}

/**
 * Connection Pool Manager
 */
export class ConnectionManager<T extends Connection> {
  private pools: Map<string, ConnectionPool<T>> = new Map();
  private factory: ConnectionFactory<T>;

  constructor(factory: ConnectionFactory<T>) {
    this.factory = factory;
  }

  /**
   * Get or create a connection pool
   */
  async getPool(config: ConnectionConfig): Promise<ConnectionPool<T>> {
    const poolId = config.id || config.url;

    if (!this.pools.has(poolId)) {
      const pool = new ConnectionPool(this.factory, config);
      await pool.initialize();
      this.pools.set(poolId, pool);
    }

    return this.pools.get(poolId)!;
  }

  /**
   * Get a connection from a pool
   */
  async getConnection(id: string): Promise<T> {
    const pool = this.pools.get(id);
    if (!pool) {
      throw new Error(`Connection pool not found: ${id}`);
    }

    return pool.acquire();
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(id: string, connection: T): Promise<void> {
    const pool = this.pools.get(id);
    if (pool) {
      pool.release(connection);
    }
  }

  /**
   * Close all connections and pools
   */
  async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.close();
    }
    this.pools.clear();
  }

  /**
   * Close a specific connection pool
   */
  async closePool(id: string): Promise<void> {
    const pool = this.pools.get(id);
    if (pool) {
      await pool.close();
      this.pools.delete(id);
    }
  }

  /**
   * Get statistics for all pools
   */
  getStats(): Record<string, { active: number; idle: number; total: number }> {
    const stats: Record<string, { active: number; idle: number; total: number }> = {};

    for (const [id, pool] of this.pools) {
      stats[id] = pool.getStats();
    }

    return stats;
  }
}

/**
 * Connection Pool
 */
export class ConnectionPool<T extends Connection> {
  private factory: ConnectionFactory<T>;
  private config: ConnectionConfig;
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private idleTimeouts: Map<T, NodeJS.Timeout> = new Map();

  constructor(factory: ConnectionFactory<T>, config: ConnectionConfig) {
    this.factory = factory;
    this.config = {
      ...config,
      maxConnections: config.maxConnections || 10,
      idleTimeout: config.idleTimeout || 60000,
      connectionTimeout: config.connectionTimeout || 5000,
    };
  }

  async initialize(): Promise<void> {
    // Pre-create one connection
    const connection = await this.factory.create(this.config);
    this.available.push(connection);
  }

  async acquire(): Promise<T> {
    // Try to get an available connection
    if (this.available.length > 0) {
      const connection = this.available.pop()!;
      this.clearIdleTimeout(connection);
      this.inUse.add(connection);
      return connection;
    }

    // Create a new connection if under the limit
    const totalConnections = this.available.length + this.inUse.size;
    if (totalConnections < this.config.maxConnections!) {
      const connection = await this.factory.create(this.config);
      this.inUse.add(connection);
      return connection;
    }

    // Wait for a connection to become available
    throw new Error('Connection pool exhausted');
  }

  release(connection: T): void {
    if (this.inUse.has(connection)) {
      this.inUse.delete(connection);
      this.available.push(connection);
      this.setIdleTimeout(connection);
    }
  }

  private setIdleTimeout(connection: T): void {
    const timeout = setTimeout(async () => {
      const index = this.available.indexOf(connection);
      if (index !== -1) {
        this.available.splice(index, 1);
        await connection.close();
      }
      this.idleTimeouts.delete(connection);
    }, this.config.idleTimeout);

    this.idleTimeouts.set(connection, timeout);
  }

  private clearIdleTimeout(connection: T): void {
    const timeout = this.idleTimeouts.get(connection);
    if (timeout) {
      clearTimeout(timeout);
      this.idleTimeouts.delete(connection);
    }
  }

  async close(): Promise<void> {
    // Clear all idle timeouts
    for (const timeout of this.idleTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.idleTimeouts.clear();

    // Close all connections
    const allConnections = [...this.available, ...this.inUse];
    await Promise.all(allConnections.map(conn => conn.close()));

    this.available = [];
    this.inUse.clear();
  }

  getStats(): { active: number; idle: number; total: number } {
    return {
      active: this.inUse.size,
      idle: this.available.length,
      total: this.inUse.size + this.available.length,
    };
  }
}
