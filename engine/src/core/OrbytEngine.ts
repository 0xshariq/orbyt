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
 * - @orbyt/cli (Official CLI)
 * - @orbyt/api (Official API Server)
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
 *   - Workflow definitions (YAML)
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

import { readFile } from 'fs/promises';
import YAML from 'yaml';
import type { OrbytEngineConfig, LogLevel } from './EngineConfig.js';
import { applyConfigDefaults, validateConfig } from './EngineConfig.js';
import type { EngineContext } from './EngineContext.js';
import { createEngineContext } from './EngineContext.js';
import { ExecutionEngine } from '../execution/ExecutionEngine.js';
import { StepExecutor } from '../execution/StepExecutor.js';
import { WorkflowExecutor } from '../execution/WorkflowExecutor.js';
import { WorkflowParser, type ParsedWorkflow } from '../parser/WorkflowParser.js';
import type { WorkflowResult, ExecutionOptions } from '../execution/WorkflowExecutor.js';
import { EventBus } from '../events/EventBus.js';
import { HookManager } from '../hooks/HookManager.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import type { Adapter } from '@dev-ecosystem/core';
import type { LifecycleHook } from '../hooks/LifecycleHooks.js';
import { EngineEventType, createEvent } from '../events/EngineEvents.js';
import { CLIAdapter, ShellAdapter, HTTPAdapter, FSAdapter } from '../adapters/builtins/index.js';
import { InternalContextBuilder, type OwnershipContext } from '../execution/InternalExecutionContext.js';
import { IntentAnalyzer } from '../execution/IntentAnalyzer.js';
import { ExecutionStrategyResolver, ExecutionStrategyGuard } from '../execution/ExecutionStrategyResolver.js';
import { WorkflowLoadOptions, WorkflowRunOptions } from '../types/core-types.js';

