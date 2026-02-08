/**
 * Shutdown Manager
 * 
 * Handles graceful engine shutdown and cleanup.
 * 
 * @module lifecycle
 */

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
  }

  /**
   * Execute all shutdown handlers
   * 
   * @param timeoutMs - Maximum time per handler
   */
  async executeHandlers(timeoutMs: number = 10000): Promise<void> {
    if (this.shutdownInProgress) {
      console.log('⚠️  Shutdown already in progress');
      return;
    }

    this.shutdownInProgress = true;
    console.log('🛑 Executing shutdown handlers...\n');

    for (const { name, handler } of this.handlers) {
      try {
        const handlerPromise = handler();
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        await Promise.race([handlerPromise, timeoutPromise]);
        console.log(`  ✓ ${name}`);
      } catch (error) {
        console.log(
          `  ✗ ${name}: ${error instanceof Error ? error.message : error}`
        );
        // Continue with other handlers even if one fails
      }
    }

    console.log('');
    this.shutdownInProgress = false;
  }

  /**
   * Setup signal handlers for graceful shutdown
   * 
   * @param onShutdown - Function to call on shutdown signal
   */
  static setupSignalHandlers(onShutdown: () => Promise<void>): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\n📡 Received ${signal} signal`);
        
        try {
          await onShutdown();
          process.exit(0);
        } catch (error) {
          console.error('❌ Shutdown error:', error);
          process.exit(1);
        }
      });
    }

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught exception:', error);
      
      try {
        await onShutdown();
      } catch {
        // Ignore errors during emergency shutdown
      }
      
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('❌ Unhandled rejection:', reason);
      
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
