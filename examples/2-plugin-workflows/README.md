# Plugin-Workflows Example - Multi-Step Workflow Demonstrations

This example demonstrates **comprehensive multi-step workflow implementations** using the Beyond MCP Server library. It showcases the evolution from simple tools to sophisticated workflows that handle complex, stateful operations with proper error handling, recovery patterns, and resource tracking.

## 🎯 Learning Objectives

This example teaches you how to:

- **Multi-step Workflow Architecture**: Build workflows that execute sequential steps with state management
- **Proper Error Handling**: Handle failures gracefully with recovery patterns and continuation logic
- **Resource Tracking**: Monitor performance, timing, and resource usage throughout workflow execution
- **State Management**: Maintain and transform data across multiple workflow steps
- **Plugin Integration**: Combine both tools and workflows in a single plugin
- **Parameter Validation**: Use comprehensive Zod schemas for workflow input validation

## 🔧 Workflow Implementations

### 1. Data Processing Pipeline (`data_processing_pipeline`)

**Steps**: validate → transform → analyze → export

```typescript
// Example usage
const result = await workflow.execute({
  userId: 'user123',
  data: [
    { name: 'John', score: 85, category: 'A' },
    { name: 'Jane', score: 92, category: 'B' },
  ],
  transformations: ['normalize', 'sort', 'deduplicate'],
  outputFormat: 'json',
  analysisType: 'statistical',
});
```

**Demonstrates**:

- Complex data transformation pipelines
- Statistical analysis and data type detection
- Multiple output formats (JSON, CSV)
- Graceful error handling with partial success

### 2. File Management Lifecycle (`file_management_lifecycle`)

**Steps**: create → validate → process → archive

```typescript
// Example usage
const result = await workflow.execute({
  userId: 'user123',
  fileName: 'config.json',
  content: '{"setting": "value"}',
  validationRules: ['not_empty', 'valid_json', 'max_size'],
  processingOptions: {
    format: 'pretty',
    addMetadata: true,
    sanitize: true,
  },
});
```

**Demonstrates**:

- File lifecycle management patterns
- Configurable validation rules
- Content processing and sanitization
- Metadata tracking and archival

### 3. Content Generation Pipeline (`content_generation_pipeline`)

**Steps**: plan → generate → review → publish

```typescript
// Example usage
const result = await workflow.execute({
  userId: 'user123',
  contentType: 'blog',
  topic: 'Machine Learning Best Practices',
  requirements: {
    wordCount: 800,
    tone: 'professional',
    audience: 'developers',
    includeReferences: true,
  },
});
```

**Demonstrates**:

- AI-powered content creation workflows
- Multi-step content planning and generation
- Quality review and automated improvements
- Publication with comprehensive metadata

## 🛠️ Utility Tools

The plugin also includes basic utility tools that support workflow operations:

- **current_datetime**: Get current date/time in various formats
- **validate_json**: Quick JSON validation for workflow inputs

## 🏗️ Architecture Patterns

### Correct Plugin Structure

```typescript
const WorkflowPlugin: AppPlugin = {
  name: 'workflow-plugin',
  version: '1.0.0',
  description: 'Multi-step workflow demonstrations',

  // ✅ Populate arrays directly - PluginManager handles registration
  workflows: [
    new DataProcessingWorkflow(),
    new FileManagementWorkflow(),
    new ContentGenerationWorkflow(),
  ],

  tools: [
    // Basic utility tools
  ],
};
```

### Workflow Implementation Pattern

```typescript
class DataProcessingWorkflow extends WorkflowBase {
  readonly name = 'data_processing_pipeline';
  readonly parameterSchema = z.object({
    // Comprehensive Zod validation
  });

  protected async executeWorkflow(params: any, context: WorkflowContext): Promise<WorkflowResult> {
    const steps: any[] = [];
    const failed: any[] = [];

    // Step-by-step execution with state tracking
    const validationStep = await this.safeExecute('validate_data', async () => {
      // Step implementation with error handling
    });

    // Continue with other steps...

    return {
      success: failed.length === 0,
      completed_steps: steps,
      failed_steps: failed,
      data: processedData,
      metadata: {/* workflow metadata */},
    };
  }
}
```

## 🚀 Getting Started

### Prerequisites

- Deno 2.5.0 or later
- Basic understanding of Beyond MCP Server library
- Familiarity with TypeScript and async/await patterns

### Quick Start

1. **Install Dependencies**
   ```bash
   cd examples/2-plugin-workflows
   # Dependencies are handled by import maps
   ```

2. **Run the Server**
   ```bash
   deno run --allow-all main.ts
   ```

3. **Test Workflows**
   ```bash
   deno test --allow-all tests/
   ```

