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
import { WorkflowParser } from '../parser/WorkflowParser.js';
import { SecurityError } from '../errors/SecurityErrors.js';
import { getAllReservedFieldViolations } from '../security/ReservedFields.js';
import { ErrorDetector } from '../errors/ErrorDetector.js';
import { OrbytError } from '../errors/OrbytError.js';
import { logErrorToEngineWithContext } from '../errors/ErrorFormatter.js';
import type { EngineLogger } from '../logging/EngineLogger.js';
import { LoggerManager } from '../logging/index.js';
import { ParsedWorkflow, SecurityErrorCode, WorkflowLoadOptions } from '../types/core-types.js';

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

    // Step 3: Detect format and parse to object (YAML/JSON)
    const isYAML = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
    const isJSON = filePath.endsWith('.json');
    let workflowObject: any;
    try {
      if (isYAML) {
        workflowObject = this.parseYAMLToObject(content, resolvedPath);
      } else if (isJSON) {
        workflowObject = this.parseJSONToObject(content, resolvedPath);
      } else {
        try {
          workflowObject = this.parseYAMLToObject(content, resolvedPath);
        } catch {
          workflowObject = this.parseJSONToObject(content, resolvedPath);
        }
      }
    } catch (err) {
      throw err;
    }

    // Step 4: SECURITY - Check for internal/reserved fields before any validation
    WorkflowLoader._validateSecurity(workflowObject);

    // Step 5: Validate and parse (schema, steps, etc)
    let parsed: ParsedWorkflow = this.validateAndParse(workflowObject, resolvedPath, options.logger);

    // Step 6: Inject internal fields (engine-only, after validation)
    // Example: parsed._internal = InternalContextBuilder.build(...);
    // (Actual injection logic should be implemented here as needed)

    // Step 7: Apply variables if provided
    if (options.variables && parsed.inputs) {
      parsed.inputs = { ...parsed.inputs, ...options.variables };
    }

    // Set workflow context so all downstream logs (runtime, analysis, security)
    // are automatically enriched — cleared by OrbytEngine after the operation.
    WorkflowLoader._setContext(parsed, resolvedPath);

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
  static async fromYAML(
    yamlContent: string,
    filePath?: string,
    logger?: EngineLogger
  ): Promise<ParsedWorkflow> {
    const location = filePath || 'YAML content';

    // PHASE 1: LOADING
    // Parse YAML syntax to plain object (no validation yet)
    const workflowObject = this.parseYAMLToObject(yamlContent, location);

    // PHASE 2: VALIDATION — Security check first, then schema
    WorkflowLoader._validateSecurity(workflowObject);
    const parsed = this.validateAndParse(workflowObject, location, logger);
    WorkflowLoader._setContext(parsed, filePath);
    return parsed;
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
  static async fromJSON(
    jsonContent: string,
    filePath?: string,
    logger?: EngineLogger
  ): Promise<ParsedWorkflow> {
    const location = filePath || 'JSON content';

    // PHASE 1: LOADING
    // Parse JSON syntax to plain object (no validation yet)
    const workflowObject = this.parseJSONToObject(jsonContent, location);

    // PHASE 2: VALIDATION — Security check first, then schema
    WorkflowLoader._validateSecurity(workflowObject);
    const parsed = this.validateAndParse(workflowObject, location, logger);
    WorkflowLoader._setContext(parsed, filePath);
    return parsed;
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
  static async fromObject(workflowObject: unknown, logger?: EngineLogger): Promise<ParsedWorkflow> {
    // Object is already loaded — run security check then schema validation
    WorkflowLoader._validateSecurity(workflowObject);
    const parsed = this.validateAndParse(workflowObject, 'workflow object', logger);
    WorkflowLoader._setContext(parsed);
    return parsed;
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
    return await this.fromYAML(source, 'inline YAML', options.logger);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Check a parsed workflow object for reserved/internal field violations.
   *
   * Called immediately after Phase 1 (syntax parse) and before Phase 2
   * (schema validation) in every loading path.  Throws SecurityError on the
   * first violation so execution never reaches the schema validator with
   * tampered data.
   *
   * @param workflowObject - Plain object from the parser
   * @throws SecurityError if any engine-reserved field is found
   * @private
   */
  private static _validateSecurity(workflowObject: unknown): void {
    if (!workflowObject || typeof workflowObject !== 'object') return;

    const violations = getAllReservedFieldViolations(workflowObject);
    if (violations.length === 0) return;

    const v = violations[0];
    let fieldType: 'billing' | 'execution' | 'identity' | 'ownership' | 'usage' | 'internal' = 'internal';
    const code = v.code;
    if (code === SecurityErrorCode.BILLING_FIELD_OVERRIDE)    fieldType = 'billing';
    else if (code === SecurityErrorCode.IDENTITY_FIELD_OVERRIDE)   fieldType = 'identity';
    else if (code === SecurityErrorCode.OWNERSHIP_FIELD_OVERRIDE)  fieldType = 'ownership';
    else if (code === SecurityErrorCode.USAGE_COUNTER_OVERRIDE)    fieldType = 'usage';

    const err = SecurityError.reservedFieldOverride(v.field, v.location, fieldType);
    (err as any).reason = v.reason;
    (err as any).allViolations = violations;
    throw err;
  }

  /**
   * Set workflow context on the LoggerManager after every successful parse.
   *
   * This ensures all subsequent logs (runtime, analysis, security categories)
   * are automatically enriched with workflow metadata without the caller
   * needing to set it manually.
   *
   * System logs do not need this context and are unaffected.
   * Context is cleared by OrbytEngine after each operation.
   *
   * @param parsed - Successfully parsed workflow
   * @param filePath - Resolved file path (only available for file-based loads)
   * @private
   */
  private static _setContext(parsed: ParsedWorkflow, filePath?: string): void {
    LoggerManager.setWorkflowContext({
      name: parsed.name ?? parsed.metadata?.name,
      version: parsed.version,
      kind: parsed.kind,
      description: parsed.description ?? parsed.metadata?.description,
      stepCount: parsed.steps?.length,
      tags: parsed.tags ?? parsed.metadata?.tags,
      filePath,
    });
  }

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
      // Extract line/col from the yaml library's linePos property (if present)
      // so formatters can point the user to the exact location in the file.
      const yamlErr = error as any;
      const linePos = Array.isArray(yamlErr.linePos) ? yamlErr.linePos[0] as { line?: number; col?: number } : undefined;

      const parseError = ErrorDetector.detect({
        type: 'parse_error',
        location,
        rawMessage: error instanceof Error ? error.message : String(error),
        data: {
          content: yamlContent.substring(0, 200), // First 200 chars for context
          line: linePos?.line,
          column: linePos?.col,
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
        // Use enhanced detection so line/col are extracted for parse errors
        orbytError = ErrorDetector.detectFromExceptionEnhanced(
          error instanceof Error ? error : new Error(String(error)),
          location
        );
      }

      // 1. Log to EngineLogger — use context-aware variant so sourceFile,
      //    workflowName, and stepCount are attached to the log entry.
      if (logger) {
        logErrorToEngineWithContext(orbytError, logger);
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
  // Exported static methods for engine and external use
  static loadFromFile = WorkflowLoader.fromFile;
  static loadFromYAML = WorkflowLoader.fromYAML;
  static loadFromJSON = WorkflowLoader.fromJSON;
  static loadFromObject = WorkflowLoader.fromObject;
  static validateWorkflow = WorkflowLoader.validate;
  static loadFromString = WorkflowLoader.fromString;
}
