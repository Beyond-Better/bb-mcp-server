# 1-Simple: Basic Plugin Tools Example

**Complexity**: ⭐ Beginner\
**Learning Focus**: "How to get started with minimal setup"\
**Duration**: ~15 minutes to understand and run

This example demonstrates the simplest approach to building an MCP server with bb-mcp-server:

- Zero custom dependencies (uses library defaults)
- Plugin discovery with basic utility tools
- Minimal configuration and maximum learning focus

## 🎯 What You'll Learn

### Core Concepts

- **Plugin Architecture**: Self-contained plugins with discovery
- **Tool Development**: Basic utility tools with parameter validation
- **Configuration Management**: Environment-driven configuration
- **Transport Modes**: STDIO vs HTTP transport options

### Technical Skills

- Creating self-contained plugins
- Parameter validation with Zod schemas
- Error handling and response formatting
- System integration and data retrieval
- JSON validation and formatting

## 🏗️ Architecture Overview

```
Simple MCP Server
├── main.ts                    # Minimal AppServer setup
├── src/plugins/
│   └── SimplePlugin.ts        # Self-contained plugin
│       ├── current_datetime   # Basic data retrieval
│       ├── get_system_info    # System integration
│       └── validate_json      # Data validation
└── Library Defaults
    ├── Logger
    ├── TransportManager
    ├── WorkflowRegistry
    └── ConfigManager
```

### Key Architectural Benefits

- **🎯 Zero Boilerplate**: Library handles all infrastructure
- **🔍 Plugin Discovery**: Automatic tool registration from plugin arrays
- **⚙️ Environment Driven**: Complete configuration via .env
- **🚀 Transport Agnostic**: Works with STDIO and HTTP
- **🛡️ Production Ready**: Complete error handling and logging
- **📋 Declarative**: Tools defined in simple arrays, no manual registration

## 🚀 Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.0+ installed (tested with v2.5.x)
- Basic understanding of TypeScript/JavaScript

### Setup Steps

1. **Navigate to the example**:
   ```bash
   cd examples/1-simple
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env if needed (defaults work fine)
   ```

3. **Run with STDIO transport** (default):
   ```bash
   deno run --allow-all main.ts
   # or
   deno task start
   ```

4. **Run with HTTP transport** (for testing):
   ```bash
   MCP_TRANSPORT=http deno run --allow-all main.ts
   # or
   deno task start:http
   ```

5. **Access HTTP interface** (if using HTTP transport):
   ```
   http://localhost:3000
   ```

## 🔧 Available Tools

The SimplePlugin provides three utility tools:

### 1. current_datetime

**Purpose**: Demonstrates basic data retrieval and formatting

```typescript
// Basic usage
{
  "tool": "current_datetime"
}

// With options
{
  "tool": "current_datetime",
  "args": {
    "timezone": "America/New_York",
    "format": "human"
  }
}
```

**Parameters**:

- `timezone` (optional): Timezone string (e.g., "UTC", "America/New_York")
- `format` (optional): Output format - "iso" (default), "human", "unix", "custom"
- `customFormat` (optional): Custom format string when format="custom"

**Learning Points**:

- Parameter validation with optional fields
- Data formatting and transformation
- Timezone handling
- Multiple output formats

### 2. get_system_info

**Purpose**: Shows system integration and information gathering

```typescript
// Basic usage
{
  "tool": "get_system_info"
}

// Detailed info
{
  "tool": "get_system_info",
  "args": {
    "detail": "detailed",
    "includeMemory": true,
    "includeEnvironment": true
  }
}
```

**Parameters**:

- `detail` (optional): "basic" (default) or "detailed"
- `includeMemory` (optional): Include memory usage info (default: true)
- `includeEnvironment` (optional): Include safe environment variables (default: false)

**Learning Points**:

- Safe system API integration
- Memory and resource information
- Structured data response formatting
- Security considerations for system data

### 3. validate_json

**Purpose**: Demonstrates data validation and transformation

