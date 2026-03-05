# Orbyt Error System

Comprehensive error handling infrastructure with a two-layer diagnostic architecture, a strict 5-layer module hierarchy, and automatic debug-info enrichment.

## Architecture

### Two-Layer Error System

1. **Exit Codes** (Process Level)
   - From `@dev-ecosystem/core` package
   - Used by shell scripts and CI/CD pipelines
   - Ranges:
     - `0`: Success
     - `100-199`: User/Input errors (INVALID_SCHEMA, VALIDATION_FAILED)
     - `200-299`: Config/Environment errors
     - `300-399`: Execution errors (WORKFLOW_FAILED, STEP_FAILED)
     - `400-499`: Security errors
     - `500-599`: Internal/System errors

2. **Error Codes** (Diagnostic Level)
   - Orbyt-specific codes: `ORB-XX-NNN`
   - Categories:
     - `ORB-S-NNN`: Schema/Structure errors
     - `ORB-V-NNN`: Validation/Logic errors
     - `ORB-E-NNN`: Execution errors
     - `ORB-R-NNN`: Runtime errors

### 5-Layer Module Hierarchy

The error files form a strict dependency graph. Lower layers MUST NOT import from higher ones.

```
L0  OrbytError.ts        ← base class + ErrorDebugInfo interface
L1  ErrorCodes.ts        ← enums, helper functions (no local deps)
    FieldRegistry.ts     ← reserved/valid field lists (no local deps)
    TypoDetector.ts      ← fuzzy field-name matching (no local deps)
L2  WorkflowError.ts     ← SchemaError, ValidationError  (L0 + L1 only)
    StepError.ts         ← StepError                     (L0 + L1 only)
    SecurityErrors.ts    ← SecurityError                 (L0 + L1 only)
    SchedulerError.ts    ← SchedulerError                (L0 + L1 only)
L3  ErrorDebugger.ts     ← debug analysis + formatting   (L0 + L1 + logger)
    ErrorDetector.ts     ← auto-classification           (L0–L2 + L3 + FieldRegistry + TypoDetector)
L4  ErrorFormatter.ts    ← CLI formatters                (L0 + L1 + logger)
L5  ErrorHandler.ts      ← execution control             (L0 + L3(via proxy) + L4 only)
```

**Key rule**: `ErrorHandler` (L5) must not import `ErrorDebugger` (L3) directly.
All debug access goes through the three proxy methods on `ErrorDetector`.

### Workflow Loading Pipeline

Every load path enforces this order:

```
1. Syntax parse    (YAML/JSON → plain object)
2. SecurityCheck   (_validateSecurity — throws SecurityError immediately)
3. Schema validate (WorkflowParser.parse — Zod schema + unknwon-field checks)
4. ── WorkflowLoader returns ParsedWorkflow ──
5. InternalContextBuilder.build()  ← OrbytEngine only, right before execution
6. WorkflowExecutor.execute()
```

Users can never cause step 5 to be skipped or tampered with — internal fields
(`_internal`, `_billing`, `_identity`, etc.) are injected by the engine into
`execOptions.context`, not into the workflow object itself.

### Error Components

Every error includes:
- **code**: Structured error code (`ORB-XX-NNN`)
- **exitCode**: Process exit code from ecosystem-core
- **message**: Human-readable error message
- **description**: Detailed explanation (computed from code)
- **hint**: Suggested action to fix
- **path**: Location in workflow where error occurred
- **context**: Additional debugging data
- **severity**: CRITICAL | FATAL | ERROR | MEDIUM | LOW | WARNING | INFO

## Usage

### Creating Errors

Always use **factory methods** instead of creating errors manually:

```typescript
// ❌ Bad: Generic error
throw new Error('Unknown field');

// ✅ Good: Structured error with diagnostics
throw SchemaError.unknownField('foo', 'workflow.steps[0]', 'name');
```

### Error Classes

#### SchemaError (Structure Problems)
```typescript
// Unknown field
throw SchemaError.unknownField('foo', 'workflow.steps[0]', 'name');

// Invalid type
throw SchemaError.invalidType('timeout', 'number', 'string', 'workflow.steps[0]');

// Missing required field
throw SchemaError.missingField('version', 'workflow');

// Invalid enum value
throw SchemaError.invalidEnum('mode', 'invalid', ['serial', 'parallel'], 'workflow');

// Parse error
throw SchemaError.parseError('/path/to/workflow.yaml', 15, 8, 'Invalid YAML syntax');

// Reserved field
throw SchemaError.reservedField('_internal', 'workflow.context');
```

