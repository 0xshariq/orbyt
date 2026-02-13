# 🧠 Orbyt — Universal Workflow Automation Engine

## 📌 Current Status

**Engine v0.1.0 — Core Complete, CLI in Development**

The Orbyt execution engine is feature-complete and stable. The core execution system, adapter framework, state management, event system, and lifecycle hooks are fully implemented and tested.

**Next Phase**: CLI layer implementation to provide user-facing workflow execution interface.

**Version**: `0.1.0` (Engine Core)  
**Stability**: Engine Core is stable, CLI is in active development

---

## 🏷 Framework Name

**Orbyt**

Meaning: Orchestrate + automate systems and workflows.

It is a **generic automation engine**, not a MediaProc component — MediaProc will only be one of its integrations.

---

## 🎯 What is Orbyt?

Orbyt is a **universal workflow automation engine** that executes YAML-based workflows with an adapter-driven architecture. It provides a robust execution core for orchestrating complex, multi-step workflows with dependencies, retries, timeouts, and lifecycle hooks.

### Core Capabilities

✅ **YAML Workflow Definitions** — Define workflows in human-readable YAML  
✅ **Universal Adapter System** — Extensible adapter framework for any action type  
✅ **DAG Execution** — Automatic dependency resolution with parallel execution support  
✅ **State Management** — Complete workflow and step state tracking  
✅ **Retry Logic** — Configurable retry strategies (fixed, linear, exponential backoff)  
✅ **Timeout Management** — Step and workflow-level timeout enforcement  
✅ **Lifecycle Hooks** — User-defined hooks at workflow and step events  
✅ **Event Bus** — Internal pub/sub system for observability  
✅ **Context Engine** — Variable interpolation and runtime context  
✅ **Dry-run Mode** — Validate and plan without execution

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│          CLI Layer (in dev)             │
│  Command parsing, formatting, output    │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│        OrbytEngine (Public API)         │
│  run(), validate(), loadWorkflow()      │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│       Execution Engine (Core)           │
│  ┌──────────────────────────────────┐   │
│  │  WorkflowExecutor                │   │
│  │  - DAG planning & execution      │   │
│  │  - Dependency resolution         │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  StepExecutor                    │   │
│  │  - Step execution                │   │
│  │  - Retry logic                   │   │
│  │  - Timeout management            │   │
│  └──────────────────────────────────┘   │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│       Supporting Systems                │
│  ┌─────────────┐  ┌─────────────┐      │
│  │ EventBus    │  │ HookManager │      │
│  │ (Pub/Sub)   │  │ (Lifecycle) │      │
│  └─────────────┘  └─────────────┘      │
│  ┌─────────────┐  ┌─────────────┐      │
│  │ StateStore  │  │ AdapterReg  │      │
│  │ (Tracking)  │  │ (Plugins)   │      │
│  └─────────────┘  └─────────────┘      │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│         Adapter Layer                   │
│  Shell, HTTP, File, AWS, Custom...      │
└─────────────────────────────────────────┘
```

### Design Principles

1. **Thin CLI, Smart Engine** — CLI is a control surface, engine contains all logic
2. **Event-Driven** — All state changes emit events for observability
3. **Adapter-Based** — Extensible execution via universal adapter pattern
4. **Future-Safe** — Schema supports features not yet implemented (graceful evolution)

---

## 🎯 Implemented Features (Engine v0.1.0)

### ✅ Core Execution Engine

**WorkflowExecutor**

- Execution planning from YAML definitions
- Dependency graph resolution (DAG)
- Sequential and parallel step execution
- Context propagation between steps
- Workflow-level state management

**StepExecutor**

- Adapter-based step execution
- Configurable retry logic (fixed/linear/exponential backoff)
- Timeout enforcement with graceful cancellation
- Step result tracking and propagation
- Error handling and recovery

### ✅ Universal Adapter System

**AdapterRegistry**

- Dynamic adapter registration
- Namespace-based adapter resolution
- Action mapping and validation
- Extensible adapter interface

**Adapter Context**

- Complete execution context per step
- Input/output handling
- Environment variable injection
- Secret management support

### ✅ State Management

**StateStore**

- Workflow state tracking (pending/running/completed/failed)
- Step state persistence
- Execution history
- State snapshots for debugging

### ✅ Event System

**EventBus**

- Pub/sub pattern for all engine events
- 20+ typed event types
- Wildcard subscriptions
- Async event handlers with error isolation

**Event Types**

- `workflow.started`, `workflow.completed`, `workflow.failed`
- `step.started`, `step.completed`, `step.failed`, `step.retrying`, `step.timeout`
- `job.enqueued`, `job.dequeued`
- `schedule.triggered`
- `state.changed`
- `engine.started`, `engine.stopped`
- `worker.online`, `worker.offline`

### ✅ Lifecycle Hooks

**HookManager**

- `beforeWorkflow` / `afterWorkflow`
- `beforeStep` / `afterStep`
- `onError` / `onRetry`
- `onPause` / `onResume`
- Sequential hook execution with error isolation

### ✅ Configuration System

**EngineConfig**

- 20+ configuration options
- Mode selection (local/distributed/dry-run)
- Concurrency limits
- Default timeouts and retries
- Sandbox mode support
- Logging and metrics configuration

### ✅ Context & Variable Resolution

**ContextStore**

- Input variable management
- Secret references (integrated with Vaulta)
- Environment variable injection
- Runtime context assembly
- Variable interpolation support

### ✅ YAML Schema & Validation

**Comprehensive Workflow Schema**

- Metadata and annotations
- Triggers (manual, cron, event, webhook)
- Inputs with type validation
- Secrets management
- Step definitions with dependencies
- Retry and timeout policies
- Resource limits
- Future-safe schema (supports features not yet implemented)

**Schema Validation**

- Zod-based runtime validation
- Business logic validation (unique step IDs, valid dependencies)
- YAML syntax validation
- Detailed error messages with hints

## 🔜 In Development

### CLI Layer (Current Focus)

**Commands (Planned)**

- `orbyt run <workflow>` — Execute workflows
- `orbyt validate <workflow>` — Schema validation
- `orbyt explain <workflow>` — Show execution plan
- `orbyt adapter list` — List registered adapters
- `orbyt engine info` — Engine information

**Output Formatters**

- Human-readable output (symbols: ▶●✔✖↻)
- Verbose mode with adapter details
- JSON output for machines
- Null formatter for tests

**Exit Code Strategy**

- 0: Success
- 1: Validation error
- 2: Execution failed
- 3: Interrupted
- 4: Engine internal error
- 5: CLI misuse

## 📋 Roadmap

### Phase 1: Engine Core ✅ (v0.1.0)

- [x] Execution engine
- [x] Adapter system
- [x] State management
- [x] Event bus
- [x] Lifecycle hooks
- [x] Configuration system
- [x] YAML schema & validation

### Phase 2: CLI Layer 🚧 (v0.1.x)

- [ ] CLI command structure
- [ ] Formatter system
- [ ] `orbyt run` command
- [ ] `orbyt explain` command
- [ ] `orbyt validate` command
- [ ] Adapter introspection commands
- [ ] Exit code mapping

### Phase 3: Advanced Features 📅 (v0.2.0+)

- [ ] Workflow scheduling (cron-based)
- [ ] Execution history & replay
- [ ] Remote execution mode
- [ ] API server layer
- [ ] Distributed execution
- [ ] Advanced adapters (AWS, Azure, GCP)
- [ ] Observability & metrics
- [ ] Web dashboard

---

## � Example Workflow

```yaml
version: "1.0"
kind: workflow

