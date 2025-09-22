# Beyond MCP Server

A comprehensive library for building Deno-based MCP (Model Context Protocol) servers with OAuth and workflow capabilities.

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/beyond-better/bb-mcp-server.git
cd bb-mcp-server

# Install dependencies and run tests
deno task test
```

### Basic Usage

```typescript
import { KVManager, ConfigManager, Logger } from 'jsr:@bb/mcp-server';

// Create logger
const logger = new Logger({ level: 'info' });

// Load configuration
const configManager = new ConfigManager({}, logger);
const config = await configManager.loadConfig();

// Initialize storage
const kvManager = new KVManager({ kvPath: './data/app.db' }, logger);
await kvManager.initialize();

// Use the storage
await kvManager.set(['user', 'john'], { name: 'John Doe', email: 'john@example.com' });
const user = await kvManager.get(['user', 'john']);

console.log('User:', user);

// Cleanup
await kvManager.close();
```

## Testing

```bash
# Run all tests
deno task test

# Run specific test file
deno task test tests/unit/storage/KVManager.test.ts

# Run with coverage
deno task tool:test
```

### Key Features

- **Type-Safe**: Full TypeScript support with strict checking
- **Configurable**: Flexible configuration via environment variables
- **Persistent**: Deno KV-based storage with automatic cleanup
- **Observable**: Comprehensive logging and audit trails
- **Testable**: Extensive test coverage with mocking support
- **Generic**: Extracted from production MCP server, generalized for reuse

## Configuration

The library supports comprehensive configuration via environment variables:

### **Core Configuration**
```bash
# Transport type
MCP_TRANSPORT=stdio|http       # Default: stdio
HTTP_PORT=3000                 # Default: 3001
HTTP_HOST=localhost            # Default: localhost
```

### **Session Management (Production Critical)**
```bash
# Session timeout in milliseconds
MCP_SESSION_TIMEOUT=7200000        # 2 hours (default: 30 minutes)
# Session cleanup interval in milliseconds  
MCP_SESSION_CLEANUP_INTERVAL=600000 # 10 minutes (default: 5 minutes)
# Maximum concurrent sessions
MCP_MAX_CONCURRENT_SESSIONS=1000   # Default: 1000
# Enable session persistence across restarts
MCP_ENABLE_SESSION_PERSISTENCE=true # Default: true
```

### **OAuth Configuration**
```bash
# OAuth Provider (when MCP server acts as OAuth provider)
OAUTH_PROVIDER_CLIENT_ID=your-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-client-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3000/callback

# OAuth Consumer (for third-party API integration)
OAUTH_CONSUMER_PROVIDER=actionstep
OAUTH_CONSUMER_CLIENT_ID=third-party-client-id
OAUTH_CONSUMER_CLIENT_SECRET=third-party-secret
```

### **Logging & Storage**
```bash
# Logging configuration
LOG_LEVEL=info                 # debug|info|warn|error
LOG_FORMAT=text                # text|json

# Storage configuration
DENO_KV_PATH=./data/app.db     # Default: ./data/mcp-server.db
STORAGE_PERSISTENCE=true       # Default: true
```

See `example/.env.example` for a complete configuration template.

## Contributing

This library is being actively developed.

3. Follow the established patterns for new components
4. Ensure tests have >90% coverage for new functionality
5. Maintain backward compatibility with extracted components

## Requirements

- **Deno**: Version 2.5.0 or later
- **Permissions**: `--allow-all --unstable-kv` (for Deno KV operations)
- **Standards Compliance**: TypeScript strict mode, ESLint rules

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) - Official MCP TypeScript SDK

