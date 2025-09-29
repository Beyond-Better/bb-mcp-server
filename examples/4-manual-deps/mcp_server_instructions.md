MCP Server with complete manual dependency override and advanced infrastructure control. Demonstrates expert-level customization patterns with full component control.

## Advanced Configuration

This server provides complete control over all infrastructure components:
- Custom transport configuration and session management
- Advanced KV storage setup with custom schemas
- Manual tool and workflow registration (no plugin discovery)
- Custom OAuth implementation with provider-specific flows
- Advanced error handling and recovery patterns

## Available Tools

### Core Infrastructure Tools

#### `get_server_status`
Comprehensive server status including all custom components.

Returns:
- Custom dependency status and health checks
- Manual registration statistics (tools/workflows)
- Advanced transport configuration details
- Custom storage and authentication component status

#### `echo`
Basic connectivity and response testing tool.

Parameters:
- `message`: Text to echo back (required)

Useful for connection testing and basic server responsiveness.

#### `test_sampling`
Test LLM sampling capabilities when configured.

Parameters:
- `prompt`: Text prompt for sampling (required)
- `model`: Model identifier to use (required)

Demonstrates integration with LLM sampling services.

#### `test_elicitation`
Test user input elicitation when configured.

Parameters:
- `message`: Message to present to user (required)
- `requestedSchema`: Schema for elicitation (required)

Demonstrates user interaction and input collection.

### Custom Workflow Tools

#### `execute_workflow`
🎯 **PRIMARY WORKFLOW TOOL** - Execute manually registered workflows.

- Workflows are manually registered, not auto-discovered
- Custom validation and execution patterns
- Advanced error handling and recovery
- Full control over workflow lifecycle

#### `get_schema_for_workflow`
📋 **WORKFLOW SCHEMA DISCOVERY** - Get schemas for manually registered workflows.

- Enhanced schema information with custom metadata
- Advanced parameter validation rules
- Custom dependency requirements
- Detailed execution context information

## Manual Registration Pattern

Unlike other examples, this server:
- **No Plugin Discovery**: All components manually registered
- **Custom Dependencies**: Override all default library components
- **Advanced Configuration**: Fine-tuned infrastructure settings
- **Expert Control**: Complete customization of all behaviors

## Infrastructure Components

### Custom Transport
- Advanced HTTP configuration with custom middleware
- Session management with custom timeout rules
- CORS handling with specific domain allowlists
- Request/response transformation pipelines

### Custom Storage
- Advanced Deno KV configuration with custom schemas
- Custom cleanup and maintenance schedules
- Advanced indexing and query capabilities
- Custom backup and recovery procedures

### Custom Authentication
- Provider-specific OAuth implementations
- Custom token validation and refresh logic
- Advanced security policies and audit trails
- Custom session management with enhanced security

## Usage Guidelines

**Expert-level patterns**:
- All components manually configured and controlled
- Advanced error handling with custom recovery strategies
- Performance optimization through custom configurations
- Security hardening with custom policies

**Development approach**:
- Start with library defaults, then override specific components
- Test each custom component thoroughly before integration
- Maintain backward compatibility with standard MCP protocols
- Document all custom configurations and dependencies

**Infrastructure control**:
- Custom monitoring and health check implementations
- Advanced logging with structured data and custom formats
- Performance metrics collection and analysis
- Custom deployment and maintenance procedures

## Advanced Error Handling

- Custom error classification and recovery strategies
- Advanced retry logic with custom backoff algorithms
- Circuit breaker patterns for external dependencies
- Comprehensive error reporting with custom context

## Security Enhancements

- Custom authentication flows with enhanced validation
- Advanced token management with custom encryption
- Custom audit trails with detailed security logging
- Enhanced protection against common security threats

## Performance Optimization

- Custom caching strategies for improved response times
- Advanced connection pooling and resource management
- Custom load balancing and failover procedures
- Performance monitoring with custom metrics collection