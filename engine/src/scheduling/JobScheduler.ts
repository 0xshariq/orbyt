/**
 * Job Scheduler
 * 
 * Worker-based job execution system using Node.js worker_threads.
 * Handles parallel job processing with configurable worker pool.
 * 
 * @module scheduling
 */

import { Worker } from 'worker_threads';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import path from 'path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import {  createJob } from '../queue/JobQueue.js';
import { Job, JobPriority, JobQueue } from '../types/core-types.js';

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

  /** Worker runtime backend */
  workerBackend?: 'node' | 'tokio';

  /** Command used to launch Tokio worker process */
  tokioWorkerCommand?: string;

  /** Optional args for Tokio worker command */
  tokioWorkerArgs?: string[];
}

/**
 * Worker state
 */
interface WorkerState {
  id: string;
  backend: 'node' | 'tokio';
  worker?: Worker;
  process?: ChildProcessWithoutNullStreams;
  stdoutReader?: Interface;
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
      workerBackend: config.workerBackend ?? 'node',
      tokioWorkerCommand: config.tokioWorkerCommand ?? 'orbyt-tokio-worker',
      tokioWorkerArgs: config.tokioWorkerArgs ?? [],
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
        await this.terminateWorker(workerState);
      })
    );

    this.workers = [];
  }

  /**
   * Create a worker
   */
  private createWorker(workerId: string): void {
    if (this.config.workerBackend === 'tokio') {
      this.createTokioWorker(workerId);
      return;
    }

    this.createNodeWorker(workerId);
  }

  private createNodeWorker(workerId: string): void {
    try {
      const worker = new Worker(this.config.workerScriptPath, {
        workerData: { workerId },
      });

      const workerState: WorkerState = {
        id: workerId,
        backend: 'node',
        worker,
        busy: false,
      };

      worker.on('message', (message) => {
        this.handleWorkerMessage(workerState, message);
      });

      worker.on('error', (error) => {
        this.handleWorkerFailure(workerState, error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker ${workerId} exited with code ${code}`);
        }
        this.handleWorkerExit(workerId);
      });

      this.workers.push(workerState);
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
    }
  }

  private createTokioWorker(workerId: string): void {
    try {
      const { command, args } = this.resolveTokioCommand();
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const workerState: WorkerState = {
        id: workerId,
        backend: 'tokio',
        process,
        busy: false,
      };

      const stdoutReader = createInterface({ input: process.stdout });
      workerState.stdoutReader = stdoutReader;

      stdoutReader.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        try {
          const message = JSON.parse(trimmed);
          this.handleWorkerMessage(workerState, message);
        } catch {
          console.warn(`Worker ${workerId} sent non-JSON message: ${trimmed}`);
        }
      });

      process.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString().trim();
        if (message) {
          console.error(`Worker ${workerId} stderr: ${message}`);
        }
      });

      process.on('error', (error) => {
        this.handleWorkerFailure(workerState, error);
      });

      process.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker ${workerId} exited with code ${code ?? 'unknown'}`);
        }
        this.handleWorkerExit(workerId);
      });

      this.workers.push(workerState);
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
    }
  }

  private resolveTokioCommand(): { command: string; args: string[] } {
    // If explicitly configured, use the provided command and args as-is.
    if (this.config.tokioWorkerCommand !== 'orbyt-tokio-worker') {
      return {
        command: this.config.tokioWorkerCommand,
        args: this.config.tokioWorkerArgs,
      };
    }

    // Local development fallback: run the embedded Rust sidecar directly.
    const cwdManifestPath = path.join(process.cwd(), 'rust', 'orbyt-tokio-worker', 'Cargo.toml');
    if (existsSync(cwdManifestPath)) {
      return {
        command: 'cargo',
        args: ['run', '--quiet', '--manifest-path', cwdManifestPath],
      };
    }

    return {
      command: this.config.tokioWorkerCommand,
      args: this.config.tokioWorkerArgs,
    };
  }

  private handleWorkerFailure(workerState: WorkerState, error: unknown): void {
    console.error(`Worker ${workerState.id} error:`, error);
    workerState.busy = false;

    if (workerState.currentJobId) {
      const workerError = error instanceof Error ? error : new Error(String(error));
      this.jobQueue.markFailed(workerState.currentJobId, workerError);
      workerState.currentJobId = undefined;
    }
  }

  private handleWorkerExit(workerId: string): void {
    const index = this.workers.findIndex(w => w.id === workerId);
    if (index !== -1) {
      const workerState = this.workers[index];
      workerState.stdoutReader?.close();

      // Unexpected worker exits during active processing should fail the current job.
      if (this.running && workerState.currentJobId) {
        this.jobQueue.markFailed(
          workerState.currentJobId,
          new Error(`Worker ${workerId} exited while processing job ${workerState.currentJobId}`),
        );
      }

      this.workers.splice(index, 1);
    }

    if (this.running && this.workers.length < this.config.workerCount) {
      this.createWorker(`worker_${Date.now()}`);
    }
  }

  private async terminateWorker(workerState: WorkerState): Promise<void> {
    workerState.stdoutReader?.close();

    if (workerState.backend === 'node' && workerState.worker) {
      await workerState.worker.terminate();
      return;
    }

    if (workerState.backend === 'tokio' && workerState.process) {
      workerState.process.kill();
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
      const payload = {
        type: 'execute',
        job: {
          id: job.id,
          workflowId: job.workflowId,
          payload: job.payload,
          metadata: job.metadata,
        },
      };

      try {
        if (workerState.backend === 'node' && workerState.worker) {
          workerState.worker.postMessage(payload);
        } else if (workerState.backend === 'tokio' && workerState.process?.stdin) {
          workerState.process.stdin.write(`${JSON.stringify(payload)}\n`);
        } else {
          throw new Error(`Worker ${workerState.id} is unavailable`);
        }
      } catch (error) {
        workerState.busy = false;
        workerState.currentJobId = undefined;
        this.jobQueue.markFailed(
          job.id,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
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
