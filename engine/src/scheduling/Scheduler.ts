/**
 * Scheduler
 * 
 * Central scheduling engine that handles all trigger types:
 * - Manual: Direct user invocation
 * - Cron: Time-based scheduling using CronScheduler
 * - Event: Event-driven execution
 * - Webhook: HTTP webhook triggers
 * - Job: Queue-based job execution using JobScheduler
 * 
 * @module scheduling
 */

import { TriggerType } from '@dev-ecosystem/core';
import { CronScheduler, type SchedulerEventListeners } from './CronScheduler.js';
import { JobScheduler } from './JobScheduler.js';
import type { WorkflowSchedule, ScheduleExecution, CreateScheduleInput } from './ScheduleTypes.js';
import { createSchedule } from './ScheduleTypes.js';
import type { JobQueue } from '../queue/JobQueue.js';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Cron scheduler configuration */
  cron?: {
    enabled?: boolean;
    maxConcurrent?: number;
    defaultTimezone?: string;
  };
  
  /** Job scheduler configuration */
  job?: {
    workerCount?: number;
    maxConcurrent?: number;
  };
  
  /** Event handler configuration */
  event?: {
    enabled?: boolean;
  };
  
  /** Webhook configuration */
  webhook?: {
    enabled?: boolean;
    port?: number;
  };
}

/**
 * Workflow execution handler
 */
export type WorkflowExecutionHandler = (
  schedule: WorkflowSchedule,
  execution: ScheduleExecution
) => Promise<void> | void;

/**
 * Event trigger
 */
export interface EventTrigger {
  source: string;
  filters?: Record<string, any>;
  data?: any;
}

/**
 * Webhook trigger
 */
export interface WebhookTrigger {
  endpoint: string;
  method: string;
  body?: any;
  headers?: Record<string, string>;
}

/**
 * Central Scheduler
 * Orchestrates all scheduling mechanisms
 */
export class Scheduler {
  private cronScheduler: CronScheduler;
  private jobScheduler: JobScheduler;
  private schedules = new Map<string, WorkflowSchedule>();
  private eventHandlers = new Map<string, Set<string>>(); // event source -> schedule IDs
  private webhookHandlers = new Map<string, Set<string>>(); // endpoint -> schedule IDs
  private workflowHandler?: WorkflowExecutionHandler;
  private readonly config: Required<SchedulerConfig>;

  constructor(
    jobQueue: JobQueue,
    config: SchedulerConfig = {},
    workflowHandler?: WorkflowExecutionHandler
  ) {
    this.config = {
      cron: {
        enabled: config.cron?.enabled ?? true,
        maxConcurrent: config.cron?.maxConcurrent ?? 10,
        defaultTimezone: config.cron?.defaultTimezone ?? 'UTC',
      },
      job: {
        workerCount: config.job?.workerCount ?? 4,
        maxConcurrent: config.job?.maxConcurrent ?? 10,
      },
      event: {
        enabled: config.event?.enabled ?? true,
      },
      webhook: {
        enabled: config.webhook?.enabled ?? true,
        port: config.webhook?.port ?? 3000,
      },
    };

    this.workflowHandler = workflowHandler;

    // Initialize schedulers
    const listeners: SchedulerEventListeners = {
      onScheduleTrigger: async (schedule, execution) => {
        await this.executeWorkflow(schedule, execution);
      },
    };

    this.cronScheduler = new CronScheduler(this.config.cron, listeners);
    this.jobScheduler = new JobScheduler(jobQueue, this.config.job);
  }

  /**
   * Start all schedulers
   */
  async start(): Promise<void> {
    await this.cronScheduler.start();
    await this.jobScheduler.start();
  }

  /**
   * Stop all schedulers
   */
  async stop(): Promise<void> {
    await this.cronScheduler.stop();
    await this.jobScheduler.stop();
  }

  /**
   * Add schedule to appropriate scheduler based on trigger type
   */
  async addSchedule(input: CreateScheduleInput): Promise<WorkflowSchedule> {
    const schedule = createSchedule(input);
    this.schedules.set(schedule.id, schedule);

    switch (schedule.triggerType) {
      case TriggerType.Cron:
        await this.cronScheduler.addSchedule(schedule);
        break;

      case 'interval':
      case 'once':
        // Also handled by CronScheduler
        await this.cronScheduler.addSchedule(schedule);
        break;

      case TriggerType.Event:
        // Register event handler
        if (this.config.event.enabled && input.eventSource) {
          if (!this.eventHandlers.has(input.eventSource)) {
            this.eventHandlers.set(input.eventSource, new Set());
          }
          this.eventHandlers.get(input.eventSource)!.add(schedule.id);
        }
        break;

      case TriggerType.Webhook:
        // Register webhook handler
        if (this.config.webhook.enabled && input.webhookEndpoint) {
          if (!this.webhookHandlers.has(input.webhookEndpoint)) {
            this.webhookHandlers.set(input.webhookEndpoint, new Set());
          }
          this.webhookHandlers.get(input.webhookEndpoint)!.add(schedule.id);
        }
        break;

      case TriggerType.Manual:
        // Manual triggers don't need automatic scheduling
        break;

      default:
        console.warn(`Unknown trigger type: ${schedule.triggerType}`);
    }

    return schedule;
  }

