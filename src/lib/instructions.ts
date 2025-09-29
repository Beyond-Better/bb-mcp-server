/**
 * Default instructions content for Beyond MCP Servers
 * 
 * This file exports generic instructions as a string to ensure they're 
 * properly embedded in the compiled binary as a reliable fallback.
 * 
 * These instructions focus on the core workflow system and can be 
 * overridden by server-specific instructions files.
 */

export const DEFAULT_INSTRUCTIONS = `MCP Server built with bb-mcp-server library - Workflow-driven integration server.

## Overview

This MCP server provides comprehensive workflow automation through a sophisticated workflow engine built on the bb-mcp-server library. The server enables automated multi-step operations, data processing, and integration workflows through a structured, validated approach.

**Connection**: The server operates via configurable transport (STDIO or HTTP), with authentication and session management when configured.

## Core Capabilities

### Workflow Engine
Execute complex, multi-step workflows for business operations:
- **Data Processing**: Automated data transformation, validation, and processing workflows  
- **Integration Operations**: Connect and orchestrate between different services and APIs
- **Business Logic**: Execute domain-specific operations through structured workflows
- **Audit Trail**: Comprehensive logging of all operations for compliance and debugging

### Validation & Error Handling
Robust parameter validation and error handling:
- **Schema-based Validation**: All workflows include comprehensive input validation
- **Structured Error Responses**: Clear error messages with context and recovery suggestions
- **Partial Failure Handling**: Graceful handling of complex workflows with multiple steps
- **Dry Run Support**: Validate parameters without executing operations

### Authentication & Security
Configurable authentication and security features:
- **Multi-user Support**: Per-user authentication with session management (when configured)
- **OAuth Integration**: Support for OAuth 2.0 flows for third-party service integration
- **Session Management**: Persistent authentication across workflow executions
- **Audit Logging**: Complete audit trail of user actions and system events

## Essential Workflow Pattern

**CRITICAL**: Always discover available workflows and their schemas before execution:

1. **Workflow Discovery**: 
   - Use \`get_server_status\` to discover available workflows
   - Use \`get_schema_for_workflow\` to understand parameter requirements
   - Review workflow categories, tags, and estimated duration
2. **Parameter Preparation**: Prepare parameters according to the schema validation rules
3. **Workflow Execution**: Use \`execute_workflow\` with validated parameters
4. **Result Processing**: Handle success, partial failure, and error responses appropriately

## Key Tools

### Workflow Execution
- **execute_workflow**: Main tool for running business workflows
  - **CRITICAL**: Always get the workflow schema first using \`get_schema_for_workflow\`
  - Requires proper authentication context (userId parameter)
  - Supports dry-run mode for parameter validation  
  - Returns detailed success/failure reporting with structured results
  - Each workflow includes comprehensive validation and error handling

### Workflow Discovery
- **get_schema_for_workflow**: **ESSENTIAL** - Get detailed parameter schemas and requirements
  - **Usage Pattern**: 
    1. Use this tool FIRST to understand workflow requirements
    2. Review parameter schema, required fields, and validation rules
    3. Check workflow overview, category, and tags for appropriate usage
    4. Prepare parameters according to the schema
    5. Execute workflow with \`execute_workflow\`
  - Returns comprehensive schema information including:
    - Parameter validation rules and required fields
    - Workflow overview, description, and usage guidance
    - Authentication requirements and estimated duration
    - Best practices and workflow-specific instructions

### Server Management
- **get_server_status**: Monitor server health and discover available workflows
  - Shows server configuration, transport type, and initialization status
  - Lists all available workflows with names and categories
  - Provides tool registration information and system metrics
- **echo**: Simple connectivity test tool
- **test_sampling**: Test LLM sampling capabilities (if configured)
- **test_elicitation**: Test user input elicitation (if configured)

## Workflow Categories

The server provides various categories of workflows for business operations. Use \`get_server_status\` to discover currently available workflows, then use \`get_schema_for_workflow\` to get detailed parameter requirements for specific workflows.

### Common Workflow Types
- **Query**: Data retrieval and search operations
- **Operation**: Data modification and business logic execution  
- **Integration**: Third-party service integration and API operations
- **Processing**: Data transformation and validation workflows
- **Management**: System administration and configuration workflows

### Workflow Discovery Process
1. **List Available**: Use \`get_server_status\` to see all available workflows
2. **Get Schema**: Use \`get_schema_for_workflow\` to understand parameter requirements
3. **Validate Parameters**: Ensure all required parameters are prepared correctly
4. **Execute**: Run workflow with \`execute_workflow\` using validated parameters
5. **Handle Results**: Process success, partial failure, or error responses

## Error Handling & Troubleshooting

### Common Issues

**"Workflow not found" errors**:
- **Cause**: Using incorrect or unavailable workflow names
- **Solution**: Use \`get_server_status\` to discover available workflows
- **Prevention**: Always verify workflow availability before execution

**"Parameter validation failed" errors**:
- **Cause**: Missing required parameters or invalid parameter formats
- **Solution**: Use \`get_schema_for_workflow\` to understand parameter requirements
- **Check**: Review the parameter schema and validation rules carefully

**Authentication failures**:
- **Cause**: Missing or invalid userId parameter, or expired authentication
- **Solution**: Ensure userId is provided for all workflow executions
- **Check**: Authentication requirements are specified in workflow schemas

**Workflow execution failures**:
- **Expected**: Complex workflows may encounter partial failures
- **Response**: Check workflow results for detailed error information
- **Action**: Review error messages and retry operations if appropriate

### Best Practices

**Always follow the workflow discovery pattern**:
- Never assume workflow names or parameters
- Always use \`get_schema_for_workflow\` before executing workflows
- Validate all parameters according to the schema before execution
- Handle partial failures gracefully by examining detailed results

**Parameter Preparation**:
- Review required vs optional parameters in the schema
- Ensure proper data types and format validation
- Include userId parameter for authentication and audit logging
- Use requestId parameter for operation tracking when needed

## Integration Patterns

### LLM-Guided Workflows
The server integrates seamlessly with LLM systems for:
- **Intelligent Parameter Collection**: LLM-guided parameter gathering from user input
- **Schema-based Validation**: Automatic parameter validation using workflow schemas  
- **Error Interpretation**: LLM-assisted error analysis and resolution suggestions
- **Multi-step Orchestration**: Complex business processes with intelligent decision making
- **Result Processing**: Structured analysis and presentation of workflow results

### Development and Testing
- **Dry Run Mode**: Test workflow parameters without executing operations
- **Schema Validation**: Comprehensive parameter validation before execution
- **Detailed Logging**: Full audit trail of workflow execution and results
- **Error Context**: Rich error information with recovery suggestions

This MCP server transforms complex business operations into automated, reliable, and auditable workflows while providing intelligent integration capabilities for LLM-assisted automation systems.`;