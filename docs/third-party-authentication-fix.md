# Third-Party Authentication Fix - Complete Implementation

## 🎯 Problem Summary

The MCP server was failing with `403 Forbidden` errors when MCP clients sent requests, even though:
- ✅ MCP authentication was successful (token exchange complete)
- ✅ MCP access token was valid
- ❌ Third-party credentials (ActionStep) didn't exist yet (new setup)

### Root Cause

The `OAuthProvider.validateMCPAccessToken()` method was treating "never authenticated" the same as "expired credentials", and returning a generic error message without providing the authorization URL needed to complete the OAuth flow.

## ✅ Solution Overview

**Three-part fix:**

1. **OAuthProvider** - Distinguish between "never authenticated" vs "expired" credentials
2. **AuthenticationMiddleware** - Generate third-party OAuth authorization URL when credentials are missing
3. **Error Response** - Include authorization URL in error response for user action

## 📝 Changes Made

### 1. OAuthProvider.validateMCPAccessToken() 

**File:** `src/lib/auth/OAuthProvider.ts`

**Change:** Added logic to check if credentials exist before attempting refresh:

```typescript
if (!isThirdPartyValid) {
  // Get credentials to check if they exist at all vs just expired
  const credentials = await authService.getUserCredentials(tokenValidation.userId!);
  
  if (!credentials || !credentials.tokens) {
    // CASE 1: No credentials exist - user has NEVER authenticated
    return {
      valid: false,
      error: 'Third-party authentication required. Please complete the authorization flow.',
      errorCode: 'third_party_auth_required', // NEW error code
    };
  }

  // CASE 2: Credentials exist but expired - attempt refresh
  // ... existing refresh logic ...
  
  // CASE 3: Refresh failed - user must re-authenticate  
  return {
    valid: false,
    error: 'Third-party authorization expired and refresh failed. User must re-authenticate.',
    errorCode: 'third_party_reauth_required', // Existing error code
  };
}
```

**Key Changes:**
- ✅ Check if credentials exist before attempting refresh
- ✅ Return `third_party_auth_required` for missing credentials (new setup)
- ✅ Return `third_party_reauth_required` for expired credentials that failed refresh
- ✅ Clear error messages for each case

### 2. AuthenticationMiddleware.authenticateRequest()

**File:** `src/lib/transport/AuthenticationMiddleware.ts`

**Change:** Generate third-party authorization URL when credentials are missing:

```typescript
if (!authResult.authorized) {
  // Generate OAuth challenge
  let oauthChallenge = this.getOAuthChallenge(...);

  // If third-party auth required, generate the authorization URL
  if (authResult.errorCode === 'third_party_auth_required' && 
      this.dependencies.oauthConsumer && 
      authResult.userId) {
    
    // Start OAuth flow to get authorization URL
    const authFlow = await this.dependencies.oauthConsumer.startAuthorizationFlow(
      authResult.userId
    );
    
    // Update OAuth challenge with actual third-party authorization URL
    oauthChallenge = {
      realm: 'third-party-api',
      authorizationUri: authFlow.authorizationUrl,
      error: 'third_party_auth_required',
      errorDescription: 'Third-party authentication required',
    };
  }

  return {
    authenticated: false,
    error: authResult.error,
    errorCode: authResult.errorCode,
    oauthChallenge, // Includes authorization URL
  };
}
```

**Key Changes:**
- ✅ Detect `third_party_auth_required` error code
- ✅ Call `oauthConsumer.startAuthorizationFlow()` to generate auth URL
- ✅ Include authorization URL in OAuth challenge
- ✅ Store authorization state for callback handling

### 3. Error Response Enhancement

**File:** `src/lib/transport/HttpTransport.ts` (already implemented)

**Existing Code:** `createEnhancedErrorResponse()` already includes OAuth challenge support:

```typescript
private createEnhancedErrorResponse(
  message: string,
  status: number,
  details?: string,
  errorCode?: string,
  actionTaken?: string,
  guidance?: string,
  oauthChallenge?: { ... },
): Response {
  const error = {
    error: {
      code: -32000,
      message,
      status,
      details,
      errorCode,
      guidance,
      // Include OAuth challenge for flow initiation
      ...(oauthChallenge && {
        oauth: {
          authorizationUri: oauthChallenge.authorizationUri,
          registrationUri: oauthChallenge.registrationUri,
          realm: oauthChallenge.realm,
        },
      }),
    },
  };

  // Add WWW-Authenticate header (RFC 6750)
  if (oauthChallenge) {
    headers['WWW-Authenticate'] = this.authenticationMiddleware
      .buildWWWAuthenticateHeader(oauthChallenge);
  }

  return new Response(JSON.stringify({ jsonrpc: '2.0', error, id: null }), {
    status,
    headers,
  });
}
```

