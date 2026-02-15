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
import { ErrorDebugger } from '../errors/ErrorDebugger.js';
import { OrbytError } from '../errors/OrbytError.js';

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
      parsed = this.fromYAML(content, resolvedPath);
    } else if (isJSON) {
      parsed = this.fromJSON(content, resolvedPath);
    } else {
      // Try YAML first (more common for workflows), fallback to JSON
      try {
        parsed = this.fromYAML(content, resolvedPath);
      } catch {
        parsed = this.fromJSON(content, resolvedPath);
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
   * 1. Validate YAML syntax
   * 2. Parse YAML to object
   * 3. Validate security (no reserved fields)
   * 4. Validate schema (Zod)
   * 5. Return parsed workflow
   * 
   * AUTO ERROR DETECTION:
   * - Automatically detects error types
   * - Provides smart fix suggestions
   * - Logs errors appropriately
   * 
   * @param yamlContent - YAML string content
   * @param filePath - Optional file path for better error messages
   * @returns Parsed workflow
   * @throws OrbytError with proper error code and debug info
   */
  static fromYAML(yamlContent: string, filePath?: string): ParsedWorkflow {
    try {
      // Step 1: Validate YAML syntax
      let parsedObject: any;
      try {
        parsedObject = YAML.parse(yamlContent);
      } catch (error) {
        // Auto-detect parse error with proper error code
        const parseError = ErrorDetector.detect({
          type: 'parse_error',
          location: filePath || 'YAML content',
          rawMessage: error instanceof Error ? error.message : String(error),
          data: {
            content: yamlContent.substring(0, 200) // First 200 chars for context
          }
        });
        
        // Show debug information
        console.error('\n' + ErrorDebugger.format(parseError) + '\n');
        
        throw parseError;
      }

      // Step 2: Validate and parse through WorkflowParser
      // This handles: security validation, schema validation, step parsing
      try {
        return WorkflowParser.parse(parsedObject);
      } catch (error) {
        // If it's already an OrbytError, enhance it with debug info
        if (error instanceof OrbytError) {
          console.error('\n' + ErrorDebugger.format(error) + '\n');
          throw error;
        }
        
        // Otherwise, detect and classify the error
        const detectedError = ErrorDetector.detectFromException(
          error instanceof Error ? error : new Error(String(error)),
          filePath || 'workflow'
        );
        
        console.error('\n' + ErrorDebugger.format(detectedError) + '\n');
        
        throw detectedError;
      }
    } catch (error) {
      // Final catch: ensure we always throw an OrbytError
      if (error instanceof OrbytError) {
        throw error;
      }
      
      // Convert any unexpected error to OrbytError
      const finalError = ErrorDetector.detectFromException(
        error instanceof Error ? error : new Error(String(error)),
        filePath || 'workflow'
      );
      
      console.error('\n' + ErrorDebugger.format(finalError) + '\n');
      throw finalError;
    }
  }

  /**
   * Parse workflow from JSON string
   * 
   * AUTO ERROR DETECTION:
   * - Automatically detects error types
   * - Provides smart fix suggestions
   * - Logs errors appropriately
   * 
   * @param jsonContent - JSON string content
   * @param filePath - Optional file path for better error messages
   * @returns Parsed workflow
   * @throws OrbytError with proper error code and debug info
   */
  static fromJSON(jsonContent: string, filePath?: string): ParsedWorkflow {
    try {
      // Step 1: Validate JSON syntax
      let parsedObject: any;
      try {
        parsedObject = JSON.parse(jsonContent);
      } catch (error) {
        // Auto-detect parse error
        const parseError = ErrorDetector.detect({
          type: 'parse_error',
          location: filePath || 'JSON content',
          rawMessage: error instanceof Error ? error.message : String(error),
          data: {
            content: jsonContent.substring(0, 200)
          }
        });
        
        console.error('\n' + ErrorDebugger.format(parseError) + '\n');
        throw parseError;
      }

      // Step 2: Validate and parse through WorkflowParser
      try {
        return WorkflowParser.parse(parsedObject);
      } catch (error) {
        if (error instanceof OrbytError) {
          console.error('\n' + ErrorDebugger.format(error) + '\n');
          throw error;
        }
        
        const detectedError = ErrorDetector.detectFromException(
          error instanceof Error ? error : new Error(String(error)),
          filePath || 'workflow'
        );
        
        console.error('\n' + ErrorDebugger.format(detectedError) + '\n');
        throw detectedError;
      }
    } catch (error) {
      if (error instanceof OrbytError) {
        throw error;
      }
      
      const finalError = ErrorDetector.detectFromException(
        error instanceof Error ? error : new Error(String(error)),
        filePath || 'workflow'
      );
      
      console.error('\n' + ErrorDebugger.format(finalError) + '\n');
      throw finalError;
    }
  }

  /**
   * Parse workflow from object
   * 
   * Useful when workflow is already parsed (e.g., from API request body)
   * 
   * AUTO ERROR DETECTION:
   * - Automatically validates and detects errors
   * - Provides proper error codes and debug info
   * 
   * @param workflowObject - Workflow object
   * @returns Parsed workflow
   * @throws OrbytError with proper error code and debug info
   */
  static fromObject(workflowObject: unknown): ParsedWorkflow {
    try {
      return WorkflowParser.parse(workflowObject);
    } catch (error) {
      // Auto-detect and enhance the error
      if (error instanceof OrbytError) {
        console.error('\n' + ErrorDebugger.format(error) + '\n');
        throw error;
      }
      
      const detectedError = ErrorDetector.detectFromException(
        error instanceof Error ? error : new Error(String(error)),
        'workflow'
      );
      
      console.error('\n' + ErrorDebugger.format(detectedError) + '\n');
      throw detectedError;
    }
  }

  /**
   * Validate a workflow without returning parsed result
   * 
   * Useful for validation-only operations
   * 
   * @param source - File path, YAML string, JSON string, or object
   * @returns True if valid
   * @throws Error if invalid
   */
  static async validate(source: string | unknown): Promise<boolean> {
    if (typeof source === 'string') {
      // Check if it's a file path
      if (existsSync(source)) {
        await this.fromFile(source);
      } else {
        // Try parsing as YAML/JSON
        try {
          this.fromYAML(source);
        } catch {
          this.fromJSON(source);
        }
      }
    } else {
      this.fromObject(source);
    }
    
    return true;
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
   * AUTO ERROR DETECTION:
   * - All errors are automatically detected with proper codes
   * 
   * @param source - File path or YAML/JSON content
   * @param options - Load options
   * @returns Parsed workflow
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
    return this.fromYAML(source, 'inline YAML');
  }
}
