# Plugin-API-Auth Example - External API Integration with OAuth

This example demonstrates **OAuth authentication and external API integration** using the Beyond MCP Server library. It showcases how to integrate with third-party APIs using secure OAuth 2.0 authentication, custom dependency injection, and proper credential management while maintaining the plugin architecture.

## 🎯 Learning Objectives

This example teaches you how to:

- **OAuth 2.0 Integration**: Implement secure authentication flows with external APIs
- **External API Client Patterns**: Build robust API clients with proper error handling and retry logic
- **Custom Dependency Injection**: Create and inject custom services while leveraging library infrastructure
- **Secure Credential Management**: Store and manage OAuth tokens securely with automatic refresh
- **Plugin Architecture with Dependencies**: Combine plugin discovery with custom dependency injection
- **Production Authentication Patterns**: Handle token expiration, refresh, and error recovery

## 🔧 Key Features

### 1. OAuth Consumer Integration (`ExampleOAuthConsumer`)
**Extends Library OAuthConsumer for ExampleCorp API**

```typescript
// Custom OAuth consumer for ExampleCorp API
const oAuthConsumer = new ExampleOAuthConsumer({
  provider: 'examplecorp',
  authUrl: 'https://api.examplecorp.com/oauth/authorize',
  tokenUrl: 'https://api.examplecorp.com/oauth/token',
  clientId: process.env.OAUTH_CONSUMER_CLIENT_ID,
  clientSecret: process.env.OAUTH_CONSUMER_CLIENT_SECRET,
  scopes: ['read', 'write'],
  // ExampleCorp-specific configuration
  exampleCorp: {
    apiBaseUrl: 'https://api.examplecorp.com',
    apiVersion: 'v1',
    customClaims: {
      organization: process.env.EXAMPLECORP_ORGANIZATION
    }
  }
});
```

**Demonstrates**:
- Provider-specific OAuth configuration
- Custom claims and scopes handling
- Automatic token refresh and management
- Secure credential storage with Deno KV

### 2. External API Client (`ExampleApiClient`)
**Authenticated HTTP client with proper error handling**

```typescript
// API client with OAuth authentication
const apiClient = new ExampleApiClient({
  baseUrl: 'https://api.examplecorp.com',
  apiVersion: 'v1',
  timeout: 30000,
  retryAttempts: 3,
  userAgent: 'ExampleCorp-MCP-Server/1.0'
}, oAuthConsumer, logger);
```

**Demonstrates**:
- OAuth header injection for authenticated requests
- Intelligent retry logic with exponential backoff
- Rate limiting and error response handling
- Request/response validation and logging

### 3. Custom Dependency Creation (`ExampleDependencies.ts`)
**Integrates library and custom components**

```typescript
// Custom dependency factory function
export async function createExampleDependencies(
  { configManager, logger, kvManager }: CreateCustomAppServerDependencies
): Promise<Partial<AppServerDependencies>> {
  // Create OAuth consumer with environment configuration
  const oAuthConsumer = new ExampleOAuthConsumer(oauthConfig, logger, kvManager);
  
  // Create API client with OAuth integration
  const thirdpartyApiClient = new ExampleApiClient(apiConfig, oAuthConsumer, logger);
  
  return {
    // Library dependencies (provided by bb-mcp-server)
    configManager,
    logger,
    
    // Custom dependencies (ExampleCorp-specific)
    thirdpartyApiClient,
    oAuthConsumer,
    
    serverConfig: {
      name: 'examplecorp-mcp-server',
      version: '1.0.0'
    }
  };
}
```

**Demonstrates**:
- Clean separation between library and custom dependencies
- Proper dependency injection patterns
- Configuration management with environment variables
- Type-safe dependency creation

## 🏗️ Architecture Patterns

### OAuth Integration Architecture
```
AppServer.create(custom dependencies)
├── Plugin Discovery System
├── ExamplePlugin
│   ├── OAuth-authenticated tools
│   └── API integration workflows
├── Custom Dependencies
│   ├── ExampleApiClient (with OAuth)
│   └── ExampleOAuthConsumer
└── Library Dependencies
    ├── ConfigManager
    ├── Logger
    ├── KVManager (secure token storage)
    └── TransportManager
```

### Correct Dependency Injection Pattern
```typescript
// main.ts - Simple setup with custom dependencies
const appServer = await AppServer.create(createExampleDependencies);
await appServer.start();
```

**Benefits**:
- Library handles all infrastructure (transport, logging, storage)
- Custom dependencies provide business-specific functionality
- Plugin discovery automatically finds and registers components
- OAuth integration works seamlessly with HTTP transport endpoints

### Plugin Structure with Custom Dependencies
```typescript
const ExamplePlugin: AppPlugin = {
  name: 'example-api-auth-plugin',
  version: '1.0.0',
  description: 'OAuth-authenticated ExampleCorp API integration',
  
  // Tools and workflows have access to injected dependencies
  workflows: [
    new ExampleQueryWorkflow(), // Uses thirdpartyApiClient internally
    new ExampleOperationWorkflow() // OAuth authentication handled automatically
  ],
  
  tools: [
    // OAuth-authenticated tools
  ],
};
```