/**
 * OrbytEngine - Main public API
 * 
 * ARCHITECTURE & TRUST BOUNDARIES
 * =================
 * 
 * This class defines the ONLY public API surface for the Orbyt Engine.
 * It establishes clear trust boundaries between different consumers:
 * 
 * TRUSTED FIRST-PARTY CONSUMERS (Direct Access):
 * -----------------------------------------------
 * - @orbyt/cli (Official CLI)
 * - @orbyt/api (Official API Server)
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
 *   - Workflow definitions (YAML)
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
 * This is the primary interface for working with Orbyt workflows.
 * Provides a clean, user-friendly API that abstracts internal complexity.
 * 
 * SECURITY & ARCHITECTURE:
 * =================
 * This class is the SINGLE ENTRY POINT for all workflow execution.
 * All execution paths (run, validate, dryRun) go through this engine.
 * 
 * INTERNAL CONTEXT INJECTION:
 * - Engine ALWAYS creates internal execution context
 * - Users CANNOT override billing, identity, or ownership fields
 * - Context sanitization removes any injection attempts
 * - Billing tracking is engine-controlled, never user-controlled
 * 
 * FIELDS THAT ARE NEVER USER-CONTROLLED:
 * - executionId, runId, traceId (identity)
 * - userId, workspaceId, subscriptionId (ownership)
 * - billingId, pricingTier, costCalculated (billing)
 * - usage counters, step counts, duration (metrics)
 * - security policies, permissions (access control)
 * 
 * WORKFLOW YAML vs ENGINE RUNTIME:
 * - User controls: business logic, step definitions, parameters
 * - Engine controls: billing, identity, execution tracking, security
 * - Clear separation prevents billing manipulation and security bypass
 * 
 * @example
 * ```ts
 * // Basic usage
 * const engine = new OrbytEngine();
 * const result = await engine.run('./workflow.yaml');
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
 * const result = await engine.run('./workflow.yaml', {
 *   variables: { inputFile: './data.json' },
 *   timeout: 60000,
 *   dryRun: false
 * });
 * 
 * // From bridge/API with ownership context
 * const result = await engine.run('./workflow.yaml', {
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
  private config: ReturnType<typeof applyConfigDefaults>;
  private executionEngine: ExecutionEngine;
  private stepExecutor: StepExecutor;
  private workflowExecutor: WorkflowExecutor;
  private eventBus: EventBus;
  private hookManager: HookManager;
  private adapterRegistry: AdapterRegistry;
  private context: EngineContext;
  private isStarted: boolean = false;
  private readonly version: string = '0.1.2';

  constructor(config: OrbytEngineConfig = {}) {
    // Validate and apply defaults
    validateConfig(config);
    this.config = applyConfigDefaults(config);

    // Initialize event system
    this.eventBus = new EventBus();
    this.hookManager = new HookManager();
    this.adapterRegistry = new AdapterRegistry();

    // Initialize executors
    this.stepExecutor = new StepExecutor();
    this.workflowExecutor = new WorkflowExecutor(this.stepExecutor);

    // Initialize execution engine
    this.executionEngine = new ExecutionEngine({
      maxConcurrentExecutions: this.config.maxConcurrentWorkflows,
      defaultTimeout: this.config.defaultTimeout,
      enableScheduler: this.config.enableScheduler,
      queue: this.config.queue,
      retryPolicy: this.config.retryPolicy,
      timeoutManager: this.config.timeoutManager,
    });

    // Wire components together
    this.setupComponents();

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
  }

  /**
   * Run a workflow
   * 
   * Main method for executing workflows. Accepts either a file path or
   * a parsed workflow object.
   * 
   * @param workflow - Workflow file path, YAML string, or parsed workflow
   * @param options - Execution options
   * @returns Workflow execution result
   * 
   * @example
   * ```ts
   * // Run from file
   * const result = await engine.run('./workflow.yaml');
   * 
   * // Run with options
   * const result = await engine.run('./workflow.yaml', {
   *   variables: { input: 'data.json' },
   *   timeout: 30000
   * });
   * 
   * // Run from string
   * const yaml = `
   * name: my-workflow
   * steps:
   *   - id: step1
   *     uses: shell.exec
   *     with:
   *       command: echo "Hello"
   * `;
   * const result = await engine.run(yaml);
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

    // SECURITY: Sanitize user context to prevent injection of internal fields
    const sanitizedOptions = this.sanitizeUserOptions(options);

    // Create internal execution context (billing, ownership, audit)
    // This is NEVER user-controlled - engine injects it
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

    // Load/parse workflow if needed
    let parsedWorkflow: ParsedWorkflow;

    if (typeof workflow === 'string') {
      // Check if it's a file path or YAML string
      if (workflow.endsWith('.yaml') || workflow.endsWith('.yml')) {
        parsedWorkflow = await this.loadWorkflow(workflow);
      } else {
        parsedWorkflow = this.parseWorkflow(workflow);
      }
    } else {
      parsedWorkflow = workflow;
    }

    // Handle dry-run mode
    if (options.dryRun || this.config.mode === 'dry-run') {
      return this.dryRun(parsedWorkflow, options);
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

    // 3. Safety Guard: Check if safe to execute
    const safetyCheck = ExecutionStrategyGuard.isSafeToExecute(strategyContext);
    if (!safetyCheck.safe) {
      this.log('warn', `Execution safety check failed: ${safetyCheck.reason}`);
      // Foundation: Log only, don't block execution
      // Future: Can block or delay execution based on policy
    }

    // ============================================================================
    // END INTELLIGENCE LAYERS
    // ============================================================================

    // Build execution options
    const execOptions: ExecutionOptions = {
      timeout: sanitizedOptions.timeout || this.config.defaultTimeout,
      env: sanitizedOptions.env,
      inputs: sanitizedOptions.variables,
      secrets: sanitizedOptions.secrets,
      context: {
        ...sanitizedOptions.context,
        _internal: internalContext, // Inject internal context (engine-only)
      },
      continueOnError: sanitizedOptions.continueOnError,
      triggeredBy: sanitizedOptions.triggeredBy || 'manual',
    };

    this.log('info', `Running workflow: ${parsedWorkflow.name || 'unnamed'}`);

    // Execute workflow
    const result = await this.workflowExecutor.execute(parsedWorkflow, execOptions);

    // Update usage counters after execution
    internalContext._usage.stepCount = result.metadata.totalSteps;
    internalContext._usage.durationSeconds = result.duration / 1000;
    // Calculate weighted step count (future: based on actual step weights)
    internalContext._usage.weightedStepCount = result.metadata.totalSteps;

    this.log('info', `Workflow completed: ${result.status}`, {
      duration: result.duration,
      steps: result.metadata.totalSteps,
      billable: internalContext._billing.isBillable,
      automationCount: internalContext._usage.automationCount,
      stepCount: internalContext._usage.stepCount,
    });

    // Call billing lifecycle hook
    await this.onWorkflowBillingComplete(internalContext, result);

    return result;
  }

  /**
   * Sanitize user-provided options to prevent injection attacks
   * SECURITY: Users should never be able to override internal fields
   */
  private sanitizeUserOptions(options: WorkflowRunOptions): WorkflowRunOptions {
    const sanitized = { ...options };

    // Remove any attempts to inject internal fields through context
    if (sanitized.context) {
      const cleanContext = { ...sanitized.context };

      // Remove internal fields that users should never control
      delete (cleanContext as any)._internal;
      delete (cleanContext as any)._identity;
      delete (cleanContext as any)._ownership;
      delete (cleanContext as any)._billing;
      delete (cleanContext as any)._billingSnapshot;
      delete (cleanContext as any)._usage;
      delete (cleanContext as any)._audit;
      delete (cleanContext as any).executionId;
      delete (cleanContext as any).runId;
      delete (cleanContext as any).billingId;
      delete (cleanContext as any).subscriptionId;
      delete (cleanContext as any).userId;
      delete (cleanContext as any).workspaceId;

      sanitized.context = cleanContext;

      this.log('debug', 'User context sanitized - removed internal fields');
    }

    // Validate ownership context is only set by trusted sources (bridge/API)
    if (sanitized._ownershipContext) {
      // Future: Add authentication check here
      // For now, allow it (assuming CLI/local mode)
      this.log('debug', 'Ownership context provided by caller');
    }

    return sanitized;
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
   * Load a workflow from file
   * 
   * @param filePath - Path to workflow file
   * @param options - Load options
   * @returns Parsed workflow
   */
  async loadWorkflow(
    filePath: string,
    options: WorkflowLoadOptions = {}
  ): Promise<ParsedWorkflow> {
    this.log('debug', `Loading workflow from: ${filePath}`);

    // Read file content
    const content = await readFile(filePath, 'utf-8');

    // Parse workflow
    const parsed = this.parseWorkflow(content);

    // Apply variables from options if provided
    if (options.variables && parsed.inputs) {
      // Merge provided variables with workflow inputs
      parsed.inputs = { ...parsed.inputs, ...options.variables };
    }

    return parsed;
  }

  /**
   * Parse a workflow from YAML string
   * 
   * @param yaml - YAML workflow definition
   * @returns Parsed workflow
   */
  parseWorkflow(yaml: string): ParsedWorkflow {
    this.log('debug', 'Parsing workflow');

    // Validate YAML syntax first for better error messages
    try {
      YAML.parse(yaml);
    } catch (error) {
      throw new Error(
        `Invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Use WorkflowParser for full validation and parsing
    return WorkflowParser.parse(yaml);
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
    options?: { _ownershipContext?: Partial<OwnershipContext> }
  ): Promise<boolean> {
    // Create internal context for tracking validations (non-billable)
    const internalContext = InternalContextBuilder.build(
      this.version,
      { ...(options?._ownershipContext || {}), subscriptionTier: 'free' }
    );

    this.log('debug', 'Validating workflow', {
      executionId: internalContext._identity.executionId,
    });

    let parsedWorkflow: ParsedWorkflow;

    if (typeof workflow === 'string') {
      if (workflow.endsWith('.yaml') || workflow.endsWith('.yml')) {
        parsedWorkflow = await this.loadWorkflow(workflow);
      } else {
        parsedWorkflow = this.parseWorkflow(workflow);
      }
    } else {
      parsedWorkflow = workflow;
    }

    // Parsing itself validates schema
    // Additional validation could be added here

    this.log('info', `Workflow validated: ${parsedWorkflow.name || 'unnamed'}`);
    return true;
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
    this.adapterRegistry.register(adapter);
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
   * Internal logging method
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    if (this.config.logLevel === 'silent') {
      return;
    }

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];
    const currentLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level);

    if (messageLevel >= currentLevel) {
      const prefix = `[Orbyt:${level.toUpperCase()}]`;
      if (meta) {
        console.log(prefix, message, meta);
      } else {
        console.log(prefix, message);
      }
    }
  }
}
