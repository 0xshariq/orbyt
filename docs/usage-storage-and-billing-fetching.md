# Orbyt Usage Storage and Billing Fetching

## Document Goal

Define a practical and phased plan for Orbyt to:

- store usage in real time
- emit usage only through the core `UsageCollector` contract
- enforce subscription limits using near real-time usage counters
- provide only foundational billing-fetch capabilities in v1

This plan intentionally keeps billing computation lightweight until Orbyt engine maturity and v1 release stabilization.

## Scope and Staging

### In Scope for v1

- reliable real-time usage event capture
- durable local spool under `~/.billing/orbyt/usage`
- optional HTTP transport for usage batch delivery
- dedup/idempotency foundations
- daily usage aggregation job foundation
- basic weekly/monthly windows available as optional rollups
- quota restriction based on near real-time counters

### Out of Scope for v1 (Post-v1)

- full invoice generation and tax logic
- complex pricing rules and retroactive repricing
- revenue recognition workflows
- advanced billing dispute automation

## Current State in Orbyt (Already Implemented)

Orbyt already has strong building blocks:

- `FileSpoolUsageCollector` is available and durable.
- `NoOpUsageCollector` exists for testing-only fallback.
- `UsageEventFactory` creates canonical usage events.
- Engine records usage asynchronously and non-fatally.
- Engine flushes/closes collector on shutdown.
- Default spool path is `~/.billing/orbyt/usage`.

Implementation references:

- `products/orbyt/engine/src/usage/FileSpoolUsageCollector.ts`
- `products/orbyt/engine/src/usage/UsageEventFactory.ts`
- `products/orbyt/engine/src/core/OrbytEngine.ts`
- `products/orbyt/engine/src/core/EngineConfig.ts`
- `ecosystem-core/src/usage/UsageTypes.ts`

## Core Contract Rule

All usage events must go through `UsageCollector` from core.

Required:

- `record(event: UsageEvent): Promise<void>`

Recommended:

- `recordBatch(events: UsageEvent[]): Promise<void>`
- `flush(): Promise<void>`
- `healthCheck(): Promise<{ healthy: boolean; detail?: string; lastSuccessAt?: number }>`
- `close(): Promise<void>`

Collector identity for production ingestion:

- `contractVersion = '1.0'`
- `target = 'billing-engine'`

## Storage Strategy

Use a two-layer model.

### Layer A: Raw Event Source of Truth (Real Time)

Every usage event is appended immediately to immutable event storage.

For local/dev v1:

- `~/.billing/orbyt/usage/events/YYYY-MM-DD.jsonl`

For delivery retry state:

- `~/.billing/orbyt/usage/pending/*.json`
- `~/.billing/orbyt/usage/sent/*.json`
- `~/.billing/orbyt/usage/failed/*.json`

### `~/.billing/orbyt/usage` Directory Semantics

- `events/`
  - append-only JSONL archive partitioned by day
  - source of truth for replay and reconciliation
- `pending/`
  - envelopes queued for external delivery
  - retried in batches by collector flush loop
- `sent/`
  - envelopes successfully delivered to ingestion endpoint
  - can be retained short-term for forensic checks
- `failed/`
  - envelopes that exceeded retry threshold
  - requires operator replay or investigation

Operational rules:

- never mutate records in `events/`
- move envelopes between state directories atomically
- retention for `sent/` and `failed/` must be policy-driven
- if billing endpoint is down, `pending/` may grow but workflows must continue

Why this model:

- replay support
- auditability
- correction/re-aggregation support
- resilience during network or billing endpoint outages

### Layer B: Near Real-Time Aggregates (Enforcement Read Model)

Maintain counters keyed by:

- `workspaceId`
- `product`
- `metric`
- `periodType` (`daily`, `weekly`, `monthly`)
- `periodStart`

Example metrics:

- `workflow_runs`
- `step_executions`
- `adapter_calls`
- `compute_ms`

This read model is used for fast allow/deny decisions and avoids scanning raw logs per request.

## Event Emission Policy

Emit events only at deterministic engine lifecycle points:

- workflow started/run (`usage.workflow.run`)
- step executed (`usage.step.execute`)
- adapter call (`usage.adapter.call`)
- trigger fired (`usage.trigger.fire`)

Required fields per event for v1 enforcement/billing foundation:

- `id`
- `timestamp`
- `type`
- `product`
- `executionId`
- `workspaceId` (mandatory for multi-tenant billing)
- `userId` (recommended)
- `billable`
- `idempotencyKey` (recommended)

## Billing Fetching Approach (Foundational for v1)

Billing fetching in v1 should focus on usage availability, not final money logic.

### Fetch Windows

- Daily: primary and recommended
- Weekly: optional summarization
- Monthly: optional summary for reporting

