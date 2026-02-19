/**
 * Internal Execution Context
 * 
 * These fields are NEVER user-controlled.
 * Engine injects them automatically at runtime.
 * 
 * Security: User workflow YAML cannot override these values.
 */

import { BillingSnapshot, DerivedBillingContext, ExecutionIdentity, InternalExecutionContext, InternalStepContext, OwnershipContext, RequestContext, RuntimeState, SecurityMetadata, UsageCounters } from '../types/core-types.js';
import { getLimitsForTier } from './ExecutionLimits.js';

/**
 * Context Builder
 * Used by engine to create internal context
 */
export class InternalContextBuilder {
  /**
   * Create execution identity
   */
  static createIdentity(engineVersion: string): ExecutionIdentity {
    return {
      executionId: this.generateId('exec'),
      runId: this.generateId('run'),
      traceId: this.generateId('trace'),
      startedAt: new Date(),
      engineVersion,
    };
  }
  
  /**
   * Create default ownership context (local mode)
   */
  static createDefaultOwnership(): OwnershipContext {
    return {
      userId: 'local',
      workspaceId: 'local',
      subscriptionId: 'local',
      subscriptionTier: 'free',
      region: 'local',
      pricingModel: 'ecosystem',
      billingMode: 'ecosystem',
    };
  }
  
  /**
   * Create billing snapshot
   */
  static createBillingSnapshot(
    subscriptionTier: string,
    billingMode: 'ecosystem' | 'component'
  ): BillingSnapshot {
    // Default pricing (override from bridge in production)
    // Billing mode affects pricing calculation (future implementation)
    const isEcosystemBilling = billingMode === 'ecosystem';
    
    return {
      baseExecutionCost: isEcosystemBilling ? 0 : 0, // Future: different rates
      baseStepCost: 0,
      pricingTier: subscriptionTier,
      discountApplied: 0,
      effectiveRate: 0,
      snapshotVersion: '1.0.0',
      snapshotAt: new Date(),
    };
  }
  
  /**
   * Initialize usage counters
   */
  static initializeCounters(): UsageCounters {
    return {
      automationCount: 1,
      stepCount: 0,
      weightedStepCount: 0,
      durationSeconds: 0,
    };
  }
  
  /**
   * Create derived billing context
   */
  static createDerivedBilling(
    ownership: OwnershipContext,
    snapshot: BillingSnapshot
  ): DerivedBillingContext {
    return {
      isBillable: ownership.subscriptionTier !== 'free',
      billingScopeResolved: 'both',
      effectiveProduct: 'orbyt',
      pricingTierResolved: snapshot.pricingTier,
      totalCost: 0,
    };
  }
  
  /**
   * Build complete internal context
   */
  static build(
    engineVersion: string,
    ownershipContext?: Partial<OwnershipContext>,
    requestOrigin: 'cli' | 'api' | 'sdk' | 'webhook' | 'scheduler' = 'cli',
    executionMode: 'local' | 'server' | 'embedded' | 'dry-run' = 'local'
  ): InternalExecutionContext {
    const identity = this.createIdentity(engineVersion);
    const ownership = {
      ...this.createDefaultOwnership(),
      ...ownershipContext,
    };
    const billingSnapshot = this.createBillingSnapshot(
      ownership.subscriptionTier,
      ownership.billingMode
    );
    const usage = this.initializeCounters();
    const billing = this.createDerivedBilling(ownership, billingSnapshot);
    const security = this.createSecurityMetadata(ownership);
    const runtime = this.initializeRuntimeState();
    const request = this.createRequestContext(requestOrigin, executionMode);
    
    return {
      _identity: identity,
      _ownership: ownership,
      _billingSnapshot: billingSnapshot,
      _usage: usage,
      _billing: billing,
      _limits: getLimitsForTier(ownership.subscriptionTier),
      _security: security,
      _runtime: runtime,
      _request: request,
      _audit: {
        engineVersion,
        billingSnapshotVersion: billingSnapshot.snapshotVersion,
        executionVersion: '1.0.0',
      },
    };
  }
  
  /**
   * Create security metadata
   */
  static createSecurityMetadata(ownership: OwnershipContext): SecurityMetadata {
    return {
      paymentStatus: ownership.subscriptionTier === 'free' ? 'trial' : 'active',
      isolationLevel: 'process',
      permissionsGranted: ['execute', 'read'],
    };
  }
  
  /**
   * Initialize runtime state
   */
  static initializeRuntimeState(): RuntimeState {
    return {
      workflowState: 'pending',
      retryCountActual: 0,
      timeoutTriggered: false,
      stepsState: {},
    };
  }
  
  /**
   * Create request context
   */
  static createRequestContext(
    origin: 'cli' | 'api' | 'sdk' | 'webhook' | 'scheduler',
    mode: 'local' | 'server' | 'embedded' | 'dry-run'
  ): RequestContext {
    return {
      origin,
      mode,
    };
  }
  
  /**
   * Create step internal context
   */
  static createStepContext(
    userWeight?: number,
    userUnit?: string
  ): InternalStepContext {
    return {
      usage: {
        billable: true,
        unit: userUnit || 'execution',
        weight: userWeight || 1,
        computedCost: 0, // Calculated later
      },
      requires: {
        capabilities: [],
        validated: false,
      },
      hints: {
        cacheable: false,
        idempotent: false,
        heavy: false,
        cost: 'low',
      },
    };
  }
  
  /**
   * Generate unique ID
   */
  private static generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${timestamp}_${random}`;
  }
}
