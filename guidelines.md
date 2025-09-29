---
title: Beyond MCP Server (bb-mcp-server) Library Guidelines
project_type: Deno TypeScript Library
technology: Deno TypeScript, MCP Protocol
version: 1.0.0
created: 2025-09-22
purpose: Reusable library for building Deno-based MCP servers with OAuth and workflow capabilities
license: Liberal Open Source (MIT/Apache-2.0)
publication: JSR Registry
target_deno: ">=2.5.0"
---

# Beyond MCP Server Library Guidelines

## Project Purpose and Scope

### Primary Objective
Develop a comprehensive, reusable TypeScript library for building MCP (Model Context Protocol) servers on Deno. The library provides transport handling, OAuth capabilities, workflow infrastructure, and storage management while allowing consumers to focus on their specific business logic and integrations.

### Key Library Features
- **Dual Transport Support**: Both STDIO and HTTP transports out of the box
- **OAuth Infrastructure**: Provider and configurable consumer services
- **Workflow System**: Base classes with extensible architecture and plugin discovery (future)
- **Configuration Management**: Environment-based configuration with sensible defaults
- **Storage Abstraction**: Deno KV integration for sessions, credentials, and state
- **Error Handling**: Standardized error handling and logging throughout
- **MCP Protocol Compliance**: Built on official MCP TypeScript SDK

### Target Consumers
- **Beyond Better integrations**: Primary use case for BB-specific MCP servers
- **General MCP servers**: Any Deno-based MCP server implementation
- **Enterprise integrations**: OAuth-enabled servers for third-party API integration
- **Workflow-driven applications**: Servers requiring structured, multi-step operations

## Architecture and Library Design

### Core Library Structure
```
src/
├── mod.ts                           # Main library export
├── lib/
│   ├── server/
│   │   ├── BeyondMcpServer.ts        # Beyond MCP server
│   │   ├── HttpServer.ts             # HTTP transport server
│   │   ├── MCPRequestHandler.ts      # Protocol request handling
│   │   └── TransportManager.ts       # Transport abstraction
│   ├── plugins/
│   │   └── PluginManager.ts          # Plugin discovery system
│   ├── tools/
│   │   ├── CoreTools.ts              # Core tools class
│   │   ├── ToolBase.ts               # Base tool class for extension
│   │   └── ToolRegistry.ts           # Registration system
│   ├── workflows/
│   │   ├── WorkflowBase.ts           # Base workflow class for extension
│   │   └── WorkflowRegistry.ts       # Registration system
│   ├── auth/
│   │   ├── OAuthProvider.ts          # OAuth provider service (from OAuthClientService)
│   │   ├── OAuthConsumer.ts          # Configurable OAuth consumer (from AuthenticationService)
│   │   └── AuthenticationTypes.ts    # Auth-related type definitions
│   ├── storage/
│   │   ├── KVManager.ts              # Deno KV abstraction (from UnifiedKVManager)
│   │   ├── TransportEventStore.ts    # Transport events persistence
│   │   ├── TransportSessions.ts      # Transport session persistence
│   │   └── CredentialStore.ts        # Secure credential storage
│   ├── types/
│   │   ├── AppServerTypes.ts         # Common app interfaces
│   │   ├── BeyondMcpTypes.ts         # Common BeyondMcpServer interfaces
│   │   ├── PluginTypes.ts            # Common plugin interfaces
│   │   ├── ToolTypes.ts              # Common tool interfaces
│   │   └── WorkflowTypes.ts          # Common workflow interfaces
│   ├── config/
│   │   ├── ConfigManager.ts          # Environment configuration management
│   │   └── ConfigTypes.ts            # Configuration type definitions
│   └── utils/
│       ├── AuditLogger.ts            # Audit logging
│       ├── Logger.ts                 # Standardized logging (from ConsoleLogger)
│       ├── Error.ts                  # Helper functions for errors
│       ├── ErrorHandler.ts           # Centralized error handling
│       └── ValidationHelpers.ts      # Input validation utilities
├── types/
│   ├── library.types.ts              # Core library type definitions
│   └── consumer.types.ts             # Types for library consumers
└── examples/
    ├── basic-server/
    ├── oauth-workflow-server/
    └── custom-transport-server/
```

