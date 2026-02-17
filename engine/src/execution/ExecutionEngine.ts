/**
 * Execution Engine
 * 
 * Main orchestrator integrating scheduling, queueing, and workflow execution.
 * Provides the central API for triggering and executing workflows.
 * 
 * Architecture:
 * - Scheduler: Manages cron, interval, and event-based triggers
 * - JobQueue: Queues workflow execution jobs
 * - WorkflowExecutor: Executes workflows with proper state management
 * - StepExecutor: Executes individual steps with adapters
 * 
 * @module execution
 */

import { randomUUID } from 'node:crypto';
import type { ParsedWorkflow } from '../parser/WorkflowParser.js';
import { WorkflowParser } from '../parser/WorkflowParser.js';
import { WorkflowExecutor, type WorkflowResult, type ExecutionOptions } from './WorkflowExecutor.js';
import { StepExecutor } from './StepExecutor.js';
import { Scheduler } from '../scheduling/Scheduler.js';
import type { JobQueue, Job } from '../queue/JobQueue.js';
import { InMemoryQueue } from '../queue/InMemoryQueue.js';
import { JobPriority, createJob } from '../queue/JobQueue.js';
import { RetryPolicy } from '../automation/RetryPolicy.js';
import { TimeoutManager } from '../automation/TimeoutManager.js';
import { EventBus } from '../events/EventBus.js';
import { HookManager } from '../hooks/HookManager.js';
import { EngineEventType, createEvent } from '../events/EngineEvents.js';
import type { LifecycleHook } from '../hooks/LifecycleHooks.js';
import { LoggerManager } from '../logging/LoggerManager.js';

/**
 * Execution trigger type
 */
export type TriggerType = 'manual' | 'scheduled' | 'event' | 'webhook';

/**
 * Workflow execution job payload
 */
export interface WorkflowExecutionPayload {
  /** Workflow definition (YAML string or parsed object) */
  workflow: string | ParsedWorkflow;

  /** Execution options */
  options?: ExecutionOptions;

  /** Trigger information */
  trigger: {
    type: TriggerType;
    source?: string;
    metadata?: Record<string, any>;
  };
}

/**
 * Execution engine configuration
 */
export interface EngineConfig {
  /** Maximum concurrent workflow executions */
  maxConcurrentExecutions?: number;

  /** Default workflow timeout (ms) */
  defaultTimeout?: number;

  /** Enable scheduler */
  enableScheduler?: boolean;

  /** Custom job queue (default: InMemoryQueue) */
  queue?: JobQueue;

  /** Global retry policy for workflows */
  retryPolicy?: RetryPolicy;

  /** Timeout manager instance */
  timeoutManager?: TimeoutManager;
}

/**
 * Workflow execution status
 */
export interface WorkflowExecutionStatus {
  /** Execution ID */
  executionId: string;

  /** Workflow name */
  workflowName: string;

  /** Current status */
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout';

  /** Trigger information */
  trigger: {
    type: TriggerType;
    source?: string;
    triggeredAt: Date;
  };

  /** Execution result (if completed) */
  result?: WorkflowResult;

  /** Error (if failed) */
  error?: Error;

  /** Progress information */
  progress?: {
    currentStep?: string;
    completedSteps: number;
    totalSteps: number;
  };
}

/**
 * Main execution engine
 */
export class ExecutionEngine {
  private config: EngineConfig & {
    maxConcurrentExecutions: number;
    defaultTimeout: number;
    enableScheduler: boolean;
    queue: JobQueue;
  };
  private queue: JobQueue;
  private scheduler?: Scheduler;
  private stepExecutor: StepExecutor;
  private workflowExecutor: WorkflowExecutor;

  // Event system
  private eventBus: EventBus;
  private hookManager: HookManager;

  // Execution tracking
  private executions = new Map<string, WorkflowExecutionStatus>();
  private runningExecutions = new Set<string>();

  // State
  private isRunning = false;

  constructor(config: EngineConfig = {}) {
    // Apply defaults
    this.config = {
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 10,
      defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
      enableScheduler: config.enableScheduler ?? true,
      queue: config.queue ?? new InMemoryQueue(),
      retryPolicy: config.retryPolicy,
      timeoutManager: config.timeoutManager,
    };

    // Initialize event system
    this.eventBus = new EventBus();
    this.hookManager = new HookManager();

    // Initialize components
    this.queue = this.config.queue;
    this.stepExecutor = new StepExecutor();
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor);

    // Pass event bus and hook manager to executors
    this.stepExecutor.setEventBus(this.eventBus);
    this.stepExecutor.setHookManager(this.hookManager);
    this.workflowExecutor.setEventBus(this.eventBus);
    this.workflowExecutor.setHookManager(this.hookManager);

    // Configure StepExecutor with automation policies
    if (this.config.retryPolicy) {
      this.stepExecutor.setRetryPolicy(this.config.retryPolicy);
    }
    if (this.config.timeoutManager) {
      this.stepExecutor.setTimeoutManager(this.config.timeoutManager);
    }

