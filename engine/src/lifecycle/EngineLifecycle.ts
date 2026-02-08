/**
 * Engine Lifecycle Manager
 * 
 * Manages engine startup, runtime, and shutdown phases.
 * Coordinates initialization and cleanup of all engine components.
 * 
 * @module lifecycle
 */

/**
 * Engine lifecycle state
 */
export enum EngineState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

/**
 * Lifecycle event
 */
export interface LifecycleEvent {
  state: EngineState;
  timestamp: Date;
  details?: string;
  error?: Error;
}

/**
 * Lifecycle event listener
 */
export type LifecycleListener = (event: LifecycleEvent) => void;

/**
 * Component that requires lifecycle management
 */
export interface LifecycleComponent {
  name: string;
  
  /**
   * Initialize component
   */
  start?(): Promise<void>;
  
  /**
   * Cleanup component
   */
  stop?(): Promise<void>;
}

/**
 * Engine lifecycle manager
 */
export class EngineLifecycle {
  private state: EngineState = EngineState.STOPPED;
  private components: LifecycleComponent[] = [];
  private listeners: LifecycleListener[] = [];
  private stateHistory: LifecycleEvent[] = [];

  /**
   * Register a lifecycle component
   * 
   * @param component - Component to register
   */
  registerComponent(component: LifecycleComponent): void {
    if (this.state !== EngineState.STOPPED) {
      throw new Error(
        'Cannot register components while engine is running'
      );
    }
    
    this.components.push(component);
  }

  /**
   * Register multiple components
   * 
   * @param components - Components to register
   */
  registerComponents(components: LifecycleComponent[]): void {
    for (const component of components) {
      this.registerComponent(component);
    }
  }

  /**
   * Add state change listener
   * 
   * @param listener - Listener function
   */
  on(listener: LifecycleListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove state change listener
   * 
   * @param listener - Listener to remove
   */
  off(listener: LifecycleListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Start the engine
   * 
   * Initializes all registered components in order.
   */
  async start(): Promise<void> {
    if (this.state !== EngineState.STOPPED) {
      throw new Error(
        `Cannot start engine from state: ${this.state}`
      );
    }

    this.setState(EngineState.STARTING, 'Engine starting...');

    try {
      // Start components in order
      for (const component of this.components) {
        if (component.start) {
          this.emit('info', `Starting ${component.name}...`);
          await component.start();
          this.emit('info', `${component.name} started`);
        }
      }

      this.setState(EngineState.RUNNING, 'Engine running');
      this.emit('info', 'Engine started successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setState(EngineState.ERROR, 'Engine start failed', err);
      throw err;
    }
  }

  /**
   * Stop the engine
   * 
   * Cleanly shuts down all components in reverse order.
   */
  async stop(): Promise<void> {
    if (this.state === EngineState.STOPPED) {
      return; // Already stopped
    }

    if (this.state === EngineState.STOPPING) {
      throw new Error('Engine is already stopping');
    }

    this.setState(EngineState.STOPPING, 'Engine stopping...');

    try {
      // Stop components in reverse order
      const reversedComponents = [...this.components].reverse();
      
      for (const component of reversedComponents) {
        if (component.stop) {
          this.emit('info', `Stopping ${component.name}...`);
          try {
            await component.stop();
            this.emit('info', `${component.name} stopped`);
          } catch (error) {
            // Log but continue stopping other components
            this.emit(
              'error',
              `Error stopping ${component.name}: ${error}`
            );
          }
        }
      }

      this.setState(EngineState.STOPPED, 'Engine stopped');
      this.emit('info', 'Engine stopped successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setState(EngineState.ERROR, 'Engine stop failed', err);
      throw err;
    }
  }

  /**
   * Graceful shutdown with timeout
   * 
   * @param timeoutMs - Maximum time to wait for shutdown
   */
  async gracefulShutdown(timeoutMs: number = 30000): Promise<void> {
    const shutdownPromise = this.stop();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(
          `Engine shutdown timed out after ${timeoutMs}ms`
        ));
      }, timeoutMs);
    });

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
    } catch (error) {
      this.emit('error', `Forced shutdown: ${error}`);
      // Force state to stopped
      this.state = EngineState.STOPPED;
      throw error;
    }
  }

  /**
   * Get current engine state
   */
  getState(): EngineState {
    return this.state;
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.state === EngineState.RUNNING;
  }

  /**
   * Get state history
   */
  getHistory(): LifecycleEvent[] {
    return [...this.stateHistory];
  }

  /**
   * Get registered components
   */
  getComponents(): LifecycleComponent[] {
    return [...this.components];
  }

  /**
   * Set engine state and notify listeners
   */
  private setState(
    state: EngineState,
    details?: string,
    error?: Error
  ): void {
    this.state = state;
    
    const event: LifecycleEvent = {
      state,
      timestamp: new Date(),
      details,
      error,
    };

    this.stateHistory.push(event);
    
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in lifecycle listener:', err);
      }
    }
  }

  /**
   * Emit log message to console
   */
  private emit(level: 'info' | 'error', message: string): void {
    const prefix = level === 'error' ? '❌' : '✓';
    console.log(`${prefix} [Lifecycle] ${message}`);
  }
}