### Library API Design

#### Main Library Export
```typescript
// mod.ts - Main library entry point
export { BeyondMcpServer } from './lib/server/BeyondMcpServer.ts';
export { ToolBase } from './lib/tools/ToolBase.ts';
export { ToolRegistry } from './lib/tools/ToolRegistry.ts';
export { WorkflowBase } from './lib/workflows/WorkflowBase.ts';
export { WorkflowRegistry } from './lib/workflows/WorkflowRegistry.ts';
export { OAuthProvider } from './lib/auth/OAuthProvider.ts';
export { OAuthConsumer } from './lib/auth/OAuthConsumer.ts';
export { ConfigManager } from './lib/config/ConfigManager.ts';
export { KVManager } from './lib/storage/KVManager.ts';

// Re-export types for consumers
export type * from './types/consumer.types.ts';
```

#### Consumer Usage Pattern
```typescript
// Consumer's main.ts
import { BeyondMcpServer, WorkflowBase, ConfigManager } from 'jsr:@beyondbetter/bb-mcp-server';
import { MyCustomWorkflow } from './workflows/MyCustomWorkflow.ts';
import { MyOAuthConsumer } from './auth/MyOAuthConsumer.ts';

const config = new ConfigManager();
const server = new BeyondMcpServer({
  transport: config.get('MCP_TRANSPORT') || 'stdio',
  oauth: {
    provider: config.getOAuthProviderConfig(),
    consumer: MyOAuthConsumer // Optional custom implementation
  }
});
// server.initialize postponed till AppServer.start()
//await server.initialize();

// Register custom workflows
server.registerWorkflow(MyCustomWorkflow);

// Start server
server.start();
```

### Configuration System

#### Standard Environment Variables
```bash
# Transport Configuration
MCP_TRANSPORT=stdio|http
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=localhost

# OAuth Provider Configuration (MCP Server as OAuth Provider)
OAUTH_PROVIDER_CLIENT_ID=your-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-client-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3000/oauth/callback

# OAuth Consumer Configuration (for third-party APIs)
THIRD_PARTY_CLIENT_ID=third-party-client-id
THIRD_PARTY_CLIENT_SECRET=third-party-client-secret
THIRD_PARTY_OAUTH_URL=https://api.thirdparty.com/oauth
THIRD_PARTY_TOKEN_URL=https://api.thirdparty.com/token

# Storage Configuration
DENO_KV_PATH=./mcp-server.db

# Logging Configuration
LOG_LEVEL=info|debug|warn|error
LOG_FORMAT=json|text
```

#### ConfigManager Implementation
```typescript
class ConfigManager {
  constructor(envFile?: string) {
    // Load from .env file if specified
    // Provide sensible defaults
    // Validate required configurations
  }
  
  get<T>(key: string, defaultValue?: T): T
  getOAuthProviderConfig(): OAuthProviderConfig
  getOAuthConsumerConfig(provider: string): OAuthConsumerConfig
  getStorageConfig(): StorageConfig
  getTransportConfig(): TransportConfig
}
```

## Workflow System Design

### Base Workflow Class
```typescript
abstract class WorkflowBase {
  abstract name: string;
  abstract version: string;
  abstract description: string;
  
  // Input validation schema
  abstract inputSchema: JSONSchema;
  
  // Main execution method
  abstract execute(params: unknown): Promise<WorkflowResult>;
  
  // Lifecycle hooks
  onBeforeExecute?(params: unknown): Promise<void>;
  onAfterExecute?(result: WorkflowResult): Promise<void>;
  onError?(error: Error): Promise<void>;
  
  // Validation helper
  protected validateInput(params: unknown): ValidationResult;
  
  // Logging helper
  protected log(level: LogLevel, message: string, data?: unknown): void;
}
```