  /**
   * Remove schedule
   */
  async removeSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      return false;
    }

    // Remove from appropriate scheduler
    switch (schedule.triggerType) {
      case TriggerType.Cron:
      case 'interval':
      case 'once':
        await this.cronScheduler.removeSchedule(scheduleId);
        break;

      case TriggerType.Event:
        // Remove event handler
        for (const [source, scheduleIds] of this.eventHandlers) {
          scheduleIds.delete(scheduleId);
          if (scheduleIds.size === 0) {
            this.eventHandlers.delete(source);
          }
        }
        break;

      case TriggerType.Webhook:
        // Remove webhook handler
        for (const [endpoint, scheduleIds] of this.webhookHandlers) {
          scheduleIds.delete(scheduleId);
          if (scheduleIds.size === 0) {
            this.webhookHandlers.delete(endpoint);
          }
        }
        break;
    }

    return this.schedules.delete(scheduleId);
  }

  /**
   * Manually trigger a schedule
   */
  async triggerManual(scheduleId: string, input?: Record<string, any>): Promise<ScheduleExecution> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const execution: ScheduleExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      scheduledAt: new Date(),
      startedAt: new Date(),
      status: 'running',
    };

    // Override input if provided
    if (input) {
      schedule.input = { ...schedule.input, ...input };
    }

    await this.executeWorkflow(schedule, execution);
    return execution;
  }

  /**
   * Trigger schedules for an event
   */
  async triggerEvent(trigger: EventTrigger): Promise<ScheduleExecution[]> {
    if (!this.config.event.enabled) {
      return [];
    }

    const scheduleIds = this.eventHandlers.get(trigger.source);
    if (!scheduleIds || scheduleIds.size === 0) {
      return [];
    }

    const executions: ScheduleExecution[] = [];

    for (const scheduleId of scheduleIds) {
      const schedule = this.schedules.get(scheduleId);
      if (!schedule || schedule.status !== 'active') {
        continue;
      }

      // TODO: Apply filters if configured
      
      const execution: ScheduleExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        scheduledAt: new Date(),
        startedAt: new Date(),
        status: 'running',
      };

      // Merge event data with schedule input
      schedule.input = { ...schedule.input, event: trigger.data };

      await this.executeWorkflow(schedule, execution);
      executions.push(execution);
    }

    return executions;
  }

  /**
   * Trigger schedules for a webhook
   */
  async triggerWebhook(trigger: WebhookTrigger): Promise<ScheduleExecution[]> {
    if (!this.config.webhook.enabled) {
      return [];
    }

    const scheduleIds = this.webhookHandlers.get(trigger.endpoint);
    if (!scheduleIds || scheduleIds.size === 0) {
      return [];
    }

    const executions: ScheduleExecution[] = [];

    for (const scheduleId of scheduleIds) {
      const schedule = this.schedules.get(scheduleId);
      if (!schedule || schedule.status !== 'active') {
        continue;
      }

      const execution: ScheduleExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        scheduledAt: new Date(),
        startedAt: new Date(),
        status: 'running',
      };

      // Merge webhook data with schedule input
      schedule.input = { 
        ...schedule.input, 
        webhook: {
          method: trigger.method,
          body: trigger.body,
          headers: trigger.headers,
        }
      };

      await this.executeWorkflow(schedule, execution);
      executions.push(execution);
    }

    return executions;
  }

  /**
   * Queue a job for execution
   */
  async queueJob(scheduleId: string, input?: Record<string, any>): Promise<string> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Override input if provided
    const jobInput = input ? { ...schedule.input, ...input } : schedule.input;

    return await this.jobScheduler.enqueueJob(schedule.workflowId, jobInput);
  }

  /**
   * Execute workflow (called by schedulers)
   */
  private async executeWorkflow(
    schedule: WorkflowSchedule,
    execution: ScheduleExecution
  ): Promise<void> {
    if (this.workflowHandler) {
      await this.workflowHandler(schedule, execution);
    } else {
      console.warn(`No workflow handler configured for execution: ${execution.id}`);
    }
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
   * Get schedules by trigger type
   */
  async getSchedulesByType(triggerType: TriggerType | 'interval' | 'once'): Promise<WorkflowSchedule[]> {
    return Array.from(this.schedules.values()).filter(s => s.triggerType === triggerType);
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    return {
      totalSchedules: this.schedules.size,
      cronSchedules: this.cronScheduler.getStats(),
      jobScheduler: this.jobScheduler.getStats(),
      eventHandlers: this.eventHandlers.size,
      webhookHandlers: this.webhookHandlers.size,
    };
  }

  /**
   * Set workflow execution handler
   */
  setWorkflowHandler(handler: WorkflowExecutionHandler): void {
    this.workflowHandler = handler;
  }
}
