MCP Server with complete manual dependency override and expert-level infrastructure control. All components manually configured without plugin discovery.

## Available Tools

### `get_server_status`
Comprehensive server status including all manually configured components.

Returns:
- Server configuration with custom dependency status
- Manually registered tools and workflows
- Advanced transport and authentication status
- Custom storage and component health information

### `echo`
Basic connectivity and response testing.

Parameters:
- `message`: Text to echo back (required)

### `test_sampling`
Test LLM sampling capabilities when configured.

Parameters:
- `prompt`: Text prompt for sampling (required)
- `model`: Model identifier to use (required)

### `test_elicitation`
Test user input elicitation when configured.

Parameters:
- `message`: Message to present to user (required)
- `requestedSchema`: Schema for elicitation (required)

### Workflow Tools (if workflows manually registered)

#### `execute_workflow`
🎯 **PRIMARY TOOL** - Execute manually registered workflows.

Parameters:
- `workflow_name`: Name of workflow to execute (required)
- `parameters`: Workflow-specific parameters with `userId` required

#### `get_schema_for_workflow`
📋 **SCHEMA DISCOVERY** - Get schemas for manually registered workflows.

Parameters:
- `workflow_name`: Workflow to get schema for (required)

## Configuration Notes

**Manual Registration**: 
- All tools and workflows manually registered (no plugin discovery)
- Custom dependencies override all library defaults
- Advanced configuration for all infrastructure components

**Expert-Level Features**:
- Custom transport configuration with advanced middleware
- Advanced storage setup with custom schemas and cleanup
- Custom OAuth implementations with provider-specific flows
- Enhanced security policies and audit configurations

**Usage Guidelines**:
- Use `get_server_status` to understand available manually registered components
- All workflows require proper `userId` for authentication and audit
- Advanced error handling with custom recovery strategies
- Performance optimized through custom configurations