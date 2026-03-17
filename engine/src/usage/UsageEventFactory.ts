/**
 * Usage Event Factory
 * 
 * Helper utilities for creating consistent usage events.
 * Handles ID generation, timestamps, and defaults.
 * 
 * @module usage
 */

import { randomBytes } from 'node:crypto';
import type { UsageEvent, UsageEventType, UsageEventMetadata } from '@dev-ecosystem/core';

/**
 * Generate a unique event ID
 * 
 * Uses random UUID-like format for distributed uniqueness.
 * Format: timestamp-random (millisecond precision + random suffix)
 */
export function generateUsageEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Create a workflow run usage event
 */
export function createWorkflowRunEvent(options: {
  executionId: string;
  workflowId?: string;
  userId?: string;
  workspaceId?: string;
  metadata?: UsageEventMetadata;
  executionMode?: string;
  pricingTier?: string;
  billable?: boolean;
}): UsageEvent {
  return {
    id: generateUsageEventId(),
    type: 'usage.workflow.run',
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: options.executionId,
    workflowId: options.workflowId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    executionMode: options.executionMode,
    pricingTier: options.pricingTier,
    billable: options.billable ?? true,
    metadata: options.metadata ?? {
      success: true,
    },
  };
}

/**
 * Create a step execution usage event
 */
export function createStepExecuteEvent(options: {
  executionId: string;
  stepId: string;
  workflowId?: string;
  userId?: string;
  workspaceId?: string;
  adapterType?: string;
  adapterName?: string;
  durationMs?: number;
  success?: boolean;
  retries?: number;
  error?: string;
  metadata?: UsageEventMetadata;
  pricingTier?: string;
  billable?: boolean;
}): UsageEvent {
  return {
    id: generateUsageEventId(),
    type: 'usage.step.execute',
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: options.executionId,
    stepId: options.stepId,
    workflowId: options.workflowId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    adapterType: options.adapterType,
    adapterName: options.adapterName,
    pricingTier: options.pricingTier,
    billable: options.billable ?? true,
    metadata: {
      ...options.metadata,
      durationMs: options.durationMs,
      success: options.success ?? true,
      retries: options.retries ?? 0,
      ...(options.error && { error: options.error }),
    },
  };
}

/**
 * Create an adapter call usage event
 */
export function createAdapterCallEvent(options: {
  executionId: string;
  stepId?: string;
  adapterType: string;
  adapterName?: string;
  workflowId?: string;
  userId?: string;
  workspaceId?: string;
  durationMs?: number;
  success?: boolean;
  retries?: number;
  error?: string;
  metadata?: UsageEventMetadata;
  pricingTier?: string;
  billable?: boolean;
}): UsageEvent {
  return {
    id: generateUsageEventId(),
    type: 'usage.adapter.call',
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: options.executionId,
    stepId: options.stepId,
    workflowId: options.workflowId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    adapterType: options.adapterType,
    adapterName: options.adapterName,
    pricingTier: options.pricingTier,
    billable: options.billable ?? true,
    metadata: {
      ...options.metadata,
      durationMs: options.durationMs,
      success: options.success ?? true,
      retries: options.retries ?? 0,
      ...(options.error && { error: options.error }),
    },
  };
}

/**
 * Create a trigger fire usage event
 */
export function createTriggerFireEvent(options: {
  executionId: string;
  workflowId?: string;
  userId?: string;
  workspaceId?: string;
  metadata?: UsageEventMetadata;
  pricingTier?: string;
  billable?: boolean;
}): UsageEvent {
  return {
    id: generateUsageEventId(),
    type: 'usage.trigger.fire',
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: options.executionId,
    workflowId: options.workflowId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    pricingTier: options.pricingTier,
    billable: options.billable ?? true,
    metadata: options.metadata ?? {
      success: true,
    },
  };
}
