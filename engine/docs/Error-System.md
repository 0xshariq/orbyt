# Orbyt Error System

Comprehensive error handling infrastructure with two-layer error architecture for detailed diagnostics and proper process exit codes.

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

### Error Components

Every error includes:
- **code**: Structured error code (`ORB-XX-NNN`)
- **exitCode**: Process exit code from ecosystem-core
- **message**: Human-readable error message
- **description**: Detailed explanation
- **hint**: Suggested action to fix
- **path**: Location in workflow where error occurred
- **context**: Additional debugging data
- **severity**: ERROR, WARNING, INFO

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
```typescript
// Reserved field override
throw SecurityError.reservedFieldOverride('_internal', 'workflow.context', 'internal');

// Reserved annotation
throw SecurityError.reservedAnnotation('orbyt.internal', 'workflow.metadata');

// Field manipulation detected
throw SecurityError.fieldManipulationDetected(
  [
    { field: '_billing', reason: 'Billing field is protected' },
    { field: '_execution', reason: 'Execution field is protected' }
  ],
  'workflow.context'
);

// Permission denied
throw SecurityError.permissionDenied('workflow-secret', 'workflow.steps[0]', 'read:secrets');
```

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
import { formatError, formatErrors, formatDetailedError, formatErrorSummary } from './errors';

// Format single error (standard)
const formatted = formatError(error);
console.error(formatted);

// Format with verbose details
const verbose = formatError(error, true, true);
console.error(verbose);

// Format multiple errors
const multipleFormatted = formatErrors(errors, true, false);
console.error(multipleFormatted);

// Detailed diagnostic format
const detailed = formatDetailedError(error);
console.error(detailed);

// One-line summary (for logs)
const summary = formatErrorSummary(error);
console.log(summary);
```

## File Structure

```
errors/
├── ErrorCodes.ts          # Error code definitions and helper functions
├── OrbytError.ts          # Base error class with diagnostics
├── WorkflowError.ts       # Schema and validation errors
├── StepError.ts           # Step execution errors
├── SchedulerError.ts      # Scheduler and trigger errors
├── SecurityErrors.ts      # Security violation errors
├── ErrorFormatter.ts      # CLI formatting utilities
├── FieldRegistry.ts       # Valid workflow field registry
├── TypoDetector.ts        # Typo detection for field names
├── index.ts               # Exports all error classes
└── README.md              # This file
```

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
- `getErrorDescription(code)`: Get detailed error description
- `getExitCodeForError(code)`: Map error code to exit code
- `getSuggestedAction(code)`: Get fix suggestion
- `getErrorCategory(code)`: Get error category
- `isUserError(code)`: Check if user-fixable
- `isRetryable(code)`: Check if retryable

## Best Practices

✅ **DO**:
- Use factory methods for consistent error creation
- Include path information when available
- Provide actionable hints for fixing errors
- Add context for debugging
- Use appropriate exit codes

❌ **DON'T**:
- Create generic `Error` instances
- Throw errors without context
- Use wrong exit codes
- Skip hints when you know the fix
- Combine multiple error types in one

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
