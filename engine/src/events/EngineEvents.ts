/**
 * Event Types and Interfaces for Orbyt Engine
 * 
 * The event system enables observability and extensibility by emitting
 * events at critical lifecycle moments. These events can be consumed by:
 * - Logging systems
 * - Metrics collectors
 * - Monitoring dashboards
 * - External integrations
 * - Workflow triggers (event-driven automation)
 */

import { EngineEventType, OrbytEvent } from "../types/core-types.js";



/**
 * Helper to create well-formed events
 */
export function createEvent<T = any>(
  type: string | EngineEventType,
  payload?: T,
  context?: { workflowId?: string; stepId?: string; runId?: string }
): OrbytEvent<T> {
  return {
    type,
    timestamp: Date.now(),
    workflowId: context?.workflowId,
    stepId: context?.stepId,
    runId: context?.runId,
    payload,
  };
}
