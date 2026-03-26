# Orbyt Usage Storage and Billing Fetching Plan

## Purpose

Define a proper, production-friendly approach for:

- storing usage in real time
- ensuring usage is emitted through the core `UsageCollector` interface
- allowing billing engine fetch/aggregation on daily, weekly, or monthly windows
- enabling quota restriction based on purchased subscription

This plan is aligned with `ecosystem-core/src/usage/UsageTypes.ts` and `UsageCollector` contract.

## Design Principles

- Usage must be recorded in real time at event boundaries.
- Event writes must never block critical execution path.
- Usage facts must be engine-generated, not user-provided.
- Storage should be append-only for auditability.
- Billing fetch cadence (daily/weekly/monthly) should read from pre-aggregated windows where possible.
- Enforcement path should support near real-time counters, while invoicing can run on periodic windows.

## Core Contract: UsageCollector Is Mandatory

All usage emission must go through the core `UsageCollector` interface.

Required method:

- `record(event: UsageEvent): Promise<void>`

Optional methods (recommended for efficiency):

- `recordBatch(events: UsageEvent[]): Promise<void>`
- `flush(): Promise<void>`
- `healthCheck(): Promise<{ healthy: boolean; detail?: string; lastSuccessAt?: number }>`

`UsageCollector` target should be:

- `billing-engine` for production billing ingestion

## Real-Time Usage Storage Strategy

Use a dual-layer storage pattern.

### Layer A: Real-Time Raw Event Log (Source of Truth)

Write each `UsageEvent` immediately via `UsageCollector.record` into an append-only store.

Recommended data model per event:

- id
- idempotencyKey
- timestamp
- product
- executionId
- workflowId
- workspaceId
- userId
- type
- adapterName
- billable
- metadata.durationMs
- metadata.success

Recommended persistence options:

- local/dev: JSONL files under `.orbyt/usage/events/YYYY/MM/DD/*.jsonl`
- production: durable event table or log-backed queue with at-least-once delivery

Why append-only raw events:

- replayable for billing corrections
- supports audits and disputes
- allows re-aggregation if pricing or logic changes

### Layer B: Near Real-Time Counters (Fast Enforcement)

Maintain rolling counters keyed by:

- workspaceId
- product
- metric (workflow_runs, adapter_calls, compute_ms, etc.)
- periodStart (day/week/month)

These counters are updated asynchronously from raw events and used for:

- quota checks
- soft/hard limit enforcement
- fast API reads

This avoids scanning large raw logs during every request.

## Billing Fetch Cadence (Daily, Weekly, Monthly)

Billing engine should fetch aggregates in windows:

- daily: default recommended for most teams
- weekly: optional for lower volume plans
- monthly: invoice finalization window

### Recommended Execution

1. Ingest new raw events continuously (real time)
2. Update counters continuously (near real time)
3. Run scheduled billing jobs:
   - daily aggregation job (primary)
   - optional weekly summary job
   - monthly invoice close job
4. Mark processed watermark per workspace and product

Use watermark checkpoints to guarantee idempotent fetching:

- `lastProcessedTimestamp` per workspace/product/job

## Proper End-to-End Flow

1. Orbyt engine finishes a billable action (workflow run, step execution, adapter call).
2. Engine emits canonical `UsageEvent`.
3. Orbyt-specific collector implementing core `UsageCollector` records event immediately.
4. Event is appended to raw log (Layer A).
5. Aggregator updates period counters (Layer B).
6. Subscription enforcement reads Layer B to allow or restrict usage.
7. Billing engine scheduled job fetches daily/weekly/monthly aggregates for charges.

## Restriction Logic Against Subscription

Use two thresholds per metric:

- soft limit: allow execution but emit warning/notification
- hard limit: block billable execution

Enforcement evaluation inputs:

- plan entitlements (included units)
- current period consumed units (from Layer B)
- overage policy (block, allow with overage, or grace)

Decision output:

- allow
- allow_with_warning
- deny_limit_reached

## Idempotency and Correctness

To avoid double billing:

- enforce unique constraint on `idempotencyKey` (or fallback `id`)
- deduplicate at collector ingestion point
- scheduled billing jobs must be restart-safe and idempotent

For late or out-of-order events:

- accept event if within configurable lateness window
- trigger re-aggregation for affected day/week/month bucket

## Reliability Requirements

Collector behavior should follow core contract expectations:

- non-fatal: never crash workflow for usage write errors
- resilient: retry with backoff for transient failures
- bounded: in-memory buffer with flush thresholds
- graceful shutdown: call `flush` and `close`

Recommended SLOs:

- P95 `record` latency under 50 ms
- no event loss on normal shutdown
- recovery replay supported after restart

## Suggested Storage Schema (Logical)

### Raw Events

- usage_events
  - event_id (pk)
  - idempotency_key (unique)
  - ts
  - workspace_id
  - user_id
  - product
  - execution_id
  - workflow_id
  - event_type
  - adapter_name
  - billable
  - duration_ms
  - success
  - metadata_json

Indexes:

- (workspace_id, ts)
- (product, ts)
- (event_type, ts)
- (idempotency_key unique)

### Aggregates

- usage_aggregates
  - workspace_id
  - product
  - period_type (daily | weekly | monthly)
  - period_start
  - metric
  - consumed
  - updated_at

Unique key:

- (workspace_id, product, period_type, period_start, metric)

## Implementation Guidance for Orbyt

1. Add `OrbytUsageCollector` that implements core `UsageCollector`.
2. Wire collector at engine lifecycle points where `UsageEvent` is already available.
3. Persist raw events immediately (append-only).
4. Add lightweight aggregator worker for counters.
5. Add billing fetch jobs:
   - daily as default
   - weekly optional
   - monthly close
6. Add enforcement API that reads current counters and entitlements before execution.

## Recommended Default Policy

- Real-time ingestion: enabled
- Billing fetch: daily (primary)
- Weekly fetch: enabled for analytics/sanity checks
- Monthly fetch: invoice closure and reconciliation
- Hard enforcement: enabled for free/pro tiers
- Enterprise override: policy-based (contract dependent)

## Why Daily Billing Fetch Is Better

Daily fetch gives a strong balance between cost and correctness:

- much cheaper than per-request billing computation
- fresher than weekly/monthly-only processing
- operationally simpler incident recovery
- faster alerting for abnormal spikes

Keep storage real time, keep billing fetch periodic.
That combination is the best practical architecture.
