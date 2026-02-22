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
import { StepParser } from './StepParser.js';
import type { WorkflowDefinitionZod } from '@dev-ecosystem/core';
import { LoggerManager } from '../logging/LoggerManager.js';
import { ParsedWorkflow } from '../types/core-types.js';

/**
 * Main workflow parser class
 */
export class WorkflowParser {
  /**
   * Parse workflow from raw object (already parsed YAML/JSON)
   * 
   * @param rawWorkflow - Raw workflow object
   * @returns Parsed workflow ready for execution
   * @throws {SecurityError} If reserved fields are detected
   */
  static parse(rawWorkflow: unknown): ParsedWorkflow {
    const logger = LoggerManager.getLogger();
    const startTime = Date.now();
    
    try {
      // Step 1: Validate against schema (with enhanced diagnostics)
      logger.parsingStarted('workflow', 'object');
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

      const duration = Date.now() - startTime;
      logger.parsingCompleted('workflow', duration, {
        stepCount: steps.length,
        hasInputs: !!validated.inputs,
        hasTriggers: !!validated.triggers,
      });

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
   * Parse workflow from YAML string
   * 
   * @param yamlContent - YAML string content
   * @returns Parsed workflow
   */
  static fromYAML(yamlContent: string): ParsedWorkflow {
    const logger = LoggerManager.getLogger();
    try {
      logger.parsingStarted('YAML', 'yaml');
      const parsed = YAML.parse(yamlContent);
      return this.parse(parsed);
    } catch (error) {
      if (error instanceof Error) {
        logger.parsingFailed('YAML', error);
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
    const logger = LoggerManager.getLogger();
    try {
      logger.parsingStarted('JSON', 'json');
      const parsed = JSON.parse(jsonContent);
      return this.parse(parsed);
    } catch (error) {
      if (error instanceof Error) {
        logger.parsingFailed('JSON', error);
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