metadata:
  name: image-processing-pipeline
  description: Resize and optimize images for web

inputs:
  source_image:
    type: string
    required: true
  width:
    type: number
    default: 1024

defaults:
  timeout: "5m"
  retry:
    maxAttempts: 3
    backoff: exponential
    initialDelay: 1s

workflow:
  steps:
    - id: validate
      name: Validate input image
      uses: file.exists
      with:
        path: "${{ inputs.source_image }}"

    - id: resize
      name: Resize image
      uses: image.resize
      needs: [validate]
      with:
        input: "${{ inputs.source_image }}"
        width: "${{ inputs.width }}"
        output: "./resized.jpg"
      outputs:
        resized_path: "${{ result.path }}"

    - id: optimize
      name: Optimize for web
      uses: image.optimize
      needs: [resize]
      with:
        input: "${{ steps.resize.outputs.resized_path }}"
        quality: 85

outputs:
  final_image: "${{ steps.optimize.outputs.path }}"
  size_kb: "${{ steps.optimize.outputs.size }}"
```

## 🎮 Usage (Engine API)

```typescript
import { OrbytEngine } from "@orbyt/engine";

// Initialize the engine
const engine = new OrbytEngine({
  mode: "local",
  maxConcurrentWorkflows: 5,
  defaultTimeout: 300000, // 5 minutes
  logLevel: "info",
  verbose: true,
});

