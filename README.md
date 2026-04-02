# Orbyt

Orbyt is a workflow automation platform with a TypeScript execution engine and CLI.

It supports deterministic workflow execution, multi-workflow orchestration, usage telemetry for billing, durable local spool delivery, and checkpoint-based recovery primitives.

## Packages

- `@orbytautomation/engine` (current: 0.8.4)
- `@orbytautomation/cli`

Node requirement: `>=22`.

## Repository Layout

- `engine/`: execution runtime, adapters, scheduling, storage, usage, security, hooks, events
- `cli/`: command-line interface for run/validate/explain
- `docs/`: operational and product docs

## Engine Capabilities

- Workflow loading from file path, YAML string, JSON string, or object
- Validation and explain mode without execution
- DAG-based step orchestration with retry and timeout handling
- Multi-workflow execution via `runMany` (`sequential`, `parallel`, `mixed`)
- Event bus and lifecycle hooks
- Persistent execution artifacts under `~/.orbyt`
- Durable usage collection via local spool and optional batch transport to billing ingestion
- Checkpoint snapshots on workflow start, step updates, and workflow completion/failure/timeout
- Resume support from checkpointed run IDs (`strict` and `best-effort` policies)

## CLI Surface

- `orbyt run <workflow>`
- `orbyt validate <workflow>`
- `orbyt explain <workflow>`
- `orbyt doctor`
- `orbyt adapters`

Mode flags are supported on `run` (not on `validate` or `explain`).

## Quick Start

```bash
pnpm install
pnpm --filter @orbytautomation/engine run build
pnpm --filter @orbytautomation/cli run build
```

```bash
node products/orbyt/cli/dist/cli.js run ./workflow.yaml
```

```bash
node products/orbyt/cli/dist/cli.js run a.yaml,b.yaml,c.yaml --mode parallel --max-concurrency 3
```

## Engine Usage Example

```ts
import { OrbytEngine, WorkflowLoader } from '@orbytautomation/engine';

const engine = new OrbytEngine({
  logLevel: 'info',
  maxConcurrentWorkflows: 10,
  usageSpool: {
    enabled: true,
    // Optional endpoint for periodic batch push to billing ingestion service
    billingEndpoint: process.env.BILLING_INGEST_URL,
  },
});

const workflow = await WorkflowLoader.fromFile('./workflow.yaml');
const result = await engine.run(workflow, {
  variables: { env: 'dev' },
  timeout: 300000,
});

console.log(result.status);
await engine.stop();
```

## Resume Example

```ts
const resumed = await engine.run('./workflow.yaml', {
  resumeFromRunId: 'exec-1712345678901-abc123xyz',
  resumePolicy: 'strict',
});
```

`strict` fails if checkpoint is missing/invalid. `best-effort` falls back to a fresh run.

## Usage and Billing Telemetry

Engine emits usage facts through the standardized core `UsageCollector` contract.

Default behavior when no custom collector is passed:

- uses `FileSpoolUsageCollector`
- stores local usage files under `~/.billing/orbyt/usage`
- optionally pushes batches to a billing ingestion endpoint

Event categories currently emitted:

- `usage.workflow.run`
- `usage.step.execute`
- `usage.adapter.call`
- `usage.trigger.fire` (non-manual trigger sources)

## Documentation

- `engine/README.md`
- `docs/execution-modes.md`
- `WORKFLOW_SCHEMA.md`

## License

MIT