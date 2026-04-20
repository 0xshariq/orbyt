/**
 * Orbyt Engine - Main Public API
 * 
 * ============================================================================
 * ARCHITECTURE & TRUST BOUNDARIES
 * ============================================================================
 * 
 * This class defines the ONLY public API surface for the Orbyt Engine.
 * It establishes clear trust boundaries between different consumers:
 * 
 * TRUSTED FIRST-PARTY CONSUMERS (Direct Access):
 * -----------------------------------------------
 * - @orbytautomation/cli (Official CLI)
 * - @orbytautomation/api (Official API Server)
 * 
 * These components may import and use:
 *   - OrbytEngine class
 *   - Public types (WorkflowResult, WorkflowRunOptions)
 *   - Event bus for observability
 * 
 * They MUST NOT:
 *   - Import internal execution modules
 *   - Bypass security validation
 *   - Directly manipulate internal state
 * 
 * EXTERNAL ECOSYSTEM COMPONENTS (Adapter/SDK Access):
 * ----------------------------------------------------
 * - MediaProc, DevForge, Voxa, etc.
 * - Third-party plugins
 * - Marketplace extensions
 * 
 * These components must integrate via:
 *   - Custom adapters (Adapter interface)
 *   - Workflow source files (YAML, JSON, diagram files)
 *   - SDK/client libraries
 * 
 * They CANNOT:
 *   - Import engine internals
 *   - Access ExecutionEngine directly
 *   - Manipulate billing/security context
 * 
 * SECURITY GUARANTEES:
 * --------------------
 * 1. Users cannot specify reserved internal fields in workflows
 *    (Validated at parse time - workflow is rejected if found)
 * 
 * 2. Internal context is ALWAYS engine-generated
 *    (executionId, billing, ownership, audit fields)
 * 
 * 3. CLI/API can pass ownership context but cannot forge billing
 *    (Ownership from trusted auth, billing from engine pricing snapshot)
 * 
 * 4. All workflow execution goes through this single entry point
 *    (No backdoor execution paths)
 * 
 * WHY THIS MATTERS:
 * -----------------
 * - Billing integrity: Users cannot manipulate usage tracking
 * - Audit trail: All executions are properly logged
 * - Refactor safety: Internal changes don't break integrations
 * - Security: Clear separation of trusted vs untrusted code
 * 
 * User-facing engine class that provides a clean, intuitive API for running workflows.
 * Wraps the internal ExecutionEngine with a simpler interface.
 * 
 * @module core
 */

import { WorkflowLoader } from '../loader/WorkflowLoader.js';
import { applyConfigDefaults, validateConfig } from './EngineConfig.js';
import { createEngineContext } from './EngineContext.js';
import { LoggerManager, type EngineLogger } from '../logging/index.js';
import { LogCategoryEnum, WorkflowContext } from '../types/log-types.js';
import { BillingEngine, LogLevel as CoreLogLevel, type UsageCollector, type UsageEvent, type Adapter, type BillingPricingCatalog } from '@dev-ecosystem/core';
import { ExecutionEngine } from '../execution/ExecutionEngine.js';
import { StepExecutor } from '../execution/StepExecutor.js';
import { WorkflowExecutor } from '../execution/WorkflowExecutor.js';
import { EventBus } from '../events/EventBus.js';
import { HookManager } from '../hooks/HookManager.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import type { LifecycleHook } from '../hooks/LifecycleHooks.js';
import { createEvent } from '../events/EngineEvents.js';
import { CLIAdapter, ShellAdapter, HTTPAdapter, FSAdapter } from '../adapters/builtins/index.js';
import { InternalContextBuilder } from '../execution/InternalExecutionContext.js';
import { IntentAnalyzer } from '../execution/IntentAnalyzer.js';
import { ExecutionStrategyResolver, ExecutionStrategyGuard } from '../execution/ExecutionStrategyResolver.js';
import { BillingUsageFetchBucket, BillingUsageFetchCursor, BillingUsageFetchOptions, BillingUsageFetchProvider, BillingUsageFetchResult, BillingUsageIncrementalFetchOptions, BillingUsageIncrementalFetchResult, DailyUsageAggregateBucket, DailyUsageAggregationRunResult, DailyUsageAggregateQueryOptions, DailyUsageAggregateRebuildOptions, DailyUsageAggregateRebuildResult, DailyUsageAggregationState, EngineContext, EngineEventType, EngineUsageGroupBucket, EngineUsageQueryOptions, EngineUsageQueryResult, ExecutionExplanation, ExecutionOptions, InternalExecutionContext, LoadedWorkflowItem, LogLevel, MultiWorkflowExecutionMode, OrbytEngineConfig, OwnershipContext, ParsedWorkflow, PeriodUsageRollupBucket, QuotaDecision, QuotaPolicy, QuotaStatusQueryOptions, QuotaStatusResult, QuotaUsageCounters, UsageAggregationPipelineRunResult, UsageBillingCalculationOptions, UsageBillingCalculationResult, UsageBillingEstimateComponent, UsageBillingEstimateOptions, UsageBillingEstimateResult, UsageCollectorHealthStatus, UsagePeriodRollupQueryOptions, UsagePeriodRollupRunResult, UsagePeriodSummaryQueryOptions, UsagePeriodSummaryResult, UsageRollupReconciliationMismatch, UsageRollupReconciliationQueryOptions, UsageRollupReconciliationResult, WorkflowBatchItemResult, WorkflowBatchResult, WorkflowBatchRunOptions, WorkflowQuotaMetadata, WorkflowResult, WorkflowRunOptions } from '../types/core-types.js';
import { ExplanationGenerator, ExplanationLogger } from '../explanation/index.js';
import { ExecutionGraphBuilder, ExecutionTraceFormatter } from '../visualization/index.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { ExecutionStore } from '../storage/ExecutionStore.js';
import { WorkflowStore } from '../storage/WorkflowStore.js';
import { ScheduleStore } from '../storage/ScheduleStore.js';
import { WorkflowParseCache, AdapterMetadataCache } from '../cache/index.js';
import { RuntimeArtifactStore } from '../runtime/index.js';
import { NoOpUsageCollector } from '../usage/NoOpUsageCollector.js';
import { FileSpoolUsageCollector, HttpUsageBatchTransport } from '../usage/FileSpoolUsageCollector.js';
import { DistributedWorkflowOrchestrator, FileDistributedJobQueue, InMemoryDistributedJobQueue } from '../distributed/index.js';
import { CheckpointStore } from '../storage/CheckpointStore.js';
import {
  createAdapterCallEvent,
  createStepExecuteEvent,
  createTriggerFireEvent,
  createWorkflowRunEvent,
} from '../usage/UsageEventFactory.js';

/**
 * OrbytEngine - Main public API
 *
 * This is the main class that users call when they want to work with workflows.
 * It provides the public methods for running, validating, and explaining workflows.
 *
 * Main role in the system:
 * - Accept workflow input from trusted app layers (CLI/API/SDK/tests).
 * - Ensure the workflow is parsed and validated before any execution starts.
 * - Apply engine-side preflight checks (version, adapter capability, runtime rules).
 * - Coordinate execution through internal runtime/executor components.
 *
 * End-to-end input and execution flow:
 * 1. Caller passes workflow source (file path, text, or object).
 * 2. WorkflowLoader resolves the source and returns a validated ParsedWorkflow.
 * 3. OrbytEngine applies preflight safety checks.
 * 4. Engine builds internal runtime context (identity/ownership/billing metadata).
 * 5. Workflow execution is delegated to execution components.
 * 6. Engine records lifecycle telemetry, usage, and persistence artifacts.
 *
 * Trust and safety boundaries:
 * - This class is the single public execution entry point.
 * - Internal fields are not user-controlled (identity, billing, usage internals).
 * - Reserved-field protection is enforced before execution.
 * - Runtime/billing tracking is engine-managed to preserve integrity.
 *
 * Why this design is useful:
 * - One consistent execution path for every caller.
 * - Clear separation of concerns (loader/parser vs orchestration vs runtime).
 * - Better maintainability: internal refactors do not break public API usage.
 * - Easier diagnostics: all major operations pass through one place.
 * 
 * @example
 * ```ts
 * // Basic usage
 * const engine = new OrbytEngine();
 * const workflow = await WorkflowLoader.fromFile('./workflow.yaml');
 * const result = await engine.run(workflow);
 * 
 * // With configuration
 * const engine = new OrbytEngine({
 *   logLevel: 'debug',
 *   maxConcurrentWorkflows: 5,
 *   adapters: [httpAdapter, shellAdapter],
 *   hooks: [loggingHook]
 * });
 * 
 * // With options
 * const workflow = await WorkflowLoader.fromFile('./workflow.json');
 * const result = await engine.run(workflow, {
 *   variables: { inputFile: './data.json' },
 *   timeout: 60000,
 *   dryRun: false
 * });
 * 
 * // From bridge/API with ownership context
 * const workflow = await WorkflowLoader.fromYAML(requestBody);
 * const result = await engine.run(workflow, {
 *   variables: { input: 'data' },
 *   _ownershipContext: {
 *     userId: 'user_123',
 *     workspaceId: 'ws_456',
 *     subscriptionTier: 'pro',
 *     billingMode: 'ecosystem',
 *   }
 * });
 * ```
 */
export class OrbytEngine {
  private static readonly SUPPORTED_WORKFLOW_MAJOR = 1;
  private config: ReturnType<typeof applyConfigDefaults>;
  private executionEngine: ExecutionEngine;
  private stepExecutor: StepExecutor;
  private workflowExecutor: WorkflowExecutor;
  private eventBus: EventBus;
  private hookManager: HookManager;
  private adapterRegistry: AdapterRegistry;
  private context: EngineContext;
  private logger: EngineLogger | null;
  private isStarted: boolean = false;
  private readonly version: string = '0.1.2';
  private executionStore: ExecutionStore;
  private workflowStore: WorkflowStore;
  private scheduleStore: ScheduleStore;
  private workflowParseCache: WorkflowParseCache;
  private adapterMetadataCache: AdapterMetadataCache;
  private runtimeArtifactStore: RuntimeArtifactStore;
  private usageCollector: UsageCollector;
  private billingPricingCatalog?: BillingPricingCatalog;
  private readonly warnedMissingWorkspaceExecutions = new Set<string>();

  constructor(config: OrbytEngineConfig = {}) {
    // Validate and apply defaults
    validateConfig(config);
    this.config = applyConfigDefaults(config);

    // Map string log level to enum
    const mapLogLevel = (level: LogLevel): CoreLogLevel => {
      const mapping: Record<LogLevel, CoreLogLevel> = {
        'debug': CoreLogLevel.DEBUG,
        'info': CoreLogLevel.INFO,
        'warn': CoreLogLevel.WARN,
        'error': CoreLogLevel.ERROR,
        'silent': CoreLogLevel.FATAL,
      };
      return mapping[level] || CoreLogLevel.INFO;
    };

    // Initialize LoggerManager (before anything else for early logging)
    LoggerManager.initialize({
      level: mapLogLevel(this.config.logLevel),
      format: 'text',
      colors: true,
      timestamp: true,
      source: 'OrbytEngine',
      structuredEvents: true,
      category: LogCategoryEnum.SYSTEM,
      fileOutput: {
        enabled: true,
        directory: this.config.logDir,
        fileName: 'engine.log',
      },
    });
    this.logger = LoggerManager.getLogger();

    // Initialize event system
    this.eventBus = new EventBus();
    this.hookManager = new HookManager();
    this.adapterRegistry = new AdapterRegistry();

    // Initialize executors
    this.stepExecutor = new StepExecutor();
    // Share OrbytEngine's AdapterRegistry with StepExecutor so there is a
    // single registry instance — preventing duplicate INFO logs on registration.
    this.stepExecutor.setAdapterRegistry(this.adapterRegistry);
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor);

    // Initialize execution engine
    this.executionEngine = new ExecutionEngine({
      maxConcurrentExecutions: this.config.maxConcurrentWorkflows,
      defaultTimeout: this.config.defaultTimeout,
      enableScheduler: this.config.enableScheduler,
      scheduler: this.config.scheduler,
      queue: this.config.queue,
      retryPolicy: this.config.retryPolicy,
      timeoutManager: this.config.timeoutManager,
    });

    // Wire components together
    this.setupComponents();

    // Initialize usage collector.
    // Priority:
    // 1) user-provided collector
    // 2) built-in durable file spool collector (default and production-safe)
    // 3) no-op collector (testing-only escape hatch)
    if (this.config.usageCollector) {
      this.usageCollector = this.config.usageCollector;
    } else {
      const usageSpool = this.config.usageSpool;
      const spoolEnabled = usageSpool?.enabled ?? true;
      const spoolBaseDir = usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
      const allowNoOpForTesting =
        process.env.NODE_ENV === 'test' ||
        process.env.ORBYT_ALLOW_NOOP_USAGE_COLLECTOR === '1';

      if (spoolEnabled || !allowNoOpForTesting) {
        if (!spoolEnabled && !allowNoOpForTesting) {
          this.log('warn', 'usageSpool.enabled=false ignored outside test mode; using durable spool collector');
        }

        const transport = usageSpool?.billingEndpoint
          ? new HttpUsageBatchTransport({
            endpoint: usageSpool.billingEndpoint,
            apiKey: usageSpool.billingApiKey,
            timeoutMs: usageSpool.requestTimeoutMs,
          })
          : undefined;

        this.usageCollector = new FileSpoolUsageCollector({
          baseDir: spoolBaseDir,
          batchSize: usageSpool?.batchSize,
          flushIntervalMs: usageSpool?.flushIntervalMs,
          maxRetryAttempts: usageSpool?.maxRetryAttempts,
          sentRetentionDays: usageSpool?.sentRetentionDays,
          failedRetentionDays: usageSpool?.failedRetentionDays,
          transport,
        });
      } else {
        this.usageCollector = new NoOpUsageCollector();
      }
    }
    this.billingPricingCatalog = this.config.pricingCatalog;

