/**
 * Step Error
 * 
 * Structured error for step-level execution failures.
 * Provides detailed context about which step failed and why.
 * 
 * Exit codes:
 * - STEP_FAILED: General step execution failure
 * - TIMEOUT: Step timeout
 * - VALIDATION_FAILED: Invalid step configuration
 * - DEPENDENCY_FAILED: Dependency not met
 * 
 * @module errors
 */

import { ExitCodes } from '@dev-ecosystem/core';
import { OrbytError } from './OrbytError.js';
import { ErrorSeverity } from './ErrorCodes.js';

/**
 * Step error codes from ecosystem-core
 */
export enum StepErrorCode {
  /** Step not found in workflow */
  STEP_NOT_FOUND = 'ORBYT-STEP-001',
  
  /** Step execution timeout */
  STEP_TIMEOUT = 'ORBYT-STEP-002',
  
  /** Step execution failed */
  STEP_EXECUTION_FAILED = 'ORBYT-STEP-003',
  
  /** Step dependency not met */
  STEP_DEPENDENCY_FAILED = 'ORBYT-STEP-004',
  
  /** Invalid step configuration */
  STEP_CONFIG_INVALID = 'ORBYT-STEP-005',
  
  /** Duplicate step ID */
  STEP_DUPLICATE_ID = 'ORBYT-STEP-006',
  
  /** Step condition evaluation failed */
  STEP_CONDITION_FAILED = 'ORBYT-STEP-007',
  
  /** Step output mapping failed */
  STEP_OUTPUT_MAPPING_FAILED = 'ORBYT-STEP-008',
}

/**
 * Step-specific error context
 */
export interface StepErrorContext {
  /** Step ID where error occurred */
  stepId: string;
  
  /** Step name (human-readable) */
  stepName?: string;
  
  /** Action being executed */
  action?: string;
  
  /** Step index in workflow */
  stepIndex?: number;
  
  /** Input parameters that were used */
  inputs?: Record<string, any>;
  
  /** Dependencies that were not met */
  missingDependencies?: string[];
  
  /** Timeout duration if applicable */
  timeoutDuration?: string;
  
  /** Exit code if available */
  exitCode?: number;
  
  /** Additional context */
  [key: string]: any;
}

/**
 * Step Error class
 */
export class StepError extends OrbytError {
  public readonly stepId: string;
  public readonly stepName?: string;
  public readonly action?: string;
  
  constructor(params: {
    code: StepErrorCode;
    message: string;
    stepId: string;
    stepName?: string;
    action?: string;
    context?: Partial<StepErrorContext>;
    hint?: string;
    cause?: Error;
    exitCode?: ExitCodes;
  }) {
    super({
      code: params.code as any,
      message: params.message,
      exitCode: params.exitCode || StepError.getExitCode(params.code),
      severity: StepError.determineSeverity(params.code),
      context: {
        stepId: params.stepId,
        stepName: params.stepName,
        action: params.action,
        causeMessage: params.cause?.message,
        ...params.context,
      },
      hint: params.hint,
    });
    
    this.stepId = params.stepId;
    this.stepName = params.stepName;
    this.action = params.action;
  }
  
  /**
   * Determine exit code based on step error code
   */
  private static getExitCode(code: StepErrorCode): ExitCodes {
    switch (code) {
      case StepErrorCode.STEP_NOT_FOUND:
      case StepErrorCode.STEP_CONFIG_INVALID:
      case StepErrorCode.STEP_DUPLICATE_ID:
        return ExitCodes.VALIDATION_FAILED;
      
      case StepErrorCode.STEP_TIMEOUT:
        return ExitCodes.TIMEOUT;
      
      case StepErrorCode.STEP_DEPENDENCY_FAILED:
        return ExitCodes.DEPENDENCY_FAILED;
      
      case StepErrorCode.STEP_EXECUTION_FAILED:
        return ExitCodes.STEP_FAILED;
      
      case StepErrorCode.STEP_CONDITION_FAILED:
      case StepErrorCode.STEP_OUTPUT_MAPPING_FAILED:
        return ExitCodes.STEP_FAILED;
      
      default:
        return ExitCodes.STEP_FAILED;
    }
  }
  
