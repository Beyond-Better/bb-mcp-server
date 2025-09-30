# MCP Server Authentication Guide

## Overview

The Beyond MCP Server library provides comprehensive OAuth 2.0-based authentication for MCP (Model Context Protocol) servers, following the [MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization.md). The system supports optional OAuth provider and consumer dependencies with full session binding capabilities.

## Architecture

The authentication system consists of three main components:

### 1. OAuth Provider (MCP Token Validation)
- **Purpose**: Acts as OAuth 2.0 Authorization Server for MCP clients
- **Function**: Issues and validates MCP access tokens
- **Legacy Equivalent**: `oauthClientService` from legacy codebase
- **RFC Compliance**: RFC 6749, 7636 (PKCE), 7591, 8414

### 2. OAuth Consumer (Third-party Authentication)
- **Purpose**: Handles OAuth flows with third-party providers (e.g., External)
- **Function**: Manages third-party tokens and user credentials
- **Legacy Equivalent**: `authService` from legacy codebase
- **Session Binding**: Links third-party tokens to MCP tokens

### 3. Authentication Middleware
- **Purpose**: Request-level authentication and session binding
- **Function**: Validates requests and manages authentication context
- **Features**: Automatic token refresh, error handling, MCP spec compliance

## MCP Specification Compliance

The authentication system follows MCP specification requirements:

- **HTTP Transport**: SHOULD use OAuth 2.0 authorization ✅
- **STDIO Transport**: SHOULD NOT use OAuth (use environment credentials) ⚠️ Configurable
- **Token Format**: `Authorization: Bearer <token>` ✅
- **Error Responses**: HTTP 401/403 with proper error handling ✅
- **Third-party Flows**: Session binding between MCP and external tokens ✅

## Quick Start

### Basic Setup (MCP Token Only)

```typescript
import { BeyondMcpServer, OAuthProvider } from '@beyondbetter/bb-mcp-server';

// Configure OAuth Provider for MCP token validation
const oauthProvider = new OAuthProvider({
  issuer: 'https://your-server.com',
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  // ... other config
});

// Create server with authentication
const server = new BeyondMcpServer({
  transport: {
    type: 'http',
    http: {
      hostname: 'localhost',
      port: 3000,
      enableAuthentication: true, // Auto-enabled when oauthProvider present
    },
  },
  dependencies: {
    oauthProvider,
    // logger, kvManager, etc.
  },
});
```

### Full Session Binding (MCP + Third-party)

```typescript
import { 
  BeyondMcpServer, 
  OAuthProvider, 
  OAuthConsumer 
} from '@beyondbetter/bb-mcp-server';

// Third-party OAuth consumer (e.g., External)
class ExternalOAuthConsumer extends OAuthConsumer {
  constructor(config: OAuthConsumerConfig, dependencies: OAuthConsumerDependencies) {
    super({
		providerId: 'example',
		authUrl: 'https://api.example.com/oauth/authorize',
		tokenUrl: 'https://api.example.com/oauth/token',
		clientId: process.env.OAUTH_CONSUMER_CLIENT_ID!,
		clientSecret: process.env.OAUTH_CONSUMER_CLIENT_SECRET!,
		redirectUri: process.env.OAUTH_CONSUMER_REDIRECT_URI!,
		scopes: ['read', 'write'],
	  },
	  dependencies);
  }

  // External-specific implementations
  protected async exchangeCodeForTokens(code: string): Promise<TokenResult> {
    // External-specific token exchange
  }
}

// OAuth provider for MCP tokens
const oauthProvider = new OAuthProvider({
  issuer: 'https://your-server.com',
  // ... config
});

// Third-party OAuth consumer
const oauthConsumer = new ExternalOAuthConsumer();

// Third-party API client for token refresh
const actionStepApiClient = new ExternalApiClient();

// Create server with full session binding
const server = new BeyondMcpServer({
  transport: {
    type: 'http',
    http: {
      hostname: 'localhost',
      port: 3000,
      enableAuthentication: true,
    },
  },
  dependencies: {
    oauthProvider,
    oauthConsumer,
    thirdPartyApiClient: actionStepApiClient,
    // ... other dependencies
  },
});
```

