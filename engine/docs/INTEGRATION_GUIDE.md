# ErrorHandler Integration Guide

## Overview

The **ErrorHandler** is the central system for handling all errors in Orbyt. It automatically detects, classifies, logs, and controls execution based on error severity.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ERROR FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Error Occurs                                            │
│     ↓                                                       │
│  2. ErrorHandler.handle()                                   │
│     ↓                                                       │
│  3. ErrorDetector.detect() ← Auto-classify error type      │
│     ↓                                                       │
│  4. Get Severity & Execution Control                        │
│     ↓                                                       │
│  5. Log Error (if enabled)                                  │
│     ↓                                                       │
│  6. ErrorDebugger.analyze() ← Generate solutions           │
│     ↓                                                       │
│  7. Return ErrorHandlingResult                              │
│     │                                                       │
│     ├─→ shouldStopWorkflow? → Stop execution               │
│     ├─→ shouldStopStep? → Skip to next step                │
│     └─→ shouldContinue? → Continue current operation       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Severity Levels & Execution Control

| Severity | Workflow | Step | Behavior |
|----------|----------|------|----------|
| **CRITICAL** | ❌ STOP | ❌ STOP | Unrecoverable error, stop immediately |
| **FATAL** | ❌ STOP | ❌ STOP | Severe failure, stop workflow |
| **ERROR** | ❌ STOP | ❌ STOP | Standard error, stop workflow |
| **MEDIUM** | ✅ CONTINUE | ❌ STOP | Stop step, try next step |
| **LOW** | ✅ CONTINUE | ✅ CONTINUE | Log warning, continue |
| **WARNING** | ✅ CONTINUE | ✅ CONTINUE | Log warning, continue |
| **INFO** | ✅ CONTINUE | ✅ CONTINUE | Log info, continue |

## Integration Points

### 1. WorkflowLoader Integration (Automatic)

ErrorHandler automatically detects errors during workflow loading:

```typescript
// In WorkflowLoader or any loader usage
import { ErrorHandler } from '@orbyt/engine/errors';

export class WorkflowLoader {
  static async fromFile(filePath: string): Promise<ParsedWorkflow> {
    try {
      // Validate file exists
      if (!existsSync(filePath)) {
        throw new Error(`Workflow file not found: ${filePath}`);
      }
      
      // Read and parse
      const content = await readFile(filePath, 'utf-8');
      const parsed = this.fromYAML(content);
      
      return parsed;
    } catch (error) {
      // ErrorHandler automatically detects and classifies
      const result = await ErrorHandler.handleLoaderError(error, filePath, {
        enableDebug: true, // Show solutions in CLI
        enableLogging: true
      });
      
      // Always stop on loader errors (workflow can't be loaded)
      throw result.error;
    }
  }
}
```

**What happens automatically:**
1. ✅ Detects error type (parse error, file not found, reserved field, etc.)
2. ✅ Determines correct error code (ORB-S-001, ORB-R-002, etc.)
3. ✅ Logs with appropriate level (error/warn/info)
4. ✅ Generates solutions and fix steps
5. ✅ Throws properly classified OrbytError

### 2. Engine Execution Integration (Automatic)

In the engine, errors are handled automatically during step execution:

```typescript
// In OrbytEngine
import { ErrorHandler } from '@orbyt/engine/errors';

export class OrbytEngine {
  async executeWorkflow(workflow: ParsedWorkflow): Promise<WorkflowResult> {
    for (const [index, step] of workflow.steps.entries()) {
      try {
        // Execute step
        const result = await this.executeStep(step);
        results.push(result);
        
      } catch (error) {
        // ErrorHandler automatically handles error
        const result = await ErrorHandler.handle(error, {
          location: `workflow.steps[${index}]`,
          stepId: step.id,
          field: step.id,
          data: { stepIndex: index }
        }, {
          enableLogging: true,
          enableDebug: false, // Engine doesn't need debug (CLI does)
        });
        
        // Execution control based on severity
        if (result.shouldStopWorkflow) {
          // CRITICAL/FATAL/ERROR → Stop entire workflow
          throw result.error;
        }
        
        if (result.shouldStopStep) {
          // MEDIUM → Stop step, try next
          console.warn(`Step ${step.id} failed, continuing to next step`);
          continue;
        }
        
        // LOW/WARNING/INFO → Log and continue
        // Error already logged by ErrorHandler
      }
    }
    
    return { status: 'completed', results };
  }
}
```

