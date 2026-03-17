import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { OrbytEngine } from '../../core/OrbytEngine.js';
import { MockAdapter } from '../MockAdapter.js';

const failingWorkflow = `
version: "1.0"
kind: workflow
metadata:
  name: resume-check
workflow:
  steps:
    - id: step1
      uses: shell.exec
      with:
        command: "echo step1 >> ${'${inputs.counterFile}'}"
    - id: step2
      uses: failer.run
      needs: [step1]
`;

const successWorkflow = `
version: "1.0"
kind: workflow
metadata:
  name: resume-check
workflow:
  steps:
    - id: step1
      uses: shell.exec
      with:
        command: "echo step1 >> ${'${inputs.counterFile}'}"
    - id: step2
      uses: failer.run
      needs: [step1]
`;

export async function runResumeIntegrationTest(): Promise<void> {
  const stateRoot = mkdtempSync(join(tmpdir(), 'orbyt-resume-state-'));
  const runRoot = mkdtempSync(join(tmpdir(), 'orbyt-resume-run-'));
  const counterFile = join(runRoot, 'counter.txt');

  const failingEngine = new OrbytEngine({
    stateDir: join(stateRoot, 'state'),
    cacheDir: join(stateRoot, 'cache'),
    logDir: join(stateRoot, 'logs'),
    runtimeDir: join(stateRoot, 'runtime'),
    adapters: [MockAdapter.createFailure('failer')],
  });

  const resumeEngine = new OrbytEngine({
    stateDir: join(stateRoot, 'state'),
    cacheDir: join(stateRoot, 'cache'),
    logDir: join(stateRoot, 'logs'),
    runtimeDir: join(stateRoot, 'runtime'),
    adapters: [MockAdapter.createSuccess('failer')],
  });

  try {
    let failedExecutionId = '';

    try {
      await failingEngine.run(failingWorkflow, {
        variables: { counterFile },
      });
      assert.fail('Initial run should fail due to step2');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      assert.ok(message.length > 0, 'failure should provide an error message');
    }

    const checkpointDir = join(stateRoot, 'state', 'checkpoints');
    const checkpointFiles = readFileSync(join(checkpointDir, `${getLatestCheckpointId(checkpointDir)}.json`), 'utf8');
    const checkpoint = JSON.parse(checkpointFiles) as { runId: string };
    failedExecutionId = checkpoint.runId;

    const resumed = await resumeEngine.run(successWorkflow, {
      variables: { counterFile },
      resumeFromRunId: failedExecutionId,
      resumePolicy: 'strict',
      triggeredBy: 'scheduler',
    });

    assert.equal(resumed.status, 'success', 'resumed run should succeed');

    const counterData = readFileSync(counterFile, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(counterData.length, 1, 'step1 must not run again during resume');

    let strictError = false;
    try {
      await resumeEngine.run(successWorkflow, {
        variables: { counterFile },
        resumeFromRunId: 'missing-run-id',
        resumePolicy: 'strict',
      });
    } catch {
      strictError = true;
    }
    assert.equal(strictError, true, 'strict resume must fail for missing checkpoint');

    const bestEffort = await resumeEngine.run(successWorkflow, {
      variables: { counterFile },
      resumeFromRunId: 'missing-run-id',
      resumePolicy: 'best-effort',
    });
    assert.equal(bestEffort.status, 'success', 'best-effort resume should fall back to fresh execution');
  } finally {
    await failingEngine.stop();
    await resumeEngine.stop();
    rmSync(stateRoot, { recursive: true, force: true });
    rmSync(runRoot, { recursive: true, force: true });
  }
}

function getLatestCheckpointId(dir: string): string {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    throw new Error('No checkpoint files found');
  }
  return files[files.length - 1].replace(/\.json$/, '');
}
