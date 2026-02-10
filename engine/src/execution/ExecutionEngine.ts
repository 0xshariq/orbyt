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

import { randomUUID } from 'crypto';
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
    
    // Initialize components
    this.queue = this.config.queue;
    this.stepExecutor = new StepExecutor();
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor);
    
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
    
    await this.queue.enqueue(job);
    
    // Track execution
    const workflowName = typeof workflow === 'string' 
      ? 'workflow'
      : workflow.metadata?.name || workflow.name || 'unnamed';
      
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
   * @param adapter - Adapter instance
   */
  registerAdapter(adapter: any): void {
    this.stepExecutor.registerAdapter(adapter);
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
    const executionId = job.metadata?.executionId || this.generateExecutionId();
    const payload = job.payload;
    
    this.runningExecutions.add(executionId);
    
    try {
      // Parse workflow if needed
      const parsedWorkflow = typeof payload.workflow === 'string'
        ? WorkflowParser.parse(payload.workflow)
        : payload.workflow;
      
      // Update execution status
      const existingStatus = this.executions.get(executionId);
      this.executions.set(executionId, {
        executionId,
        workflowName: parsedWorkflow.metadata?.name || parsedWorkflow.name || 'unnamed',
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
      
      // Update execution status
      this.executions.set(executionId, {
        ...this.executions.get(executionId)!,
        status: 'completed',
        result,
      });
      
    } catch (error) {
      // Mark  job as failed
      await this.queue.markFailed(job.id, error instanceof Error ? error : new Error(String(error)));
      
      // Update execution status
      this.executions.set(executionId, {
        ...this.executions.get(executionId)!,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
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
