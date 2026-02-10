/**
 * Job Queue
 * 
 * Queue system for workflow and step execution.
 * Provides job queueing, status tracking, and parallel execution support.
 * 
 * @module queue
 */

/**
 * Job status
 */
export type JobStatus = 
  | 'pending'    // Waiting in queue
  | 'running'    // Currently executing
  | 'completed'  // Successfully finished
  | 'failed'     // Execution failed
  | 'retrying';  // Failed, will retry

/**
 * Job priority levels
 */
export enum JobPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Job metadata
 */
export interface JobMetadata {
  /** When job was created */
  createdAt: Date;
  
  /** When job started executing */
  startedAt?: Date;
  
  /** When job completed */
  completedAt?: Date;
  
  /** Execution duration in ms */
  durationMs?: number;
  
  /** Job tags for filtering/grouping */
  tags?: string[];
  
  /** Custom metadata */
  [key: string]: any;
}

/**
 * Job for workflow/step execution
 */
export interface Job<T = any> {
  /** Unique job ID */
  id: string;
  
  /** Associated workflow ID */
  workflowId: string;
  
  /** Optional step ID (if job is for single step) */
  stepId?: string;
  
  /** Job type (workflow, step, etc.) */
  type: 'workflow' | 'step';
  
  /** Job payload/input data */
  payload: T;
  
  /** Current status */
  status: JobStatus;
  
  /** Priority level */
  priority: JobPriority;
  
  /** Number of execution attempts */
  attempts: number;
  
  /** Maximum retry attempts allowed */
  maxRetries: number;
  
  /** Backoff delay for retries (ms) */
  retryDelayMs?: number;
  
  /** Errors from previous attempts */
  errors: Error[];
  
  /** Job result (if completed) */
  result?: any;
  
  /** Job metadata */
  metadata: JobMetadata;
  
  /** Timeout for job execution (ms) */
  timeoutMs?: number;
  
  /** Jobs that must complete before this one */
  dependencies?: string[];
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Total jobs in queue */
  total: number;
  
  /** Pending jobs */
  pending: number;
  
  /** Running jobs */
  running: number;
  
  /** Completed jobs */
  completed: number;
  
  /** Failed jobs */
  failed: number;
  
  /** Jobs awaiting retry */
  retrying: number;
  
  /** Average wait time (ms) */
  avgWaitTimeMs: number;
  
  /** Average execution time (ms) */
  avgExecutionTimeMs: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Maximum queue size (0 = unlimited) */
  maxSize?: number;
  
  /** Maximum concurrent jobs */
  maxConcurrent?: number;
  
  /** Enable job persistence */
  persistent?: boolean;
  
  /** Job retention time (ms) */
  retentionMs?: number;
}

/**
 * Job queue interface
 */
export interface JobQueue<T = any> {
  /**
   * Add job to queue
   * 
   * @param job - Job to enqueue
   * @returns Promise resolving when job is queued
   */
  enqueue(job: Job<T>): Promise<void>;
  
  /**
   * Remove and return highest priority pending job
   * 
   * @returns Next job or null if queue is empty
   */
  dequeue(): Promise<Job<T> | null>;
  
  /**
   * Peek at next job without removing it
   * 
   * @returns Next job or null if queue is empty
   */
  peek(): Promise<Job<T> | null>;
  
  /**
   * Get job by ID
   * 
   * @param jobId - Job ID
   * @returns Job or null if not found
   */
  getJob(jobId: string): Promise<Job<T> | null>;
  
  /**
   * Mark job as completed successfully
   * 
   * @param jobId - Job ID
   * @param result - Job result
   */
  markCompleted(jobId: string, result?: any): Promise<void>;
  
  /**
   * Mark job as failed
   * 
   * @param jobId - Job ID
   * @param error - Error that caused failure
   */
  markFailed(jobId: string, error: Error): Promise<void>;
  
  /**
   * Mark job as retrying
   * 
   * @param jobId - Job ID
   */
  markRetrying(jobId: string): Promise<void>;
  
  /**
   * Remove job from queue
   * 
   * @param jobId - Job ID
   * @returns True if job was removed
   */
  remove(jobId: string): Promise<boolean>;
  
  /**
   * Get all jobs matching filter
   * 
   * @param filter - Filter function
   * @returns Matching jobs
   */
  find(filter: (job: Job<T>) => boolean): Promise<Job<T>[]>;
  
  /**
   * Get queue statistics
   * 
   * @returns Queue stats
   */
  getStats(): Promise<QueueStats>;
  
  /**
   * Clear all jobs from queue
   */
  clear(): Promise<void>;
  
  /**
   * Get queue size
   * 
   * @returns Number of jobs in queue
   */
  size(): Promise<number>;
  
  /**
   * Check if queue is empty
   * 
   * @returns True if queue has no jobs
   */
  isEmpty(): Promise<boolean>;
}

/**
 * Create a new job
 * 
 * @param config - Job configuration
 * @returns Job instance
 */
export function createJob<T = any>(config: {
  id: string;
  workflowId: string;
  stepId?: string;
  type: 'workflow' | 'step';
  payload: T;
  priority?: JobPriority;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  dependencies?: string[];
  tags?: string[];
}): Job<T> {
  return {
    id: config.id,
    workflowId: config.workflowId,
    stepId: config.stepId,
    type: config.type,
    payload: config.payload,
    status: 'pending',
    priority: config.priority ?? JobPriority.NORMAL,
    attempts: 0,
    maxRetries: config.maxRetries ?? 0,
    retryDelayMs: config.retryDelayMs,
    errors: [],
    metadata: {
      createdAt: new Date(),
      tags: config.tags,
    },
    timeoutMs: config.timeoutMs,
    dependencies: config.dependencies,
  };
}
