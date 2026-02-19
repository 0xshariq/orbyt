/**
 * Job Queue
 * 
 * Queue system for workflow and step execution.
 * Provides job queueing, status tracking, and parallel execution support.
 * 
 * @module queue
 */

import { type Job, JobPriority } from "../types/core-types.js";

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
