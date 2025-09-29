# Plugin-Workflows Example - Step-by-Step Instructions

This guide walks you through running and understanding the **Plugin-Workflows** example, which demonstrates sophisticated multi-step workflow implementations using the Beyond MCP Server library.

## 🎯 What You'll Learn

By following this guide, you'll understand:

- **Multi-Step Workflow Architecture**: How workflows differ from simple tools
- **State Management**: How data flows and transforms between workflow steps
- **Error Handling**: Advanced error recovery and continuation patterns
- **Resource Tracking**: Performance monitoring and resource usage tracking
- **Parameter Validation**: Comprehensive input validation with Zod schemas

## 🚀 Quick Start

### Step 1: Navigate to the Example

```bash
cd examples/2-plugin-workflows
```

### Step 2: Run the Server

```bash
deno run --allow-all main.ts
```

You should see:

```
[INFO] Starting MCP server: plugin-workflows-mcp-server v1.0.0
[INFO] Plugin discovery found: WorkflowPlugin v1.0.0
[INFO] Registered 3 workflows: data_processing_pipeline, file_management_lifecycle, content_generation_pipeline
[INFO] Registered 2 tools: current_datetime, validate_json
[INFO] Server ready on stdio transport
```

### Step 3: Test the Workflows

The server is now ready to accept MCP requests. You can test the workflows using an MCP client or the provided test suite:

```bash
deno test --allow-all tests/
```

## 🔧 Understanding the Workflows

### 1. Data Processing Pipeline

**Purpose**: Processes arrays of data objects through validation, transformation, analysis, and export steps.

**Steps**:

1. **Validate**: Ensures data is properly formatted
2. **Transform**: Applies operations like normalize, filter, sort, deduplicate
3. **Analyze**: Generates summaries, statistics, or detailed analysis
4. **Export**: Outputs results in JSON or CSV format

**Example Parameters**:

```json
{
  "userId": "demo-user",
  "data": [
    { "name": "Alice", "score": 95, "department": "Engineering" },
    { "name": "Bob", "score": 87, "department": "Marketing" },
    { "name": "Charlie", "score": 92, "department": "Engineering" }
  ],
  "transformations": ["normalize", "sort"],
  "outputFormat": "json",
  "analysisType": "statistical"
}
```

**Key Learning Points**:

- State management: `processedData` is modified by each transformation step
- Error recovery: Failed transformations don't stop the pipeline
- Performance tracking: Each step records timing and resource usage

### 2. File Management Lifecycle

**Purpose**: Manages the complete lifecycle of a file from creation to archival.

**Steps**:

1. **Create**: Sets up file metadata and initial content
2. **Validate**: Applies configurable validation rules
3. **Process**: Formats, sanitizes, and adds metadata
4. **Archive**: Stores the processed file with audit information

**Example Parameters**:

```json
{
  "userId": "demo-user",
  "fileName": "config.json",
  "content": "{\"debug\": true, \"port\": 3000}",
  "validationRules": ["not_empty", "valid_json", "max_size"],
  "processingOptions": {
    "format": "pretty",
    "addMetadata": true,
    "sanitize": false
  }
}
```

**Key Learning Points**:

- File type detection and handling
- Configurable validation rules
- Content transformation and metadata injection
- Audit trail creation

### 3. Content Generation Pipeline

**Purpose**: AI-powered content creation with planning, generation, review, and publishing.

**Steps**:

1. **Plan**: Creates content outline and structure
2. **Generate**: Produces content based on requirements
3. **Review**: Evaluates quality and applies improvements
4. **Publish**: Finalizes content with metadata and preview

**Example Parameters**:

```json
{
  "userId": "demo-user",
  "contentType": "blog",
  "topic": "Microservices Architecture Best Practices",
  "requirements": {
    "wordCount": 800,
    "tone": "professional",
    "audience": "software developers",
    "includeReferences": true
  }
}
```

**Key Learning Points**:

- Multi-phase content creation workflow
- Quality metrics and automated improvements
- Content type-specific processing (blog vs documentation vs report)
- Publication workflow with metadata

## 🏗️ Architecture Deep Dive

### Workflow Base Class

All workflows extend `WorkflowBase` which provides:

```typescript
abstract class WorkflowBase {
  // Required metadata
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;
  abstract readonly category: PluginCategory;
  abstract readonly tags: string[];
  abstract readonly parameterSchema: ZodSchema<any>;

  // Main execution method with validation and error handling
  async executeWithValidation(params: unknown, context: WorkflowContext): Promise<WorkflowResult>;

  // Safe execution wrapper for individual steps
  protected async safeExecute<T>(
    operationName: string,
    operation: () => Promise<T>,
    resourceType?: WorkflowResource['type'],
  ): Promise<{ success: boolean; data?: T; error?: FailedStep }>;

  // Step result creation helpers
  protected createStepResult(operation: string, success: boolean, data?: unknown): WorkflowStep;
}
```

### Plugin Structure

The `WorkflowPlugin` follows the correct pattern:

```typescript
const WorkflowPlugin: AppPlugin = {
  name: 'workflow-plugin',
  version: '1.0.0',
  description: 'Multi-step workflow demonstrations',

  // ✅ CORRECT: Populate arrays directly
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

**Why This Works**:

- PluginManager automatically discovers and registers workflows
- No manual registration code needed in the plugin
- Clean separation between plugin definition and workflow implementation

## 🧪 Testing the Workflows

### Method 1: Using Test Suite

```bash
# Run all workflow tests
deno test --allow-all tests/workflows/

