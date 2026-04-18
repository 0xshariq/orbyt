import assert from 'node:assert/strict';
import { OrbytEngine } from '../../core/OrbytEngine.js';
import { WorkflowLoader } from '../../loader/WorkflowLoader.js';

const workflowShapeA = {
  version: '1.0.0',
  kind: 'workflow',
  metadata: {
    name: 'phase-c-normalizer',
    description: 'Determinism check',
    tags: ['core', 'normalizer'],
    owner: 'qa',
  },
  workflow: {
    steps: [
      {
        id: 'prepare',
        uses: 'shell.exec',
        with: {
          command: 'echo prepare',
        },
      },
      {
        id: 'validate',
        uses: 'shell.exec',
        with: {
          command: 'echo validate',
        },
      },
      {
        id: 'run',
        uses: 'shell.exec',
        with: {
          command: 'echo run',
        },
        needs: ['validate', 'prepare'],
      },
    ],
  },
};

const workflowShapeB = {
  kind: 'workflow',
  version: '1.0.0',
  name: 'phase-c-normalizer',
  description: 'Determinism check',
  tags: ['core', 'normalizer'],
  owner: 'qa',
  steps: [
    {
      id: 'prepare',
      action: 'shell.exec',
      input: {
        command: 'echo prepare',
      },
      needs: [],
      continueOnError: false,
    },
    {
      id: 'validate',
      action: 'shell.exec',
      input: {
        command: 'echo validate',
      },
      needs: [],
      continueOnError: false,
    },
    {
      id: 'run',
      action: 'shell.exec',
      input: {
        command: 'echo run',
      },
      needs: ['prepare', 'validate', 'prepare'],
      continueOnError: false,
    },
  ],
};

async function run(): Promise<void> {
  const engine = new OrbytEngine({
    enableScheduler: false,
  });

  try {
    const parsedA = await WorkflowLoader.toWorkflowObject(workflowShapeA);
    const parsedB = await WorkflowLoader.toWorkflowObject(workflowShapeB);

    assert.deepStrictEqual(parsedA, parsedB, 'Equivalent workflow inputs should normalize to the same canonical object');

    const runStep = parsedA.steps.find((step) => step.id === 'run');
    assert.ok(runStep, 'Expected run step to exist after normalization');
    assert.deepStrictEqual(runStep?.needs, ['prepare', 'validate'], 'Step dependencies should be stable and deduplicated');

    console.log('[phase-c-normalizer-determinism] PASS: equivalent inputs normalize identically');
  } finally {
    await engine.stop();
  }
}

run().catch((error) => {
  console.error('[phase-c-normalizer-determinism] FAIL:', error);
  process.exitCode = 1;
});
