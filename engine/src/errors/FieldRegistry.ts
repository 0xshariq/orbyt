/**
 * Workflow Field Registry
 * 
 * Central registry of all valid fields in the Orbyt workflow schema.
 * Used for typo detection and validation.
 * 
 * IMPORTANT: This registry must stay in sync with the schema in @dev-ecosystem/core
 * 
 * @module errors
 */

/**
 * Valid fields at workflow root level
 * MUST stay in sync with OrbytWorkflowSchema in @dev-ecosystem/core
 */
export const ROOT_FIELDS = [
  // Core required fields
  'version',
  'kind',
  'workflow',
  
  // Configuration fields
  'metadata',
  'annotations',
  'triggers',
  'secrets',
  'inputs',
  'context',
  'defaults',
  'policies',
  'permissions',
  'resources',
  'outputs',
  'on',
  'usage',
  
  // Production-ready universal fields
  'strategy',
  'profiles',
  'compliance',
  'provenance',
  'execution',
  'outputsSchema',
  'telemetry',
  'accounting',
  'compatibility',
  'failurePolicy',
  'rollback',
  'governance',
] as const;

/**
 * Valid fields in metadata object
 */
export const METADATA_FIELDS = [
  'name',
  'description',
  'tags',
  'owner',
  'version',
  'createdAt',
  'updatedAt',
  'v1',
  'future',
] as const;

/**
 * Valid fields in workflow body
 */
export const WORKFLOW_FIELDS = [
  'steps',
] as const;

/**
 * Valid fields in step definition
 * MUST stay in sync with StepSchema in @dev-ecosystem/core
 */
export const STEP_FIELDS = [
  // Core required fields
  'id',
  'uses',
  
  // Common fields
  'name',
  'with',
  'when',
  'needs',
  'retry',
  'timeout',
  'continueOnError',
  'outputs',
  'env',
  'usage',
  
  // Production-ready universal fields
  'ref',
  'requires',
  'hints',
  'contracts',
  'profiles',
  'onFailure',
  'telemetry',
  'rollback',
] as const;

/**
 * Valid fields in secrets config
 */
export const SECRETS_FIELDS = [
  'vault',
  'keys',
] as const;

/**
 * Valid fields in context config
 */
export const CONTEXT_FIELDS = [
  'env',
  'platform',
  'workspace',
] as const;

/**
 * Valid fields in defaults config
 */
export const DEFAULTS_FIELDS = [
  'retry',
  'timeout',
  'adapter',
] as const;

/**
 * Valid fields in policies config
 */
export const POLICIES_FIELDS = [
  'failure',
  'concurrency',
  'sandbox',
] as const;

/**
 * Valid fields in permissions config
 */
export const PERMISSIONS_FIELDS = [
  'fs',
  'network',
] as const;

/**
 * Valid fields in retry config
 */
export const RETRY_FIELDS = [
  'max',
  'backoff',
  'delay',
] as const;

/**
 * Valid fields in usage tracking config
 */
export const USAGE_FIELDS = [
  'track',
  'scope',
  'category',
  'billable',
  'product',
  'tags',
] as const;

/**
 * Valid fields in step usage config
 * MUST stay in sync with StepUsageSchema in @dev-ecosystem/core
 * 
 * Note: costHint is NOT included - use hints.cost instead (no duplicates)
 */
export const STEP_USAGE_FIELDS = [
  'billable',
  'unit',
  'weight',
] as const;

/**
 * Field registry map - maps path prefixes to valid fields
 */
export const FIELD_REGISTRY: Record<string, readonly string[]> = {
  'root': ROOT_FIELDS,
  'metadata': METADATA_FIELDS,
  'workflow': WORKFLOW_FIELDS,
  'workflow.steps': STEP_FIELDS,
  'secrets': SECRETS_FIELDS,
  'context': CONTEXT_FIELDS,
  'defaults': DEFAULTS_FIELDS,
  'policies': POLICIES_FIELDS,
  'permissions': PERMISSIONS_FIELDS,
  'retry': RETRY_FIELDS,
  'usage': USAGE_FIELDS,
  'step.usage': STEP_USAGE_FIELDS,
};

/**
 * Get valid fields for a given path
 * 
 * @param path - Field path (e.g., 'metadata', 'workflow.steps')
 * @returns Array of valid field names
 */
export function getValidFields(path: string): readonly string[] {
  // Check exact match first
  if (path in FIELD_REGISTRY) {
    return FIELD_REGISTRY[path];
  }
  
  // Check if it's a step path (workflow.steps[N])
  if (path.match(/^workflow\.steps\[\d+\]$/)) {
    return STEP_FIELDS;
  }
  
  // Check if it's nested under a known path
  for (const [key, fields] of Object.entries(FIELD_REGISTRY)) {
    if (path.startsWith(key + '.')) {
      return fields;
    }
  }
  
  // Default to root fields if path is unknown
  return ROOT_FIELDS;
}

/**
 * Check if a field is valid for a given path
 * 
 * @param field - Field name to check
 * @param path - Path context (e.g., 'metadata')
 * @returns True if field is valid in this context
 */
export function isValidField(field: string, path: string): boolean {
  const validFields = getValidFields(path);
  return validFields.includes(field as any);
}
