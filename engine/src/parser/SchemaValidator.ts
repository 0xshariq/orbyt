/**
 * Schema Validator
 * 
 * Validates workflow .orbt/YAML/JSON inputs against Zod schema from @dev-ecosystem/core.
 * Provides enhanced error diagnostics with typo detection and helpful suggestions.
 * 
 * @module parser
 */

import { z } from 'zod';
import { OrbytWorkflowSchema, type WorkflowDefinitionZod } from '@dev-ecosystem/core';
import {
  SchemaError,
  findMatches,
  isLikelyTypo,
  OrbytError,
  ErrorSeverity,
} from '../errors/index.js';
import { getValidFields, isValidField } from '../errors/FieldRegistry.js';
import { LoggerManager } from '../logging/LoggerManager.js';
import type {
  WorkflowCompatibilityPolicy,
  WorkflowDeprecationInfo,
  WorkflowLimitsPolicy,
  WorkflowUsagePolicy,
} from '../types/core-types.js';

/**
 * Enhanced schema validator with diagnostic capabilities
 */
export class SchemaValidator {
  private static readonly FREE_FORM_PATHS = ['annotations', 'context', 'secrets', 'inputs'] as const;
  private static readonly FREE_FORM_FIELDS = ['annotations', 'context', 'with', 'outputs', 'env', 'secrets', 'inputs'] as const;

  /**
   * Validate raw workflow data against Zod schema
   * 
    * @param rawWorkflow - Raw workflow object from .orbt/YAML/JSON
   * @returns Validated and typed workflow definition
   * @throws {OrbytError} If validation fails with detailed diagnostics
   */
  static validate(rawWorkflow: unknown): WorkflowDefinitionZod {
    const logger = LoggerManager.getLogger();

    try {
      logger.validationStarted('workflow', 'schema');

      // Normalize first so ParsedWorkflow-shaped .orbt objects are accepted by
      // root field validation and the core schema parser.
      const normalizedForCore = this.normalizeForCoreSchema(rawWorkflow);

      // First, check for unknown fields at root level
      this.validateUnknownFields(normalizedForCore as Record<string, any>, 'root');

      // Phase-2 foundation validation for usage/limits schema blocks.
      // This is engine-local and warning-policy focused.
      this.validateUsageAndLimits(rawWorkflow);

      // Phase-A foundation validation for compatibility/deprecation metadata.
      this.validateCompatibilityAndDeprecation(rawWorkflow);

      // Use Zod schema from ecosystem-core for structural validation
      const validated = OrbytWorkflowSchema.parse(normalizedForCore);

      // Additional semantic validations
      this.validateWorkflowBody(validated);

      logger.validationPassed('workflow', 'schema');

      return validated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.validationFailed('workflow', 'schema', [errorMessage]);

      // If it's already an OrbytError, rethrow it
      if (error instanceof OrbytError) {
        throw error;
      }

      // Transform Zod errors into diagnostic-rich OrbytErrors
      if (error instanceof z.ZodError) {
        throw this.transformZodError(error);
      }

      throw error;
    }
  }

