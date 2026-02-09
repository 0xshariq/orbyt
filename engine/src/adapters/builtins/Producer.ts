/**
 * Message Queue Producer
 * 
 * Publishes messages to a queue.
 */

export interface MessageOptions {
  /**
   * Message priority (higher = more important)
   */
  priority?: number;

  /**
   * Message delay in milliseconds
   */
  delay?: number;

  /**
   * Message time-to-live in milliseconds
   */
  ttl?: number;

  /**
   * Message headers/metadata
   */
  headers?: Record<string, string>;

  /**
   * Message ID (optional, auto-generated if not provided)
   */
  messageId?: string;
}

export interface PublishResult {
  /**
   * Message ID
   */
  messageId: string;

  /**
   * Timestamp when message was published
   */
  timestamp: number;

  /**
   * Queue name
   */
  queue: string;
}

/**
 * Abstract Message Queue Producer
 */
export abstract class Producer {
  protected queue: string;

  constructor(queue: string) {
    this.queue = queue;
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
   * Publish a message
   */
  abstract publish(message: unknown, options?: MessageOptions): Promise<PublishResult>;

  /**
   * Publish multiple messages in a batch
   */
  abstract publishBatch(messages: Array<{ message: unknown; options?: MessageOptions }>): Promise<PublishResult[]>;

  /**
   * Check if producer is connected
   */
  abstract isConnected(): boolean;
}

/**
 * In-Memory Producer (for testing)
 */
export class MemoryProducer extends Producer {
  private connected = false;
  private messages: Array<{ message: unknown; options?: MessageOptions; timestamp: number }> = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async publish(message: unknown, options?: MessageOptions): Promise<PublishResult> {
    if (!this.connected) {
      throw new Error('Producer not connected');
    }

    const timestamp = Date.now();
    const messageId = options?.messageId || `msg_${timestamp}_${Math.random().toString(36).substring(7)}`;

    this.messages.push({ message, options, timestamp });

    return {
      messageId,
      timestamp,
      queue: this.queue,
    };
  }

  async publishBatch(messages: Array<{ message: unknown; options?: MessageOptions }>): Promise<PublishResult[]> {
    return Promise.all(messages.map(({ message, options }) => this.publish(message, options)));
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get all messages (for testing)
   */
  getMessages(): Array<{ message: unknown; options?: MessageOptions; timestamp: number }> {
    return [...this.messages];
  }

  /**
   * Clear all messages (for testing)
   */
  clear(): void {
    this.messages = [];
  }
}
