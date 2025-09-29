# Manual-Deps Example - Step-by-Step Instructions

This guide walks you through running and understanding the **Manual-Deps** example, which demonstrates expert-level manual dependency management and complete infrastructure control using the Beyond MCP Server library.

## 🎯 What You'll Learn

By following this guide, you'll understand:

- **Expert-Level Dependency Management**: Complete manual control over all library components
- **Manual Registration Patterns**: Direct registration of tools and workflows within dependency creation
- **Advanced Infrastructure Setup**: Custom configuration of logging, storage, transport, and OAuth
- **Production Integration Patterns**: Enterprise-level dependency injection and lifecycle management
- **Performance Optimization**: Fine-grained control over resource usage and component behavior
- **Custom Implementation Patterns**: Overriding library components with custom implementations

## 🚀 Quick Start

### Step 1: Navigate to the Example

```bash
cd examples/4-manual-deps
```

### Step 2: Configure Advanced Settings

```bash
# Copy the comprehensive environment template
cp .env.example .env

# Edit the advanced configuration
vim .env  # or use your preferred editor
```

**Expert Configuration Options:**
```bash
# Core Infrastructure (all manually configured)
MCP_TRANSPORT=stdio|http
HTTP_PORT=3000
HTTP_HOST=localhost
HTTP_CORS_ENABLED=true
HTTP_CORS_ORIGINS=*

# Advanced Logging (manual setup)
LOG_LEVEL=debug|info|warn|error
LOG_FORMAT=json|text
AUDIT_ENABLED=true
AUDIT_LOG_ALL_API_CALLS=true
AUDIT_RETENTION_DAYS=90
AUDIT_LOG_FILE=./logs/audit.log

# Storage Management (manual configuration)
DENO_KV_PATH=./examples/4-manual-deps/data/manual-mcp-server.db

# OAuth Provider (manual setup)
OAUTH_PROVIDER_ISSUER=http://localhost:3000
OAUTH_PROVIDER_CLIENT_ID=manual-client
OAUTH_PROVIDER_CLIENT_SECRET=manual-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3000/oauth/callback

# OAuth Consumer (for external APIs)
OAUTH_CONSUMER_CLIENT_ID=your-examplecorp-client-id
OAUTH_CONSUMER_CLIENT_SECRET=your-examplecorp-client-secret
OAUTH_CONSUMER_AUTH_URL=https://api.examplecorp.com/oauth/authorize
OAUTH_CONSUMER_TOKEN_URL=https://api.examplecorp.com/oauth/token

# External API Configuration
THIRDPARTY_API_BASE_URL=https://api.examplecorp.com
THIRDPARTY_API_VERSION=v1
THIRDPARTY_API_TIMEOUT=30000
THIRDPARTY_API_RETRY_ATTEMPTS=3
```

### Step 3: Run the Server

```bash
# STDIO transport with complete manual setup
deno run --allow-all main.ts

# OR HTTP transport with manual infrastructure
MCP_TRANSPORT=http deno run --allow-all main.ts
```

You should see detailed initialization logs:
```
[INFO] Initializing ExampleCorp MCP server dependencies...
[INFO] Manual dependency creation with custom registration logic
[DEBUG] Creating library components: Logger, AuditLogger, KVManager
[DEBUG] Configuring KV storage: ./examples/4-manual-deps/data/manual-mcp-server.db
[DEBUG] Initializing OAuth provider with custom configuration
[DEBUG] Creating API client with OAuth integration
[INFO] Manually registered tool: Query Customers
[INFO] Manually registered tool: Create Order
[INFO] Manually registered tool: Get Order Status
[INFO] Manually registered tool: Get API Info
[INFO] Manually registered workflows: [example_query, example_operation]
[INFO] Expert mode: Complete infrastructure control enabled
[INFO] Server ready on stdio transport
```

### Step 4: Verify Manual Setup

```bash
# Run comprehensive tests to verify manual configuration
deno test --allow-all tests/
```

## 🏗️ Understanding Manual Dependency Control

### Complete Infrastructure Manual Setup

Unlike previous examples, this shows **complete manual control** over every library component:

