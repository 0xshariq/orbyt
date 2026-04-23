import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { WorkflowLoader } from '../../loader/WorkflowLoader.js';
import { OrbytEngine } from '../../core/OrbytEngine.js';

const fixturesRoot = resolve(process.cwd(), 'examples', 'phase-d');

type InvalidCase = {
  file: string;
  expectedMessage: string;
};

const invalidCases: InvalidCase[] = [
  {
    file: 'invalid-timeout-too-low.yaml',
    expectedMessage: 'Timeout below minimum safety threshold',
  },
  {
    file: 'invalid-retry-too-high.yaml',
    expectedMessage: 'retry.max exceeds safe limit',
  },
  {
    file: 'invalid-trigger-webhook.yaml',
    expectedMessage: 'Unsupported trigger type',
  },
  {
    file: 'invalid-condition-operator.yaml',
    expectedMessage: 'Unsupported operator found in condition',
  },
  {
    file: 'invalid-condition-custom-function.yaml',
    expectedMessage: 'Custom functions are not supported in condition',
  },
  {
    file: 'invalid-control-flow-loop-key.yaml',
    expectedMessage: 'Unsupported control-flow configuration',
  },
  {
    file: 'invalid-resource-cpu-nonnumeric.yaml',
    expectedMessage: 'resources.cpu must be numeric',
  },
  {
    file: 'invalid-secret-dynamic-key.yaml',
    expectedMessage: 'Dynamic secret references are not allowed',
  },
  {
    file: 'invalid-step-reference-missing.yaml',
    expectedMessage: 'Unknown step reference',
  },
];

async function expectInvalid(caseDef: InvalidCase): Promise<void> {
  const path = resolve(fixturesRoot, caseDef.file);

  try {
    await WorkflowLoader.fromFile(path);
    assert.fail(`Expected validation failure for ${caseDef.file}`);
  } catch (error) {
    const message = collectErrorText(error);
    assert.ok(
      message.includes(caseDef.expectedMessage),
      `Expected error for ${caseDef.file} to include "${caseDef.expectedMessage}", got: ${message}`,
    );
  }
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];

  if (error instanceof Error) {
    parts.push(error.message);

    const withCause = error as Error & { cause?: unknown };
    if (withCause.cause instanceof Error) {
      parts.push(withCause.cause.message);
    } else if (withCause.cause) {
      parts.push(String(withCause.cause));
    }

    const asRecord = error as unknown as Record<string, unknown>;
    if (typeof asRecord.debugOutput === 'string') {
      parts.push(asRecord.debugOutput);
    }

    const diagnostic = asRecord.diagnostic;
    if (diagnostic && typeof diagnostic === 'object') {
      parts.push(JSON.stringify(diagnostic));
    }

    const allKeys = Object.keys(asRecord);
    if (allKeys.length > 0) {
      parts.push(JSON.stringify(asRecord));
    }
  } else {
    parts.push(String(error));
  }

  return parts.join('\n');
}

async function expectScheduleAliasValid(): Promise<void> {
  const path = resolve(fixturesRoot, 'valid-trigger-schedule-alias.yaml');
  const parsed = await WorkflowLoader.fromFile(path);
  const firstTrigger = parsed.triggers?.[0];

  assert.ok(firstTrigger, 'Expected one trigger in valid schedule alias fixture');
  assert.equal(firstTrigger?.type, 'cron', 'Expected schedule alias to normalize to cron trigger type');
}

async function run(): Promise<void> {
  const engine = new OrbytEngine({
    enableScheduler: false,
  });

  try {
    for (const caseDef of invalidCases) {
      await expectInvalid(caseDef);
    }

    await expectScheduleAliasValid();
  } finally {
    await engine.stop();
  }

  console.log('[phase-d-validator-hardening] PASS: Phase D validator fixtures behaved as expected');
}

run().catch((error) => {
  console.error('[phase-d-validator-hardening] FAIL:', error);
  process.exitCode = 1;
});
