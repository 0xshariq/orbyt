import assert from 'node:assert/strict';
import { UsageEventType, type UsageCollector, type UsageEvent } from '@dev-ecosystem/core';
import { OrbytEngine } from '../../core/OrbytEngine.js';

class CaptureCollector implements UsageCollector {
  readonly target = 'billing-engine' as const;
  readonly contractVersion = '1.0' as const;
  readonly events: UsageEvent[] = [];

  async record(event: UsageEvent): Promise<void> {
    this.events.push(event);
  }

  async recordBatch(events: UsageEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

const workflow = `
version: "1.0"
kind: workflow
metadata:
  name: trigger-usage-check
workflow:
  steps:
    - id: one
      uses: shell.exec
      with:
        command: "echo ok"
`;

export async function runTriggerUsageIntegrationTest(): Promise<void> {
  const collector = new CaptureCollector();
  const engine = new OrbytEngine({
    usageCollector: collector,
  });

  try {
    const result = await engine.run(workflow, {
      triggeredBy: 'scheduler',
    });

    assert.equal(result.status, 'success', 'workflow should succeed');

    const types = collector.events.map((e) => e.type);
    assert.ok(types.includes(UsageEventType.TRIGGER_FIRE), 'must emit trigger.fire when triggeredBy is non-manual');
    assert.ok(types.includes(UsageEventType.WORKFLOW_RUN), 'must emit workflow.run');
    assert.ok(types.includes(UsageEventType.STEP_EXECUTE), 'must emit step.execute');
    assert.ok(types.includes(UsageEventType.ADAPTER_CALL), 'must emit adapter.call');
  } finally {
    await engine.stop();
  }
}