    // Ensure infrastructure directories exist before any persistence/caching.
    this.bootstrapRuntimeDirectories();
    this.ensureFirstRunConfigFile();

    // Initialise persistent stores (non-fatal — must never block engine startup)
    const storeRoot = this.config.stateDir ?? join(homedir(), '.orbyt');
    this.executionStore = new ExecutionStore(join(storeRoot, 'executions'));
    this.workflowStore = new WorkflowStore(join(storeRoot, 'workflows'));
    this.scheduleStore = new ScheduleStore(join(storeRoot, 'schedules'));
    this.workflowParseCache = new WorkflowParseCache(join(this.config.cacheDir, 'workflows'));
    this.adapterMetadataCache = new AdapterMetadataCache(join(this.config.cacheDir, 'adapters'));
    this.runtimeArtifactStore = new RuntimeArtifactStore(this.config.runtimeDir);
    this.runtimeArtifactStore.ensureDirs();
    this.workflowExecutor.setStateDir(join(storeRoot, 'executions'));
    this.executionEngine.setWorkflowParseCache(this.workflowParseCache);

    // Register built-in adapters
    this.registerBuiltinAdapters();

    // Create engine context
    this.context = createEngineContext({
      config: this.config,
      eventBus: this.eventBus,
      hookManager: this.hookManager,
      adapterRegistry: this.adapterRegistry,
      executionEngine: this.executionEngine,
      stepExecutor: this.stepExecutor,
      workflowExecutor: this.workflowExecutor,
      workingDirectory: this.config.workingDirectory,
      metadata: this.config.metadata,
    });

    // Register user-provided adapters
    if (this.config.adapters) {
      for (const adapter of this.config.adapters) {
        this.registerAdapter(adapter);
      }
    }

    // Register user-provided hooks
    if (this.config.hooks) {
      for (const hook of this.config.hooks) {
        this.registerHook(hook);
      }
    }

    // Log welcome message and initialization
    this.logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info('🚀 Welcome to Orbyt Engine');
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    this.logger.info('Orbyt Engine initialized', {
      version: this.version,
      logLevel: this.config.logLevel,
      maxConcurrentWorkflows: this.config.maxConcurrentWorkflows,
      schedulerEnabled: this.config.enableScheduler,
      adapterCount: this.config.adapters?.length || 0,
      hookCount: this.config.hooks?.length || 0,
    });
    this.logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Wire engine components together
   */
  private setupComponents(): void {
    // Pass event bus and hook manager to executors
    this.stepExecutor.setEventBus(this.eventBus);
    this.stepExecutor.setHookManager(this.hookManager);
    this.workflowExecutor.setEventBus(this.eventBus);
    this.workflowExecutor.setHookManager(this.hookManager);

    // Set automation policies
    if (this.config.retryPolicy) {
      this.stepExecutor.setRetryPolicy(this.config.retryPolicy);
    }
    if (this.config.timeoutManager) {
      this.stepExecutor.setTimeoutManager(this.config.timeoutManager);
    }
  }

