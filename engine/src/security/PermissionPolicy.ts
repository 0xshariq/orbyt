/**
 * Permission Policy
 * 
 * Defines and enforces security policies for workflow execution.
 * Controls what adapters/actions workflows can perform.
 * 
 * @module security
 * @status stub - will be implemented when core engine is stable
 */

/**
 * Permission types for workflow execution
 */
export enum Permission {
  HTTP_REQUEST = 'http:request',
  SHELL_EXECUTE = 'shell:execute',
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  DB_READ = 'db:read',
  DB_WRITE = 'db:write',
  NETWORK_ACCESS = 'network:access',
  SYSTEM_ACCESS = 'system:access',
}

/**
 * Permission policy configuration
 */
export interface PermissionPolicyConfig {
  /** Allowed permissions */
  allow: Permission[];
  
  /** Denied permissions */
  deny: Permission[];
  
  /** Resource limits */
  limits?: {
    maxMemory?: number;
    maxCpu?: number;
    maxTimeout?: number;
    maxSteps?: number;
  };
}

/**
 * Permission Policy Manager
 * 
 * Future: Will enforce security policies on workflow execution
 */
export class PermissionPolicy {
  private config: PermissionPolicyConfig;

  constructor(config: PermissionPolicyConfig) {
    this.config = config;
  }

  /**
   * Check if permission is allowed
   * 
   * @param permission - Permission to check
   * @returns True if allowed
   */
  isAllowed(permission: Permission): boolean {
    if (this.config.deny.includes(permission)) {
      return false;
    }
    return this.config.allow.includes(permission);
  }

  /**
   * Get resource limits
   */
  getLimits() {
    return this.config.limits;
  }

  /**
   * Create default permissive policy
   */
  static createDefault(): PermissionPolicy {
    return new PermissionPolicy({
      allow: Object.values(Permission),
      deny: [],
      limits: {
        maxTimeout: 300000, // 5 minutes
        maxSteps: 100,
      },
    });
  }

  /**
   * Create restricted policy (no shell, no system access)
   */
  static createRestricted(): PermissionPolicy {
    return new PermissionPolicy({
      allow: [
        Permission.HTTP_REQUEST,
        Permission.FILE_READ,
        Permission.DB_READ,
      ],
      deny: [
        Permission.SHELL_EXECUTE,
        Permission.SYSTEM_ACCESS,
        Permission.FILE_WRITE,
      ],
      limits: {
        maxTimeout: 60000, // 1 minute
        maxSteps: 20,
      },
    });
  }
}
