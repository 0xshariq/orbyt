/**
 * Scheduler Types
 * 
 * Type definitions for workflow scheduling system.
 * Supports cron-based scheduling, one-time execution, and recurring jobs.
 * Uses TriggerType from @dev-ecosystem/core for consistency.
 * 
 * @module scheduling
 */

import { TriggerType } from '@dev-ecosystem/core';

/**
 * Schedule status
 */
export type ScheduleStatus =
    | 'active'   // Schedule is running
    | 'paused'   // Schedule is temporarily disabled
    | 'disabled' // Schedule is permanently disabled
    | 'expired'; // Schedule has passed its end date

/**
 * Extended schedule trigger type for internal scheduling
 * Includes core TriggerType values and internal scheduling types
 */
export type ScheduleTriggerType =
    | TriggerType           // Core trigger types: Manual, Cron, Event, Webhook
    | 'interval'            // Fixed interval (internal only)
    | 'once';               // One-time execution (internal only)

/**
 * Workflow schedule configuration
 */
export interface WorkflowSchedule {
    /** Unique schedule ID */
    id: string;

    /** Workflow ID to execute */
    workflowId: string;

    /** Schedule name */
    name?: string;

    /** Schedule description */
    description?: string;

    /** Trigger type */
    triggerType: ScheduleTriggerType;

    /** Cron expression (for cron trigger) */
    cron?: string;

    /** Interval in milliseconds (for interval trigger) */
    intervalMs?: number;

    /** Timezone for schedule (default: UTC) */
    timezone?: string;

    /** Schedule status */
    status: ScheduleStatus;

    /** When schedule was created */
    createdAt: Date;

    /** When schedule was last updated */
    updatedAt: Date;

    /** Last execution timestamp */
    lastRunAt?: Date;

    /** Next scheduled execution timestamp */
    nextRunAt?: Date;

    /** Start date (schedule won't run before this) */
    startDate?: Date;

    /** End date (schedule won't run after this) */
    endDate?: Date;

    /** Maximum number of executions (undefined = unlimited) */
    maxExecutions?: number;

    /** Current execution count */
    executionCount: number;

    /** Input data to pass to workflow */
    input?: Record<string, any>;

    /** Schedule metadata */
    metadata?: Record<string, any>;

    /** Execution options */
    options?: ScheduleOptions;
}

/**
 * Schedule execution options
 */
export interface ScheduleOptions {
    /** Skip if previous run is still running */
    skipIfRunning?: boolean;

    /** Maximum concurrent executions allowed */
    maxConcurrent?: number;

    /** Timeout for single execution (ms) */
    timeoutMs?: number;

    /** Retry failed executions */
    retry?: {
        max: number;
        delayMs: number;
    };

    /** Handle missed runs when scheduler restarts */
    catchUpMissedRuns?: boolean;
}

/**
 * Schedule execution record
 */
export interface ScheduleExecution {
    /** Execution ID */
    id: string;

    /** Schedule ID */
    scheduleId: string;

    /** Workflow ID */
    workflowId: string;

    /** Scheduled time */
    scheduledAt: Date;

    /** Actual start time */
    startedAt: Date;

    /** Completion time */
    completedAt?: Date;

    /** Execution status */
    status: 'running' | 'completed' | 'failed' | 'timeout';

    /** Execution result */
    result?: any;

    /** Error if failed */
    error?: Error;

    /** Duration in milliseconds */
    durationMs?: number;
}

/**
 * Schedule creation input
 */
export interface CreateScheduleInput {
    /** Workflow ID */
    workflowId: string;

    /** Schedule name */
    name?: string;

    /** Description */
    description?: string;

    /** Trigger type */
    triggerType: ScheduleTriggerType;

    /** Cron expression (required for cron trigger) */
    cron?: string;

    /** Interval in milliseconds (required for interval trigger) */
    intervalMs?: number;

    /** Timezone for schedule */
    timezone?: string;

    /** Start date */
    startDate?: Date;

    /** End date */
    endDate?: Date;

    /** Max executions */
    maxExecutions?: number;

    /** Input data */
    input?: Record<string, any>;

    /** Options */
    options?: ScheduleOptions;
    
    /** Event source (for event triggers) */
    eventSource?: string;
    
    /** Webhook endpoint (for webhook triggers) */
    webhookEndpoint?: string;
}

/**
 * Create a new schedule
 */
export function createSchedule(input: CreateScheduleInput): WorkflowSchedule {
    const now = new Date();

    return {
        id: generateScheduleId(),
        workflowId: input.workflowId,
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        cron: input.cron,
        intervalMs: input.intervalMs,
        timezone: input.timezone || 'UTC',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        executionCount: 0,
        startDate: input.startDate,
        endDate: input.endDate,
        maxExecutions: input.maxExecutions,
        input: input.input,
        options: input.options,
    };
}

/**
 * Generate unique schedule ID
 */
function generateScheduleId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Check if schedule should run at given time
 */
export function shouldScheduleRun(schedule: WorkflowSchedule, now: Date = new Date()): boolean {
    // Check if schedule is active
    if (schedule.status !== 'active') {
        return false;
    }

    // Check start date
    if (schedule.startDate && now < schedule.startDate) {
        return false;
    }

    // Check end date
    if (schedule.endDate && now > schedule.endDate) {
        return false;
    }

    // Check max executions
    if (schedule.maxExecutions !== undefined && schedule.executionCount >= schedule.maxExecutions) {
        return false;
    }

    // Check if it's time to run
    if (schedule.nextRunAt && now >= schedule.nextRunAt) {
        return true;
    }

    return false;
}

/**
 * Check if schedule has expired
 */
export function isScheduleExpired(schedule: WorkflowSchedule, now: Date = new Date()): boolean {
    // Check end date
    if (schedule.endDate && now > schedule.endDate) {
        return true;
    }

    // Check max executions
    if (schedule.maxExecutions !== undefined && schedule.executionCount >= schedule.maxExecutions) {
        return true;
    }

    return false;
}
