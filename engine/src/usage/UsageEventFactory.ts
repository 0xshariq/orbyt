/**
 * Usage Event Factory
 * 
 * Helper utilities for creating consistent usage events.
 * Handles ID generation, timestamps, and defaults.
 * 
 * @module usage
 */

import { randomBytes } from 'node:crypto';
import type { UsageEvent, UsageEventMetadata } from '@dev-ecosystem/core';
import { UsageEventType as CoreUsageEventType } from '@dev-ecosystem/core';

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
 * Generate a default idempotency key for usage ingestion deduplication.
 *
 * Keys are stable for the event object lifetime and unique per generated event.
 */
export function generateUsageIdempotencyKey(
  eventType: CoreUsageEventType,
  executionId: string,
  eventId: string,
): string {
  return `${eventType}:${executionId}:${eventId}`;
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
  idempotencyKey?: string;
}): UsageEvent {
  const id = generateUsageEventId();
  return {
    id,
    type: CoreUsageEventType.WORKFLOW_RUN,
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: options.executionId,
    workflowId: options.workflowId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    executionMode: options.executionMode,
    pricingTier: options.pricingTier,
    billable: options.billable ?? true,
    idempotencyKey: options.idempotencyKey
      ?? generateUsageIdempotencyKey(CoreUsageEventType.WORKFLOW_RUN, options.executionId, id),
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
  idempotencyKey?: string;
}): UsageEvent {
  const id = generateUsageEventId();
  const success = options.success ?? !options.error;
  return {
    id,
    type: CoreUsageEventType.STEP_EXECUTE,
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
    idempotencyKey: options.idempotencyKey
      ?? generateUsageIdempotencyKey(CoreUsageEventType.STEP_EXECUTE, options.executionId, id),
    metadata: {
      ...options.metadata,
      durationMs: options.durationMs,
      success,
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
  idempotencyKey?: string;
}): UsageEvent {
  const id = generateUsageEventId();
  const success = options.success ?? !options.error;
  return {
    id,
    type: CoreUsageEventType.ADAPTER_CALL,
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
    idempotencyKey: options.idempotencyKey
      ?? generateUsageIdempotencyKey(CoreUsageEventType.ADAPTER_CALL, options.executionId, id),
    metadata: {
      ...options.metadata,
      durationMs: options.durationMs,
      success,
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
  idempotencyKey?: string;
}): UsageEvent {
  const id = generateUsageEventId();
  return {
    id,
    type: CoreUsageEventType.TRIGGER_FIRE,
    timestamp: Date.now(),
    product: 'orbyt',
    executionId: options.executionId,
    workflowId: options.workflowId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    pricingTier: options.pricingTier,
    billable: options.billable ?? true,
    idempotencyKey: options.idempotencyKey
      ?? generateUsageIdempotencyKey(CoreUsageEventType.TRIGGER_FIRE, options.executionId, id),
    metadata: options.metadata ?? {
      success: true,
    },
  };
}
