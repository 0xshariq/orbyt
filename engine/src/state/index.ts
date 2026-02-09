/**
 * State Management
 * 
 * Provides state tracking and state machine for workflow execution:
 * - ExecutionState: State interfaces and enums for tracking execution
 * - StateMachine: Enforces valid state transitions with validation
 * 
 * This enables:
 * - Real-time execution tracking
 * - Resume/recovery capabilities
 * - Audit trails
 * - State integrity validation
 */

export * from './ExecutionState.js';
export * from './StateMachine.js';