## Configuration

### Environment Variables

```bash
# Basic Authentication
MCP_AUTH_ENABLED=true                    # Enable authentication
MCP_AUTH_SKIP=false                      # Skip authentication override
MCP_AUTH_REQUIRE=true                    # Require authentication for MCP endpoints

# Transport-specific
MCP_AUTH_HTTP_ENABLED=true               # HTTP transport auth (recommended)
MCP_AUTH_HTTP_SKIP=false
MCP_AUTH_HTTP_REQUIRE=true

MCP_AUTH_STDIO_ENABLED=false             # STDIO transport auth (discouraged by spec)
MCP_AUTH_STDIO_ALLOW_OAUTH=true          # Allow OAuth for STDIO despite spec
MCP_AUTH_STDIO_SKIP=false

# Session Binding
MCP_SESSION_BINDING_ENABLED=true         # Enable session binding
MCP_SESSION_BINDING_AUTO_REFRESH=true    # Auto-refresh third-party tokens
MCP_SESSION_BINDING_TIMEOUT_MS=5000      # Validation timeout

# Error Handling
MCP_AUTH_ERROR_DETAILS=true              # Include detailed errors
MCP_AUTH_ERROR_GUIDANCE=true             # Include client guidance
MCP_AUTH_CUSTOM_HEADERS=false            # Use custom error headers (not recommended)

# OAuth Provider Settings
OAUTH_PROVIDER_CLIENT_ID=your-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-client-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3000/oauth/callback

# Third-party OAuth Settings (example: External)
OAUTH_CONSUMER_CLIENT_ID=example-client-id
OAUTH_CONSUMER_CLIENT_SECRET=example-client-secret
OAUTH_CONSUMER_REDIRECT_URI=http://localhost:3000/api/v1/auth/callback
```

### Programmatic Configuration

```typescript
import { AuthenticationConfigResolver } from '@beyondbetter/bb-mcp-server';

const authConfig = {
  enabled: true,
  requireAuthentication: true,
  
  transport: {
    http: {
      enabled: true,
      requireAuthentication: true,
    },
    stdio: {
      enabled: false, // Follow MCP spec recommendation
      allowOAuth: false,
    },
  },
  
  sessionBinding: {
    enabled: true,
    enableAutoRefresh: true,
    validationTimeoutMs: 5000,
  },
  
  errorHandling: {
    includeDetails: true,
    includeGuidance: true,
    useCustomHeaders: false, // Follow MCP spec
  },
};

// Resolve configuration for specific transport
const resolver = new AuthenticationConfigResolver(logger);
const httpAuthConfig = resolver.resolveForTransport('http', authConfig, dependencies);
```

## Authentication Flow

### 1. Initial Request Without Authentication

When a client makes a request without authentication, the server returns a 401 response with OAuth challenge information:

```http
POST /mcp HTTP/1.1
Host: your-server.com
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { ... }
}
```

**Server Response:**

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
WWW-Authenticate: Bearer realm="mcp-server", authorization_uri="http://your-server.com/authorize", registration_uri="http://your-server.com/register", error="invalid_request", error_description="Missing Authorization header"

{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Unauthorized",
    "details": "Missing Authorization header",
    "guidance": "Authentication required. Register client at /register, then authorize at /authorize",
    "oauth": {
      "authorizationUri": "http://your-server.com/authorize",
      "registrationUri": "http://your-server.com/register",
      "realm": "mcp-server"
    }
  },
  "id": null
}
```

### 2. Client Registration

Before authorizing, clients must register with the OAuth provider:

```http
POST /register HTTP/1.1
Host: your-server.com
Content-Type: application/json

