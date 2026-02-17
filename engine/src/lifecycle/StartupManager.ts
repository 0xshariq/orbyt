/**
 * Startup Manager
 * 
 * Handles engine initialization and startup checks.
 * 
 * @module lifecycle
 */

import { LoggerManager } from '../logging/LoggerManager.js';

/**
 * Startup check result
 */
export interface StartupCheck {
  name: string;
  passed: boolean;
  message?: string;
  duration: number;
}

/**
 * Startup check function
 */
export type CheckFunction = () => Promise<void> | void;

/**
 * Startup manager for engine initialization
 */
export class StartupManager {
  private checks: Map<string, CheckFunction> = new Map();

  /**
   * Register a startup check
   * 
   * @param name - Check name
   * @param checkFn - Check function (should throw on failure)
   */
  registerCheck(name: string, checkFn: CheckFunction): void {
    this.checks.set(name, checkFn);
    LoggerManager.getLogger().debug('Startup check registered', {
      checkName: name,
      totalChecks: this.checks.size,
    });
  }

  /**
   * Run all startup checks
   * 
   * @returns Array of check results
   * @throws {Error} If any critical check fails
   */
  async runChecks(): Promise<StartupCheck[]> {
    const results: StartupCheck[] = [];
    const logger = LoggerManager.getLogger();
    
    logger.info('🔍 Running startup checks...', {
      totalChecks: this.checks.size,
    });

    for (const [name, checkFn] of this.checks.entries()) {
      const startTime = Date.now();
      
      try {
        await checkFn();
        const duration = Date.now() - startTime;
        
        results.push({
          name,
          passed: true,
          duration,
        });
        
        logger.info(`  ✓ ${name}`, { duration });
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        
        results.push({
          name,
          passed: false,
          message,
          duration,
        });
        
        logger.error(`  ✗ ${name}: ${message} (${duration}ms)`);
      }
    }

    // Check if any failed
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      const failedList = failed.map(f => `${f.name}: ${f.message}`).join(', ');
      logger.error(`Startup checks failed: ${failedList}`);
      throw new Error(
        `${failed.length} startup check(s) failed:\n` +
        failed.map(f => `  - ${f.name}: ${f.message}`).join('\n')
      );
    }

    logger.info('All startup checks passed', {
      totalChecks: results.length,
    });

    return results;
  }

  /**
   * Create default startup checks
   */
  static createDefaultChecks(): StartupManager {
    const manager = new StartupManager();
    manager.registerCheck('Node.js version', () => {
      const version = process.versions.node;
      const major = parseInt(version.split('.')[0], 10);
      
      if (major < 18) {
        throw new Error(
          `Node.js ${version} is not supported. Minimum: 18.0.0`
        );
      }
    });

    // Check memory availability
    manager.registerCheck('Memory availability', () => {
      const freeMem = process.memoryUsage().heapTotal;
      const minRequired = 100 * 1024 * 1024; // 100MB
      
      if (freeMem < minRequired) {
        throw new Error(
          `Insufficient memory: ${Math.round(freeMem / 1024 / 1024)}MB available, ` +
          `${Math.round(minRequired / 1024 / 1024)}MB required`
        );
      }
    });

    // Check environment
    manager.registerCheck('Environment variables', () => {
      // Add any required env var checks here
      // Example:
      // if (!process.env.REQUIRED_VAR) {
      //   throw new Error('REQUIRED_VAR not set');
      // }
    });

    return manager;
  }
}
