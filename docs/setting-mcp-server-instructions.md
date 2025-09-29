# MCP Server Instructions Configuration Guide

## Overview

MCP Server Instructions provide essential context for LLM (Large Language Model) clients to understand your server's capabilities, tools, workflows, and usage patterns. According to the MCP specification, these instructions serve as "hints" to the model and may be added to the system prompt to improve the LLM's understanding of available functionality.

## Why Instructions Matter

### **For LLM Context**
Instructions help AI models understand:
- **Available tools and their purposes**
- **When to use specific tools vs workflows**
- **Required parameters and validation rules**
- **Authentication requirements and OAuth flows**
- **Error handling patterns and recovery strategies**
- **Best practices for optimal results**

### **For User Experience**
- **Reduces trial and error**: LLMs make better tool/workflow choices
- **Improves accuracy**: Clear parameter requirements reduce validation errors
- **Enables complex workflows**: Multi-step process guidance
- **Handles authentication**: OAuth flow instructions for secure APIs
- **Provides troubleshooting**: Common error patterns and solutions

### **For Development**
- **Self-documenting servers**: Instructions serve as living documentation
- **Consistent usage patterns**: Standardized approaches across different clients
- **Easier debugging**: Clear context for understanding LLM decisions
- **Better testing**: Instructions help in creating comprehensive test scenarios

## Configuration Options

The bb-mcp-server library provides a flexible, priority-based system for loading instructions:

### **1. Direct Configuration (Highest Priority)**
```bash
MCP_SERVER_INSTRUCTIONS="Your complete instructions as a string..."
```

**Use when**:
- Instructions are short and simple
- Dynamic instruction generation from other systems
- Environment-specific instructions (dev/staging/prod)
- Instructions stored in configuration management systems

**Example**:
```bash
MCP_SERVER_INSTRUCTIONS="Customer Service MCP Server. Use get_customer_info for customer queries, create_support_ticket for issues, and escalate_to_human for complex problems."
```

### **2. File Path Configuration (Second Priority)**
```bash
MCP_INSTRUCTIONS_FILE="./config/server-instructions.md"
```

**Use when**:
- Instructions are complex and lengthy
- Multiple environments with different instruction files
- Instructions maintained separately from code
- Custom file naming or location requirements

**Example**:
```bash
# Development environment
MCP_INSTRUCTIONS_FILE="./config/instructions-dev.md"

# Production environment  
MCP_INSTRUCTIONS_FILE="./config/instructions-prod.md"
```

### **3. Default File Location (Third Priority)**
Place `mcp_server_instructions.md` in your project root (no configuration needed).

**Use when**:
- Following standard conventions
- Simple deployment scenarios
- Instructions are part of your codebase
- No special environment requirements

### **4. Automatic Fallback (Always Available)**
The library provides generic workflow-focused instructions as a final fallback.

**Features**:
- Never fails - always provides instructions
- Generic guidance for workflow patterns
- Core tool usage (execute_workflow, get_schema_for_workflow)
- Basic error handling patterns

## Writing Effective Instructions

### **Structure Guidelines**

1. **Start with Purpose**: Brief description of what the server does
2. **List Available Tools**: Core tools with parameters and usage
3. **Describe Workflows**: Multi-step processes with key parameters
4. **Authentication Requirements**: OAuth flows, API keys, user context
5. **Usage Patterns**: When to use tools vs workflows
6. **Error Handling**: Common issues and resolution strategies

### **Content Best Practices**

**Be Specific and Actionable**:
```markdown
# Good
## get_customer_info
Retrieve customer details by ID or email. Required for all customer service workflows.
Parameters:
- customer_id: Unique customer identifier (required if no email)
- email: Customer email address (required if no customer_id)

# Avoid
## get_customer_info
Get customer information.
```

**Include Parameter Details**:
- Mark required vs optional parameters clearly
- Provide valid value ranges and formats
- Explain parameter relationships and dependencies
- Include examples of valid parameter combinations

**Explain Usage Context**:
- When to use each tool
- Prerequisites for tool execution
- Expected outcomes and response formats
- Integration with other tools/workflows

### **Authentication Documentation**

For OAuth-enabled servers, include:

```markdown
## Authentication Requirements

**CRITICAL**: All workflows require proper OAuth authentication:
- Users must complete OAuth flow before workflow execution  
- Use `oauth_status` to check authentication state
- Use `initiate_oauth_flow` to start authentication
- Tokens refresh automatically during operations

## Authentication Flow
1. Check status: `oauth_status` with userId
2. If not authenticated: `initiate_oauth_flow` 
3. Complete OAuth through returned URL
4. Execute workflows with authenticated context
```

### **Workflow vs Tools Guidance**

Help LLMs make the right choice:

```markdown
## When to use workflows:
- Multi-step processes requiring state management
- Complex business logic with error recovery
- Operations needing audit trails
- Long-running or resumable processes

## When to use tools:
- Single-purpose, immediate operations
- Stateless transformations
- Building blocks for workflows
- Quick calculations or validations
```