#### ValidationError (Logic Problems)
```typescript
// Duplicate step ID
throw ValidationError.duplicateId('step1', 'workflow.steps[2]', 'workflow.steps[0]');

// Unknown step reference
throw ValidationError.unknownStep('step99', 'workflow.steps[0].depends', ['step1', 'step2']);

// Circular dependency
throw ValidationError.circularDependency(['step1', 'step2', 'step3'], 'workflow.steps');

// Forward reference
throw ValidationError.forwardReference('step1', 'step3', 'workflow.steps[0]');

// Empty workflow
throw ValidationError.emptyWorkflow('/path/to/workflow.yaml');

// Missing input
throw ValidationError.missingInput('apiKey', 'workflow.steps[0]');

// Invalid condition
throw ValidationError.invalidCondition('invalid == syntax', 'workflow.steps[0].when', 'Syntax error');

// Invalid variable
throw ValidationError.invalidVariable('$unknown', 'workflow.steps[0]', ['$input', '$output']);
```

#### StepError (Execution Problems)
```typescript
// Step not found
throw StepError.notFound('step1', 'workflow.steps');

// Step timeout
throw StepError.timeout('step1', 30000, 'workflow.steps[0]');

// Execution failed
throw StepError.executionFailed('step1', new Error('Failed'), 'workflow.steps[0]');

// Dependency failed
throw StepError.dependencyFailed('step2', 'step1', 'workflow.steps[1]');

// Invalid config
throw StepError.invalidConfig('step1', 'Missing adapter', 'workflow.steps[0]');

// Duplicate ID
throw StepError.duplicateId('step1', 'workflow.steps[2]');
```

#### SecurityError (Security Violations)

`SecurityError` accepts only an `OrbytErrorDiagnostic` — there is no legacy
array constructor. Always use the factory methods:

```typescript
// Reserved field override (fieldType defaults to 'internal')
throw SecurityError.reservedFieldOverride('_internal', 'workflow.context', 'internal');

// Reserved annotation namespace
throw SecurityError.reservedAnnotation('orbyt.internal', 'workflow.metadata');

// Multiple protected fields detected
throw SecurityError.fieldManipulationDetected(
  [
    { field: '_billing', reason: 'Billing field is protected' },
    { field: '_execution', reason: 'Execution field is protected' }
  ],
  'workflow.context'
);

// Permission denied (requiredPermission is optional)
throw SecurityError.permissionDenied('workflow-secret', 'workflow.steps[0]', 'read:secrets');
```

Available `fieldType` values for `reservedFieldOverride`:
`'billing' | 'execution' | 'identity' | 'ownership' | 'usage' | 'internal'`

> **Note**: `SecurityViolationDetails[]` and `createSecurityError()` have been
> removed. If you held references to these, migrate to the factory methods above.

#### SchedulerError (Scheduler Problems)
```typescript
// Invalid cron expression
throw SchedulerError.invalidCron('* * * * * *', 'Too many fields');

// Schedule conflict
throw SchedulerError.scheduleConflict('workflow1', 'workflow2', 'Both use same resource');

// Trigger failed
throw SchedulerError.triggerFailed('webhook', new Error('Failed'), 'No endpoint');

// Max retries
throw SchedulerError.maxRetriesExceeded('workflow1', 5);
```

### Formatting Errors

```typescript
import {
  formatError,
  formatErrors,
  formatDetailedError,
  formatErrorSummary,
  formatErrorWithLocation,
  logErrorToEngine,
  logErrorToEngineWithContext,
} from './errors';

// Format single error (standard)
const formatted = formatError(error);
console.error(formatted);

// Format with verbose details
const verbose = formatError(error, true, true);
console.error(verbose);

// Format multiple errors
const multipleFormatted = formatErrors(errors, true, false);
console.error(multipleFormatted);

// Detailed diagnostic format (box-drawing, all properties)
const detailed = formatDetailedError(error);
console.error(detailed);

// One-line summary (for logs)
const summary = formatErrorSummary(error);
console.log(summary);

// With file path and line information
const located = formatErrorWithLocation(error, '/path/to/workflow.yaml');
console.error(located);

// Log directly to EngineLogger (uses workflow context automatically)
logErrorToEngineWithContext(error, logger);
```

### Debug Information (ErrorDetector / ErrorDebugger)

`ErrorDebugInfo` (defined in `OrbytError.ts`) is automatically attached to every
error produced by `ErrorDetector.detect()` as `error.__debugOutput` (a
pre-formatted string for `console.error`).