```typescript
// createManualDependencies() function creates EVERYTHING manually:

// 1. Manual Logger Configuration
const logger = new Logger({
  level: configManager.get('LOG_LEVEL', 'info'),
  format: configManager.get('LOG_FORMAT', 'json')
});

// 2. Manual Audit Logger Setup
const auditLogger = new AuditLogger({
  enabled: configManager.get('AUDIT_ENABLED', 'true') === 'true',
  logAllApiCalls: configManager.get('AUDIT_LOG_ALL_API_CALLS', 'true') === 'true',
  retentionDays: parseInt(configManager.get('AUDIT_RETENTION_DAYS', '90'), 10)
}, logger);

// 3. Manual KV Manager Initialization
const kvManager = new KVManager({
  kvPath: configManager.get('DENO_KV_PATH', './data/manual-deps.db')
}, logger);
await kvManager.initialize(); // Manual initialization

// 4. Manual OAuth Provider Setup
const oauthProvider = new OAuthProvider({
  issuer: configManager.get('OAUTH_PROVIDER_ISSUER'),
  clientId: configManager.get('OAUTH_PROVIDER_CLIENT_ID'),
  clientSecret: configManager.get('OAUTH_PROVIDER_CLIENT_SECRET'),
  // ... complete OAuth configuration
}, { logger, kvManager, credentialStore });

// 5. Manual Transport Manager Configuration
const transportManager = new TransportManager({
  type: configManager.get('MCP_TRANSPORT', 'stdio'),
  http: {
    hostname: configManager.get('HTTP_HOST', 'localhost'),
    port: parseInt(configManager.get('HTTP_PORT', '3000'), 10),
    // ... complete HTTP configuration
  }
}, { logger, kvManager, sessionStore, eventStore });
```

**Key Differences from Plugin Discovery:**
- **No Plugin Discovery**: Zero automatic component discovery
- **Manual Registration**: Direct control over tool and workflow registration
- **Complete Configuration**: Every library component is manually configured
- **Expert Control**: Override any aspect of library behavior

### Manual Tool and Workflow Registration

This example demonstrates **registration within dependency creation**:

```typescript
// Manual tool registration within createManualDependencies()
const toolRegistry = await getToolRegistry(logger, errorHandler);

// Configure SDK MCP server manually
const instructions = await Deno.readTextFile('instructions.md');
toolRegistry.sdkMcpServer = new SdkMcpServer({
  name: 'examplecorp-mcp-server',
  version: '1.0.0'
}, {
  capabilities: { tools: {}, logging: {} },
  instructions
});

// Create tools with explicit dependency injection
const exampleTools = new ExampleTools({
  apiClient: thirdpartyApiClient,
  oauthConsumer: oAuthConsumer,
  logger: logger,
  auditLogger: auditLogger
});

// Manual registration with logging
const toolRegistrations = exampleTools.getTools();
for (const registration of toolRegistrations) {
  toolRegistry.registerTool(
    registration.name,
    registration.definition,
    registration.handler,
    registration.options
  );
  logger.info(`Manually registered tool: ${registration.definition.title}`);
}

// Manual workflow registration
const workflowRegistry = await getWorkflowRegistry(logger, errorHandler);
const queryWorkflow = new ExampleQueryWorkflow({ apiClient: thirdpartyApiClient, logger });
const operationWorkflow = new ExampleOperationWorkflow({ apiClient: thirdpartyApiClient, logger });

workflowRegistry.registerWorkflow(queryWorkflow);
workflowRegistry.registerWorkflow(operationWorkflow);
logger.info('Manually registered workflows:', {
  workflows: [queryWorkflow.name, operationWorkflow.name]
});
```

**Registration Benefits:**
- **Complete Control**: Register components based on complex business logic
- **Conditional Loading**: Only register what's needed for specific environments
- **Performance Optimization**: Fine-tune registration order and dependencies
- **Enterprise Integration**: Integrate with existing component discovery systems

## 🔧 Available Tools and Workflows

### Manually Registered Tools

#### `query_customers_example`
**Advanced customer querying with manual configuration**

```json
{
  "search": "Enterprise Solutions Inc",
  "limit": 100,
  "filters": {
    "status": "active",
    "customerType": "enterprise",
    "region": "North America",
    "contractValue": {
      "min": 100000,
      "max": 10000000
    }
  },
  "sortBy": "contractValue",
  "sortOrder": "desc",
  "userId": "enterprise-admin"
}
```

#### `create_order_example`
**Enterprise order creation with advanced validation**

