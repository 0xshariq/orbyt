/**
 * Cron Scheduler
 * 
 * Time-based workflow scheduler using node-cron for robust scheduling.
 * Each schedule gets its own cron task for efficient, event-driven execution.
 * 
 * @module scheduling
 */

import { type ScheduledTask } from 'node-cron';
import { TriggerType } from '@dev-ecosystem/core';
import { ScheduleParser } from './ScheduleParser.js';
import { CronSchedulerConfig, ScheduleExecution, SchedulerEventListeners, ScheduleStatus, WorkflowSchedule } from '../types/core-types.js';
import { isScheduleExpired, shouldScheduleRun } from './ScheduleTypes.js';


/**
 * Cron scheduler for time-based workflow triggers
 * Uses node-cron for efficient, event-driven scheduling
 */
export class CronScheduler {
  private schedules = new Map<string, WorkflowSchedule>();
  private cronTasks = new Map<string, ScheduledTask>();
  private intervalTimers = new Map<string, NodeJS.Timeout>();
  private executions = new Map<string, ScheduleExecution>();
  private running = false;
  private readonly config: Required<CronSchedulerConfig>;
  private readonly listeners: SchedulerEventListeners;
  private currentExecutions = new Set<string>();

  constructor(
    config: CronSchedulerConfig = {},
    listeners: SchedulerEventListeners = {}
  ) {
    this.config = {
      enabled: config.enabled ?? true,
      maxConcurrent: config.maxConcurrent ?? 10,
      defaultTimezone: config.defaultTimezone ?? 'UTC',
    };
    this.listeners = listeners;
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Scheduler is already running');
    }

    this.running = true;
    await this.listeners.onStart?.();

    // Start all existing tasks
    for (const schedule of this.schedules.values()) {
      if (schedule.status === 'active') {
        this.startScheduleTask(schedule);
      }
    }
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop all cron tasks
    for (const task of this.cronTasks.values()) {
      task.stop();
    }
    this.cronTasks.clear();

    // Clear all interval timers
    for (const timer of this.intervalTimers.values()) {
      clearTimeout(timer);
    }
    this.intervalTimers.clear();

