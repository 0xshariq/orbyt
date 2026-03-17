/**
 * Workflow Worker
 *
 * Node.js worker thread for processing scheduled/queued workflow jobs.
 * Spawned by JobScheduler — one instance per worker pool slot.
 *
 * Protocol:
 *   Main → Worker: { type: 'execute', job: { id, workflowId, payload, metadata } }
 *   Worker → Main: { type: 'ready' }
 *                  { type: 'completed', result: any }
 *                  { type: 'failed', error: string }
 */

import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('workflow-worker must be run as a worker thread');
}

const port = parentPort;
let isBusy = false;

interface WorkerJob {
  id: string;
  workflowId: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

type WorkerMessage =
  | { type: 'execute'; job?: unknown }
  | { type: 'ping' }
  | { type: 'shutdown' }
  | { type: string; [key: string]: unknown };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeJob(rawJob: unknown): WorkerJob {
  if (!rawJob || typeof rawJob !== 'object') {
    throw new Error('Invalid job payload: expected object');
  }

  const candidate = rawJob as Partial<WorkerJob>;
  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new Error('Invalid job payload: missing id');
  }

  if (!candidate.workflowId || typeof candidate.workflowId !== 'string') {
    throw new Error('Invalid job payload: missing workflowId');
  }

  return {
    id: candidate.id,
    workflowId: candidate.workflowId,
    payload: candidate.payload,
    metadata: candidate.metadata,
  };
}

// Signal ready to the scheduler
port.postMessage({ type: 'ready' });

port.on('message', async (message: WorkerMessage) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'ping') {
    port.postMessage({ type: 'ready' });
    return;
  }

  if (message.type === 'shutdown') {
    process.exit(0);
    return;
  }

  if (message.type !== 'execute') {
    port.postMessage({
      type: 'failed',
      error: `Unsupported worker message type: ${message.type}`,
    });
    return;
  }

  if (isBusy) {
    port.postMessage({
      type: 'failed',
      error: 'Worker is already processing a job',
    });
    return;
  }

  isBusy = true;

  try {
    const job = normalizeJob(message.job);

    port.postMessage({
      type: 'progress',
      progress: {
        stage: 'started',
        jobId: job.id,
        workflowId: job.workflowId,
      },
    });

    // Scheduled workflow execution is not yet implemented.
    // The scheduler worker pool is reserved for future trigger-based execution.
    // Direct engine.run() calls bypass this worker entirely.
    port.postMessage({
      type: 'completed',
      result: {
        jobId: job.id,
        workflowId: job.workflowId,
        status: 'skipped',
        message: 'Scheduled execution not yet implemented',
      },
    });
  } catch (err: unknown) {
    port.postMessage({
      type: 'failed',
      error: getErrorMessage(err),
    });
  } finally {
    isBusy = false;
  }
});
