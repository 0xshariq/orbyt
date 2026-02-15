# @orbytautomation/engine

**Execution runtime for the Orbyt automation framework** — Run workflows defined in Orbyt's YAML-based workflow language with adapters, lifecycle hooks, and powerful state management.

## Overview

`@orbytautomation/engine` is the execution engine for the **Orbyt automation framework**. It provides the runtime environment for executing workflow definitions written in Orbyt's workflow language.

Orbyt is a **complete automation framework and language** that includes:

- **Workflow Language** — YAML-based workflow definitions
- **Execution Engine** — This package (runtime orchestration)
- **CLI Tooling** — Command-line interface for workflow execution
- **Adapter Framework** — Extensible adapter system

This package provides the core execution engine that powers all workflow orchestration.

## Installation

```bash
npm install @orbytautomation/engine
```

## Quick Start

```typescript
import { OrbytEngine } from "@orbytautomation/engine";

const engine = new OrbytEngine();

const result = await engine.run("./workflow.yaml", {
  vars: { environment: "production" },
});

console.log(result.status); // 'completed', 'failed', 'timeout', etc.
```

## Core Features

- 🔗 **Adapter-based architecture** — Extensible integrations (CLI, HTTP, Shell, FS)
- 🔁 **Retry strategies** — Exponential backoff, linear, constant
- ⏰ **Timeout management** — Step and workflow-level timeouts
- 📡 **Event system** — Real-time workflow execution events
- 🖇️ **Step dependencies** — Sequential and parallel step execution
- 🪝 **Lifecycle hooks** — Before/after workflow, before/after step
- 🔐 **State isolation** — Each execution has independent state
- 🎯 **Variable interpolation** — Use `${{ vars.name }}`, `${{ env.KEY }}`, `${{ steps.step1.output }}`
- 🛑 **Exit codes** — Workflow-level exit code support

---

## API Reference

### OrbytEngine

Primary class for workflow execution.

```typescript
import { OrbytEngine } from "@orbytautomation/engine";

const engine = new OrbytEngine(config);
```

#### Configuration Options

```typescript
interface OrbytEngineConfig {
  // Maximum number of steps to run concurrently
  maxConcurrentSteps?: number; // default: 10

  // Default timeout for steps (ms)
  defaultStepTimeout?: number; // default: 300000 (5 minutes)

  // Continue executing even if a step fails
  continueOnError?: boolean; // default: false

  // Enable detailed logging
  verbose?: boolean; // default: false

  // Dry run mode (no adapters execute)
  dryRun?: boolean; // default: false

  // Custom adapter registry
  adapters?: Record<string, Adapter>;
}
```

#### Methods

##### `run(workflowPath, options)`

Execute a workflow from a file.

```typescript
const result = await engine.run("./workflow.yaml", {
  // Variables passed to workflow
  vars: {
    environment: "production",
    version: "1.2.3",
  },

  // Environment variables to inject
  env: {
    API_KEY: process.env.API_KEY,
  },

  // Execution timeout (ms)
  timeout: 600000,

  // Continue on errors
  continueOnError: false,

  // Dry run mode
  dryRun: false,
});
```

**Returns**: `WorkflowResult`

```typescript
interface WorkflowResult {
  status: "completed" | "failed" | "timeout" | "cancelled" | "validation_error";
  exitCode: number;
  duration: number;
  steps: StepResult[];
  metadata: {
    startTime: Date;
    endTime: Date;
    workflowName: string;
  };
}
```

##### `runWorkflow(workflowDef, options)`

Execute a workflow from a definition object.

```typescript
const workflowDef = {
  name: "my-workflow",
  steps: [
    {
      id: "hello",
      adapter: "cli",
      params: { command: 'echo "Hello"' },
    },
  ],
};

const result = await engine.runWorkflow(workflowDef, options);
```

##### `on(event, handler)`

Subscribe to workflow execution events.

```typescript
engine.on("workflow.started", (event) => {
  console.log(`Workflow ${event.workflowId} started`);
});

engine.on("step.completed", (event) => {
  console.log(`Step ${event.stepId} completed: ${event.status}`);
});
```

**Available Events**:

- `workflow.started`
- `workflow.completed`
- `workflow.failed`
- `workflow.timeout`
- `workflow.cancelled`
- `step.started`
- `step.completed`
- `step.failed`
- `step.retrying`
- `step.skipped`
- `step.timeout`

##### `validate(workflowPath)`