    await this.listeners.onStop?.();
  }

  /**
   * Add schedule to scheduler
   */
  async addSchedule(schedule: WorkflowSchedule): Promise<void> {
    // Calculate next run time if not set
    if (!schedule.nextRunAt) {
      schedule.nextRunAt = this.calculateNextRunTime(schedule);
    }

    this.schedules.set(schedule.id, schedule);

    // Start task if scheduler is running and schedule is active
    if (this.running && schedule.status === 'active') {
      this.startScheduleTask(schedule);
    }
  }

  /**
   * Remove schedule from scheduler
   */
  async removeSchedule(scheduleId: string): Promise<boolean> {
    // Stop and remove task
    this.stopScheduleTask(scheduleId);
    
    return this.schedules.delete(scheduleId);
  }

  /**
   * Get schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<WorkflowSchedule | null> {
    return this.schedules.get(scheduleId) || null;
  }

  /**
   * Get all schedules
   */
  async getAllSchedules(): Promise<WorkflowSchedule[]> {
    return Array.from(this.schedules.values());
  }

  /**
   * Update schedule status
   */
  async updateScheduleStatus(scheduleId: string, status: ScheduleStatus): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    schedule.status = status;
    schedule.updatedAt = new Date();

    // Start or stop task based on status
    if (this.running) {
      if (status === 'active') {
        this.startScheduleTask(schedule);
      } else {
        this.stopScheduleTask(scheduleId);
      }
    }
  }

  /**
   * Start scheduling task for a schedule
   */
  private startScheduleTask(schedule: WorkflowSchedule): void {
    // Stop existing task if any
    this.stopScheduleTask(schedule.id);

    switch (schedule.triggerType) {
      case TriggerType.Cron:
        this.startCronTask(schedule);
        break;
      case 'interval':
        this.startIntervalTask(schedule);
        break;
      case 'once':
        this.startOnceTask(schedule);
        break;
      case TriggerType.Manual:
        // Manual triggers don't need a task
        break;
      case TriggerType.Event:
      case TriggerType.Webhook:
        // Event and webhook triggers are handled elsewhere
        console.warn(`Trigger type ${schedule.triggerType} should be handled by event system, not scheduler`);
        break;
      default:
        console.warn(`Unknown trigger type for schedule ${schedule.id}: ${schedule.triggerType}`);
    }
  }

  /**
   * Start cron-based task
   */
  private startCronTask(schedule: WorkflowSchedule): void {
    if (!schedule.cron) {
      throw new Error(`Cron expression required for cron trigger: ${schedule.id}`);
    }

    const task = ScheduleParser.createScheduledTask(
      schedule.cron,
      () => this.handleScheduleTrigger(schedule),
      { timezone: schedule.timezone || this.config.defaultTimezone }
    );

    this.cronTasks.set(schedule.id, task);
    task.start();
  }

  /**
   * Start interval-based task
   */
  private startIntervalTask(schedule: WorkflowSchedule): void {
    if (!schedule.intervalMs) {
      throw new Error(`Interval required for interval trigger: ${schedule.id}`);
    }

    const executeAndScheduleNext = () => {
      this.handleScheduleTrigger(schedule).finally(() => {
        // Schedule next execution
        if (this.running && schedule.status === 'active') {
          const timer = setTimeout(executeAndScheduleNext, schedule.intervalMs!);
          this.intervalTimers.set(schedule.id, timer);
        }
      });
    };

    // Calculate delay until first execution
    const now = Date.now();
    const nextRun = schedule.nextRunAt?.getTime() || now;
    const delay = Math.max(0, nextRun - now);

    const timer = setTimeout(executeAndScheduleNext, delay);
    this.intervalTimers.set(schedule.id, timer);
  }

  /**
   * Start one-time task
   */
  private startOnceTask(schedule: WorkflowSchedule): void {
    const executeAt = schedule.startDate || schedule.nextRunAt;
    if (!executeAt) {
      throw new Error(`Start date required for once trigger: ${schedule.id}`);
    }

    const now = Date.now();
    const delay = Math.max(0, executeAt.getTime() - now);

    const timer = setTimeout(() => {
      this.handleScheduleTrigger(schedule).then(() => {
        // Mark as expired after execution
        schedule.status = 'expired';
        schedule.updatedAt = new Date();
      });
    }, delay);

    this.intervalTimers.set(schedule.id, timer);
  }

  /**
   * Stop scheduling task for a schedule
   */
  private stopScheduleTask(scheduleId: string): void {
    // Stop cron task
    const cronTask = this.cronTasks.get(scheduleId);
    if (cronTask) {
      cronTask.stop();
      this.cronTasks.delete(scheduleId);
    }

    // Clear interval timer
    const timer = this.intervalTimers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.intervalTimers.delete(scheduleId);
    }
  }

  /**
   * Handle schedule trigger
   */
  private async handleScheduleTrigger(schedule: WorkflowSchedule): Promise<void> {
    // Skip if not enabled
    if (!this.config.enabled) {
      return;
    }

    const now = new Date();

    // Check if schedule should run
    if (!shouldScheduleRun(schedule, now)) {
      return;
    }

    // Check concurrency limit
    if (this.currentExecutions.size >= this.config.maxConcurrent) {
      console.warn(`Max concurrent executions reached (${this.config.maxConcurrent}), skipping schedule: ${schedule.id}`);
      return;
    }

    // Skip if previous run still running (if configured)
    if (schedule.options?.skipIfRunning) {
      const hasRunning = Array.from(this.executions.values()).some(
        exec => exec.scheduleId === schedule.id && exec.status === 'running'
      );
      if (hasRunning) {
        return;
      }
    }

    // Trigger execution
    await this.triggerSchedule(schedule);
  }

  /**
   * Trigger schedule execution
   */
  private async triggerSchedule(schedule: WorkflowSchedule): Promise<void> {
    // Create execution record
    const execution: ScheduleExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      scheduledAt: schedule.nextRunAt!,
      startedAt: new Date(),
      status: 'running',
    };

    this.executions.set(execution.id, execution);
    this.currentExecutions.add(execution.id);

    // Update schedule
    schedule.lastRunAt = new Date();
    schedule.executionCount++;
    schedule.nextRunAt = this.calculateNextRunTime(schedule);
    schedule.updatedAt = new Date();

    // Check if schedule should be expired
    if (isScheduleExpired(schedule)) {
      schedule.status = 'expired';
      this.stopScheduleTask(schedule.id);
    }

    // Trigger workflow execution
    try {
      await this.listeners.onScheduleTrigger?.(schedule, execution);
      
      // Execution completes (handler should update execution)
      execution.completedAt = new Date();
      execution.status = 'completed';
      execution.durationMs = execution.completedAt.getTime() - execution.startedAt.getTime();
      
      await this.listeners.onExecutionComplete?.(execution);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      execution.error = err;
      execution.completedAt = new Date();
      execution.status = 'failed';
      execution.durationMs = execution.completedAt.getTime() - execution.startedAt.getTime();
      
      await this.listeners.onExecutionFailed?.(execution, err);
    } finally {
      this.currentExecutions.delete(execution.id);
    }
  }

  /**
   * Calculate next run time for schedule
   */
  private calculateNextRunTime(schedule: WorkflowSchedule): Date {
    const now = new Date();

    switch (schedule.triggerType) {
      case TriggerType.Cron:
        if (!schedule.cron) {
          throw new Error(`Cron expression required for cron trigger: ${schedule.id}`);
        }
        return ScheduleParser.getNextRunTime(schedule.cron, schedule.lastRunAt || now);

      case 'interval':
        if (!schedule.intervalMs) {
          throw new Error(`Interval required for interval trigger: ${schedule.id}`);
        }
        return ScheduleParser.getNextIntervalTime(schedule.intervalMs, schedule.lastRunAt);

      case 'once':
        // One-time schedules don't have a next run (handle via startDate)
        return schedule.startDate || now;

      case TriggerType.Manual:
      case TriggerType.Event:
      case TriggerType.Webhook:
        // Manual, event, and webhook triggers don't have scheduled times
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now

      default:
        throw new Error(`Unknown trigger type: ${schedule.triggerType}`);
    }
  }

  /**
   * Get schedule execution history
   */
  async getExecutionHistory(scheduleId?: string): Promise<ScheduleExecution[]> {
    const executions = Array.from(this.executions.values());
    
    if (scheduleId) {
      return executions.filter(exec => exec.scheduleId === scheduleId);
    }
    
    return executions;
  }

  /**
   * Get currently running executions
   */
  async getRunningExecutions(): Promise<ScheduleExecution[]> {
    return Array.from(this.executions.values()).filter(exec => exec.status === 'running');
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    return {
      running: this.running,
      totalSchedules: this.schedules.size,
      activeSchedules: Array.from(this.schedules.values()).filter(s => s.status === 'active').length,
      activeCronTasks: this.cronTasks.size,
      activeIntervalTasks: this.intervalTimers.size,
      currentExecutions: this.currentExecutions.size,
      totalExecutions: this.executions.size,
    };
  }

  /**
   * Manually trigger a schedule (bypasses schedule checks)
   */
  async manualTrigger(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    await this.triggerSchedule(schedule);
  }
}