```json
{
  "customerId": "enterprise-12345",
  "items": [
    {
      "productId": "enterprise-platform",
      "quantity": 1000,
      "unitPrice": 99.99,
      "customConfiguration": {
        "sla": "enterprise",
        "support": "24x7x365",
        "environment": "production"
      }
    }
  ],
  "shippingAddress": {
    "companyName": "Enterprise Solutions Inc",
    "street": "1000 Corporate Blvd",
    "city": "Business City",
    "state": "NY",
    "zipCode": "10001",
    "country": "US"
  },
  "priority": "urgent",
  "approvalRequired": true,
  "userId": "enterprise-admin"
}
```

### Manually Registered Workflows

#### `example_query` Workflow
**Advanced analytics with manual error handling**

```json
{
  "workflow_name": "example_query",
  "parameters": {
    "userId": "data-analyst",
    "queryType": "enterprise_analytics",
    "analysisScope": {
      "timeRange": {
        "startDate": "2024-01-01T00:00:00Z",
        "endDate": "2024-12-31T23:59:59Z"
      },
      "businessUnits": ["enterprise", "mid-market"],
      "includeProjections": true,
      "includeSegmentation": true
    },
    "outputFormat": "comprehensive",
    "includeMetadata": true,
    "executionOptions": {
      "timeout": 300,
      "retryAttempts": 2,
      "enableCaching": true
    }
  }
}
```

#### `example_operation` Workflow
**Complex enterprise operations with transaction control**

```json
{
  "workflow_name": "example_operation",
  "parameters": {
    "userId": "operations-manager",
    "operationType": "enterprise_data_migration",
    "operationData": {
      "type": "enterprise_data_migration",
      "sourceSystem": "legacy-enterprise-crm",
      "targetSystem": "modern-cloud-platform",
      "migrationScope": {
        "customers": 100000,
        "orders": 1000000,
        "products": 10000,
        "customFields": 500
      },
      "validationLevel": "enterprise-strict",
      "dataTransformation": {
        "enableFieldMapping": true,
        "preserveHistory": true,
        "validateIntegrity": true
      }
    },
    "executionOptions": {
      "timeout": 7200,
      "retryAttempts": 1,
      "rollbackOnFailure": true,
      "checkpoints": true,
      "notificationChannels": ["email", "slack", "webhook"]
    }
  }
}
```

## 🧪 Testing Manual Setup

### Comprehensive Test Categories

```bash
# Test manual infrastructure setup
deno test --allow-all tests/infrastructure/

# Test manual tool registration
deno test --allow-all tests/tools/ManualRegistration.test.ts

# Test manual workflow registration
deno test --allow-all tests/workflows/ManualRegistration.test.ts

# Test custom dependency injection
deno test --allow-all tests/dependencies/CustomInjection.test.ts

# Test complete integration
deno test --allow-all tests/integration/ManualSetup.test.ts
```

### Manual Registration Verification

```typescript
// Verify tool registration
describe('Manual Tool Registration', () => {
  it('should register all tools manually', async () => {
    const dependencies = await createManualDependencies({ configManager, logger, kvManager });
    const toolRegistry = dependencies.toolRegistry!;
    
    const registeredTools = toolRegistry.listTools();
    assertEquals(registeredTools.length, 4); // Expected number of tools
    
    const toolNames = registeredTools.map(tool => tool.name);
    assert(toolNames.includes('query_customers_example'));
    assert(toolNames.includes('create_order_example'));
    assert(toolNames.includes('get_order_status_example'));
    assert(toolNames.includes('get_api_info_example'));
  });
});

// Verify workflow registration
describe('Manual Workflow Registration', () => {
  it('should register workflows manually', async () => {
    const dependencies = await createManualDependencies({ configManager, logger, kvManager });
    const workflowRegistry = dependencies.workflowRegistry!;
    
    const workflowNames = workflowRegistry.getWorkflowNames();
    assertEquals(workflowNames.length, 2);
    assert(workflowNames.includes('example_query'));
    assert(workflowNames.includes('example_operation'));
  });
});
```

### Custom Health Check Testing