Validate a workflow without executing it.

```typescript
const validation = await engine.validate("./workflow.yaml");

if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}
```

##### `registerAdapter(name, adapter)`

Register a custom adapter.

```typescript
import { createAdapter } from "@orbytautomation/engine";

const myAdapter = createAdapter({
  name: "my-adapter",
  execute: async (params, context) => {
    // Implementation
    return { success: true, output: "result" };
  },
});

engine.registerAdapter("my-adapter", myAdapter);
```

---

## Workflow Language Reference

Orbyt workflows are defined in YAML with the following structure:

### Basic Structure

```yaml
name: my-workflow
description: Example workflow

# Global configuration
config:
  timeout: 300000
  continueOnError: false
  exitCode: 0

# Variables
vars:
  environment: production
  version: 1.0.0

# Steps
steps:
  - id: step1
    adapter: cli
    params:
      command: echo "Hello ${{ vars.environment }}"

  - id: step2
    adapter: http
    depends_on: [step1]
    params:
      url: https://api.example.com
      method: GET
    retry:
      maxAttempts: 3
      strategy: exponential
      initialDelay: 1000
```

### Variable Interpolation

Access variables using `${{ expression }}` syntax:

```yaml
steps:
  - id: deploy
    adapter: cli
    params:
      # Variables
      command: deploy --env=${{ vars.environment }}

      # Environment variables
      api_key: ${{ env.API_KEY }}

      # Previous step outputs
      version: ${{ steps.build.output.version }}

      # Context variables
      workflow: ${{ workflow.name }}
      timestamp: ${{ workflow.startTime }}
```

**Available Contexts**:

- `vars.*` — User-defined variables
- `env.*` — Environment variables
- `steps.<id>.output.*` — Output from previous steps
- `workflow.*` — Workflow metadata (name, startTime, etc.)

### Step Configuration

```yaml
steps:
  - id: step-id # Required: Unique identifier
    adapter: adapter-name # Required: Adapter to use

    # Optional: Description
    description: What this step does

    # Optional: Dependencies (wait for these steps)
    depends_on: [step1, step2]

    # Optional: Conditional execution
    if: ${{ vars.deploy == true }}

    # Optional: Timeout (ms)
    timeout: 30000

    # Optional: Continue on failure
    continueOnError: false

    # Optional: Retry strategy
    retry:
      maxAttempts: 3
      strategy: exponential # exponential, linear, constant
      initialDelay: 1000
      maxDelay: 30000
      backoffMultiplier: 2

    # Required: Adapter-specific parameters
    params:
      # ... adapter params
```

### Retry Strategies

**Exponential Backoff**:

```yaml
retry:
  maxAttempts: 5
  strategy: exponential
  initialDelay: 1000 # 1s
  maxDelay: 60000 # 60s max
  backoffMultiplier: 2 # 1s, 2s, 4s, 8s, 16s
```

**Linear Backoff**:

```yaml
retry:
  maxAttempts: 3
  strategy: linear
  initialDelay: 2000 # 2s, 4s, 6s
  backoffMultiplier: 1
```

**Constant Delay**:

```yaml
retry:
  maxAttempts: 3
  strategy: constant
  initialDelay: 5000 # 5s, 5s, 5s
```

### Step Dependencies

**Sequential Execution**:

```yaml
steps:
  - id: build
    adapter: cli
    params: { command: npm run build }

  - id: test
    adapter: cli
    depends_on: [build]
    params: { command: npm test }

  - id: deploy
    adapter: cli
    depends_on: [test]
    params: { command: npm run deploy }
```

**Parallel Execution**:

```yaml
steps:
  # These run in parallel
  - id: lint
    adapter: cli
    params: { command: npm run lint }

  - id: typecheck
    adapter: cli
    params: { command: npm run typecheck }

  # This waits for both
  - id: build
    adapter: cli
    depends_on: [lint, typecheck]
    params: { command: npm run build }
```

---

## Built-in Adapters

### CLI Adapter

Execute shell commands.

```yaml
- id: run-script
  adapter: cli
  params:
    command: npm run build
    cwd: ./project
    env:
      NODE_ENV: production
```

### Shell Adapter

Execute shell commands with streaming output.

```yaml
- id: deploy
  adapter: shell
  params:
    script: |
      set -e
      npm install
      npm run build
      npm run deploy
    shell: bash
    cwd: ./app
```

### HTTP Adapter

Make HTTP requests.

