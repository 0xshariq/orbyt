# Orbyt

Orbyt is a workflow automation runtime with a YAML workflow language, a TypeScript execution engine, and a CLI.

## Current Status

- Engine package: @orbytautomation/engine v0.8.0
- CLI package: @orbytautomation/cli v0.1.0
- Node requirement: >= 22

This repository contains the engine and CLI in active use. Multi-workflow execution is supported in the CLI run command with sequential, parallel, and mixed modes.

## Repository Layout

- engine: Runtime package (workflow execution, adapters, events, hooks, scheduling, stores)
- cli: Command-line interface (run, validate, explain, doctor, adapters)
- api: API-related code and integration surface
- docs: Product docs (including execution modes)
- sub-systems: Supporting subsystems and modules

## What Is Implemented

- Workflow loading from file, YAML string, JSON string, or object
- Schema and business-rule validation
- Step DAG planning and execution
- Built-in adapters (cli, shell, http, fs)
- Retry and timeout policies
- Event bus and lifecycle hooks
- Dry-run and explain flows
- Persistent state directories under ~/.orbyt
- Multi-workflow batch execution via engine runMany and CLI run

## CLI Commands

Main commands:

- orbyt run <workflow>
- orbyt validate <workflow>
- orbyt explain <workflow>
- orbyt doctor
- orbyt adapters

Mode support by command:

- run: supports --mode, --max-concurrency, --mixed-batch-size
- validate: no mode flags
- explain: no mode flags

## Multi-Workflow Execution Modes

The run command supports:

- sequential: one workflow at a time in input order
- parallel: workflows execute concurrently, bounded by max concurrency
- mixed: workflows execute in waves, each wave in parallel

Resolution precedence:

1. Explicit CLI or API mode
2. Workflow strategy.type declaration
3. Default sequential

Detailed guide:

- docs/execution-modes.md

## Quick Start (Workspace)

Install and build:

```bash
pnpm install
pnpm --filter @orbytautomation/engine run build
pnpm --filter @orbytautomation/cli run build
```

Show CLI help:

```bash
node products/orbyt/cli/dist/cli.js --help
```

Run one workflow:

```bash
node products/orbyt/cli/dist/cli.js run ./workflow.yaml
```

Run many workflows with explicit mode:

```bash
node products/orbyt/cli/dist/cli.js run a.yaml,b.yaml,c.yaml --mode parallel --max-concurrency 3
```

## Workflow Example

```yaml
version: "1.0"
kind: workflow

metadata:
  name: hello-orbyt

workflow:
  steps:
    - id: hello
      uses: shell.exec
      with:
        command: echo "Hello from Orbyt"
```

## Engine API Example

```ts
import { OrbytEngine, WorkflowLoader } from "@orbytautomation/engine";

const engine = new OrbytEngine({
  logLevel: "info",
  maxConcurrentWorkflows: 10,
});

const workflow = await WorkflowLoader.fromFile("./workflow.yaml");
const result = await engine.run(workflow, {
  variables: { env: "dev" },
  timeout: 300000,
});

console.log(result.status);
```

Batch API example:

```ts
const batch = await engine.runMany([
  "./w1.yaml",
  "./w2.yaml",
  "./w3.yaml",
], {
  executionMode: "mixed",
  maxParallelWorkflows: 3,
  mixedBatchSize: 2,
});

console.log(batch.mode, batch.successfulWorkflows, batch.failedWorkflows);
```

## Documentation

- engine/README.md
- WORKFLOW_SCHEMA.md
- docs/execution-modes.md
- STRUCTURE.md

## License

MIT