### Workflow Registration
```typescript
class WorkflowRegistry {
  register(workflow: typeof WorkflowBase): void;
  unregister(name: string): void;
  get(name: string): WorkflowBase | undefined;
  list(): WorkflowInfo[];
  validate(): ValidationResult[];
}
```

### Consumer Implementation Pattern
```typescript
// Consumer's custom workflow
export class MyAPIWorkflow extends WorkflowBase {
  name = 'my_api_workflow';
  version = '1.0.0';
  description = 'Integrates with My API service';
  
  inputSchema = {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      data: { type: 'object' }
    },
    required: ['operation']
  };
  
  async execute(params: MyAPIParams): Promise<WorkflowResult> {
    // Custom business logic using third-party APIs
    // Use library's OAuth consumer for authentication
    // Return structured results
  }
}
```

## OAuth System Architecture

### OAuth Provider (MCP Server as OAuth Provider)
```typescript
// Extracted from OAuthClientService.ts - minimal changes
class OAuthProvider {
  constructor(config: OAuthProviderConfig) {
    // Initialize with client ID, secret, redirect URI
  }
  
  // Handle authorization requests from MCP clients
  handleAuthorizationRequest(request: AuthorizationRequest): Promise<AuthorizationResponse>;
  
  // Handle token exchange
  handleTokenRequest(request: TokenRequest): Promise<TokenResponse>;
  
  // Handle token refresh
  handleRefreshRequest(request: RefreshRequest): Promise<TokenResponse>;
  
  // Store and retrieve authorization codes
  private manageAuthorizationCodes(): void;
}
```

### OAuth Consumer (For Third-Party APIs)
```typescript
// Refactored from AuthenticationService.ts - configurable for any provider
class OAuthConsumer {
  constructor(config: OAuthConsumerConfig) {
    // Provider-specific URLs and credentials
  }
  
  // Initiate OAuth flow
  startAuthFlow(userId: string): Promise<AuthFlowResult>;
  
  // Handle callback and exchange code for tokens
  handleCallback(code: string, state: string): Promise<TokenResult>;
  
  // Get valid access token (with automatic refresh)
  getAccessToken(userId: string): Promise<string>;
  
  // Refresh access token
  refreshAccessToken(userId: string): Promise<TokenResult>;
  
  // Override points for custom implementations
  protected buildAuthUrl(state: string): string;
  protected exchangeCodeForTokens(code: string): Promise<TokenResult>;
  protected refreshTokens(refreshToken: string): Promise<TokenResult>;
}
```

### Consumer Customization Pattern
```typescript
// Consumer can override OAuth consumer for specific provider behavior
export class ExampleOAuthConsumer extends OAuthConsumer {
  constructor() {
    super({
      authUrl: 'https://api.example.com/oauth/authorize',
      tokenUrl: 'https://api.example.com/oauth/token',
      // ... other Example-specific config
    });
  }
  
  // Override for Example-specific token handling
  protected async exchangeCodeForTokens(code: string): Promise<TokenResult> {
    // Example-specific logic
    const result = await super.exchangeCodeForTokens(code);
    // Additional Example processing
    return result;
  }
}
```

## Storage Management

### KV Manager (from UnifiedKVManager)
```typescript
class KVManager {
  constructor(config: StorageConfig) {
    // Initialize Deno KV with configured path
  }
  
  // Generic KV operations
  async get<T>(key: string[]): Promise<T | null>;
  async set<T>(key: string[], value: T, options?: KVSetOptions): Promise<void>;
  async delete(key: string[]): Promise<void>;
  async list<T>(prefix: string[]): Promise<Array<{ key: string[]; value: T }>>;
  
  // Specialized storage for common use cases
  sessions: SessionStore;
  credentials: CredentialStore;
  workflows: WorkflowStateStore;
}
```

