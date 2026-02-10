/**
 * Job Scheduler
 * 
 * Worker-based job execution system using Node.js worker_threads.
 * Handles parallel job processing with configurable worker pool.
 * 
 * @module scheduling
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import type { JobQueue, Job } from '../queue/JobQueue.js';
import { JobPriority, createJob } from '../queue/JobQueue.js';

/**
 * Job scheduler configuration
 */
export interface JobSchedulerConfig {
  /** Number of worker threads */
  workerCount?: number;
  
  /** Maximum concurrent jobs */
  maxConcurrent?: number;
  
  /** Worker script path (optional, for custom workers) */
  workerScriptPath?: string;
}

/**
 * Worker state
 */
interface WorkerState {
  id: string;
  worker: Worker;
  busy: boolean;
  currentJobId?: string;
}

/**
 * Job Scheduler
 * Manages worker pool and job execution
 */
export class JobScheduler {
  private workers: WorkerState[] = [];
  private jobQueue: JobQueue;
  private running = false;
  private processingInterval?: NodeJS.Timeout;
  private readonly config: Required<JobSchedulerConfig>;

  constructor(
    jobQueue: JobQueue,
    config: JobSchedulerConfig = {}
  ) {
    this.jobQueue = jobQueue;
    this.config = {
      workerCount: config.workerCount ?? 4,
      maxConcurrent: config.maxConcurrent ?? 10,
      workerScriptPath: config.workerScriptPath ?? this.getDefaultWorkerPath(),
    };
  }

  /**
   * Get default worker script path
   */
  private getDefaultWorkerPath(): string {
    // This will be the path to the default worker implementation
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.join(__dirname, 'workers', 'workflow-worker.js');
  }

  /**
   * Start the job scheduler
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('JobScheduler is already running');
    }

    this.running = true;

    // Initialize worker pool
    for (let i = 0; i < this.config.workerCount; i++) {
      this.createWorker(`worker_${i}`);
    }

    // Start processing loop
    this.processingInterval = setInterval(
      () => this.processJobs(),
      100 // Check every 100ms
    );
  }

  /**
   * Stop the job scheduler
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    // Terminate all workers
    await Promise.all(
      this.workers.map(async (workerState) => {
        await workerState.worker.terminate();
      })
    );

    this.workers = [];
  }

  /**
   * Create a worker
   */
  private createWorker(workerId: string): void {
    try {
      const worker = new Worker(this.config.workerScriptPath, {
        workerData: { workerId },
      });

      const workerState: WorkerState = {
        id: workerId,
        worker,
        busy: false,
      };

      // Handle worker messages
      worker.on('message', (message) => {
        this.handleWorkerMessage(workerState, message);
      });

      // Handle worker errors
      worker.on('error', (error) => {
        console.error(`Worker ${workerId} error:`, error);
        workerState.busy = false;
        
        // Mark job as failed if there was one
        if (workerState.currentJobId) {
          this.jobQueue.markFailed(workerState.currentJobId, error as Error);
          workerState.currentJobId = undefined;
        }
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker ${workerId} exited with code ${code}`);
        }
        
        // Remove from workers array
        const index = this.workers.findIndex(w => w.id === workerId);
        if (index !== -1) {
          this.workers.splice(index, 1);
        }
        
        // Recreate worker if scheduler is still running
        if (this.running && this.workers.length < this.config.workerCount) {
          this.createWorker(`worker_${Date.now()}`);
        }
      });

      this.workers.push(workerState);
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
    }
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(workerState: WorkerState, message: any): void {
    switch (message.type) {
      case 'ready':
        workerState.busy = false;
        workerState.currentJobId = undefined;
        break;

      case 'completed':
        if (workerState.currentJobId) {
          this.jobQueue.markCompleted(workerState.currentJobId, message.result);
        }
        workerState.busy = false;
        workerState.currentJobId = undefined;
        break;

      case 'failed':
        if (workerState.currentJobId) {
          const error = new Error(message.error || 'Job execution failed');
          this.jobQueue.markFailed(workerState.currentJobId, error);
        }
        workerState.busy = false;
        workerState.currentJobId = undefined;
        break;

      case 'progress':
        // Handle progress updates if needed
        console.log(`Job ${workerState.currentJobId} progress:`, message.progress);
        break;

      default:
        console.warn(`Unknown message type from worker: ${message.type}`);
    }
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Find available workers
    const availableWorkers = this.workers.filter(w => !w.busy);
    if (availableWorkers.length === 0) {
      return;
    }

    // Dequeue and assign jobs to available workers
    for (const workerState of availableWorkers) {
      const job = await this.jobQueue.dequeue();
      if (!job) {
        break; // No more jobs
      }

      // Assign job to worker
      workerState.busy = true;
      workerState.currentJobId = job.id;

      // Send job to worker
      workerState.worker.postMessage({
        type: 'execute',
        job: {
          id: job.id,
          workflowId: job.workflowId,
          payload: job.payload,
          metadata: job.metadata,
        },
      });
    }
  }

  /**
   * Enqueue a job for execution
   */
  async enqueueJob(
    workflowId: string,
    input?: Record<string, any>,
    priority: JobPriority = JobPriority.NORMAL
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    
    const job = createJob({
      id: jobId,
      workflowId,
      type: 'workflow',
      payload: input || {},
      priority,
    });

    await this.jobQueue.enqueue(job);
    return jobId;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    return await this.jobQueue.getJob(jobId);
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    const queueStats = this.jobQueue.getStats();
    
    return {
      running: this.running,
      workers: {
        total: this.workers.length,
        busy: this.workers.filter(w => w.busy).length,
        idle: this.workers.filter(w => !w.busy).length,
      },
      queue: queueStats,
    };
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