For structured access use the three proxy methods on `ErrorDetector`.
Do **not** import `ErrorDebugger` directly in handler or formatter code:

```typescript
import { ErrorDetector } from './errors';

// Structured debug object: explanation, cause, fixSteps, example, …
const debugInfo = ErrorDetector.analyzeDebugInfo(error);
console.log(debugInfo.explanation);
console.log(debugInfo.fixSteps);

// Pre-formatted terminal string (ANSI colours by default)
const debugText = ErrorDetector.formatDebugOutput(error);
console.error(debugText);

// One-liner for CI/logs
const summary = ErrorDetector.quickDebugSummary(error);
console.log(summary);

// All three accept an optional WorkflowContext to enrich the output:
const ctx = { name: 'my-workflow', filePath: './workflow.yaml' };
const rich = ErrorDetector.formatDebugOutput(error, ctx, /* useColors */ false);
```

### Auto-Detection

`ErrorDetector.detect()` classifies errors from context rather than requiring
manual error-code selection everywhere:

```typescript
import { ErrorDetector } from './errors';

// Classify from context (preferred)
const error = ErrorDetector.detect({
  type: 'unknown_field',
  field: 'metadta',
  location: 'workflow root',
});
// → SchemaError ORB-S-001 with typo suggestion "metadata"

// Classify from a raw exception (with line/col extraction)
const error2 = ErrorDetector.detectFromExceptionEnhanced(
  caughtError,
  '/path/to/workflow.yaml'
);
// → Correct error type with line/column in diagnostic.context
```

Supported `type` values: `unknown_field` | `reserved_field` | `invalid_type` |
`missing_field` | `invalid_enum` | `parse_error` | `invalid_adapter` |
`duplicate_id` | `unknown_step` | `circular_dependency` | `forward_reference` |
`empty_workflow` | `missing_input` | `invalid_condition` | `invalid_variable` |
`step_not_found` | `step_timeout` | `step_failed` | `step_dependency_failed` |
`step_invalid_config` | `permission_denied` | `unknown`

### Execution Control (ErrorHandler)

```typescript
import { ErrorHandler } from './errors';

try {
  await executeStep(step);
} catch (rawError) {
  const result = await ErrorHandler.handle(rawError, {
    location: `steps[${index}]`,
    stepId: step.id,
  });

  if (result.shouldStopWorkflow) throw result.error;
  if (result.shouldStopStep) continue; // skip to next step
  // otherwise: log and continue
}
```

Execution control is driven by severity:

| Severity | Behaviour |
|----------|-----------|
| `CRITICAL` / `FATAL` | Stop entire workflow immediately |
| `ERROR` | Stop entire workflow |
| `MEDIUM` | Stop current step, continue to next |
| `LOW` / `WARNING` / `INFO` | Log and continue |

## File Structure

```
errors/
├── OrbytError.ts          # L0 — base error class + ErrorDebugInfo interface
├── ErrorCodes.ts          # L1 — error codes, severity enum, helper functions
├── FieldRegistry.ts       # L1 — valid & reserved field registry  (internal, not exported)
├── TypoDetector.ts        # L1 — fuzzy field-name matching
├── WorkflowError.ts       # L2 — SchemaError, ValidationError
├── StepError.ts           # L2 — StepError
├── SecurityErrors.ts      # L2 — SecurityError
├── SchedulerError.ts      # L2 — SchedulerError
├── ErrorDebugger.ts       # L3 — structured debug analysis
├── ErrorDetector.ts       # L3 — auto-classification + debug proxies
├── ErrorFormatter.ts      # L4 — CLI / EngineLogger formatting utilities
├── ErrorHandler.ts        # L5 — execution-control orchestration
└── index.ts               # re-exports everything except FieldRegistry
```

> `FieldRegistry` is **internal only** — not re-exported from `index.ts` to
> avoid conflicts with `security/ReservedFields`.

## Adding New Errors

When you encounter a new error that needs a code:

1. **Add error code to `ErrorCodes.ts`**:
   ```typescript
   export enum OrbytErrorCode {
     // ... existing codes
     VALIDATION_NEW_ERROR = 'ORB-V-011',
   }
   ```

2. **Add description in `getErrorDescription()`**:
   ```typescript
   const descriptions: Record<OrbytErrorCode, string> = {
     // ... existing descriptions
     [OrbytErrorCode.VALIDATION_NEW_ERROR]: 'Description of new error',
   };
   ```

