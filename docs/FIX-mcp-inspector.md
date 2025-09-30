# MCP Inspector Connection Fix

## Problem

MCP Inspector was unable to connect to the ActionStep MCP server with these errors:

1. **CORS Error:** `Request header field MCP-Protocol-Version is not allowed by Access-Control-Allow-Headers`
2. **Missing OAuth Metadata:** `Fetch API cannot load http://localhost:3001/.well-known/oauth-protected-resource`
3. **Dynamic Registration:** `Error: Incompatible auth server: does not support dynamic client registration`
4. **Relative URI:** Registration URI returned as `/register` instead of full URL

## Root Causes

### 1. Missing CORS Headers
**Problem:** MCP Inspector sends `MCP-Protocol-Version` header, but it wasn't in allowed headers list.

**Fix:** Added `MCP-Protocol-Version` to `CORSHandler.DEFAULT_CONFIG.allowHeaders`

### 2. OAuth Metadata Endpoint
**Problem:** MCP Inspector looks for `/.well-known/oauth-protected-resource` (RFC 9068) but server only provided `/.well-known/oauth-authorization-server` (RFC 8414).

**Fix:** Added support for both endpoints as aliases.

### 3. Dynamic Client Registration Disabled
**Problem:** Dynamic client registration was disabled by default.

**Fix:** Need to enable via environment variable `OAUTH_ENABLE_DYNAMIC_CLIENT_REG=true`

### 4. Relative Registration URI
**Problem:** OAuth challenge returned `/register` instead of `http://localhost:3001/register`

**Fix:** Modified `getOAuthChallenge()` to build full URL from OAuth provider issuer.

## Solution

### Step 1: Add Environment Variable

Add to `actionstep-mcp-server/.env`:

```bash
# Enable dynamic client registration for MCP Inspector
OAUTH_ENABLE_DYNAMIC_CLIENT_REG=true
```

### Step 2: Restart Server

```bash
cd actionstep-mcp-server
deno task start
```

### Step 3: Verify Metadata

Check that the metadata now includes `registration_endpoint`:

```bash
curl http://localhost:3001/.well-known/oauth-authorization-server
```

Should include:
```json
{
  "issuer": "http://localhost:3001",
  "authorization_endpoint": "http://localhost:3001/authorize",
  "token_endpoint": "http://localhost:3001/token",
  "registration_endpoint": "http://localhost:3001/register",
  "revocation_endpoint": "http://localhost:3001/revoke",
  ...
}
```

### Step 4: Test with MCP Inspector

1. Open MCP Inspector in browser
2. Connect to: `http://localhost:3001/mcp`
3. Verify:
   - ✅ No CORS errors
   - ✅ OAuth challenge with full URLs
   - ✅ Registration endpoint available
   - ✅ MCP Inspector can proceed with OAuth flow

## Changes Made to Library

### 1. CORSHandler.ts

**Before:**
```typescript
allowHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
exposeHeaders: ['Mcp-Session-Id'],
```

**After:**
```typescript
allowHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'MCP-Protocol-Version'],
exposeHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
```

### 2. AuthenticationMiddleware.ts

**Before:**
```typescript
let registrationUri = '/register';
if (metadata.registration_endpoint) {
  registrationUri = metadata.registration_endpoint;
}
```

**After:**
```typescript
let registrationUri = '/register';
if (metadata.registration_endpoint) {
  registrationUri = metadata.registration_endpoint;
} else if (metadata.issuer) {
  registrationUri = `${metadata.issuer}/register`;
}
```

### 3. OAuthEndpoints.ts

**Before:**
```typescript
if (path === 'oauth-authorization-server' && method === 'GET') {
```

**After:**
```typescript
// Support both RFC 8414 and RFC 9068 endpoints
if ((path === 'oauth-authorization-server' || path === 'oauth-protected-resource') && method === 'GET') {
```

## Expected Behavior

### Initial Connection (No Auth)

**Request:**
```
POST /mcp HTTP/1.1
Host: localhost:3001
MCP-Protocol-Version: 2025-03-26
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Access-Control-Allow-Headers: Content-Type, Authorization, mcp-session-id, MCP-Protocol-Version
Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate
WWW-Authenticate: Bearer realm="mcp-server", authorization_uri="http://localhost:3001/authorize", registration_uri="http://localhost:3001/register"

{
  "jsonrpc": "2.0",
  "error": {
    "message": "Unauthorized",
    "details": "Missing Authorization header",
    "oauth": {
      "authorizationUri": "http://localhost:3001/authorize",
      "registrationUri": "http://localhost:3001/register",
      "realm": "mcp-server"
    }
  }
}
```

### OAuth Metadata Request

**Request:**
```
GET /.well-known/oauth-protected-resource HTTP/1.1
Host: localhost:3001
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "issuer": "http://localhost:3001",
  "authorization_endpoint": "http://localhost:3001/authorize",
  "token_endpoint": "http://localhost:3001/token",
  "registration_endpoint": "http://localhost:3001/register",
  "revocation_endpoint": "http://localhost:3001/revoke",
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "response_types_supported": ["code"],
  "scopes_supported": ["read", "write", "admin"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
  "code_challenge_methods_supported": ["S256"]
}
```

## OAuth Flow for MCP Inspector

Once connected, MCP Inspector should:

1. **Register as OAuth Client:**
   ```
   POST /register
   {
     "client_name": "MCP Inspector",
     "redirect_uris": ["http://localhost:6277/oauth/callback"]
   }
   ```

2. **Redirect User to Authorization:**
   ```
   GET /authorize?client_id=<client_id>&redirect_uri=<uri>&response_type=code&state=<state>&code_challenge=<challenge>&code_challenge_method=S256
   ```

3. **Exchange Code for Token:**
   ```
   POST /token
   grant_type=authorization_code&code=<code>&redirect_uri=<uri>&client_id=<client_id>&code_verifier=<verifier>
   ```

4. **Make Authenticated MCP Requests:**
   ```
   POST /mcp
   Authorization: Bearer <access_token>
   ```

## Troubleshooting

### Issue: Still getting "dynamic client registration" error

**Check:**
1. Verify `.env` file has `OAUTH_ENABLE_DYNAMIC_CLIENT_REG=true`
2. Restart the server completely
3. Check metadata endpoint includes `registration_endpoint`

### Issue: CORS errors persist

**Check:**
1. Clear browser cache
2. Check server logs for CORS-related warnings
3. Verify `Access-Control-Allow-Headers` includes `MCP-Protocol-Version`

### Issue: Relative URIs still appearing

**Check:**
1. Verify OAuth provider issuer is set correctly
2. Check logs for OAuth challenge generation
3. Ensure library code changes are deployed

## Related Documentation

- `docs/authentication.md` - OAuth flow documentation
- `docs/oauth-challenge-implementation.md` - Implementation details
- `docs/CHANGES-oauth-challenge.md` - Complete change summary
- `docs/FIX-mcp-inspector.md` - This document

## Standards References

- RFC 6749 - OAuth 2.0 Authorization Framework
- RFC 6750 - Bearer Token Usage
- RFC 7591 - Dynamic Client Registration
- RFC 8414 - Authorization Server Metadata
- RFC 9068 - JWT Profile for OAuth 2.0 Access Tokens (oauth-protected-resource)
- MCP Specification - HTTP Transport Authentication
