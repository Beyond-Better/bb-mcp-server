# bb-mcp-server Consumer Example

This example demonstrates how to create a custom MCP server using the bb-mcp-server library. It showcases dramatically simplified consumer code that leverages comprehensive library infrastructure for rapid MCP server development.

## Architecture Overview

This example shows a hypothetical "ExampleCorp API" MCP server that:
- Integrates with a third-party API (ExampleCorp)
- Provides custom workflows for business operations
- Uses OAuth for authentication with the third-party service
- Demonstrates both STDIO and HTTP transport capabilities

## File Structure

```
example/
├── README.md                     # This file
├── main.ts                       # ~30 lines (simplified entry point)
├── deno.jsonc                    # Configuration with library dependency
├── .env.example                  # Environment variables template
├── src/
│   ├── server/
│   │   └── ExampleMCPServer.ts   # ~150 lines (extends library MCPServer)
│   ├── tools/
│   │   └── ExampleTools.ts       # ~200 lines (custom MCP tools)
│   ├── workflows/
│   │   ├── ExampleQueryWorkflow.ts
│   │   └── ExampleOperationWorkflow.ts
│   ├── auth/
│   │   └── ExampleOAuthConsumer.ts # ~100 lines (extends library OAuth)
│   ├── api/
│   │   └── ExampleApiClient.ts   # Third-party API client
│   └── config/
│       └── ExampleDependencies.ts # Dependency setup
└── instructions.md               # MCP server instructions
```

## Key Demonstrations

### 1. Simplified Main Entry Point
The `main.ts` file demonstrates dramatic simplification:
- **Typical MCP Server:** 200+ lines of complex dependency injection
- **With bb-mcp-server:** ~30 lines using library infrastructure

### 2. Server Implementation
The `ExampleMCPServer.ts` shows how to extend the library:
- Uses generic `MCPServer` from the library
- Adds custom tools and workflows
- Integrates with third-party APIs
- **Typical Implementation:** 2000+ lines of complex MCP server logic
- **With bb-mcp-server:** ~150 lines of business-specific logic

### 3. OAuth Integration
Demonstrates OAuth consumer pattern:
- Extends library `OAuthConsumer` base class
- Configures provider-specific OAuth flows
- Handles token management automatically

### 4. Custom Workflows
Shows how to create custom workflows:
- Extends library `WorkflowBase`
- Implements business-specific operations
- Uses library validation and error handling

### 5. Custom Tools
Demonstrates MCP tool creation:
- Uses library `ToolRegistry` for registration
- Leverages Zod validation from library
- Integrates with workflow execution

## How This Demonstrates Library Benefits

This example demonstrates key library benefits:

1. **Code Reduction:** Consumer code reduced by 80-90% compared to typical implementations
2. **Clear Separation:** Library handles infrastructure, consumer handles business logic
3. **Extensibility:** Easy to add custom workflows, tools, and integrations
4. **Maintainability:** Small, focused files with clear responsibilities
5. **Reusability:** Same library can be used for different MCP server implementations

## Configuration

The example demonstrates reliable configuration loading that works regardless of working directory:

### Configuration Loading Approach

```typescript
// main.ts - Always loads from example/.env
const config = new ConfigManager({ 
  envFile: new URL('.env', import.meta.url).pathname 
});
```

**Key Benefits:**
- ✅ Works when run from project root: `deno run example/main.ts`
- ✅ Works when run from example dir: `cd example && deno run main.ts`  
- ✅ Environment variables still override file values
- ✅ Reliable across different deployment scenarios

### Configuration Sources (in precedence order)

1. **Environment Variables** (highest precedence)
   ```bash
   export MCP_TRANSPORT=http
   export EXAMPLECORP_CLIENT_ID=prod-client-id
   ```

2. **example/.env file** (explicit envFile)
   ```bash
   MCP_TRANSPORT=stdio
   EXAMPLECORP_CLIENT_ID=dev-client-id
   ```

3. **Automatic .env loading** (from working directory)
   - Falls back if no explicit envFile specified
   - bb-mcp-server library handles this automatically

4. **Default values** (lowest precedence)
   - Library provides sensible defaults
   - `MCP_TRANSPORT=stdio`, `MCP_HTTP_PORT=3001`, etc.

### Environment Variables

All configuration uses the `MCP_` prefix by default:

```bash
# Transport configuration
MCP_TRANSPORT=stdio|http
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=localhost

# ExampleCorp API credentials (required for functionality)
EXAMPLECORP_CLIENT_ID=your-client-id
EXAMPLECORP_CLIENT_SECRET=your-client-secret
EXAMPLECORP_API_BASE_URL=https://api.examplecorp.com

# Storage configuration
MCP_DENO_KV_PATH=./example/data/examplecorp-mcp-server.db

# Logging configuration
MCP_LOG_LEVEL=debug|info|warn|error
MCP_LOG_FORMAT=text|json
```

## Running the Example

```bash
# Install dependencies (when library is published)
deno cache --reload

# Copy environment template
cp .env.example .env

# Edit .env with your ExampleCorp API credentials
# (This is a fictional API for demonstration)

# Run in STDIO mode (default)
deno task start

# Run in HTTP mode
MCP_TRANSPORT=http deno task start

# Override via environment variables
MCP_LOG_LEVEL=debug EXAMPLECORP_CLIENT_ID=test-id deno task start
```

## Library Context

This example showcases the bb-mcp-server library capabilities:
- **Enterprise Infrastructure:** Complete MCP server foundation
- **OAuth Integration:** RFC-compliant OAuth 2.0 implementation
- **Transport Abstraction:** Both STDIO and HTTP transport support
- **Workflow Framework:** Extensible workflow system with validation
- **Production Ready:** Audit logging, error handling, session management

The library provides sophisticated infrastructure as a foundation, enabling rapid development of business-focused MCP servers.

## Next Steps

1. **Review the implementation** to understand the target architecture
2. **Compare with typical MCP servers** to see the simplification achieved
3. **Validate library approach** by examining component separation
4. **Test the patterns** in your own MCP server implementations

This example serves as both a validation of the library architecture and a template for future MCP server implementations using the bb-mcp-server library.