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
 * Last synced: 2026-02-15
 */
export const ROOT_FIELDS = [
  // Core required fields (REQUIRED)
  'version',              // Schema version (semantic versioning)
  'kind',                 // Type of executable (workflow, pipeline, job, playbook, automation)
  'workflow',             // Core workflow execution definition
  
  // Optional metadata & documentation
  'metadata',             // Human-readable metadata
  'annotations',          // Zero-impact annotations for tooling
  
  // Execution configuration
  'triggers',             // Execution triggers (manual, cron, event, webhook)
  'secrets',              // External secret references
  'inputs',               // Runtime parameters
  'context',              // Runtime environment context
  'defaults',             // Default settings for all steps
  'policies',             // Execution policies
  'permissions',          // Security permissions
  'resources',            // Resource constraints (future)
  
  // Outputs & hooks
  'outputs',              // Final workflow outputs returned to caller
  'on',                   // Lifecycle hooks (success, failure, always) - future
  
  // Usage tracking
  'usage',                // Usage tracking configuration (production)
  
  // Production-ready universal fields
  'strategy',             // Execution strategy (production)
  'profiles',             // Environment-specific profiles (future)
  
  // Future-safe fields
  'compliance',           // Compliance metadata (future)
  'provenance',           // Provenance tracking (future: AI-generated workflows)
  'execution',            // Execution strategy (future: multi-environment)
  'outputsSchema',        // Output schema for validation (future)
  'telemetry',            // Telemetry controls (future)
  'accounting',           // Cost and usage accounting (future)
  'compatibility',        // Version compatibility (future)
  'failurePolicy',        // Failure semantics (future)
  'rollback',             // Rollback configuration (future)
  'governance',           // Governance metadata (future: enterprise)
] as const;

/**
 * Valid fields in metadata object
 * MUST stay in sync with MetadataSchema in @dev-ecosystem/core
 * Last synced: 2026-02-15
 */
