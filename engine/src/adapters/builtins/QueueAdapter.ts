/**
 * Queue Adapter
 * 
 * Provides message queue operations (publish, consume).
 */

import { Adapter, AdapterContext, AdapterCapabilities, AdapterMetadata } from '../Adapter.js';
import { AdapterResult, AdapterResultBuilder } from '../AdapterResult.js';
import { WorkflowValidationError, OrbytErrorCodes } from '@dev-ecosystem/core';
import { Producer, MemoryProducer, MessageOptions } from './Producer.js';
import { Consumer, MemoryConsumer, MessageHandler } from './Consumer.js';

export interface QueueAdapterConfig {
  /**
   * Default producer factory
   */
  producerFactory?: (queue: string) => Producer;

  /**
   * Default consumer factory
   */
  consumerFactory?: (queue: string) => Consumer;
}

/**
 * Queue Adapter
 * 
 * Supported actions:
 * - queue.publish: Publish a message to a queue
 * - queue.publishBatch: Publish multiple messages
 * - queue.consume: Start consuming messages (long-running)
 * - queue.stop: Stop consuming messages
 */
export class QueueAdapter implements Adapter {
  public readonly name = 'queue';
  public readonly version = '1.0.0';
  public readonly description = 'Message queue operations for asynchronous workflows';

  public readonly capabilities: AdapterCapabilities = {
    actions: ['queue.publish', 'queue.publishBatch', 'queue.consume', 'queue.stop'],
    concurrent: true,
    cacheable: false,
    idempotent: false,
    resources: {
      network: true,
    },
    cost: 'low',
  };

  public readonly metadata: AdapterMetadata = {
    name: 'Queue Adapter',
    version: '1.0.0',
    author: 'Orbyt Team',
    tags: ['queue', 'messaging', 'async'],
  };

  public readonly supportedActions = ['queue.publish', 'queue.publishBatch', 'queue.consume', 'queue.stop'];

  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();
  private producerFactory: (queue: string) => Producer;
  private consumerFactory: (queue: string) => Consumer;

  constructor(config: QueueAdapterConfig = {}) {
    this.producerFactory = config.producerFactory || ((queue: string) => new MemoryProducer(queue));
    this.consumerFactory = config.consumerFactory || ((queue: string) => new MemoryConsumer(queue));
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async cleanup(): Promise<void> {
    // Disconnect all producers and consumers
    for (const producer of this.producers.values()) {
      await producer.disconnect();
    }
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
    this.producers.clear();
    this.consumers.clear();
  }

  supports(action: string): boolean {
    return action.startsWith('queue.');
  }

  async execute(action: string, input: Record<string, any>, context: AdapterContext): Promise<AdapterResult> {
    const builder = new AdapterResultBuilder();
    const startTime = Date.now();
    
    // Log execution context for debugging
    context.log(`Executing queue.${action} for workspace: ${context.cwd || process.cwd()}`, 'info');

    try {
      let result: unknown;

      switch (action) {
        case 'queue.publish':
          result = await this.publishMessage(input);
          break;

        case 'queue.publishBatch':
          result = await this.publishBatch(input);
          break;

        case 'queue.consume':
          result = await this.consumeMessages(input);
          break;

        case 'queue.stop':
          result = await this.stopConsuming(input);
          break;

        default:
          throw new WorkflowValidationError(
            `Unsupported queue action: ${action}`,
            { action, hint: 'Supported actions: publish, publishBatch, consume, stop' }
          );
      }

      return builder
        .success(result)
        .effect(`queue:${action.replace('queue.', '')}`)
        .metrics({
          durationMs: Date.now() - startTime,
        })
        .build();
    } catch (error) {
      const err = error as Error;
      const errorCode = (error as any).code || OrbytErrorCodes.ADAPTER_EXECUTION_FAILED;
      return builder
        .failure({
          code: errorCode,
          message: err.message,
        })
        .metrics({
          durationMs: Date.now() - startTime,
        })
        .build();
    }
  }

  private async publishMessage(input: Record<string, any>): Promise<unknown> {
    const queueName = input.queue as string;
    const message = input.message;
    const options = input.options as MessageOptions | undefined;

    if (!queueName || message === undefined) {
      throw new WorkflowValidationError(
        'Missing required parameters: queue, message',
        { parameters: ['queue', 'message'] }
      );
    }

    const producer = await this.getProducer(queueName);
    const result = await producer.publish(message, options);

    return { queue: queueName, messageId: result };
  }

  private async publishBatch(input: Record<string, any>): Promise<unknown> {
    const queueName = input.queue as string;
    const messages = input.messages as Array<{ message: unknown; options?: MessageOptions }>;

    if (!queueName || !Array.isArray(messages)) {
      throw new WorkflowValidationError(
        'Missing required parameters: queue, messages (array)',
        { parameters: ['queue', 'messages'] }
      );
    }

    const producer = await this.getProducer(queueName);
    const results = await producer.publishBatch(messages);

    return { queue: queueName, results, count: results.length };
  }

  private async consumeMessages(input: Record<string, any>): Promise<unknown> {
    const queueName = input.queue as string;
    const handlerCode = input.handler as string;

    if (!queueName || !handlerCode) {
      throw new WorkflowValidationError(
        'Missing required parameters: queue, handler',
        { parameters: ['queue', 'handler'], hint: 'handler should be a function or workflow reference' }
      );
    }

    const consumer = await this.getConsumer(queueName);

    // For now, just start the consumer without a handler
    // In a real implementation, you would compile the handler code
    // or reference another workflow/step to handle messages
    const handler: MessageHandler = async (message) => {
      console.log('Received message:', message);
      console.log('Handler code:', handlerCode);
      // TODO: Execute handler code or workflow
      await message.ack();
    };

    await consumer.consume(handler);

    return {
      queue: queueName,
      status: 'consuming',
      consumerTag: queueName,
    };
  }

  private async stopConsuming(input: Record<string, any>): Promise<unknown> {
    const queueName = input.queue as string;

    if (!queueName) {
      throw new WorkflowValidationError(
        'Missing required parameter: queue',
        { parameter: 'queue' }
      );
    }

    const consumer = this.consumers.get(queueName);
    if (!consumer) {
      return { queue: queueName, status: 'not_consuming' };
    }

    await consumer.stop();
    await consumer.disconnect();
    this.consumers.delete(queueName);

    return { queue: queueName, status: 'stopped' };
  }

  private async getProducer(queue: string): Promise<Producer> {
    if (!this.producers.has(queue)) {
      const producer = this.producerFactory(queue);
      await producer.connect();
      this.producers.set(queue, producer);
    }

    return this.producers.get(queue)!;
  }

  private async getConsumer(queue: string): Promise<Consumer> {
    if (!this.consumers.has(queue)) {
      const consumer = this.consumerFactory(queue);
      await consumer.connect();
      this.consumers.set(queue, consumer);
    }

    return this.consumers.get(queue)!;
  }
}