# Run specific workflow test
deno test --allow-all tests/workflows/DataProcessingWorkflow.test.ts

# Run integration tests
deno test --allow-all tests/integration/
```

### Method 2: Manual Testing with MCP Client

If you have an MCP client, you can test workflows directly:

1. **List Available Workflows**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "workflows/list"
   }
   ```

2. **Execute Data Processing Workflow**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "workflows/execute",
     "params": {
       "name": "data_processing_pipeline",
       "arguments": {
         "userId": "test-user",
         "data": [{ "name": "test", "value": 100 }],
         "transformations": ["normalize"],
         "outputFormat": "json",
         "analysisType": "summary"
       }
     }
   }
   ```

### Method 3: Dry Run Mode

All workflows support dry run mode for testing:

```json
{
  "userId": "test-user",
  "dryRun": true,
  "fileName": "test.json",
  "content": "{\"test\": true}",
  "validationRules": ["valid_json"],
  "processingOptions": {
    "format": "pretty"
  }
}
```

Dry run mode validates parameters and simulates execution without making changes.

## 🔍 Debugging and Troubleshooting

### Enable Debug Logging

```bash
LOG_LEVEL=debug deno run --allow-all main.ts
```

This shows detailed information about:

- Plugin discovery and registration
- Workflow execution steps
- Parameter validation
- Error handling and recovery

### Common Issues and Solutions

#### 1. Workflow Not Found

```
Error: Workflow 'data_processing_pipeline' not registered
```

**Solution**: Check that:

- Plugin is exported as default: `export default WorkflowPlugin`
- Workflow is included in plugin's `workflows` array
- Workflow name matches exactly (case-sensitive)

#### 2. Parameter Validation Failed

```
Error: Parameter validation failed: data.required
```

**Solution**:

- Review the workflow's `parameterSchema`
- Ensure all required fields are provided
- Check data types match schema expectations
- Use dry run mode to test parameters

#### 3. Step Execution Errors

```
Error in step 'validate_data': Data must be a non-empty array
```

**Solution**:

- Check input data format and structure
- Review step-specific requirements in workflow code
- Use smaller test datasets to isolate issues

### Monitoring Workflow Execution

Workflow results include detailed execution information:

```typescript
interface WorkflowResult {
  success: boolean;
  completed_steps: WorkflowStep[]; // Successful steps
  failed_steps: FailedStep[]; // Failed steps with error details
  data?: unknown; // Final workflow output
  metadata: Record<string, unknown>; // Workflow-specific metadata
  duration?: number; // Total execution time
  resources?: WorkflowResource[]; // Resource usage tracking
}
```

## 📊 Performance Considerations

### Resource Tracking

Workflows automatically track:

- **Execution Time**: Duration of each step and total workflow
- **Resource Usage**: API calls, storage operations, file access
- **Memory Usage**: Through Deno's built-in memory monitoring
- **Success Rates**: Step completion and failure statistics

### Optimization Tips

1. **Parallel Step Execution**: For independent steps, consider parallelization
2. **Data Size Management**: Use streaming for large datasets
3. **Error Recovery**: Design workflows to continue after non-critical failures
4. **Caching**: Cache expensive operations between workflow runs

## 🔄 Comparing with Simple Tools

| Aspect             | Simple Tools (1-simple) | Workflows (2-plugin-workflows) |
| ------------------ | ----------------------- | ------------------------------ |
| **Complexity**     | Single operation        | Multi-step processes           |
| **State**          | Stateless               | Stateful with data flow        |
| **Error Handling** | Basic try/catch         | Advanced recovery patterns     |
| **Monitoring**     | Minimal                 | Comprehensive tracking         |
| **Use Cases**      | Utility functions       | Business processes             |
| **Testing**        | Simple unit tests       | Multi-step integration tests   |

## 🎓 Learning Exercises

### Exercise 1: Modify Data Transformations

1. Add a new transformation type to `DataProcessingWorkflow`
2. Implement the transformation logic
3. Test with sample data
4. Observe the step-by-step execution

### Exercise 2: Create Custom Validation Rule

1. Add a new validation rule to `FileManagementWorkflow`
2. Implement the validation logic
3. Test with files that pass and fail validation
4. Check error handling and recovery

### Exercise 3: Extend Content Generation

1. Add support for a new content type (e.g., 'technical-spec')
2. Implement content type-specific outline generation
3. Add quality metrics specific to technical content
4. Test the complete pipeline

## 🔗 Next Steps

Once you're comfortable with workflows:

1. **Advanced Features**: Explore workflow scheduling and dependencies
2. **Custom Workflows**: Build workflows for your specific use cases
3. **API Integration**: Move to `3-plugin-api-auth` for OAuth and external APIs
4. **Production Deployment**: Learn advanced configuration in `4-manual-deps`

## 📚 Additional Resources

- **WorkflowBase Documentation**: Deep dive into the base class methods
- **Plugin Architecture Guide**: Understanding plugin discovery and registration
- **Error Handling Patterns**: Best practices for workflow error management
- **Performance Monitoring**: Advanced resource tracking and optimization

This example provides a solid foundation for building production-ready workflows that can handle complex, multi-step business processes with proper error handling, state management, and monitoring.