  /**
   * Extract normalized usage/limits policy blocks from raw workflow.
   * These are phase-2 intent blocks and remain warning-only in runtime.
   */
  static extractUsageAndLimits(
    rawWorkflow: unknown,
    validated?: WorkflowDefinitionZod,
  ): { usage?: WorkflowUsagePolicy; limits?: WorkflowLimitsPolicy } {
    if (!rawWorkflow || typeof rawWorkflow !== 'object' || Array.isArray(rawWorkflow)) {
      return {};
    }

    const root = rawWorkflow as Record<string, any>;
    const rawUsage = this.isPlainObject(root.usage) ? root.usage : undefined;
    const validatedUsage = this.isPlainObject((validated as any)?.usage)
      ? ((validated as any).usage as Record<string, any>)
      : undefined;

    const usage: WorkflowUsagePolicy | undefined = ((): WorkflowUsagePolicy | undefined => {
      const mode = rawUsage?.mode
        ?? (validatedUsage?.track === false ? 'disabled' : (validatedUsage ? 'auto' : undefined));

      const policy: WorkflowUsagePolicy = {
        mode,
        scope: rawUsage?.scope ?? validatedUsage?.scope,
        tags: rawUsage?.tags ?? validatedUsage?.tags,
        track: rawUsage?.track ?? validatedUsage?.track,
        category: rawUsage?.category ?? validatedUsage?.category,
        billable: rawUsage?.billable ?? validatedUsage?.billable,
        product: rawUsage?.product ?? validatedUsage?.product,
      };

      if (
        policy.mode === undefined
        && policy.scope === undefined
        && policy.tags === undefined
        && policy.track === undefined
        && policy.category === undefined
        && policy.billable === undefined
        && policy.product === undefined
      ) {
        return undefined;
      }

      return policy;
    })();

    const rawLimits = this.isPlainObject(root.limits) ? root.limits : undefined;
    const limits: WorkflowLimitsPolicy | undefined = rawLimits
      ? {
          maxRuns: rawLimits.maxRuns,
          maxStepsPerRun: rawLimits.maxStepsPerRun,
          maxAdapters: rawLimits.maxAdapters,
        }
      : undefined;

    return { usage, limits };
  }

  private static normalizeForCoreSchema(rawWorkflow: unknown): unknown {
    if (!rawWorkflow || typeof rawWorkflow !== 'object' || Array.isArray(rawWorkflow)) {
      return rawWorkflow;
    }

    const normalized = structuredClone(rawWorkflow as Record<string, any>);

    // Accept canonical .orbt ParsedWorkflow shape by converting it back into
    // the core schema shape expected by OrbytWorkflowSchema.
    this.normalizeParsedWorkflowShape(normalized);

    // limits is an engine-local foundation block and not yet part of
    // ecosystem-core root schema.
    if ('limits' in normalized) {
      delete normalized.limits;
    }

    if ('compatibility' in normalized) {
      delete normalized.compatibility;
    }

    if ('deprecationInfo' in normalized) {
      delete normalized.deprecationInfo;
    }

    // usage.mode is an engine-local alias. Map it to track for compatibility,
    // then remove mode before strict schema parsing.
    if (this.isPlainObject(normalized.usage)) {
      const usage = normalized.usage as Record<string, any>;
      if ('mode' in usage && !('track' in usage)) {
        const mode = usage.mode;
        if (mode === 'disabled') {
          usage.track = false;
        } else if (mode === 'auto' || mode === 'manual') {
          usage.track = true;
        }
      }
      if ('mode' in usage) {
        delete usage.mode;
      }
    }

    return normalized;
  }

  private static normalizeParsedWorkflowShape(normalized: Record<string, any>): void {
    if (!Array.isArray(normalized.steps) || this.isPlainObject(normalized.workflow)) {
      return;
    }

    const normalizedSteps = normalized.steps.map((step: any) => this.normalizeParsedStepShape(step));
    normalized.workflow = { steps: normalizedSteps };
    delete normalized.steps;

    if (!this.isPlainObject(normalized.metadata)) {
      normalized.metadata = {};
    }

    if (typeof normalized.name === 'string' && !normalized.metadata.name) {
      normalized.metadata.name = normalized.name;
    }
    if (typeof normalized.description === 'string' && !normalized.metadata.description) {
      normalized.metadata.description = normalized.description;
    }
    if (Array.isArray(normalized.tags) && !normalized.metadata.tags) {
      normalized.metadata.tags = normalized.tags;
    }
    if (typeof normalized.owner === 'string' && !normalized.metadata.owner) {
      normalized.metadata.owner = normalized.owner;
    }
  }

