/**
 * Explanation Types
 * 
 * Type definitions for workflow execution explanations.
 * These structures represent a complete analysis of what the engine will do.
 * 
 * @module explanation
 */

/**
 * Explained step - A single step in the execution plan with all resolved configuration
 */
export interface ExplainedStep {
    /** Step ID */
    id: string;

    /** Step name (human-readable) */
    name?: string;

    /** Adapter being used (e.g., "shell", "http", "mediaproc") */
    adapter: string;

    /** Action to execute (e.g., "shell.exec", "http.request") */
    uses: string;

    /** Dependencies - which steps must complete before this one */
    needs: string[];

    /** Execution condition (if any) */
    when?: string;

    /** Timeout configuration */
    timeout?: string | number;

    /** Retry configuration */
    retry?: {
        max?: number;
        backoff?: 'linear' | 'exponential';
        delay?: number;
        count?: number; // Runtime state, not from definition
    };

    /** Whether to continue workflow if this step fails */
    continueOnError?: boolean;

    /** Input parameters */
    with?: Record<string, any>;

    /** Environment variables */
    env?: Record<string, any>;

    /** Expected outputs */
    outputs?: Record<string, any>;

    /** Secrets used by this step */
    secretsUsed?: string[];

    /** Workflow inputs referenced in this step */
    inputsReferenced?: string[];
}

/**
 * Execution explanation - Complete plan of what the engine will do
 */
export interface ExecutionExplanation {
    /** Workflow name */
    workflowName?: string;

    /** Workflow description */
    description?: string;

    /** Workflow version */
    version: string;

    /** Workflow kind */
    kind: string;

    /** Total number of steps */
    stepCount: number;

    /** Execution strategy (sequential or parallel) */
    executionStrategy: 'sequential' | 'parallel' | 'mixed';

    /** All steps in execution order */
    steps: ExplainedStep[];

    /** Whether the workflow has circular dependencies */
    hasCycles: boolean;

    /** Cycle details (if any) */
    cycles?: string[][];

    /** Total estimated phases (for parallel execution) */
    phases?: number;

    /** Dependency graph in adjacency list format */
    dependencyGraph?: Record<string, string[]>;

    /** Workflow inputs (parameters the workflow accepts) */
    inputs?: Record<string, any>;

    /** Secrets being used (keys only, no values) */
    secrets?: {
        vault?: string;
        keys?: string[];
    };

    /** Context variables (environment) */
    context?: Record<string, any>;

    /** Workflow outputs */
    outputs?: Record<string, string>;

    /** Default configurations */
    defaults?: {
        timeout?: string;
        adapter?: string;
    };

    /** Execution policies */
    policies?: {
        failure?: 'stop' | 'continue' | 'isolate';
        concurrency?: number;
        sandbox?: 'none' | 'basic' | 'strict';
    };

    /** Unique adapters used in this workflow */
    adaptersUsed: string[];

    /** Adapter actions breakdown (e.g., { "shell": ["exec"], "http": ["request"] }) */
    adapterActions?: Record<string, string[]>;

    /** Required workflow inputs */
    requiredInputs?: string[];

    /** Optional workflow inputs with defaults */
    optionalInputs?: Record<string, any>;

    /** Annotations (AI/UI hints) */
    annotations?: Record<string, any>;

    /** Tags */
    tags?: string[];

    /** Owner */
    owner?: string;

    /** Metadata about workflow complexity */
    complexity?: {
        totalSteps: number;
        maxDepth: number;
        parallelizableSteps: number;
        sequentialSteps: number;
    };

    /** Data flow prediction - how data moves through the workflow */
    dataFlow?: DataFlowPrediction[];

    /** Conditional path analysis - all possible execution paths */
    conditionalPaths?: ConditionalPathAnalysis;

    /** Execution time estimation - predicted duration */
    timeEstimation?: ExecutionTimeEstimation;
}

/**
 * Data flow prediction for a step
 * Shows what data flows in and out of each step
 */
export interface DataFlowPrediction {
    /** Step ID */
    step: string;

    /** Step name */
    stepName?: string;

    /** Input data sources */
    inputs: {
        /** Source of the data */
        source: 'workflow.inputs' | 'step.output' | 'context' | 'secrets' | 'env' | 'static';
        /** Variable/field key */
        key: string;
        /** Source step ID (if from step.output) */
        sourceStep?: string;
        /** Inferred type */
        type?: string;
        /** Sample value (for static/default values) */
        example?: any;
    }[];

    /** Output data */
    outputs: {
        /** Output key */
        key: string;
        /** Inferred type */
        type?: string;
        /** Steps that consume this output */
        usedBy: string[];
    }[];

    /** Whether this step has unresolved dependencies */
    hasUnresolvedDependencies: boolean;
}

/**
 * Conditional path analysis
 * Analyzes all possible execution paths based on conditions
 */
export interface ConditionalPathAnalysis {
    /** Total number of possible paths */
    totalPaths: number;

    /** All execution paths */
    paths: {
        /** Path description */
        description: string;
        /** Conditions that must be true for this path */
        conditions: string[];
        /** Steps executed in this path */
        stepsExecuted: string[];
        /** Steps skipped in this path */
        stepsSkipped: string[];
        /** Likelihood of this path */
        likelihood: 'always' | 'likely' | 'possible' | 'unlikely' | 'never';
    }[];

    /** Steps with conditions */
    conditionalSteps: {
        step: string;
        condition: string;
        canBeSkipped: boolean;
    }[];

    /** Steps that are never reachable */
    unreachableSteps: string[];

    /** Steps that always execute */
    alwaysExecutes: string[];
}

/**
 * Execution time estimation
 * Predicts how long the workflow will take
 */
export interface ExecutionTimeEstimation {
    /** Total estimated time */
    total: {
        /** Best case scenario (ms) */
        min: number;
        /** Average expected time (ms) */
        avg: number;
        /** Worst case scenario (ms) */
        max: number;
    };

    /** Estimated time by execution phase */
    byPhase: {
        /** Phase number */
        phase: number;
        /** Steps in this phase */
        steps: string[];
        /** Duration estimate (ms) */
        duration: {
            min: number;
            avg: number;
            max: number;
        };
    }[];

    /** Critical path - longest dependency chain */
    criticalPath: {
        /** Steps in the critical path */
        steps: string[];
        /** Total duration of critical path (ms) */
        duration: number;
    };

    /** Performance bottlenecks */
    bottlenecks: {
        /** Step ID */
        step: string;
        /** Reason it's a bottleneck */
        reason: string;
        /** Estimated impact if optimized (ms saved) */
        impact: number;
    }[];

    /** Time estimates per step */
    byStep: {
        step: string;
        min: number;
        avg: number;
        max: number;
        /** Whether this step is on the critical path */
        onCriticalPath: boolean;
    }[];
}

/**
 * Explanation event - Logged to EngineLogger
 */
export interface ExplanationEvent {
    /** Event type */
    type: 'explanation';

    /** Explanation timestamp */
    timestamp: Date;

    /** Full explanation */
    explanation: ExecutionExplanation;
}