// Register custom adapter
engine.registerAdapter(myCustomAdapter);

// Register lifecycle hooks
engine.registerHook("beforeWorkflow", async (context) => {
  console.log(`Starting workflow: ${context.workflow.name}`);
});

// Subscribe to events
engine.getEventBus().on("step.completed", (event) => {
  console.log(`Step ${event.stepId} completed in ${event.duration}ms`);
});

// Run a workflow
try {
  const result = await engine.run("./workflow.yaml", {
    variables: {
      source_image: "./input.jpg",
      width: 1024,
    },
  });

  console.log("Workflow completed:", result.status);
  console.log("Outputs:", result.outputs);
} catch (error) {
  console.error("Workflow failed:", error);
}
```

## 🚫 What Orbyt Does NOT Do

Orbyt is a workflow execution engine, not a complete platform.

**Out of Scope:**

- ❌ UI/Dashboard (planned for future)
- ❌ User authentication (delegate to integrations)
- ❌ Data storage (state only, not data persistence)
- ❌ Media-specific logic (MediaProc's responsibility)
- ❌ Cloud service management (adapters handle this)

**Design Philosophy:**

- Engine stays generic and unopinionated
- Domain logic lives in adapters
- CLI is thin (no business logic)
- Integration points are well-defined

---

## 🏗️ Relationship with Dev Ecosystem

Orbyt is part of the **@dev-ecosystem** monorepo but designed as an independent product.

### Current Structure

```
dev-ecosystem/
├── ecosystem-core/          # Shared utilities, schemas, contracts
├── products/
│   ├── orbyt/              # Workflow engine (this)
│   ├── mediaproc/          # Media processing CLI
│   ├── devforge/           # Code generation (planned)
│   └── ...
└── bridges/                # Integration adapters
    ├── identity/
    ├── billing/
    └── vaulta/             # Secret management
```

### Integration Points

**Orbyt integrates with:**

- **@dev-ecosystem/core** — Shared schemas, error codes, logging utilities
- **Vaulta** — Secret management and credential storage
- **MediaProc** — Media processing adapter (future)
- **DevForge** — Code generation workflows (future)

**Integration Pattern:**

```
MediaProc → Adapter → Orbyt Engine
DevForge  → Adapter → Orbyt Engine
Custom    → Adapter → Orbyt Engine
```

### Future Extraction

Orbyt is designed for eventual extraction into:

- Standalone `@orbyt/engine` package
- Independent CLI tool
- Separate repository with own versioning
- Ecosystem products become consumers

## 🌍 Long-Term Vision

### Phase 1: Local-First Engine (Current)

- CLI-based workflow execution
- Embedded engine usage
- Developer tool for automation

### Phase 2: Distributed Platform

- API server for remote execution
- Worker pool management
- Multi-tenant support
- Web dashboard

### Phase 3: Ecosystem Hub

- Marketplace for adapters
- Workflow templates library
- SaaS offering
- Enterprise features (governance, compliance, audit)

## 🧠 Design Philosophy

**Infrastructure, Not a Tool**

Orbyt is built with platform thinking:

1. **Layered Architecture** — Engine, CLI, API are separate concerns
2. **Event-Driven** — All state changes are observable
3. **Adapter-First** — Execution logic lives in adapters, not core
4. **Future-Safe Schema** — Schema supports features before implementation
5. **Contract-Based** — Clear contracts between layers (Engine ↔ CLI ↔ API)
6. **Zero Magic** — Explicit over implicit, predictable over clever

**This is not a project. This is a runtime.**

## 📚 Documentation

- [Workflow Schema Reference](../../internal-docs/orbyt/WORKFLOW_SCHEMA_REFERENCE.md) — Complete guide to YAML workflow definitions
- [CLI Design](../../internal-docs/orbyt/02-cli-layer/) — CLI architecture and command specifications
- [Engine Architecture](../../internal-docs/orbyt/01-engine-layer/) — Engine core design and components

## 🤝 Contributing

Orbyt is in active development. Contributions are welcome after v0.1.0 CLI release.

**Current Focus:** CLI layer implementation  
**Help Needed:** Adapter development, testing, documentation

## 📄 License

Part of the @dev-ecosystem monorepo. License TBD.

---

**Built with professional rigor. Designed for the long term.**
