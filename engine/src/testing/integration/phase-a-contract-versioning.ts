import assert from 'node:assert/strict';
import { OrbytEngine } from '../../core/OrbytEngine.js';
import { WorkflowLoader } from '../../loader/WorkflowLoader.js';

function createBaseWorkflow(): Record<string, unknown> {
  return {
    version: '1.0.0',
    kind: 'workflow',
    metadata: {
      name: 'phase-a-contract-versioning',
      description: 'Phase A contract and versioning test',
    },
    workflow: {
      steps: [
        {
          id: 'step_1',
          uses: 'shell.exec',
          with: {
            command: 'echo phase-a',
          },
        },
      ],
    },
  };
}

async function assertCompatibilityMetadataPreserved(_engine: OrbytEngine): Promise<void> {
  const workflow = {
    ...createBaseWorkflow(),
    compatibility: {
      minVersion: '0.1.0',
      maxVersion: '0.2.0',
      deprecated: true,
    },
    deprecationInfo: {
      message: 'Use workflow v2 contract',
      removedIn: '1.0.0',
      replacementPath: 'workflows.v2.phase-a-contract-versioning',
    },
  };

  const parsed = await WorkflowLoader.toWorkflowObject(workflow);

  assert.equal(parsed.compatibility?.minVersion, '0.1.0');
  assert.equal(parsed.compatibility?.maxVersion, '0.2.0');
  assert.equal(parsed.compatibility?.deprecated, true);
  assert.equal(parsed.deprecationInfo?.message, 'Use workflow v2 contract');
  assert.equal(parsed.deprecationInfo?.removedIn, '1.0.0');
  assert.equal(parsed.deprecationInfo?.replacementPath, 'workflows.v2.phase-a-contract-versioning');
}

async function assertVersionCompatibilityGate(engine: OrbytEngine): Promise<void> {
  const supportedWorkflow = {
    ...createBaseWorkflow(),
    compatibility: {
      minVersion: '0.1.0',
      maxVersion: '0.2.0',
    },
  };

  const parsedSupportedWorkflow = await WorkflowLoader.toWorkflowObject(supportedWorkflow);
  const isValid = await engine.validate(parsedSupportedWorkflow);
  assert.equal(isValid, true, 'Expected supported compatibility range to pass validation');

  const minTooHigh = {
    ...createBaseWorkflow(),
    compatibility: {
      minVersion: '9.0.0',
    },
  };

  await assert.rejects(
    async () => {
      const parsedMinTooHigh = await WorkflowLoader.toWorkflowObject(minTooHigh);
      await engine.validate(parsedMinTooHigh);
    },
    /UNSUPPORTED_WORKFLOW_VERSION/,
    'Expected validation failure when workflow minVersion exceeds engine version',
  );

  const maxTooLow = {
    ...createBaseWorkflow(),
    compatibility: {
      maxVersion: '0.0.1',
    },
  };

  await assert.rejects(
    async () => {
      const parsedMaxTooLow = await WorkflowLoader.toWorkflowObject(maxTooLow);
      await engine.validate(parsedMaxTooLow);
    },
    /UNSUPPORTED_WORKFLOW_VERSION/,
    'Expected validation failure when workflow maxVersion is below engine version',
  );
}

async function run(): Promise<void> {
  const engine = new OrbytEngine({ enableScheduler: false });

  try {
    await engine.start();
    await assertCompatibilityMetadataPreserved(engine);
    await assertVersionCompatibilityGate(engine);
  } finally {
    await engine.stop();
  }

  console.log('[phase-a-contract-versioning] PASS: contract metadata and version compatibility checks succeeded');
}

run().catch((error) => {
  console.error('[phase-a-contract-versioning] FAIL:', error);
  process.exitCode = 1;
});
