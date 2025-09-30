# Third-Party Authentication Flow Fix

## 🎯 Problem Summary

When using MCP Inspector with an MCP server that requires third-party authentication (e.g., ActionStep), the initial request would fail with:

```
403 Forbidden
Error: "Third-party authorization expired and refresh failed. User must re-authenticate."
Error Code: "third_party_reauth_required"
```

**Root Cause**: The error occurred even though:
- ✅ MCP authentication was successful (token exchange complete)
- ✅ MCP token was valid
- ❌ No third-party credentials existed yet (new setup)
- ❌ Error message didn't provide OAuth authorization URL

## 🔍 Technical Analysis

### Issue 1: Missing OAuth Consumer in OAuthProvider

**Location**: `src/lib/server/DependencyHelpers.ts:211`

```typescript
// ❌ BEFORE: OAuthProvider created without oauthConsumer
return new OAuthProvider(oauthConfig, {
  logger,
  kvManager,
  credentialStore,
  // Missing: oauthConsumer and thirdPartyApiClient
});
```

**Problem**: `OAuthProvider` couldn't generate third-party OAuth authorization URLs because it didn't have access to the `OAuthConsumer` instance.

### Issue 2: Inadequate Error Handling

**Location**: `src/lib/auth/OAuthProvider.ts:334-351`

```typescript
// ❌ BEFORE: Couldn't distinguish "never authenticated" from "expired"
if (!isThirdPartyValid) {
  // Treated both cases the same way
  return {
    valid: false,
    error: 'Third-party authorization expired and refresh failed...',
    errorCode: 'third_party_reauth_required',
  };
}
```

**Problems**:
1. Couldn't distinguish between "never authenticated" and "expired credentials"
2. Error message was misleading for first-time setup
3. No OAuth authorization URL provided
4. User had no clear path to complete authentication

## ✅ Solution Implementation

### Fix 1: Pass OAuthConsumer to OAuthProvider

**File**: `src/lib/server/DependencyHelpers.ts`

```typescript
// ✅ AFTER: Pass oauthConsumer and thirdPartyApiClient
export function getOAuthProvider(
  configManager: ConfigManager,
  logger: Logger,
  kvManager: KVManager,
  credentialStore: CredentialStore,
  oauthConsumer?: OAuthConsumer,      // NEW
  thirdPartyApiClient?: any,          // NEW
): OAuthProvider | undefined {
  // ...
  return new OAuthProvider(oauthConfig, {
    logger,
    kvManager,
    credentialStore,
    oauthConsumer,        // ✅ Now passed to OAuthProvider
    thirdPartyApiClient,  // ✅ Now passed to OAuthProvider
  });
}
```

### Fix 2: Update OAuthProvider Dependencies

**File**: `src/lib/auth/OAuthProvider.ts`

```typescript
// ✅ Add oauthConsumer and thirdPartyApiClient to dependencies
export interface OAuthProviderDependencies {
  kvManager: KVManager;
  credentialStore: CredentialStore;
  logger: Logger;
  oauthConsumer?: ThirdPartyAuthService;     // ✅ NEW
  thirdPartyApiClient?: ThirdPartyApiClient; // ✅ NEW
}

export class OAuthProvider {
  private oauthConsumer?: ThirdPartyAuthService;     // ✅ NEW
  private thirdPartyApiClient?: ThirdPartyApiClient; // ✅ NEW

  constructor(config: OAuthProviderConfig, dependencies: OAuthProviderDependencies) {
    // ...
    this.oauthConsumer = dependencies.oauthConsumer;           // ✅ NEW
    this.thirdPartyApiClient = dependencies.thirdPartyApiClient; // ✅ NEW
  }
}
```

### Fix 3: Distinguish "Never Authenticated" from "Expired"

**File**: `src/lib/auth/OAuthProvider.ts:validateMCPAccessToken()`

```typescript
// ✅ AFTER: Check if credentials exist before checking validity
if (effectiveAuthService) {
  // First, check if credentials exist at all
  const credentials = await effectiveAuthService.getUserCredentials(userId);
  
  if (!credentials || !credentials.tokens) {
    // ✅ CASE 1: NEVER AUTHENTICATED
    // Generate OAuth authorization URL
    const authFlow = await effectiveAuthService.startAuthorizationFlow(userId);
    
    return {
      valid: false,
      error: `Third-party authentication required. Open this URL: ${authFlow.authorizationUrl}`,
      errorCode: 'third_party_auth_required',  // Different error code!
      authorizationUrl: authFlow.authorizationUrl,
    };
  }
  
  // ✅ CASE 2: CREDENTIALS EXIST - Check if valid or expired
  const isValid = await effectiveAuthService.isUserAuthenticated(userId);
  
  if (!isValid) {
    // Try to refresh tokens
    // If refresh fails, generate new authorization URL
    return {
      valid: false,
      error: `Third-party authorization expired. Open this URL: ${authFlow.authorizationUrl}`,
      errorCode: 'third_party_reauth_required',
      authorizationUrl: authFlow.authorizationUrl,
    };
  }
}
```

## 🔄 Complete Authentication Flow

