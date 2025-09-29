# Plugin-API-Auth Example - Step-by-Step Instructions

This guide walks you through running and understanding the **Plugin-API-Auth** example, which demonstrates OAuth 2.0 authentication and external API integration using the Beyond MCP Server library.

## 🎯 What You'll Learn

By following this guide, you'll understand:

- **OAuth 2.0 Authentication Flow**: Complete authorization code flow with PKCE
- **External API Integration**: Secure communication with third-party APIs
- **Custom Dependency Injection**: Creating and managing custom services
- **Token Management**: Automatic refresh, secure storage, and error recovery
- **Production Security Patterns**: Industry-standard authentication practices

## 🚀 Quick Start

### Step 1: Navigate to the Example

```bash
cd examples/3-plugin-api-auth
```

### Step 2: Configure OAuth Credentials

```bash
# Copy the environment template
cp .env.example .env

# Edit the .env file with your credentials
vim .env  # or use your preferred editor
```

**Required OAuth Configuration:**

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
```

### Step 3: Run the Server

```bash
# STDIO transport (for MCP clients)
deno run --allow-all main.ts

# OR HTTP transport (for web interface and OAuth endpoints)
MCP_TRANSPORT=http deno run --allow-all main.ts
```

You should see:

```
[INFO] Starting MCP server: examplecorp-mcp-server v1.0.0
[INFO] OAuth consumer initialized: ExampleCorp API
[INFO] API client configured: https://api.examplecorp.com/v1
[INFO] Plugin discovery found: ExamplePlugin v1.0.0
[INFO] Registered 2 workflows: example_query, example_operation
[INFO] Registered 5 tools: execute_workflow_examplecorp, query_customers_example, create_order_example, get_order_status_example, get_api_info_example
[INFO] Server ready on stdio transport
```

### Step 4: Test OAuth Integration

```bash
# Run the test suite to verify OAuth flow
deno test --allow-all tests/
```

## 🔧 Understanding OAuth Integration

### OAuth Consumer vs OAuth Provider

This example demonstrates the **OAuth Consumer** pattern:

```typescript
// This example: MCP Server consumes external OAuth API
const oAuthConsumer = new ExampleOAuthConsumer({
  // Configuration for ExampleCorp's OAuth provider
  authUrl: 'https://api.examplecorp.com/oauth/authorize',
  tokenUrl: 'https://api.examplecorp.com/oauth/token',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

**OAuth Consumer Flow:**

1. **Authorization Request**: Generate OAuth authorization URL
2. **User Authorization**: User authorizes access via ExampleCorp
3. **Code Exchange**: Exchange authorization code for access tokens
4. **API Calls**: Use tokens for authenticated requests
5. **Token Refresh**: Automatically refresh expired tokens

### ExampleCorp API Integration

The API client handles all OAuth complexity:

```typescript
// Authenticated API calls are transparent
const customers = await apiClient.get('/customers', {
  filters: { status: 'active' },
  userId: 'user-123',
});

// OAuth tokens are automatically included in headers
// Token refresh happens automatically if needed
```

## 🔧 Available Tools and Workflows

### 1. Workflow Execution Tool

#### `execute_workflow_examplecorp`

Execute specialized ExampleCorp workflows with OAuth authentication.

**Example Parameters:**

```json
{
  "workflow_name": "example_query",
  "parameters": {
    "userId": "demo-user",
    "queryType": "customers",
    "filters": {
      "status": "active",
      "region": "North America"
    },
    "pagination": {
      "page": 1,
      "limit": 20
    },
    "outputFormat": "detailed"
  }
}
```

### 2. Direct API Tools

#### `query_customers_example`

Direct customer search with OAuth authentication.

**Example Parameters:**

```json
{
  "search": "Acme Corporation",
  "limit": 25,
  "filters": {
    "status": "active",
    "customerType": "business",
    "region": "US-West"
  },
  "userId": "demo-user"
}
```

#### `create_order_example`

Create orders in ExampleCorp system with validation.

**Example Parameters:**

```json
{
  "customerId": "cust-12345",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 5,
      "unitPrice": 29.99,
      "notes": "Rush delivery requested"
    }
  ],
  "shippingAddress": {
    "street": "123 Business Ave",
    "city": "Commerce City",
    "state": "CA",
    "zipCode": "90210",
    "country": "US"
  },
  "priority": "expedited",
  "userId": "demo-user"
}
```

#### `get_order_status_example`

Retrieve order status and tracking information.

**Example Parameters:**

```json
{
  "orderId": "ord-67890",
  "includeHistory": true,
  "userId": "demo-user"
}
```

#### `get_api_info_example`

Get ExampleCorp API connectivity and status information.

**Parameters:** None required

## 🏗️ Architecture Deep Dive

### Custom Dependency Creation

The `ExampleDependencies.ts` file demonstrates the dependency injection pattern:

```typescript
export async function createExampleDependencies(
  { configManager, logger, kvManager }: CreateCustomAppServerDependencies,
): Promise<Partial<AppServerDependencies>> {
  // 1. Create OAuth consumer with environment configuration
  const oAuthConsumer = new ExampleOAuthConsumer(
    {
      provider: 'examplecorp',
      authUrl: configManager.get('OAUTH_CONSUMER_AUTH_URL'),
      tokenUrl: configManager.get('OAUTH_CONSUMER_TOKEN_URL'),
      clientId: configManager.get('OAUTH_CONSUMER_CLIENT_ID'),
      clientSecret: configManager.get('OAUTH_CONSUMER_CLIENT_SECRET'),
      // ... other OAuth config
    },
    logger,
    kvManager,
  );

  // 2. Create API client with OAuth integration
  const thirdpartyApiClient = new ExampleApiClient(
    {
      baseUrl: configManager.get('THIRDPARTY_API_BASE_URL'),
      timeout: configManager.get('THIRDPARTY_API_TIMEOUT', 30000),
      retryAttempts: configManager.get('THIRDPARTY_API_RETRY_ATTEMPTS', 3),
      // ... other API config
    },
    oAuthConsumer,
    logger,
  );

  // 3. Return combined dependencies
  return {
    // Library dependencies (from bb-mcp-server)
    configManager,
    logger,

    // Custom dependencies (ExampleCorp-specific)
    thirdpartyApiClient,
    oAuthConsumer,
  };
}
```

**Key Benefits:**

- **Clean Separation**: Library vs business logic dependencies
- **Type Safety**: Full TypeScript support for all dependencies
- **Testability**: Easy to mock dependencies for testing
- **Configuration**: Environment-driven dependency configuration

### Plugin Discovery with Custom Dependencies

The library automatically discovers plugins while injecting custom dependencies:

```typescript
// main.ts - Simple setup
const appServer = await AppServer.create(createExampleDependencies);

// Library automatically:
// 1. Creates dependencies via createExampleDependencies()
// 2. Discovers ExamplePlugin in src/plugins/
// 3. Injects dependencies into plugin components
// 4. Registers all tools and workflows
```

## 🧪 Testing OAuth Integration

### Method 1: Automated Test Suite

```bash
# Run all OAuth-related tests
deno test --allow-all tests/

# Run specific test categories
deno test --allow-all tests/auth/        # OAuth consumer tests
deno test --allow-all tests/api/         # API client tests  
deno test --allow-all tests/integration/ # End-to-end tests
```

### Method 2: Manual Testing with MCP Client

If you have an MCP client:

1. **List Available Tools**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/list"
   }
   ```

2. **Execute OAuth-Authenticated Tool**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "tools/call",
     "params": {
       "name": "query_customers_example",
       "arguments": {
         "search": "test",
         "limit": 5,
         "userId": "test-user"
       }
     }
   }
   ```

### Method 3: HTTP Transport Testing

When using HTTP transport, you can test OAuth endpoints:

```bash
# Start server in HTTP mode
MCP_TRANSPORT=http deno run --allow-all main.ts

# Test OAuth authorization URL generation
curl http://localhost:3000/oauth/consumer/auth

# Test API info endpoint
curl http://localhost:3000/api/info
```

### Mock Testing for Development

For development without real OAuth credentials:

```typescript
// Create mock dependencies for testing
const mockDependencies = {
  thirdpartyApiClient: new MockExampleApiClient(),
  oAuthConsumer: new MockExampleOAuthConsumer({
    mockTokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: Date.now() + 3600000,
    },
  }),
};
```

## 🔍 Debugging and Troubleshooting

### Enable Comprehensive Logging

```bash
# Enable debug logging for detailed OAuth flow
LOG_LEVEL=debug deno run --allow-all main.ts
```

This shows:

- OAuth token request/response details
- API client request/response logging
- Dependency injection process
- Plugin discovery and registration
- Token refresh and expiration handling

### Common Issues and Solutions

#### 1. OAuth Configuration Issues

**Problem:**

```
Error: OAuth consumer configuration invalid
```

**Solution:**

- Verify all required OAuth environment variables are set
- Check that URLs are accessible and correct
- Confirm client ID and secret are valid
- Ensure redirect URI matches registered URI exactly

#### 2. Token Storage Issues

**Problem:**

```
Error: Failed to store OAuth tokens
```

**Solution:**

- Check Deno KV database path is writable
- Verify `DENO_KV_PATH` environment variable
- Ensure sufficient disk space
- Check file permissions

#### 3. API Authentication Failures

**Problem:**

```
Error: 401 Unauthorized - Invalid token
```

**Solution:**

- Verify OAuth scopes include required permissions
- Check if access token has expired
- Confirm automatic token refresh is working
- Validate API base URL configuration

#### 4. Plugin Discovery Issues

**Problem:**

```
Error: ExamplePlugin not found
```

**Solution:**

- Verify plugin file exists in `src/plugins/`
- Check plugin exports default ExamplePlugin
- Ensure plugin is properly structured
- Review plugin discovery path configuration

### Debugging OAuth Flow

1. **Inspect OAuth Configuration**:
   ```typescript
   // Add to createExampleDependencies() for debugging
   console.log('OAuth Config:', {
     authUrl: configManager.get('OAUTH_CONSUMER_AUTH_URL'),
     tokenUrl: configManager.get('OAUTH_CONSUMER_TOKEN_URL'),
     clientId: configManager.get('OAUTH_CONSUMER_CLIENT_ID'),
     redirectUri: configManager.get('OAUTH_CONSUMER_REDIRECT_URI'),
   });
   ```

2. **Check Token Storage**:
   ```typescript
   // Inspect stored tokens
   const tokens = await oAuthConsumer.getStoredTokens('user-123');
   console.log('Stored OAuth tokens:', tokens);
   ```

3. **Test API Connectivity**:
   ```typescript
   // Test API without authentication first
   const apiInfo = await apiClient.get('/info', { skipAuth: true });
   console.log('API Info:', apiInfo);
   ```

## 🔄 Comparing with Previous Examples

### Progression from Plugin-Workflows

| Aspect               | Plugin-Workflows      | Plugin-API-Auth               |
| -------------------- | --------------------- | ----------------------------- |
| **Setup Complexity** | Minimal config        | OAuth credentials required    |
| **Authentication**   | None                  | Full OAuth 2.0 flow           |
| **Data Source**      | Mock/local data       | Real external API             |
| **Dependencies**     | Library defaults      | Custom dependency injection   |
| **Error Handling**   | Local workflow errors | Network + auth error handling |
| **Security**         | Basic patterns        | Production OAuth security     |
| **Testing**          | Simple unit tests     | OAuth integration tests       |

### Key New Concepts

1. **OAuth Consumer Pattern**: Consuming external OAuth APIs vs providing OAuth
2. **Dependency Injection**: Custom service creation and injection
3. **External API Integration**: Real-world API communication patterns
4. **Token Management**: Secure storage, refresh, and expiration handling
5. **Production Security**: Industry-standard authentication practices

## 🎓 Learning Exercises

### Exercise 1: Configure Different OAuth Provider

1. Modify `ExampleOAuthConsumer` for a different API provider
2. Update OAuth URLs and scopes
3. Test the authorization flow
4. Handle provider-specific token formats

### Exercise 2: Add Custom API Endpoints

1. Add new methods to `ExampleApiClient`
2. Create corresponding tools for the new endpoints
3. Test authentication and error handling
4. Add appropriate parameter validation

### Exercise 3: Implement Token Refresh Logic

1. Study the automatic token refresh implementation
2. Add custom refresh logic for edge cases
3. Test token expiration scenarios
4. Implement fallback authentication methods

### Exercise 4: Create Custom OAuth Scopes

1. Define custom OAuth scopes for your use case
2. Implement scope validation in tools and workflows
3. Handle insufficient permissions gracefully
4. Add scope upgrade workflows

## 🔗 Next Steps

Once you're comfortable with OAuth integration:

1. **Advanced Patterns**: Explore `4-manual-deps` for complete infrastructure control
2. **Custom Integrations**: Implement OAuth consumers for other APIs
3. **Enterprise Features**: Multi-tenant OAuth, advanced security patterns
4. **Production Deployment**: Scale OAuth integration for production use

## 📚 Additional Resources

- **OAuth 2.0 Specification**: Understanding the authorization framework
- **PKCE Extension**: Security enhancement for OAuth flows
- **ExampleApiClient Documentation**: API client patterns and best practices
- **Dependency Injection Guide**: Advanced dependency management patterns
- **Production Security**: OAuth security considerations and best practices

This example provides the foundation for building secure, production-ready MCP servers that integrate with external APIs using industry-standard OAuth 2.0 authentication patterns.
