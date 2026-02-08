/**
 * Database Adapter
 * 
 * Executes database queries across different database systems.
 * 
 * Supported actions:
 *   - db.query - Execute a query
 *   - db.execute - Execute a statement (alias)
 *   - db.transaction - Execute multiple queries in a transaction (future)
 * 
 * Supported databases:
 *   - PostgreSQL (via connection string)
 *   - MySQL (via connection string)
 *   - SQLite (via file path)
 *   - MongoDB (via connection string)
 * 
 * @module adapters/builtins
 */

import { BaseAdapter, type AdapterContext } from '../Adapter.js';

/**
 * Database query result
 */
interface DBResult {
  rows: any[];
  rowCount: number;
  fields?: string[];
  duration: number;
  query: string;
  database: string;
}

/**
 * Database connection configuration
 */
interface DBConnection {
  type: 'postgres' | 'mysql' | 'sqlite' | 'mongodb';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  file?: string; // For SQLite
}

/**
 * Database adapter
 * 
 * Note: This is a template implementation.
 * In production, you would need to install actual database drivers:
 *   - pg (PostgreSQL)
 *   - mysql2 (MySQL)
 *   - better-sqlite3 (SQLite)
 *   - mongodb (MongoDB)
 */
export class DBAdapter extends BaseAdapter {
  readonly name = 'db';
  readonly version = '1.0.0';
  readonly description = 'Database query execution adapter';
  readonly supportedActions = ['db.*'];

  private connections = new Map<string, any>();

  async execute(
    _action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<DBResult> {
    this.validateInput(input, ['query', 'connection']);

    const query = input.query;
    const connection: DBConnection = input.connection;
    const params = input.params || [];
    const timeout = input.timeout || 30000;

    context.log(`Executing DB query on ${connection.type}`);

    // Validate connection config
    this.validateConnection(connection);

    const result = await this.executeQuery(
      query,
      params,
      connection,
      timeout,
      context
    );

    return result;
  }

  /**
   * Validate connection configuration
   */
  private validateConnection(connection: DBConnection): void {
    if (!connection.type) {
      throw new Error('Database connection type is required');
    }

    const validTypes = ['postgres', 'mysql', 'sqlite', 'mongodb'];
    if (!validTypes.includes(connection.type)) {
      throw new Error(
        `Unsupported database type: ${connection.type}. ` +
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // SQLite requires file path
    if (connection.type === 'sqlite' && !connection.file) {
      throw new Error('SQLite requires "file" path in connection config');
    }

    // Other databases require connection string or host
    if (connection.type !== 'sqlite') {
      if (!connection.connectionString && !connection.host) {
        throw new Error(
          `${connection.type} requires either "connectionString" or "host"`
        );
      }
    }
  }

  /**
   * Execute database query
   * 
   * This is a template implementation that shows the structure.
   * In production, you'd implement actual database driver logic here.
   */
  private async executeQuery(
    query: string,
    _params: any[],
    connection: DBConnection,
    _timeout: number,
    context: AdapterContext
  ): Promise<DBResult> {
    const startTime = Date.now();

    try {
      // Template implementation - shows structure
      context.log('⚠️  Warning: DBAdapter is a template implementation');
      context.log('Install database drivers for production use:');
      context.log('  - npm install pg (PostgreSQL)');
      context.log('  - npm install mysql2 (MySQL)');
      context.log('  - npm install better-sqlite3 (SQLite)');
      context.log('  - npm install mongodb (MongoDB)');

      // Simulate query execution
      await this.delay(100);

      const duration = Date.now() - startTime;

      // Return mock result
      const result: DBResult = {
        rows: [],
        rowCount: 0,
        fields: [],
        duration,
        query,
        database: connection.database || connection.file || 'unknown',
      };

      context.log(`Query completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      context.log(
        `Query failed after ${duration}ms: ${error}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * PostgreSQL implementation example (requires 'pg' package)
   */
  private async executePostgres(
    query: string,
    params: any[],
    connection: DBConnection,
    context: AdapterContext
  ): Promise<DBResult> {
    const startTime = Date.now();

    try {
      // Example structure (requires pg package):
      // import { Pool } from 'pg';
      // const pool = new Pool({ connectionString: connection.connectionString });
      // const result = await pool.query(query, params);
      // await pool.end();

      throw new Error(
        'PostgreSQL adapter requires "pg" package: npm install pg'
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * MySQL implementation example (requires 'mysql2' package)
   */
  private async executeMySQL(
    query: string,
    params: any[],
    connection: DBConnection,
    context: AdapterContext
  ): Promise<DBResult> {
    const startTime = Date.now();

    try {
      // Example structure (requires mysql2 package):
      // import mysql from 'mysql2/promise';
      // const conn = await mysql.createConnection(connection.connectionString);
      // const [rows, fields] = await conn.execute(query, params);
      // await conn.end();

      throw new Error(
        'MySQL adapter requires "mysql2" package: npm install mysql2'
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * SQLite implementation example (requires 'better-sqlite3' package)
   */
  private async executeSQLite(
    query: string,
    params: any[],
    connection: DBConnection,
    context: AdapterContext
  ): Promise<DBResult> {
    const startTime = Date.now();

    try {
      // Example structure (requires better-sqlite3 package):
      // import Database from 'better-sqlite3';
      // const db = new Database(connection.file!);
      // const stmt = db.prepare(query);
      // const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
      // db.close();

      throw new Error(
        'SQLite adapter requires "better-sqlite3" package: npm install better-sqlite3'
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * MongoDB implementation example (requires 'mongodb' package)
   */
  private async executeMongoDB(
    query: string,
    params: any[],
    connection: DBConnection,
    context: AdapterContext
  ): Promise<DBResult> {
    const startTime = Date.now();

    try {
      // Example structure (requires mongodb package):
      // import { MongoClient } from 'mongodb';
      // const client = new MongoClient(connection.connectionString!);
      // await client.connect();
      // const db = client.db(connection.database);
      // const collection = db.collection(collectionName);
      // const results = await collection.find(query).toArray();
      // await client.close();

      throw new Error(
        'MongoDB adapter requires "mongodb" package: npm install mongodb'
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Utility: Delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup connections on adapter cleanup
   */
  override async cleanup(): Promise<void> {
    for (const [key, connection] of this.connections.entries()) {
      try {
        // Close connection based on type
        if (connection.end) {
          await connection.end();
        } else if (connection.close) {
          await connection.close();
        }
      } catch (error) {
        console.error(`Error closing connection ${key}:`, error);
      }
    }
    this.connections.clear();
  }
}