### First Request (No Third-Party Credentials)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. MCP Inspector → MCP Server                               │
│    POST /mcp                                                │
│    Authorization: Bearer mcp_token_xxx                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. AuthenticationMiddleware                                 │
│    ✅ MCP token valid                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. OAuthProvider.validateMCPAccessToken()                   │
│    ✅ Check: MCP token valid                                │
│    ❌ Check: Third-party credentials? NOT FOUND             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. OAuthConsumer.startAuthorizationFlow()                   │
│    ✅ Generate OAuth URL for ActionStep                     │
│    Returns: https://go.actionstep.com/oauth/authorize?...  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Return 403 with OAuth URL                                │
│    {                                                        │
│      "error": "Third-party authentication required",       │
│      "errorCode": "third_party_auth_required",            │
│      "authorizationUrl": "https://go.actionstep.com/..." │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
```

### User Completes OAuth

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User opens authorization URL in browser                  │
│    https://go.actionstep.com/oauth/authorize?...           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User logs into ActionStep and authorizes                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. ActionStep redirects to callback                         │
│    http://localhost:3001/oauth/callback?code=xxx&state=yyy │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. OAuthConsumer.handleAuthorizationCallback()              │
│    ✅ Exchange code for tokens                              │
│    ✅ Store credentials in CredentialStore                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Browser shows "Authorization Complete"                   │
│    User can now retry their workflow                        │
└─────────────────────────────────────────────────────────────┘
```

### Subsequent Requests (With Valid Credentials)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. MCP Inspector → MCP Server                               │
│    POST /mcp                                                │
│    Authorization: Bearer mcp_token_xxx                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. AuthenticationMiddleware                                 │
│    ✅ MCP token valid                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. OAuthProvider.validateMCPAccessToken()                   │
│    ✅ MCP token valid                                        │
│    ✅ Third-party credentials exist and valid               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Request processing continues                             │
│    Workflow can use ActionStep API                          │
└─────────────────────────────────────────────────────────────┘
```

## 🧪 Testing the Fix

### Test 1: First Request (Should Now Provide OAuth URL)

```bash
# Start your MCP server
cd baxter/actionstep-mcp-server
deno task start

# In MCP Inspector:
# 1. Connect to your server
# 2. Complete MCP OAuth flow (Inspector ↔ MCP Server)
# 3. Send any workflow request

# Expected response:
{
  "error": {
    "code": "third_party_auth_required",
    "message": "Third-party authentication required. Open this URL: https://go.actionstep.com/oauth/authorize?...",
    "details": {
      "authorizationUrl": "https://go.actionstep.com/oauth/authorize?..."
    }
  }
}
```

### Test 2: Complete Third-Party OAuth

```bash
# 1. Copy the authorizationUrl from the error response
# 2. Open it in your browser
# 3. Log into ActionStep
# 4. Authorize the application
# 5. Browser will show "Authorization Complete"
# 6. Credentials are now stored in Deno KV
```

### Test 3: Retry Request (Should Now Succeed)

```bash
# In MCP Inspector:
# Retry the same workflow request

# Expected: ✅ Success with ActionStep data
```

### Test 4: Automatic Token Refresh

```bash
# Wait for tokens to expire (or manually delete access token from KV)
# Send another workflow request

# Expected: 
# - OAuthProvider detects expired token
# - Automatically refreshes using refresh token
# - Request succeeds with refreshed credentials
# - Log shows: "Successfully refreshed third-party token"
```

## 📝 Configuration

Ensure your ActionStep MCP server has these environment variables:

```bash
# MCP Server OAuth Provider (for MCP Inspector)
OAUTH_PROVIDER_CLIENT_ID=your-mcp-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-mcp-client-secret
OAUTH_PROVIDER_REDIRECT_URI=http://localhost:3001/oauth/callback

# ActionStep OAuth Consumer (for third-party API)
ACTIONSTEP_CLIENT_ID=your-actionstep-client-id
ACTIONSTEP_CLIENT_SECRET=your-actionstep-client-secret
ACTIONSTEP_REDIRECT_URI=http://localhost:3001/auth/actionstep/callback
ACTIONSTEP_AUTH_URL=https://go.actionstep.com/oauth/authorize
ACTIONSTEP_TOKEN_URL=https://go.actionstep.com/oauth/token
ACTIONSTEP_API_BASE_URL=https://api.actionstep.com/api/rest
```

## 🎉 Benefits

1. **Clear Error Messages**: Users know exactly what to do
2. **OAuth URL Provided**: No guessing, just click the link
3. **Proper Error Codes**: Different codes for different scenarios
4. **Automatic Token Refresh**: Seamless experience after initial setup
5. **Session Binding**: MCP tokens are bound to third-party credentials

## 🔒 Security Notes

- MCP authentication and third-party authentication are now properly separated
- Third-party credentials are securely stored in Deno KV
- Tokens are automatically refreshed using refresh tokens
- Authorization URLs include state parameter for CSRF protection
- PKCE is supported for enhanced security

## 📚 Related Documentation

- `docs/authentication.md` - Authentication architecture
- `docs/oauth-flows.md` - OAuth flow details
- `src/lib/auth/OAuthProvider.ts` - OAuth provider implementation
- `src/lib/auth/OAuthConsumer.ts` - OAuth consumer base class