3. **Add suggested action in `getSuggestedAction()`**:
   ```typescript
   const actions: Record<OrbytErrorCode, string> = {
     // ... existing actions
     [OrbytErrorCode.VALIDATION_NEW_ERROR]: 'How to fix this error',
   };
   ```

4. **Create factory method in appropriate error class**:
   ```typescript
   // In ValidationError class
   static newError(param: string, path: string): ValidationError {
     return new ValidationError({
       code: OrbytErrorCode.VALIDATION_NEW_ERROR,
       message: `Error message with ${param}`,
       exitCode: ExitCodes.VALIDATION_FAILED,
       path,
       hint: 'How to fix this error',
       severity: ErrorSeverity.ERROR,
       context: { param },
     });
   }
   ```

5. **Use the factory method throughout engine**:
   ```typescript
   if (errorCondition) {
     throw ValidationError.newError('param-value', 'workflow.path');
   }
   ```

## Error Properties

All errors extend `OrbytError` and have these properties:

### Core Properties
- `code`: Error code (e.g., `ORB-S-001`)
- `message`: Error message
- `exitCode`: Process exit code
- `path`: Location where error occurred
- `hint`: Fix suggestion
- `severity`: ERROR, WARNING, INFO
- `diagnostic`: Full diagnostic object
- `timestamp`: When error occurred

### Computed Properties
- `description`: Detailed error description
- `isUserError`: Whether user can fix it
- `isRetryable`: Whether retry might succeed
- `category`: Error category (Schema, Validation, Execution, Runtime)

### Methods
- `toString()`: Standard format
- `toDetailedString()`: Comprehensive format with all diagnostics
- `toJSON()`: JSON representation for APIs
- `toSimpleObject()`: Simple object for CLI display
- `getExitCodeDescription()`: Human-readable exit code description

## Helper Functions

### ErrorCodes.ts
| Function | Description |
|----------|-------------|
| `getErrorDescription(code)` | Detailed human-readable description |
| `getExitCodeForError(code)` | Map ORB-XX-NNN to process exit code |
| `getSuggestedAction(code)` | Default fix suggestion |
| `getErrorCategory(code)` | `"Schema Error"` / `"Validation Error"` / … |
| `isUserError(code)` | `true` if the user can fix by editing the workflow |
| `isRetryable(code)` | `true` if a retry might succeed |
| `getExecutionControl(severity)` | Maps severity → `ExecutionControl` enum |
| `shouldStopWorkflow(severity)` | `true` for CRITICAL / FATAL / ERROR |
| `shouldStopStep(severity)` | `true` for CRITICAL through MEDIUM |

### TypoDetector.ts
| Function | Description |
|----------|-------------|
| `findClosestMatch(input, candidates, threshold?)` | Best single suggestion |
| `findMatches(input, candidates, limit?, threshold?)` | Top-N suggestions |

## Best Practices

✅ **DO**:
- Use factory methods for consistent error creation
- Include `path` information whenever it is available
- Provide actionable `hint` values when you know the fix
- Add `context` for debugging (field names, received/expected values, …)
- Use `ErrorDetector.detect()` for auto-classification rather than picking codes manually
- Reach debug capabilities through `ErrorDetector` proxy methods, not `ErrorDebugger` directly

❌ **DON'T**:
- Throw plain `Error` instances — use structured factory methods
- Throw errors without `path` or `context` when that information is available
- Import `ErrorDebugger` in `ErrorHandler` or any L5+ code
- Add reserved fields (`_internal`, `_billing`, etc.) anywhere except `OrbytEngine`
- Mix the validate phase and the internal-field injection phase

## Examples

### Complete Error Handling Flow

```typescript
// 1. Detect error condition
if (!workflow.version) {
  // 2. Throw structured error with factory method
  throw SchemaError.missingField('version', 'workflow');
}

// 3. Catch and format error
try {
  validateWorkflow(workflow);
} catch (error) {
  if (error instanceof OrbytError) {
    // 4. Format for CLI display
    console.error(formatError(error, true, false));
    
    // 5. Exit with proper code
    process.exit(error.exitCode);
  }
  throw error;
}
```

### Error with Rich Context

```typescript
throw ValidationError.unknownStep(
  'missing-step',
  'workflow.steps[0].depends',
  ['step1', 'step2', 'step3']
);

// Produces:
// ✗ ValidationError [ORB-V-002]
// at workflow.steps[0].depends
//
// Step "missing-step" referenced but not defined in workflow
//
// → Hint: Available step IDs: step1, step2, step3. Check for typos in the step ID.
```