  /**
   * Determine severity based on error code
   */
  private static determineSeverity(code: StepErrorCode): ErrorSeverity {
    switch (code) {
      case StepErrorCode.STEP_NOT_FOUND:
      case StepErrorCode.STEP_CONFIG_INVALID:
      case StepErrorCode.STEP_DUPLICATE_ID:
        return ErrorSeverity.ERROR;
      
      case StepErrorCode.STEP_TIMEOUT:
      case StepErrorCode.STEP_EXECUTION_FAILED:
      case StepErrorCode.STEP_DEPENDENCY_FAILED:
        return ErrorSeverity.ERROR;
      
      case StepErrorCode.STEP_CONDITION_FAILED:
      case StepErrorCode.STEP_OUTPUT_MAPPING_FAILED:
        return ErrorSeverity.WARNING;
      
      default:
        return ErrorSeverity.ERROR;
    }
  }
  
  /**
   * Factory: Step not found
   */
  static notFound(stepId: string, workflowName?: string): StepError {
    return new StepError({
      code: StepErrorCode.STEP_NOT_FOUND,
      message: `Step "${stepId}" not found in workflow${workflowName ? ` "${workflowName}"` : ''}`,
      stepId,
      hint: 'Check that the step ID is spelled correctly and exists in the workflow definition.',
    });
  }
  
  /**
   * Factory: Step execution timeout
   */
  static timeout(stepId: string, duration: string, stepName?: string): StepError {
    return new StepError({
      code: StepErrorCode.STEP_TIMEOUT,
      message: `Step "${stepName || stepId}" exceeded timeout of ${duration}`,
      stepId,
      stepName,
      context: { timeoutDuration: duration },
      hint: `The step took longer than ${duration}. Consider increasing the timeout or optimizing the step.`,
    });
  }
  
  /**
   * Factory: Step execution failed
   */
  static executionFailed(
    stepId: string,
    action: string,
    cause: Error,
    stepName?: string
  ): StepError {
    return new StepError({
      code: StepErrorCode.STEP_EXECUTION_FAILED,
      message: `Step "${stepName || stepId}" failed during execution of "${action}"`,
      stepId,
      stepName,
      action,
      cause,
      hint: 'Check the step configuration and adapter implementation. See the underlying error for details.',
    });
  }
  
  /**
   * Factory: Step dependency failed
   */
  static dependencyFailed(
    stepId: string,
    missingDependencies: string[],
    stepName?: string
  ): StepError {
    return new StepError({
      code: StepErrorCode.STEP_DEPENDENCY_FAILED,
      message: `Step "${stepName || stepId}" depends on: ${missingDependencies.join(', ')}`,
      stepId,
      stepName,
      context: { missingDependencies },
      hint: `Ensure that the following steps complete successfully: ${missingDependencies.join(', ')}`,
    });
  }
  
  /**
   * Factory: Invalid step configuration
   */
  static invalidConfig(
    stepId: string,
    reason: string,
    stepName?: string
  ): StepError {
    return new StepError({
      code: StepErrorCode.STEP_CONFIG_INVALID,
      message: `Invalid configuration for step "${stepName || stepId}": ${reason}`,
      stepId,
      stepName,
      hint: 'Review the step definition and ensure all required fields are provided with valid values.',
    });
  }
  
  /**
   * Factory: Duplicate step ID
   */
  static duplicateId(stepId: string): StepError {
    return new StepError({
      code: StepErrorCode.STEP_DUPLICATE_ID,
      message: `Duplicate step ID "${stepId}" found in workflow`,
      stepId,
      hint: `Step IDs must be unique within a workflow. Rename one of the steps with ID "${stepId}".`,
    });
  }
}