### Session and Credential Storage
```typescript
class SessionStore {
  async createSession(userId: string, sessionData: SessionData): Promise<string>;
  async getSession(sessionId: string): Promise<SessionData | null>;
  async updateSession(sessionId: string, data: Partial<SessionData>): Promise<void>;
  async deleteSession(sessionId: string): Promise<void>;
}

class CredentialStore {
  async storeCredentials(userId: string, provider: string, credentials: OAuthCredentials): Promise<void>;
  async getCredentials(userId: string, provider: string): Promise<OAuthCredentials | null>;
  async updateCredentials(userId: string, provider: string, credentials: Partial<OAuthCredentials>): Promise<void>;
  async deleteCredentials(userId: string, provider: string): Promise<void>;
}
```

## Transport Layer

### Transport Manager
```typescript
class TransportManager {
  constructor(config: TransportConfig) {
    // Initialize based on transport type (stdio/http)
  }
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  // Message handling abstraction
  onMessage(handler: MessageHandler): void;
  sendMessage(message: MCPMessage): Promise<void>;
  
  // Transport-specific implementations
  private initializeStdioTransport(): void;
  private initializeHttpTransport(): void;
}
```

### Beyond MCP Server
```typescript
class BeyondMcpServer {
  constructor(config: BeyondMcpConfig) {
    this.transport = new TransportManager(config.transport);
    this.oauthProvider = new OAuthProvider(config.oauth.provider);
    this.oauthConsumer = config.oauth.consumer || new OAuthConsumer(config.oauth.consumer);
    this.workflows = new WorkflowRegistry();
    this.storage = new KVManager(config.storage);
  }
  
  // Workflow management
  registerWorkflow(workflow: typeof WorkflowBase): void;
  
  // Server lifecycle
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  // MCP protocol handlers
  private handleToolCall(request: ToolCallRequest): Promise<ToolCallResponse>;
  private handleListTools(): Promise<ListToolsResponse>;
  
  // OAuth endpoints (when using HTTP transport)
  private handleOAuthAuthorize(request: Request): Promise<Response>;
  private handleOAuthToken(request: Request): Promise<Response>;
}
```

## Error Handling and Logging

### Standardized Error Handling
```typescript
class ErrorHandler {
  static handleWorkflowError(error: Error, context: WorkflowContext): WorkflowError;
  static handleOAuthError(error: Error, context: OAuthContext): OAuthError;
  static handleTransportError(error: Error, context: TransportContext): TransportError;
  
  // Error classification
  static classifyError(error: Error): ErrorCategory;
  
  // Error recovery suggestions
  static getRecoveryAction(error: WorkflowError): RecoveryAction;
}
```

### Logger Implementation
```typescript
class Logger {
  constructor(config: LogConfig) {
    // Configure log level and format from environment
  }
  
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
  
  // Structured logging for workflows
  logWorkflowStart(workflowName: string, params: unknown): void;
  logWorkflowEnd(workflowName: string, result: WorkflowResult): void;
  logWorkflowError(workflowName: string, error: Error): void;
}
```

## Testing Strategy

### Library Testing Structure
```
tests/
├── unit/
│   ├── workflows/
│   ├── auth/
│   ├── storage/
│   └── config/
├── integration/
│   ├── oauth-flows/
│   ├── workflow-execution/
│   └── transport-handling/
├── fixtures/
│   ├── mock-workflows/
│   ├── test-configs/
│   └── sample-data/
└── utils/
    ├── test-helpers.ts
    ├── mock-services.ts
    └── test-server.ts
```

### Test Utilities for Consumers
```typescript
// Export test utilities for library consumers
export class TestWorkflowRunner {
  static async runWorkflow(workflow: WorkflowBase, params: unknown): Promise<WorkflowResult>;
  static createMockOAuthConsumer(): MockOAuthConsumer;
  static createTestKVManager(): KVManager;
}

export class MockBeyondMcpServer extends BeyondMcpServer {
  // Simplified server for testing consumer workflows
}
```

