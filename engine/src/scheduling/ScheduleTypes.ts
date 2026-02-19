/**
 * Scheduler Types
 * 
 * Type definitions for workflow scheduling system.
 * Supports cron-based scheduling, one-time execution, and recurring jobs.
 * Uses TriggerType from @dev-ecosystem/core for consistency.
 * 
 * @module scheduling
 */

import { CreateScheduleInput, WorkflowSchedule } from "../types/core-types.js";

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
