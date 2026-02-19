/**
 * In-Memory Queue
 * 
 * Simple in-memory implementation of JobQueue.
 * Suitable for single-process execution. For distributed systems,
 * replace with Redis/database-backed queue.
 * 
 * @module queue
 */

import { Job, JobQueue, QueueConfig, QueueStats } from "../types/core-types.js";



/**
 * In-memory job queue implementation
 */
export class InMemoryQueue<T = any> implements JobQueue<T> {
    private jobs = new Map<string, Job<T>>();
    private pendingQueue: Job<T>[] = [];
    private readonly config: Required<QueueConfig>;

    constructor(config: QueueConfig = {}) {
        this.config = {
            maxSize: config.maxSize ?? 0, // 0 = unlimited
            maxConcurrent: config.maxConcurrent ?? 10,
            persistent: config.persistent ?? false,
            retentionMs: config.retentionMs ?? 3600000, // 1 hour default
        };
    }

    /**
     * Add job to queue
     */
    async enqueue(job: Job<T>): Promise<void> {
        // Check max size
        if (this.config.maxSize > 0 && this.jobs.size >= this.config.maxSize) {
            throw new Error(`Queue is full (max: ${this.config.maxSize})`);
        }

        // Store job
        this.jobs.set(job.id, job);

        // Add to pending queue if status is pending
        if (job.status === 'pending') {
            this.insertByPriority(job);
        }
    }

    /**
     * Remove and return highest priority pending job
     */
    async dequeue(): Promise<Job<T> | null> {
        // Check if we're at max concurrent
        const runningCount = Array.from(this.jobs.values())
            .filter(job => job.status === 'running').length;

        if (runningCount >= this.config.maxConcurrent) {
            return null; // At capacity
        }

        // Get next job from pending queue
        const job = this.pendingQueue.shift();
        if (!job) {
            return null;
        }

        // Update status to running
        job.status = 'running';
        job.metadata.startedAt = new Date();
        job.attempts++;

        return job;
    }

    /**
     * Peek at next job without removing it
     */
    async peek(): Promise<Job<T> | null> {
        return this.pendingQueue[0] || null;
    }

    /**
     * Get job by ID
     */
    async getJob(jobId: string): Promise<Job<T> | null> {
        return this.jobs.get(jobId) || null;
    }

    /**
     * Mark job as completed
     */
    async markCompleted(jobId: string, result?: any): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        job.status = 'completed';
        job.result = result;
        job.metadata.completedAt = new Date();

        if (job.metadata.startedAt) {
            job.metadata.durationMs =
                job.metadata.completedAt.getTime() - job.metadata.startedAt.getTime();
        }

