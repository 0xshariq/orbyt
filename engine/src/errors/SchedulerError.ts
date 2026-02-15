/**
 * Scheduler Error
 * 
 * Structured error for workflow scheduler failures.
 * Used for cron triggers, scheduled workflows, and scheduling conflicts.
 * 
 * Exit codes:
 * - VALIDATION_FAILED: Invalid cron expression or schedule config
 * - MISSING_CONFIG: Schedule not found
 * - INTERNAL_ERROR: Scheduler internal error
 * 
 * @module errors
 */

import { ExitCodes } from '@dev-ecosystem/core';
import { OrbytError } from './OrbytError.js';
import { ErrorSeverity } from './ErrorCodes.js';

/**
 * Scheduler error codes
 * Note: These are engine-specific and may be added to ecosystem-core in the future
 */
export enum SchedulerErrorCode {
  /** Invalid cron expression */
  INVALID_CRON_EXPRESSION = 'ORBYT-SCH-001',
  
  /** Schedule conflict */
  SCHEDULE_CONFLICT = 'ORBYT-SCH-002',
  
  /** Scheduler not initialized */
  SCHEDULER_NOT_INITIALIZED = 'ORBYT-SCH-003',
  
  /** Workflow scheduling failed */
  WORKFLOW_SCHEDULE_FAILED = 'ORBYT-SCH-004',
  
  /** Schedule not found */
  SCHEDULE_NOT_FOUND = 'ORBYT-SCH-005',
}

/**
 * Scheduler-specific error context
 */
export interface SchedulerErrorContext {
  /** Cron expression if applicable */
  cronExpression?: string;
  
  /** Workflow path being scheduled */
  workflowPath?: string;
  
  /** Schedule ID */
  scheduleId?: string;
  
  /** Trigger type (cron, event, webhook) */
  triggerType?: string;
  
  /** Next scheduled run time */
  nextRun?: Date;
  
  /** Additional context */
  [key: string]: any;
}

/**
 * Scheduler Error class
 */
export class SchedulerError extends OrbytError {
  public readonly scheduleId?: string;
  public readonly cronExpression?: string;
  
  constructor(params: {
    code: SchedulerErrorCode;
    message: string;
    scheduleId?: string;
    cronExpression?: string;
    context?: Partial<SchedulerErrorContext>;
    hint?: string;
    cause?: Error;
    exitCode?: ExitCodes;
  }) {
    super({
      code: params.code as any,
      message: params.message,
      exitCode: params.exitCode || SchedulerError.getExitCode(params.code),
      severity: SchedulerError.determineSeverity(params.code),
      context: {
        scheduleId: params.scheduleId,
        cronExpression: params.cronExpression,
        causeMessage: params.cause?.message,
        ...params.context,
      },
      hint: params.hint,
    });
    
    this.scheduleId = params.scheduleId;
    this.cronExpression = params.cronExpression;
  }
  
  /**
   * Determine exit code based on scheduler error code
   */
  private static getExitCode(code: SchedulerErrorCode): ExitCodes {
    switch (code) {
      case SchedulerErrorCode.INVALID_CRON_EXPRESSION:
        return ExitCodes.VALIDATION_FAILED;
      
      case SchedulerErrorCode.SCHEDULE_NOT_FOUND:
        return ExitCodes.MISSING_CONFIG;
      
      case SchedulerErrorCode.SCHEDULE_CONFLICT:
        return ExitCodes.VALIDATION_FAILED;
      
      default:
        return ExitCodes.INTERNAL_ERROR;
    }
  }
  
  /**
   * Determine severity based on error code
   */
  private static determineSeverity(code: SchedulerErrorCode): ErrorSeverity {
    switch (code) {
      case SchedulerErrorCode.INVALID_CRON_EXPRESSION:
      case SchedulerErrorCode.SCHEDULE_NOT_FOUND:
        return ErrorSeverity.ERROR;
      
      case SchedulerErrorCode.SCHEDULER_NOT_INITIALIZED:
      case SchedulerErrorCode.WORKFLOW_SCHEDULE_FAILED:
        return ErrorSeverity.ERROR;
      
      case SchedulerErrorCode.SCHEDULE_CONFLICT:
        return ErrorSeverity.WARNING;
      
      default:
        return ErrorSeverity.ERROR;
    }
  }
  
  /**
   * Factory: Invalid cron expression
   */
  static invalidCronExpression(expression: string, reason?: string): SchedulerError {
    return new SchedulerError({
      code: SchedulerErrorCode.INVALID_CRON_EXPRESSION,
      message: `Invalid cron expression: "${expression}"${reason ? ` - ${reason}` : ''}`,
      cronExpression: expression,
      hint: 'Cron expression must follow standard cron syntax: "minute hour day month weekday"',
    });
  }
  
  /**
   * Factory: Schedule conflict
   */
  static scheduleConflict(scheduleId: string, workflowPath: string): SchedulerError {
    return new SchedulerError({
      code: SchedulerErrorCode.SCHEDULE_CONFLICT,
      message: `Schedule conflict for workflow: ${workflowPath}`,
      scheduleId,
      context: { workflowPath },
      hint: 'A workflow with the same schedule ID already exists. Use a different ID or remove the existing schedule.',
    });
  }
  
  /**
   * Factory: Scheduler not initialized
   */
  static notInitialized(): SchedulerError {
    return new SchedulerError({
      code: SchedulerErrorCode.SCHEDULER_NOT_INITIALIZED,
      message: 'Workflow scheduler is not initialized',
      hint: 'Enable the scheduler in engine configuration: { enableScheduler: true }',
    });
  }
  
  /**
   * Factory: Workflow scheduling failed
   */
  static schedulingFailed(workflowPath: string, cause: Error): SchedulerError {
    return new SchedulerError({
      code: SchedulerErrorCode.WORKFLOW_SCHEDULE_FAILED,
      message: `Failed to schedule workflow: ${workflowPath}`,
      context: { workflowPath },
      cause,
      hint: 'Check the workflow definition and cron trigger configuration.',
    });
  }
  
  /**
   * Factory: Schedule not found
   */
  static notFound(scheduleId: string): SchedulerError {
    return new SchedulerError({
      code: SchedulerErrorCode.SCHEDULE_NOT_FOUND,
      message: `Schedule not found: ${scheduleId}`,
      scheduleId,
      hint: 'Verify that the schedule ID is correct and the schedule exists.',
    });
  }
}
