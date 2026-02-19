import { OrbytEvent } from "../types/core-types.js";


/**
 * Event handler function signature
 */
export type EventHandler<T = any> = (event: OrbytEvent<T>) => void | Promise<void>;

/**
 * EventBus - Central pub/sub system for Orbyt Engine
 * 
 * Provides decoupled communication between engine components:
 * - Executors emit events at lifecycle moments
 * - Loggers, metrics, monitors subscribe to events
 * - Plugins can hook into engine behavior
 * 
 * Design Philosophy:
 * - Simple: Map-based lookup, no complex routing
 * - Async-safe: Handlers can be sync or async
 * - Error-isolated: Handler failures don't affect other handlers
 * - Wildcard support: Listen to all events with '*'
 * 
 * @example
 * ```ts
 * const bus = new EventBus();
 * 
 * // Subscribe to specific event
 * bus.on('step.completed', (event) => {
 *   console.log('Step done:', event.payload);
 * });
 * 
 * // Subscribe to all events
 * bus.on('*', (event) => {
 *   logger.log(event);
 * });
 * 
 * // Emit event
 * bus.emit(createEvent('step.completed', { stepId: 'test' }));
 * ```
 */
export class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();
  private wildcardListeners: EventHandler[] = [];

  /**
   * Subscribe to events of a specific type
   * 
   * @param eventType - The event type to listen for, or '*' for all events
   * @param handler - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on(eventType: string, handler: EventHandler): () => void {
    if (eventType === '*') {
      this.wildcardListeners.push(handler);
      return () => {
        const index = this.wildcardListeners.indexOf(handler);
        if (index !== -1) {
          this.wildcardListeners.splice(index, 1);
        }
      };
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to multiple event types with the same handler
   * 
   * @param eventTypes - Array of event types to listen for
   * @param handler - Function to call when any of the events is emitted
   * @returns Unsubscribe function that removes all subscriptions
   */
  onMany(eventTypes: string[], handler: EventHandler): () => void {
    const unsubscribers = eventTypes.map((type) => this.on(type, handler));
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Subscribe to an event, but only fire once then auto-unsubscribe
   * 
   * @param eventType - The event type to listen for
   * @param handler - Function to call when event is emitted
   */
  once(eventType: string, handler: EventHandler): void {
    const wrappedHandler: EventHandler = (event) => {
      handler(event);
      unsubscribe();
    };
    const unsubscribe = this.on(eventType, wrappedHandler);
  }

  /**
   * Emit an event to all subscribed handlers
   * 
   * Handlers are called in registration order. Async handlers are awaited.
   * If a handler throws, the error is caught and logged to prevent
   * cascading failures.
   * 
   * @param event - The event to emit
   */
  async emit(event: OrbytEvent): Promise<void> {
    const handlers = this.listeners.get(event.type) || [];
    const allHandlers = [...handlers, ...this.wildcardListeners];

    for (const handler of allHandlers) {
      try {
        await handler(event);
      } catch (error) {
        // Isolate handler errors - don't let one bad handler break the system
        console.error(
          `[EventBus] Handler error for event '${event.type}':`,
          error
        );
      }
    }
  }

  /**
   * Emit event synchronously without awaiting async handlers
   * Use when you need fire-and-forget behavior
   * 
   * @param event - The event to emit
   */
  emitSync(event: OrbytEvent): void {
    const handlers = this.listeners.get(event.type) || [];
    const allHandlers = [...handlers, ...this.wildcardListeners];

    for (const handler of allHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(
          `[EventBus] Handler error for event '${event.type}':`,
          error
        );
      }
    }
  }

  /**
   * Remove all handlers for a specific event type
   * 
   * @param eventType - The event type to clear
   */
  off(eventType: string): void {
    this.listeners.delete(eventType);
  }

  /**
   * Remove all event handlers
   */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners = [];
  }

  /**
   * Get count of listeners for an event type (useful for debugging)
   * 
   * @param eventType - The event type to count
   * @returns Number of listeners
   */
  listenerCount(eventType: string): number {
    return (this.listeners.get(eventType) || []).length;
  }

  /**
   * Get all event types that have listeners
   * 
   * @returns Array of event types
   */
  getEventTypes(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Check if an event type has any listeners
   * 
   * @param eventType - The event type to check
   * @returns True if there are listeners
   */
  hasListeners(eventType: string): boolean {
    const handlers = this.listeners.get(eventType);
    return (handlers && handlers.length > 0) || this.wildcardListeners.length > 0;
  }
}