{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:3000/oauth/callback"]
}
```

**Response:**

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "client_id": "mcp_abc123...",
  "client_secret_expires_at": 0,
  "redirect_uris": ["http://localhost:3000/oauth/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "code_challenge_methods_supported": ["S256"]
}
```

### 3. OAuth Authorization Flow

Client redirects user to authorization endpoint:

```
http://your-server.com/authorize?
  client_id=mcp_abc123...
  &redirect_uri=http://localhost:3000/oauth/callback
  &response_type=code
  &state=random_state
  &code_challenge=challenge_hash
  &code_challenge_method=S256
```

After user authorization, server redirects back with authorization code:

```
http://localhost:3000/oauth/callback?
  code=auth_code_xyz...
  &state=random_state
```

### 4. Token Exchange

Client exchanges authorization code for access token:

```http
POST /token HTTP/1.1
Host: your-server.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=auth_code_xyz...
&redirect_uri=http://localhost:3000/oauth/callback
&client_id=mcp_abc123...
&code_verifier=verifier_string
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "mcp_token_abc123...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "mcp_refresh_xyz...",
  "scope": "read write"
}
```

### 5. Authenticated MCP Request

```http
POST /mcp HTTP/1.1
Host: your-server.com
Authorization: Bearer mcp_token_abc123...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { ... }
}
```

### 2. Authentication Process

1. **Extract Bearer Token**: Get MCP access token from Authorization header
2. **Validate MCP Token**: Check token validity with OAuth Provider
3. **Session Binding** (if enabled): Validate third-party token status
4. **Auto Refresh** (if needed): Refresh expired third-party tokens
5. **Create Auth Context**: Prepare authentication context for request
6. **Execute Request**: Process MCP request within authenticated context

### 3. Authentication Success

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "result": { ... },
  "id": 1
}
```

### 4. Authentication Failure

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
WWW-Authenticate: Bearer realm="mcp-server", authorization_uri="http://localhost:3000/authorize", registration_uri="http://localhost:3000/register", error="invalid_token", error_description="MCP access token expired"

{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Unauthorized",
    "details": "MCP access token expired",
    "errorCode": "mcp_token_expired",
    "actionTaken": "token_validation_failed",
    "guidance": "MCP access token expired. Refresh MCP token using refresh_token grant.",
    "timestamp": "2025-09-30T01:00:00.000Z",
    "oauth": {
      "authorizationUri": "http://localhost:3000/authorize",
      "registrationUri": "http://localhost:3000/register",
      "realm": "mcp-server"
    }
  },
  "id": null
}
```

## Endpoint Authentication

### Always Authenticated
- `POST /mcp` - MCP requests
- `GET /mcp` - SSE streams
- `DELETE /mcp` - Session termination

### Never Authenticated (Open Endpoints)
- `GET /status` - Health checks
- `GET /health` - Health status
- `GET /.well-known/oauth-authorization-server` - OAuth metadata
- `POST /authorize` - OAuth authorization endpoint
- `POST /token` - OAuth token endpoint
- `POST /register` - OAuth client registration

### Conditional Authentication
- Other endpoints based on `requireAuthentication` configuration

## Error Handling

### Error Codes

| Error Code | HTTP Status | Description | Client Action |
|------------|-------------|-------------|---------------|
| `mcp_token_expired` | 401 | MCP access token expired | Refresh MCP token |
| `third_party_reauth_required` | 403 | Third-party token expired, refresh failed | User re-authentication required |
| `example_reauth_required` | 403 | External token expired, refresh failed | User re-authentication required |

### Error Response Format

```typescript
interface AuthError {
  error: {
    code: number;           // JSON-RPC error code
    message: string;        // Human-readable message
    details?: string;       // Detailed error information
    errorCode?: string;     // Machine-readable error code
    actionTaken?: string;   // Action taken during authentication
    guidance?: string;      // Client guidance
    timestamp: string;      // ISO timestamp
  };
}
```

### Client Error Handling

