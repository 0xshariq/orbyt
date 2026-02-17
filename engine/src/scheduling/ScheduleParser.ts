/**
 * Schedule Parser
 * 
 * Parses cron expressions and calculates next execution times.
 * Uses node-cron package for robust cron expression handling.
 * 
 * Format: ┌─────────────── second (optional, 0-59)
 *         │ ┌───────────── minute (0 - 59)
 *         │ │ ┌─────────── hour (0 - 23)
 *         │ │ │ ┌─────────── day of month (1 - 31)
 *         │ │ │ │ ┌───────── month (1 - 12)
 *         │ │ │ │ │ ┌─────── day of week (0 - 6) (Sunday = 0)
 *         * * * * * *
 * 
 * @module scheduling
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { LoggerManager } from '../logging/LoggerManager.js';

/**
 * Schedule parser for cron expressions
 */
export class ScheduleParser {
  /**
   * Validate cron expression using node-cron
   * 
   * @param cronExpression - Cron expression to validate
   * @returns True if valid
   */
  static isValidCron(cronExpression: string): boolean {
    return cron.validate(cronExpression);
  }
  
  /**
   * Calculate next run time from cron expression
   * Uses a simple algorithm since node-cron doesn't provide getNextRunTime
   * 
   * @param cronExpression - Cron expression
   * @param from - Start time (default: now)
   * @returns Next run time
   */
  static getNextRunTime(cronExpression: string, from: Date = new Date()): Date {
    const logger = LoggerManager.getLogger();
    
    if (!this.isValidCron(cronExpression)) {
      logger.error(`[ScheduleParser] Invalid cron expression: ${cronExpression}`);
      throw new Error(`Invalid cron expression: "${cronExpression}"`);
    }

    logger.debug(`[ScheduleParser] Calculating next run time for: ${cronExpression}`, {
      cronExpression,
      from: from.toISOString(),
    });

    // Parse cron expression (minute hour day month weekday)
    const parts = cronExpression.trim().split(/\s+/);
    
    // node-cron supports both 5-field and 6-field (with seconds) formats
    // Normalize to 5 fields for our calculation
    const fields = parts.length === 6 ? parts.slice(1) : parts;
    
    if (fields.length !== 5) {
      throw new Error(`Invalid cron expression format: "${cronExpression}"`);
    }

    return this.findNextMatch(fields, from);
  }
  
  /**
   * Find next matching time for cron fields
   */
  private static findNextMatch(fields: string[], from: Date): Date {
    const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
    
    // Start from the next minute
    const next = new Date(from);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);
    
    // Maximum iterations to prevent infinite loop
    const maxIterations = 366 * 24 * 60; // 1 year in minutes
    let iterations = 0;
    
    while (iterations < maxIterations) {
      iterations++;
      
      const minute = next.getMinutes();
      const hour = next.getHours();
      const dayOfMonth = next.getDate();
      const month = next.getMonth() + 1; // JS months are 0-indexed
      const dayOfWeek = next.getDay();
      
      // Check if current time matches all fields
      if (
        this.matchesField(minute, minuteField, 0, 59) &&
        this.matchesField(hour, hourField, 0, 23) &&
        this.matchesField(dayOfMonth, dayField, 1, 31) &&
        this.matchesField(month, monthField, 1, 12) &&
        this.matchesField(dayOfWeek, weekdayField, 0, 6)
      ) {
        return next;
      }
      
      // Advance to next minute
      next.setMinutes(next.getMinutes() + 1);
    }
    