    // Initialize scheduler if enabled
    if (this.config.enableScheduler) {
      this.scheduler = new Scheduler(
        this.queue,
        {},
        async (schedule, _execution) => {
          // Handle scheduled workflow execution
          console.log('Scheduled workflow triggered:', schedule.id);
        }
      );
    }
  }

  /**
   * Start the execution engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Execution engine is already running');
    }

    this.isRunning = true;

    // Emit engine started event
    await this.eventBus.emit(createEvent(EngineEventType.ENGINE_STARTED, {
      timestamp: Date.now(),
    }));

    // Start scheduler if enabled
    if (this.scheduler) {
      await this.scheduler.start();
    }

    // Start processing queue
    this.processQueue();
  }

  /**
   * Stop the execution engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop scheduler
    if (this.scheduler) {
      await this.scheduler.stop();
    }

    // Wait for running executions to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.runningExecutions.size > 0 && Date.now() - startTime < timeout) {
      await this.sleep(1000);
    }

    if (this.runningExecutions.size > 0) {
      console.warn(`${this.runningExecutions.size} executions still running after timeout`);
    }

    // Emit engine stopped event
    await this.eventBus.emit(createEvent(EngineEventType.ENGINE_STOPPED, {
      timestamp: Date.now(),
      runningExecutions: this.runningExecutions.size,
    }));
  }

  /**
   * Execute a workflow manually
   * 
   * @param workflow - Workflow definition (YAML string or parsed)
   * @param options - Execution options
   * @returns Execution ID
   */
  async executeWorkflow(
    workflow: string | ParsedWorkflow,
    options: ExecutionOptions = {}
  ): Promise<string> {
    const executionId = this.generateExecutionId();

    // Create job payload
    const payload: WorkflowExecutionPayload = {
      workflow,
      options: {
        ...options,
        triggeredBy: options.triggeredBy || 'manual',
      },
      trigger: {
        type: 'manual',
        source: 'api',
        metadata: {},
      },
    };

    // Enqueue job
    const job = createJob({
      id: this.generateJobId(),
      workflowId: executionId,
      type: 'workflow',
      payload,
      priority: JobPriority.NORMAL,
      tags: ['manual', typeof workflow === 'string' ? 'unknown' : workflow.name || 'unknown'],
    });

    // Add custom metadata
    job.metadata.executionId = executionId;
    job.metadata.workflowName = typeof workflow === 'string' ? 'unknown' : workflow.name;
    job.metadata.triggeredBy = 'manual';

    // Extract workflow name
    const workflowName = typeof workflow === 'string'
      ? 'workflow'
      : workflow.metadata?.name || workflow.name || 'unnamed';

    await this.queue.enqueue(job);

    // Log workflow queued
    const logger = LoggerManager.getLogger();
    logger.info(`[ExecutionEngine] Workflow queued: ${workflowName}`, {
      executionId,
      workflowName,
      trigger: 'manual',
    });

    // Track execution
    this.executions.set(executionId, {
      executionId,
      workflowName,
      status: 'queued',
      trigger: {
        type: 'manual',
        source: 'api',
        triggeredAt: new Date(),
      },
    });

    return executionId;
  }

  /**
   * Execute a workflow immediately (bypass queue)
   * 
   * @param workflow - Workflow definition
   * @param options - Execution options
   * @returns Workflow execution result
   */
  async executeWorkflowImmediate(
    workflow: string | ParsedWorkflow,
    options: ExecutionOptions = {}
  ): Promise<WorkflowResult> {
    const executionId = this.generateExecutionId();

    // Parse workflow if needed
    const parsedWorkflow = typeof workflow === 'string'
      ? WorkflowParser.parse(workflow)
      : workflow;

    // Track execution
    this.executions.set(executionId, {
      executionId,
      workflowName: parsedWorkflow.metadata?.name || parsedWorkflow.name || 'unnamed',
      status: 'running',
      trigger: {
        type: 'manual',
        source: 'api',
        triggeredAt: new Date(),
      },
      progress: {
        completedSteps: 0,
        totalSteps: parsedWorkflow.steps.length,
      },
    });

    this.runningExecutions.add(executionId);

    try {
      // Execute workflow
      const result = await this.workflowExecutor.execute(parsedWorkflow, {
        ...options,
        triggeredBy: options.triggeredBy || 'manual-immediate',
        timeout: options.timeout || this.config.defaultTimeout,
      });

      // Update execution status
      this.executions.set(executionId, {
        ...this.executions.get(executionId)!,
        status: 'completed',
        result,
      });

      return result;
    } catch (error) {
      // Update execution status with error
      this.executions.set(executionId, {
        ...this.executions.get(executionId)!,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    } finally {
      this.runningExecutions.delete(executionId);
    }
  }

  /**
   * Get execution status
   * 
   * @param executionId - Execution ID
   * @returns Execution status or undefined if not found
   */
  getExecutionStatus(executionId: string): WorkflowExecutionStatus | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all execution statuses
   * 
   * @returns Array of execution statuses
   */
  getAllExecutions(): WorkflowExecutionStatus[] {
    return Array.from(this.executions.values());
  }

  /**
   * Register a step adapter
   * 
   * @param adapter - Adapter instance (supports both legacy and modern interfaces)
   */
  registerAdapter(adapter: any): void {
    // Check if it's a modern adapter (has supports method from @dev-ecosystem/core)
    if (typeof adapter.supports === 'function') {
      this.stepExecutor.registerModernAdapter(adapter);
    } else {
      // Legacy adapter interface
      this.stepExecutor.registerAdapter(adapter);
    }
  }

  /**
   * Register multiple adapters
   * 
   * @param adapters - Array of adapter instances
   */
  registerAdapters(adapters: any[]): void {
    for (const adapter of adapters) {
      this.registerAdapter(adapter);
    }
  }

  /**
   * Get scheduler instance
   * 
   * @returns Scheduler or undefined if disabled
   */
  getScheduler(): Scheduler | undefined {
    return this.scheduler;
  }

  /**
   * Get queue instance
   * 
   * @returns Job queue
   */
  getQueue(): JobQueue {
    return this.queue;
  }

  /**
   * Get event bus instance
   * 
   * @returns EventBus
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Get hook manager instance
   * 
   * @returns HookManager
   */
  getHookManager(): HookManager {
    return this.hookManager;
  }

  /**
   * Register a lifecycle hook
   * 
   * @param hook - Lifecycle hook implementation
   */
  registerHook(hook: LifecycleHook): void {
    this.hookManager.register(hook);
  }

  /**
   * Register multiple lifecycle hooks
   * 
   * @param hooks - Array of lifecycle hook implementations
   */
  registerHooks(hooks: LifecycleHook[]): void {
    this.hookManager.registerMany(hooks);
  }

  /**
   * Process queue continuously
   */
  private async processQueue(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if we can accept more executions
        if (this.runningExecutions.size >= this.config.maxConcurrentExecutions) {
          await this.sleep(100);
          continue;
        }

        // Dequeue next job
        const job = await this.queue.dequeue();

        if (!job) {
          await this.sleep(100);
          continue;
        }

        // Execute job (don't await - run in background)
        this.executeJob(job).catch(error => {
          console.error('Job execution failed:', error);
        });

      } catch (error) {
        console.error('Queue processing error:', error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * Execute a queued job
   */
  private async executeJob(job: Job<WorkflowExecutionPayload>): Promise<void> {
    const logger = LoggerManager.getLogger();
    const executionId = job.metadata?.executionId || this.generateExecutionId();
    const payload = job.payload;

    this.runningExecutions.add(executionId);

    try {
      // Parse workflow if needed
      const parsedWorkflow = typeof payload.workflow === 'string'
        ? WorkflowParser.parse(payload.workflow)
        : payload.workflow;

      const workflowName = parsedWorkflow.metadata?.name || parsedWorkflow.name || 'unnamed';

      // Log execution started
      logger.info(`[ExecutionEngine] Workflow execution started: ${workflowName}`, {
        executionId,
        workflowName,
        stepCount: parsedWorkflow.steps.length,
      });

      // Update execution status
      const existingStatus = this.executions.get(executionId);
      this.executions.set(executionId, {
        executionId,
        workflowName,
        status: 'running',
        trigger: existingStatus?.trigger || {
          type: payload.trigger.type,
          source: payload.trigger.source,
          triggeredAt: new Date(),
        },
        progress: {
          completedSteps: 0,
          totalSteps: parsedWorkflow.steps.length,
        },
      });

      // Execute workflow
      const result = await this.workflowExecutor.execute(parsedWorkflow, {
        ...payload.options,
        timeout: payload.options?.timeout || this.config.defaultTimeout,
      });

      // Mark job as completed
      await this.queue.markCompleted(job.id);

      // Log execution completed
      logger.info(`[ExecutionEngine] Workflow execution completed: ${workflowName}`, {
        executionId,
        workflowName,
        status: result.status,
        duration: result.duration,
      });

      // Update execution status
      this.executions.set(executionId, {
        ...this.executions.get(executionId)!,
        status: 'completed',
        result,
      });

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      // Log execution failed  
      logger.error(`[ExecutionEngine] Workflow execution failed: ${job.metadata?.workflowName || 'unknown'}`, errorObj, {
        executionId,
        error: errorObj.message,
      });
      
      // Mark job as failed
      await this.queue.markFailed(job.id, errorObj);

      // Update execution status
      this.executions.set(executionId, {
        ...this.executions.get(executionId)!,
        status: 'failed',
        error: errorObj,
      });

    } finally {
      this.runningExecutions.delete(executionId);
    }
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${randomUUID().split('-')[0]}`;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job-${Date.now()}-${randomUUID().split('-')[0]}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get engine statistics
   */
  getStatistics() {
    const allExecutions = Array.from(this.executions.values());

    return {
      totalExecutions: allExecutions.length,
      runningExecutions: this.runningExecutions.size,
      queuedExecutions: allExecutions.filter(e => e.status === 'queued').length,
      completedExecutions: allExecutions.filter(e => e.status === 'completed').length,
      failedExecutions: allExecutions.filter(e => e.status === 'failed').length,
      isRunning: this.isRunning,
      maxConcurrentExecutions: this.config.maxConcurrentExecutions,
    };
  }
}
