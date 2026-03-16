# @orbytautomation/engine

Execution runtime for Orbyt workflows.

## Package Info

- Name: @orbytautomation/engine
- Version: 0.8.0
- Node: >= 22

## Install

```bash
npm install @orbytautomation/engine
```

## Core Concepts

- OrbytEngine: primary runtime class
- WorkflowLoader: load and validate workflow inputs
- run: execute one workflow
- runMany: preload, resolve mode, then execute many workflows
- validate: verify workflow correctness without execution
- explain: build and return execution plan without running steps

Built-in adapters are registered by default:

- cli
- shell
- http
- fs

## Quick Start

```ts
import { OrbytEngine, WorkflowLoader } from "@orbytautomation/engine";

const engine = new OrbytEngine({ logLevel: "info" });
const workflow = await WorkflowLoader.fromFile("./workflow.yaml");

const result = await engine.run(workflow, {
  variables: { target: "prod" },
  timeout: 300000,
});

console.log(result.status);
```

## Single Workflow API

Accepted workflow inputs:

- file path string
- YAML string
- JSON string
- parsed workflow object

```ts
const result = await engine.run("./workflow.yaml", {
  variables: { region: "us-east-1" },
  env: { NODE_ENV: "production" },
  secrets: { TOKEN: process.env.TOKEN },
  continueOnError: false,
  dryRun: false,
});
```

## Batch Execution API (runMany)

runMany behavior:

1. Preload and validate all workflows first
2. Resolve execution mode
3. Execute in sequential, parallel, or mixed orchestration
4. Return per-workflow and aggregate result data

```ts
const batch = await engine.runMany([
  "./w1.yaml",
  "./w2.yaml",
  "./w3.yaml",
], {
  executionMode: "parallel", // sequential | parallel | mixed
  maxParallelWorkflows: 3,
  mixedBatchSize: 2,
  failFast: false,
});

console.log(batch.mode);
console.log(batch.totalWorkflows, batch.successfulWorkflows, batch.failedWorkflows);
```

Mode resolution precedence:

1. Explicit executionMode option
2. Workflow strategy.type declaration
3. Default sequential

For details see:

- ../docs/execution-modes.md

## validate and explain

```ts
const ok = await engine.validate("./workflow.yaml");
const plan = await engine.explain("./workflow.yaml");
```

- validate returns true or throws on invalid input
- explain returns an execution explanation object

## Configuration (OrbytEngineConfig)

Common options:

- maxConcurrentWorkflows
- maxConcurrentSteps
- defaultTimeout
- mode (local | distributed | dry-run)
- enableScheduler
- adapters
- hooks
- logLevel
- verbose
- stateDir
- logDir
- cacheDir
- runtimeDir
- workingDirectory

Example:

```ts
const engine = new OrbytEngine({
  mode: "local",
  logLevel: "info",
  maxConcurrentWorkflows: 10,
  maxConcurrentSteps: 10,
  defaultTimeout: 300000,
  enableScheduler: true,
});
```

## Events and Hooks

Event bus:

```ts
const events = engine.getEventBus();
events.on("workflow.completed", (event) => {
  console.log(event.workflowName, event.executionId);
});
```

Hooks:

```ts
engine.registerHook({
  name: "audit-hook",
  beforeStep: async (ctx) => {
    // custom behavior
  },
});
```

## Minimal Workflow Example

```yaml
version: "1.0"
kind: workflow

metadata:
  name: simple-shell

workflow:
  steps:
    - id: step1
      uses: shell.exec
      with:
        command: echo "hello"
```

## Related

- ../README.md
- ../docs/execution-modes.md
- ../WORKFLOW_SCHEMA.md

## License

MIT