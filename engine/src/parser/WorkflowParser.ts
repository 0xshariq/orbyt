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
import { validateWorkflowSecurity, formatSecurityViolations } from '../security/ReservedFields.js';
import type { WorkflowDefinitionZod } from '@dev-ecosystem/core';

/**
 * Parsed workflow ready for execution
 */
export interface ParsedWorkflow {
  /** Workflow metadata */
  name?: string;
  description?: string;
  version: string;
  kind: string;
  tags?: string[];
  owner?: string;
  
  /** Metadata object (if provided separately) */
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
    owner?: string;
    version?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  
  /** Annotations for AI and UI hints */
  annotations?: {
    'ai.intent'?: string;
    'ui.group'?: string;
    'ui.icon'?: string;
    [key: string]: any;
  };
  
  /** Workflow steps */
  steps: ParsedStep[];
  
  /** Global workflow inputs */
  inputs?: Record<string, any>;
  
  /** Global environment variables */
  context?: Record<string, any>;
  
  /** Secret references */
  secrets?: {
    vault?: string;
    refs?: Record<string, string>;
  };
  
  /** Trigger configuration */
  triggers?: Array<{
    type: string;
    [key: string]: any;
  }>;
  
  /** Defaults */
  defaults?: {
    retry?: {
      max: number;
      backoff?: 'linear' | 'exponential';
      delay?: number;
    };
    timeout?: string;
    adapter?: string;
  };
  
  /** Policies */
  policies?: {
    failure?: 'stop' | 'continue' | 'isolate';
    concurrency?: number;
    sandbox?: 'none' | 'basic' | 'strict';
  };
  
  /** Permissions */
  permissions?: any;
  
  /** Resources */
  resources?: any;
  
  /** Outputs */
  outputs?: Record<string, string>;
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
    // Step 0: SECURITY CHECK - Validate NO reserved fields present
    // This runs BEFORE any other validation to prevent internal field manipulation
    const securityValidation = validateWorkflowSecurity(rawWorkflow);
    if (!securityValidation.valid) {
      const errorMessage = formatSecurityViolations(securityValidation);
      throw new Error(errorMessage);
    }
    
    // Step 1: Validate against schema (with enhanced diagnostics)
    const validated: WorkflowDefinitionZod = SchemaValidator.validate(rawWorkflow);
    
    // Step 2: Parse steps from nested workflow.steps
    const steps = StepParser.parseAll(validated.workflow.steps);
    
    // Step 3: Run comprehensive step validations
    StepParser.validateAll(steps);
    
    // Step 4: Build parsed workflow
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
}
