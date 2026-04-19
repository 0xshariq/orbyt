/**
 * Workflow Parser
 * 
 * Main entry point for parsing workflows from .orbt/YAML/JSON.
 * Orchestrates schema validation and step parsing.
 * 
 * @module parser
 */

import YAML from 'yaml';
import { createHash } from 'node:crypto';
import { SchemaValidator } from './SchemaValidator.js';
import { StepParser } from './StepParser.js';
import type { WorkflowDefinitionZod } from '@dev-ecosystem/core';
import { LoggerManager } from '../logging/LoggerManager.js';
import { ParsedWorkflow } from '../types/core-types.js';

type WorkflowParseCache = {
  load(source: string, sourceHash: string): { workflow: ParsedWorkflow } | null;
  save(source: string, sourceHash: string, workflow: ParsedWorkflow): void;
};

interface WorkflowParseOptions {
  cache?: WorkflowParseCache;
}

/**
 * Main workflow parser class
 */
export class WorkflowParser {
  private static ensureNonEmptyContent(content: string, format: string): void {
    if (content.trim().length === 0) {
      throw new Error(`${format} parsing failed: content is empty`);
    }
  }

  private static inferInlineFormat(content: string): 'json' | 'yaml' {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return 'json';
    }
    return 'yaml';
  }

  private static parseTextContent(
    content: string,
    formatLabel: 'YAML' | 'JSON' | 'ORBT',
    parserType: 'yaml' | 'json' | 'orbt',
    parseFn: (raw: string) => unknown,
    options: WorkflowParseOptions = {},
  ): ParsedWorkflow {
    const logger = LoggerManager.getLogger();
    const sourceHash = this.buildCacheHash({ content, formatLabel });
    const cached = this.readFromCache(options.cache, `${parserType}:${formatLabel}`, sourceHash);
    if (cached) {
      return cached;
    }

    try {
      logger.parsingStarted(formatLabel, parserType);
      this.ensureNonEmptyContent(content, formatLabel);
      const parsed = parseFn(content);
      const workflow = this.parse(parsed, options);
      this.writeToCache(options.cache, `${parserType}:${formatLabel}`, sourceHash, workflow);
      return workflow;
    } catch (error) {
      if (error instanceof Error) {
        logger.parsingFailed(formatLabel, error);
        throw new Error(`${formatLabel} parsing failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
    * Parse workflow from raw object (already parsed .orbt/JSON/YAML content)
   * 
   * @param rawWorkflow - Raw workflow object
   * @returns Parsed workflow ready for execution
   * @throws {SecurityError} If reserved fields are detected
   */
  static parse(rawWorkflow: unknown, options: WorkflowParseOptions = {}): ParsedWorkflow {
    const logger = LoggerManager.getLogger();
    const startTime = Date.now();
    const sourceHash = this.buildCacheHash(rawWorkflow);
    const cached = this.readFromCache(options.cache, 'object:workflow', sourceHash);
    if (cached) {
      return cached;
    }
    
    try {
      // Step 1: Validate against schema (with enhanced diagnostics)
      logger.parsingStarted('workflow', 'object');
      const validated: WorkflowDefinitionZod = SchemaValidator.validate(rawWorkflow);

      // Step 2: Parse steps from nested workflow.steps
      const steps = StepParser.parseAll(validated.workflow.steps);

      // Step 3: Run comprehensive step validations
      StepParser.validateAll(steps);

      // Step 4: Build parsed workflow
      const { usage, limits } = SchemaValidator.extractUsageAndLimits(rawWorkflow, validated);
      const { compatibility, deprecationInfo } = SchemaValidator.extractCompatibilityAndDeprecation(rawWorkflow);
      const parsed: ParsedWorkflow = {
        name: validated.metadata?.name,
        description: validated.metadata?.description,
        version: validated.version,
        kind: validated.kind,
        steps,
        inputs: validated.inputs,
        context: validated.context,
        secrets: validated.secrets,
        triggers: validated.triggers,
        defaults: validated.defaults,
        policies: validated.policies,
        permissions: validated.permissions,
        resources: validated.resources,
        outputs: validated.outputs,
        strategy: (validated as any).strategy,
        execution: (validated as any).execution,
        usage,
        limits,
        compatibility,
        deprecationInfo,
      };

      this.emitUsageLimitsDisclaimer(logger, parsed);
      this.emitCompatibilityDisclaimer(logger, parsed);

      const duration = Date.now() - startTime;
      logger.parsingCompleted('workflow', duration, {
        stepCount: steps.length,
        hasInputs: !!validated.inputs,
        hasTriggers: !!validated.triggers,
      });

      this.writeToCache(options.cache, 'object:workflow', sourceHash, parsed);

      return parsed;
    } catch (error) {
      const duration = Date.now() - startTime;
      if (error instanceof Error) {
        logger.parsingFailed('workflow', error, { duration });
      }
      throw error;
    }
  }

  /**
   * Emit development-stage disclaimer for usage/limits policy blocks.
   * Current behavior is non-blocking and warning-only.
   */
  private static emitUsageLimitsDisclaimer(
    logger: ReturnType<typeof LoggerManager.getLogger>,
    parsed: ParsedWorkflow,
  ): void {
    if (!parsed.usage && !parsed.limits) {
      return;
    }

    logger.warn(
      '[WorkflowParser] Usage/Limits policy detected. This is currently warning-only and non-blocking; strict restrictions will be enforced in a future engine release.',
      {
        hasUsagePolicy: !!parsed.usage,
        hasLimitsPolicy: !!parsed.limits,
        usageMode: parsed.usage?.mode,
        usageScope: parsed.usage?.scope,
        limits: parsed.limits,
      },
    );
  }

  /**
   * Emit Phase A compatibility/deprecation warnings without blocking parse.
   */
  private static emitCompatibilityDisclaimer(
    logger: ReturnType<typeof LoggerManager.getLogger>,
    parsed: ParsedWorkflow,
  ): void {
    if (!parsed.compatibility && !parsed.deprecationInfo) {
      return;
    }

    logger.warn(
      '[WorkflowParser] Compatibility/deprecation metadata detected. Backward compatibility is deferred until stable v1, but the metadata is preserved for release planning and warnings.',
      {
        hasCompatibility: !!parsed.compatibility,
        minVersion: parsed.compatibility?.minVersion,
        maxVersion: parsed.compatibility?.maxVersion,
        deprecated: parsed.compatibility?.deprecated,
        hasDeprecationInfo: !!parsed.deprecationInfo,
        removedIn: parsed.deprecationInfo?.removedIn,
        replacementPath: parsed.deprecationInfo?.replacementPath,
      },
    );
  }

  /**
   * Parse workflow from YAML string
   * 
   * @param yamlContent - YAML string content
   * @returns Parsed workflow
   */
  static fromYAML(yamlContent: string, options: WorkflowParseOptions = {}): ParsedWorkflow {
    return this.parseTextContent(yamlContent, 'YAML', 'yaml', (raw) => YAML.parse(raw), options);
  }

  /**
   * Parse workflow from JSON string
   * 
   * @param jsonContent - JSON string content
   * @returns Parsed workflow
   */
  static fromJSON(jsonContent: string, options: WorkflowParseOptions = {}): ParsedWorkflow {
    return this.parseTextContent(jsonContent, 'JSON', 'json', (raw) => JSON.parse(raw), options);
  }

  /**
   * Parse workflow from .orbt content.
   *
   * .orbt is treated as canonical JSON workflow object format.
   */
  static fromORBT(orbtContent: string, options: WorkflowParseOptions = {}): ParsedWorkflow {
    return this.parseTextContent(orbtContent, 'ORBT', 'orbt', (raw) => JSON.parse(raw), options);
  }

  /**
   * Parse workflow from file content (auto-detect format)
   * 
   * @param content - File content string
   * @param filename - Optional filename for format detection
   * @returns Parsed workflow
   */
  static fromFile(content: string, filename?: string, options: WorkflowParseOptions = {}): ParsedWorkflow {
    this.ensureNonEmptyContent(content, 'Workflow file');

    // Try to detect format from filename
    if (filename) {
      const lowerFileName = filename.toLowerCase();
      if (lowerFileName.endsWith('.yaml') || lowerFileName.endsWith('.yml')) {
        return this.fromYAML(content, options);
      }
      if (lowerFileName.endsWith('.json')) {
        return this.fromJSON(content, options);
      }
      if (lowerFileName.endsWith('.orbt')) {
        return this.fromORBT(content, options);
      }
    }

    // Auto-detect inline content for unknown extensions.
    const inferred = this.inferInlineFormat(content);
    try {
      return inferred === 'json' ? this.fromJSON(content, options) : this.fromYAML(content, options);
    } catch {
      return inferred === 'json' ? this.fromYAML(content, options) : this.fromJSON(content, options);
    }
  }

  /**
   * Validate workflow without full parsing
   * 
   * @param rawWorkflow - Raw workflow object
   * @returns True if valid, false otherwise
   */
  static isValid(rawWorkflow: unknown): boolean {
    try {
      this.parse(rawWorkflow);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get workflow metadata without parsing steps
   * 
   * @param rawWorkflow - Raw workflow object
   * @returns Basic workflow metadata
   */
  static getMetadata(rawWorkflow: unknown): {
    name?: string;
    description?: string;
    version: string;
    kind: string;
    stepCount: number;
  } {
    const validated: WorkflowDefinitionZod = SchemaValidator.validate(rawWorkflow);

    return {
      name: validated.metadata?.name,
      description: validated.metadata?.description,
      version: validated.version,
      kind: validated.kind,
      stepCount: validated.workflow.steps.length,
    };
  }

  private static buildCacheHash(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private static readFromCache(
    cache: WorkflowParseCache | undefined,
    source: string,
    sourceHash: string,
  ): ParsedWorkflow | null {
    if (!cache) return null;
    return cache.load(source, sourceHash)?.workflow ?? null;
  }

  private static writeToCache(
    cache: WorkflowParseCache | undefined,
    source: string,
    sourceHash: string,
    workflow: ParsedWorkflow,
  ): void {
    cache?.save(source, sourceHash, workflow);
  }
}
