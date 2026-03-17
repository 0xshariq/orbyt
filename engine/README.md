# @orbytautomation/engine

Orbyt's TypeScript automation runtime.

## Package Info

- Name: `@orbytautomation/engine`
- Version: `0.8.4`
- Node: `>=22`

## Install

```bash
npm install @orbytautomation/engine
```

## What This Engine Provides

- Workflow loading and validation (`WorkflowLoader`)
- Single-workflow execution (`run`)
- Multi-workflow orchestration (`runMany`)
- Dry-run and explain support (`validate`, `explain`)
- Retry/timeout execution control
- Built-in adapters: `cli`, `shell`, `http`, `fs`
- Event bus and lifecycle hooks
- Usage telemetry emission through standardized `UsageCollector`
- Durable local usage spool with optional periodic billing push
- Checkpoint snapshots and resume support (`resumeFromRunId`)

## Primary APIs

### Run one workflow

```ts
import { OrbytEngine } from '@orbytautomation/engine';

const engine = new OrbytEngine({ logLevel: 'info' });

const result = await engine.run('./workflow.yaml', {
  variables: { region: 'us-east-1' },
  env: { NODE_ENV: 'production' },
  secrets: { TOKEN: process.env.TOKEN },
  timeout: 300000,
  continueOnError: false,
  triggeredBy: 'manual',
});

console.log(result.status);
```

Accepted workflow input formats:

- file path string
- YAML string
- JSON string
- parsed workflow object

### Resume a workflow run

```ts
const resumed = await engine.run('./workflow.yaml', {
  resumeFromRunId: 'exec-1712345678901-abc123xyz',
  resumePolicy: 'strict', // 'strict' | 'best-effort'
  triggeredBy: 'scheduler',
});
```

Resume behavior:

- loads checkpoint by run id
- restores previous step outputs/context
- skips already successful/skipped steps
- continues unfinished work
- emits `workflow.resumed`

### Run many workflows

```ts
const batch = await engine.runMany([
  './w1.yaml',
  './w2.yaml',
  './w3.yaml',
], {
  executionMode: 'mixed', // sequential | parallel | mixed
  maxParallelWorkflows: 3,
  mixedBatchSize: 2,
  failFast: false,
});

console.log(batch.mode, batch.successfulWorkflows, batch.failedWorkflows);
```

Execution mode precedence:

1. explicit `executionMode`
2. workflow `strategy.type`
3. default `sequential`

## Validation and Explain

```ts
const valid = await engine.validate('./workflow.yaml');
const explanation = await engine.explain('./workflow.yaml');
```

- `validate` returns `true` or throws
- `explain` returns execution analysis without running steps

## Usage and Billing Telemetry

The engine emits usage facts through the `UsageCollector` interface from `@dev-ecosystem/core`.

Default collector behavior when `usageCollector` is not provided:

- uses built-in `FileSpoolUsageCollector`
- writes durable local spool under `~/.orbyt/usage`
- optionally sends periodic batches via HTTP transport

Usage events emitted:

- `usage.workflow.run`
- `usage.step.execute`
- `usage.adapter.call`
- `usage.trigger.fire` (for non-manual trigger sources)

### Configure usage spool

```ts
const engine = new OrbytEngine({
  usageSpool: {
    enabled: true,
    baseDir: '/home/user/.orbyt/usage',
    batchSize: 200,
    flushIntervalMs: 60000,
    maxRetryAttempts: 10,
    billingEndpoint: process.env.BILLING_INGEST_URL,
    billingApiKey: process.env.BILLING_API_KEY,
    requestTimeoutMs: 10000,
  },
});
```

## Checkpointing (Phase 3) and Resume (Phase 4)

Checkpoint snapshots are persisted to `~/.orbyt/state/checkpoints` (or configured state path) at:

- workflow started
- step updated
- workflow completed
- workflow failed
- workflow timeout
- workflow resumed

Snapshots include:

- workflow run status
- per-step state and outputs
- runtime context snapshot
- metadata with checkpoint reason and timestamps

## Key Configuration Options

- `maxConcurrentWorkflows`
- `maxConcurrentSteps`
- `defaultTimeout`
- `mode` (`local` | `distributed` | `dry-run`)
- `enableScheduler`
- `adapters`
- `hooks`
- `logLevel`, `verbose`
- `stateDir`, `logDir`, `cacheDir`, `runtimeDir`
- `usageCollector`
- `usageSpool`

## Event Bus and Hooks

```ts
const events = engine.getEventBus();
events.on('workflow.completed', (event) => {
  console.log(event.type, event.runId);
});

engine.registerHook({
  name: 'audit-hook',
  beforeStep: async (ctx) => {
    // custom logic
  },
});
```

## Runtime Directories

At startup, engine prepares directories under `~/.orbyt` (or configured equivalents), including:

- `state/` (executions, checkpoints, schedules, workflows)
- `cache/`
- `runtime/`
- `usage/`
- `config/`

On first use, engine also creates `~/.orbyt/config/config.json`.

## Related Docs

- `../README.md`
- `../docs/execution-modes.md`
- `../WORKFLOW_SCHEMA.md`

## License

MIT
