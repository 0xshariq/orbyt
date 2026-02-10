/**
 * Automation Layer
 * 
 * Provides retry policies, backoff strategies, failure handling,
 * and timeout management for reliable workflow execution.
 * 
 * This is PHASE 2 of the Orbyt execution roadmap.
 * 
 * @module automation
 */

export * from './BackoffStrategy.js';
export * from './FailureStrategy.js';
export * from './RetryPolicy.js';
export * from './TimeoutManager.js';
export * from './runtime/index.js';