export const METADATA_FIELDS = [
  'name',                 // Human-readable workflow name
  'description',          // Detailed workflow description
  'tags',                 // Categorization tags
  'owner',                // Owner team or individual
  'version',              // Workflow version (not schema version)
  'createdAt',            // Creation timestamp
  'updatedAt',            // Last update timestamp
  
  // Version tracking flags (future-safe)
  'v1',                   // Marks workflow as using v1 features
  'future',               // Marks workflow as using future/experimental features
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
 * Last synced: 2026-02-15
 */
export const STEP_FIELDS = [
  // Core required fields
  'id',                   // Unique step identifier (must start with letter)
  'uses',                 // Action to execute (namespace.action format)
  
  // Common optional fields
  'name',                 // Human-readable step name
  'with',                 // Adapter-specific input parameters
  'when',                 // Conditional execution expression
  'needs',                // Explicit step dependencies
  'retry',                // Step-specific retry config
  'timeout',              // Step execution timeout (e.g., '30s', '5m')
  'continueOnError',      // Continue workflow even if step fails
  'outputs',              // Map step outputs to named values
  'env',                  // Environment variables for this step
  
  // Usage tracking (production)
  'usage',                // Usage tracking override (per-step billing)
  
  // Production-ready universal fields
  'ref',                  // Versioned step reference (e.g., @^1)
  'requires',             // Capability requirements (future)
  'hints',                // Execution hints for optimization (future)
  'contracts',            // Data contracts for validation (future)
  'profiles',             // Environment-specific profiles (future)
  'onFailure',            // Failure handling configuration (future)
  'telemetry',            // Telemetry configuration (future)
  'rollback',             // Step-level rollback logic (future)
] as const;

/**
 * Valid fields in secrets config
 * MUST stay in sync with SecretsSchema in @dev-ecosystem/core
 * Last synced: 2026-02-15
 */
export const SECRETS_FIELDS = [
  'vault',                // Secret vault provider (default: 'vaulta')
  'keys',                 // Map of logical names to provider-specific secret paths
] as const;

/**
 * Valid fields in context config
 * MUST stay in sync with ContextSchema in @dev-ecosystem/core
 * Last synced: 2026-02-15
 */
export const CONTEXT_FIELDS = [
  'env',                  // Environment (local, dev, staging, prod)
  'platform',             // Platform identifier
  'workspace',            // Workspace path
] as const;

/**
 * Valid fields in defaults config
 * MUST stay in sync with DefaultsSchema in @dev-ecosystem/core
 * Last synced: 2026-02-15
 */
export const DEFAULTS_FIELDS = [
  'retry',                // Default retry configuration
  'timeout',              // Default step timeout (e.g., '30s')
  'adapter',              // Default adapter
] as const;

/**
 * Valid fields in policies config
 * MUST stay in sync with PoliciesSchema in @dev-ecosystem/core
 * Last synced: 2026-02-15
 */
export const POLICIES_FIELDS = [
  'failure',              // Failure policy (stop, continue, isolate)
  'concurrency',          // Max concurrent steps
  'sandbox',              // Sandbox level (none, basic, strict)
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
 * MUST stay in sync with RetryConfigSchema in @dev-ecosystem/core
 * Last synced: 2026-02-15
 */
export const RETRY_FIELDS = [
  'max',                  // Maximum retry attempts
  'backoff',              // Backoff strategy (linear, exponential)
  'delay',                // Initial delay in milliseconds
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

// ============================================================================
// RESERVED/INTERNAL FIELDS (Engine-controlled, users cannot set these)
// ============================================================================

/**
 * Reserved workflow-level fields (engine-controlled, NEVER user-set)
 * These fields would trigger SecurityError if found in user YAML
 * MUST stay in sync with RESERVED_WORKFLOW_FIELDS in security/ReservedFields.ts
 * Last synced: 2026-02-15
 */
export const RESERVED_WORKFLOW_FIELDS = [
  '_internal',           // Internal execution context
  '_identity',           // Execution identity (executionId, runId, traceId)
  '_ownership',          // Ownership context (userId, workspaceId, subscriptionId)
  '_billing',            // Billing context (billingId, pricingTier, costCalculated)
  '_usage',              // Usage tracking counters
  '_audit',              // Audit trail fields
  '_system',             // System fields
  '_engine',             // Engine metadata
  '_execution',          // Execution context (internal)
  '_runtime',            // Runtime context (internal)
  '_security',           // Security context
  '_metadata',           // Internal metadata
] as const;

/**
 * Reserved context fields (engine-controlled, users cannot set in context)
 * MUST stay in sync with RESERVED_CONTEXT_FIELDS in security/ReservedFields.ts
 * Last synced: 2026-02-15
 */
export const RESERVED_CONTEXT_FIELDS = [
  '_internal',
  '_identity',
  '_ownership',
  '_billing',
  '_usage',
  '_audit',
  '_system',
  '_engine',
  '_security',
  'executionId',
  'runId',
  'traceId',
  'userId',
  'workspaceId',
  'subscriptionId',
  'subscriptionTier',
  'billingId',
  'billingMode',
  'pricingTier',
  'pricingModel',
  'billingSnapshot',
] as const;

/**
 * Reserved step fields (engine-controlled, users cannot set in steps)
 * MUST stay in sync with RESERVED_STEP_FIELDS in security/ReservedFields.ts
 * Last synced: 2026-02-15
 */
export const RESERVED_STEP_FIELDS = [
  '_internal',
  '_billing',
  '_usage',
  '_audit',
  'executionId',
  'runId',
  'stepExecutionId',
] as const;

/**
 * Reserved annotation prefixes (engine-controlled namespaces)
 * MUST stay in sync with RESERVED_ANNOTATION_PREFIXES in security/ReservedFields.ts
 * Last synced: 2026-02-15
 */
export const RESERVED_ANNOTATION_PREFIXES = [
  'engine.',
  'system.',
  'internal.',
  'billing.',
  'audit.',
  'security.',
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
