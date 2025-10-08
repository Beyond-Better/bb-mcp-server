# HTTP Server Guide

The bb-mcp-server library provides a complete HTTP server implementation with OAuth authentication, API endpoints, CORS handling, and MCP protocol support. This guide covers HTTP transport configuration and usage.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Transport Types](#transport-types)
- [HTTP Configuration](#http-configuration)
- [OAuth Integration](#oauth-integration)
- [API Endpoints](#api-endpoints)
- [CORS Configuration](#cors-configuration)
- [Security](#security)
- [Development vs Production](#development-vs-production)
- [Troubleshooting](#troubleshooting)

## Overview

The HTTP server provides:

- **Dual Transport**: STDIO for CLI clients, HTTP for web clients
- **OAuth 2.0**: Full OAuth provider implementation
- **RESTful API**: Versioned API endpoints (/api/v1/)
- **MCP Protocol**: MCP endpoint at /mcp
- **CORS Support**: Configurable cross-origin resource sharing
- **Session Management**: HTTP session handling with persistence
- **Error Handling**: Standardized error responses
- **Metrics**: Built-in status and metrics endpoints

## Quick Start

### Basic HTTP Server

```typescript
import { AppServer } from '@beyondbetter/bb-mcp-server';

const server = await AppServer.create(async ({ configManager }) => {
  return {
    serverConfig: {
      name: 'my-mcp-server',
      version: '1.0.0',
      description: 'My MCP Server',
    },
  };
});

await server.start();
console.log('Server running at http://localhost:3000');
```

### Environment Configuration

```bash
# Enable HTTP transport
MCP_TRANSPORT=http

# Configure port and host
HTTP_PORT=3000
HTTP_HOST=localhost

# Enable CORS
HTTP_CORS_ENABLED=true
HTTP_CORS_ORIGINS=*
```

## Transport Types

The library supports two transport mechanisms:

### STDIO Transport

**Best for:**
- Command-line tools
- Desktop applications (Claude Desktop, etc.)
- Single-user scenarios
- Local development

**Configuration:**
```bash
MCP_TRANSPORT=stdio
```

**Characteristics:**
- No network required
- Simple authentication
- Direct stdin/stdout communication
- Single client at a time

### HTTP Transport

**Best for:**
- Web applications
- Multi-user scenarios
- Remote access
- API integrations
- Production deployments

**Configuration:**
```bash
MCP_TRANSPORT=http
HTTP_PORT=3000
HTTP_HOST=0.0.0.0  # Listen on all interfaces
```

**Characteristics:**
- Network-based
- OAuth authentication
- Multiple concurrent clients
- RESTful API access
- Session management

## HTTP Configuration

### Server Settings

```bash
# Transport type
MCP_TRANSPORT=http

# Server binding
HTTP_PORT=3000
HTTP_HOST=localhost  # Use 0.0.0.0 for external access

# Server identity
SERVER_NAME=my-mcp-server
SERVER_VERSION=1.0.0
ENVIRONMENT=production
```

### Session Configuration

```bash
# Session timeout (milliseconds)
MCP_SESSION_TIMEOUT=1800000  # 30 minutes

# Session cleanup interval
MCP_SESSION_CLEANUP_INTERVAL=300000  # 5 minutes

# Maximum concurrent sessions
MCP_MAX_CONCURRENT_SESSIONS=1000

# Enable session persistence
MCP_SESSION_PERSISTENCE_ENABLED=true

# Enable session restore after restart
MCP_SESSION_RESTORE_ENABLED=true
```

### Request Settings

```bash
# Request timeout
MCP_REQUEST_TIMEOUT=30000  # 30 seconds

# Maximum request size
MCP_MAX_REQUEST_SIZE=1048576  # 1MB
```

## OAuth Integration

### OAuth Provider Setup

The HTTP server includes a built-in OAuth 2.0 provider:

```bash
# OAuth Provider Configuration
OAUTH_PROVIDER_CLIENT_ID=your-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3000/oauth/callback
OAUTH_PROVIDER_ISSUER=http://localhost:3000

# Token expiration (milliseconds)
OAUTH_PROVIDER_TOKEN_EXPIRATION=3600000  # 1 hour
OAUTH_PROVIDER_REFRESH_TOKEN_EXPIRATION=2592000000  # 30 days

# PKCE settings
OAUTH_PROVIDER_PKCE=true
```

### OAuth Endpoints

**Authorization:**
```
GET /authorize
  ?response_type=code
  &client_id={client_id}
  &redirect_uri={redirect_uri}
  &state={state}
  &code_challenge={challenge}
  &code_challenge_method=S256
```

**Token Exchange:**
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={code}
&redirect_uri={redirect_uri}
&client_id={client_id}
&code_verifier={verifier}
```

**Token Refresh:**
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={refresh_token}
&client_id={client_id}
```

### Client Registration

```
POST /register
Content-Type: application/json

{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:3503/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

### OAuth Metadata

```
GET /.well-known/oauth-authorization-server
```

Returns OAuth 2.0 Authorization Server Metadata.

## API Endpoints

The HTTP server provides versioned API endpoints:

### Root Endpoint

```
GET /
```

Returns server information including available endpoints.

### API Root

```
GET /api/v1/
```

Returns API version information and available resources.

### Status Endpoints

**Server Status:**
```
GET /api/v1/status
```

Returns overall server status including workflows, sessions, and health.

**Health Check:**
```
GET /api/v1/status/health
```

Detailed health check for monitoring systems.

**Legacy Health:**
```
GET /health
```

Simple health check for backward compatibility.

### Metrics Endpoints

**All Metrics:**
```
GET /api/v1/metrics
```

**Auth Metrics:**
```
GET /api/v1/metrics/auth
```

**Workflow Metrics:**
```
GET /api/v1/metrics/workflows
```

**Performance Metrics:**
```
GET /api/v1/metrics/performance
```

### Workflow Endpoints

**List Workflows:**
```
GET /api/v1/workflows
```

**Workflow Details:**
```
GET /api/v1/workflows/{workflow_name}
```

### MCP Endpoint

**MCP Protocol:**
```
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

## CORS Configuration

### Basic CORS

```bash
# Enable CORS
HTTP_CORS_ENABLED=true

# Allow all origins (development only)
HTTP_CORS_ORIGINS=*

# Specific origins (production)
HTTP_CORS_ORIGINS=https://app.example.com,https://admin.example.com

# Allowed methods
HTTP_CORS_METHODS=GET,POST,PUT,DELETE

# Allowed headers
HTTP_CORS_HEADERS=Content-Type,Authorization
```

### Programmatic Configuration

```typescript
const server = await AppServer.create(async ({ configManager }) => {
  return {
    httpServerConfig: {
      hostname: 'localhost',
      port: 3000,
      name: 'my-server',
      version: '1.0.0',
      cors: {
        allowOrigins: ['https://app.example.com'],
      },
      api: {
        version: 'v1',
        basePath: '/api/v1',
      },
    },
  };
});
```

## Security

### OAuth Security

**Always use HTTPS in production:**
```bash
# Require HTTPS for OAuth
OAUTH_PROVIDER_REQUIRE_HTTPS=true
```

**Strong client credentials:**
```bash
# Use strong, randomly generated secrets
OAUTH_PROVIDER_CLIENT_SECRET=$(openssl rand -hex 32)
```

**Enable PKCE:**
```bash
# Proof Key for Code Exchange
OAUTH_PROVIDER_PKCE=true
```

### HTTP Security Headers

The server includes security headers by default:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- CORS headers when configured

### Authentication

**HTTP Transport Authentication:**
```bash
# Enable authentication for HTTP
MCP_AUTH_HTTP_ENABLED=true
MCP_AUTH_HTTP_REQUIRE=true

# Skip authentication (development only)
MCP_AUTH_HTTP_SKIP=false
```

### Insecure Mode (Development Only)

```bash
# Allow HTTP without OAuth (DANGEROUS - dev only)
HTTP_ALLOW_INSECURE=true
```

⚠️ **WARNING**: Never use insecure mode in production!

## Development vs Production

### Development Configuration

```bash
# .env.development
MCP_TRANSPORT=http
HTTP_PORT=3000
HTTP_HOST=localhost
HTTP_CORS_ENABLED=true
HTTP_CORS_ORIGINS=*
HTTP_ALLOW_INSECURE=true  # For testing without OAuth
ENVIRONMENT=development
LOG_LEVEL=debug
```

### Production Configuration

```bash
# .env.production
MCP_TRANSPORT=http
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
HTTP_CORS_ENABLED=true
HTTP_CORS_ORIGINS=https://app.example.com
OAUTH_PROVIDER_REQUIRE_HTTPS=true
OAUTH_PROVIDER_CLIENT_ID=prod-client-id
OAUTH_PROVIDER_CLIENT_SECRET=prod-secret-very-long-and-random
ENVIRONMENT=production
LOG_LEVEL=info
```

### Reverse Proxy Setup

**nginx:**
```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Server Won't Start

**Check port availability:**
```bash
# macOS/Linux
lsof -i :3000

# Windows
netstat -ano | findstr :3000
```

**Check logs:**
```bash
LOG_LEVEL=debug deno run --allow-all main.ts
```

### OAuth Errors

**"Missing OAuth provider configuration":**
```bash
# Set required OAuth variables
OAUTH_PROVIDER_CLIENT_ID=your-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-secret
```

Or allow insecure mode for development:
```bash
HTTP_ALLOW_INSECURE=true
```

**"Invalid redirect_uri":**

Ensure redirect URI is in allowed list:
```bash
HTTP_ALLOWED_HOSTS=localhost,127.0.0.1,app.example.com
```

### CORS Issues

**"CORS policy blocked":**

Add origin to allowed list:
```bash
HTTP_CORS_ORIGINS=http://localhost:3000,https://app.example.com
```

**Preflight requests failing:**

Ensure CORS is enabled:
```bash
HTTP_CORS_ENABLED=true
HTTP_CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
```

### Connection Refused

**Server not accessible externally:**

Change host binding:
```bash
# Instead of
HTTP_HOST=localhost

# Use
HTTP_HOST=0.0.0.0
```

**Firewall blocking:**
```bash
# macOS
sudo pfctl -d  # Disable firewall temporarily

# Linux
sudo ufw allow 3000
```

### Session Issues

**"Session expired":**

Increase session timeout:
```bash
MCP_SESSION_TIMEOUT=3600000  # 1 hour
```

**Too many sessions:**

Increase limit or decrease cleanup interval:
```bash
MCP_MAX_CONCURRENT_SESSIONS=5000
MCP_SESSION_CLEANUP_INTERVAL=60000  # 1 minute
```

### Performance Issues

**High memory usage:**

Adjust session settings:
```bash
MCP_SESSION_PERSISTENCE_ENABLED=false  # Disable persistence
MCP_MAX_CONCURRENT_SESSIONS=500  # Reduce limit
MCP_SESSION_TIMEOUT=900000  # 15 minutes
```

**Slow responses:**

Increase timeouts:
```bash
MCP_REQUEST_TIMEOUT=60000  # 1 minute
```

Check metrics:
```bash
curl http://localhost:3000/api/v1/metrics/performance
```

## Advanced Topics

### Custom HTTP Server Configuration

```typescript
import { AppServer, type HttpServerConfig } from '@beyondbetter/bb-mcp-server';

const customHttpConfig: HttpServerConfig = {
  hostname: '0.0.0.0',
  port: 8080,
  name: 'Custom MCP Server',
  version: '2.0.0',
  environment: 'staging',
  cors: {
    allowOrigins: [
      'https://app.example.com',
      'https://staging.example.com',
    ],
  },
  api: {
    version: 'v2',
    basePath: '/api/v2',
  },
};

const server = await AppServer.create(async () => {
  return {
    httpServerConfig: customHttpConfig,
  };
});
```

### Monitoring and Metrics

```typescript
// Get server metrics programmatically
const status = server.getStatus();
console.log('Server uptime:', status.uptime);
console.log('Transport:', status.transport);

// Health check endpoint for monitoring
setInterval(async () => {
  const response = await fetch('http://localhost:3000/api/v1/status/health');
  const health = await response.json();
  if (health.status !== 'healthy') {
    console.error('Health check failed:', health);
  }
}, 60000); // Check every minute
```

### Load Balancing

For high-availability deployments:

```bash
# Run multiple instances
HTTP_PORT=3001 deno run --allow-all main.ts &
HTTP_PORT=3002 deno run --allow-all main.ts &
HTTP_PORT=3003 deno run --allow-all main.ts &
```

Use nginx for load balancing:
```nginx
upstream mcp_servers {
    least_conn;
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

server {
    listen 443 ssl;
    location / {
        proxy_pass http://mcp_servers;
    }
}
```

## See Also

- ~~[OAuth Integration Guide](./OAUTH-INTEGRATION-GUIDE.md) - Detailed OAuth setup~~
- [Documentation Endpoint Guide](./docs-endpoint-guide.md) - Serving documentation
- [Plugins (Tools/Workflows) Development Guide](./plugins-tools-workflows.md) - Creating plugins for tools/workflows
- [Security Best Practices](./security-guide.md) - Production security

## Quick Reference

### Essential Environment Variables

```bash
# Transport
MCP_TRANSPORT=http                    # http or stdio
HTTP_PORT=3000                         # Server port
HTTP_HOST=localhost                    # Server host

# OAuth
OAUTH_PROVIDER_CLIENT_ID=client-id
OAUTH_PROVIDER_CLIENT_SECRET=secret

# CORS
HTTP_CORS_ENABLED=true
HTTP_CORS_ORIGINS=*

# Security
HTTP_ALLOW_INSECURE=false             # Only for dev!

# Sessions
MCP_SESSION_TIMEOUT=1800000
MCP_MAX_CONCURRENT_SESSIONS=1000

# Logging
LOG_LEVEL=info
ENVIRONMENT=production
```

### Common Endpoints

```
/                              - Server info
/health                        - Health check
/api/v1/status                 - Full status
/api/v1/workflows              - List workflows
/api/v1/metrics                - Server metrics
/mcp                           - MCP protocol
/authorize                     - OAuth authorization
/token                         - OAuth token
/.well-known/oauth-*           - OAuth metadata
```