**Key Features:**
- ✅ Includes `oauth.authorizationUri` in response body
- ✅ Adds `WWW-Authenticate` header with OAuth challenge
- ✅ Provides structured error for programmatic handling

## 🔄 Complete Flow

### First Request (No Third-Party Credentials)

```
┌─────────────────────────────────────────────────────────────────┐
│                     MCP INSPECTOR                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 1. Send MCP request with Bearer token
                     │    Authorization: Bearer mcp_token_Mv...
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AUTHENTICATION MIDDLEWARE                      │
├─────────────────────────────────────────────────────────────────┤
│  2. Validate MCP token                                    ✅    │
│  3. Call OAuthProvider.authorizeMCPRequest()                    │
│     with oauthConsumer                                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 4. Check third-party credentials
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OAUTH PROVIDER                             │
├─────────────────────────────────────────────────────────────────┤
│  5. validateMCPAccessToken()                                    │
│     - MCP token valid ✅                                        │
│     - Check: authService.isUserAuthenticated()                  │
│     - Result: false (no credentials)                            │
│                                                                 │
│  6. Check if credentials exist                                  │
│     - Call: authService.getUserCredentials()                    │
│     - Result: null (never authenticated)                        │
│                                                                 │
│  7. Return error:                                               │
│     errorCode: 'third_party_auth_required'                      │
│     error: 'Third-party authentication required...'             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 8. Receive third_party_auth_required
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AUTHENTICATION MIDDLEWARE                      │
├─────────────────────────────────────────────────────────────────┤
│  9. Detect: errorCode === 'third_party_auth_required'           │
│                                                                 │
│  10. Generate authorization URL:                                │
│      - Call: oauthConsumer.startAuthorizationFlow(userId)       │
│      - Returns: { authorizationUrl, state }                     │
│      - Store state for callback validation                      │
│                                                                 │
│  11. Create OAuth challenge:                                    │
│      {                                                          │
│        realm: 'third-party-api',                                │
│        authorizationUri: 'https://go.actionstep.com/oauth/...' │
│      }                                                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 12. Return 403 with OAuth challenge
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       HTTP TRANSPORT                            │
├─────────────────────────────────────────────────────────────────┤
│  13. Create error response:                                     │
│      {                                                          │
│        "jsonrpc": "2.0",                                        │
│        "error": {                                               │
│          "code": -32000,                                        │
│          "message": "Forbidden",                                │
│          "status": 403,                                         │
│          "errorCode": "third_party_auth_required",             │
│          "details": "Third-party authentication required...",   │
│          "oauth": {                                             │
│            "authorizationUri": "https://go.actionstep.com/..." │
│          }                                                      │
│        }                                                        │
│      }                                                          │
│                                                                 │
│  14. Add headers:                                               │
│      WWW-Authenticate: Bearer realm="third-party-api",         │
│        authorization_uri="https://go.actionstep.com/..."        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 15. Return 403 Forbidden with auth URL
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP INSPECTOR                               │
├─────────────────────────────────────────────────────────────────┤
│  16. Receive 403 error with authorization URL                   │
│  17. Display to user:                                           │
│      "ActionStep authentication required"                       │
│      "Open: https://go.actionstep.com/oauth/authorize?..."      │
└─────────────────────────────────────────────────────────────────┘
```