```yaml
- id: api-call
  adapter: http
  params:
    url: https://api.example.com/deploy
    method: POST
    headers:
      Authorization: Bearer ${{ env.API_TOKEN }}
    body:
      version: ${{ vars.version }}
    timeout: 30000
```

### FS Adapter

File system operations.

```yaml
- id: write-config
  adapter: fs
  params:
    operation: writeFile
    path: ./config.json
    content: ${{ steps.generate.output.config }}
```

---

## Custom Adapters

Create custom adapters to integrate with any system.

### Basic Adapter

```typescript
import { createAdapter, AdapterResultBuilder } from "@orbytautomation/engine";

const slackAdapter = createAdapter({
  name: "slack",

  execute: async (params, context) => {
    const { message, channel } = params;

    // Send message to Slack
    const response = await sendSlackMessage(channel, message);

    return new AdapterResultBuilder()
      .success()
      .withOutput({ messageId: response.ts })
      .build();
  },
});

// Register with engine
engine.registerAdapter("slack", slackAdapter);
```

### Usage in Workflow

```yaml
steps:
  - id: notify
    adapter: slack
    params:
      channel: "#deployments"
      message: Deployment completed successfully!
```

### Adapter API

```typescript
interface Adapter {
  name: string;
  execute: (
    params: Record<string, any>,
    context: AdapterContext,
  ) => Promise<AdapterResult>;
}

interface AdapterContext {
  workflowId: string;
  stepId: string;
  vars: Record<string, any>;
  env: Record<string, any>;
  stepOutputs: Record<string, any>;
}

interface AdapterResult {
  success: boolean;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
}
```

---

## Event System

Subscribe to real-time workflow execution events:

```typescript
// Workflow events
engine.on("workflow.started", (event) => {
  console.log(`Workflow ${event.workflowId} started`);
});

engine.on("workflow.completed", (event) => {
  console.log(`Workflow completed in ${event.duration}ms`);
});

engine.on("workflow.failed", (event) => {
  console.error(`Workflow failed: ${event.error}`);
});

// Step events
engine.on("step.started", (event) => {
  console.log(`Step ${event.stepId} started`);
});

engine.on("step.completed", (event) => {
  console.log(`Step ${event.stepId} completed`);
  console.log("Output:", event.output);
});

engine.on("step.failed", (event) => {
  console.error(`Step ${event.stepId} failed: ${event.error}`);
});

engine.on("step.retrying", (event) => {
  console.log(`Retrying step ${event.stepId} (attempt ${event.attempt})`);
});
```

---

## Lifecycle Hooks

Execute custom logic at key points in workflow execution:

```typescript
engine.beforeWorkflow(async (workflow, context) => {
  console.log(`Starting workflow: ${workflow.name}`);
  // Setup, validation, logging, etc.
});

engine.afterWorkflow(async (result, context) => {
  console.log(`Workflow ${result.status} in ${result.duration}ms`);
  // Cleanup, notifications, etc.
});

engine.beforeStep(async (step, context) => {
  console.log(`Starting step: ${step.id}`);
  // Pre-step setup
});

engine.afterStep(async (step, result, context) => {
  console.log(`Step ${step.id}: ${result.success ? "success" : "failed"}`);
  // Post-step processing
});
```

---

## Exit Codes

Workflows can specify exit codes for different scenarios:

```yaml
name: deployment
config:
  exitCode: 0 # Success

steps:
  - id: deploy
    adapter: cli
    params:
      command: deploy.sh
    exitCode: 1 # Failure exit code
```

**Standard Exit Codes**:

- `0` — Success
- `1` — Validation error
- `2` — Step failure
- `3` — Timeout
- `4` — Internal error
- `5` — Cancelled

---

## Related Packages

- **[@orbytautomation/cli](https://www.npmjs.com/package/@orbytautomation/cli)** — Command-line interface for Orbyt (Coming Soon...)
- **[@dev-ecosystem/core](https://www.npmjs.com/package/@dev-ecosystem/core)** — Shared types and utilities

---

## Links

- **Repository**: [GitHub](https://github.com/0xshariq/orbyt)
- **Documentation**: [GitHub README](https://github.com/0xshariq/orbyt#readme)
- **Issues**: [GitHub Issues](https://github.com/0xshariq/orbyt/issues)
- **npm**: [@orbytautomation/engine](https://www.npmjs.com/package/@orbytautomation/engine)

---

## License

MIT