  private static normalizeParsedStepShape(step: any): Record<string, any> {
    if (!this.isPlainObject(step)) {
      return step;
    }

    const normalizedStep: Record<string, any> = { ...step };

    if (typeof normalizedStep.action === 'string' && !normalizedStep.uses) {
      normalizedStep.uses = normalizedStep.action;
    }

    if (this.isPlainObject(normalizedStep.input) && !this.isPlainObject(normalizedStep.with)) {
      normalizedStep.with = normalizedStep.input;
    }

    delete normalizedStep.action;
    delete normalizedStep.adapter;
    delete normalizedStep.input;

    if (!Array.isArray(normalizedStep.needs)) {
      normalizedStep.needs = [];
    }

    return normalizedStep;
  }

  private static validateUsageAndLimits(rawWorkflow: unknown): void {
    if (!rawWorkflow || typeof rawWorkflow !== 'object' || Array.isArray(rawWorkflow)) {
      return;
    }

    const root = rawWorkflow as Record<string, any>;
    const usage = root.usage;
    if (usage !== undefined) {
      if (!this.isPlainObject(usage)) {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid type for usage: expected object',
          path: 'usage',
          hint: 'Use an object such as usage: { mode, scope, tags }',
          severity: ErrorSeverity.ERROR,
        });
      }

      if (usage.mode !== undefined && !['auto', 'manual', 'disabled'].includes(usage.mode)) {
        throw new SchemaError({
          code: 'ORB-S-004' as any,
          message: `Invalid usage.mode: ${String(usage.mode)}`,
          path: 'usage.mode',
          hint: 'Allowed values: auto, manual, disabled',
          severity: ErrorSeverity.ERROR,
        });
      }

      if (
        usage.scope !== undefined
        && !['workflow', 'step', 'adapter', 'ecosystem', 'component'].includes(String(usage.scope))
      ) {
        throw new SchemaError({
          code: 'ORB-S-004' as any,
          message: `Invalid usage.scope: ${String(usage.scope)}`,
          path: 'usage.scope',
          hint: 'Allowed values: workflow, step, adapter, ecosystem, component',
          severity: ErrorSeverity.ERROR,
        });
      }

