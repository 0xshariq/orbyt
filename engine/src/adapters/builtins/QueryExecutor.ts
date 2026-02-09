/**
 * Query Executor
 * 
 * Executes database queries with connection pooling and error handling.
 */

import { AdapterExecutionError } from '@dev-ecosystem/core';

export interface QueryOptions {
  /**
   * Query parameters (for parameterized queries)
   */
  params?: unknown[];

  /**
   * Query timeout in milliseconds
   */
  timeout?: number;

  /**
   * Transaction ID (if part of a transaction)
   */
  transactionId?: string;

  /**
   * Read-only query
   */
  readOnly?: boolean;
}

export interface QueryResult<T = unknown> {
  /**
   * Result rows
   */
  rows: T[];

  /**
   * Number of rows affected
   */
  rowCount: number;

  /**
   * Field metadata
   */
  fields?: Array<{
    name: string;
    dataType: string;
  }>;

  /**
   * Execution time in milliseconds
   */
  duration: number;
}

/**
 * Abstract Query Executor
 */
export abstract class QueryExecutor {
  protected connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  /**
   * Connect to database
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from database
   */
  abstract disconnect(): Promise<void>;

  /**
   * Execute a query
   */
  abstract query<T = unknown>(sql: string, options?: QueryOptions): Promise<QueryResult<T>>;

  /**
   * Execute a query and return first row
   */
  async queryOne<T = unknown>(sql: string, options?: QueryOptions): Promise<T | undefined> {
    const result = await this.query<T>(sql, options);
    return result.rows[0];
  }

  /**
   * Execute multiple queries in a transaction
   */
  abstract transaction<T = unknown>(queries: Array<{ sql: string; options?: QueryOptions }>): Promise<QueryResult<T>[]>;

  /**
   * Check if connected
   */
  abstract isConnected(): boolean;
}

/**
 * Mock Query Executor (for testing)
 */
export class MockQueryExecutor extends QueryExecutor {
  private connected = false;
  private mockData: Map<string, unknown[]> = new Map();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query<T = unknown>(sql: string, options?: QueryOptions): Promise<QueryResult<T>> {
    if (!this.connected) {
      throw new AdapterExecutionError(
        'Database not connected',
        { hint: 'Call connect() before executing queries' }
      );
    }

    const startTime = Date.now();

    // Apply options if provided
    let rows = (this.mockData.get(sql) || []) as T[];
    
    // Apply limit from options
    if (options?.params && Array.isArray(options.params)) {
      // In real implementation, params would be used for parameterized queries
      // For mock, we just log them
      console.log('Query params:', options.params);
    }
    
    // Check timeout
    if (options?.timeout) {
      const elapsed = Date.now() - startTime;
      if (elapsed > options.timeout) {
        throw new AdapterExecutionError(
          'Query timeout exceeded',
          { timeout: options.timeout, elapsed }
        );
      }
    }

    return {
      rows,
      rowCount: rows.length,
      fields: [],
      duration: Date.now() - startTime,
    };
  }

  async transaction<T = unknown>(queries: Array<{ sql: string; options?: QueryOptions }>): Promise<QueryResult<T>[]> {
    const results: QueryResult<T>[] = [];

    for (const { sql, options } of queries) {
      const result = await this.query<T>(sql, options);
      results.push(result);
    }

    return results;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Set mock data for a query
   */
  setMockData(sql: string, data: unknown[]): void {
    this.mockData.set(sql, data);
  }

  /**
   * Clear all mock data
   */
  clearMockData(): void {
    this.mockData.clear();
  }
}
