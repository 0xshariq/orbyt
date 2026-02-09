/**
 * Message Queue Consumer
 * 
 * Consumes messages from a queue.
 */

export interface Message<T = unknown> {
  /**
   * Message ID
   */
  id: string;

  /**
   * Message body
   */
  body: T;

  /**
   * Message headers/metadata
   */
  headers?: Record<string, string>;

  /**
   * Timestamp when message was published
   */
  timestamp: number;

  /**
   * Number of times this message has been delivered
   */
  deliveryCount: number;

  /**
   * Acknowledge the message
   */
  ack(): Promise<void>;

  /**
   * Reject the message (requeue or dead-letter)
   */
  nack(requeue?: boolean): Promise<void>;
}

export interface ConsumerOptions {
  /**
   * Number of messages to prefetch
   */
  prefetch?: number;

  /**
   * Auto-acknowledge messages
   */
  autoAck?: boolean;

  /**
   * Message visibility timeout in milliseconds
   */
  visibilityTimeout?: number;

  /**
   * Consumer tag/identifier
   */
  consumerTag?: string;
}

export type MessageHandler<T = unknown> = (message: Message<T>) => Promise<void>;

/**
 * Abstract Message Queue Consumer
 */
export abstract class Consumer {
  protected queue: string;
  protected options: ConsumerOptions;

  constructor(queue: string, options: ConsumerOptions = {}) {
    this.queue = queue;
    this.options = {
      prefetch: options.prefetch || 1,
      autoAck: options.autoAck ?? false,
      visibilityTimeout: options.visibilityTimeout || 30000,
      consumerTag: options.consumerTag || `consumer_${Date.now()}`,
    };
  }

  /**
   * Connect to the queue
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the queue
   */
  abstract disconnect(): Promise<void>;

  /**
   * Start consuming messages
   */
  abstract consume(handler: MessageHandler): Promise<void>;

  /**
   * Stop consuming messages
   */
  abstract stop(): Promise<void>;

  /**
   * Check if consumer is active
   */
  abstract isConsuming(): boolean;
}

/**
 * In-Memory Consumer (for testing)
 */
export class MemoryConsumer extends Consumer {
  private connected = false;
  private consuming = false;
  private messages: Array<{
    id: string;
    body: unknown;
    headers?: Record<string, string>;
    timestamp: number;
    deliveryCount: number;
  }> = [];
  private handler?: MessageHandler;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.consuming = false;
  }

  async consume(handler: MessageHandler): Promise<void> {
    if (!this.connected) {
      throw new Error('Consumer not connected');
    }

    this.handler = handler;
    this.consuming = true;

    // Start processing messages
    this.processMessages();
  }

  async stop(): Promise<void> {
    this.consuming = false;
  }

  isConsuming(): boolean {
    return this.consuming;
  }

  /**
   * Add a message to the queue (for testing)
   */
  addMessage(body: unknown, headers?: Record<string, string>): void {
    this.messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      body,
      headers,
      timestamp: Date.now(),
      deliveryCount: 0,
    });

    if (this.consuming) {
      this.processMessages();
    }
  }

  private async processMessages(): Promise<void> {
    while (this.consuming && this.messages.length > 0) {
      const msg = this.messages.shift();
      if (!msg || !this.handler) continue;

      msg.deliveryCount++;

      const message: Message = {
        id: msg.id,
        body: msg.body,
        headers: msg.headers,
        timestamp: msg.timestamp,
        deliveryCount: msg.deliveryCount,
        ack: async () => {
          // Message acknowledged, do nothing
        },
        nack: async (requeue = true) => {
          if (requeue) {
            this.messages.push(msg);
          }
        },
      };

      try {
        await this.handler(message);

        if (this.options.autoAck) {
          await message.ack();
        }
      } catch (error) {
        console.error('Error processing message:', error);
        await message.nack(true);
      }
    }
  }

  /**
   * Get pending messages count (for testing)
   */
  getPendingCount(): number {
    return this.messages.length;
  }

  /**
   * Clear all messages (for testing)
   */
  clear(): void {
    this.messages = [];
  }
}
