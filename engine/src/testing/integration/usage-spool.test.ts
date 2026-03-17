import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { UsageEventType, type UsageEvent } from '@dev-ecosystem/core';
import { FileSpoolUsageCollector, type UsageBatchTransport } from '../../usage/FileSpoolUsageCollector.js';

class FlakyTransport implements UsageBatchTransport {
  private failuresRemaining: number;

  constructor(failures: number) {
    this.failuresRemaining = failures;
  }

  async sendBatch(_events: UsageEvent[]): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('Simulated transport failure');
    }
  }
}

function createEvent(id: string): UsageEvent {
  return {
    id,
    type: UsageEventType.WORKFLOW_RUN,
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: `exec-${id}`,
    billable: true,
  };
}

export async function runUsageSpoolIntegrationTest(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'orbyt-usage-spool-'));

  try {
    const collector = new FileSpoolUsageCollector({
      baseDir: dir,
      batchSize: 10,
      flushIntervalMs: 60_000,
      maxRetryAttempts: 2,
      transport: new FlakyTransport(2),
    });

    await collector.record(createEvent('one'));
    await collector.record(createEvent('two'));

    await collector.flush(); // fail attempt 1 (events remain pending)
    await collector.flush(); // fail attempt 2 (events move to failed)

    const pending = readdirSync(join(dir, 'pending')).filter((f) => f.endsWith('.json'));
    const failed = readdirSync(join(dir, 'failed')).filter((f) => f.endsWith('.json'));
    const sent = readdirSync(join(dir, 'sent')).filter((f) => f.endsWith('.json'));

    assert.equal(pending.length, 0, 'pending should be empty after max retry is reached');
    assert.equal(failed.length, 2, 'failed should contain max-retry envelopes');
    assert.equal(sent.length, 0, 'sent should be empty when transport never succeeded');

    await collector.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
