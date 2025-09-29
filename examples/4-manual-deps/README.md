# Manual-Deps Example - Complete Infrastructure Control

This example demonstrates **expert-level manual dependency management** using the Beyond MCP Server library. It showcases complete control over all aspects of server setup, including manual tool and workflow registration, custom service implementations, and advanced infrastructure patterns for maximum flexibility.

## 🎯 Learning Objectives

This example teaches you how to:

- **Complete Infrastructure Control**: Manual setup and configuration of all library components
- **Manual Registration Patterns**: Direct control over tool and workflow registration within dependency creation
- **Advanced Dependency Injection**: Custom service implementations and overrides
- **Expert Configuration Management**: Environment-specific dependency creation and validation
- **Production Integration Patterns**: Enterprise-level infrastructure control and customization
- **Performance Optimization**: Fine-grained control over component lifecycle and resource management

## 🔧 Key Features

### 1. Manual Tool and Workflow Registration

**Complete control over registration within dependency creation**

```typescript
// Manual registration within dependency function
export async function createManualDependencies(): Promise<Partial<AppServerDependencies>> {
  // Create tool registry and register tools manually
  const toolRegistry = await getToolRegistry(logger, errorHandler);
  const exampleTools = new ExampleTools({/* dependencies */});

  // Manual registration with complete control
  const toolRegistrations = exampleTools.getTools();
  for (const registration of toolRegistrations) {
    toolRegistry.registerTool(
      registration.name,
      registration.definition,
      registration.handler,
      registration.options,
    );
  }

  // Create workflow registry and register workflows manually
  const workflowRegistry = await getWorkflowRegistry(logger, errorHandler);
  const queryWorkflow = new ExampleQueryWorkflow({/* dependencies */});
  const operationWorkflow = new ExampleOperationWorkflow({/* dependencies */});

  // Manual workflow registration
  workflowRegistry.registerWorkflow(queryWorkflow);
  workflowRegistry.registerWorkflow(operationWorkflow);

  return {
    toolRegistry,
    workflowRegistry,
    // ... other manually created dependencies
  };
}
```

**Demonstrates**:

- Direct control over all tool and workflow registration
- Custom registration logic and conditional loading
- Manual dependency injection for each component
- Expert-level lifecycle management

### 2. Complete Library Component Override

**Manual setup of all infrastructure components**

```typescript
// Manual creation of all library components
const logger = new Logger({
  level: configManager.get('LOG_LEVEL', 'info'),
  format: configManager.get('LOG_FORMAT', 'json'),
});

const auditLogger = new AuditLogger({
  enabled: configManager.get('AUDIT_ENABLED', 'true') === 'true',
  logAllApiCalls: configManager.get('AUDIT_LOG_ALL_API_CALLS', 'true') === 'true',
  retentionDays: parseInt(configManager.get('AUDIT_RETENTION_DAYS', '90'), 10),
}, logger);

const kvManager = new KVManager({
  kvPath: configManager.get('DENO_KV_PATH', './data/manual-deps.db'),
}, logger);

const oauthProvider = new OAuthProvider({
  issuer: configManager.get('OAUTH_PROVIDER_ISSUER', 'http://localhost:3000'),
  clientId: configManager.get('OAUTH_PROVIDER_CLIENT_ID', 'manual-client'),
  // ... complete OAuth configuration
}, { logger, kvManager, credentialStore });

const transportManager = new TransportManager({
  type: configManager.get('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http',
  http: {
    hostname: configManager.get('HTTP_HOST', 'localhost'),
    port: parseInt(configManager.get('HTTP_PORT', '3000'), 10),
    // ... complete HTTP configuration
  },
}, { logger, kvManager, sessionStore, eventStore });
```

**Demonstrates**:

- Manual instantiation of all library components
- Complete configuration control and validation
- Custom implementations and overrides
- Expert-level dependency wiring

### 3. Advanced Health Checks and Validation

**Comprehensive validation and monitoring**

