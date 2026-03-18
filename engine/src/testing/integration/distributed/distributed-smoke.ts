import { pathToFileURL } from 'node:url';
import type { Adapter } from '@dev-ecosystem/core';
import { OrbytEngine } from '../../../core/OrbytEngine.js';
import type { ParsedWorkflow } from '../../../types/core-types.js';

class DistributedSmokeAdapter implements Adapter {
  readonly name = 'smoke';
  readonly version = '1.0.0';
  readonly supportedActions = ['smoke.exec'];
  readonly capabilities = {
    actions: ['smoke.exec'],
    idempotent: true,
    sideEffectLevel: 'low' as const,
  };

  supports(action: string): boolean {
    return action === 'smoke.exec';
  }

  async execute(_action: string, input: any): Promise<any> {
    return {
      ok: true,
      echo: input,
      ts: Date.now(),
    };
  }
}

async function runDistributedSmoke(): Promise<void> {
  const engine = new OrbytEngine({
    mode: 'distributed',
    enableScheduler: false,
    distributed: {
      queueBackend: 'memory',
      workerCount: 2,
      pollIntervalMs: 20,
      leaseMs: 10_000,
      leaseExtensionMs: 1_000,
    },
  });

  engine.registerAdapter(new DistributedSmokeAdapter());

  const workflow: ParsedWorkflow = {
    version: '1.0',
    kind: 'workflow',
    name: 'distributed-smoke',
    steps: [
      {
        id: 's1',
        adapter: 'smoke',
        action: 'smoke.exec',
        input: { value: 1 },
        needs: [],
        continueOnError: false,
      },
      {
        id: 's2',
        adapter: 'smoke',
        action: 'smoke.exec',
        input: { value: 2 },
        needs: ['s1'],
        continueOnError: false,
      },
    ],
  };

  const result = await engine.run(workflow);
  if (result.status !== 'success') {
    throw new Error(`Distributed smoke failed: ${result.status}`);
  }

  const s2 = result.stepResults.get('s2');
  if (!s2 || s2.status !== 'success') {
    throw new Error('Distributed smoke failed: dependent step did not complete successfully');
  }

  console.log('[distributed-smoke] PASS', {
    executionId: result.executionId,
    status: result.status,
    steps: result.metadata.totalSteps,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDistributedSmoke().catch((error) => {
    console.error('[distributed-smoke] FAIL', error);
    process.exitCode = 1;
  });
}

export { runDistributedSmoke };