### User Completes OAuth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 1. Opens authorization URL in browser
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIONSTEP OAUTH                             │
├─────────────────────────────────────────────────────────────────┤
│  2. User logs in to ActionStep                                  │
│  3. User authorizes MCP server access                           │
│  4. ActionStep redirects to callback:                           │
│     http://localhost:3001/oauth/callback?code=...&state=...     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 5. Redirect to MCP server callback
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MCP SERVER CALLBACK                           │
├─────────────────────────────────────────────────────────────────┤
│  6. Handle callback:                                            │
│     - Validate state parameter                                  │
│     - Exchange code for tokens                                  │
│     - Store credentials in CredentialStore                      │
│                                                                 │
│  7. Return success page to browser                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 8. Credentials stored ✅
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                          USER                                   │
├─────────────────────────────────────────────────────────────────┤
│  9. Sees: "Authorization Complete"                              │
│  10. Closes browser tab                                         │
│  11. Retries MCP request in Inspector                           │
└─────────────────────────────────────────────────────────────────┘
```

### Subsequent Request (With Valid Credentials)

```
┌─────────────────────────────────────────────────────────────────┐
│                     MCP INSPECTOR                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 1. Retry MCP request
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AUTHENTICATION MIDDLEWARE                      │
├─────────────────────────────────────────────────────────────────┤
│  2. Validate MCP token ✅                                       │
│  3. Check third-party credentials                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OAUTH PROVIDER                             │
├─────────────────────────────────────────────────────────────────┤
│  4. validateMCPAccessToken()                                    │
│     - MCP token valid ✅                                        │
│     - Check: authService.isUserAuthenticated()                  │
│     - Result: true (credentials exist and valid) ✅             │
│                                                                 │
│  5. Return success:                                             │
│     valid: true                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ 6. Request proceeds
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP REQUEST                                │
├─────────────────────────────────────────────────────────────────┤
│  7. Execute workflow/tool                                       │
│  8. Use ActionStep API client with stored credentials          │
│  9. Return results ✅                                           │
└─────────────────────────────────────────────────────────────────┘
```

## 🧪 Testing the Fix

### Test 1: First Request (No Credentials)

```bash
# Start your MCP server
deno task start

# In MCP Inspector:
# 1. Connect to server (completes MCP OAuth)
# 2. Send any request

# Expected Response:
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Forbidden",
    "status": 403,
    "errorCode": "third_party_auth_required",
    "details": "Third-party authentication required. Please complete the authorization flow.",
    "oauth": {
      "authorizationUri": "https://go.actionstep.com/oauth/authorize?client_id=...&redirect_uri=...&scope=...&state=..."
    },
    "guidance": "Third-party authentication expired and refresh failed. Stop retrying and prompt user for browser-based re-authentication."
  }
}
```

### Test 2: Complete OAuth Flow

```bash
# 1. Copy authorizationUri from error response
# 2. Open in browser
# 3. Log in to ActionStep
# 4. Authorize access
# 5. See "Authorization Complete" page

# Expected: Credentials stored in KV storage
```

### Test 3: Subsequent Request (With Credentials)

```bash
# In MCP Inspector:
# Retry the same request

# Expected: Success with workflow/tool results
```

## 📊 Error Code Summary

| Error Code | Scenario | Action Required |
|------------|----------|----------------|
| `third_party_auth_required` | No credentials exist (never authenticated) | User must complete OAuth flow in browser |
| `third_party_reauth_required` | Credentials expired and refresh failed | User must re-authenticate in browser |
| `mcp_token_expired` | MCP access token expired | Client should refresh MCP token using refresh_token grant |

## 🎉 Benefits

1. **Clear Error Messages** - Users know exactly what action to take
2. **Authorization URL Provided** - No guessing where to authenticate
3. **Proper HTTP Status Codes** - 403 for auth required, following HTTP standards
4. **OAuth Standard Headers** - `WWW-Authenticate` header for programmatic handling
5. **Distinguishes Auth States** - Never authenticated vs expired credentials
6. **Automatic Token Refresh** - Expired tokens refreshed automatically when possible
7. **Session Binding** - MCP token validity tied to third-party auth status

## 🔒 Security Considerations

- ✅ State parameter prevents CSRF attacks on OAuth callback
- ✅ Authorization codes are single-use and time-limited
- ✅ Credentials stored securely in CredentialStore
- ✅ Automatic token refresh maintains security without user interruption
- ✅ Clear separation between MCP auth and third-party auth

## 📝 Next Steps for Consumers

When building your own MCP server with third-party OAuth:

1. **Extend OAuthConsumer** for your provider
2. **Implement callback endpoint** in your HTTP server
3. **Pass oauthConsumer to BeyondMcpServer** dependencies
4. **Test the complete flow** from initial request through OAuth callback

## 🐛 Troubleshooting

### Still Getting 403 Errors

**Check:**
1. Is `oauthConsumer` passed to `BeyondMcpServer` dependencies?
2. Is callback endpoint registered in HTTP server?
3. Does redirect URI match exactly between config and OAuth provider?

### Authorization URL Not in Error Response

**Check:**
1. Is `userId` present in auth result?
2. Is `oauthConsumer` available in `AuthenticationMiddleware`?
3. Check server logs for "Generated third-party OAuth challenge" message

### OAuth Callback Fails

**Check:**
1. State parameter validation
2. Authorization code expiry
3. Client ID/secret configuration
4. Redirect URI exact match
