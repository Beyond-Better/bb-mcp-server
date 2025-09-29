MCP Server demonstrating multi-step workflow execution alongside simple tools. Use workflows for complex, stateful operations and tools for simple, immediate tasks.

## Essential Workflow Pattern

**CRITICAL**: Always get workflow schema before execution:
1. Use `get_server_status` to see available workflow names
2. Use `get_schema_for_workflow` to understand parameters and workflow details
3. Use `execute_workflow` with validated parameters
4. Handle partial failures by checking `completed_steps` and `failed_steps`

## Available Workflows

### `data_processing_pipeline`
**Category**: Processing | **Duration**: 30-60s
Multi-step data transformation through validation, enrichment, transformation, and output generation.

Key parameters:
- `input_data`: Raw data to process (required)
- `transformation_rules`: Business logic rules
- `output_format`: JSON, CSV, or XML
- `validation_level`: basic, standard, or strict

### `file_management_workflow`
**Category**: Operations | **Duration**: 15-45s
Complete file lifecycle: create → validate → process → archive → cleanup.

Key parameters:
- `file_operation`: create, import, or convert
- `file_path`: Source file location
- `processing_rules`: File processing specifications
- `archive_location`: Destination for processed files

### `content_generation_workflow`
**Category**: Creative | **Duration**: 60-120s
Structured content creation: plan → generate → review → publish → track.

Key parameters:
- `content_type`: documentation, marketing, or technical
- `requirements`: Content specifications
- `style_guide`: Formatting requirements
- `target_audience`: Audience optimization

## Core Tools

### `execute_workflow`
🎯 **PRIMARY TOOL** - Execute any available workflow with comprehensive validation.

Parameters:
- `workflow_name`: Name of workflow to run (required)
- `parameters`: Workflow-specific parameters with `userId` required

### `get_schema_for_workflow`
📋 **ESSENTIAL** - Get parameter schema and requirements before workflow execution.

Parameters:
- `workflow_name`: Workflow to get schema for (required)

### `get_server_status`
Server health information and available workflow names. Use `get_schema_for_workflow` for detailed workflow information.

## Usage Guidelines

**When to use workflows**:
- Multi-step processes requiring state management
- Complex business logic with error recovery
- Operations needing audit trails and progress tracking
- Long-running or resumable processes

**When to use tools**:
- Single-purpose, immediate operations
- Stateless transformations
- Building blocks for workflows
- Quick calculations or validations

**Error handling**:
- Workflows may partially succeed - always check step results
- Use dry-run mode for parameter validation
- Include userId for authentication and audit logging
- Review failed steps for specific error resolution