**What happens automatically:**
1. ✅ Any error is caught and classified
2. ✅ Execution control determined by severity
3. ✅ Automatic logging with metadata
4. ✅ Workflow continues or stops based on severity
5. ✅ No manual "if error.code === X then Y" logic needed

### 3. CLI Integration (Manual - with full debug)

In CLI commands, use ErrorHandler manually to show formatted output:

```typescript
// In cli/src/commands/run.ts
import { ErrorHandler } from '@orbyt/engine/errors';
import { WorkflowLoader } from '@orbyt/engine/loader';

export async function runCommand(filePath: string) {
  try {
    // Load workflow (errors auto-detected by loader)
    const workflow = await WorkflowLoader.fromFile(filePath);
    
    // Run workflow
    const result = await engine.executeWorkflow(workflow);
    
    console.log('✓ Workflow completed successfully');
    
  } catch (error) {
    // Handle error with full debug output
    const result = await ErrorHandler.handle(error, 
      { location: filePath },
      {
        enableLogging: false, // Don't double-log
        enableDebug: true,    // Generate solutions
        useColors: true       // Colored terminal output
      }
    );
    
    // Show formatted error with solutions
    console.error(result.debug?.formatted || result.error.message);
    
    // Exit with proper code
    process.exit(result.error.exitCode);
  }
}
```

**Output example:**
```
━━━━ DEBUG INFO ━━━━

What went wrong:
Your workflow contains a field that is not recognized by Orbyt.

Why it happened:
This usually happens due to a typo in the field name or using a field that doesn't exist in the schema.

How to fix:
1. Check the spelling of the field name
2. Refer to Orbyt documentation for valid field names
3. Remove the field if it's not needed

Common mistakes:
• Typos in field names (e.g., "varion" instead of "version")
• Using deprecated field names
• Copy-pasting from old workflow versions

⏱  Estimated fix time: 1-2 minutes
```

### 4. API Integration (Manual - JSON responses)

In REST APIs, return structured error responses:

```typescript
// In api/src/routes/workflows.ts
import { ErrorHandler } from '@orbyt/engine/errors';

app.post('/api/workflows/validate', async (req, res) => {
  try {
    const workflow = WorkflowLoader.fromObject(req.body);
    res.json({ success: true, valid: true });
    
  } catch (error) {
    const result = await ErrorHandler.handle(error, 
      { location: 'request.body' },
      {
        enableLogging: true,
        enableDebug: true,
        useColors: false
      }
    );
    
    // Return structured error response
    res.status(400).json({
      success: false,
      error: {
        code: result.error.code,
        message: result.error.message,
        severity: result.error.severity,
        path: result.error.path,
        hint: result.error.hint,
        debug: {
          explanation: result.debug?.explanation,
          fixSteps: result.debug?.fixSteps,
          quickFix: result.debug?.quickFix,
          estimatedFixTime: result.debug?.estimatedFixTime
        },
        exitCode: result.error.exitCode
      }
    });
  }
});
```

**Response example:**
```json
{
  "success": false,
  "error": {
    "code": "ORB-S-001",
    "message": "Unknown field \"varion\" in workflow definition",
    "severity": "error",
    "path": "workflow",
    "hint": "Did you mean \"version\"? Check for typos in field names.",
    "debug": {
      "explanation": "Your workflow contains a field that is not recognized by Orbyt.",
      "fixSteps": [
        "Check the spelling of the field name",
        "Refer to Orbyt documentation for valid field names",
        "Remove the field if it's not needed"
      ],
      "quickFix": "Check the spelling of the field name",
      "estimatedFixTime": "1-2 minutes"
    },
    "exitCode": 103
  }
}
```