### Fetch Job Responsibilities

- read new usage since last watermark
- aggregate by workspace/product/period
- upsert counters
- persist watermark checkpoints
- emit operational logs/metrics

### Watermark Model

Store:

- `jobName`
- `workspaceId`
- `product`
- `lastProcessedTimestamp`
- `updatedAt`

This makes jobs restart-safe and idempotent.

## Subscription Restriction Model

For each request/workflow run:

1. Resolve active plan entitlements.
2. Read current period counters.
3. Evaluate policy.
4. Return decision:
   - `allow`
   - `allow_with_warning`
   - `deny_limit_reached`

Policy levels:

- soft limit: warn but allow
- hard limit: deny billable execution

## Reliability and Data Correctness

Must-have guarantees:

- non-fatal usage recording (never fail workflow execution)
- at-least-once delivery from spool to ingestion endpoint
- idempotent ingestion (dedupe by `idempotencyKey` or `id`)
- graceful shutdown via `flush` and `close`

Late event behavior:

- accept late events within configured lateness window
- re-aggregate impacted periods only

## Implementation Plan

This section is the execution plan requested for engineering.

## Implementation Status Snapshot (Current)

This section tracks what is already implemented in code and what remains.

### Implemented So Far

- Phase 0 implemented:
  - idempotency keys added in usage event factory paths
  - workspace-aware billing guard (billable events missing workspace are forced non-billable)
  - usage collector health telemetry wired
  - `~/.billing/orbyt/usage` semantics documented
- Phase 1 implemented (engine-side):
  - durable file spool collector is default
  - `events/pending/sent/failed` flow present with retry handling
  - retention knobs for sent/failed artifacts are available in config
  - collector flush/close lifecycle integrated with engine
- Phase 2 implemented:
  - daily aggregation pipeline from raw events
  - persisted daily aggregates + watermark state
  - daily aggregate read API and targeted rebuild API
  - watermark-day reprocessing behavior for late same-day events
- Phase 3 implemented:
  - pre-execution quota evaluation in run path
  - deterministic `allow | allow_with_warning | deny_limit_reached`
  - policy code + snapshot metadata stored for auditable decisions
- Phase 4 implemented at foundation level:
  - weekly/monthly rollup generation from daily aggregates
  - period summary reporting API (daily/weekly/monthly/all)
  - rollup reconciliation API (daily vs weekly/monthly consistency checks)
  - billing-facing fetch APIs (full period and incremental cursor-based)

### Implemented in Core Billing Foundation

- billing fetch contracts moved to `ecosystem-core/src/billing/types`
- billing engine includes provider wiring for period and incremental usage fetch delegation
- collector-first billing foundation is in place (usage handled via `UsageCollector` contract)

### Future Implementation (Remaining)

- CLI/admin parity for newer engine APIs:
  - expose summary and reconciliation outputs in CLI commands
  - add operator-friendly views for incremental billing cursor state
- harden operational behavior:
  - broader tests for aggregation idempotency and reconciliation mismatch scenarios
  - stress/soak tests for large spool growth and replay throughput
- full post-v1 billing expansion (Phase 5 complete scope):
  - event-level pricing rule execution across all rule shapes
  - invoice generation lifecycle
  - credits/overages/adjustments
  - tax and region-aware finance concerns
  - dispute and correction workflows

## Post-v1 Implementation Remaining (Billing Engine Independence Plan)

This section defines explicit post-v1 constraints and roadmap items.

### Non-Negotiable Architecture Constraints

- Billing Engine must remain component-agnostic.
  - no dependency on Orbyt, Vaulta, DevForge, Dev Companion, or any specific product module
- Billing Engine must remain ecosystem-agnostic.
  - no direct dependency on ecosystem runtime assumptions or component internals
- Billing Engine must be productizable as a standalone credit/billing product in future.

### Post-v1 Work: Billing-Engine-Side Restrictions

Restriction and credit protection must move to billing engine side (policy authority), not stay only in Orbyt engine:

- billing engine evaluates credit/quota policy for all `UsageEventType` classes (treated as credit-consuming signals)
- billing engine returns deterministic decision contract:
  - `allow`
  - `allow_with_warning`
  - `deny_limit_reached`
- billing engine becomes the source of truth for overuse prevention
- Orbyt and other components consume this decision, not re-define policy logic independently

### Post-v1 Work: Bridge Provider Integration

Billing Engine will fetch tenant/user/account plan data through bridge providers (under `dev-ecosystem/bridges/`) using abstraction interfaces only.

Required design rules:

- billing core depends on provider contracts, not on bridge-specific implementations
- each bridge integration stays in adapter/provider layer, outside billing core
- provider contracts must support:
  - user/workspace/account lookup
  - plan and credit entitlement snapshot
  - subscription status metadata
  - policy versioning inputs for deterministic decisions