## Testing

When testing error handling:

```typescript
import { SchemaError, OrbytErrorCode } from './errors';

test('throws unknown field error', () => {
  expect(() => {
    throw SchemaError.unknownField('badField', 'workflow.context');
  }).toThrow(SchemaError);
});

test('error has correct code', () => {
  const error = SchemaError.unknownField('badField', 'workflow.context');
  expect(error.code).toBe(OrbytErrorCode.SCHEMA_UNKNOWN_FIELD);
  expect(error.exitCode).toBe(ExitCodes.INVALID_SCHEMA);
  expect(error.path).toBe('workflow.context');
});
```

## Error Code Reference

| ORB Code | Meaning | Default exit code |
|----------|---------|-------------------|
| `ORB-S-001` | Unknown field | 103 INVALID_SCHEMA |
| `ORB-S-002` | Invalid type | 103 INVALID_SCHEMA |
| `ORB-S-003` | Missing required field | 103 INVALID_SCHEMA |
| `ORB-S-004` | Invalid enum value | 103 INVALID_SCHEMA |
| `ORB-S-005` | YAML/JSON parse error | 104 INVALID_FORMAT |
| `ORB-S-006` | Invalid format/pattern | 103 INVALID_SCHEMA |
| `ORB-S-007` | Reserved field detected | 406 SECURITY_VIOLATION |
| `ORB-V-001` | Duplicate step ID | 105 VALIDATION_FAILED |
| `ORB-V-002` | Unknown step reference | 105 VALIDATION_FAILED |
| `ORB-V-003` | Circular dependency | 106 CIRCULAR_DEPENDENCY |
| `ORB-V-004` | Invalid step order | 105 VALIDATION_FAILED |
| `ORB-V-005` | Forward reference | 105 VALIDATION_FAILED |
| `ORB-V-006` | Invalid variable | 105 VALIDATION_FAILED |
| `ORB-V-007` | Missing required input | 107 MISSING_REQUIRED_INPUT |
| `ORB-V-008` | Unknown adapter | 103 INVALID_SCHEMA |
| `ORB-V-009` | Empty workflow | 105 VALIDATION_FAILED |
| `ORB-V-010` | Invalid condition expression | 105 VALIDATION_FAILED |
| `ORB-E-001` | Step execution failed | 301 STEP_FAILED |
| `ORB-E-002` | Timeout exceeded | 302 TIMEOUT |
| `ORB-E-003` | Adapter error | 304 ADAPTER_FAILED |
| `ORB-E-004` | Workflow cancelled | 300 WORKFLOW_FAILED |
| `ORB-E-005` | Step dependency failed | 303 DEPENDENCY_FAILED |
| `ORB-E-006` | Condition check failed | 301 STEP_FAILED |
| `ORB-R-001` | File not found | 500 INTERNAL_ERROR |
| `ORB-R-002` | Permission denied / reserved field| 406 SECURITY_VIOLATION |
| `ORB-R-003` | Internal engine error | 500 INTERNAL_ERROR |
| `ORB-R-004` | Adapter not registered | 500 INTERNAL_ERROR |
| `ORB-R-005` | Resource exhausted | 500 INTERNAL_ERROR |

## Exit Code Reference

| Exit Code | Name | Usage |
|-----------|------|-------|
| 0 | SUCCESS | Successful execution |
| 103 | INVALID_SCHEMA | Schema structure problems |
| 104 | INVALID_FORMAT | YAML/JSON parse errors |
| 105 | VALIDATION_FAILED | Logic validation errors |
| 106 | CIRCULAR_DEPENDENCY | Circular dependency detected |
| 107 | MISSING_REQUIRED_INPUT | Required input not provided |
| 300 | WORKFLOW_FAILED | Workflow execution failed |
| 301 | STEP_FAILED | Step execution failed |
| 302 | TIMEOUT | Execution timeout |
| 303 | DEPENDENCY_FAILED | Step dependency failed |
| 304 | ADAPTER_FAILED | Adapter execution failed |
| 403 | PERMISSION_DENIED | Permission denied |
| 406 | SECURITY_VIOLATION | Security boundary violated |
| 500 | INTERNAL_ERROR | Internal engine error |

## Documentation

For more information:
- [Orbyt Documentation](../../../../internal-docs/ecosystem/)
- [Error Handling Guide](../../../../internal-docs/ecosystem/ecosystem-error-handling.md)
- [Exit Codes (ecosystem-core)](../../../../ecosystem-core/src/exit-codes/)