```typescript
// Validate and format JSON
{
  "tool": "validate_json",
  "args": {
    "json_string": "{\"name\": \"test\", \"value\": 42}",
    "format": true,
    "indent": 2
  }
}

// Validation only
{
  "tool": "validate_json",
  "args": {
    "json_string": "{invalid json}",
    "validate_only": true
  }
}
```

**Parameters**:

- `json_string`: JSON string to validate and format
- `format` (optional): Whether to prettify the JSON (default: true)
- `validate_only` (optional): Only validate, don't return formatted JSON (default: false)
- `indent` (optional): Indentation spaces (default: 2)

**Learning Points**:

- Input validation and error handling
- JSON parsing and formatting
- User-friendly error messages
- Data transformation and analysis

## 🔧 Plugin Development Patterns

### ✅ Correct Plugin Pattern (Used in This Example)

The SimplePlugin demonstrates the **RECOMMENDED** approach for MCP plugin development:

```typescript
// ✅ CORRECT: Declarative plugin with tools array
const SimplePlugin: AppPlugin = {
  name: 'simple-plugin',
  version: '1.0.0',
  description: 'Basic utility tools',

  // 🎯 Populate tools array - PluginManager handles registration automatically
  tools: [
    {
      name: 'current_datetime',
      definition: { title: 'Current DateTime' /* ... */ },
      handler: async (args) => {/* tool logic */},
    },
    // ... more tools
  ],

  workflows: [], // Empty for simple tools-only plugins
};

export default SimplePlugin;
```

### ❌ Avoid: Complex Initialize Pattern

```typescript
// ❌ AVOID: Complex initialization (only needed for advanced cases)
const ComplexPlugin: AppPlugin = {
  name: 'complex-plugin',
  tools: [], // Empty initially
  workflows: [],

  // ⚠️ CORRECT signature when initialize() is needed:
  async initialize(
    dependencies: AppServerDependencies,
    toolRegistry: ToolRegistry,
    workflowRegistry: WorkflowRegistry,
  ): Promise<void> {
    // Only use for complex async setup (database connections, etc.)
    // PluginManager calls: plugin.initialize(pluginDependencies, toolRegistry, workflowRegistry)

    // Manual registration - unnecessary complexity for most cases
    toolRegistry.registerTool('tool_name', definition, handler);
  },
};
```

### 🎓 When to Use Each Pattern

| Pattern               | Use Case                   | Example                                  |
| --------------------- | -------------------------- | ---------------------------------------- |
| **Tools Array**       | Most plugins (recommended) | Static tool definitions                  |
| **Initialize Method** | Complex async setup only   | Database connections, external API setup |

**Reference**: See `examples/plugin-api-auth/src/plugins/ExamplePlugin.ts` for more advanced patterns with dependency injection.

### 🔄 Plugin Registration Flow

1. **PluginManager discovers** plugin files in configured paths
2. **Imports plugin** and reads `tools` and `workflows` arrays
3. **Registers each tool/workflow** automatically with MCP server
4. **No plugin code needed** for registration - it's all automatic!

## 🧪 Testing

Run the demonstration tests to see testing patterns:

```bash
# Run all tests
deno test --allow-all tests/

# Run specific test file
deno test --allow-all tests/tools/CurrentDatetimeTool.test.ts

# Run tests in watch mode
deno task test:watch
```

### Test Structure

```
tests/
├── tools/                     # Tool-specific tests
│   ├── CurrentDatetimeTool.test.ts
│   ├── GetSystemInfoTool.test.ts
│   └── ValidateJsonTool.test.ts
├── integration/               # Integration tests
│   └── PluginDiscovery.test.ts
└── utils/                     # Test utilities
    ├── test-helpers.ts
    └── mock-services.ts
```

## 📝 Configuration Options

### Environment Variables

All configuration is done via `.env` file:

```bash
# Transport
MCP_TRANSPORT=stdio           # or 'http'
HTTP_PORT=3000               # HTTP port (when transport=http)
HTTP_ALLOW_INSECURE=true     # Allow HTTP without OAuth (development only)

# Logging
LOG_LEVEL=info               # debug, info, warn, error
LOG_FORMAT=text              # text or json

# Plugins
PLUGINS_DISCOVERY_PATHS=./src/plugins
PLUGINS_AUTOLOAD=true

# Storage
STORAGE_DENO_KV_PATH=./data/simple-mcp-server.db
```