### Dependency Direction (Required)

- `billing-core` -> contracts/interfaces only
- `bridge-adapters` -> implement contracts for concrete bridge sources
- `components (orbyt/devforge/...)` -> call billing-core APIs
- never reverse this dependency direction

### Phase 0: Hardening Existing Foundation (1-2 days)

Status: Implemented

Deliverables:

- confirm `workspaceId` presence across all billable paths
- add/verify `idempotencyKey` generation in event factory
- add collector health telemetry wiring
- add docs for `~/.billing/orbyt/usage` directory semantics

Acceptance criteria:

- usage events are emitted for workflow, step, adapter, trigger paths
- no collector exception propagates to workflow execution

### Phase 1: Real-Time Usage Storage GA in Orbyt (3-5 days)

Status: Implemented (engine-side foundation)

Deliverables:

- keep `FileSpoolUsageCollector` as default collector
- ensure archive + pending/sent/failed handling is stable
- add CLI/admin command to inspect spool health summary
- add retention policy knobs for sent/failed archives

Acceptance criteria:

- events persist locally during endpoint outages
- retries move entries from pending to sent or failed deterministically
- engine shutdown flush is verified by test

### Phase 2: Aggregation Foundation (Daily First) (3-5 days)

Status: Implemented

Deliverables:

- implement small aggregator worker/job (can run in-process or as sidecar)
- compute daily counters from raw events
- persist daily aggregate store and watermark table/file
- expose read API for quota checks

Acceptance criteria:

- rerunning aggregation job does not double count
- watermark resumes correctly after restart
- daily counters match sampled raw logs

### Phase 3: Restriction Enforcement in Execution Path (2-4 days)

Status: Implemented

Deliverables:

- add pre-execution quota check hook
- return deterministic allow/deny decision
- record deny reasons with policy code

Acceptance criteria:

- requests above hard limit are blocked
- soft limit emits warning signals
- decisions are auditable with counter snapshot

### Phase 4: Weekly/Monthly Foundational Rollups (2-3 days)

Status: Implemented (foundation)

Deliverables:

- optional weekly and monthly rollup jobs from daily aggregates
- basic reporting endpoint for period summaries

Acceptance criteria:

- weekly/monthly numbers reconcile with daily totals
- no direct invoice logic required in v1

### Phase 5: Post-v1 Billing Engine Expansion

Status: Future

Future work (not required for v1):

- pricing catalog integration
- money calculation and invoices
- credits, overages, tax, and adjustments
- billing-engine-side restriction authority for credit overuse prevention
- bridge-provider-based user/plan/entitlement fetch via provider interfaces
- strict agnostic packaging to enable standalone billing engine commercialization

## Minimal Technical Backlog

### Orbyt Engine

- validate event completeness in usage factory
- enforce workspace-aware emission for billable events
- expose usage health diagnostics

### Usage Ingestion/Aggregation Component

- add idempotent upsert logic for aggregates
- add watermark persistence and recovery
- add late-event reprocessing path

### Policy/Restriction Layer

- plan entitlement resolver
- limit evaluator
- deny/warn response contract

## Suggested Initial Defaults

- `usageSpool.enabled = true`
- `usageSpool.flushIntervalMs = 60000`
- `usageSpool.batchSize = 200`
- `usageSpool.maxRetryAttempts = 10`
- `usageSpool.sentRetentionDays = 7`
- `usageSpool.failedRetentionDays = 30`
- aggregation cadence: daily every 24h (plus optional manual run)
- lateness window: 72h

## CLI/Admin Diagnostics

Use Orbyt CLI to inspect spool health and queue sizes:

- `orbyt usage-spool`

This reports:

- base spool directory
- pending/sent/failed envelope counts
- archived event day file count
- collector health status and last success timestamp

## Operational KPIs for v1

- usage record success path P95 < 50 ms
- pending spool growth rate remains bounded under normal endpoint health
- zero workflow failures due to usage collector errors
- aggregate mismatch rate under 0.1% in validation samples

## Risks and Mitigations

- Missing workspace identity in events:
  Mitigation: fail-safe mark as non-billable and emit high-priority warning.

- Duplicate delivery during retries:
  Mitigation: strict idempotency key and unique constraint at ingestion.

- Spool disk growth:
  Mitigation: retention and archival policy plus health alerts.

- Premature billing complexity:
  Mitigation: keep v1 on usage counting and restriction only.

## Final Recommendation

For v1, treat billing as a usage-accounting foundation, not a finance system.

Build in this order:

1. real-time durable usage events
2. daily idempotent aggregation
3. subscription-based restriction checks
4. weekly/monthly rollups
5. full billing logic after Orbyt engine and product behavior stabilize
