# OAuth Challenge Implementation

## Overview

Implemented OAuth 2.0 challenge response mechanism in the authentication middleware to automatically provide OAuth flow initiation information when authentication is missing or fails. This follows RFC 6750 (Bearer Token Usage) and provides proper guidance to MCP clients on how to start the authorization flow.

## Problem Statement

The original implementation was returning simple 401 errors when authentication was missing, without providing clients information about where to register or authorize.

## Solution

Enhanced the authentication middleware and HTTP transport to include OAuth challenge information in error responses with:

1. WWW-Authenticate header following RFC 6750
2. OAuth endpoint URLs in response body
3. Proper error codes and descriptions

## Implementation Details

### Changes to AuthenticationMiddleware.ts

1. Added oauthChallenge field to AuthenticationResult interface
2. Added getOAuthChallenge() method to retrieve OAuth metadata
3. Added buildWWWAuthenticateHeader() method for RFC 6750 compliance
4. Added mapErrorCodeToOAuthError() to map internal codes to OAuth error codes
5. Modified all authentication failure paths to include OAuth challenge

### Changes to HttpTransport.ts

1. Modified createEnhancedErrorResponse() to accept oauthChallenge parameter
2. Added WWW-Authenticate header when OAuth challenge is present
3. Included oauth object in error response body
4. Added debug logging for OAuth challenge information

## Benefits

1. Standards-compliant OAuth 2.0 challenge responses
2. Clients immediately know where to register and authorize
3. Backward compatible with existing authenticated clients
4. Clear guidance in both headers and response body
5. Maintains all existing security features

## CORS Configuration

The implementation includes proper CORS headers for MCP Inspector and browser-based clients:

### Allowed Headers
- Content-Type
- Authorization
- mcp-session-id
- MCP-Protocol-Version (required for MCP Inspector)

### Exposed Headers
- Mcp-Session-Id
- WWW-Authenticate (required for OAuth challenge)

## Bug Fixes

### Fix 1: MCP-Protocol-Version CORS Header

MCP Inspector was failing with:
```
Request header field MCP-Protocol-Version is not allowed by Access-Control-Allow-Headers.
```

Fixed by adding `MCP-Protocol-Version` to the default allowed headers in `CORSHandler.ts`.

### Fix 2: Registration URI Format

The registration URI was being returned as a relative path `/register` instead of a full URL.

Fixed by building the full URL from the OAuth provider's issuer when `registration_endpoint` is not explicitly set in metadata:
```typescript
if (metadata.registration_endpoint) {
  registrationUri = metadata.registration_endpoint;
} else if (metadata.issuer) {
  registrationUri = `${metadata.issuer}/register`;
}
```

## Testing

Test with MCP Inspector to verify:
1. OAuth challenge is returned when no Authorization header is present
2. CORS headers allow MCP-Protocol-Version
3. Registration URI is a full URL
4. WWW-Authenticate header is exposed