```typescript
// Test custom health checks
describe('Manual Health Checks', () => {
  it('should pass custom health checks', async () => {
    const dependencies = await createManualDependencies({ configManager, logger, kvManager });
    
    // Custom health check for manual workflow registry
    const workflowRegistry = dependencies.workflowRegistry!;
    const workflowNames = workflowRegistry.getWorkflowNames();
    
    assert(workflowNames.length > 0, 'No workflows registered - manual registration failed');
    
    const healthStatus = {
      healthy: true,
      status: 'Workflows registered',
      workflowCount: workflowNames.length,
      discoveryMode: 'manual'
    };
    
    assertEquals(healthStatus.healthy, true);
    assertEquals(healthStatus.discoveryMode, 'manual');
  });
});
```

## 🔍 Advanced Debugging and Troubleshooting

### Enable Expert-Level Logging

```bash
# Enable comprehensive debug logging
LOG_LEVEL=debug LOG_FORMAT=json deno run --allow-all main.ts
```

This provides detailed information about:
- Manual dependency creation sequence
- Tool and workflow registration process
- Infrastructure component initialization
- Custom health check execution
- OAuth provider and consumer setup
- API client configuration and testing

### Common Expert-Level Issues

#### 1. Manual Registration Order Issues

**Problem:**
```
Error: Cannot register tool - toolRegistry not initialized
```

**Solution:**
- Ensure tool registry creation happens before tool registration
- Verify SDK MCP server configuration is complete
- Check dependency injection order in createManualDependencies()
- Validate error handler is properly created

**Debug Steps:**
```typescript
// Add debugging to createManualDependencies()
logger.debug('Creating tool registry...', { step: 'tool-registry-creation' });
const toolRegistry = await getToolRegistry(logger, errorHandler);
logger.debug('Tool registry created successfully');

logger.debug('Configuring SDK MCP server...', { step: 'sdk-server-config' });
toolRegistry.sdkMcpServer = new SdkMcpServer(/* config */);
logger.debug('SDK MCP server configured successfully');
```

#### 2. Infrastructure Component Dependencies

**Problem:**
```
Error: KV manager not initialized before credential store creation
```

**Solution:**
- Follow proper initialization order: KVManager → initialize() → dependent components
- Ensure manual initialization calls are awaited
- Verify component dependencies are satisfied before creation

**Debug Steps:**
```typescript
// Verify KV manager initialization
logger.debug('Initializing KV manager...', { kvPath });
const kvManager = new KVManager({ kvPath }, logger);
await kvManager.initialize();
logger.debug('KV manager initialized successfully', { 
  isInitialized: kvManager.isInitialized() 
});

// Verify dependent component creation
logger.debug('Creating credential store with initialized KV manager...');
const credentialStore = new CredentialStore(kvManager, {}, logger);
logger.debug('Credential store created successfully');
```

#### 3. OAuth Configuration Complexity

**Problem:**
```
Error: OAuth provider configuration validation failed
```

**Solution:**
- Verify all required OAuth environment variables are set
- Check OAuth provider configuration object structure
- Validate dependency injection for OAuth provider
- Ensure OAuth consumer and provider don't conflict

**Debug Steps:**
```typescript
// Debug OAuth provider configuration
const oauthProviderConfig = {
  issuer: configManager.get('OAUTH_PROVIDER_ISSUER'),
  clientId: configManager.get('OAUTH_PROVIDER_CLIENT_ID'),
  clientSecret: configManager.get('OAUTH_PROVIDER_CLIENT_SECRET'),
  // ... other config
};
logger.debug('OAuth provider configuration:', oauthProviderConfig);

// Verify OAuth provider dependencies
const oauthDependencies = { logger, kvManager, credentialStore };
logger.debug('OAuth provider dependencies:', {
  hasLogger: !!logger,
  hasKvManager: !!kvManager,
  hasCredentialStore: !!credentialStore
});
```

### Performance Optimization Debugging

#### Component Initialization Timing

```typescript
// Add timing to dependency creation
const startTime = performance.now();

const logger = new Logger(/* config */);
logger.debug('Logger created', { elapsed: performance.now() - startTime });

const kvManager = new KVManager(/* config */, logger);
await kvManager.initialize();
logger.debug('KV manager initialized', { elapsed: performance.now() - startTime });

// ... continue timing other components

logger.info('Manual dependency creation completed', {
  totalElapsed: performance.now() - startTime,
  componentCount: Object.keys(dependencies).length
});
```

#### Memory Usage Monitoring

```typescript
// Monitor memory usage during manual setup
const memoryUsage = Deno.memoryUsage();
logger.debug('Memory usage after manual dependency creation:', {
  rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
  external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
});
```