## Example Instructions by Complexity

### **Simple Server (Basic Tools)**
```markdown
Utility MCP Server providing essential system tools.

## Available Tools

### current_datetime
Get current date/time with optional formatting.
Parameters: format (optional), timezone (optional)

### validate_json  
Validate JSON strings with error reporting.
Parameters: json_string (required), format (optional)

## Usage
- Use current_datetime for timestamping operations
- Use validate_json before processing JSON data
```

### **Workflow Server (Multi-Step Processes)**
```markdown
Workflow MCP Server for complex business processes.

## Essential Pattern
1. Use `get_schema_for_workflow` to understand parameters
2. Use `execute_workflow` with validated parameters  
3. Handle partial failures by checking step results

## Available Workflows

### data_processing_pipeline
Multi-step data transformation: validate → enrich → transform → output
Key parameters: input_data (required), transformation_rules, output_format
```

### **OAuth Server (External APIs)**
```markdown
Authenticated MCP Server with external API integration.

## Authentication Required
All workflows require OAuth. Check `oauth_status` first.

## Available Workflows

### external_data_sync  
Sync with external APIs using OAuth credentials.
Auth: Required | Duration: 45-90s
Parameters: api_endpoint, sync_criteria, transformation_rules
```

## Loading System Implementation

### **Automatic Integration**
The bb-mcp-server library automatically loads instructions during server initialization:

```typescript
// In DependencyHelpers.getMcpServerInstructions()
const instructions = await loadInstructions({
  logger: this.logger,
  instructionsConfig: this.configManager.get('MCP_SERVER_INSTRUCTIONS'),
  instructionsFilePath: this.configManager.get('MCP_INSTRUCTIONS_FILE'),
  defaultFileName: 'mcp_server_instructions.md',
  basePath: Deno.cwd(),
});
```

### **Validation and Fallback**
- Instructions are validated for minimum length and content
- Failed loading attempts fall through to next priority level
- Comprehensive logging for debugging loading issues
- Generic fallback ensures instructions are always available

### **Error Handling**
- File read errors gracefully handled with fallback
- Empty or invalid instructions trigger fallback chain
- Comprehensive error logging for troubleshooting
- Server never fails due to instruction loading issues

## Testing Instructions

### **Validation Testing**
```typescript
import { validateInstructions } from '@beyondbetter/bb-mcp-server/utils';

// Test instruction content
const isValid = validateInstructions(instructionContent);
console.log('Instructions valid:', isValid);
```

### **Loading Testing**
```typescript
import { loadInstructions } from '@beyondbetter/bb-mcp-server/utils';

// Test loading with different configurations
const instructions = await loadInstructions({
  logger: mockLogger,
  instructionsConfig: 'test instructions',
  // ... other options
});
```

### **Integration Testing**
Test that LLM clients receive and use instructions appropriately:
- Verify instructions appear in MCP client context
- Test LLM tool selection based on instruction guidance
- Validate parameter usage follows instruction patterns
- Confirm error handling matches instruction guidance

## Best Practices

### **Development**
1. **Start Simple**: Begin with basic tool descriptions, add complexity gradually
2. **Version Control**: Keep instructions in source control with your code
3. **Environment Specific**: Use different instructions for dev/staging/prod if needed
4. **Regular Updates**: Keep instructions current as tools/workflows evolve
5. **Test Integration**: Verify LLMs use instructions effectively

### **Deployment**
1. **Environment Variables**: Use MCP_INSTRUCTIONS_FILE for environment-specific instructions
2. **Configuration Management**: Store instructions in config systems for dynamic updates
3. **Monitoring**: Log instruction loading success/failure for debugging
4. **Fallback Strategy**: Always ensure fallback instructions are appropriate
5. **Documentation**: Keep human documentation (README) separate from LLM instructions

### **Maintenance**
1. **Keep Current**: Update instructions when tools/workflows change
2. **User Feedback**: Monitor LLM behavior to improve instruction effectiveness
3. **Performance**: Monitor instruction length impact on LLM context usage
4. **Security**: Don't include sensitive information in instructions
5. **Validation**: Regularly test instruction loading and validation

## Troubleshooting

### **Instructions Not Loading**
- Check file permissions and paths
- Verify environment variable names and values
- Review server logs for loading errors
- Test with direct configuration first

### **LLM Not Following Instructions**
- Ensure instructions are clear and specific
- Check parameter descriptions are comprehensive
- Verify authentication requirements are clearly stated
- Test with simpler, more direct instruction language

### **Performance Issues**
- Monitor instruction length impact on context usage
- Consider splitting very long instructions
- Use environment-specific instructions to reduce context size
- Balance detail with conciseness

By following this guide, you'll create effective MCP Server Instructions that significantly improve LLM understanding and usage of your server's capabilities.