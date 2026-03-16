# Orbyt Execution Modes

This document explains how Orbyt executes one or many workflow files, how mode selection works, and when to use each mode.

## Scope

Execution modes apply to multi-workflow execution through the Orbyt CLI `run` command and the engine batch API (`runMany`).

Modes covered:
- `sequential`
- `parallel`
- `mixed`

## Quick Summary

- `sequential`: run one workflow after another in strict order.
- `parallel`: run all workflows concurrently, up to a configured concurrency limit.
- `mixed`: run workflows in waves (batches), each wave in parallel, then continue to the next wave.

## Where Modes Are Supported

Current command support:
- `run`: supports mode controls (`--mode`, `--max-concurrency`, `--mixed-batch-size`).
- `validate`: does not execute workflows, so mode flags are not currently used.
- `explain`: explains a single workflow plan; mode flags are not currently used.

## Mode Resolution Precedence

When running multiple workflows, the resolved mode follows this order:

1. Explicit mode from CLI/API option (`--mode` or `executionMode`).
2. Declared workflow strategy mode in YAML (`strategy.type`) when present.
3. Default fallback: `sequential`.

If multiple workflows declare different strategy modes and no explicit mode is provided, the engine resolves to `mixed`.

## Execution Model

### Preload Phase (Always First)

Before execution starts, Orbyt preloads all provided workflow inputs and validates them. If any workflow fails to load/parse/validate, the batch fails before execution begins.

Benefits:
- Early failure for invalid input files.
- Deterministic execution planning.
- Cleaner batch-level error reporting.

### Runtime Isolation in Batch Execution

For `parallel` and `mixed`, each workflow execution runs in an isolated runtime context to avoid shared mutable state collisions.

Isolation goals:
- Unique execution identity per workflow run.
- Safe concurrent execution.
- Reduced cross-workflow side effects in executor state.

## Mode Details

### 1) Sequential Mode

Behavior:
- Executes workflows in input order.
- Next workflow starts only after current workflow completes.

Best for:
- Deterministic ordering requirements.
- Workflows that depend on side effects from earlier workflows.
- Easier debugging.

Trade-offs:
- Slowest overall throughput.

Example:

```bash
orbyt run a.yaml,b.yaml,c.yaml --mode sequential
```

### 2) Parallel Mode

Behavior:
- Starts multiple workflows concurrently.
- Concurrency is bounded by `--max-concurrency` (or engine config default).

Best for:
- Independent workflows.
- Throughput-focused workloads.

Trade-offs:
- More concurrent resource usage (CPU, I/O, network).
- More interleaved logs and output.

Example:

```bash
orbyt run a.yaml,b.yaml,c.yaml --mode parallel --max-concurrency 3
```

### 3) Mixed Mode

Behavior:
- Splits workflows into waves.
- Each wave runs in parallel.
- Next wave starts after current wave completes.
- Wave size is controlled by `--mixed-batch-size`.

Best for:
- Controlled concurrency with predictable pressure.
- Large lists where full fan-out is too aggressive.

Trade-offs:
- Slightly more orchestration complexity than sequential.
- Potentially lower throughput than full parallel.

Example:

```bash
orbyt run a.yaml,b.yaml,c.yaml,d.yaml --mode mixed --mixed-batch-size 2 --max-concurrency 4
```

This runs in waves like:
- wave 1: `a.yaml`, `b.yaml`
- wave 2: `c.yaml`, `d.yaml`

## Failure and Exit Behavior

Per-workflow results are collected and summarized at the end of batch execution.

Typical behavior:
- A workflow may succeed or fail independently.
- Overall CLI exit code is non-zero if any workflow fails.
- Human output includes an overall summary and per-file results.

## YAML Strategy Declaration

A workflow may declare strategy hints, for example:

```yaml
strategy:
  type: parallel
```

Notes:
- CLI/API explicit mode still overrides YAML declaration.
- Workflow-declared strategy helps provide intent when explicit mode is not set.

## CLI Testing Notes (Observed)

Using three simple workflows (`sleep 2` each):

- Single workflow run: success, about 2 seconds.
- Sequential mode (3 workflows): success, about 6.6 seconds total.
- Parallel mode (3 workflows): success, near full overlap, much shorter elapsed time.
- Mixed mode (`batch-size=2`): success, two workflows first then one workflow.

These results match expected scheduling behavior for each mode.

## Operational Recommendations

Use this default decision guide:

1. Use `sequential` when order is required or when troubleshooting.
2. Use `parallel` for independent workflows and maximum throughput.
3. Use `mixed` when you need controlled concurrency and predictable resource usage.
4. Start with conservative concurrency, then increase gradually.

## Troubleshooting

If mode behavior looks wrong:

1. Confirm CLI command options (`--mode`, `--max-concurrency`, `--mixed-batch-size`).
2. Check whether YAML `strategy.type` is influencing mode when `--mode` is omitted.
3. Verify all input files were preloaded successfully.
4. Inspect batch summary and per-workflow result lines in output.

## Related Concepts

- Inside one workflow, step execution strategy can still affect internal step parallelism.
- Batch execution mode controls concurrency across workflow files.
- Step-level and workflow-level concurrency are related but separate layers.