```typescript
// Example client error handling
async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  try {
    return await mcpClient.request(request);
  } catch (error) {
    if (error.status === 401 && error.errorCode === 'mcp_token_expired') {
      // Refresh MCP token and retry
      await mcpClient.refreshToken();
      return await mcpClient.request(request);
    } else if (error.status === 403 && error.errorCode === 'third_party_reauth_required') {
      // User re-authentication required
      await promptUserForReauth();
      throw error;
    } else {
      // Other authentication error
      throw error;
    }
  }
}
```

## Session Binding

Session binding links MCP tokens to third-party tokens, ensuring that MCP requests are only valid when the underlying third-party authentication is still valid.

### Benefits

- **Security**: Prevents use of MCP tokens after third-party tokens expire
- **Automatic Refresh**: Seamlessly refreshes third-party tokens when possible
- **User Experience**: Reduces authentication friction

### Implementation

```typescript
// OAuth Provider validates both MCP and third-party tokens
class OAuthProvider {
  async authorizeMCPRequest(
    bearerToken: string,
    thirdPartyAuthService: OAuthConsumer,
    thirdPartyApiClient?: any
  ): Promise<MCPAuthContext> {
    // 1. Validate MCP token
    const mcpValidation = await this.validateAccessToken(token);
    if (!mcpValidation.valid) {
      return { authorized: false, error: 'Invalid MCP token' };
    }
    
    // 2. Check third-party token status
    const isThirdPartyValid = await thirdPartyAuthService.isUserAuthenticated(userId);
    if (!isThirdPartyValid) {
      // 3. Attempt automatic refresh
      if (thirdPartyApiClient) {
        const refreshResult = await this.refreshThirdPartyToken(userId, thirdPartyApiClient);
        if (refreshResult.success) {
          return { authorized: true, actionTaken: 'third_party_token_refreshed' };
        }
      }
      
      // 4. Refresh failed - require user re-authentication
      return {
        authorized: false,
        error: 'Third-party authentication expired',
        errorCode: 'third_party_reauth_required'
      };
    }
    
    return { authorized: true };
  }
}
```

## Testing

### Unit Tests

```typescript
import { AuthenticationMiddleware } from '@beyondbetter/bb-mcp-server';

describe('AuthenticationMiddleware', () => {
  it('should authenticate valid MCP token', async () => {
    const middleware = new AuthenticationMiddleware(config, dependencies);
    const request = new Request('http://localhost/mcp', {
      headers: { 'Authorization': 'Bearer valid_token' }
    });
    
    const result = await middleware.authenticateRequest(request, 'test-123');
    
    expect(result.authenticated).toBe(true);
    expect(result.clientId).toBeDefined();
    expect(result.userId).toBeDefined();
  });
  
  it('should handle expired third-party token with auto-refresh', async () => {
    // Mock expired third-party token
    mockOAuthConsumer.isUserAuthenticated.mockResolvedValue(false);
    mockThirdPartyApiClient.refreshAccessToken.mockResolvedValue(newTokens);
    
    const result = await middleware.authenticateRequest(request, 'test-123');
    
    expect(result.authenticated).toBe(true);
    expect(result.actionTaken).toBe('third_party_token_refreshed');
  });
});
```

### Integration Tests

```typescript
describe('MCP Server Authentication Integration', () => {
  it('should handle complete OAuth flow', async () => {
    // 1. Client registers with OAuth provider
    const clientRegistration = await registerOAuthClient();
    
    // 2. User authorizes via browser
    const authCode = await simulateUserAuthorization();
    
    // 3. Client exchanges code for tokens
    const tokens = await exchangeCodeForTokens(authCode);
    
    // 4. Client makes authenticated MCP request
    const response = await makeAuthenticatedMCPRequest(tokens.access_token);
    
    expect(response.status).toBe(200);
  });
});
```

## Troubleshooting

### Common Issues

#### 1. "OAuth provider required when authentication is enabled"

**Cause**: Authentication is enabled but no OAuth provider is configured.