```typescript
// Custom health checks for manual dependencies
await performHealthChecks(
  {
    thirdpartyApiClient,
    oAuthConsumer,
    oauthProvider,
    kvManager,
  },
  logger,
  // Additional custom health checks
  [
    {
      name: 'Workflow Registry (Manual)',
      check: async () => {
        const workflowNames = workflowRegistry.getWorkflowNames();
        if (workflowNames.length === 0) {
          throw new Error('No workflows registered - manual registration may have failed');
        }
        return {
          healthy: true,
          status: 'Workflows registered',
          workflowCount: workflowNames.length,
          discoveryMode: 'manual',
        };
      },
    },
  ],
);

// Validate required configuration for manual setup
await validateConfiguration(configManager, logger, { oAuthConsumer });
```

**Demonstrates**:

- Custom health checks for manual components
- Comprehensive dependency validation
- Expert-level monitoring and diagnostics
- Production-ready validation patterns

## 🏗️ Architecture Patterns

### Manual Dependency Control Architecture

```
AppServer.create(custom dependency function)
├── Custom Dependency Function (complete control)
│   ├── Manual tool registration within dependencies
│   ├── Manual workflow registration within dependencies
│   └── Complete infrastructure customization
└── Library Components (manually configured)
    ├── Logger (custom configuration)
    ├── KVManager (custom setup)
    ├── TransportManager (custom transport config)
    ├── OAuthProvider (custom OAuth setup)
    └── All other components (manual control)
```

### Manual Registration Pattern

```typescript
// Expert-level dependency creation with manual registration
const appServer = await AppServer.create(createManualDependencies);
await appServer.start();

// NO plugin discovery - everything is manually controlled
// NO automatic registration - direct control over all components
// NO default configurations - explicit setup for everything
```

**Benefits**:

- **Maximum Control**: Override any library component as needed
- **Conditional Loading**: Register components based on complex business logic
- **Performance Optimization**: Fine-grained control over resource usage
- **Enterprise Integration**: Custom implementations for existing infrastructure
- **Advanced Patterns**: Implement specialized workflows and authentication

### Expert Control vs Plugin Discovery

| Aspect          | Plugin Discovery (Examples 1-3) | Manual Control (This Example) |
| --------------- | ------------------------------- | ----------------------------- |
| **Complexity**  | Simple configuration            | Expert-level implementation   |
| **Control**     | Library handles registration    | Complete manual control       |
| **Flexibility** | Standard patterns               | Unlimited customization       |
| **Setup**       | Minimal code required           | Comprehensive setup needed    |
| **Performance** | Good defaults                   | Optimized for specific needs  |
| **Maintenance** | Library manages lifecycle       | Manual lifecycle management   |

## 🚀 Getting Started

### Prerequisites

- Deno 2.5.0 or later
- Expert-level TypeScript knowledge
- Understanding of dependency injection patterns
- Experience with previous examples (`1-simple`, `2-plugin-workflows`, `3-plugin-api-auth`)
- Production infrastructure requirements

### Quick Start

1. **Install Dependencies**
   ```bash
   cd examples/4-manual-deps
   # Dependencies are handled by import maps
   ```

2. **Configure Advanced Settings**
   ```bash
   cp .env.example .env
   # Edit .env with your advanced configuration
   vim .env
   ```

3. **Run the Server**
   ```bash
   # STDIO transport with manual configuration
   deno run --allow-all main.ts

   # HTTP transport with complete custom setup
   MCP_TRANSPORT=http deno run --allow-all main.ts
   ```

4. **Verify Manual Registration**
   ```bash
   # Run tests to verify manual setup
   deno test --allow-all tests/
   ```

### Configuration

#### Core Infrastructure Configuration

```bash
# Transport Configuration (manual setup)
MCP_TRANSPORT=stdio|http
HTTP_PORT=3000
HTTP_HOST=localhost
HTTP_CORS_ENABLED=true
HTTP_CORS_ORIGINS=*

# Logging Configuration (manual setup)
LOG_LEVEL=debug|info|warn|error
LOG_FORMAT=json|text
AUDIT_ENABLED=true
AUDIT_LOG_ALL_API_CALLS=true
AUDIT_RETENTION_DAYS=90

# Storage Configuration (manual setup)
DENO_KV_PATH=./examples/4-manual-deps/data/manual-mcp-server.db
```