    throw new Error('Could not find next run time (searched 1 year ahead)');
  }
  
  /**
   * Check if value matches cron field
   */
  private static matchesField(value: number, field: string, min: number, _max: number): boolean {
    // Wildcard matches everything
    if (field === '*') {
      return true;
    }
    
    // Split by comma for multiple values
    const parts = field.split(',');
    
    for (const part of parts) {
      // Handle range (e.g., "1-5")
      if (part.includes('-') && !part.includes('/')) {
        const [start, end] = part.split('-').map(Number);
        if (value >= start && value <= end) {
          return true;
        }
      }
      // Handle step (e.g., "*/5" or "10-20/2")
      else if (part.includes('/')) {
        const [range, step] = part.split('/');
        const stepNum = Number(step);
        
        if (range === '*') {
          if ((value - min) % stepNum === 0) {
            return true;
          }
        } else if (range.includes('-')) {
          const [start, end] = range.split('-').map(Number);
          if (value >= start && value <= end && (value - start) % stepNum === 0) {
            return true;
          }
        }
      }
      // Handle single value
      else {
        const fieldValue = Number(part);
        if (value === fieldValue) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get multiple future run times
   * 
   * @param cronExpression - Cron expression
   * @param count - Number of future times to get
   * @param from - Start time
   * @returns Array of future run times
   */
  static getNextRunTimes(
    cronExpression: string,
    count: number,
    from: Date = new Date()
  ): Date[] {
    const times: Date[] = [];
    let current = from;
    
    for (let i = 0; i < count; i++) {
      current = this.getNextRunTime(cronExpression, current);
      times.push(new Date(current));
    }
    
    return times;
  }
  
  /**
   * Parse interval string to milliseconds
   * Supports: "5s", "10m", "2h", "1d"
   * 
   * @param interval - Interval string
   * @returns Milliseconds
   */
  static parseInterval(interval: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(interval.trim());
    
    if (!match) {
      throw new Error(
        `Invalid interval format: "${interval}". Expected: "5s", "10m", "2h", "1d"`
      );
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }
  }
  
  /**
   * Calculate next run time for interval-based schedule
   * 
   * @param intervalMs - Interval in milliseconds
   * @param lastRun - Last run time
   * @returns Next run time
   */
  static getNextIntervalTime(intervalMs: number, lastRun?: Date): Date {
    const base = lastRun || new Date();
    return new Date(base.getTime() + intervalMs);
  }
  
  /**
   * Describe cron expression in human-readable format
   * 
   * @param cronExpression - Cron expression
   * @returns Human-readable description
   */
  static describeCron(cronExpression: string): string {
    if (!this.isValidCron(cronExpression)) {
      return 'Invalid cron expression';
    }

    // Handle common patterns
    if (cronExpression === '* * * * *') {
      return 'Every minute';
    }
    if (cronExpression === '0 * * * *') {
      return 'Every hour';
    }
    if (cronExpression === '0 0 * * *') {
      return 'Every day at midnight';
    }
    if (cronExpression === '0 0 * * 0') {
      return 'Every Sunday at midnight';
    }
    if (cronExpression === '0 0 1 * *') {
      return 'Monthly on the 1st at midnight';
    }
    
    return `Cron schedule: ${cronExpression}`;
  }
  
  /**
   * Create a scheduled task using node-cron
   * Returns a scheduled task that can be started/stopped
   * 
   * @param cronExpression - Cron expression
   * @param callback - Function to call on schedule
   * @param options - Cron task options
   * @returns Scheduled task
   */
  static createScheduledTask(
    cronExpression: string,
    callback: () => void | Promise<void>,
    options?: {
      timezone?: string;
      name?: string;
      noOverlap?: boolean;
      maxExecutions?: number;
    }
  ): ScheduledTask {
    const task = cron.schedule(cronExpression, callback, {
      timezone: options?.timezone,
      name: options?.name,
      noOverlap: options?.noOverlap,
      maxExecutions: options?.maxExecutions,
    });
    return task;
  }
}

/**
 * Common cron expressions
 */
export const CommonCronExpressions = {
  /** Every minute */
  EVERY_MINUTE: '* * * * *',
  
  /** Every 5 minutes */
  EVERY_5_MINUTES: '*/5 * * * *',
  
  /** Every 15 minutes */
  EVERY_15_MINUTES: '*/15 * * * *',
  
  /** Every 30 minutes */
  EVERY_30_MINUTES: '*/30 * * * *',
  
  /** Every hour */
  EVERY_HOUR: '0 * * * *',
  
  /** Every day at midnight */
  DAILY: '0 0 * * *',
  
  /** Every day at noon */
  DAILY_NOON: '0 12 * * *',
  
  /** Every week on Sunday at midnight */
  WEEKLY: '0 0 * * 0',
  
  /** Every month on the 1st at midnight */
  MONTHLY: '0 0 1 * *',
} as const;