### 5. SDK Integration (Manual - user-friendly)

In TypeScript/JavaScript SDKs:

```typescript
// In sdk/src/client.ts
import { ErrorHandler, type ErrorHandlingResult } from '@orbyt/engine/errors';

export class OrbytClient {
  async validateWorkflow(workflow: Workflow): Promise<ValidationResult> {
    try {
      const parsed = WorkflowLoader.fromObject(workflow);
      return { valid: true };
      
    } catch (error) {
      const result = await ErrorHandler.handle(error, undefined, {
        enableDebug: true
      });
      
      // Throw SDK-specific error with debug info
      throw new OrbytSDKError({
        message: result.error.message,
        code: result.error.code,
        solution: result.debug?.quickFix,
        details: result.debug?.explanation,
        fixSteps: result.debug?.fixSteps,
        originalError: result.error
      });
    }
  }
}
```

## Key Features

### ✅ Automatic Error Detection
- No need to manually check error types
- ErrorDetector automatically classifies errors
- Reserved fields detected automatically
- Parse errors, validation errors, execution errors all handled

### ✅ 100% Correct Error Codes
- Each error gets the correct ORB-XX-NNN code
- Proper exit codes from @dev-ecosystem/core
- Consistent error classification across engine

### ✅ Automatic Logging
- Errors logged with appropriate level
- Rich metadata included (code, path, context)
- Structured logs for monitoring systems

### ✅ Smart Execution Control
- CRITICAL/FATAL/ERROR → Stop workflow
- MEDIUM → Stop step, continue to next
- LOW/WARNING/INFO → Log and continue
- No manual if/else chains needed

### ✅ Solutions Included
- Plain English explanations
- Step-by-step fix instructions
- Common mistakes highlighted
- Quick one-line fixes
- Estimated fix time

## Global Configuration

Set default options for all error handling:

```typescript
import { GlobalErrorHandler } from '@orbyt/engine/errors';

// Configure once at app startup
GlobalErrorHandler.configure({
  enableLogging: true,
  enableDebug: process.env.NODE_ENV !== 'production',
  useColors: process.stdout.isTTY,
  logger: customLogger // Optional custom logger
});

// Use throughout app with defaults
const result = await GlobalErrorHandler.handle(error);
```

## Best Practices

### ✅ DO
- Let ErrorHandler detect and classify errors automatically
- Use `enableDebug: true` in CLI/API for user-facing output
- Use `enableDebug: false` in engine for performance
- Log errors consistently through ErrorHandler
- Return structured error objects in APIs

### ❌ DON'T
- Don't manually classify errors (use ErrorDetector)
- Don't create generic Error instances (use factory methods)
- Don't ignore ErrorHandlingResult.control decisions
- Don't skip logging in production
- Don't expose raw error stacks to users (use debug.explanation)

## Testing

Test error handling in your code:

```typescript
import { ErrorHandler } from '@orbyt/engine/errors';

describe('Workflow Execution', () => {
  it('handles step errors correctly', async () => {
    const mockError = new Error('Step failed');
    
    const result = await ErrorHandler.handle(mockError, {
      location: 'workflow.steps[0]',
      stepId: 'test-step'
    });
    
    expect(result.error.code).toMatch(/^ORB-/);
    expect(result.shouldStopWorkflow).toBeDefined();
    expect(result.debug).toBeDefined();
  });
});
```

## Summary

The ErrorHandler provides:
1. **Automatic detection** - No manual error classification needed
2. **100% correct codes** - Every error gets proper ORB-XX-NNN code
3. **Smart execution control** - Workflows stop/continue based on severity
4. **Built-in solutions** - Users get fix instructions automatically
5. **Consistent handling** - Same system across engine, CLI, API, SDK

Just wrap your operations in try/catch and let ErrorHandler do the rest!