#### OAuth Provider Configuration (Manual Setup)

```bash
# OAuth Provider (MCP server as OAuth provider)
OAUTH_PROVIDER_ISSUER=http://localhost:3000
OAUTH_PROVIDER_CLIENT_ID=manual-client
OAUTH_PROVIDER_CLIENT_SECRET=manual-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3000/oauth/callback
OAUTH_TOKEN_EXPIRATION=3600000
OAUTH_REFRESH_TOKEN_EXPIRATION=2592000000
```

#### OAuth Consumer Configuration (for External APIs)

```bash
# OAuth Consumer (for ExampleCorp API)
OAUTH_CONSUMER_CLIENT_ID=your-examplecorp-client-id
OAUTH_CONSUMER_CLIENT_SECRET=your-examplecorp-client-secret
OAUTH_CONSUMER_AUTH_URL=https://api.examplecorp.com/oauth/authorize
OAUTH_CONSUMER_TOKEN_URL=https://api.examplecorp.com/oauth/token
OAUTH_CONSUMER_REDIRECT_URI=http://localhost:3000/oauth/consumer/callback
OAUTH_CONSUMER_SCOPES=read,write

# ExampleCorp API Configuration
THIRDPARTY_API_BASE_URL=https://api.examplecorp.com
THIRDPARTY_API_VERSION=v1
THIRDPARTY_API_TIMEOUT=30000
THIRDPARTY_API_RETRY_ATTEMPTS=3
```

## 🔧 Manual Registration Process

### Step-by-Step Manual Setup

#### 1. Manual Tool Registration

```typescript
// Create tool registry manually
const toolRegistry = await getToolRegistry(logger, errorHandler);

// Configure SDK MCP server
const instructions = await Deno.readTextFile('instructions.md');
toolRegistry.sdkMcpServer = new SdkMcpServer(
  {
    name: 'examplecorp-mcp-server',
    version: '1.0.0',
    title: 'ExampleCorp API Integration',
    description: 'Manual dependency management example',
  },
  {
    capabilities: { tools: {}, logging: {} },
    instructions,
  },
);

// Create tools with manual dependency injection
const exampleTools = new ExampleTools({
  apiClient: thirdpartyApiClient,
  oauthConsumer: oAuthConsumer,
  logger: logger,
  auditLogger: auditLogger,
});

// Register each tool with complete control
const toolRegistrations = exampleTools.getTools();
for (const registration of toolRegistrations) {
  toolRegistry.registerTool(
    registration.name,
    registration.definition,
    registration.handler,
    registration.options,
  );
  logger.info(`Manually registered tool: ${registration.definition.title}`);
}
```

#### 2. Manual Workflow Registration

```typescript
// Create workflow registry manually
const workflowRegistry = await getWorkflowRegistry(logger, errorHandler);

// Create workflows with explicit dependency injection
const queryWorkflow = new ExampleQueryWorkflow({
  apiClient: thirdpartyApiClient,
  logger: logger,
});

const operationWorkflow = new ExampleOperationWorkflow({
  apiClient: thirdpartyApiClient,
  logger: logger,
});

// Manual registration with logging
workflowRegistry.registerWorkflow(queryWorkflow);
workflowRegistry.registerWorkflow(operationWorkflow);

logger.info('Manually registered workflows:', {
  workflows: [queryWorkflow.name, operationWorkflow.name],
  registrationMode: 'manual',
});
```

#### 3. Manual Infrastructure Setup

```typescript
// Manual creation of all infrastructure components
const kvManager = new KVManager({
  kvPath: configManager.get('DENO_KV_PATH', './data/manual-deps.db'),
}, logger);

// Initialize KV connection manually
await kvManager.initialize();

// Manual credential store setup
const credentialStore = new CredentialStore(kvManager, {}, logger);

// Manual session store setup
const sessionStore = new SessionStore(
  kvManager,
  { keyPrefix: ['sessions'] },
  logger,
);

// Manual event store setup
const eventStore = new TransportEventStore(
  kvManager.getKV(),
  ['events'],
  logger,
);

// Manual transport manager configuration
const transportManager = new TransportManager({
  type: configManager.get('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http',
  http: {
    hostname: configManager.get('HTTP_HOST', 'localhost'),
    port: parseInt(configManager.get('HTTP_PORT', '3000'), 10),
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    maxConcurrentSessions: 1000,
    enableSessionPersistence: true,
    // ... complete HTTP configuration
  },
}, {
  logger,
  kvManager,
  sessionStore,
  eventStore,
});
```

