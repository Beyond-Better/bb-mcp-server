Simple MCP Server providing essential utility tools through an automatic plugin discovery system.

## Available Tools

### `current_datetime`
Get current date and time with optional formatting and timezone conversion.

Parameters:
- `format` (optional): "ISO", "locale", or custom format string
- `timezone` (optional): Timezone identifier (e.g., "UTC", "America/New_York")

Useful for timestamping, scheduling operations, and time-based queries.

### `get_system_info`  
Retrieve system information about the server environment.

Parameters:
- `detailed` (optional): Include comprehensive system metrics
- `include_env` (optional): Include relevant environment variables

Returns OS details, runtime version, memory/CPU info, and configuration summary. Use for diagnostics and environment verification.

### `validate_json`
Validate and optionally format JSON strings.

Parameters:
- `json_string`: JSON content to validate (required)
- `format`: Pretty-print the JSON (default: true)
- `indent`: Indentation spaces, 0-8 (default: 2)

Provides syntax validation, error reporting with locations, and formatted output.

## Usage Guidelines

- All tools include comprehensive parameter validation
- Use `get_system_info` for server diagnostics and troubleshooting
- Use `validate_json` before processing JSON data in workflows
- Use `current_datetime` for timestamping and time-based operations
- Tools are automatically discovered and loaded from the plugin system