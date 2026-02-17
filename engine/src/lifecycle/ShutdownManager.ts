/**
 * Shutdown Manager
 * 
 * Handles graceful engine shutdown and cleanup.
 * 
 * @module lifecycle
 */

import { LoggerManager } from '../logging/LoggerManager.js';

/**
 * Shutdown handler function
 */
export type ShutdownHandler = () => Promise<void> | void;

/**
 * Shutdown manager for graceful engine shutdown
 */
export class ShutdownManager {
  private handlers: Array<{ name: string; handler: ShutdownHandler }> = [];
  private shutdownInProgress = false;

  /**
   * Register a shutdown handler
   * 
   * Handlers are executed in FIFO order on shutdown.
   * 
   * @param name - Handler name
   * @param handler - Shutdown handler function
   */
  registerHandler(name: string, handler: ShutdownHandler): void {
    this.handlers.push({ name, handler });
    LoggerManager.getLogger().debug('Shutdown handler registered', {
      handlerName: name,
      totalHandlers: this.handlers.length,
    });
  }

  /**
   * Execute all shutdown handlers
   * 
   * @param timeoutMs - Maximum time per handler
   */
  async executeHandlers(timeoutMs: number = 10000): Promise<void> {
    const logger = LoggerManager.getLogger();
    
    if (this.shutdownInProgress) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.shutdownInProgress = true;
    logger.info('🛑 Executing shutdown handlers', {
      handlerCount: this.handlers.length,
      timeoutMs,
    });

    for (const { name, handler } of this.handlers) {
      try {
        const handlerPromise = handler();
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        await Promise.race([handlerPromise, timeoutPromise]);
        logger.info(`  ✓ ${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`  ✗ ${name}: ${message}`);
        // Continue with other handlers even if one fails
      }
    }

    logger.info('Shutdown handlers completed');
    this.shutdownInProgress = false;
  }

  /**
   * Setup signal handlers for graceful shutdown
   * 
   * @param onShutdown - Function to call on shutdown signal
   */
  static setupSignalHandlers(onShutdown: () => Promise<void>): void {
    const logger = LoggerManager.getLogger();
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`📡 Received ${signal} signal`, { signal });
        
        try {
          await onShutdown();
          process.exit(0);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Shutdown error: ${message}`);
          process.exit(1);
        }
      });
    }

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Uncaught exception: ${message}`);
      
      try {
        await onShutdown();
      } catch {
        // Ignore errors during emergency shutdown
      }
      
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      logger.error(`Unhandled rejection: ${String(reason)}`);
      
      try {
        await onShutdown();
      } catch {
        // Ignore errors during emergency shutdown
      }
      
      process.exit(1);
    });
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this.shutdownInProgress;
  }
}
