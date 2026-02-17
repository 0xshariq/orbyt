/**
 * Explanation Module
 * 
 * Provides comprehensive workflow execution explanations.
 * Always generates explanations before execution to ensure full transparency.
 * 
 * @module explanation
 */

export { ExplanationGenerator } from './ExplanationGenerator.js';
export { ExplanationLogger } from './ExplanationLogger.js';
export type {
    ExplainedStep,
    ExecutionExplanation,
    ExplanationEvent,
} from './ExplanationTypes.js';