  /**
   * Create all required engine directories under ~/.orbyt (or custom overrides).
   * This keeps later store/cache writes simple and predictable.
   * 
   * Usage storage is separated into ~/.billing/orbyt to enable billing engine
   * to remain component-agnostic (doesn't know about Orbyt specifically).
   */
  private bootstrapRuntimeDirectories(): void {
    const orbytHome = join(homedir(), '.orbyt');
    const billingHome = join(homedir(), '.billing', 'orbyt');
    const requiredDirs = [
      orbytHome,
      this.config.stateDir,
      join(this.config.stateDir, 'executions'),
      join(this.config.stateDir, 'checkpoints'),
      join(this.config.stateDir, 'workflows'),
      join(this.config.stateDir, 'schedules'),
      join(this.config.stateDir, 'diagrams'),
      this.config.logDir,
      this.config.cacheDir,
      join(this.config.cacheDir, 'workflows'),
      join(this.config.cacheDir, 'adapters'),
      this.config.runtimeDir,
      join(this.config.runtimeDir, 'dag'),
      join(this.config.runtimeDir, 'context'),
      join(this.config.runtimeDir, 'locks'),
      join(orbytHome, 'plugins'),
      join(orbytHome, 'metrics'),
      join(orbytHome, 'config'),
      join(billingHome, 'usage'),
      join(billingHome, 'usage', 'events'),
      join(billingHome, 'usage', 'pending'),
      join(billingHome, 'usage', 'sent'),
      join(billingHome, 'usage', 'failed'),
      join(billingHome, 'usage', 'aggregates'),
      join(orbytHome, 'tmp'),
      join(orbytHome, 'cloud-sync'),
    ];

    for (const dir of requiredDirs) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // Non-fatal bootstrap: individual stores also guard their own writes.
      }
    }
  }

  /**
   * Ensure a first-run config file exists at ~/.orbyt/config/config.json.
   *
   * This file is created once and then preserved as the local runtime config
   * snapshot for visibility and tooling introspection.
   */
  private ensureFirstRunConfigFile(): void {
    const configDir = join(homedir(), '.orbyt', 'config');
    const configPath = join(configDir, 'config.json');

    if (existsSync(configPath)) {
      return;
    }

    try {
      mkdirSync(configDir, { recursive: true });

      const payload = {
        version: 1,
        createdAt: new Date().toISOString(),
        source: 'orbyt-engine',
        engine: {
          version: this.version,
          mode: this.config.mode,
          logLevel: this.config.logLevel,
          maxConcurrentWorkflows: this.config.maxConcurrentWorkflows,
          maxConcurrentSteps: this.config.maxConcurrentSteps,
          defaultTimeout: this.config.defaultTimeout,
          enableScheduler: this.config.enableScheduler,
          enableMetrics: this.config.enableMetrics,
          enableEvents: this.config.enableEvents,
          sandboxMode: this.config.sandboxMode,
        },
        paths: {
          stateDir: this.config.stateDir,
          logDir: this.config.logDir,
          cacheDir: this.config.cacheDir,
          runtimeDir: this.config.runtimeDir,
          workingDirectory: this.config.workingDirectory,
        },
        usageSpool: this.config.usageSpool,
      };

      writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      this.log('debug', 'Created first-run engine config file', { configPath });
    } catch (error) {
      this.log('warn', 'Failed to create first-run engine config file', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Register built-in adapters
   * These are the core adapters shipped with Orbyt
   */
  private registerBuiltinAdapters(): void {
    // Core adapters
    this.registerAdapter(new CLIAdapter());
    this.registerAdapter(new ShellAdapter());
    this.registerAdapter(new HTTPAdapter());
    this.registerAdapter(new FSAdapter());

    this.log('debug', 'Registered built-in adapters: cli, shell, http, fs');
  }

  /**
   * Start the engine
   * Must be called before running workflows if scheduler is enabled
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    // Emit engine.started event
    await this.eventBus.emit(createEvent(
      EngineEventType.ENGINE_STARTED,
      { timestamp: Date.now(), config: this.config },
      {}
    ));

    await this.executionEngine.start();
    this.isStarted = true;

    // Collector health is diagnostics-only and must never block startup.
    void this.emitUsageCollectorHealthTelemetry('startup');

    this.log('info', 'Orbyt Engine started');
  }

  /**
   * Stop the engine
   * Waits for running workflows to complete
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    await this.executionEngine.stop();
    this.isStarted = false;

    // Emit engine.stopped event
    await this.eventBus.emit(createEvent(
      EngineEventType.ENGINE_STOPPED,
      { timestamp: Date.now() },
      {}
    ));

    this.log('info', 'Orbyt Engine stopped');

    // Best-effort collector draining/cleanup on shutdown.
    try {
      await this.usageCollector.flush?.();
      await this.usageCollector.close?.();
    } catch {
      // Non-fatal on shutdown
    }
  }

  /**
   * Run a workflow
   * 
   * ARCHITECTURE NOTE:
   * ==================
   * This method is I/O-AGNOSTIC - it does NOT read files or touch filesystem.
  * File loading is handled by WorkflowLoader (separate utility layer).
   * 
   * This keeps the engine:
   * - Testable (no file dependencies)
   * - Embeddable (works in browsers, workers, distributed systems)
   * - API-safe (can accept workflows from any source)
   * 
   * Main method for executing workflows.
   * 
   * @param workflow - Parsed workflow object or a source input handled by WorkflowLoader
   * @param options - Execution options
   * @returns Workflow execution result
   * 
   * @example
   * ```ts
   * import { WorkflowLoader } from '@orbytautomation/engine';
   * 
   * // Load from file (use WorkflowLoader)
   * const workflow = await WorkflowLoader.fromFile('./workflow.yaml');
   * const result = await engine.run(workflow);
   * 
   * // Run from YAML string
   * const yaml = `
   * version: "1.0"
   * kind: workflow
   * workflow:
   *   steps:
   *     - id: step1
   *       uses: shell.exec
   *       with:
   *         command: echo "Hello"
   * `;
   * const result = await engine.run(yaml);
   * 
   * // Run from object (testing)
   * const result = await engine.run(mockWorkflowObject);
   * ```
   */
  async run(
    workflow: string | ParsedWorkflow,
    options: WorkflowRunOptions = {}
  ): Promise<WorkflowResult> {
    // Ensure engine is started
    if (!this.isStarted && this.config.enableScheduler) {
      await this.start();
    }
    const parsedWorkflow = await this.resolveWorkflowInput(workflow);
    return this.executeParsedWorkflow(parsedWorkflow, options);
  }

  /**
   * Execute multiple workflows using explicit execution mode.
   *
   * Flow:
   * 1. Preload+validate all workflows first
   * 2. Execute according to mode (sequential | parallel | mixed)
   */
  async runMany(
    workflows: Array<string | ParsedWorkflow>,
    options: WorkflowBatchRunOptions = {},
  ): Promise<WorkflowBatchResult> {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      throw new Error('runMany requires at least one workflow input');
    }

    if (!this.isStarted && this.config.enableScheduler) {
      await this.start();
    }

    const startedAt = Date.now();
    const failFast = options.failFast === true;

    const loaded = await this.preloadWorkflows(workflows);
    const mode: MultiWorkflowExecutionMode = this.resolveBatchExecutionMode(loaded, options.executionMode);
    const maxParallel = Math.max(1, options.maxParallelWorkflows || this.config.maxConcurrentWorkflows || 1);
    const inferredWaveSize = loaded.some((item) => item.workflow.strategy?.maxParallel)
      ? Math.max(...loaded.map((item) => item.workflow.strategy?.maxParallel || 1))
      : 2;
    const waveSize = Math.max(1, options.mixedBatchSize || inferredWaveSize);

    const results: WorkflowBatchItemResult[] = [];

    if (mode === 'sequential') {
      for (const item of loaded) {
        const single = await this.executeLoadedItem(item, options, false);
        results.push(single);
        if (failFast && single.status === 'failed') break;
      }
    } else if (mode === 'parallel') {
      const parallelResults = await this.mapWithConcurrency(loaded, maxParallel, (item) =>
        this.executeLoadedItem(item, options, true)
      );
      results.push(...parallelResults);
    } else {
      for (let i = 0; i < loaded.length; i += waveSize) {
        const wave = loaded.slice(i, i + waveSize);
        const waveResults = await this.mapWithConcurrency(
          wave,
          Math.min(maxParallel, wave.length),
          (item) => this.executeLoadedItem(item, options, true),
        );
        results.push(...waveResults);
        if (failFast && waveResults.some((r) => r.status === 'failed')) break;
      }
    }

    const successfulWorkflows = results.filter((r) => r.status === 'success').length;
    const failedWorkflows = results.length - successfulWorkflows;

    return {
      mode,
      totalWorkflows: results.length,
      successfulWorkflows,
      failedWorkflows,
      durationMs: Date.now() - startedAt,
      results,
    };
  }

  /**
   * Preload and validate all workflow inputs before execution starts.
   */
  private async preloadWorkflows(
    workflows: Array<string | ParsedWorkflow>,
  ): Promise<LoadedWorkflowItem[]> {
    const loaded: LoadedWorkflowItem[] = [];
    const loadErrors: string[] = [];

    for (let i = 0; i < workflows.length; i++) {
      const source = workflows[i];
      const sourceLabel = typeof source === 'string' ? source : `workflow#${i + 1}`;
      try {
        const parsed = await this.resolveWorkflowInput(source);
        loaded.push({
          source: sourceLabel,
          workflow: parsed,
          declaredMode: this.extractDeclaredExecutionMode(parsed),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        loadErrors.push(`[${sourceLabel}] ${message}`);
      }
    }

    if (loadErrors.length > 0) {
      throw new Error(`WORKFLOW_PRELOAD_FAILED:\n${loadErrors.join('\n')}`);
    }

    return loaded;
  }

  /**
   * Resolve batch execution mode with precedence:
   * 1) Explicit API/CLI option
   * 2) Declared workflow strategy modes from YAML
   * 3) Default sequential
   */
  private resolveBatchExecutionMode(
    loaded: LoadedWorkflowItem[],
    explicitMode?: MultiWorkflowExecutionMode,
  ): MultiWorkflowExecutionMode {
    if (explicitMode) return explicitMode;

    const declared = loaded
      .map((item) => item.declaredMode)
      .filter((mode): mode is MultiWorkflowExecutionMode => mode !== undefined);

    if (declared.length === 0) return 'sequential';

    const unique = Array.from(new Set(declared));
    if (unique.length === 1) return unique[0];

    // Different workflow-level declarations across batch: use mixed orchestration.
    return 'mixed';
  }

  /**
   * Extract multi-workflow orchestration intent from parsed workflow schema.
   * Accepts strategy.type values in {'sequential','parallel','mixed'}.
   */
  private extractDeclaredExecutionMode(
    workflow: ParsedWorkflow,
  ): MultiWorkflowExecutionMode | undefined {
    const raw = workflow.strategy?.type;
    if (!raw) return undefined;

    const normalized = String(raw).trim().toLowerCase();
    if (normalized === 'sequential' || normalized === 'parallel' || normalized === 'mixed') {
      return normalized;
    }

    return undefined;
  }

  /**
   * Resolve any accepted workflow input to a parsed workflow and run preflight checks.
   */
  private async resolveWorkflowInput(workflow: string | ParsedWorkflow): Promise<ParsedWorkflow> {
    const parsedWorkflow = typeof workflow === 'string'
      ? await WorkflowLoader.toWorkflowObject(workflow, { cache: this.workflowParseCache })
      : workflow;

    this.assertWorkflowVersionSupported(parsedWorkflow);
    this.assertAdapterCapabilities(parsedWorkflow);
    return parsedWorkflow;
  }

  /**
   * Execute a loaded workflow item and capture per-item result envelope.
   */
  private async executeLoadedItem(
    item: LoadedWorkflowItem,
    options: WorkflowBatchRunOptions,
    isolatedRuntime: boolean,
  ): Promise<WorkflowBatchItemResult> {
    const startedAt = Date.now();
    try {
      const result = await this.executeParsedWorkflow(
        item.workflow,
        this.asWorkflowRunOptions(options),
        isolatedRuntime,
      );
      return {
        source: item.source,
        workflowName: result.workflowName,
        status: 'success',
        result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        source: item.source,
        workflowName: item.workflow.name || item.workflow.metadata?.name,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Strip batch-only options to build a single-workflow run options object.
   */
  private asWorkflowRunOptions(options: WorkflowBatchRunOptions): WorkflowRunOptions {
    return {
      variables: options.variables,
      env: options.env,
      secrets: options.secrets,
      context: options.context,
      timeout: options.timeout,
      continueOnError: options.continueOnError,
      dryRun: options.dryRun,
      triggeredBy: options.triggeredBy,
      resumeFromRunId: options.resumeFromRunId,
      resumePolicy: options.resumePolicy,
      _ownershipContext: options._ownershipContext,
      _permissionPolicy: options._permissionPolicy,
    };
  }

  /**
   * Core single-workflow execution logic used by run() and runMany().
   */
  private async executeParsedWorkflow(
    parsedWorkflow: ParsedWorkflow,
    options: WorkflowRunOptions,
    isolatedRuntime = false,
  ): Promise<WorkflowResult> {
    // Inject internal fields after validation
    const sanitizedOptions = options;
    const internalContext = InternalContextBuilder.build(
      this.version,
      sanitizedOptions._ownershipContext
    );
    this.log('debug', 'Internal execution context created', {
      executionId: internalContext._identity.executionId,
      runId: internalContext._identity.runId,
      userId: internalContext._ownership.userId,
      subscriptionTier: internalContext._ownership.subscriptionTier,
      isBillable: internalContext._billing.isBillable,
    });

    const result = await LoggerManager.runWithWorkflowContext({
      name: parsedWorkflow.name ?? parsedWorkflow.metadata?.name,
      executionId: internalContext._identity.executionId,
      runId: internalContext._identity.runId,
      version: parsedWorkflow.version,
      kind: parsedWorkflow.kind,
      description: parsedWorkflow.description ?? parsedWorkflow.metadata?.description,
      stepCount: parsedWorkflow.steps?.length,
      tags: parsedWorkflow.tags ?? parsedWorkflow.metadata?.tags,
    }, async () => {
      this.persistWorkflowDiagramArtifacts(parsedWorkflow, internalContext, 'planned');

      // Handle dry-run mode
      if (options.dryRun || this.config.mode === 'dry-run') {
        const dryRunResult = await this.dryRun(parsedWorkflow, options);
        this.persistWorkflowDiagramArtifacts(parsedWorkflow, internalContext, 'completed', dryRunResult);
        return dryRunResult;
      }

      // Phase 3: enforce pre-execution usage quota policy before running workflow.
      const quotaDecision = await this.evaluatePreExecutionQuota(parsedWorkflow, internalContext);
      if (quotaDecision.decision === 'deny_limit_reached') {
        this.log('warn', 'Execution blocked by usage quota policy', quotaDecision.snapshot);
        const deniedResult = this.createQuotaDeniedResult(parsedWorkflow, internalContext, quotaDecision);
        this.persistWorkflowDiagramArtifacts(parsedWorkflow, internalContext, 'completed', deniedResult);
        return deniedResult;
      }
      if (quotaDecision.decision === 'allow_with_warning') {
        this.log('warn', 'Execution near usage quota threshold', quotaDecision.snapshot);
      }

      // ============================================================================
      // INTELLIGENCE LAYERS (Foundation - doesn't change execution yet)
      // ============================================================================

      // 1. Intent Layer: Understand what the workflow is trying to do
      const classifiedIntent = IntentAnalyzer.classify(parsedWorkflow);
      this.log('debug', `Workflow intent: ${classifiedIntent.intent}`, {
        confidence: classifiedIntent.confidence,
        patterns: classifiedIntent.patterns,
        reasoning: classifiedIntent.reasoning,
      });

      // Log intent-based recommendations (for future optimization)
      const recommendations = IntentAnalyzer.getRecommendations(classifiedIntent.intent);
      if (recommendations.optimizations?.length) {
        this.log('debug', 'Intent-based optimizations available', {
          intent: classifiedIntent.intent,
          tips: recommendations.optimizations,
        });
      }

      // 2. Execution Strategy Layer: Decide HOW to run safely
      const strategyContext = {
        workflow: parsedWorkflow,
        intent: classifiedIntent.intent,
        resourceLimits: {
          maxConcurrentSteps: this.config.maxConcurrentSteps || 10,
          maxMemory: 0,
          timeout: sanitizedOptions.timeout || this.config.defaultTimeout || 300000,
        },
      };

      const executionStrategy = ExecutionStrategyResolver.resolve(strategyContext);
      this.log('debug', `Execution strategy: ${executionStrategy.strategy}`, {
        reason: executionStrategy.reason,
        adjustments: executionStrategy.adjustments,
      });

      const strategyName = executionStrategy.strategy as string;
      const mappedStrategy: WorkflowContext['executionStrategy'] =
        strategyName === 'parallel' ? 'parallel'
          : strategyName === 'mixed' ? 'mixed'
            : 'sequential';
      LoggerManager.patchWorkflowContext({ executionStrategy: mappedStrategy });

      // 3. Safety Guard: Check if safe to execute
      const safetyCheck = ExecutionStrategyGuard.isSafeToExecute(strategyContext);
      if (!safetyCheck.safe) {
        this.log('warn', `Execution safety check failed: ${safetyCheck.reason}`);
      }

      // ============================================================================
      // END INTELLIGENCE LAYERS
      // ============================================================================

      const execOptions: ExecutionOptions = {
        timeout: sanitizedOptions.timeout || this.config.defaultTimeout,
        env: sanitizedOptions.env,
        inputs: sanitizedOptions.variables,
        secrets: sanitizedOptions.secrets,
        context: {
          ...sanitizedOptions.context,
          _internal: internalContext,
        },
        continueOnError: sanitizedOptions.continueOnError,
        triggeredBy: sanitizedOptions.triggeredBy || 'manual',
        resumeFromRunId: sanitizedOptions.resumeFromRunId,
        resumePolicy: sanitizedOptions.resumePolicy,
      };

      if (execOptions.triggeredBy && execOptions.triggeredBy !== 'manual') {
        internalContext._usage.triggerFireCount += 1;
        this.recordUsageEvent(
          createTriggerFireEvent({
            executionId: internalContext._identity.executionId,
            workflowId: parsedWorkflow.name || parsedWorkflow.metadata?.name,
            userId: internalContext._ownership.userId,
            workspaceId: internalContext._ownership.workspaceId,
            pricingTier: internalContext._billing.pricingTierResolved,
            billable: internalContext._billing.isBillable,
            metadata: {
              success: true,
              triggeredBy: execOptions.triggeredBy,
            },
          }),
        );
      }

      internalContext._usage.automationCount += 1;
      this.recordUsageEvent(
        createWorkflowRunEvent({
          executionId: internalContext._identity.executionId,
          workflowId: parsedWorkflow.name || parsedWorkflow.metadata?.name,
          userId: internalContext._ownership.userId,
          workspaceId: internalContext._ownership.workspaceId,
          executionMode: isolatedRuntime ? 'parallel' : 'single',
          pricingTier: internalContext._billing.pricingTierResolved,
          billable: internalContext._billing.isBillable,
        }),
      );

      this.log('info', `Running workflow: ${parsedWorkflow.name || 'unnamed'}`);
      this.workflowStore.save(parsedWorkflow);

      // Parallel/mixed mode can execute multiple workflows concurrently via runMany().
      // In that case, use per-execution runtime instances to prevent shared mutable
      // state collisions (executionId/context/step runtime).
      const runtime = isolatedRuntime
        ? this.createIsolatedExecutionRuntime()
        : {
          stepExecutor: this.stepExecutor,
          workflowExecutor: this.workflowExecutor,
        };

      const useDistributedRuntime = this.config.mode === 'distributed';

      const result = await this.measureWorkflowExecution(
        parsedWorkflow.name || 'unnamed',
        () => useDistributedRuntime
          ? this.executeDistributedWorkflow(parsedWorkflow, execOptions, runtime.stepExecutor)
          : runtime.workflowExecutor.execute(parsedWorkflow, execOptions)
      );
      result.metadata.quota = this.createWorkflowQuotaMetadata(quotaDecision);

      internalContext._usage.durationSeconds = result.duration / 1000;

      this.log('info', `Workflow completed: ${result.status}`, {
        durationMs: result.duration,
        steps: result.metadata.totalSteps,
        billable: internalContext._billing.isBillable,
        automationCount: internalContext._usage.automationCount,
        stepCount: internalContext._usage.stepCount,
      });

      const workflowId = parsedWorkflow.name || parsedWorkflow.metadata?.name;
      for (const [stepId, stepResult] of result.stepResults.entries()) {
        const stepDefinition = parsedWorkflow.steps.find((step) => step.id === stepId);
        if (!stepDefinition) continue;

        const success = stepResult.status === 'success';
        const errorMessage = stepResult.error?.message;
        const executed = stepResult.status !== 'skipped';

        if (executed) {
          internalContext._usage.stepCount += 1;
          internalContext._usage.weightedStepCount += 1;
        }

        if (executed) {
          this.recordUsageEvent(
            createStepExecuteEvent({
              executionId: internalContext._identity.executionId,
              stepId,
              workflowId,
              userId: internalContext._ownership.userId,
              workspaceId: internalContext._ownership.workspaceId,
              adapterType: stepDefinition.adapter,
              adapterName: stepDefinition.action,
              durationMs: stepResult.duration,
              success,
              retries: Math.max(0, stepResult.attempts - 1),
              error: errorMessage,
              pricingTier: internalContext._billing.pricingTierResolved,
              billable: internalContext._billing.isBillable,
            }),
          );
        }

        if (executed) {
          internalContext._usage.adapterCallCount += 1;
          this.recordUsageEvent(
            createAdapterCallEvent({
              executionId: internalContext._identity.executionId,
              stepId,
              adapterType: stepDefinition.adapter,
              adapterName: stepDefinition.action,
              workflowId,
              userId: internalContext._ownership.userId,
              workspaceId: internalContext._ownership.workspaceId,
              durationMs: stepResult.duration,
              success,
              retries: Math.max(0, stepResult.attempts - 1),
              error: errorMessage,
              pricingTier: internalContext._billing.pricingTierResolved,
              billable: internalContext._billing.isBillable,
            }),
          );
        }
      }

      await this.onWorkflowBillingComplete(internalContext, result);
      this.persistWorkflowDiagramArtifacts(parsedWorkflow, internalContext, 'completed', result);
      return result;
    });

    // Clear any non-scoped workflow context left by prior preload parsing.
    LoggerManager.clearWorkflowContext();
    return result;
  }

  private persistWorkflowDiagramArtifacts(
    workflow: ParsedWorkflow,
    internalContext: InternalExecutionContext,
    stage: 'planned' | 'completed',
    result?: WorkflowResult,
  ): void {
    if (!this.shouldPersistWorkflowDiagram(workflow)) {
      return;
    }

    try {
      const diagramsDir = join(this.config.stateDir, 'diagrams');
      mkdirSync(diagramsDir, { recursive: true });

      const sourceOrigin = workflow.sourceMetadata?.sourceOrigin || 'unknown.orbt';
      const sourceHash = createHash('sha256').update(sourceOrigin).digest('hex').slice(0, 12);
      const workflowName = workflow.metadata?.name || workflow.name || 'unnamed-workflow';
      const workflowSlug = workflowName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const executionId =
        result?.executionId || internalContext?._identity?.executionId || `exec-${Date.now()}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = `${workflowSlug}-${sourceHash}-${executionId}-${stage}-${timestamp}`;

      const graphModel = ExecutionGraphBuilder.fromWorkflow(workflow, result);
      const traceDoc = ExecutionTraceFormatter.toDocument(workflow, result);
      const mermaid = traceDoc.mermaid;

      const graphPath = join(diagramsDir, `${baseName}.graph.json`);
      const tracePath = join(diagramsDir, `${baseName}.trace.json`);
      const mermaidPath = join(diagramsDir, `${baseName}.mermaid.mmd`);

      writeFileSync(graphPath, JSON.stringify(graphModel, null, 2), 'utf-8');
      writeFileSync(tracePath, JSON.stringify(traceDoc, null, 2), 'utf-8');
      writeFileSync(mermaidPath, mermaid, 'utf-8');

      this.updateWorkflowDiagramIndex({
        sourceOrigin,
        sourceType: workflow.sourceMetadata?.sourceType || 'file',
        workflowName,
        workflowVersion: workflow.metadata?.version || workflow.version,
        stage,
        executionId,
        graphPath,
        tracePath,
        mermaidPath,
      });
    } catch (error) {
      this.log('warn', 'Failed to persist workflow execution diagram artifacts', {
        workflowName: workflow.metadata?.name || workflow.name,
        sourceOrigin: workflow.sourceMetadata?.sourceOrigin,
        stage,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private shouldPersistWorkflowDiagram(workflow: ParsedWorkflow): boolean {
    const sourceOrigin = workflow.sourceMetadata?.sourceOrigin;
    if (!sourceOrigin) {
      return false;
    }

    return sourceOrigin.toLowerCase().endsWith('.orbt');
  }

  private updateWorkflowDiagramIndex(entry: {
    sourceOrigin: string;
    sourceType: string;
    workflowName: string;
    workflowVersion?: string;
    stage: 'planned' | 'completed';
    executionId: string;
    graphPath: string;
    tracePath: string;
    mermaidPath: string;
  }): void {
    const diagramsDir = join(this.config.stateDir, 'diagrams');
    const indexPath = join(diagramsDir, 'index.json');

    let indexDoc: {
      schemaVersion: number;
      updatedAt: string;
      entries: Record<string, {
        sourceOrigin: string;
        sourceType: string;
        workflowName: string;
        workflowVersion?: string;
        latest: {
          stage: 'planned' | 'completed';
          executionId: string;
          graphPath: string;
          tracePath: string;
          mermaidPath: string;
          createdAt: string;
        };
        history: Array<{
          stage: 'planned' | 'completed';
          executionId: string;
          graphPath: string;
          tracePath: string;
          mermaidPath: string;
          createdAt: string;
        }>;
      }>;
    } = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      entries: {},
    };

    if (existsSync(indexPath)) {
      try {
        const parsed = JSON.parse(readFileSync(indexPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          indexDoc = {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            entries: typeof parsed.entries === 'object' && parsed.entries ? parsed.entries : {},
          };
        }
      } catch {
        // Replace corrupted index with a fresh one.
      }
    }

    const record = {
      stage: entry.stage,
      executionId: entry.executionId,
      graphPath: entry.graphPath,
      tracePath: entry.tracePath,
      mermaidPath: entry.mermaidPath,
      createdAt: new Date().toISOString(),
    };

    const existing = indexDoc.entries[entry.sourceOrigin];
    if (existing) {
      existing.sourceType = entry.sourceType;
      existing.workflowName = entry.workflowName;
      existing.workflowVersion = entry.workflowVersion;
      existing.latest = record;
      existing.history.push(record);
    } else {
      indexDoc.entries[entry.sourceOrigin] = {
        sourceOrigin: entry.sourceOrigin,
        sourceType: entry.sourceType,
        workflowName: entry.workflowName,
        workflowVersion: entry.workflowVersion,
        latest: record,
        history: [record],
      };
    }

    indexDoc.updatedAt = new Date().toISOString();
    writeFileSync(indexPath, JSON.stringify(indexDoc, null, 2), 'utf-8');
  }

  private async evaluatePreExecutionQuota(
    workflow: ParsedWorkflow,
    internalContext: InternalExecutionContext,
  ): Promise<QuotaDecision> {
    const workspaceId = internalContext?._ownership?.workspaceId || 'unknown';
    const product = internalContext?._billing?.effectiveProduct || 'orbyt';
    const isBillable = internalContext?._billing?.isBillable === true;

    const policy = this.resolveQuotaPolicy(internalContext?._ownership?.subscriptionTier);
    const dayStartMs = this.getUtcDayStartMs(Date.now());
    const periodStart = new Date(dayStartMs).toISOString().slice(0, 10);

    const defaultSnapshot = {
      workspaceId,
      periodStart,
      policy: policy ?? {
        workflowRuns: Number.MAX_SAFE_INTEGER,
        stepExecutions: Number.MAX_SAFE_INTEGER,
        adapterCalls: Number.MAX_SAFE_INTEGER,
        computeMs: Number.MAX_SAFE_INTEGER,
        warningRatio: 1,
      },
      consumed: {
        workflowRuns: 0,
        stepExecutions: 0,
        adapterCalls: 0,
        computeMs: 0,
      },
      projected: {
        workflowRuns: 0,
        stepExecutions: 0,
        adapterCalls: 0,
        computeMs: 0,
      },
    };

    if (!isBillable || !policy) {
      return {
        decision: 'allow',
        policyCode: !isBillable ? 'QUOTA_NOT_BILLABLE' : 'QUOTA_POLICY_NOT_ENFORCED',
        reason: !isBillable ? 'non-billable execution' : 'quota policy not enforced for subscription tier',
        snapshot: defaultSnapshot,
      };
    }

    const usage = await this.getUsage({
      from: dayStartMs,
      to: Date.now(),
      workspaceId,
      product,
      groupBy: 'none',
    });

    const consumed = {
      workflowRuns: usage.byType['usage.workflow.run'] ?? 0,
      stepExecutions: usage.byType['usage.step.execute'] ?? 0,
      adapterCalls: usage.byType['usage.adapter.call'] ?? 0,
      computeMs: usage.totalDurationMs ?? 0,
    };

    const projected = {
      workflowRuns: consumed.workflowRuns + 1,
      stepExecutions: consumed.stepExecutions + workflow.steps.length,
      adapterCalls: consumed.adapterCalls + workflow.steps.length,
      computeMs: consumed.computeMs,
    };

    const snapshot = {
      workspaceId,
      periodStart,
      policy,
      consumed,
      projected,
    };

    return this.evaluateQuotaDecision(policy, snapshot);
  }

  /**
   * Engine-only quota inspection API for pre-flight checks and diagnostics.
   */
  async getQuotaStatus(options: QuotaStatusQueryOptions = {}): Promise<QuotaStatusResult> {
    const workspaceId = options.workspaceId || 'local';
    const product = options.product || 'orbyt';
    const policy = this.resolveQuotaPolicy(options.subscriptionTier || 'free');
    const dayStartMs = this.getUtcDayStartMs(Date.now());
    const periodStart = new Date(dayStartMs).toISOString().slice(0, 10);

    const fallbackPolicy: QuotaPolicy = {
      workflowRuns: Number.MAX_SAFE_INTEGER,
      stepExecutions: Number.MAX_SAFE_INTEGER,
      adapterCalls: Number.MAX_SAFE_INTEGER,
      computeMs: Number.MAX_SAFE_INTEGER,
      warningRatio: 1,
    };

    const usage = await this.getUsage({
      from: dayStartMs,
      to: Date.now(),
      workspaceId,
      product,
      groupBy: 'none',
    });

    const consumed: QuotaUsageCounters = {
      workflowRuns: usage.byType['usage.workflow.run'] ?? 0,
      stepExecutions: usage.byType['usage.step.execute'] ?? 0,
      adapterCalls: usage.byType['usage.adapter.call'] ?? 0,
      computeMs: usage.totalDurationMs ?? 0,
    };

    const increment = options.projectedIncrement ?? {};
    const projected: QuotaUsageCounters = {
      workflowRuns: consumed.workflowRuns + (increment.workflowRuns ?? 0),
      stepExecutions: consumed.stepExecutions + (increment.stepExecutions ?? 0),
      adapterCalls: consumed.adapterCalls + (increment.adapterCalls ?? 0),
      computeMs: consumed.computeMs + (increment.computeMs ?? 0),
    };

    const snapshot = {
      workspaceId,
      periodStart,
      policy: policy ?? fallbackPolicy,
      consumed,
      projected,
    };

    if (!policy) {
      return {
        enforced: false,
        decision: {
          decision: 'allow',
          policyCode: 'QUOTA_POLICY_NOT_ENFORCED',
          reason: 'quota policy not enforced for subscription tier',
          snapshot,
        },
      };
    }

    return {
      enforced: true,
      decision: this.evaluateQuotaDecision(policy, snapshot),
    };
  }

  private resolveQuotaPolicy(subscriptionTier?: string): QuotaPolicy | undefined {
    const tier = (subscriptionTier || 'free').toLowerCase();

    if (tier === 'enterprise' || tier === 'business') {
      return this.config.quotaPolicies.enterprise;
    }

    if (tier === 'pro' || tier === 'professional') {
      return this.config.quotaPolicies.pro;
    }

    return this.config.quotaPolicies.free;
  }

  private createQuotaDeniedResult(
    workflow: ParsedWorkflow,
    internalContext: InternalExecutionContext,
    decision: QuotaDecision,
  ): WorkflowResult {
    const now = new Date();

    return {
      workflowName: workflow.name || workflow.metadata?.name || 'unnamed',
      executionId: internalContext?._identity?.executionId || `quota-denied-${Date.now()}`,
      status: 'failure',
      stepResults: new Map(),
      duration: 0,
      startedAt: now,
      completedAt: now,
      error: new Error(`${decision.reason} (deny_limit_reached)`),
      metadata: {
        totalSteps: workflow.steps.length,
        successfulSteps: 0,
        failedSteps: 0,
        skippedSteps: workflow.steps.length,
        phases: 0,
        quota: this.createWorkflowQuotaMetadata(decision),
      },
    };
  }

  private createWorkflowQuotaMetadata(decision: QuotaDecision): WorkflowQuotaMetadata {
    return {
      decision: decision.decision,
      policyCode: decision.policyCode,
      reason: decision.reason,
      snapshot: decision.snapshot,
    };
  }

  private evaluateQuotaDecision(policy: QuotaPolicy, snapshot: QuotaDecision['snapshot']): QuotaDecision {
    const projected = snapshot.projected;

    if (projected.workflowRuns > policy.workflowRuns) {
      return {
        decision: 'deny_limit_reached',
        policyCode: 'QUOTA_DAILY_WORKFLOW_RUNS_LIMIT_REACHED',
        reason: 'daily workflow run quota reached',
        snapshot,
      };
    }
    if (projected.stepExecutions > policy.stepExecutions) {
      return {
        decision: 'deny_limit_reached',
        policyCode: 'QUOTA_DAILY_STEP_EXECUTIONS_LIMIT_REACHED',
        reason: 'daily step execution quota reached',
        snapshot,
      };
    }
    if (projected.adapterCalls > policy.adapterCalls) {
      return {
        decision: 'deny_limit_reached',
        policyCode: 'QUOTA_DAILY_ADAPTER_CALLS_LIMIT_REACHED',
        reason: 'daily adapter call quota reached',
        snapshot,
      };
    }
    if (projected.computeMs > policy.computeMs) {
      return {
        decision: 'deny_limit_reached',
        policyCode: 'QUOTA_DAILY_COMPUTE_LIMIT_REACHED',
        reason: 'daily compute quota reached',
        snapshot,
      };
    }

    const warningThresholds = {
      workflowRuns: Math.floor(policy.workflowRuns * policy.warningRatio),
      stepExecutions: Math.floor(policy.stepExecutions * policy.warningRatio),
      adapterCalls: Math.floor(policy.adapterCalls * policy.warningRatio),
      computeMs: Math.floor(policy.computeMs * policy.warningRatio),
    };

    const nearQuota = projected.workflowRuns >= warningThresholds.workflowRuns
      || projected.stepExecutions >= warningThresholds.stepExecutions
      || projected.adapterCalls >= warningThresholds.adapterCalls
      || projected.computeMs >= warningThresholds.computeMs;

    if (nearQuota) {
      return {
        decision: 'allow_with_warning',
        policyCode: 'QUOTA_DAILY_NEAR_THRESHOLD',
        reason: 'daily usage near quota threshold',
        snapshot,
      };
    }

    return {
      decision: 'allow',
      policyCode: 'QUOTA_DAILY_WITHIN_LIMIT',
      reason: 'within daily quota',
      snapshot,
    };
  }

  private async executeDistributedWorkflow(
    workflow: ParsedWorkflow,
    execOptions: ExecutionOptions,
    stepExecutor: StepExecutor,
  ): Promise<WorkflowResult> {
    const distributed = this.config.distributed;
    const queueBackend = distributed?.queueBackend ?? 'memory';
    const queueStateDir = distributed?.fileQueueStateDir ?? join(homedir(), '.orbyt', 'distributed-queue');

    const workerCount = distributed?.workerCount
      ?? this.config.scheduler?.job?.workerCount
      ?? Math.max(1, Math.min(8, this.config.maxConcurrentSteps || 4));

    const queue = distributed?.jobQueue
      ?? (queueBackend === 'file'
        ? new FileDistributedJobQueue({
          stateDir: queueStateDir,
          leaseMs: distributed?.leaseMs,
        })
        : new InMemoryDistributedJobQueue({
          leaseMs: distributed?.leaseMs,
        }));

    const orchestrator = new DistributedWorkflowOrchestrator({
      queue,
      stepExecutor,
      workerCount,
      pollIntervalMs: distributed?.pollIntervalMs,
      eventBus: this.eventBus,
      hookManager: this.hookManager,
      executionStore: this.executionStore,
      checkpointStore: new CheckpointStore(join(this.config.stateDir, 'checkpoints')),
      leaseExtensionMs: distributed?.leaseExtensionMs,
    });

    this.log('info', '[Distributed] Executing workflow via scheduler->queue->workers runtime', {
      workerCount,
      queueBackend: distributed?.jobQueue
        ? 'custom'
        : queueBackend,
      workflowId: workflow.name || workflow.metadata?.name,
    });

    return orchestrator.execute(workflow, execOptions);
  }

  /**
   * Create isolated per-workflow execution runtime.
   *
   * This is used by runMany parallel/mixed modes so each workflow run has its
   * own mutable executor state while preserving shared adapter capabilities.
   */
  private createIsolatedExecutionRuntime(): {
    stepExecutor: StepExecutor;
    workflowExecutor: WorkflowExecutor;
  } {
    const stepExecutor = new StepExecutor();
    const localRegistry = new AdapterRegistry();

    for (const adapter of this.adapterRegistry.getAll()) {
      localRegistry.register(adapter);
    }

    stepExecutor.setAdapterRegistry(localRegistry);
    stepExecutor.setEventBus(this.eventBus);
    stepExecutor.setHookManager(this.hookManager);

    if (this.config.retryPolicy) {
      stepExecutor.setRetryPolicy(this.config.retryPolicy);
    }
    if (this.config.timeoutManager) {
      stepExecutor.setTimeoutManager(this.config.timeoutManager);
    }

    const workflowExecutor = new WorkflowExecutor(stepExecutor);
    workflowExecutor.setEventBus(this.eventBus);
    workflowExecutor.setHookManager(this.hookManager);
    workflowExecutor.setStateDir(join(this.config.stateDir, 'executions'));

    return { stepExecutor, workflowExecutor };
  }

  /**
   * Concurrency-limited mapper preserving input order.
   */
  private async mapWithConcurrency<TIn, TOut>(
    items: TIn[],
    concurrency: number,
    mapper: (item: TIn, index: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    const results = new Array<TOut>(items.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= items.length) return;
        results[current] = await mapper(items[current], current);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  /**
   * Billing lifecycle hook - called after workflow completes
   * INTERNAL: Used to track usage and send billing data to analytics bridge
   */
  private async onWorkflowBillingComplete(
    internalContext: any,
    result: WorkflowResult
  ): Promise<void> {
    // Future: Send billing data to analytics bridge
    // This would integrate with the billing bridge to:
    // 1. Record automation execution count
    // 2. Record step execution counts
    // 3. Calculate costs based on pricing snapshot
    // 4. Send to billing system

    this.log('debug', 'Billing tracking', {
      executionId: internalContext._identity.executionId,
      automationCount: internalContext._usage.automationCount,
      stepCount: internalContext._usage.stepCount,
      weightedStepCount: internalContext._usage.weightedStepCount,
      duration: internalContext._usage.durationSeconds,
      isBillable: internalContext._billing.isBillable,
      pricingTier: internalContext._billing.pricingTierResolved,
      workflowStatus: result.status,
      workflowSuccess: result.status === 'success',
      failedSteps: result.metadata.failedSteps || 0,
    });

    // Future implementation:
    // if (this.config.billingBridge) {
    //   await this.config.billingBridge.recordUsage({
    //     executionId: internalContext._identity.executionId,
    //     userId: internalContext._ownership.userId,
    //     workspaceId: internalContext._ownership.workspaceId,
    //     product: internalContext._billing.effectiveProduct,
    //     usage: internalContext._usage,
    //     billing: internalContext._billingSnapshot,
    //     status: result.status,
    //   });
    // }
  }

  /**
   * Safe usage event recording
   * 
   * Records a usage event through the configured collector.
   * Failures are logged but never propagate (non-fatal).
   * Called asynchronously and does not block execution.
   * 
   * @param event - Usage event to record
   */
  private recordUsageEvent(event: UsageEvent): void {
    const normalizedEvent = this.normalizeUsageEventForBilling(event);

    // Fire-and-forget: record usage asynchronously without blocking
    process.nextTick(async () => {
      try {
        await this.usageCollector.record(normalizedEvent);
      } catch (error) {
        // Log but don't propagate - usage tracking must never fail execution
        this.log('debug', 'Usage collection failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
          eventType: normalizedEvent.type,
          executionId: normalizedEvent.executionId,
        });
      }
    });
  }

  /**
   * Guard billing integrity by requiring workspace identity for billable usage.
   * If workspace is missing, event is kept for observability but marked non-billable.
   */
  private normalizeUsageEventForBilling(event: UsageEvent): UsageEvent {
    if (event.billable !== true || event.workspaceId) {
      return event;
    }

    const executionKey = event.executionId || event.id;
    if (!this.warnedMissingWorkspaceExecutions.has(executionKey)) {
      this.warnedMissingWorkspaceExecutions.add(executionKey);
      this.log('warn', 'Billable usage event missing workspaceId; forcing non-billable', {
        eventType: event.type,
        executionId: event.executionId,
      });
    }

    return {
      ...event,
      billable: false,
      metadata: {
        ...event.metadata,
        billingGuard: 'workspace-id-missing',
        originalBillable: true,
      },
    };
  }

  /**
   * Expose usage collector health for diagnostics and CLI admin checks.
   */
  async getUsageCollectorHealth(): Promise<UsageCollectorHealthStatus> {
    try {
      const status = await this.usageCollector.healthCheck?.();
      return status ?? {
        healthy: true,
        detail: 'healthCheck not implemented by collector',
      };
    } catch (error) {
      return {
        healthy: false,
        detail: `usage collector health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Best-effort collector health telemetry.
   */
  private async emitUsageCollectorHealthTelemetry(source: 'startup' | 'manual'): Promise<void> {
    const status = await this.getUsageCollectorHealth();

    if (status.healthy) {
      this.log('debug', 'Usage collector health', {
        source,
        detail: status.detail,
        lastSuccessAt: status.lastSuccessAt,
      });
      return;
    }

    this.log('warn', 'Usage collector reported unhealthy status', {
      source,
      detail: status.detail,
      lastSuccessAt: status.lastSuccessAt,
    });
  }

  /**
   * Validate a workflow without executing it
   * 
   * @param workflow - Workflow to validate
   * @param options - Validation options (optional ownership context for tracking)
   * @returns True if valid, throws if invalid
   */
  async validate(
    workflow: string | ParsedWorkflow,
    options?: { _ownershipContext?: Partial<OwnershipContext>; logger?: EngineLogger }
  ): Promise<boolean> {
    const parsed = typeof workflow === 'string'
      ? await WorkflowLoader.toWorkflowObject(workflow, { logger: options?.logger })
      : workflow;
    this.assertWorkflowVersionSupported(parsed);

    // Context was set in WorkflowLoader — clear it now that validation is done
    LoggerManager.clearWorkflowContext();
    return true;
  }

  /**
   * Explain a workflow without executing it
   * 
   * Provides a detailed execution plan showing:
   * - Step execution order
   * - Dependencies between steps
   * - Adapter usage
   * - Retry and timeout configuration
   * - Circular dependency detection
   * 
   * @param workflow - Workflow to explain (string YAML content or ParsedWorkflow)
   * @param options - Optional ownership context for tracking
   * @returns Execution explanation in JSON format
   * @throws Error if workflow is invalid
   */
  async explain(
    workflow: string | ParsedWorkflow,
    options?: { _ownershipContext?: Partial<OwnershipContext>; logger?: EngineLogger }
  ): Promise<ExecutionExplanation> {
    const parsedWorkflow = typeof workflow === 'string'
      ? await WorkflowLoader.toWorkflowObject(workflow, { logger: options?.logger })
      : workflow;

    this.assertWorkflowVersionSupported(parsedWorkflow);
    // Generate explanation
    const explanation = ExplanationGenerator.generate(parsedWorkflow);
    // Log explanation for CLI visibility
    ExplanationLogger.log(explanation, 'info');

    LoggerManager.clearWorkflowContext();
    return explanation;
  }

  /**
   * Perform a dry run of a workflow
   * Validates and plans execution without running steps
   * INTERNAL: Creates internal context for tracking (non-billable)
   */
  private async dryRun(
    workflow: ParsedWorkflow,
    options: WorkflowRunOptions
  ): Promise<WorkflowResult> {
    // Create internal context for tracking dry runs (non-billable)
    const internalContext = InternalContextBuilder.build(
      this.version,
      { ...(options._ownershipContext || {}), subscriptionTier: 'free' }
    );

    this.log('info', `Dry run: ${workflow.name || 'unnamed'}`, {
      executionId: internalContext._identity.executionId,
      runMode: 'dry-run',
    });

    // Show what would be executed
    if (options.variables) {
      this.log('debug', 'Variables that would be used:', options.variables);
    }
    if (options.env) {
      this.log('debug', 'Environment that would be set:', options.env);
    }

    // Log execution plan
    this.log('info', `Would execute ${workflow.steps.length} steps:`);
    for (const step of workflow.steps) {
      this.log('info', `  - ${step.id}: ${step.adapter}.${step.action}`);
    }

    // Track dry run in internal context (for analytics)
    internalContext._usage.stepCount = workflow.steps.length;
    internalContext._usage.automationCount = 0; // Dry runs don't count as executions

    this.log('debug', 'Dry run completed - no steps executed');

    // Return mock result showing what would happen
    return {
      workflowName: workflow.name || 'unnamed',
      executionId: `dry-run-${Date.now()}`,
      status: 'success',
      stepResults: new Map(),
      duration: 0,
      startedAt: new Date(),
      completedAt: new Date(),
      metadata: {
        totalSteps: workflow.steps.length,
        successfulSteps: 0,
        failedSteps: 0,
        skippedSteps: workflow.steps.length,
        phases: 0,
      },
    };
  }

  /**
   * Register an adapter
   * 
   * @param adapter - Adapter to register
   */
  registerAdapter(adapter: Adapter): void {
    // adapterRegistry is shared with stepExecutor — one registration, one log.
    this.stepExecutor.registerModernAdapter(adapter);
    this.log('debug', `Registered adapter: ${adapter.name}`);
  }

  /**
   * Register multiple adapters
   * 
   * @param adapters - Array of adapters
   */
  registerAdapters(adapters: Adapter[]): void {
    for (const adapter of adapters) {
      this.registerAdapter(adapter);
    }
  }

  /**
   * Register a lifecycle hook
   * 
   * @param hook - Hook to register
   */
  registerHook(hook: LifecycleHook): void {
    this.hookManager.register(hook);
    this.log('debug', 'Registered lifecycle hook');
  }

  /**
   * Register multiple hooks
   * 
   * @param hooks - Array of hooks
   */
  registerHooks(hooks: LifecycleHook[]): void {
    this.hookManager.registerMany(hooks);
    this.log('debug', `Registered ${hooks.length} lifecycle hooks`);
  }

  /**
   * Get the event bus for listening to engine events
   * 
   * @returns Event bus instance
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Get the engine context
   * 
   * @returns Engine context
   */
  getContext(): EngineContext {
    return this.context;
  }

  /**
   * Get engine configuration
   * 
   * @returns Engine configuration
   */
  getConfig(): OrbytEngineConfig {
    return this.config;
  }

  /**
   * Get the execution state store for reading past execution records.
   */
  getExecutionStore(): ExecutionStore {
    return this.executionStore;
  }

  /**
   * Get the workflow store for loading saved (versioned) workflow definitions.
   * Primarily used for replay: load the exact definition that produced a failed run.
   */
  getWorkflowStore(): WorkflowStore {
    return this.workflowStore;
  }

  /**
   * Get the schedule store for reading and managing persisted schedules.
   */
  getScheduleStore(): ScheduleStore {
    return this.scheduleStore;
  }

  /**
   * Get parsed workflow cache for diagnostics and tooling integration.
   */
  getWorkflowParseCache(): WorkflowParseCache {
    return this.workflowParseCache;
  }

  /**
   * Get adapter metadata cache for diagnostics and tooling integration.
   */
  getAdapterMetadataCache(): AdapterMetadataCache {
    return this.adapterMetadataCache;
  }

  /**
   * Get runtime artifact store (dag/context/locks) for diagnostics and tooling.
   */
  getRuntimeArtifactStore(): RuntimeArtifactStore {
    return this.runtimeArtifactStore;
  }

  /**
   * Get adapter registry statistics for diagnostics and CLI health checks.
   */
  getAdapterStats(): {
    total: number;
    initialized: number;
    adapters: Array<{
      name: string;
      version: string;
      supportedActions: string[];
      isInitialized: boolean;
    }>;
  } {
    return this.adapterRegistry.getStats();
  }

  /**
   * Get engine runtime version.
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Query usage events from the local spool archive and return aggregated metrics.
   */
  async getUsage(options: EngineUsageQueryOptions = {}): Promise<EngineUsageQueryResult> {
    const now = Date.now();
    const from = options.from ?? now - 30 * 24 * 60 * 60 * 1000;
    const to = options.to ?? now;
    const groupBy = options.groupBy ?? 'none';

    if (from > to) {
      throw new Error(`Invalid usage query range: from (${from}) must be <= to (${to})`);
    }

    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const eventsDir = join(usageBaseDir, 'events');
    const filteredEvents: UsageEvent[] = [];

    if (existsSync(eventsDir)) {
      const files = readdirSync(eventsDir)
        .filter((name) => name.endsWith('.jsonl'))
        .sort();

      for (const file of files) {
        const filePath = join(eventsDir, file);
        let content = '';

        try {
          content = readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }

        if (!content.trim()) {
          continue;
        }

        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          let event: UsageEvent;
          try {
            event = JSON.parse(trimmed) as UsageEvent;
          } catch {
            continue;
          }

          if (!this.matchesUsageQuery(event, options, from, to)) {
            continue;
          }

          filteredEvents.push(event);
        }
      }
    }

    const byType: Record<string, number> = {};
    const byProduct: Record<string, number> = {};
    const byAdapter: Record<string, number> = {};
    const byWorkflow: Record<string, number> = {};
    const byWorkspace: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    const groupedMap = new Map<string, EngineUsageGroupBucket>();

    let billableEvents = 0;
    let successEvents = 0;
    let failureEvents = 0;
    let totalDurationMs = 0;

    for (const event of filteredEvents) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      byProduct[event.product] = (byProduct[event.product] ?? 0) + 1;

      const adapterKey = event.adapterName || event.adapterType || 'unknown';
      byAdapter[adapterKey] = (byAdapter[adapterKey] ?? 0) + 1;

      const workflowKey = event.workflowId || 'unknown';
      byWorkflow[workflowKey] = (byWorkflow[workflowKey] ?? 0) + 1;

      const workspaceKey = event.workspaceId || 'unknown';
      byWorkspace[workspaceKey] = (byWorkspace[workspaceKey] ?? 0) + 1;

      const userKey = event.userId || 'unknown';
      byUser[userKey] = (byUser[userKey] ?? 0) + 1;

      const triggerKey = this.resolveTriggerKey(event);
      byTrigger[triggerKey] = (byTrigger[triggerKey] ?? 0) + 1;

      if (event.billable === true) {
        billableEvents += 1;
      }

      if (event.metadata?.success === true) {
        successEvents += 1;
      } else if (event.metadata?.success === false) {
        failureEvents += 1;
      }

      const durationMs = typeof event.metadata?.durationMs === 'number'
        ? Math.max(0, event.metadata.durationMs)
        : 0;
      totalDurationMs += durationMs;

      if (groupBy !== 'none') {
        const key = this.resolveUsageGroupKey(event, groupBy);
        const existing = groupedMap.get(key) ?? {
          key,
          eventCount: 0,
          billableCount: 0,
          successCount: 0,
          failureCount: 0,
          totalDurationMs: 0,
        };

        existing.eventCount += 1;
        if (event.billable === true) {
          existing.billableCount += 1;
        }
        if (event.metadata?.success === true) {
          existing.successCount += 1;
        } else if (event.metadata?.success === false) {
          existing.failureCount += 1;
        }
        existing.totalDurationMs += durationMs;

        groupedMap.set(key, existing);
      }
    }

    const normalizedLimit =
      typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : undefined;

    const outputEvents = options.includeEvents
      ? (normalizedLimit ? filteredEvents.slice(-normalizedLimit) : filteredEvents)
      : undefined;

    return {
      query: {
        from,
        to,
        groupBy,
        limit: normalizedLimit,
      },
      totalEvents: filteredEvents.length,
      billableEvents,
      successEvents,
      failureEvents,
      totalDurationMs,
      byType,
      byProduct,
      byAdapter,
      byWorkflow,
      byWorkspace,
      byUser,
      byTrigger,
      grouped: Array.from(groupedMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
      events: outputEvents?.map((event) => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        product: event.product,
        executionId: event.executionId,
        workflowId: event.workflowId,
        stepId: event.stepId,
        adapterName: event.adapterName,
        adapterType: event.adapterType,
        billable: event.billable,
        metadata: event.metadata,
      })),
    };
  }

  /**
   * Build persisted daily aggregate usage counters from raw usage archives.
   */
  runDailyUsageAggregation(): DailyUsageAggregationRunResult {
    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const eventsDir = join(usageBaseDir, 'events');
    const aggregatesDir = join(usageBaseDir, 'aggregates');
    const aggregateFile = join(aggregatesDir, 'daily.json');
    const watermarkFile = join(aggregatesDir, 'watermark.json');

    if (!existsSync(aggregatesDir)) {
      mkdirSync(aggregatesDir, { recursive: true });
    }

    const existingBuckets = this.readDailyAggregateBuckets(aggregateFile);
    const bucketMap = new Map<string, DailyUsageAggregateBucket>();
    for (const bucket of existingBuckets) {
      bucketMap.set(this.aggregateBucketKey(bucket.day, bucket.workspaceId, bucket.product), bucket);
    }

    const state = this.readDailyAggregationState(watermarkFile);
    const watermarkDay = state.watermarkDay;

    if (!existsSync(eventsDir)) {
      writeFileSync(aggregateFile, JSON.stringify(existingBuckets, null, 2), 'utf8');
      writeFileSync(watermarkFile, JSON.stringify(state, null, 2), 'utf8');
      return {
        processedDays: 0,
        updatedBuckets: 0,
        watermarkDay,
        aggregateFile,
        watermarkFile,
      };
    }

    const files = readdirSync(eventsDir)
      .filter((name) => name.endsWith('.jsonl'))
      .sort();

    const pendingFiles = files.filter((name) => {
      const day = name.replace(/\.jsonl$/, '');
      return !watermarkDay || day >= watermarkDay;
    });

    let processedDays = 0;
    const updatedKeys = new Set<string>();
    let latestWatermark = watermarkDay;

    for (const file of pendingFiles) {
      const day = file.replace(/\.jsonl$/, '');
      const filePath = join(eventsDir, file);

      // Reprocess each selected day from scratch so reruns are idempotent and
      // late events in the watermark day are included without double counting.
      for (const key of Array.from(bucketMap.keys())) {
        if (key.startsWith(`${day}|`)) {
          bucketMap.delete(key);
        }
      }

      let content = '';

      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
      for (const line of lines) {
        let event: UsageEvent;
        try {
          event = JSON.parse(line) as UsageEvent;
        } catch {
          continue;
        }

        const workspaceId = event.workspaceId || 'unknown';
        const product = event.product || 'unknown';
        const key = this.aggregateBucketKey(day, workspaceId, product);
        const existing = bucketMap.get(key) ?? {
          day,
          workspaceId,
          product,
          workflowRuns: 0,
          stepExecutions: 0,
          adapterCalls: 0,
          computeMs: 0,
          billableEvents: 0,
          totalEvents: 0,
          updatedAt: Date.now(),
        };

        existing.totalEvents += 1;
        if (event.billable === true) {
          existing.billableEvents += 1;
        }

        if (event.type === 'usage.workflow.run') {
          existing.workflowRuns += 1;
        } else if (event.type === 'usage.step.execute') {
          existing.stepExecutions += 1;
        } else if (event.type === 'usage.adapter.call') {
          existing.adapterCalls += 1;
        }

        const durationMs = typeof event.metadata?.durationMs === 'number'
          ? Math.max(0, event.metadata.durationMs)
          : 0;
        existing.computeMs += durationMs;
        existing.updatedAt = Date.now();

        bucketMap.set(key, existing);
        updatedKeys.add(key);
      }

      processedDays += 1;
      latestWatermark = day;
    }

    const nextBuckets = Array.from(bucketMap.values()).sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
      return a.product.localeCompare(b.product);
    });

    const nextState: DailyUsageAggregationState = {
      watermarkDay: latestWatermark,
      updatedAt: Date.now(),
    };

    writeFileSync(aggregateFile, JSON.stringify(nextBuckets, null, 2), 'utf8');
    writeFileSync(watermarkFile, JSON.stringify(nextState, null, 2), 'utf8');

    return {
      processedDays,
      updatedBuckets: updatedKeys.size,
      watermarkDay: nextState.watermarkDay,
      aggregateFile,
      watermarkFile,
    };
  }

  /**
   * Read persisted daily usage aggregate counters.
   */
  getDailyUsageAggregates(options: DailyUsageAggregateQueryOptions = {}): DailyUsageAggregateBucket[] {
    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const aggregateFile = join(usageBaseDir, 'aggregates', 'daily.json');
    const buckets = this.readDailyAggregateBuckets(aggregateFile)
      .filter((bucket) => (options.day ? bucket.day === options.day : true))
      .filter((bucket) => (options.workspaceId ? bucket.workspaceId === options.workspaceId : true))
      .filter((bucket) => (options.product ? bucket.product === options.product : true));

    const limit = options.limit && options.limit > 0 ? options.limit : undefined;
    return limit ? buckets.slice(0, limit) : buckets;
  }

  /**
   * Rebuild selected daily aggregate buckets from raw events.
   *
   * Used to repair counters when late/out-of-order events arrive.
   */
  rebuildDailyUsageAggregates(options: DailyUsageAggregateRebuildOptions = {}): DailyUsageAggregateRebuildResult {
    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const eventsDir = join(usageBaseDir, 'events');
    const aggregateFile = join(usageBaseDir, 'aggregates', 'daily.json');

    const existing = this.readDailyAggregateBuckets(aggregateFile);
    if (!existsSync(eventsDir)) {
      return {
        fromDay: options.fromDay,
        toDay: options.toDay,
        selectedDays: 0,
        removedBuckets: 0,
        rebuiltBuckets: 0,
        aggregateFile,
      };
    }

    const allDays = readdirSync(eventsDir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.replace(/\.jsonl$/, ''))
      .sort();

    const selectedDays = allDays.filter((day) => {
      if (options.fromDay && day < options.fromDay) return false;
      if (options.toDay && day > options.toDay) return false;
      return true;
    });

    const selectedSet = new Set(selectedDays);
    const shouldReplaceBucket = (bucket: DailyUsageAggregateBucket): boolean => {
      if (!selectedSet.has(bucket.day)) return false;
      if (options.workspaceId && bucket.workspaceId !== options.workspaceId) return false;
      if (options.product && bucket.product !== options.product) return false;
      return true;
    };

    const kept = existing.filter((bucket) => !shouldReplaceBucket(bucket));
    const removedBuckets = existing.length - kept.length;

    const rebuiltMap = new Map<string, DailyUsageAggregateBucket>();

    for (const day of selectedDays) {
      const filePath = join(eventsDir, `${day}.jsonl`);
      let content = '';
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
      for (const line of lines) {
        let event: UsageEvent;
        try {
          event = JSON.parse(line) as UsageEvent;
        } catch {
          continue;
        }

        const workspaceId = event.workspaceId || 'unknown';
        const product = event.product || 'unknown';
        if (options.workspaceId && workspaceId !== options.workspaceId) continue;
        if (options.product && product !== options.product) continue;

        const key = this.aggregateBucketKey(day, workspaceId, product);
        const bucket = rebuiltMap.get(key) ?? {
          day,
          workspaceId,
          product,
          workflowRuns: 0,
          stepExecutions: 0,
          adapterCalls: 0,
          computeMs: 0,
          billableEvents: 0,
          totalEvents: 0,
          updatedAt: Date.now(),
        };

        bucket.totalEvents += 1;
        if (event.billable === true) bucket.billableEvents += 1;
        if (event.type === 'usage.workflow.run') bucket.workflowRuns += 1;
        else if (event.type === 'usage.step.execute') bucket.stepExecutions += 1;
        else if (event.type === 'usage.adapter.call') bucket.adapterCalls += 1;

        const durationMs = typeof event.metadata?.durationMs === 'number'
          ? Math.max(0, event.metadata.durationMs)
          : 0;
        bucket.computeMs += durationMs;
        bucket.updatedAt = Date.now();

        rebuiltMap.set(key, bucket);
      }
    }

    const merged = [...kept, ...Array.from(rebuiltMap.values())].sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
      return a.product.localeCompare(b.product);
    });

    writeFileSync(aggregateFile, JSON.stringify(merged, null, 2), 'utf8');

    return {
      fromDay: options.fromDay,
      toDay: options.toDay,
      selectedDays: selectedDays.length,
      removedBuckets,
      rebuiltBuckets: rebuiltMap.size,
      aggregateFile,
    };
  }

  /**
   * Build weekly/monthly rollups from daily aggregate counters.
   */
  runUsagePeriodRollups(): UsagePeriodRollupRunResult {
    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const aggregatesDir = join(usageBaseDir, 'aggregates');
    const weeklyFile = join(aggregatesDir, 'weekly.json');
    const monthlyFile = join(aggregatesDir, 'monthly.json');

    if (!existsSync(aggregatesDir)) {
      mkdirSync(aggregatesDir, { recursive: true });
    }

    const daily = this.readDailyAggregateBuckets(join(aggregatesDir, 'daily.json'));
    const weeklyMap = new Map<string, PeriodUsageRollupBucket>();
    const monthlyMap = new Map<string, PeriodUsageRollupBucket>();

    for (const bucket of daily) {
      const weekStart = this.getWeekStartDay(bucket.day);
      const monthStart = this.getMonthStartDay(bucket.day);

      const weeklyKey = this.rollupBucketKey('weekly', weekStart, bucket.workspaceId, bucket.product);
      const monthlyKey = this.rollupBucketKey('monthly', monthStart, bucket.workspaceId, bucket.product);

      const weekly = weeklyMap.get(weeklyKey) ?? {
        periodType: 'weekly' as const,
        periodStart: weekStart,
        workspaceId: bucket.workspaceId,
        product: bucket.product,
        workflowRuns: 0,
        stepExecutions: 0,
        adapterCalls: 0,
        computeMs: 0,
        billableEvents: 0,
        totalEvents: 0,
        updatedAt: Date.now(),
      };
      weekly.workflowRuns += bucket.workflowRuns;
      weekly.stepExecutions += bucket.stepExecutions;
      weekly.adapterCalls += bucket.adapterCalls;
      weekly.computeMs += bucket.computeMs;
      weekly.billableEvents += bucket.billableEvents;
      weekly.totalEvents += bucket.totalEvents;
      weekly.updatedAt = Date.now();
      weeklyMap.set(weeklyKey, weekly);

      const monthly = monthlyMap.get(monthlyKey) ?? {
        periodType: 'monthly' as const,
        periodStart: monthStart,
        workspaceId: bucket.workspaceId,
        product: bucket.product,
        workflowRuns: 0,
        stepExecutions: 0,
        adapterCalls: 0,
        computeMs: 0,
        billableEvents: 0,
        totalEvents: 0,
        updatedAt: Date.now(),
      };
      monthly.workflowRuns += bucket.workflowRuns;
      monthly.stepExecutions += bucket.stepExecutions;
      monthly.adapterCalls += bucket.adapterCalls;
      monthly.computeMs += bucket.computeMs;
      monthly.billableEvents += bucket.billableEvents;
      monthly.totalEvents += bucket.totalEvents;
      monthly.updatedAt = Date.now();
      monthlyMap.set(monthlyKey, monthly);
    }

    const weeklyBuckets = Array.from(weeklyMap.values()).sort((a, b) => {
      if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
      if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
      return a.product.localeCompare(b.product);
    });
    const monthlyBuckets = Array.from(monthlyMap.values()).sort((a, b) => {
      if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
      if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
      return a.product.localeCompare(b.product);
    });

    writeFileSync(weeklyFile, JSON.stringify(weeklyBuckets, null, 2), 'utf8');
    writeFileSync(monthlyFile, JSON.stringify(monthlyBuckets, null, 2), 'utf8');

    return {
      weeklyBuckets: weeklyBuckets.length,
      monthlyBuckets: monthlyBuckets.length,
      weeklyFile,
      monthlyFile,
    };
  }

  /**
   * Run the full usage aggregation pipeline in deterministic order.
   *
   * Order:
   * 1. Build daily aggregates from raw events
   * 2. Build weekly/monthly rollups from daily aggregates
   */
  runUsageAggregationPipeline(): UsageAggregationPipelineRunResult {
    const daily = this.runDailyUsageAggregation();
    const rollups = this.runUsagePeriodRollups();

    return {
      daily,
      rollups,
      generatedAt: Date.now(),
    };
  }

  /**
   * Read persisted weekly/monthly usage rollups.
   */
  getUsagePeriodRollups(options: UsagePeriodRollupQueryOptions): PeriodUsageRollupBucket[] {
    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const file = join(usageBaseDir, 'aggregates', `${options.periodType}.json`);
    const rollups = this.readPeriodRollupBuckets(file)
      .filter((bucket) => bucket.periodType === options.periodType)
      .filter((bucket) => (options.periodStart ? bucket.periodStart === options.periodStart : true))
      .filter((bucket) => (options.workspaceId ? bucket.workspaceId === options.workspaceId : true))
      .filter((bucket) => (options.product ? bucket.product === options.product : true));

    const limit = options.limit && options.limit > 0 ? options.limit : undefined;
    return limit ? rollups.slice(0, limit) : rollups;
  }

  /**
   * Basic reporting API for daily/weekly/monthly summaries.
   */
  getUsagePeriodSummary(options: UsagePeriodSummaryQueryOptions = {}): UsagePeriodSummaryResult {
    const refreshBeforeRead = options.refreshBeforeRead ?? true;
    const periodType = options.periodType ?? 'all';

    if (refreshBeforeRead) {
      this.runUsageAggregationPipeline();
    }

    const collect = (type: 'daily' | 'weekly' | 'monthly'): BillingUsageFetchBucket[] => {
      const result = this.getBillingUsageForPeriod({
        periodType: type,
        workspaceId: options.workspaceId,
        product: options.product,
        refreshBeforeFetch: false,
      });

      return result.buckets.filter((bucket) => {
        if (options.periodStart && bucket.periodStart !== options.periodStart) return false;
        if (options.fromPeriodStart && bucket.periodStart < options.fromPeriodStart) return false;
        if (options.toPeriodStart && bucket.periodStart > options.toPeriodStart) return false;
        return true;
      });
    };

    const buckets = periodType === 'all'
      ? [
        ...collect('daily'),
        ...collect('weekly'),
        ...collect('monthly'),
      ]
      : collect(periodType);

    const sorted = buckets.sort((a, b) => {
      if (a.periodType !== b.periodType) return a.periodType.localeCompare(b.periodType);
      if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
      if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
      return a.product.localeCompare(b.product);
    });

    const limit = options.limit && options.limit > 0 ? options.limit : undefined;
    const finalBuckets = limit ? sorted.slice(0, limit) : sorted;

    return {
      periodType,
      generatedAt: Date.now(),
      refreshedBeforeRead: refreshBeforeRead,
      totalBuckets: finalBuckets.length,
      buckets: finalBuckets,
    };
  }

  /**
   * Verify weekly/monthly rollups reconcile against daily aggregates.
   */
  verifyUsageRollupReconciliation(
    options: UsageRollupReconciliationQueryOptions = {},
  ): UsageRollupReconciliationResult {
    const periodType = options.periodType ?? 'weekly';

    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const daily = this.readDailyAggregateBuckets(join(usageBaseDir, 'aggregates', 'daily.json'))
      .filter((bucket) => (options.workspaceId ? bucket.workspaceId === options.workspaceId : true))
      .filter((bucket) => (options.product ? bucket.product === options.product : true));

    const expectedMap = new Map<string, PeriodUsageRollupBucket>();
    for (const bucket of daily) {
      const groupedPeriodStart = periodType === 'weekly'
        ? this.getWeekStartDay(bucket.day)
        : this.getMonthStartDay(bucket.day);

      if (options.periodStart && groupedPeriodStart !== options.periodStart) {
        continue;
      }

      const key = this.rollupBucketKey(periodType, groupedPeriodStart, bucket.workspaceId, bucket.product);
      const existing = expectedMap.get(key) ?? {
        periodType,
        periodStart: groupedPeriodStart,
        workspaceId: bucket.workspaceId,
        product: bucket.product,
        workflowRuns: 0,
        stepExecutions: 0,
        adapterCalls: 0,
        computeMs: 0,
        billableEvents: 0,
        totalEvents: 0,
        updatedAt: Date.now(),
      };

      existing.workflowRuns += bucket.workflowRuns;
      existing.stepExecutions += bucket.stepExecutions;
      existing.adapterCalls += bucket.adapterCalls;
      existing.computeMs += bucket.computeMs;
      existing.billableEvents += bucket.billableEvents;
      existing.totalEvents += bucket.totalEvents;
      expectedMap.set(key, existing);
    }

    const actualRollups = this.getUsagePeriodRollups({
      periodType,
      periodStart: options.periodStart,
      workspaceId: options.workspaceId,
      product: options.product,
    });
    const actualMap = new Map<string, PeriodUsageRollupBucket>();
    for (const bucket of actualRollups) {
      const key = this.rollupBucketKey(periodType, bucket.periodStart, bucket.workspaceId, bucket.product);
      actualMap.set(key, bucket);
    }

    const allKeys = new Set<string>([
      ...Array.from(expectedMap.keys()),
      ...Array.from(actualMap.keys()),
    ]);

    const mismatches: UsageRollupReconciliationMismatch[] = [];
    for (const key of allKeys) {
      const expected = expectedMap.get(key);
      const actual = actualMap.get(key);
      if (!expected || !actual) {
        const baseline = expected ?? actual;
        if (!baseline) continue;
        mismatches.push({
          periodType,
          periodStart: baseline.periodStart,
          workspaceId: baseline.workspaceId,
          product: baseline.product,
          expected: {
            workflowRuns: expected?.workflowRuns ?? 0,
            stepExecutions: expected?.stepExecutions ?? 0,
            adapterCalls: expected?.adapterCalls ?? 0,
            computeMs: expected?.computeMs ?? 0,
            billableEvents: expected?.billableEvents ?? 0,
            totalEvents: expected?.totalEvents ?? 0,
          },
          actual: {
            workflowRuns: actual?.workflowRuns ?? 0,
            stepExecutions: actual?.stepExecutions ?? 0,
            adapterCalls: actual?.adapterCalls ?? 0,
            computeMs: actual?.computeMs ?? 0,
            billableEvents: actual?.billableEvents ?? 0,
            totalEvents: actual?.totalEvents ?? 0,
          },
        });
        continue;
      }

      const same =
        expected.workflowRuns === actual.workflowRuns
        && expected.stepExecutions === actual.stepExecutions
        && expected.adapterCalls === actual.adapterCalls
        && expected.computeMs === actual.computeMs
        && expected.billableEvents === actual.billableEvents
        && expected.totalEvents === actual.totalEvents;

      if (!same) {
        mismatches.push({
          periodType,
          periodStart: expected.periodStart,
          workspaceId: expected.workspaceId,
          product: expected.product,
          expected: {
            workflowRuns: expected.workflowRuns,
            stepExecutions: expected.stepExecutions,
            adapterCalls: expected.adapterCalls,
            computeMs: expected.computeMs,
            billableEvents: expected.billableEvents,
            totalEvents: expected.totalEvents,
          },
          actual: {
            workflowRuns: actual.workflowRuns,
            stepExecutions: actual.stepExecutions,
            adapterCalls: actual.adapterCalls,
            computeMs: actual.computeMs,
            billableEvents: actual.billableEvents,
            totalEvents: actual.totalEvents,
          },
        });
      }
    }

    return {
      periodType,
      checkedAt: Date.now(),
      checkedBuckets: allKeys.size,
      mismatchCount: mismatches.length,
      matches: mismatches.length === 0,
      mismatches,
    };
  }

  /**
   * Billing-facing fetch API over persisted usage aggregates.
   *
   * Supports daily/weekly/monthly pulls with optional pre-fetch refresh.
   */
  getBillingUsageForPeriod(options: BillingUsageFetchOptions = {}): BillingUsageFetchResult {
    const periodType = options.periodType ?? 'daily';
    const refreshBeforeFetch = options.refreshBeforeFetch ?? true;
    const usageBaseDir = this.config.usageSpool?.baseDir ?? join(homedir(), '.billing', 'orbyt', 'usage');
    const aggregatesDir = join(usageBaseDir, 'aggregates');
    const sourceFile = join(aggregatesDir, `${periodType}.json`);
    const watermarkFile = join(aggregatesDir, 'watermark.json');

    if (refreshBeforeFetch) {
      this.runUsageAggregationPipeline();
    }

    const billingBuckets: BillingUsageFetchBucket[] = periodType === 'daily'
      ? this.getDailyUsageAggregates({
        workspaceId: options.workspaceId,
        product: options.product,
      }).map((bucket) => ({
        periodType: 'daily',
        periodStart: bucket.day,
        workspaceId: bucket.workspaceId,
        product: bucket.product,
        workflowRuns: bucket.workflowRuns,
        stepExecutions: bucket.stepExecutions,
        adapterCalls: bucket.adapterCalls,
        computeMs: bucket.computeMs,
        billableEvents: bucket.billableEvents,
        totalEvents: bucket.totalEvents,
        updatedAt: bucket.updatedAt,
      }))
      : this.getUsagePeriodRollups({
        periodType,
        workspaceId: options.workspaceId,
        product: options.product,
      }).map((bucket) => ({
        periodType: bucket.periodType,
        periodStart: bucket.periodStart,
        workspaceId: bucket.workspaceId,
        product: bucket.product,
        workflowRuns: bucket.workflowRuns,
        stepExecutions: bucket.stepExecutions,
        adapterCalls: bucket.adapterCalls,
        computeMs: bucket.computeMs,
        billableEvents: bucket.billableEvents,
        totalEvents: bucket.totalEvents,
        updatedAt: bucket.updatedAt,
      }));

    const filteredByRange = billingBuckets.filter((bucket) => {
      if (options.fromPeriodStart && bucket.periodStart < options.fromPeriodStart) return false;
      if (options.toPeriodStart && bucket.periodStart > options.toPeriodStart) return false;
      return true;
    });

    const sorted = filteredByRange.sort((a, b) => {
      if (a.periodStart !== b.periodStart) return a.periodStart.localeCompare(b.periodStart);
      if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
      return a.product.localeCompare(b.product);
    });

    const limit = options.limit && options.limit > 0 ? options.limit : undefined;
    const finalBuckets = limit ? sorted.slice(0, limit) : sorted;

    const aggregationState = this.readDailyAggregationState(watermarkFile);
    return {
      periodType,
      fetchedAt: Date.now(),
      refreshedBeforeFetch: refreshBeforeFetch,
      sourceFile,
      watermarkDay: aggregationState.watermarkDay,
      totalBuckets: finalBuckets.length,
      buckets: finalBuckets,
    };
  }

  /**
   * Incremental billing fetch API based on a caller-provided cursor.
   *
   * Semantics:
   * - cursor.lastPeriodStart is treated as exclusive
   * - returned nextCursor always points to the newest delivered period
   */
  getBillingUsageIncremental(options: BillingUsageIncrementalFetchOptions = {}): BillingUsageIncrementalFetchResult {
    const previousCursor = options.cursor;
    const requestedPeriodType = options.periodType ?? previousCursor?.periodType ?? 'daily';

    const baseResult = this.getBillingUsageForPeriod({
      ...options,
      periodType: requestedPeriodType,
      workspaceId: options.workspaceId ?? previousCursor?.workspaceId,
      product: options.product ?? previousCursor?.product,
    });

    const exclusiveFloor = previousCursor?.lastPeriodStart;
    const filteredBuckets = exclusiveFloor
      ? baseResult.buckets.filter((bucket) => bucket.periodStart > exclusiveFloor)
      : baseResult.buckets;

    const newestPeriodStart = filteredBuckets.length > 0
      ? filteredBuckets[filteredBuckets.length - 1]?.periodStart
      : previousCursor?.lastPeriodStart;

    const nextCursor: BillingUsageFetchCursor = {
      periodType: requestedPeriodType,
      lastPeriodStart: newestPeriodStart,
      workspaceId: options.workspaceId ?? previousCursor?.workspaceId,
      product: options.product ?? previousCursor?.product,
      updatedAt: Date.now(),
    };

    return {
      previousCursor,
      nextCursor,
      periodType: requestedPeriodType,
      fetchedAt: Date.now(),
      refreshedBeforeFetch: baseResult.refreshedBeforeFetch,
      sourceFile: baseResult.sourceFile,
      watermarkDay: baseResult.watermarkDay,
      totalBuckets: filteredBuckets.length,
      buckets: filteredBuckets,
    };
  }

  /**
   * Expose Orbyt's usage aggregation fetch APIs through the shared
   * billing-provider contract from ecosystem-core.
   */
  getBillingUsageFetchProvider(): BillingUsageFetchProvider {
    return {
      fetchUsageForBilling: async (options: BillingUsageFetchOptions = {}) =>
        this.getBillingUsageForPeriod(options),
      fetchUsageForBillingIncremental: async (options: BillingUsageIncrementalFetchOptions = {}) =>
        this.getBillingUsageIncremental(options),
    };
  }

  /**
   * Foundation-only setter for pricing catalog snapshot.
   */
  setPricingCatalog(catalog: BillingPricingCatalog): void {
    this.billingPricingCatalog = catalog;
    this.log('debug', 'Pricing catalog snapshot set', {
      version: catalog.version,
      currency: catalog.currency,
      componentCount: Object.keys(catalog.components || {}).length,
    });
  }

  /**
   * Read current pricing catalog snapshot used for estimates.
   */
  getPricingCatalog(): BillingPricingCatalog | undefined {
    return this.billingPricingCatalog;
  }

  /**
   * Foundation-level cost estimate from usage aggregate buckets.
   *
   * This intentionally avoids invoice/tax logic and only supports:
   * - component simple count rule (single unscoped count rule)
   * - catalog fallback per-event pricing
   */
  estimateUsageCost(options: UsageBillingEstimateOptions = {}): UsageBillingEstimateResult {
    const periodType = options.periodType ?? 'daily';
    const catalog = this.billingPricingCatalog;

    if (!catalog) {
      throw new Error('Pricing catalog not configured. Call setPricingCatalog() first.');
    }

    const fetched = this.getBillingUsageForPeriod({
      periodType,
      workspaceId: options.workspaceId,
      product: options.product,
      fromPeriodStart: options.fromPeriodStart,
      toPeriodStart: options.toPeriodStart,
      limit: options.limit,
      refreshBeforeFetch: options.refreshBeforeFetch,
    });

    const byComponent = new Map<string, { bucketCount: number; eventCount: number }>();
    for (const bucket of fetched.buckets) {
      const existing = byComponent.get(bucket.product) ?? { bucketCount: 0, eventCount: 0 };
      existing.bucketCount += 1;
      existing.eventCount += bucket.totalEvents;
      byComponent.set(bucket.product, existing);
    }

    const components: UsageBillingEstimateComponent[] = [];
    const unsupportedComponents: string[] = [];
    const strictSimple = options.strictSimpleRulesOnly ?? false;

    for (const [component, counters] of byComponent.entries()) {
      const componentPricing = catalog.components[component];
      const fallback = catalog.defaults?.fallbackPricePerEvent;

      let pricePerEvent: number | undefined;
      let pricingSource: UsageBillingEstimateComponent['pricingSource'] = 'unsupported';

      if (componentPricing) {
        const simpleCountRules = componentPricing.rules.filter((rule) =>
          rule.metric === 'count'
          && !rule.eventType
          && !rule.adapterType
          && !rule.adapterName,
        );

        if (simpleCountRules.length === 1) {
          pricePerEvent = simpleCountRules[0].pricePerUnit;
          pricingSource = 'component-simple-rule';
        } else if (!strictSimple && fallback !== undefined) {
          pricePerEvent = fallback;
          pricingSource = 'catalog-fallback';
        }
      } else if (fallback !== undefined) {
        pricePerEvent = fallback;
        pricingSource = 'catalog-fallback';
      }

      if (pricePerEvent === undefined) {
        unsupportedComponents.push(component);
        components.push({
          component,
          bucketCount: counters.bucketCount,
          eventCount: counters.eventCount,
          estimatedAmount: 0,
          pricingSource: 'unsupported',
        });
        continue;
      }

      components.push({
        component,
        bucketCount: counters.bucketCount,
        eventCount: counters.eventCount,
        estimatedAmount: counters.eventCount * pricePerEvent,
        pricingSource,
      });
    }

    const estimatedAmount = components.reduce((sum, item) => sum + item.estimatedAmount, 0);
    const notes = [
      'Foundation estimate only: invoice/tax/credit logic is intentionally excluded.',
      'Estimate is aggregate-based and may differ from event-level billing calculations.',
    ];

    return {
      generatedAt: Date.now(),
      periodType,
      currency: catalog.currency,
      estimatedAmount,
      components: components.sort((a, b) => a.component.localeCompare(b.component)),
      unsupportedComponents: Array.from(new Set(unsupportedComponents)).sort((a, b) => a.localeCompare(b)),
      notes,
    };
  }

  /**
   * Phase 5 foundation (step-by-step): event-level billing calculation.
   *
   * Uses core BillingEngine with current pricing catalog and filtered usage events.
   * Intentionally excludes invoice/tax/credits workflows.
   */
  async calculateUsageBilling(
    options: UsageBillingCalculationOptions = {},
  ): Promise<UsageBillingCalculationResult> {
    const catalog = this.billingPricingCatalog;
    if (!catalog) {
      throw new Error('Pricing catalog not configured. Call setPricingCatalog() first.');
    }

    const usage = await this.getUsage({
      from: options.from,
      to: options.to,
      userId: options.userId,
      workspaceId: options.workspaceId,
      product: options.product,
      eventType: options.eventType,
      adapterName: options.adapterName,
      adapterType: options.adapterType,
      groupBy: 'none',
      limit: options.limit,
      includeEvents: true,
    });

    const includeNonBillable = options.includeNonBillable === true;
    const usageEvents: UsageEvent[] = (usage.events ?? [])
      .map((event) => ({
        ...event,
        type: event.type as UsageEvent['type'],
      }))
      .filter((event) => includeNonBillable || event.billable !== false);

    const billingEngine = new BillingEngine(catalog);
    const calculation = billingEngine.calculateFromUsage(usageEvents);

    return {
      generatedAt: Date.now(),
      pricingVersion: catalog.version,
      sourceEventCount: usageEvents.length,
      includeNonBillable,
      calculation,
    };
  }

  private matchesUsageQuery(
    event: UsageEvent,
    options: EngineUsageQueryOptions,
    from: number,
    to: number,
  ): boolean {
    if (!event || typeof event !== 'object') return false;
    if (typeof event.timestamp !== 'number') return false;
    if (event.timestamp < from || event.timestamp > to) return false;

    if (options.userId && event.userId !== options.userId) return false;
    if (options.workspaceId && event.workspaceId !== options.workspaceId) return false;
    if (options.product && event.product !== options.product) return false;
    if (options.eventType && event.type !== options.eventType) return false;
    if (options.adapterName && event.adapterName !== options.adapterName) return false;
    if (options.adapterType && event.adapterType !== options.adapterType) return false;

    return true;
  }

  private resolveUsageGroupKey(
    event: UsageEvent,
    groupBy: NonNullable<EngineUsageQueryOptions['groupBy']>,
  ): string {
    if (groupBy === 'workflow') {
      return event.workflowId || 'unknown';
    }
    if (groupBy === 'adapter') {
      return event.adapterName || event.adapterType || 'unknown';
    }
    if (groupBy === 'trigger') {
      return this.resolveTriggerKey(event);
    }
    if (groupBy === 'product') {
      return event.product || 'unknown';
    }
    if (groupBy === 'workspace') {
      return event.workspaceId || 'unknown';
    }
    if (groupBy === 'user') {
      return event.userId || 'unknown';
    }
    if (groupBy === 'type') {
      return event.type || 'unknown';
    }

    const date = new Date(event.timestamp);
    if (groupBy === 'hourly') {
      return `${date.toISOString().slice(0, 13)}:00:00Z`;
    }
    if (groupBy === 'daily') {
      return date.toISOString().slice(0, 10);
    }
    if (groupBy === 'weekly') {
      const day = date.getUTCDay();
      const shift = day === 0 ? -6 : 1 - day;
      const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + shift));
      return start.toISOString().slice(0, 10);
    }

    return 'all';
  }

  private resolveTriggerKey(event: UsageEvent): string {
    if (event.type === 'usage.trigger.fire') {
      const triggerType =
        typeof event.metadata?.triggerType === 'string'
          ? event.metadata.triggerType
          : undefined;
      return triggerType || 'trigger.fire';
    }

    return 'non-trigger';
  }

  private readDailyAggregateBuckets(path: string): DailyUsageAggregateBucket[] {
    if (!existsSync(path)) {
      return [];
    }

    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as DailyUsageAggregateBucket[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private readDailyAggregationState(path: string): DailyUsageAggregationState {
    if (!existsSync(path)) {
      return {
        updatedAt: Date.now(),
      };
    }

    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as DailyUsageAggregationState;
      return {
        watermarkDay: parsed.watermarkDay,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    } catch {
      return {
        updatedAt: Date.now(),
      };
    }
  }

  private aggregateBucketKey(day: string, workspaceId: string, product: string): string {
    return `${day}|${workspaceId}|${product}`;
  }

  private readPeriodRollupBuckets(path: string): PeriodUsageRollupBucket[] {
    if (!existsSync(path)) {
      return [];
    }

    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as PeriodUsageRollupBucket[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private getUtcDayStartMs(timestamp: number): number {
    const d = new Date(timestamp);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  private getWeekStartDay(day: string): string {
    const date = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      return day;
    }

    const weekday = date.getUTCDay();
    const shift = weekday === 0 ? 6 : weekday - 1;
    date.setUTCDate(date.getUTCDate() - shift);
    return date.toISOString().slice(0, 10);
  }

  private getMonthStartDay(day: string): string {
    const date = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      return day;
    }

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  private rollupBucketKey(
    periodType: 'weekly' | 'monthly',
    periodStart: string,
    workspaceId: string,
    product: string,
  ): string {
    return `${periodType}|${periodStart}|${workspaceId}|${product}`;
  }

  /**
   * Internal logging method
   * 
   * Uses the EngineLogger with severity-based filtering and structured output.
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    // If logger is null (silent mode), skip logging
    if (!this.logger) {
      return;
    }

    // Use EngineLogger methods based on level
    switch (level) {
      case 'debug':
        this.logger.debug(message, meta);
        break;
      case 'info':
        this.logger.info(message, meta);
        break;
      case 'warn':
        this.logger.warn(message, meta);
        break;
      case 'error':
        this.logger.error(message, undefined, meta);
        break;
      default:
        // 'silent' is handled by null logger
        break;
    }
  }

  /**
   * Measure workflow execution performance with automatic severity-based logging
   * 
   * @param workflowName - Name of the workflow
   * @param fn - Execution function
   * @returns Execution result
   */
  private async measureWorkflowExecution<T>(
    workflowName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.logger) {
      return fn();
    }

    // Set thresholds for logging levels (in milliseconds)
    // - warn: workflow takes longer than 30 seconds
    // - error: workflow takes longer than 5 minutes
    return this.logger.measureExecution(
      `Workflow "${workflowName}"`,
      fn,
      { warn: 30000, error: 300000 }
    );
  }

  /**
   * Enforce runtime compatibility for workflow DSL version.
   */
  private assertWorkflowVersionSupported(workflow: ParsedWorkflow): void {
    const raw = String(workflow.version || '').trim();
    const match = raw.match(/^v?(\d+)(?:\.\d+){0,2}$/);

    if (!match) {
      throw new Error(
        `UNSUPPORTED_WORKFLOW_VERSION: Invalid workflow version format "${raw}". ` +
        'Expected semantic format like "1.0" or "1.0.0".'
      );
    }

    const major = parseInt(match[1], 10);
    if (major !== OrbytEngine.SUPPORTED_WORKFLOW_MAJOR) {
      throw new Error(
        `UNSUPPORTED_WORKFLOW_VERSION: Workflow version ${raw} is not supported. ` +
        `Supported versions: ${OrbytEngine.SUPPORTED_WORKFLOW_MAJOR}.x`
      );
    }

    if (workflow.compatibility) {
      const engineVersion = this.parseVersionTuple(this.version, 'engine version');

      if (workflow.compatibility.minVersion) {
        const minVersion = this.parseVersionTuple(workflow.compatibility.minVersion, 'compatibility.minVersion');
        if (this.compareVersionTuples(engineVersion, minVersion) < 0) {
          throw new Error(
            `UNSUPPORTED_WORKFLOW_VERSION: Engine version ${this.version} is below workflow minimum compatibility ${workflow.compatibility.minVersion}.`
          );
        }
      }

      if (workflow.compatibility.maxVersion) {
        const maxVersion = this.parseVersionTuple(workflow.compatibility.maxVersion, 'compatibility.maxVersion');
        if (this.compareVersionTuples(engineVersion, maxVersion) > 0) {
          throw new Error(
            `UNSUPPORTED_WORKFLOW_VERSION: Engine version ${this.version} exceeds workflow maximum compatibility ${workflow.compatibility.maxVersion}.`
          );
        }
      }

      if (workflow.compatibility.deprecated || workflow.deprecationInfo) {
        this.logger?.warn(
          '[OrbytEngine] Workflow compatibility metadata marks this workflow as deprecated.',
          {
            workflowVersion: workflow.version,
            compatibility: workflow.compatibility,
            deprecationInfo: workflow.deprecationInfo,
          },
        );
      }
    } else if (workflow.deprecationInfo) {
      this.logger?.warn(
        '[OrbytEngine] Workflow deprecation metadata detected.',
        {
          workflowVersion: workflow.version,
          deprecationInfo: workflow.deprecationInfo,
        },
      );
    }
  }

  private parseVersionTuple(version: string, label: string): { major: number; minor: number; patch: number } {
    const trimmed = String(version || '').trim();
    const match = trimmed.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);

    if (!match) {
      throw new Error(`UNSUPPORTED_WORKFLOW_VERSION: Invalid ${label} format "${trimmed}".`);
    }

    return {
      major: Number(match[1]),
      minor: Number(match[2] ?? '0'),
      patch: Number(match[3] ?? '0'),
    };
  }

  private compareVersionTuples(
    left: { major: number; minor: number; patch: number },
    right: { major: number; minor: number; patch: number },
  ): number {
    if (left.major !== right.major) {
      return left.major - right.major;
    }

    if (left.minor !== right.minor) {
      return left.minor - right.minor;
    }

    return left.patch - right.patch;
  }

  /**
   * Preflight adapter/action capability checks before execution.
   */
  private assertAdapterCapabilities(workflow: ParsedWorkflow): void {
    const failures: string[] = [];

    for (const step of workflow.steps) {
      const action = String(step.action || '').trim();
      const namespace = action.split('.')[0];

      if (!action || !namespace) {
        failures.push(
          `step "${step.id}": invalid action "${action}" (expected namespace.action)`
        );
        continue;
      }

      const adapter = this.adapterRegistry.get(namespace);
      if (!adapter) {
        failures.push(
          `step "${step.id}": adapter "${namespace}" is not registered (action: ${action})`
        );
        continue;
      }

      if (!adapter.supports(action)) {
        failures.push(
          `step "${step.id}": action "${action}" is not supported by adapter "${namespace}"`
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`ADAPTER_ACTION_NOT_FOUND:\n${failures.join('\n')}`);
    }
  }

}
