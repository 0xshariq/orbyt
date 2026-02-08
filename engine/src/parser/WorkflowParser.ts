/**
 * Workflow Parser
 * 
 * Main entry point for parsing workflows from YAML/JSON.
 * Orchestrates schema validation and step parsing.
 * 
 * @module parser
 */

import YAML from 'yaml';
import { SchemaValidator } from './SchemaValidator.js';
import { StepParser, type ParsedStep } from './StepParser.js';

/**
 * Parsed workflow ready for execution
 */
export interface ParsedWorkflow {
  /** Workflow metadata */
  name: string;
  description?: string;
  version?: string;
  
  /** Workflow steps */
  steps: ParsedStep[];
  
  /** Global workflow inputs */
  inputs?: Record<string, any>;
  
  /** Global environment variables */
  env?: Record<string, string>;
  
  /** Secret references */
  secrets?: {
    vault: string;
    keys: Record<string, string>;
  };
  
  /** Trigger configuration */
  triggers?: Array<{
    type: string;
    [key: string]: any;
  }>;
  
  /** Timeout for entire workflow */
  timeout?: number;
  
  /** Failure strategy */
  onFailure?: 'stop' | 'continue';
}

/**
 * Main workflow parser class
 */
export class WorkflowParser {
  /**
   * Parse workflow from raw object (already parsed YAML/JSON)
   * 
   * @param rawWorkflow - Raw workflow object
   * @returns Parsed workflow ready for execution
   */
  static parse(rawWorkflow: unknown): ParsedWorkflow {
    // Step 1: Validate against schema
    const validated = SchemaValidator.validate(rawWorkflow);
    
    // Step 2: Parse steps
    const steps = StepParser.parseAll(validated.steps);
    
    // Step 3: Validate step IDs are unique
    StepParser.validateUniqueIds(steps);
    
    // Step 4: Build parsed workflow
    const parsed: ParsedWorkflow = {
      name: validated.name,
      description: validated.description,
      version: validated.version,
      steps,
      inputs: validated.inputs,
      env: validated.env,
      secrets: validated.secrets,
      triggers: validated.triggers,
      timeout: validated.timeout,
      onFailure: validated.onFailure as 'stop' | 'continue',
    };
    
    return parsed;
  }

  /**
   * Parse workflow from YAML string
   * 
   * @param yamlContent - YAML string content
   * @returns Parsed workflow
   */
  static fromYAML(yamlContent: string): ParsedWorkflow {
    try {
      const parsed = YAML.parse(yamlContent);
      return this.parse(parsed);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`YAML parsing failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse workflow from JSON string
   * 
   * @param jsonContent - JSON string content
   * @returns Parsed workflow
   */
  static fromJSON(jsonContent: string): ParsedWorkflow {
    try {
      const parsed = JSON.parse(jsonContent);
      return this.parse(parsed);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`JSON parsing failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse workflow from file content (auto-detect format)
   * 
   * @param content - File content string
   * @param filename - Optional filename for format detection
   * @returns Parsed workflow
   */
  static fromFile(content: string, filename?: string): ParsedWorkflow {
    // Try to detect format from filename
    if (filename) {
      if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
        return this.fromYAML(content);
      }
      if (filename.endsWith('.json')) {
        return this.fromJSON(content);
      }
    }
    
    // Auto-detect: try YAML first (more common), then JSON
    try {
      return this.fromYAML(content);
    } catch {
      return this.fromJSON(content);
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
    name: string;
    description?: string;
    version?: string;
    stepCount: number;
  } {
    const validated = SchemaValidator.validate(rawWorkflow);
    
    return {
      name: validated.name,
      description: validated.description,
      version: validated.version,
      stepCount: validated.steps.length,
    };
  }
}