## 🔧 Available Tools and Workflows

### Manually Registered Tools

#### `query_customers_example`

**Customer search with manual OAuth integration**

```json
{
  "search": "Enterprise Client",
  "limit": 50,
  "filters": {
    "status": "active",
    "customerType": "enterprise",
    "region": "Global"
  },
  "userId": "admin-user"
}
```

#### `create_order_example`

**Order creation with manual validation and processing**

```json
{
  "customerId": "ent-12345",
  "items": [
    {
      "productId": "enterprise-001",
      "quantity": 100,
      "unitPrice": 99.99,
      "customConfiguration": {
        "sla": "premium",
        "support": "24x7"
      }
    }
  ],
  "priority": "urgent",
  "userId": "admin-user"
}
```

### Manually Registered Workflows

#### `example_query` Workflow

**Advanced querying with manual error handling**

```json
{
  "workflow_name": "example_query",
  "parameters": {
    "userId": "admin-user",
    "queryType": "advanced_analytics",
    "filters": {
      "dateRange": {
        "startDate": "2024-01-01T00:00:00Z",
        "endDate": "2024-12-31T23:59:59Z"
      },
      "businessUnit": "enterprise",
      "includeProjections": true
    },
    "outputFormat": "comprehensive",
    "includeMetadata": true
  }
}
```

#### `example_operation` Workflow

**Complex operations with manual transaction control**

```json
{
  "workflow_name": "example_operation",
  "parameters": {
    "userId": "admin-user",
    "operationType": "enterprise_migration",
    "operationData": {
      "type": "enterprise_migration",
      "sourceSystem": "legacy-crm",
      "targetSystem": "modern-platform",
      "migrationScope": {
        "customers": 10000,
        "orders": 50000,
        "products": 1000
      },
      "validationRules": "strict",
      "rollbackStrategy": "automatic"
    },
    "executionOptions": {
      "timeout": 3600,
      "retryAttempts": 1,
      "rollbackOnFailure": true,
      "notificationChannels": ["email", "slack"]
    }
  }
}
```

## 🧪 Testing Manual Setup

### Comprehensive Test Suite

```bash
# Test manual tool registration
deno test --allow-all tests/tools/

# Test manual workflow registration
deno test --allow-all tests/workflows/

# Test manual infrastructure setup
deno test --allow-all tests/infrastructure/

# Test complete integration
deno test --allow-all tests/integration/ManualSetup.test.ts
```

### Manual Registration Verification

```typescript
// Verify manual tool registration
const registeredTools = toolRegistry.listTools();
console.log('Manually registered tools:', registeredTools.map((t) => t.name));

// Verify manual workflow registration
const registeredWorkflows = workflowRegistry.getWorkflowNames();
console.log('Manually registered workflows:', registeredWorkflows);

// Verify custom dependency injection
console.log('Custom dependencies:', {
  hasApiClient: !!thirdpartyApiClient,
  hasOAuthConsumer: !!oAuthConsumer,
  hasCustomLogger: logger.constructor.name === 'Logger',
});
```

## 🔍 Troubleshooting

### Manual Setup Issues

1. **Tool Registration Failure**
   ```
   Error: Tool registration failed - missing dependencies
   ```
   **Solution**:
   - Verify all dependencies are manually created before tool registration
   - Check dependency injection order in createManualDependencies()
   - Ensure tool registry is properly initialized
   - Validate SDK MCP server configuration

2. **Workflow Registration Failure**
   ```
   Error: Workflow registry not initialized
   ```
   **Solution**:
   - Confirm workflow registry creation with proper error handler
   - Verify workflows are instantiated with required dependencies
   - Check manual registration sequence
   - Validate workflow parameter schemas