## 🚀 Getting Started

### Prerequisites
- Deno 2.5.0 or later
- ExampleCorp API credentials (OAuth client ID and secret)
- Basic understanding of OAuth 2.0 authentication flows
- Familiarity with Beyond MCP Server library (try `2-plugin-workflows` first)

### Quick Start

1. **Install Dependencies**
   ```bash
   cd examples/3-plugin-api-auth
   # Dependencies are handled by import maps
   ```

2. **Configure OAuth Credentials**
   ```bash
   cp .env.example .env
   # Edit .env with your ExampleCorp API credentials
   ```

3. **Run the Server**
   ```bash
   # STDIO transport (default)
   deno run --allow-all main.ts
   
   # HTTP transport with OAuth endpoints
   MCP_TRANSPORT=http deno run --allow-all main.ts
   ```

4. **Test OAuth Integration**
   ```bash
   # Run tests to verify OAuth flow
   deno test --allow-all tests/
   ```

### Configuration

#### Required OAuth Configuration
```bash
# OAuth Consumer Configuration (for ExampleCorp API)
OAUTH_CONSUMER_CLIENT_ID=your-examplecorp-client-id
OAUTH_CONSUMER_CLIENT_SECRET=your-examplecorp-client-secret
OAUTH_CONSUMER_AUTH_URL=https://api.examplecorp.com/oauth/authorize
OAUTH_CONSUMER_TOKEN_URL=https://api.examplecorp.com/oauth/token
OAUTH_CONSUMER_REDIRECT_URI=http://localhost:3000/oauth/consumer/callback
OAUTH_CONSUMER_SCOPES=read,write

# ExampleCorp API Configuration
THIRDPARTY_API_BASE_URL=https://api.examplecorp.com
THIRDPARTY_API_VERSION=v1
THIRDPARTY_ORGANIZATION=your-org-id
THIRDPARTY_DEPARTMENT=your-dept-id
```

#### Optional Configuration
```bash
# Transport Configuration
MCP_TRANSPORT=stdio|http
HTTP_PORT=3000
HTTP_HOST=localhost

# Storage Configuration
DENO_KV_PATH=./examples/3-plugin-api-auth/data/oauth-tokens.db

# API Client Configuration
THIRDPARTY_API_TIMEOUT=30000
THIRDPARTY_API_RETRY_ATTEMPTS=3
THIRDPARTY_API_RETRY_DELAY=1000

# Logging Configuration
LOG_LEVEL=info|debug|warn|error
LOG_FORMAT=json|text
```

## 📊 OAuth Flow Diagram

### Authorization Code Flow with PKCE
```
MCP Client                    MCP Server                    ExampleCorp API
    │                             │                              │
    │ 1. Request OAuth URL         │                              │
    │────────────────────────────→│                              │
    │                             │ 2. Generate auth URL         │
    │                             │────────────────────────────→│
    │                             │                              │
    │ 3. User authorization        │                              │
    │──────────────────────────────────────────────────────────→│
    │                             │                              │
    │                             │ 4. Auth code callback        │
    │                             │←────────────────────────────│
    │                             │                              │
    │                             │ 5. Exchange code for tokens  │
    │                             │────────────────────────────→│
    │                             │                              │
    │ 6. API calls with tokens     │ 7. Authenticated requests    │
    │────────────────────────────→│────────────────────────────→│
```

## 🔧 Available Tools and Workflows

### OAuth-Authenticated Tools

#### `query_customers_example`
**Search ExampleCorp customer database with OAuth authentication**

```json
{
  "search": "Acme Corp",
  "limit": 25,
  "filters": {
    "status": "active",
    "region": "US-West"
  },
  "userId": "user-123"
}
```

#### `create_order_example`
**Create orders in ExampleCorp system with proper authentication**

```json
{
  "customerId": "cust-456",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 5,
      "unitPrice": 29.99
    }
  ],
  "userId": "user-123"
}
```

### OAuth-Authenticated Workflows

#### `example_query` Workflow
**Multi-step data querying with authentication**

```json
{
  "workflow_name": "example_query",
  "parameters": {
    "userId": "user-123",
    "queryType": "customers",
    "filters": {
      "status": "active",
      "region": "North America"
    },
    "pagination": {
      "page": 1,
      "limit": 20
    }
  }
}
```

#### `example_operation` Workflow
**Complex business operations with OAuth security**

```json
{
  "workflow_name": "example_operation",
  "parameters": {
    "userId": "user-123",
    "operationType": "create_customer_with_order",
    "operationData": {
      "customer": {
        "name": "Jane Smith",
        "email": "jane.smith@example.com"
      },
      "order": {
        "items": [{
          "productId": "prod-001",
          "quantity": 5
        }]
      }
    }
  }
}
```

## 🧪 Testing OAuth Integration

