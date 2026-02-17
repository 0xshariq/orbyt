/**
 * Workflow Loader
 * 
 * ARCHITECTURAL ROLE:
 * ===================
 * This is a UTILITY layer, NOT part of the execution engine.
 * 
 * Responsibilities:
 * - File I/O (reading workflow files from disk)
 * - YAML/JSON parsing
 * - Schema validation
 * - Security validation
 * - Return validated workflow objects
 * 
 * Does NOT:
 * - Execute workflows (that's OrbytEngine)
 * - Manage state
 * - Handle billing
 * - Know about execution context
 * 
 * USAGE:
 * ======
 * CLI/API/SDK uses this loader to convert files → validated objects.
 * Then passes objects to engine for execution.
 * 
 * Example:
 * ```ts
 * // CLI
 * const workflow = await WorkflowLoader.fromFile('./workflow.yaml');
 * await engine.run(workflow);
 * 
 * // API
 * const workflow = WorkflowLoader.fromYAML(requestBody);
 * await engine.run(workflow);
 * 
 * // Test
 * await engine.run(mockWorkflowObject);
 * ```
 * 
 * This keeps:
 * - Engine I/O-agnostic (testable, embeddable)
 * - Loader focused on parsing
 * - CLI/API deciding what to load
 * 
 * @module loader
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import YAML from 'yaml';
import { WorkflowParser, type ParsedWorkflow } from '../parser/WorkflowParser.js';
import { ErrorDetector } from '../errors/ErrorDetector.js';
import { OrbytError } from '../errors/OrbytError.js';
import { logErrorToEngine } from '../errors/ErrorFormatter.js';
import type { EngineLogger } from '../logging/EngineLogger.js';

/**
 * Workflow loading options
 */
export interface WorkflowLoadOptions {
  /**
   * Base directory for resolving relative paths
   * Defaults to dirname of the loaded file
   */
  baseDir?: string;

  /**
   * Variables to inject during loading
   */
  variables?: Record<string, any>;

  /**
   * Whether to validate the workflow after loading
   * Default: true
   */
  validate?: boolean;

  /**
   * Optional EngineLogger for structured error logging
   */
  logger?: EngineLogger;
}

/**
 * Workflow Loader
 * 
 * Utility for loading and parsing workflows from various sources.
 * This is I/O-aware but execution-agnostic.
 */