3. **Infrastructure Component Issues**
   ```
   Error: KV manager initialization failed
   ```
   **Solution**:
   - Check KV path permissions and accessibility
   - Verify manual KV initialization call
   - Confirm adequate disk space
   - Validate configuration values

### Expert Debugging

1. **Component Initialization Order**:
   ```typescript
   // Log initialization sequence
   logger.debug('Manual dependency creation sequence:', {
     step: 'infrastructure',
     components: ['Logger', 'KVManager', 'CredentialStore'],
   });
   ```

2. **Dependency Validation**:
   ```typescript
   // Validate all manual dependencies
   const dependencyValidation = {
     logger: !!logger,
     kvManager: !!kvManager && kvManager.isInitialized(),
     toolRegistry: !!toolRegistry && toolRegistry.listTools().length > 0,
     workflowRegistry: !!workflowRegistry && workflowRegistry.getWorkflowNames().length > 0,
   };
   logger.info('Manual dependency validation:', dependencyValidation);
   ```

## 🔄 Migration from Plugin-API-Auth

If you're coming from the `3-plugin-api-auth` example:

### Key Differences

| Aspect               | Plugin-API-Auth     | Manual-Deps                 |
| -------------------- | ------------------- | --------------------------- |
| **Plugin Discovery** | Automatic discovery | No plugin discovery         |
| **Registration**     | Library handles     | Manual registration         |
| **Dependencies**     | Custom injection    | Complete manual control     |
| **Infrastructure**   | Library defaults    | Manual setup of everything  |
| **Complexity**       | Moderate setup      | Expert-level implementation |
| **Flexibility**      | Good customization  | Unlimited control           |

### Migration Steps

1. **Remove Plugin Discovery**: Delete plugin files and discovery configuration
2. **Manual Registration**: Implement manual tool and workflow registration
3. **Infrastructure Setup**: Create all library components manually
4. **Dependency Wiring**: Implement complete dependency injection
5. **Validation**: Add custom health checks and validation
6. **Testing**: Comprehensive testing of manual setup

## 📝 Key Concepts

### When to Use Manual Control

**Use Manual Control When**:

- **Enterprise Integration**: Need to integrate with existing infrastructure
- **Performance Critical**: Require fine-grained resource optimization
- **Custom Authentication**: Implementing specialized auth patterns
- **Conditional Loading**: Complex business logic for component loading
- **Legacy Integration**: Working with existing enterprise systems
- **Advanced Patterns**: Need patterns not supported by plugin discovery

### Expert-Level Benefits

1. **Complete Control**: Override any aspect of library behavior
2. **Conditional Logic**: Register components based on complex conditions
3. **Performance Optimization**: Fine-tune resource usage and lifecycle
4. **Enterprise Integration**: Seamless integration with existing infrastructure
5. **Custom Implementations**: Replace library components with custom versions
6. **Advanced Monitoring**: Detailed control over logging, metrics, and health checks

### Production Considerations

1. **Maintenance Overhead**: Manual setup requires more maintenance
2. **Complexity Management**: Need expertise to manage all components
3. **Testing Requirements**: Comprehensive testing of all manual setup
4. **Documentation**: Detailed documentation of custom implementations
5. **Error Handling**: Robust error handling for all manual components
6. **Monitoring**: Advanced monitoring of custom infrastructure

## 🎓 Learning Path

1. **Master Previous Examples**: Complete understanding of examples 1-3
2. **Study Library Architecture**: Deep dive into library component structure
3. **Implement Manual Setup**: Follow the manual dependency creation patterns
4. **Custom Components**: Create custom implementations of library components
5. **Advanced Patterns**: Implement enterprise-specific patterns and integrations
6. **Performance Optimization**: Optimize manual setup for specific requirements

## 🔗 Next Steps

- **Production Deployment**: Deploy manual setup to production environments
- **Enterprise Patterns**: Implement advanced enterprise integration patterns
- **Custom Library Components**: Create custom implementations of library components
- **Advanced Monitoring**: Implement comprehensive monitoring and observability
- **Performance Tuning**: Optimize manual setup for specific performance requirements

This example provides the ultimate flexibility and control for building sophisticated MCP servers that can integrate with any existing infrastructure while maintaining complete control over every aspect of the server implementation.