### Test OAuth Flow
```bash
# Test OAuth consumer functionality
deno test --allow-all tests/auth/ExampleOAuthConsumer.test.ts

# Test API client with authentication
deno test --allow-all tests/api/ExampleApiClient.test.ts

# Test end-to-end OAuth workflows
deno test --allow-all tests/integration/OAuthWorkflows.test.ts
```

### Mock OAuth Testing
```typescript
// Create mock OAuth consumer for testing
const mockOAuthConsumer = new MockExampleOAuthConsumer({
  mockTokens: {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000
  }
});

// Test API client with mock authentication
const result = await apiClient.get('/customers', { userId: 'test-user' });
```

## 🔍 Troubleshooting

### Common OAuth Issues

1. **OAuth Token Not Found**
   ```
   Error: No valid OAuth token found for user
   ```
   **Solution**:
   - Ensure user has completed OAuth authorization flow
   - Check token storage in Deno KV database
   - Verify OAuth consumer configuration

2. **API Authentication Failed**
   ```
   Error: 401 Unauthorized - Invalid or expired token
   ```
   **Solution**:
   - Check if access token has expired
   - Verify automatic token refresh is working
   - Confirm OAuth scopes include required permissions

3. **OAuth Redirect URI Mismatch**
   ```
   Error: redirect_uri_mismatch
   ```
   **Solution**:
   - Ensure `OAUTH_CONSUMER_REDIRECT_URI` matches registered URI
   - Check ExampleCorp API console for correct redirect URI
   - Verify HTTP vs HTTPS protocol matching

### Debugging OAuth Flow

1. **Enable Debug Logging**:
   ```bash
   LOG_LEVEL=debug deno run --allow-all main.ts
   ```

2. **Test OAuth Endpoints** (when using HTTP transport):
   ```bash
   curl http://localhost:3000/oauth/consumer/auth
   curl http://localhost:3000/oauth/consumer/callback?code=test-code
   ```

3. **Check Token Storage**:
   ```typescript
   // Inspect stored tokens
   const tokens = await oAuthConsumer.getStoredTokens('user-123');
   console.log('Stored tokens:', tokens);
   ```

## 🔄 Migration from Plugin-Workflows

If you're coming from the `2-plugin-workflows` example:

### Key Differences

| Aspect | Plugin-Workflows | Plugin-API-Auth |
|--------|-----------------|-----------------| 
| **Authentication** | None required | OAuth 2.0 with external API |
| **Dependencies** | Library defaults | Custom dependency injection |
| **API Integration** | Mock/local data | Real external API calls |
| **Setup Complexity** | Minimal configuration | OAuth credentials required |
| **Security** | Basic | Production OAuth patterns |
| **Error Handling** | Local workflow errors | Network + OAuth error handling |

### Migration Steps

1. **Add OAuth Configuration**: Set up OAuth consumer credentials
2. **Implement API Client**: Create authenticated HTTP client
3. **Custom Dependencies**: Replace default dependencies with custom injection
4. **Update Tools/Workflows**: Add authentication handling to existing components
5. **Test OAuth Flow**: Verify complete authentication workflow

## 📝 Key Concepts

### OAuth vs Library OAuth Provider

**Library OAuth Provider**: When your MCP server acts as an OAuth provider
**OAuth Consumer** (This Example): When your MCP server consumes external OAuth APIs

```typescript
// Library OAuth Provider (server provides OAuth)
oauthProvider: new OAuthProvider({ /* server config */ })

// OAuth Consumer (server consumes external OAuth)
oAuthConsumer: new ExampleOAuthConsumer({ /* external API config */ })
```

### Dependency Injection Benefits

1. **Testability**: Easy to mock dependencies for testing
2. **Configuration**: Environment-based dependency configuration  
3. **Flexibility**: Swap implementations without code changes
4. **Separation**: Clear boundary between library and business logic
5. **Type Safety**: Full TypeScript support for all dependencies

### Best Practices

1. **Token Security**: Always store tokens securely in KV storage
2. **Error Recovery**: Handle token expiration and refresh gracefully
3. **Rate Limiting**: Respect external API rate limits
4. **Logging**: Log OAuth events for debugging and audit
5. **Testing**: Use mocks for development and testing
6. **Configuration**: Keep sensitive credentials in environment variables

## 🎓 Learning Path

1. **Understand OAuth Flow**: Study the authorization code flow with PKCE
2. **Configure Credentials**: Set up OAuth client credentials with ExampleCorp
3. **Test Authentication**: Verify OAuth token exchange and refresh
4. **Build API Client**: Create authenticated HTTP client for external API
5. **Integrate Workflows**: Add OAuth authentication to existing workflows
6. **Handle Errors**: Implement proper error handling for auth and API failures

## 🔗 Next Steps

- **4-manual-deps**: Explore complete manual dependency control and advanced patterns
- **Custom OAuth Providers**: Implement OAuth consumers for other external APIs
- **Enterprise Integration**: Learn advanced authentication and authorization patterns
- **Production Deployment**: Scale OAuth integration for production environments

This example provides the foundation for building production-ready MCP servers that integrate securely with external APIs using industry-standard OAuth 2.0 authentication patterns.