export class WorkflowLoader {
  /**
   * Load workflow from file path
   * 
   * PIPELINE:
   * 1. Validate file exists
   * 2. Read file content
   * 3. Detect format (YAML/JSON)
   * 4. Parse content
   * 5. Validate (security + schema)
   * 6. Return parsed workflow object
   * 
   * @param filePath - Path to workflow file
   * @param options - Load options
   * @returns Parsed and validated workflow
   * @throws Error if file doesn't exist, invalid format, or validation fails
   */
  static async fromFile(
    filePath: string,
    options: WorkflowLoadOptions = {}
  ): Promise<ParsedWorkflow> {
    // Step 1: Validate file exists
    const resolvedPath = resolve(filePath);

    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Workflow file not found: ${filePath}\nResolved path: ${resolvedPath}`
      );
    }

    // Step 2: Read file content
    let content: string;
    try {
      content = await readFile(resolvedPath, 'utf-8');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read workflow file: ${errorMsg}`);
    }

    // Step 3: Detect format and parse
    const isYAML = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
    const isJSON = filePath.endsWith('.json');

    let parsed: ParsedWorkflow;

    if (isYAML) {
      parsed = this.fromYAML(content, resolvedPath, options.logger);
    } else if (isJSON) {
      parsed = this.fromJSON(content, resolvedPath, options.logger);
    } else {
      // Try YAML first (more common for workflows), fallback to JSON
      try {
        parsed = this.fromYAML(content, resolvedPath, options.logger);
      } catch {
        parsed = this.fromJSON(content, resolvedPath, options.logger);
      }
    }

    // Step 4: Apply variables if provided
    if (options.variables && parsed.inputs) {
      parsed.inputs = { ...parsed.inputs, ...options.variables };
    }

    return parsed;
  }

  /**
   * Parse workflow from YAML string
   * 
   * PIPELINE:
   * 1. Phase 1: Loading - Parse YAML to object (syntax check only)
   * 2. Phase 2: Validation - Validate security, schema, and steps
   * 
   * This ensures the file is fully loaded before validation starts,
   * preventing incomplete error detection.
   * 
   * @param yamlContent - YAML string content
   * @param filePath - Optional file path for better error messages
   * @param logger - Optional EngineLogger for structured logging
   * @returns Parsed and validated workflow
   * @throws OrbytError with proper error code and debug info
   */
  static fromYAML(
    yamlContent: string,
    filePath?: string,
    logger?: EngineLogger
  ): ParsedWorkflow {
    const location = filePath || 'YAML content';

    // PHASE 1: LOADING
    // Parse YAML syntax to plain object (no validation yet)
    const workflowObject = this.parseYAMLToObject(yamlContent, location);

    // PHASE 2: VALIDATION
    // Now that file is fully loaded, validate the object
    return this.validateAndParse(workflowObject, location, logger);
  }

  /**
   * Parse workflow from JSON string
   * 
   * PIPELINE:
   * 1. Phase 1: Loading - Parse JSON to object (syntax check only)
   * 2. Phase 2: Validation - Validate security, schema, and steps
   * 
   * @param jsonContent - JSON string content
   * @param filePath - Optional file path for better error messages
   * @param logger - Optional EngineLogger for structured logging
   * @returns Parsed and validated workflow
   * @throws OrbytError with proper error code and debug info
   */
  static fromJSON(
    jsonContent: string,
    filePath?: string,
    logger?: EngineLogger
  ): ParsedWorkflow {
    const location = filePath || 'JSON content';

    // PHASE 1: LOADING
    // Parse JSON syntax to plain object (no validation yet)
    const workflowObject = this.parseJSONToObject(jsonContent, location);

    // PHASE 2: VALIDATION
    // Now that file is fully loaded, validate the object
    return this.validateAndParse(workflowObject, location, logger);
  }

  /**
   * Parse workflow from object
   * 
   * Useful when workflow is already parsed (e.g., from API request body).
   * 
   * Since the object is already loaded, this goes directly to validation phase.
   * 
   * @param workflowObject - Workflow object
   * @param logger - Optional EngineLogger for structured logging
   * @returns Parsed and validated workflow
   * @throws OrbytError with proper error code and debug info
   */
  static fromObject(workflowObject: unknown, logger?: EngineLogger): ParsedWorkflow {
    // Object is already loaded, go directly to validation
    return this.validateAndParse(workflowObject, 'workflow object', logger);
  }

  /**
   * Validate a workflow and return parsed result with metadata
   * 
   * This is a convenience method that auto-detects the source type:
   * - File path → load from file
   * - YAML/JSON string → parse content
   * - Object → validate object
   * 
   * Returns ParsedWorkflow with metadata (name, description, steps count, etc.)
   * so you can display info about the validated workflow.
   * 
   * @param source - File path, YAML string, JSON string, or object
   * @param logger - Optional EngineLogger for structured logging
   * @returns ParsedWorkflow with metadata
   * @throws OrbytError if invalid
   */
  static async validate(
    source: string | unknown,
    logger?: EngineLogger
  ): Promise<ParsedWorkflow> {
    if (typeof source === 'string') {
      // Check if it's a file path
      if (existsSync(source)) {
        return await this.fromFile(source, { logger });
      } else {
        // Try parsing as YAML/JSON
        try {
          return this.fromYAML(source, undefined, logger);
        } catch {
          return this.fromJSON(source, undefined, logger);
        }
      }
    } else {
      return this.fromObject(source, logger);
    }
  }

  /**
   * Check if a string is likely a file path
   * 
   * @param str - String to check
   * @returns True if it looks like a file path
   */
  static looksLikeFilePath(str: string): boolean {
    return (
      str.endsWith('.yaml') ||
      str.endsWith('.yml') ||
      str.endsWith('.json') ||
      str.includes('/') ||
      str.includes('\\') ||
      str.startsWith('./')
    );
  }

  /**
   * Load workflow from string (auto-detect file path vs content)
   * 
   * CONVENIENCE METHOD:
   * - If string looks like file path AND file exists → load from file
   * - Otherwise → parse as YAML content
   * 
   * @param source - File path or YAML/JSON content
   * @param options - Load options
   * @returns Parsed and validated workflow
   * @throws OrbytError with proper error code and debug info
   */
  static async fromString(
    source: string,
    options: WorkflowLoadOptions = {}
  ): Promise<ParsedWorkflow> {
    // Strategy: Check if it's a file path first
    if (this.looksLikeFilePath(source) && existsSync(source)) {
      return this.fromFile(source, options);
    }

    // Otherwise parse as content
    return this.fromYAML(source, 'inline YAML', options.logger);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Parse YAML content to plain object (Phase 1: Loading)
   * 
   * This only checks YAML syntax, does NOT validate the schema.
   * 
   * @param yamlContent - YAML string
   * @param location - File path or location for error messages
   * @returns Plain JavaScript object
   * @throws OrbytError if YAML syntax is invalid
   * @private
   */
  private static parseYAMLToObject(yamlContent: string, location: string): unknown {
    try {
      return YAML.parse(yamlContent);
    } catch (error) {
      // Detect parse error with proper error code
      const parseError = ErrorDetector.detect({
        type: 'parse_error',
        location,
        rawMessage: error instanceof Error ? error.message : String(error),
        data: {
          content: yamlContent.substring(0, 200), // First 200 chars for context
        },
      });

      throw parseError;
    }
  }

  /**
   * Parse JSON content to plain object (Phase 1: Loading)
   * 
   * This only checks JSON syntax, does NOT validate the schema.
   * 
   * @param jsonContent - JSON string
   * @param location - File path or location for error messages
   * @returns Plain JavaScript object
   * @throws OrbytError if JSON syntax is invalid
   * @private
   */
  private static parseJSONToObject(jsonContent: string, location: string): unknown {
    try {
      return JSON.parse(jsonContent);
    } catch (error) {
      // Detect parse error with proper error code
      const parseError = ErrorDetector.detect({
        type: 'parse_error',
        location,
        rawMessage: error instanceof Error ? error.message : String(error),
        data: {
          content: jsonContent.substring(0, 200),
        },
      });

      throw parseError;
    }
  }

  /**
   * Validate and parse workflow object (Phase 2: Validation)
   * 
   * This runs all validations: security, schema, steps.
   * Errors are automatically enriched with debug info by ErrorDetector.
   * 
   * @param workflowObject - Plain object from Phase 1
   * @param location - File path or location for error messages
   * @param logger - Optional EngineLogger for logging errors
   * @returns Parsed and validated workflow
   * @throws OrbytError if validation fails (with debug info attached)
   * @private
   */
  private static validateAndParse(
    workflowObject: unknown,
    location: string,
    logger?: EngineLogger
  ): ParsedWorkflow {
    try {
      // This runs all validation: security + schema + steps
      return WorkflowParser.parse(workflowObject);
    } catch (error) {
      // Convert to OrbytError if not already
      // ErrorDetector automatically enriches with debug info
      let orbytError: OrbytError;

      if (error instanceof OrbytError) {
        orbytError = error;
      } else {
        // Detect and classify the error (auto-enriches with debug info)
        orbytError = ErrorDetector.detectFromException(
          error instanceof Error ? error : new Error(String(error)),
          location
        );
      }

      // 1. Log to EngineLogger for structured logs (if available)
      if (logger) {
        logErrorToEngine(orbytError, logger);
      }

      // 2. Display detailed debug info that was attached by ErrorDetector
      //    The debug output includes: explanation, cause, fix steps, examples
      const debugOutput = (orbytError as any).__debugOutput;
      if (debugOutput) {
        console.error('\n' + debugOutput + '\n');
      }

      throw orbytError;
    }
  }
}
