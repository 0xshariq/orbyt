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

// Signal ready to the scheduler
port.postMessage({ type: 'ready' });

port.on('message', async (message: { type: string; job?: any }) => {
  if (message.type !== 'execute' || !message.job) {
    return;
  }

  const job = message.job;

  try {
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
  } catch (err: any) {
    port.postMessage({
      type: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