### Development vs Production

**Development**:

```bash
LOG_LEVEL=debug
DEV_MODE=true
PLUGINS_WATCH_CHANGES=false  # true for hot reload
```

**Production**:

```bash
LOG_LEVEL=info
DEV_MODE=false
AUDIT_ENABLED=true
```

## 🔍 Troubleshooting

### Common Issues

1. **Plugin not loading**:
   ```bash
   # Check plugin discovery path
   PLUGINS_DISCOVERY_PATHS=./src/plugins

   # Enable debug logging
   LOG_LEVEL=debug

   # Check plugin syntax
   deno check src/plugins/SimplePlugin.ts
   ```

2. **Permission errors**:
   ```bash
   # Ensure all permissions
   deno run --allow-all main.ts

   # Or specific permissions
   deno run --allow-net --allow-read --allow-write --allow-env main.ts
   ```

3. **HTTP transport not working**:
   ```bash
   # Check transport setting
   MCP_TRANSPORT=http

   # Check port availability
   lsof -i :3000

   # Try different port
   HTTP_PORT=3001
   ```

4. **Tool validation errors**:
   - Check parameter schemas in SimplePlugin.ts
   - Verify JSON structure matches Zod schemas
   - Use debug logging to see validation details

### Debug Mode

Enable comprehensive logging:

```bash
LOG_LEVEL=debug deno run --allow-all main.ts
```

## 🎓 Learning Exercises

### Beginner Exercises

1. **Add a new tool** to SimplePlugin:
   - Create a `random_number` tool with min/max parameters
   - Add proper validation and error handling
   - Test with different parameter combinations

2. **Modify existing tools**:
   - Add more timezone options to `current_datetime`
   - Add more system info to `get_system_info`
   - Add XML validation to `validate_json` (rename appropriately)

3. **Experiment with configuration**:
   - Try different log levels and formats
   - Switch between STDIO and HTTP transports
   - Modify plugin discovery settings

### Intermediate Exercises

1. **Create a second plugin** in the same example:
   - Add `MathPlugin.ts` with calculation tools
   - Configure plugin loading preferences
   - Test plugin interaction and isolation

2. **Add data persistence**:
   - Use the KV store to save tool usage statistics
   - Create a `get_usage_stats` tool
   - Implement data cleanup and management

3. **Enhance error handling**:
   - Add custom error types
   - Implement retry mechanisms
   - Add user-friendly error messages

## 🚀 Next Steps

After mastering this simple example:

1. **→ [2-plugin-workflows](../2-plugin-workflows/)**
   - Learn when to use workflows vs simple tools
   - Understand multi-step process orchestration
   - Master state management and error recovery

2. **→ [3-plugin-api-auth](../3-plugin-api-auth/)**
   - Add external API integration
   - Implement OAuth authentication
   - Learn custom dependency patterns

3. **→ [4-manual-deps](../4-manual-deps/)**
   - Gain complete infrastructure control
   - Master advanced configuration patterns
   - Learn manual registration techniques

## 💡 Key Takeaways

### What Makes This Simple

- **Zero Infrastructure Code**: AppServer handles everything
- **Plugin Discovery**: Automatic tool registration
- **Minimal Configuration**: Everything via environment variables
- **Focus on Tools**: Spend time on business logic, not setup

### What You've Learned

- Self-contained plugin architecture
- Tool development patterns and best practices
- Parameter validation and error handling
- Environment-driven configuration
- Testing patterns for tools and plugins

### Production Readiness

This simple example is actually production-ready:

- Complete error handling and logging
- Security best practices
- Performance monitoring
- Graceful shutdown and cleanup
- Comprehensive configuration options

---

**🎯 Success Criteria**: You've mastered this example when you can:

- Create new tools following the established patterns
- Configure the server for different environments
- Debug issues using logging and error messages
- Write tests for your custom tools
- Explain when to use this approach vs more complex examples
