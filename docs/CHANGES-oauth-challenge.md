# OAuth Challenge Implementation - Change Summary

## Overview

Implemented OAuth 2.0 challenge response mechanism in the authentication middleware to automatically provide OAuth flow initiation information when authentication is missing or fails.

## Changes Made

### 1. Authentication Middleware Enhancements

**File:** `src/lib/transport/AuthenticationMiddleware.ts`

#### Added OAuth Challenge Support

- Added `oauthChallenge` field to `AuthenticationResult` interface
- Created `getOAuthChallenge()` method to retrieve OAuth metadata from provider
- Created `buildWWWAuthenticateHeader()` method for RFC 6750-compliant headers
- Added `mapErrorCodeToOAuthError()` to map internal error codes to OAuth codes
- Modified all authentication failure paths to include OAuth challenge
- Fixed registration URI to use full URL instead of relative path

**Key Changes:**
```typescript
// Build full URL for registration endpoint
if (metadata.registration_endpoint) {
  registrationUri = metadata.registration_endpoint;
} else if (metadata.issuer) {
  registrationUri = `${metadata.issuer}/register`;
}
```

### 2. HTTP Transport Enhancements

**File:** `src/lib/transport/HttpTransport.ts`

- Modified `createEnhancedErrorResponse()` to accept `oauthChallenge` parameter
- Added WWW-Authenticate header to 401 responses
- Included OAuth endpoint URLs in response body
- Added debug logging for OAuth challenge details

**Example Response:**
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp-server", authorization_uri="http://localhost:3001/authorize", registration_uri="http://localhost:3001/register"

{
  "error": {
    "oauth": {
      "authorizationUri": "http://localhost:3001/authorize",
      "registrationUri": "http://localhost:3001/register"
    }
  }
}
```

### 3. CORS Configuration Updates

**File:** `src/lib/server/CORSHandler.ts`

#### Added MCP Headers Support

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

**Why:** MCP Inspector requires `MCP-Protocol-Version` header and needs to read `WWW-Authenticate` for OAuth flow initiation.

### 4. Documentation Updates

**Files:**
- `docs/authentication.md` - Added OAuth flow examples
- `docs/oauth-challenge-implementation.md` - Implementation details
- `docs/CHANGES-oauth-challenge.md` - This change summary

## Bug Fixes

### Bug 1: CORS Header Blocking MCP Inspector

**Error:**
```
Request header field MCP-Protocol-Version is not allowed by Access-Control-Allow-Headers.
```

**Cause:** MCP Inspector sends `MCP-Protocol-Version` header, but it wasn't in the allowed headers list.

**Fix:** Added `MCP-Protocol-Version` to `CORSHandler.DEFAULT_CONFIG.allowHeaders`

**Impact:** MCP Inspector can now connect without CORS errors.

### Bug 2: Relative Registration URI

**Error:**
```json
"registrationUri": "/register"  // Missing host and protocol
```

**Cause:** `getOAuthChallenge()` was using relative paths when metadata didn't include `registration_endpoint`.

**Fix:** Build full URL from issuer when `registration_endpoint` not available:
```typescript
registrationUri = `${metadata.issuer}/register`;
```

**Impact:** Clients can now properly navigate to the registration endpoint.

### Bug 3: WWW-Authenticate Header Not Exposed

**Error:**
```
Fetch API cannot load http://localhost:3001/.well-known/oauth-protected-resource due to access control checks.
```

**Cause:** `WWW-Authenticate` header wasn't in the CORS exposed headers list, so browsers couldn't read it.

**Fix:** Added `WWW-Authenticate` to `CORSHandler.DEFAULT_CONFIG.exposeHeaders`

**Impact:** Browser-based clients can now read the OAuth challenge information.

## Testing

### Test with MCP Inspector

1. Start your MCP server:
```bash
cd actionstep-mcp-server
deno task start
```

2. Open MCP Inspector in browser

3. Connect to: `http://localhost:3001/mcp`

4. Verify the error response includes:
   - ✅ HTTP 401 status
   - ✅ WWW-Authenticate header with OAuth challenge
   - ✅ Full URLs for authorization and registration endpoints
   - ✅ No CORS errors in browser console

### Expected Behavior

**Initial Request (No Auth):**
```
POST /mcp HTTP/1.1
```

**Server Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate
WWW-Authenticate: Bearer realm="mcp-server", authorization_uri="http://localhost:3001/authorize", registration_uri="http://localhost:3001/register", error="invalid_request", error_description="Missing Authorization header"

{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
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

## Standards Compliance

- ✅ **RFC 6750** (Bearer Token Usage) - WWW-Authenticate header format
- ✅ **RFC 6749** (OAuth 2.0) - Authorization flow structure
- ✅ **RFC 7591** (Dynamic Client Registration) - Registration endpoint
- ✅ **RFC 8414** (Authorization Server Metadata) - Metadata discovery
- ✅ **MCP Specification** - HTTP transport authentication requirements
- ✅ **CORS** - Cross-Origin Resource Sharing for browser clients

## Backward Compatibility

✅ **All existing functionality preserved:**
- Session binding still works
- Automatic token refresh still works
- Error codes and guidance preserved
- No breaking changes to authenticated clients
- Only adds OAuth challenge information to error responses

## Next Steps

For MCP Inspector to complete the OAuth flow:

1. **Client Registration:** POST to `/register` with client details
2. **User Authorization:** Redirect to `/authorize` endpoint
3. **Token Exchange:** POST to `/token` with authorization code
4. **Authenticated Requests:** Include `Authorization: Bearer <token>` header

## Related Issues

This implementation solves:
- ❌ "Missing Authorization header" errors not providing OAuth flow guidance
- ❌ MCP Inspector CORS errors with MCP-Protocol-Version header
- ❌ Relative URIs preventing proper OAuth flow initiation
- ❌ WWW-Authenticate header not accessible to browser clients

## Files Changed

1. `src/lib/transport/AuthenticationMiddleware.ts` - OAuth challenge generation
2. `src/lib/transport/HttpTransport.ts` - WWW-Authenticate header handling
3. `src/lib/server/CORSHandler.ts` - CORS headers for MCP Inspector
4. `docs/authentication.md` - Documentation updates
5. `docs/oauth-challenge-implementation.md` - Implementation details
6. `docs/CHANGES-oauth-challenge.md` - This change summary
