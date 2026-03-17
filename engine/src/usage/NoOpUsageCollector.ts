/**
 * No-Op Usage Collector
 * 
 * Default usage collector that silently drops all events.
 * Used when no collector is configured.
 * 
 * This ensures:
 * - No execution blocking
 * - No external dependencies required
 * - Zero cost if usage tracking is not enabled
 * 
 * @module usage
 */

import type { UsageCollector, UsageEvent } from '@dev-ecosystem/core';

/**
 * No-operation usage collector
 * 
 * Implements the UsageCollector interface but does nothing with events.
 * Used as the default collector when none is explicitly configured.
 */
export class NoOpUsageCollector implements UsageCollector {
  /**
   * Record a single usage event (does nothing)
   */
  async record(_event: UsageEvent): Promise<void> {
    // No-op
  }

  /**
   * Record multiple usage events in batch (does nothing)
   */
  async recordBatch(_events: UsageEvent[]): Promise<void> {
    // No-op
  }

  /**
   * Flush pending events (does nothing)
   */
  async flush(): Promise<void> {
    // No-op
  }
}
