# Error System Usage Examples

## Smart Error Detection and Debugging

### 1. Using ErrorDetector (Smart Classification)

The ErrorDetector automatically identifies error types and creates appropriate errors:

```typescript
import { ErrorDetector } from '@orbyt/engine/errors';

// ❌ Old Way: Manual error classification
if (!workflow.version) {
  throw SchemaError.missingField('version', 'workflow');
}

// ✅ New Way: Smart detection
const error = ErrorDetector.detect({
  type: 'missing_field',
  field: 'version',
  location: 'workflow'
});
throw error;
```

### 2. Auto-Detection from Exceptions

Let the detector analyze raw exceptions:

```typescript
try {
  const workflow = parseYAML(content);
} catch (err) {
  // Detector automatically classifies the error
  const orbytError = ErrorDetector.detectFromException(err, workflowPath);
  throw orbytError;
}
```

### 3. Reserved Field Detection

ErrorDetector automatically detects reserved fields:

```typescript
// This automatically creates a SecurityError
const error = ErrorDetector.detect({
  type: 'unknown_field',  // Will auto-detect it's reserved
  field: '_internal',
  location: 'workflow.context'
});
// → SecurityError: Reserved field "_internal" cannot be set
```

### 4. Using ErrorDebugger (Smart Fixes)

Get intelligent fix suggestions for any error:

```typescript
import { ErrorDebugger } from '@orbyt/engine/errors';

// Analyze an error
const debugInfo = ErrorDebugger.analyze(error);

console.log('What went wrong:', debugInfo.explanation);
console.log('Why:', debugInfo.cause);
console.log('How to fix:');
debugInfo.fixSteps.forEach((step, i) => {
  console.log(`${i + 1}. ${step}`);
});
```

### 5. Formatted Debug Output

Get beautifully formatted debug output:

```typescript
// For CLI display
const formatted = ErrorDebugger.format(error, true); // with colors
console.error(formatted);

// Quick one-liner
const quick = ErrorDebugger.quickDebug(error);
console.error(quick); // → 💡 Add "version" field to your workflow
```

### 6. Complete Error Flow (Engine)

How the engine uses these systems:

```typescript
// In workflow validator
export async function validateWorkflow(content: string, filePath: string) {
  try {
    const workflow = await parse(content);
    
    // Detect various issues
    if (!workflow.steps || workflow.steps.length === 0) {
      throw ErrorDetector.detect({
        type: 'empty_workflow',
        location: filePath
      });
    }
    
    // Check for reserved fields
    for (const field of Object.keys(workflow)) {
      if (field.startsWith('_')) {
        throw ErrorDetector.detect({
          type: 'reserved_field',
          field,
          location: `workflow.${field}`
        });
      }
    }
    
  } catch (error) {
    // Convert any exception to proper Orbyt error
    const orbytError = error instanceof OrbytError 
      ? error 
      : ErrorDetector.detectFromException(error, filePath);
    
    // Show debug information
    console.error(ErrorDebugger.format(orbytError));
    
    throw orbytError;
  }
}
```

### 7. CLI Integration

Using in CLI commands:

```typescript
// In validate command
try {
  await validateWorkflow(content, filePath);
  console.log('✓ Workflow is valid');
} catch (error) {
  const orbytError = error instanceof OrbytError
    ? error
    : ErrorDetector.detectFromException(error);
  
  // Show formatted error with debug info
  console.error('\n' + ErrorDebugger.format(orbytError) + '\n');
  
  process.exit(orbytError.exitCode);
}
```

### 8. API Integration

Using in REST APIs:

```typescript
app.post('/api/workflows/validate', async (req, res) => {
  try {
    const result = await validateWorkflow(req.body.workflow);
    res.json({ success: true, result });
  } catch (error) {
    const orbytError = error instanceof OrbytError
      ? error
      : ErrorDetector.detectFromException(error);
    
    // Get debug info for API response
    const debug = ErrorDebugger.analyze(orbytError);
    
    res.status(400).json({
      success: false,
      error: {
        code: orbytError.code,
        message: orbytError.message,
        hint: orbytError.hint,
        path: orbytError.path,
        debug: {
          explanation: debug.explanation,
          cause: debug.cause,
          fixSteps: debug.fixSteps,
          estimatedFixTime: debug.estimatedFixTime
        }
      }
    });
  }
});
```

### 9. SDK Integration

Using in TypeScript SDK:

```typescript
// In SDK client
export class OrbytClient {
  async validateWorkflow(workflow: Workflow): Promise<ValidationResult> {
    try {
      // ... validation logic
    } catch (error) {
      const orbytError = error instanceof OrbytError
        ? error
        : ErrorDetector.detectFromException(error);
      
      // Attach debug info to error
      const debug = ErrorDebugger.analyze(orbytError);
      
      throw new SDKError({
        ...orbytError,
        debug,
        userFriendlyMessage: debug.explanation,
        quickFix: debug.fixSteps[0]
      });
    }
  }
}
```

### 10. Context-Rich Detection

Provide rich context for better errors:

```typescript
// Detect with full context
const error = ErrorDetector.detect({
  type: 'invalid_type',
  field: 'timeout',
  location: 'workflow.steps[2].timeout',
  expected: 'number (seconds)',
  actual: 'string',
  data: {
    value: '30s',
    suggestion: 'Use 30 instead of "30s"'
  }
});

// Debug info will include context-specific suggestions
const debug = ErrorDebugger.analyze(error);
// → fixSteps includes: "Change type to: number (seconds)"
```

## Benefits

### For Engine Developers

✅ **Less Boilerplate**: Don't manually classify every error

✅ **Consistent Errors**: All errors follow same detection logic

✅ **Automatic Enhancement**: Reserved field detection is automatic

### For CLI Users

✅ **Better Error Messages**: Get clear explanations and fix steps

✅ **Faster Debugging**: Estimated fix time helps prioritize

✅ **Guided Solutions**: Step-by-step instructions

### For API/SDK Users

✅ **Structured Errors**: Consistent error format across all interfaces

✅ **Debug Information**: Rich diagnostic data in responses

✅ **User-Friendly**: Non-technical explanations available

## Next Steps

The foundation is now in place. You can extend by:

1. **Adding More Scenarios**: Add new error types to ErrorDetector
2. **Enhanced Debug Info**: Add more detailed fix suggestions to ErrorDebugger
3. **AI Integration**: Use debug info to train AI models for even smarter suggestions
4. **Telemetry**: Track which errors occur most and improve their messages
