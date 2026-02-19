/**
 * Context Store
 * 
 * Manages execution context state during workflow runtime.
 * Stores variables, step outputs, and execution metadata.
 * 
 * @module context
 */

import { ContextConfig, ResolutionContext } from "../types/core-types.js";


/**
 * Context Store
 * Thread-safe context management for workflow execution
 */
export class ContextStore {
    private executionId: string;
    private workflowId: string;
    private workflowName: string;
    private version?: string;
    private description?: string;
    private tags?: string[];
    private owner?: string;
    private env: Record<string, any>;
    private inputs: Record<string, any>;
    private secrets: Record<string, any>;
    private stepOutputs = new Map<string, any>();
    private customContext: Record<string, any>;
    private metadata?: {
        createdAt?: string;
        updatedAt?: string;
        annotations?: Record<string, any>;
    };
    private attempt: number;
    private startTime: Date;
    private triggeredBy?: string;

    constructor(config: ContextConfig) {
        this.executionId = config.executionId;
        this.workflowId = config.workflowId;
        this.workflowName = config.workflowName;
        this.version = config.version;
        this.description = config.description;
        this.tags = config.tags;
        this.owner = config.owner;
        this.env = config.env || {};
        this.inputs = config.inputs || {};
        this.secrets = config.secrets || {};
        this.customContext = config.context || {};
        this.metadata = config.metadata;
        this.attempt = 1;
        this.startTime = new Date();
        this.triggeredBy = config.triggeredBy;
    }

    /**
     * Get resolution context for variable resolver
     */
    getResolutionContext(): ResolutionContext {
        return {
            env: this.env,
            steps: this.stepOutputs,
            workflow: {
                id: this.workflowId,
                name: this.workflowName,
                version: this.version,
                description: this.description,
                tags: this.tags,
                owner: this.owner,
            },
            run: {
                id: this.executionId,
                timestamp: this.startTime,
                attempt: this.attempt,
                startedAt: this.startTime,
                triggeredBy: this.triggeredBy,
            },
            inputs: this.inputs,
            secrets: this.secrets,
            context: this.customContext,
            metadata: this.metadata,
        };
    }

    /**
     * Store step output
     */
    setStepOutput(stepId: string, output: any): void {
        this.stepOutputs.set(stepId, output);
    }

    /**
     * Get step output by ID
     */
    getStepOutput(stepId: string): any {
        return this.stepOutputs.get(stepId);
    }

    /**
     * Get all step outputs
     */
    getAllStepOutputs(): Map<string, any> {
        return new Map(this.stepOutputs);
    }

    /**
     * Set input  variable
     */
    setInput(key: string, value: any): void {
        this.inputs[key] = value;
    }

    /**
     * Get input variable
     */
    getInput(key: string): any {
        return this.inputs[key];
    }

    /**
     * Get all inputs
     */
    getAllInputs(): Record<string, any> {
        return { ...this.inputs };
    }

    /**
     * Set secret value
     */
    setSecret(key: string, value: any): void {
        this.secrets[key] = value;
    }

    /**
     * Get secret value
     */
    getSecret(key: string): any {
        return this.secrets[key];
    }

    /**
     * Set environment variable
     */
    setEnv(key: string, value: any): void {
        this.env[key] = value;
    }

    /**
     * Get environment variable
     */
    getEnv(key: string): any {
        return this.env[key];
    }

    /**
     * Set custom context data
     */
    setContext(key: string, value: any): void {
        this.customContext[key] = value;
    }

    /**
     * Get custom context data
     */
    getContext(key: string): any {
        return this.customContext[key];
    }

    /**
     * Increment retry attempt counter
     */
    incrementAttempt(): void {
        this.attempt++;
    }

    /**
     * Get current attempt number
     */
    getAttempt(): number {
        return this.attempt;
    }

    /**
     * Get execution metadata
     */
    getMetadata() {
        return {
            executionId: this.executionId,
            workflowId: this.workflowId,
            workflowName: this.workflowName,
            version: this.version,
            description: this.description,
            tags: this.tags,
            owner: this.owner,
            attempt: this.attempt,
            startTime: this.startTime,
            elapsedMs: Date.now() - this.startTime.getTime(),
            triggeredBy: this.triggeredBy,
        };
    }

    /**
     * Clear all step outputs (useful for retry scenarios)
     */
    clearStepOutputs(): void {
        this.stepOutputs.clear();
    }

    /**
     * Create a snapshot of current context state
     */
    snapshot() {
        return {
            executionId: this.executionId,
            workflowId: this.workflowId,
            workflowName: this.workflowName,
            version: this.version,
            description: this.description,
            tags: this.tags ? [...this.tags] : undefined,
            owner: this.owner,
            env: { ...this.env },
            inputs: { ...this.inputs },
            secrets: { ...this.secrets },
            stepOutputs: new Map(this.stepOutputs),
            customContext: { ...this.customContext },
            metadata: this.metadata ? { ...this.metadata } : undefined,
            attempt: this.attempt,
            startTime: new Date(this.startTime),
            triggeredBy: this.triggeredBy,
        };
    }

    /**
     * Restore context from snapshot
     */
    restore(snapshot: ReturnType<ContextStore['snapshot']>): void {
        this.executionId = snapshot.executionId;
        this.workflowId = snapshot.workflowId;
        this.workflowName = snapshot.workflowName;
        this.version = snapshot.version;
        this.description = snapshot.description;
        this.tags = snapshot.tags ? [...snapshot.tags] : undefined;
        this.owner = snapshot.owner;
        this.env = { ...snapshot.env };
        this.inputs = { ...snapshot.inputs };
        this.secrets = { ...snapshot.secrets };
        this.stepOutputs = new Map(snapshot.stepOutputs);
        this.customContext = { ...snapshot.customContext };
        this.metadata = snapshot.metadata ? { ...snapshot.metadata } : undefined;
        this.attempt = snapshot.attempt;
        this.startTime = new Date(snapshot.startTime);
        this.triggeredBy = snapshot.triggeredBy;
    }
}