        // Schedule cleanup if retention is set
        if (this.config.retentionMs > 0) {
            setTimeout(() => this.jobs.delete(jobId), this.config.retentionMs);
        }
    }

    /**
     * Mark job as failed
     */
    async markFailed(jobId: string, error: Error): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        job.errors.push(error);

        // Check if should retry
        if (job.attempts < job.maxRetries) {
            job.status = 'retrying';

            // Re-queue with delay if specified
            if (job.retryDelayMs && job.retryDelayMs > 0) {
                setTimeout(() => {
                    job.status = 'pending';
                    this.insertByPriority(job);
                }, job.retryDelayMs);
            } else {
                job.status = 'pending';
                this.insertByPriority(job);
            }
        } else {
            // Max retries exceeded
            job.status = 'failed';
            job.metadata.completedAt = new Date();

            if (job.metadata.startedAt) {
                job.metadata.durationMs =
                    job.metadata.completedAt.getTime() - job.metadata.startedAt.getTime();
            }

            // Schedule cleanup
            if (this.config.retentionMs > 0) {
                setTimeout(() => this.jobs.delete(jobId), this.config.retentionMs);
            }
        }
    }

    /**
     * Mark job as retrying
     */
    async markRetrying(jobId: string): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        job.status = 'retrying';
    }

    /**
     * Remove job from queue
     */
    async remove(jobId: string): Promise<boolean> {
        const job = this.jobs.get(jobId);
        if (!job) {
            return false;
        }

        // Remove from pending queue if present
        const index = this.pendingQueue.findIndex(j => j.id === jobId);
        if (index !== -1) {
            this.pendingQueue.splice(index, 1);
        }

        // Remove from jobs map
        return this.jobs.delete(jobId);
    }

    /**
     * Find jobs matching filter
     */
    async find(filter: (job: Job<T>) => boolean): Promise<Job<T>[]> {
        return Array.from(this.jobs.values()).filter(filter);
    }

    /**
     * Get queue statistics
     */
    async getStats(): Promise<QueueStats> {
        const allJobs = Array.from(this.jobs.values());

        const pending = allJobs.filter(j => j.status === 'pending').length;
        const running = allJobs.filter(j => j.status === 'running').length;
        const completed = allJobs.filter(j => j.status === 'completed').length;
        const failed = allJobs.filter(j => j.status === 'failed').length;
        const retrying = allJobs.filter(j => j.status === 'retrying').length;

        // Calculate average wait time (created to started)
        const waitTimes = allJobs
            .filter(j => j.metadata.startedAt)
            .map(j => j.metadata.startedAt!.getTime() - j.metadata.createdAt.getTime());
        const avgWaitTimeMs = waitTimes.length > 0
            ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
            : 0;

        // Calculate average execution time
        const executionTimes = allJobs
            .filter(j => j.metadata.durationMs !== undefined)
            .map(j => j.metadata.durationMs!);
        const avgExecutionTimeMs = executionTimes.length > 0
            ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
            : 0;

        return {
            total: this.jobs.size,
            pending,
            running,
            completed,
            failed,
            retrying,
            avgWaitTimeMs,
            avgExecutionTimeMs,
        };
    }

    /**
     * Clear all jobs
     */
    async clear(): Promise<void> {
        this.jobs.clear();
        this.pendingQueue = [];
    }

    /**
     * Get queue size
     */
    async size(): Promise<number> {
        return this.jobs.size;
    }

    /**
     * Check if queue is empty
     */
    async isEmpty(): Promise<boolean> {
        return this.jobs.size === 0;
    }

    /**
     * Insert job into pending queue by priority
     * Higher priority jobs go first, same priority uses FIFO
     */
    private insertByPriority(job: Job<T>): void {
        // Find insertion point based on JobPriority enum values
        let insertIndex = 0;
        for (let i = 0; i < this.pendingQueue.length; i++) {
            // Higher priority value = higher priority (CRITICAL > HIGH > NORMAL > LOW)
            if (this.pendingQueue[i].priority < job.priority) {
                break;
            }
            insertIndex++;
        }

        // Insert at the right position
        this.pendingQueue.splice(insertIndex, 0, job);
    }

    /**
     * Get jobs by status
     */
    async getJobsByStatus(status: Job<T>['status']): Promise<Job<T>[]> {
        return Array.from(this.jobs.values()).filter(job => job.status === status);
    }

    /**
     * Get jobs by workflow ID
     */
    async getJobsByWorkflow(workflowId: string): Promise<Job<T>[]> {
        return Array.from(this.jobs.values()).filter(job => job.workflowId === workflowId);
    }

    /**
     * Get current concurrent job count
     */
    getConcurrentCount(): number {
        return Array.from(this.jobs.values()).filter(j => j.status === 'running').length;
    }

    /**
     * Get max concurrent allowed
     */
    getMaxConcurrent(): number {
        return this.config.maxConcurrent;
    }

    /**
     * Check if queue can accept more jobs
     */
    canAcceptJobs(): boolean {
        if (this.config.maxSize > 0 && this.jobs.size >= this.config.maxSize) {
            return false;
        }
        return true;
    }
}
