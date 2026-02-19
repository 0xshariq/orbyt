/**
 * Execution Limits & Enforcement
 * 
 * Engine-enforced limits to prevent:
 * - Resource exhaustion (DoS)
 * - Billing manipulation
 * - Security violations
 * - System instability
 * 
 * CRITICAL: These limits CANNOT be overridden by user workflows.
 * Even if workflow YAML specifies higher values, engine must enforce these.
 */

import { ENTERPRISE_TIER_LIMITS, FREE_TIER_LIMITS, PRO_TIER_LIMITS, TierLimits } from "../types/core-types.js";

/**
 * Get limits for a subscription tier
 */
export function getLimitsForTier(tier: string): TierLimits {
  switch (tier.toLowerCase()) {
    case 'free':
    case 'local':
      return FREE_TIER_LIMITS;
    case 'pro':
    case 'professional':
      return PRO_TIER_LIMITS;
    case 'enterprise':
    case 'business':
      return ENTERPRISE_TIER_LIMITS;
    default:
      // Default to free tier for unknown tiers (security first)
      return FREE_TIER_LIMITS;
  }
}

/**
 * Enforce retry limit
 */
export function enforceRetryLimit(
  requestedRetries: number | undefined,
  limits: TierLimits
): number {
  if (requestedRetries === undefined) {
    return 3; // Default
  }
  return Math.min(requestedRetries, limits.maxRetryAttempts);
}

/**
 * Enforce timeout limit (parse time string and return ms)
 */
export function enforceTimeoutLimit(
  requestedTimeout: string | number | undefined,
  limits: TierLimits,
  isWorkflowLevel: boolean
): number {
  const maxTimeout = isWorkflowLevel
    ? limits.maxWorkflowTimeout
    : limits.maxStepTimeout;
  
  if (requestedTimeout === undefined) {
    return isWorkflowLevel ? 15 * 60 * 1000 : 5 * 60 * 1000; // Default
  }
  
  let timeoutMs: number;
  
  if (typeof requestedTimeout === 'number') {
    timeoutMs = requestedTimeout;
  } else {
    // Parse time string (e.g., "30s", "5m", "2h")
    timeoutMs = parseTimeString(requestedTimeout);
  }
  
  return Math.min(timeoutMs, maxTimeout);
}

/**
 * Parse time string to milliseconds
 */
function parseTimeString(timeStr: string): number {
  const match = timeStr.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    return 5 * 60 * 1000; // Default to 5 minutes if invalid
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
      return 5 * 60 * 1000;
  }
}

/**
 * Enforce concurrency limit
 */
export function enforceConcurrencyLimit(
  requestedConcurrency: number | undefined,
  limits: TierLimits
): number {
  if (requestedConcurrency === undefined) {
    return 5; // Default
  }
  return Math.min(requestedConcurrency, limits.maxConcurrency);
}

/**
 * Enforce sandbox level
 */
export function enforceSandboxLevel(
  requestedSandbox: 'none' | 'basic' | 'strict' | undefined,
  limits: TierLimits
): 'none' | 'basic' | 'strict' {
  if (requestedSandbox === undefined) {
    return 'basic'; // Default
  }
  
  // User wants no sandbox
  if (requestedSandbox === 'none') {
    if (!limits.canDisableSandbox) {
      // Override to minimum allowed level
      return limits.minSandboxLevel;
    }
  }
  
  // Enforce minimum sandbox level
  const levels = { none: 0, basic: 1, strict: 2 };
  const requestedLevel = levels[requestedSandbox];
  const minLevel = levels[limits.minSandboxLevel];
  
  if (requestedLevel < minLevel) {
    return limits.minSandboxLevel;
  }
  
  return requestedSandbox;
}

/**
 * Enforce execution mode
 */
export function enforceExecutionMode(
  requestedMode: 'local' | 'docker' | 'remote' | 'distributed' | undefined,
  limits: TierLimits
): 'local' | 'docker' | 'remote' | 'distributed' {
  if (requestedMode === undefined) {
    return 'local'; // Default
  }
  
  if (!limits.allowedExecutionModes.includes(requestedMode)) {
    // Fallback to most restrictive allowed mode
    return limits.allowedExecutionModes[0];
  }
  
  return requestedMode;
}

/**
 * Enforce priority
 */
export function enforcePriority(
  requestedPriority: 'low' | 'normal' | 'high' | undefined,
  limits: TierLimits
): 'low' | 'normal' | 'high' {
  if (requestedPriority === undefined) {
    return 'normal'; // Default
  }
  
  if (requestedPriority === 'high' && !limits.canSetHighPriority) {
    return 'normal'; // Downgrade
  }
  
  return requestedPriority;
}

/**
 * Enforce resource limits
 */
export interface EnforcedResources {
  cpu: number;
  memoryMB: number;
  diskMB: number;
}

export function enforceResourceLimits(
  requested: {
    cpu?: number | string;
    memory?: string;
    disk?: string;
  },
  limits: TierLimits
): EnforcedResources {
  // Parse CPU
  let cpu = 1;
  if (requested.cpu !== undefined) {
    cpu = typeof requested.cpu === 'string' 
      ? parseFloat(requested.cpu) 
      : requested.cpu;
  }
  cpu = Math.min(cpu, limits.maxCpu);
  
  // Parse memory
  let memoryMB = 512;
  if (requested.memory) {
    memoryMB = parseResourceSize(requested.memory);
  }
  memoryMB = Math.min(memoryMB, limits.maxMemoryMB);
  
  // Parse disk
  let diskMB = 1024;
  if (requested.disk) {
    diskMB = parseResourceSize(requested.disk);
  }
  diskMB = Math.min(diskMB, limits.maxDiskMB);
  
  return { cpu, memoryMB, diskMB };
}

/**
 * Parse resource size string to MB
 */
function parseResourceSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)(MB|GB|TB|M|G|T)?$/i);
  if (!match) {
    return 512; // Default
  }
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'MB').toUpperCase();
  
  switch (unit) {
    case 'MB':
    case 'M':
      return value;
    case 'GB':
    case 'G':
      return value * 1024;
    case 'TB':
    case 'T':
      return value * 1024 * 1024;
    default:
      return 512;
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate workflow against limits
 */
export function validateWorkflowLimits(
  workflow: {
    steps: any[];
    config?: any;
  },
  limits: TierLimits
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check step count
  if (workflow.steps.length > limits.maxStepsPerWorkflow) {
    errors.push(
      `Workflow has ${workflow.steps.length} steps, but limit is ${limits.maxStepsPerWorkflow}`
    );
  }
  
  // Check each step
  for (const step of workflow.steps) {
    // Check retry limit
    if (step.retry?.max && step.retry.max > limits.maxRetryAttempts) {
      warnings.push(
        `Step "${step.id}" requests ${step.retry.max} retries, will be limited to ${limits.maxRetryAttempts}`
      );
    }
    
    // Check timeout
    if (step.timeout) {
      const timeoutMs = parseTimeString(step.timeout);
      if (timeoutMs > limits.maxStepTimeout) {
        warnings.push(
          `Step "${step.id}" timeout will be limited to ${limits.maxStepTimeout}ms`
        );
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
