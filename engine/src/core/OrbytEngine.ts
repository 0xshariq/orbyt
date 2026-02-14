/**
 * Orbyt Engine - Main Public API
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

/**
 * Workflow run options
 * User-friendly options for running a workflow
 */
export interface WorkflowRunOptions {
  /**
   * Workflow input variables
   */
  variables?: Record<string, any>;
  
  /**
   * Environment variables for workflow execution
   */
  env?: Record<string, any>;
  
  /**
   * Secrets (will not be logged)
   */
  secrets?: Record<string, any>;
  
  /**
   * Additional execution context
   */
  context?: Record<string, any>;
  
  /**
   * Execution timeout in milliseconds
   */
  timeout?: number;
  
  /**
   * Continue execution even if steps fail
   */
  continueOnError?: boolean;
  
  /**
   * Dry run mode - validate and plan but don't execute
   */
  dryRun?: boolean;
  
  /**
   * Who/what triggered this execution
   */
  triggeredBy?: string;
}

/**
 * Workflow load options
 * Options for loading a workflow from file
 */
export interface WorkflowLoadOptions {
  /**
   * Base directory for resolving relative paths
   */
  baseDir?: string;
  
  /**
   * Variables to inject during parsing
   */
  variables?: Record<string, any>;
}

/**
 * OrbytEngine - Main public API
 * 
 * This is the primary interface for working with Orbyt workflows.
 * Provides a clean, user-friendly API that abstracts internal complexity.
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
    
    // Build execution options
    const execOptions: ExecutionOptions = {
      timeout: options.timeout || this.config.defaultTimeout,
      env: options.env,
      inputs: options.variables,
      secrets: options.secrets,
      context: options.context,
      continueOnError: options.continueOnError,
      triggeredBy: options.triggeredBy || 'manual',
    };
    
    this.log('info', `Running workflow: ${parsedWorkflow.name || 'unnamed'}`);
    
    // Execute workflow
    const result = await this.workflowExecutor.execute(parsedWorkflow, execOptions);
    
    this.log('info', `Workflow completed: ${result.status}`, {
      duration: result.duration,
      steps: result.metadata.totalSteps,
    });
    
    return result;
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
   * @returns True if valid, throws if invalid
   */
  async validate(workflow: string | ParsedWorkflow): Promise<boolean> {
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
   */
  private async dryRun(
    workflow: ParsedWorkflow,
    options: WorkflowRunOptions
  ): Promise<WorkflowResult> {
    this.log('info', `Dry run: ${workflow.name || 'unnamed'}`);
    
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