**Solution**:
```typescript
const oauthProvider = new OAuthProvider({
  issuer: 'https://your-server.com',
  // ... required configuration
});

const server = new BeyondMcpServer({
  dependencies: {
    oauthProvider, // Add OAuth provider
    // ... other dependencies
  }
});
```

#### 2. "Authorization header missing token"

**Cause**: MCP client is not sending proper Authorization header.

**Solution**: Ensure MCP client sends `Authorization: Bearer <token>` header:
```typescript
const response = await fetch('/mcp', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(mcpRequest),
});
```

#### 3. "Third-party authentication expired and refresh failed"

**Cause**: Third-party token expired and automatic refresh failed.

**Solution**: Implement user re-authentication flow:
```typescript
if (error.errorCode === 'third_party_reauth_required') {
  // Redirect user to re-authenticate with third-party provider
  window.location.href = '/auth/reauthorize';
}
```

#### 4. STDIO Transport OAuth Warning

**Cause**: OAuth is enabled for STDIO transport (discouraged by MCP spec).

**Solution**: Use environment-based credentials for STDIO:
```typescript
if (transportType === 'stdio') {
  // Use environment variables instead of OAuth
  const apiKey = process.env.API_KEY;
  // ... authenticate using environment credentials
}
```

### Debug Logging

```typescript
// Enable debug logging
const logger = new Logger({ level: 'debug' });

const middleware = new AuthenticationMiddleware(config, {
  ...dependencies,
  logger,
});

// Logs will include:
// - Token validation attempts
// - Session binding status
// - Third-party token refresh attempts
// - Error details and recovery actions
```

### Health Checks

```typescript
// Check authentication system health
GET /status

// Response includes authentication status
{
  "status": "healthy",
  "authentication": {
    "enabled": true,
    "oauthProvider": "available",
    "oauthConsumer": "available",
    "sessionBinding": "enabled",
    "autoRefresh": "enabled"
  }
}
```

## Migration from Legacy

If migrating from the legacy authentication system:

### 1. Component Mapping

| Legacy | Library | Purpose |
|--------|---------|----------|
| `oauthClientService` | `OAuthProvider` | MCP token validation |
| `authService` | `OAuthConsumer` | Third-party authentication |
| `MCPRequestHandler.authenticateRequest` | `AuthenticationMiddleware` | Request authentication |

### 2. Configuration Migration

```typescript
// Legacy configuration
const legacyConfig = {
  oauthClientService: new OAuthClientService(config, kv),
  authService: new AuthenticationService(config, kv),
};

// Library configuration
const libraryConfig = {
  oauthProvider: new OAuthProvider(config, dependencies),
  oauthConsumer: new ExternalOAuthConsumer(config, logger),
};
```

### 3. Session Binding Migration

```typescript
// Legacy session binding
await oauthClientService.authorizeMCPRequest(
  authHeader,
  authService,
  actionStepApiClient
);

// Library session binding
await oauthProvider.authorizeMCPRequest(
  authHeader,
  oauthConsumer,
  thirdPartyApiClient
);
```

## Best Practices

### 1. Security

- Always use HTTPS in production
- Implement proper token rotation
- Use secure token storage
- Validate all OAuth flows
- Monitor authentication failures

### 2. Error Handling

- Provide clear error messages
- Include client guidance
- Log security events
- Implement proper retry logic
- Handle network timeouts

### 3. Performance

- Cache token validations
- Use connection pooling
- Monitor authentication latency
- Implement circuit breakers
- Use async token refresh

### 4. Monitoring

- Track authentication success/failure rates
- Monitor token refresh frequency
- Alert on security anomalies
- Log third-party API health
- Track session binding performance

## API Reference

For detailed API documentation, see:

- [OAuthProvider API](./api/oauth-provider.md)
- [OAuthConsumer API](./api/oauth-consumer.md)
- [AuthenticationMiddleware API](./api/authentication-middleware.md)
- [Authentication Configuration API](./api/authentication-config.md)