## 🔄 Comparing with Previous Examples

### Evolution of Complexity and Control

| Example | Setup Lines | Control Level | Use Case |
|---------|------------|---------------|----------|
| **1-simple** | ~10 lines | Basic | Learning, prototypes |
| **2-plugin-workflows** | ~15 lines | Standard | Most applications |
| **3-plugin-api-auth** | ~25 lines | Advanced | OAuth integrations |
| **4-manual-deps** | ~150+ lines | Expert | Enterprise, performance-critical |

### When to Choose Manual Control

**Choose Manual Control When**:
- **Enterprise Integration**: Need to integrate with existing infrastructure
- **Performance Critical**: Require fine-grained resource optimization  
- **Custom Authentication**: Implementing non-standard auth patterns
- **Conditional Loading**: Complex business logic for component registration
- **Legacy Systems**: Working with existing enterprise systems
- **Advanced Monitoring**: Need custom logging, metrics, and health checks

### Migration Complexity

**From Plugin-API-Auth to Manual-Deps:**

1. **Remove Plugin Discovery**:
   ```typescript
   // REMOVE: Plugin discovery (automatic)
   // Library automatically finds plugins in src/plugins/
   
   // ADD: Manual registration (explicit)
   const toolRegistry = await getToolRegistry(logger, errorHandler);
   // ... manual tool registration
   ```

2. **Replace Dependency Injection**:
   ```typescript
   // REMOVE: Simple custom dependencies
   return {
     configManager,
     logger,
     thirdpartyApiClient,
     oAuthConsumer
   };
   
   // ADD: Complete manual infrastructure
   return {
     logger: manuallyCreatedLogger,
     kvManager: manuallyInitializedKV,
     toolRegistry: manuallyConfiguredRegistry,
     workflowRegistry: manuallyPopulatedRegistry,
     // ... all components manually created
   };
   ```

3. **Add Infrastructure Control**:
   ```typescript
   // ADD: Manual component creation
   const auditLogger = new AuditLogger(/* config */, logger);
   const sessionStore = new SessionStore(kvManager, /* config */, logger);
   const eventStore = new TransportEventStore(kvManager.getKV(), /* config */, logger);
   const transportManager = new TransportManager(/* config */, { /* deps */ });
   ```

## 🎓 Learning Exercises

### Exercise 1: Custom Component Implementation

1. Create a custom logger implementation that extends the library Logger
2. Replace the standard logger with your custom implementation
3. Add custom log formatting and destination handling
4. Test the custom logger integration

### Exercise 2: Conditional Registration Logic

1. Implement conditional tool registration based on environment variables
2. Add feature flags for workflow registration
3. Create environment-specific dependency configurations
4. Test different registration scenarios

### Exercise 3: Performance Optimization

1. Add timing metrics to all component creation
2. Implement lazy loading for expensive components
3. Optimize KV storage configuration for your use case
4. Measure and optimize memory usage

### Exercise 4: Enterprise Integration Pattern

1. Integrate with an existing logging system (e.g., ELK stack)
2. Implement custom health checks for external dependencies
3. Add enterprise-specific authentication patterns
4. Create custom monitoring and alerting integration

## 🔗 Next Steps

Once you've mastered manual dependency control:

1. **Production Deployment**: Deploy with custom infrastructure configurations
2. **Enterprise Patterns**: Implement advanced enterprise integration patterns
3. **Performance Tuning**: Optimize for specific production requirements
4. **Custom Components**: Create completely custom implementations of library components
5. **Advanced Monitoring**: Implement comprehensive observability and alerting
6. **Scalability Patterns**: Design for high-availability and scaling requirements

## 📚 Additional Resources

- **Library Architecture Guide**: Deep dive into library component structure and relationships
- **Dependency Injection Patterns**: Advanced patterns for complex enterprise scenarios
- **Performance Optimization**: Best practices for optimizing manual setups
- **Enterprise Integration**: Patterns for integrating with existing enterprise infrastructure
- **Custom Component Development**: Guide to creating custom implementations of library components

This example represents the pinnacle of flexibility and control available with the Beyond MCP Server library, enabling you to build highly customized, performance-optimized, and enterprise-ready MCP servers that can integrate with any existing infrastructure while maintaining complete control over every aspect of the implementation.