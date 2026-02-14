# Orbyt Workflow Schema Reference

**Complete guide to Orbyt workflow YAML schema fields and structure**

---

## Table of Contents

1. [Core Required Fields](#core-required-fields)
2. [Metadata & Documentation](#metadata--documentation)
3. [Triggers](#triggers)
4. [Inputs & Secrets](#inputs--secrets)
5. [Execution Control](#execution-control)
6. [Outputs](#outputs)
7. [Step Schema](#step-schema)
8. [Production-Ready Fields](#production-ready-fields)
9. [Future-Safe Fields](#future-safe-fields)
10. [Schema Validation](#schema-validation)
11. [Complete Example](#complete-example)

---

## Core Required Fields

### **version** (required)

- **Type**: String (semantic versioning pattern like `1.0` or `1.0.0`)
- **Purpose**: Schema version for backward compatibility
- **Regex**: `^[0-9]+\.[0-9]+(\.[0-9]+)?$`
- **Example**: `"1.0"`

### **kind** (optional, defaults to 'workflow')

- **Type**: Enum: `workflow`, `pipeline`, `job`, `playbook`, `automation`
- **Purpose**: Classifies the executable type
- **Default**: `"workflow"`
- **Example**: `"workflow"`

### **workflow** (required)

- **Type**: Object with `steps` array (minimum 1 step)
- **Purpose**: Core execution definition containing all steps
- **Structure**:
  ```yaml
  workflow:
    steps:
      - id: step1
        uses: shell.command
        with:
          command: echo "Hello"
  ```

---

## Metadata & Documentation

### **metadata** (optional)

Contains workflow identification and documentation:

- **name** (required): Workflow identifier
  - Pattern: `^[a-zA-Z][a-zA-Z0-9_-]*$` (starts with letter, alphanumeric + underscore/hyphen)
  - Example: `"deploy-app"`

- **displayName** (optional): Human-readable name
  - Example: `"Deploy Application to Production"`

- **description** (optional): What this workflow does
  - Example: `"Deploys the application to production with health checks"`

- **version** (optional): Workflow version
  - Pattern: Semantic versioning `^[0-9]+\.[0-9]+\.[0-9]+$`
  - Example: `"1.2.3"`

- **author** (optional): Creator name/email
  - Example: `"team@company.com"`

- **tags** (optional): Array of categorization tags
  - Example: `["deployment", "production", "automated"]`

- **category** (optional): Classification
  - Example: `"deployment"`

- **icon** (optional): Icon identifier for UI
  - Example: `"rocket"`

**Example:**

```yaml
metadata:
  name: deploy-app
  displayName: Deploy Application
  description: Deploys the application to production
  version: 1.0.0
  author: team@company.com
  tags: [deployment, production]
  category: deployment
  icon: rocket
```

### **annotations** (optional)

Key-value pairs for external metadata (CI/CD systems, deployment tools):

```yaml
annotations:
  ci.github.com/pipeline: "main"
  deploy.target: "production"
  observability.datadog.com/trace: "enabled"
```

---

## Triggers

### **triggers** (optional)

Array of trigger definitions. Each trigger has:

**Common fields:**

- **type** (required): `manual`, `cron`, `event`, `webhook`
- **enabled** (optional): Boolean to activate/deactivate (default: true)

#### **Manual Trigger**

```yaml
triggers:
  - type: manual
    enabled: true
```

#### **Cron Trigger**

```yaml
triggers:
  - type: cron
    schedule: "0 0 * * *" # Required: cron expression
    timezone: "UTC" # Optional: timezone (default: UTC)
    enabled: true
```

**Cron schedule format**: Standard 5-field cron expression

- Examples:
  - `"0 0 * * *"` - Daily at midnight
  - `"*/15 * * * *"` - Every 15 minutes
  - `"0 9 * * 1-5"` - Weekdays at 9 AM

#### **Event Trigger**

```yaml
triggers:
  - type: event
    event: github.push # Event type to listen for
    filters: # Optional: event filters
      branch: main
      paths:
        - "src/**"
    enabled: true
```

#### **Webhook Trigger**

```yaml
triggers:
  - type: webhook
    path: /deploy # Webhook endpoint path
    method: POST # HTTP method (GET, POST, etc.)
    secret: webhook_secret # Optional: secret for validation
    enabled: true
```

---

## Inputs & Secrets

### **inputs** (optional)

Workflow parameters with validation:

```yaml
inputs:
  username:
    type: string
    description: "User to deploy as"
    default: "admin"
    required: true
  port:
    type: number
    description: "Port number"
    default: 8080
    min: 1024
    max: 65535
  environment:
    type: string
    enum: ["dev", "staging", "production"]
    default: "dev"
  features:
    type: array
    description: "Features to enable"
    default: []
```

**Input field types and validation:**

| Type        | Validators                                  | Example                             |
| ----------- | ------------------------------------------- | ----------------------------------- |
| **string**  | `pattern`, `enum`, `minLength`, `maxLength` | `type: string, pattern: "^[a-z]+$"` |
| **number**  | `min`, `max`, `enum`                        | `type: number, min: 0, max: 100`    |
| **boolean** | None                                        | `type: boolean, default: false`     |
| **array**   | `minItems`, `maxItems`                      | `type: array, minItems: 1`          |
| **object**  | None                                        | `type: object, default: {}`         |

**Common fields:**

- **type** (required): Data type
- **description** (optional): Help text
- **default** (optional): Default value
- **required** (optional): Boolean (defaults to false)
- **enum** (optional): Array of allowed values
- **pattern** (optional): Regex validation for strings
- **min/max** (optional): Range validation for numbers
- **minLength/maxLength** (optional): Length validation for strings
- **minItems/maxItems** (optional): Size validation for arrays

### **secrets** (optional)

Sensitive data references:

```yaml
secrets:
  - name: API_KEY
    required: true
    description: "API key for external service"
  - name: DB_PASSWORD
    required: true
    description: "Database password"
  - name: WEBHOOK_SECRET
    required: false
```

**Secrets fields:**

- **name** (required): Secret identifier
- **required** (optional): Boolean (default: false)
- **description** (optional): Help text

### **context** (optional)

Runtime context variables provided by the platform:

```yaml
context:
  workflow:
    - id
    - name
    - version
    - run_id
  trigger:
    - type
    - event
  actor:
    - username
    - email
  runtime:
    - timestamp
    - timezone
```

**Context categories:**

- **workflow**: Workflow metadata (id, name, version, run_id)
- **trigger**: Trigger information (type, event, timestamp)
- **actor**: User/system that triggered (username, email, id)
- **runtime**: Execution context (timestamp, timezone, platform)

---

## Execution Control

### **defaults** (optional)

Default settings applied to all steps (can be overridden per-step):

```yaml
defaults:
  timeout: "30m"
  continueOnError: false
  retry:
    maxAttempts: 3
    backoff: exponential
    initialDelay: 1s
    maxDelay: 60s
    retryableErrors:
      - "ConnectionTimeout"
      - "NetworkError"
  env:
    NODE_ENV: production
    LOG_LEVEL: info
```

**Retry configuration:**

- **maxAttempts**: Maximum retry count (default: 0)
- **backoff**: Strategy - `fixed`, `linear`, `exponential` (default: fixed)
- **initialDelay**: First retry delay (e.g., `1s`, `500ms`)
- **maxDelay**: Maximum delay between retries
- **factor**: Multiplier for exponential/linear backoff
- **retryableErrors**: Array of error patterns to retry

**Timeout format**: `<number>(ms|s|m|h)`

- Examples: `"500ms"`, `"30s"`, `"5m"`, `"2h"`

### **policies** (optional)

Workflow-level execution policies:

```yaml
policies:
  execution:
    maxDuration: "2h" # Maximum workflow duration
    maxRetries: 5 # Maximum workflow-level retries
  concurrency:
    maxParallelSteps: 10 # Max steps running in parallel
    maxWorkflowInstances: 3 # Max concurrent workflow runs
  isolation:
    sandbox: true # Run in sandbox
    networkAccess: restricted # Network access level
  rateLimit:
    requests: 100
    window: "1m"
```

### **permissions** (optional)

Required permissions for execution:

```yaml
permissions:
  read:
    - resource: database
      scope: public
    - resource: storage
      scope: uploads
  write:
    - resource: storage
      scope: uploads
    - resource: logs
      scope: application
  execute:
    - resource: functions
      scope: processing
```

### **resources** (optional)

Resource limits for workflow execution:

```yaml
resources:
  cpu: "2" # CPU cores
  memory: "4Gi" # Memory limit
  storage: "10Gi" # Disk storage
  gpu: "1" # GPU count (optional)
  network: "1Gbps" # Network bandwidth (optional)
```

---

## Outputs

### **outputs** (optional)

Final workflow outputs returned to caller using variable interpolation:

```yaml
outputs:
  result: "${{ steps.process.outputs.data }}"
  status: "${{ workflow.status }}"
  deploymentUrl: "${{ steps.deploy.outputs.url }}"
  timestamp: "${{ context.runtime.timestamp }}"
```

**Variable interpolation syntax:**

- `${{ steps.<step-id>.outputs.<key> }}` - Step output
- `${{ inputs.<name> }}` - Input value
- `${{ secrets.<name> }}` - Secret value
- `${{ context.<category>.<field> }}` - Context value
- `${{ workflow.<field> }}` - Workflow metadata

---

## Step Schema

Each step in `workflow.steps` array has these fields:

### **Required fields:**

- **id** (required): Unique step identifier
  - Pattern: `^[a-zA-Z][a-zA-Z0-9_-]*$` (starts with letter)
  - Example: `"deploy_app"`

- **uses** (required): Adapter reference
  - Pattern: `^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$`
  - Format: `namespace.action` or `namespace.domain.action`
  - Examples: `"shell.command"`, `"http.request"`, `"aws.s3.upload"`

### **Common fields:**

- **name** (optional): Human-readable step name
  - Example: `"Deploy to Production"`

- **with** (optional): Adapter-specific input parameters
  - Supports variable interpolation
  - Example:
    ```yaml
    with:
      command: "npm install"
      workingDir: "${{ inputs.projectPath }}"
    ```

- **when** (optional): Conditional execution expression
  - Example: `"${{ inputs.deploy == true }}"`
  - Example: `"${{ steps.build.outputs.success == 'true' }}"`

- **needs** (optional): Array of step IDs this step depends on
  - Creates explicit dependency graph
  - Example: `["build", "test"]`

- **timeout** (optional): Step-specific timeout (overrides defaults)
  - Format: `<number>(ms|s|m|h)`
  - Example: `"10m"`

- **continueOnError** (optional): Continue workflow even if step fails
  - Type: Boolean
  - Default: `false`

- **retry** (optional): Step-level retry config (overrides defaults)
  - Same structure as defaults.retry
  - Example:
    ```yaml
    retry:
      maxAttempts: 2
      backoff: fixed
      initialDelay: 5s
    ```

- **env** (optional): Environment variables for this step
  - Merged with defaults.env
  - Example:
    ```yaml
    env:
      API_URL: https://api.example.com
      DEBUG: "true"
    ```

- **outputs** (optional): Map step outputs to named values
  - Example:
    ```yaml
    outputs:
      deploymentId: "${{ result.id }}"
      url: "${{ result.endpoint }}"
    ```

### **Step Example:**

```yaml
steps:
  - id: deploy
    name: Deploy Application
    uses: kubernetes.deploy
    with:
      manifest: ./deployment.yaml
      namespace: production
      replicas: 3
    needs: [build, test]
    when: "${{ inputs.environment == 'production' }}"
    timeout: "10m"
    continueOnError: false
    retry:
      maxAttempts: 2
      backoff: exponential
      initialDelay: 5s
    env:
      KUBECONFIG: "${{ secrets.KUBECONFIG }}"
    outputs:
      deploymentId: "${{ result.metadata.name }}"
      status: "${{ result.status.phase }}"
```

---

## Production-Ready Fields

### **usage** (optional)

Cost and usage tracking for billing and analytics:

```yaml
usage:
  project: my-project # Project identifier
  costCenter: engineering # Cost center for billing
  billable: true # Is this billable?
  tags:
    team: backend
    priority: high
```

**Step-level usage override:**

```yaml
steps:
  - id: expensive_step
    uses: ml.inference
    usage:
      costCenter: ml-team
      billable: true
      tags:
        model: gpt-4
```

### **strategy** (optional)

Execution patterns and parallelization:

```yaml
strategy:
  type: sequential # or parallel, matrix
  failFast: true # Stop on first failure
  maxConcurrent: 5 # Max parallel executions
  matrix: # Matrix build strategy
    os: [ubuntu, windows]
    version: [18, 20]
  exclude: # Exclude specific combinations
    - os: windows
      version: 18
```

**Strategy types:**

- **sequential**: Steps run one after another (respects `needs`)
- **parallel**: Steps run concurrently (respects `needs`)
- **matrix**: Multiple workflow runs with parameter combinations

---

## Future-Safe Fields

These fields are defined in the schema but not yet implemented - reserved for future features:

### **profiles** (optional)

Environment-specific configurations (write once, run anywhere):

```yaml
profiles:
  development:
    resources:
      cpu: "1"
      memory: "2Gi"
    env:
      LOG_LEVEL: debug
  staging:
    resources:
      cpu: "2"
      memory: "4Gi"
  production:
    resources:
      cpu: "4"
      memory: "8Gi"
    env:
      LOG_LEVEL: warn
```

### **compliance** (optional)

Data classification and retention policies:

```yaml
compliance:
  data:
    pii: true # Contains personally identifiable information
    retention:
      logs: "30d" # Log retention period
      outputs: "90d" # Output retention period
```

### **provenance** (optional)

Workflow origin tracking (especially for AI-generated workflows):

```yaml
provenance:
  generatedBy: "orbyt-ai" # Tool that generated this
  source:
    repo: "github.com/org/repo" # Source repository
    commit: "abc123def456" # Commit hash
    branch: "main" # Branch name
  generatedAt: "2024-01-01T00:00:00Z" # Generation timestamp
```

### **execution** (optional)

Multi-environment execution strategy (local/cloud/distributed):

```yaml
execution:
  mode: hybrid # local, cloud, hybrid, distributed
  targets:
    - type: kubernetes
      cluster: production
    - type: lambda
      region: us-east-1
```

### **outputsSchema** (optional)

Type validation schema for workflow outputs:

```yaml
outputsSchema:
  type: object
  properties:
    deploymentId:
      type: string
      pattern: "^dep-[0-9]+$"
    status:
      type: string
      enum: ["success", "failed"]
  required: ["deploymentId", "status"]
```

### **telemetry** (optional)

Privacy-aware telemetry controls:

```yaml
telemetry:
  enabled: true
  sampling: 0.1 # Sample 10% of executions
  anonymize: true # Anonymize sensitive data
  excludeFields: ["secrets"]
```

### **accounting** (optional)

Cost tracking and billing metadata:

```yaml
accounting:
  enabled: true
  currency: USD
  estimatedCost: 10.50
  billingTags:
    department: engineering
    project: website
```

### **compatibility** (optional)

Engine version compatibility ranges:

```yaml
compatibility:
  minVersion: "1.0.0"
  maxVersion: "2.0.0"
  deprecated: false
  breakingChanges: []
```

### **failurePolicy** (optional)

Complex failure handling semantics:

```yaml
failurePolicy:
  mode: stopOnError # stopOnError, continueOnError, custom
  retryStrategy: exponential
  notifyOnFailure: true
  fallbackWorkflow: cleanup.yaml
```

### **rollback** (optional)

Transactional rollback configuration:

```yaml
rollback:
  enabled: true
  automatic: true
  onFailure: rollback # rollback, notify, manual
  steps:
    - id: restore_backup
      uses: storage.restore
```

### **governance** (optional)

Enterprise compliance and approval workflows:

```yaml
governance:
  approvalRequired: true
  approvers:
    - team: security
      count: 1
    - team: engineering
      count: 2
  auditLog: enabled
  retentionPolicy: "7y"
```

### **Step-Level Future Fields:**

Steps also support these future-safe fields:

- **ref**: Versioned step reference
  - Example: `"mediaproc.image.resize@^1.0.0"`

- **requires**: Capability requirements

  ```yaml
  requires:
    capabilities: [gpu, network]
    cpu: "2"
    memory: "4Gi"
  ```

- **hints**: Execution optimization hints

  ```yaml
  hints:
    cacheable: true
    idempotent: true
    estimatedDuration: "5m"
  ```

- **contracts**: Input/output data contracts

  ```yaml
  contracts:
    inputs:
      type: object
      required: [image, format]
    outputs:
      type: object
      properties:
        url: { type: string }
  ```

- **profiles**: Environment-specific step profiles
- **onFailure**: Advanced failure handling strategies
- **telemetry**: Step-level telemetry configuration
- **rollback**: Step-level rollback logic

---

## Schema Validation

The schema includes automatic business logic validation:

### **1. Unique Step IDs**

```yaml
# ❌ Invalid - duplicate IDs
workflow:
  steps:
    - id: build
      uses: shell.command
    - id: build # Error: duplicate ID
      uses: test.run
```

### **2. Valid Dependencies**

```yaml
# ❌ Invalid - "nonexistent" step doesn't exist
workflow:
  steps:
    - id: deploy
      uses: kubernetes.deploy
      needs: [nonexistent] # Error: step not found
```

### **3. Cron Schedule Required**

```yaml
# ❌ Invalid - cron trigger missing schedule
triggers:
  - type: cron # Error: schedule field required
```

### **4. Strict Schema**

No additional properties allowed at root level beyond defined fields.

---

## Complete Example

```yaml
version: "1.0"
kind: workflow

metadata:
  name: deploy-app
  displayName: Deploy Application to Production
  description: Complete deployment workflow with testing and rollback
  version: 1.0.0
  author: devops@company.com
  tags: [deployment, production, kubernetes]
  category: deployment

annotations:
  ci.provider: github-actions
  deploy.strategy: blue-green

triggers:
  - type: cron
    schedule: "0 2 * * *"
    timezone: UTC
    enabled: true
  - type: webhook
    path: /deploy
    method: POST
    secret: deploy_webhook_secret

secrets:
  - name: KUBECONFIG
    required: true
  - name: DOCKER_PASSWORD
    required: true

inputs:
  environment:
    type: string
    enum: [staging, production]
    default: staging
    required: true
  replicas:
    type: number
    min: 1
    max: 10
    default: 3
  enableMonitoring:
    type: boolean
    default: true

context:
  workflow: [id, name, run_id]
  trigger: [type, timestamp]
  actor: [username, email]

defaults:
  timeout: "30m"
  retry:
    maxAttempts: 3
    backoff: exponential
    initialDelay: 1s
    maxDelay: 60s
  env:
    NODE_ENV: production

policies:
  execution:
    maxDuration: "2h"
  concurrency:
    maxParallelSteps: 5
  isolation:
    sandbox: true

permissions:
  read:
    - resource: database
      scope: readonly
  write:
    - resource: storage
      scope: deployments

resources:
  cpu: "2"
  memory: "4Gi"

workflow:
  steps:
    - id: checkout
      name: Checkout Code
      uses: git.clone
      with:
        repository: "${{ context.workflow.repository }}"
        branch: main

    - id: build
      name: Build Docker Image
      uses: docker.build
      with:
        dockerfile: ./Dockerfile
        tag: "${{ context.workflow.run_id }}"
      needs: [checkout]
      timeout: "15m"

    - id: test
      name: Run Tests
      uses: shell.command
      with:
        command: npm test
      needs: [build]
      continueOnError: false

    - id: deploy
      name: Deploy to Kubernetes
      uses: kubernetes.deploy
      with:
        manifest: ./k8s/deployment.yaml
        namespace: "${{ inputs.environment }}"
        replicas: "${{ inputs.replicas }}"
      needs: [test]
      when: "${{ steps.test.outputs.success == 'true' }}"
      timeout: "10m"
      retry:
        maxAttempts: 2
      env:
        KUBECONFIG: "${{ secrets.KUBECONFIG }}"
      outputs:
        deploymentId: "${{ result.metadata.name }}"
        status: "${{ result.status.phase }}"

    - id: health_check
      name: Health Check
      uses: http.request
      with:
        url: "${{ steps.deploy.outputs.url }}/health"
        method: GET
        expectedStatus: 200
      needs: [deploy]
      retry:
        maxAttempts: 5
        initialDelay: 10s

    - id: notify
      name: Send Notification
      uses: slack.message
      with:
        channel: "#deployments"
        message: "Deployed to ${{ inputs.environment }}"
      needs: [health_check]
      continueOnError: true

outputs:
  deploymentId: "${{ steps.deploy.outputs.deploymentId }}"
  status: "${{ steps.deploy.outputs.status }}"
  url: "${{ steps.deploy.outputs.url }}"
  timestamp: "${{ context.runtime.timestamp }}"

usage:
  project: web-platform
  costCenter: engineering
  billable: true
  tags:
    team: platform
    priority: high

strategy:
  type: sequential
  failFast: true
```

---

## Quick Reference

### Minimal Workflow

```yaml
version: "1.0"
workflow:
  steps:
    - id: hello
      uses: shell.command
      with:
        command: echo "Hello World"
```

### Variable Interpolation Syntax

- `${{ inputs.name }}` - Input value
- `${{ secrets.API_KEY }}` - Secret value
- `${{ steps.build.outputs.image }}` - Step output
- `${{ context.workflow.run_id }}` - Context value
- `${{ workflow.status }}` - Workflow status

### Timeout Format

- `500ms` - 500 milliseconds
- `30s` - 30 seconds
- `5m` - 5 minutes
- `2h` - 2 hours

### Adapter Naming Convention

- Format: `namespace.action` or `namespace.domain.action`
- Examples: `shell.command`, `http.request`, `aws.s3.upload`, `kubernetes.deploy`

---

## Notes

- **Schema is strict**: No additional root-level properties allowed
- **Future-safe design**: Many fields defined but not yet implemented
- **Variable interpolation**: Supported in most string fields using `${{ }}` syntax
- **Dependencies**: Automatically resolved via `needs` field
- **Conditional execution**: Use `when` field with expressions
- **Retry logic**: Configurable at workflow and step level
- **Resource limits**: CPU, memory, storage constraints

**Schema File Location**: `ecosystem-core/src/schemas/workflow.schema.zod.ts`

---

_Last Updated: February 12, 2026_
