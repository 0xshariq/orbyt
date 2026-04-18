import assert from 'node:assert/strict';
import type { Adapter, AdapterContext, AdapterResult } from '@dev-ecosystem/core';
import { WorkflowLoader } from '../../loader/WorkflowLoader.js';
import { OrbytEngine } from '../../core/OrbytEngine.js';
import { OrbytError } from '../../errors/OrbytError.js';
import { OrbytErrorCode } from '../../errors/ErrorCodes.js';
import type { ParsedWorkflow } from '../../types/core-types.js';

function createAdapter(name: string, priority: number, shouldFail = false): Adapter {
  return {
    name,
    version: '1.0.0',
    supportedActions: ['*'],
    priority,
    supports: (action: string) => {
      void action;
      return true;
    },
    execute: async (action: string, input: Record<string, any>, context?: AdapterContext): Promise<AdapterResult> => {
      void action;
      void input;
      void context;
      if (shouldFail) {
        throw new Error(`Simulated adapter failure from ${name}`);
      }

      return {
        success: true,
        output: {
          adapter: name,
        },
        metrics: {
          durationMs: 0,
        },
      };
    },
  } as Adapter;
}

function createWorkflow(uses: string): ParsedWorkflow {
  return {
    version: '1.0.0',
    kind: 'workflow',
    name: 'phase-b-loader-boundary',
    steps: [
      {
        id: 'step_1',
        name: 'step_1',
        adapter: uses.split('.')[0] || 'unknown',
        action: uses,
        input: {
          message: 'hello',
        },
        needs: [],
        continueOnError: false,
      },
    ],
  };
}

async function assertUnsupportedInputEnvelope(): Promise<void> {
  try {
    await WorkflowLoader.fromString('plain-text-without-structure');
    assert.fail('Expected unsupported input error for non-structured inline input');
  } catch (error) {
    assert.ok(error instanceof OrbytError, 'Expected OrbytError for unsupported input');
    assert.equal(error.code, OrbytErrorCode.VALIDATION_UNSUPPORTED_INPUT);
  }
}

function assertDeterministicAdapterResolution(engine: OrbytEngine): void {
  const registry = engine.getContext().adapterRegistry;

  // Same priority and wildcard support must still resolve deterministically.
  engine.registerAdapter(createAdapter('beta', 50));
  engine.registerAdapter(createAdapter('alpha', 50));

  const resolvedByNameTieBreak = registry.resolve('notify.send');
  assert.equal(resolvedByNameTieBreak.name, 'alpha');

  // Namespace match should win before priority when resolving ties.
  engine.registerAdapter(createAdapter('notify', 10));
  const resolvedByNamespace = registry.resolve('notify.broadcast');
  assert.equal(resolvedByNamespace.name, 'notify');

  // Higher priority should win when namespace does not apply.
  engine.registerAdapter(createAdapter('zeta', 90));
  const resolvedByPriority = registry.resolve('payments.charge');
  assert.equal(resolvedByPriority.name, 'zeta');
}

async function assertAdapterFailureEnvelope(engine: OrbytEngine): Promise<void> {
  engine.registerAdapter(createAdapter('failing', 100, true));
  const result = await engine.run(createWorkflow('failing.exec'));

  assert.equal(result.status, 'failure');

  const stepResult = result.stepResults.get('step_1');
  assert.ok(stepResult, 'Expected step_1 result to be present');
  assert.ok(stepResult?.error instanceof OrbytError, 'Expected OrbytError envelope for adapter failure');
  assert.equal((stepResult?.error as OrbytError).code, OrbytErrorCode.EXECUTION_ADAPTER_ERROR);
  assert.equal((stepResult?.error as OrbytError).path, 'workflow.steps.step_1');
  assert.equal((stepResult?.error as OrbytError).diagnostic.context?.adapterName, 'failing');
  assert.equal((stepResult?.error as OrbytError).diagnostic.context?.action, 'failing.exec');
}

async function run(): Promise<void> {
  const engine = new OrbytEngine({
    enableScheduler: false,
  });

  try {
    await assertUnsupportedInputEnvelope();
    assertDeterministicAdapterResolution(engine);
    await assertAdapterFailureEnvelope(engine);
  } finally {
    await engine.stop();
  }

  console.log('[phase-b-loader-boundary] PASS: loader boundary and adapter envelope checks succeeded');
}

run().catch((error) => {
  console.error('[phase-b-loader-boundary] FAIL:', error);
  process.exitCode = 1;
});
