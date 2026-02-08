/**
 * Resource Guard
 * 
 * Future security and resource limiting layer.
 * Currently provides basic checks, will be extended for:
 * - Permission policies
 * - Resource limits (CPU, memory, network)
 * - Sandbox enforcement
 * 
 * @module guards
 */

import type { ParsedStep } from '../parser/StepParser.js';

/**
 * Permission policy for workflow execution
 */
export interface PermissionPolicy {
  /** Allow network access */
  allowNetwork?: boolean;
  
  /** Allow file system access */
  allowFileSystem?: boolean;
  
  /** Allow shell command execution */
  allowShell?: boolean;
  
  /** Allowed adapter types */
  allowedAdapters?: string[];
  
  /** Blocked adapter types */
  blockedAdapters?: string[];
  
  /** Maximum step timeout (ms) */
  maxStepTimeout?: number;
  
  /** Maximum workflow timeout (ms) */
  maxWorkflowTimeout?: number;
}

/**
 * Default permission policy (permissive)
 */
const DEFAULT_POLICY: PermissionPolicy = {
  allowNetwork: true,
  allowFileSystem: true,
  allowShell: true,
  allowedAdapters: undefined, // Allow all
  blockedAdapters: [],
  maxStepTimeout: 30 * 60 * 1000, // 30 minutes
  maxWorkflowTimeout: 2 * 60 * 60 * 1000, // 2 hours
};

/**
 * Resource and permission guard
 */
export class ResourceGuard {
  private policy: PermissionPolicy;

  constructor(policy: Partial<PermissionPolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Validate step against permission policy
   * 
   * @param step - Step to validate
   * @throws {Error} If step violates policy
   */
  validateStep(step: ParsedStep): void {
    this.checkAdapterPermission(step);
    this.checkTimeout(step);
    this.checkNetworkAccess(step);
    this.checkFileSystemAccess(step);
    this.checkShellAccess(step);
  }

  /**
   * Check if adapter type is allowed
   */
  private checkAdapterPermission(step: ParsedStep): void {
    const { adapter } = step;
    const { allowedAdapters, blockedAdapters } = this.policy;

    // Check blocked list first
    if (blockedAdapters && blockedAdapters.includes(adapter)) {
      throw new Error(
        `Step '${step.id}': adapter '${adapter}' is blocked by policy`
      );
    }

    // Check allowed list if defined
    if (allowedAdapters && !allowedAdapters.includes(adapter)) {
      throw new Error(
        `Step '${step.id}': adapter '${adapter}' is not in allowed list. ` +
        `Allowed: ${allowedAdapters.join(', ')}`
      );
    }
  }

  /**
   * Check timeout limits
   */
  private checkTimeout(step: ParsedStep): void {
    const { maxStepTimeout } = this.policy;

    if (maxStepTimeout && step.timeout) {
      const timeoutMs = this.parseTimeoutString(step.timeout);
      if (timeoutMs > maxStepTimeout) {
        throw new Error(
          `Step '${step.id}': timeout ${timeoutMs}ms exceeds policy limit ${maxStepTimeout}ms`
        );
      }
    }
  }

  /**
   * Parse timeout string to milliseconds
   */
  private parseTimeoutString(timeout: string): number {
    const match = timeout.match(/^([0-9]+)(ms|s|m|h|d)$/);
    if (!match) {
      return 30000; // Default 30s
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
        return 30000;
    }
  }

  /**
   * Check network access permission
   */
  private checkNetworkAccess(step: ParsedStep): void {
    if (this.policy.allowNetwork === false) {
      const networkAdapters = ['http', 'webhook', 'api'];
      if (networkAdapters.includes(step.adapter)) {
        throw new Error(
          `Step '${step.id}': network access not allowed by policy`
        );
      }
    }
  }

  /**
   * Check file system access permission
   */
  private checkFileSystemAccess(step: ParsedStep): void {
    if (this.policy.allowFileSystem === false) {
      const fsAdapters = ['fs', 'file'];
      if (fsAdapters.includes(step.adapter)) {
        throw new Error(
          `Step '${step.id}': file system access not allowed by policy`
        );
      }
    }
  }

  /**
   * Check shell execution permission
   */
  private checkShellAccess(step: ParsedStep): void {
    if (this.policy.allowShell === false) {
      const shellAdapters = ['shell', 'cli', 'exec'];
      if (shellAdapters.includes(step.adapter)) {
        throw new Error(
          `Step '${step.id}': shell execution not allowed by policy`
        );
      }
    }
  }

  /**
   * Validate workflow-level resource limits
   * 
   * @param steps - All workflow steps
   * @param workflowTimeout - Total workflow timeout
   * @throws {Error} If workflow exceeds limits
   */
  validateWorkflow(steps: ParsedStep[], workflowTimeout?: number): void {
    // Check workflow timeout
    if (this.policy.maxWorkflowTimeout && workflowTimeout) {
      if (workflowTimeout > this.policy.maxWorkflowTimeout) {
        throw new Error(
          `Workflow timeout ${workflowTimeout}ms exceeds policy limit ${this.policy.maxWorkflowTimeout}ms`
        );
      }
    }

    // Validate each step
    for (const step of steps) {
      this.validateStep(step);
    }
  }

  /**
   * Get current policy
   */
  getPolicy(): PermissionPolicy {
    return { ...this.policy };
  }

  /**
   * Create a restrictive policy (for untrusted workflows)
   */
  static restrictivePolicy(): PermissionPolicy {
    return {
      allowNetwork: false,
      allowFileSystem: false,
      allowShell: false,
      allowedAdapters: ['plugin'], // Only plugins
      blockedAdapters: ['shell', 'cli', 'exec', 'fs'],
      maxStepTimeout: 5 * 60 * 1000, // 5 minutes
      maxWorkflowTimeout: 15 * 60 * 1000, // 15 minutes
    };
  }

  /**
   * Create a permissive policy (for trusted workflows)
   */
  static permissivePolicy(): PermissionPolicy {
    return DEFAULT_POLICY;
  }
}