### Testing Requirements
- **Unit Tests**: All library components with 80%+ coverage
- **Integration Tests**: End-to-end workflow execution, OAuth flows, transport handling
- **Mock Services**: Mock OAuth providers, third-party APIs for isolated testing
- **Consumer Testing**: Test utilities and examples for consumers to test their implementations

## Documentation Requirements

### Core Documentation
1. **README.md**: Overview, quick start, installation from JSR
2. **API Reference**: Generated from JSDoc comments
3. **Workflow Guide**: How to create and register custom workflows
4. **OAuth Integration Guide**: Setting up OAuth provider and consumer
5. **Configuration Reference**: All environment variables and options
6. **Transport Guide**: STDIO vs HTTP transport considerations
7. **Storage Guide**: Using Deno KV for sessions and credentials

### Example Projects
1. **Basic Server**: Minimal MCP server with one simple workflow
2. **OAuth Workflow Server**: Server with third-party API integration
3. **Custom Transport Server**: Advanced transport configuration
4. **Multi-Workflow Server**: Complex server with multiple workflow types

### JSDoc Requirements
- **All public APIs**: Comprehensive JSDoc with examples
- **Type Definitions**: Clear documentation for all exported types
- **Configuration Options**: Detailed documentation for all config parameters
- **Error Types**: Documentation for all custom error types

## Publication and Distribution

### JSR Publication
```json
// deno.json
{
  "name": "@beyondbetter/bb-mcp-server",
  "version": "1.0.0",
  "description": "Comprehensive library for building Deno-based MCP servers",
  "license": "MIT",
  "repository": "https://github.com/beyond-better/bb-mcp-server",
  "exports": {
    ".": "./src/mod.ts"
  },
  "publish": {
    "include": [
      "README.md",
      "LICENSE",
      "src/",
      "examples/",
      "docs/"
    ]
  }
}
```

### Versioning Strategy
- **Semantic Versioning**: Follow semver for all releases
- **Breaking Changes**: Major version increments for breaking changes
- **Deprecation Policy**: One major version deprecation notice for breaking changes
- **LTS Support**: Consider LTS releases for stable API versions

### License Considerations
- **MIT License**: Recommended for maximum adoption
- **Apache 2.0**: Alternative for enterprise adoption
- **Liberal Terms**: Minimal restrictions for commercial and non-commercial use
- **Attribution Requirements**: Standard attribution clauses only

## Migration from Existing Projects

### Extraction Priority
1. **Core Infrastructure**: Transport, storage, configuration management
2. **OAuth Services**: Provider and consumer implementations
3. **Workflow System**: Base classes, registry, validation
4. **Utilities**: Logging, error handling, validation helpers
5. **Examples and Documentation**: Comprehensive guides and examples

### Backward Compatibility
- **API Stability**: Maintain stable APIs once published
- **Configuration Compatibility**: Support existing environment variable patterns
- **Type Compatibility**: Maintain TypeScript interface compatibility
- **Breaking Change Migration**: Provide clear migration guides for breaking changes

### Success Metrics
- **Reduced Boilerplate**: Consumers require <50 lines of setup code
- **Clear Separation**: Zero business logic in library, zero infrastructure in consumer
- **Easy Testing**: Comprehensive test utilities for consumers
- **Good DX**: Excellent developer experience with clear documentation and examples

## Future Enhancement Roadmap

### Features (v1.0)
- Core MCP server functionality
- OAuth provider and consumer
- Base workflow system
- STDIO and HTTP transport
- Deno KV storage
- Configuration management
- Plugin discovery system

### Features (v1.5)
- Advanced workflow features (scheduling, dependencies)
- Enhanced error recovery
- Performance optimizations
- Additional storage backends

### Features (v2.0)
- Multi-tenant support
- Advanced security features
- Workflow templates and marketplace
- Real-time monitoring and metrics
- GraphQL integration support

This comprehensive library will significantly reduce the complexity of building MCP servers while providing the flexibility needed for diverse integration scenarios.