### Configuration

The server uses minimal configuration with smart defaults:

```typescript
// main.ts
const appServer = await AppServer.create({
  serverConfig: {
    name: 'plugin-workflows-mcp-server',
    version: '1.0.0',
  },
  // Plugin discovery automatically finds WorkflowPlugin
});
```

## 📊 Workflow Execution Flow

### State Management

```
Workflow Start
    ↓
┌─────────────────┐    ┌─────────────────┐
│ Step 1: Validate│ →  │ State: Initial  │
└─────────────────┘    └─────────────────┘
    ↓
┌─────────────────┐    ┌─────────────────┐  
│ Step 2: Process │ →  │ State: Validated│
└─────────────────┘    └─────────────────┘
    ↓
┌─────────────────┐    ┌─────────────────┐
│ Step 3: Analyze │ →  │ State: Processed│  
└─────────────────┘    └─────────────────┘
    ↓
┌─────────────────┐    ┌─────────────────┐
│ Step 4: Export  │ →  │ State: Complete │
└─────────────────┘    └─────────────────┘
```

### Error Handling

- **safeExecute()** wrapper provides consistent error handling
- **Failed steps** are tracked but don't stop execution
- **Recovery patterns** allow workflows to continue after non-critical failures
- **Resource tracking** monitors performance even during failures

## 🧪 Testing Patterns

The example includes comprehensive test patterns for workflows:

```typescript
// Example workflow test
describe('DataProcessingWorkflow', () => {
  it('should execute complete pipeline successfully', async () => {
    const workflow = new DataProcessingWorkflow();
    const result = await workflow.executeWithValidation(validParams, testContext);

    assertEquals(result.success, true);
    assertEquals(result.completed_steps.length, 4);
    assert(result.data?.processed_data);
  });
});
```

## 🔄 Migration from Simple Tools

If you're coming from the `1-simple` example:

1. **Tools vs Workflows**: Workflows handle multi-step operations with state management
2. **Error Handling**: More sophisticated error handling and recovery patterns
3. **Resource Tracking**: Built-in performance monitoring and resource usage tracking
4. **State Management**: Data flows and transforms between workflow steps

## 📝 Key Concepts

### Workflow vs Tool Decision Matrix

| Use Tools When      | Use Workflows When          |
| ------------------- | --------------------------- |
| Single operation    | Multiple related steps      |
| Stateless           | Stateful processing         |
| Simple input/output | Complex data transformation |
| Quick validation    | Business process automation |
| Utility functions   | Error recovery needed       |

### Best Practices

1. **State Management**: Use workflow context to pass data between steps
2. **Error Handling**: Use `safeExecute()` for consistent error handling patterns
3. **Resource Tracking**: Track performance and resource usage for monitoring
4. **Validation**: Use comprehensive Zod schemas for parameter validation
5. **Documentation**: Provide clear `getOverview()` descriptions for each workflow

## 🔍 Troubleshooting

### Common Issues

1. **Workflow Not Found**
   ```
   Error: Workflow 'data_processing_pipeline' not found
   ```
   - Ensure plugin is properly exported as default
   - Check workflow name matches exactly
   - Verify plugin discovery is working

2. **Parameter Validation Errors**
   ```
   Error: Parameter validation failed: data is required
   ```
   - Check Zod schema matches your input parameters
   - Ensure all required fields are provided
   - Validate parameter types match schema

3. **Step Execution Failures**
   ```
   Error: Data validation failed
   ```
   - Check input data format and structure
   - Review step-specific error messages
   - Use dry-run mode for testing

### Debugging Tips

1. **Enable Debug Logging**:
   ```bash
   LOG_LEVEL=debug deno run --allow-all main.ts
   ```

2. **Use Dry Run Mode**:
   ```typescript
   const result = await workflow.execute({ ...params, dryRun: true });
   ```

3. **Check Step Results**:
   ```typescript
   console.log('Completed steps:', result.completed_steps);
   console.log('Failed steps:', result.failed_steps);
   ```

## 🎓 Learning Path

1. **Start Here**: Run the workflows with sample data
2. **Understand Patterns**: Study the workflow base class and error handling
3. **Customize Workflows**: Modify existing workflows for your use cases
4. **Create New Workflows**: Build your own multi-step workflows
5. **Advanced Features**: Explore resource tracking and performance monitoring

## 🔗 Next Steps

- **3-plugin-api-auth**: Learn OAuth integration and API authentication patterns
- **4-manual-deps**: Explore manual dependency management and advanced configuration
- **Library Documentation**: Deep dive into WorkflowBase class and plugin architecture

This example provides the foundation for building sophisticated, production-ready workflows that can handle complex business processes with proper error handling, state management, and monitoring.