      if (usage.tags !== undefined) {
        if (!Array.isArray(usage.tags) || usage.tags.some((tag: unknown) => typeof tag !== 'string')) {
          throw new SchemaError({
            code: 'ORB-S-002' as any,
            message: 'Invalid usage.tags: expected string[]',
            path: 'usage.tags',
            hint: 'Example: usage: { tags: ["automation", "orbyt"] }',
            severity: ErrorSeverity.ERROR,
          });
        }
      }
    }

    const limits = root.limits;
    if (limits !== undefined) {
      if (!this.isPlainObject(limits)) {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid type for limits: expected object',
          path: 'limits',
          hint: 'Use an object such as limits: { maxRuns, maxStepsPerRun, maxAdapters }',
          severity: ErrorSeverity.ERROR,
        });
      }

      this.validatePositiveInt(limits.maxRuns, 'limits.maxRuns');
      this.validatePositiveInt(limits.maxStepsPerRun, 'limits.maxStepsPerRun');

      if (limits.maxAdapters !== undefined) {
        if (!this.isPlainObject(limits.maxAdapters)) {
          throw new SchemaError({
            code: 'ORB-S-002' as any,
            message: 'Invalid limits.maxAdapters: expected object map',
            path: 'limits.maxAdapters',
            hint: 'Example: limits: { maxAdapters: { http: 100, shell: 10 } }',
            severity: ErrorSeverity.ERROR,
          });
        }

        for (const [adapterName, value] of Object.entries(limits.maxAdapters)) {
          this.validatePositiveInt(value, `limits.maxAdapters.${adapterName}`);
        }
      }
    }
  }

  private static validateCompatibilityAndDeprecation(rawWorkflow: unknown): void {
    if (!rawWorkflow || typeof rawWorkflow !== 'object' || Array.isArray(rawWorkflow)) {
      return;
    }

    const root = rawWorkflow as Record<string, any>;
    const compatibility = root.compatibility;
    if (compatibility !== undefined) {
      if (!this.isPlainObject(compatibility)) {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid type for compatibility: expected object',
          path: 'compatibility',
          hint: 'Use an object such as compatibility: { minVersion, maxVersion, deprecated }',
          severity: ErrorSeverity.ERROR,
        });
      }

      this.validateOptionalSemver(compatibility.minVersion, 'compatibility.minVersion');
      this.validateOptionalSemver(compatibility.maxVersion, 'compatibility.maxVersion');

      if (compatibility.deprecated !== undefined && typeof compatibility.deprecated !== 'boolean') {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid type for compatibility.deprecated: expected boolean',
          path: 'compatibility.deprecated',
          hint: 'Use true or false',
          severity: ErrorSeverity.ERROR,
        });
      }

      if (
        typeof compatibility.minVersion === 'string'
        && typeof compatibility.maxVersion === 'string'
        && this.compareSemver(this.parseSemverLike(compatibility.minVersion), this.parseSemverLike(compatibility.maxVersion)) > 0
      ) {
        throw new SchemaError({
          code: 'ORB-S-004' as any,
          message: 'compatibility.minVersion must be less than or equal to compatibility.maxVersion',
          path: 'compatibility',
          hint: 'Swap the values or remove one bound',
          severity: ErrorSeverity.ERROR,
        });
      }
    }

    const deprecationInfo = root.deprecationInfo;
    if (deprecationInfo !== undefined) {
      if (!this.isPlainObject(deprecationInfo)) {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid type for deprecationInfo: expected object',
          path: 'deprecationInfo',
          hint: 'Use an object such as deprecationInfo: { message, removedIn, replacementPath }',
          severity: ErrorSeverity.ERROR,
        });
      }

      if (typeof deprecationInfo.message !== 'string' || deprecationInfo.message.trim().length === 0) {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid deprecationInfo.message: expected non-empty string',
          path: 'deprecationInfo.message',
          hint: 'Provide a human-readable deprecation message',
          severity: ErrorSeverity.ERROR,
        });
      }

      this.validateOptionalSemver(deprecationInfo.removedIn, 'deprecationInfo.removedIn');

      if (deprecationInfo.replacementPath !== undefined && typeof deprecationInfo.replacementPath !== 'string') {
        throw new SchemaError({
          code: 'ORB-S-002' as any,
          message: 'Invalid type for deprecationInfo.replacementPath: expected string',
          path: 'deprecationInfo.replacementPath',
          hint: 'Use a string path or workflow reference',
          severity: ErrorSeverity.ERROR,
        });
      }
    }
  }

  private static validateOptionalSemver(value: unknown, path: string): void {
    if (value === undefined) {
      return;
    }

    if (typeof value !== 'string') {
      throw new SchemaError({
        code: 'ORB-S-002' as any,
        message: `Invalid type for ${path}: expected string`,
        path,
        hint: 'Use a semantic version string like 1.0 or 1.0.0',
        severity: ErrorSeverity.ERROR,
      });
    }

    this.parseSemverLike(value, path);
  }

  private static parseSemverLike(value: string, path = 'version'): { major: number; minor: number; patch: number } {
    const trimmed = value.trim();
    const match = trimmed.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);

    if (!match) {
      throw new SchemaError({
        code: 'ORB-S-004' as any,
        message: `Invalid semantic version in ${path}: ${value}`,
        path,
        hint: 'Use semantic version format like 1.0 or 1.0.0',
        severity: ErrorSeverity.ERROR,
      });
    }

    return {
      major: Number(match[1]),
      minor: Number(match[2] ?? '0'),
      patch: Number(match[3] ?? '0'),
    };
  }

  private static compareSemver(
    left: { major: number; minor: number; patch: number },
    right: { major: number; minor: number; patch: number },
  ): number {
    if (left.major !== right.major) {
      return left.major - right.major;
    }

    if (left.minor !== right.minor) {
      return left.minor - right.minor;
    }

    return left.patch - right.patch;
  }

  static extractCompatibilityAndDeprecation(
    rawWorkflow: unknown,
  ): { compatibility?: WorkflowCompatibilityPolicy; deprecationInfo?: WorkflowDeprecationInfo } {
    if (!rawWorkflow || typeof rawWorkflow !== 'object' || Array.isArray(rawWorkflow)) {
      return {};
    }

    const root = rawWorkflow as Record<string, any>;

    const compatibility = this.isPlainObject(root.compatibility)
      ? {
          minVersion: typeof root.compatibility.minVersion === 'string' ? root.compatibility.minVersion.trim() : undefined,
          maxVersion: typeof root.compatibility.maxVersion === 'string' ? root.compatibility.maxVersion.trim() : undefined,
          deprecated: typeof root.compatibility.deprecated === 'boolean' ? root.compatibility.deprecated : undefined,
        }
      : undefined;

    const deprecationInfo = this.isPlainObject(root.deprecationInfo)
      ? {
          message: typeof root.deprecationInfo.message === 'string' ? root.deprecationInfo.message.trim() : '',
          removedIn: typeof root.deprecationInfo.removedIn === 'string' ? root.deprecationInfo.removedIn.trim() : undefined,
          replacementPath: typeof root.deprecationInfo.replacementPath === 'string'
            ? root.deprecationInfo.replacementPath.trim()
            : undefined,
        }
      : undefined;

    return { compatibility, deprecationInfo };
  }

  private static validatePositiveInt(value: unknown, path: string): void {
    if (value === undefined) {
      return;
    }

    if (!Number.isInteger(value) || (value as number) < 1) {
      throw new SchemaError({
        code: 'ORB-S-002' as any,
        message: `Invalid ${path}: expected integer >= 1`,
        path,
        hint: 'Use a positive integer value',
        severity: ErrorSeverity.ERROR,
      });
    }
  }

  private static isPlainObject(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Check for unknown fields and suggest corrections
   * Enhanced with multiple suggestions and better context
   * 
   * @param obj - Object to check
   * @param path - Current path context
   */
  private static validateUnknownFields(
    obj: Record<string, any>,
    path: string
  ): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Free-form field paths - these can contain any user-defined keys
    const isFreeFormPath = this.FREE_FORM_PATHS.some(fp => path === fp || path.endsWith('.' + fp));

    // Skip validation for free-form paths (user can define any fields)
    if (isFreeFormPath) {
      return;
    }

    const validFields = getValidFields(path);
    const actualFields = Object.keys(obj);

    for (const field of actualFields) {
      if (!isValidField(field, path)) {
        // Find multiple suggestions (up to 3)
        const suggestions = findMatches(field, Array.from(validFields), 3, 0.5);
        const bestMatch = suggestions[0];

        // Build hint with multiple suggestions or best match
        let hint: string;
        if (suggestions.length > 1) {
          hint = `Did you mean one of: ${suggestions.map(s => `"${s}"`).join(', ')}?`;
        } else if (bestMatch) {
          hint = `Did you mean "${bestMatch}"?`;
        } else {
          hint = `Valid fields at ${path}: ${Array.from(validFields).join(', ')}`;
        }

        // Check if this looks like a very close typo (>0.8 similarity)
        if (bestMatch && isLikelyTypo(field, bestMatch)) {
          hint = `This looks like a typo of "${bestMatch}"!`;
        }

        // Throw error with enhanced suggestion
        throw new SchemaError({
          code: 'ORB-S-001' as any,
          message: `Unknown field "${field}"`,
          path: path === 'root' ? field : `${path}.${field}`,
          hint,
          severity: ErrorSeverity.ERROR,
        });
      }

      // Recursively validate nested objects
      // Skip validation for free-form fields (user-defined content)
      const value = obj[field];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Don't validate contents of free-form fields (they can contain any keys)
        if (!this.FREE_FORM_FIELDS.includes(field as (typeof this.FREE_FORM_FIELDS)[number])) {
          const nestedPath = path === 'root' ? field : `${path}.${field}`;
          this.validateUnknownFields(value, nestedPath);
        }
      }

      // Validate array items (steps, triggers, etc.)
      if (Array.isArray(value)) {
        if (field === 'steps') {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              this.validateUnknownFields(
                item,
                `workflow.steps[${index}]`
              );
            }
          });
        } else if (field === 'triggers') {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              this.validateUnknownFields(
                item,
                `triggers[${index}]`
              );
            }
          });
        }
      }
    }
  }

  /**
   * Validate workflow body structure and semantics
   * 
   * @param workflow - Validated workflow definition
   */
  private static validateWorkflowBody(workflow: WorkflowDefinitionZod): void {
    // Check if workflow body exists
    if (!workflow.workflow || !workflow.workflow.steps) {
      throw SchemaError.missingField('workflow.steps', 'workflow');
    }

    // Validate steps array is not empty
    if (workflow.workflow.steps.length === 0) {
      throw new SchemaError({
        code: 'ORB-S-003' as any,
        message: 'Workflow must contain at least one step',
        path: 'workflow.steps',
        hint: 'Add at least one step to the workflow.',
        severity: 'error' as any,
      });
    }
  }

  /**
   * Transform Zod validation error into OrbytError with better diagnostics
   * 
   * @param error - Zod validation error
   * @returns Enhanced OrbytError
   */
  private static transformZodError(error: z.ZodError): OrbytError {
    // Get the first error (we'll enhance to handle multiple later)
    const firstIssue = error.issues[0];
    const path = firstIssue.path.join('.');

    // Determine error type and create appropriate error
    switch (firstIssue.code) {
      case 'invalid_type':
        // Access properties without casting to specific type
        const expectedType = (firstIssue as any).expected || 'unknown';
        const receivedType = (firstIssue as any).received || 'unknown';
        return SchemaError.invalidType(
          path.split('.').pop() || 'unknown',
          expectedType,
          String(receivedType),
          path
        );

      case 'invalid_union':
        // Handle union/enum-like errors
        return new SchemaError({
          code: 'ORB-S-004' as any,
          message: firstIssue.message,
          path,
          hint: 'Check the allowed values in the workflow schema documentation.',
          severity: ErrorSeverity.ERROR,
        });

      default:
        // Generic schema error
        return new SchemaError({
          code: 'ORB-S-002' as any,
          message: firstIssue.message,
          path,
          hint: 'Check the workflow schema documentation.',
          severity: ErrorSeverity.ERROR,
        });
    }
  }

  /**
   * Check if workflow data is valid without throwing
   * 
   * @param rawWorkflow - Raw workflow object to validate
   * @returns True if valid, false otherwise
   */
  static isValid(rawWorkflow: unknown): boolean {
    try {
      this.validate(rawWorkflow);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely validate and return result with success/error
   * 
   * @param rawWorkflow - Raw workflow object to validate
   * @returns Object with success flag and either data or error
   */
  static safeParse(rawWorkflow: unknown): {
    success: boolean;
    data?: WorkflowDefinitionZod;
    error?: OrbytError;
  } {
    try {
      const data = this.validate(rawWorkflow);
      return { success: true, data };
    } catch (error) {
      if (error instanceof OrbytError) {
        return { success: false, error };
      }
      // Wrap unexpected errors
      return {
        success: false,
        error: new SchemaError({
          code: 'ORB-S-005' as any,
          message: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error' as any,
        }),
      };
    }
  }
}
