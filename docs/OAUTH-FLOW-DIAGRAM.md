# OAuth Flow Diagrams - Before and After Fix

## 🔴 BEFORE: Failed Flow (Generic Error)

```
┌─────────────┐                                    ┌─────────────┐
│             │                                    │             │
│     MCP     │                                    │     MCP     │
│  Inspector  │                                    │   Server    │
│             │                                    │             │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. POST /mcp (with old access token)           │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  2. 401 Unauthorized (token expired)            │
       │     + OAuth challenge with endpoints            │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  3. GET /.well-known/oauth-authorization-server │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  4. 200 OK (metadata with endpoints)            │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  5. POST /token (refresh_token grant)           │
       │     grant_type=refresh_token                    │
       │     refresh_token=mcp_refresh_VHDx...           │
       │     client_id=mcp_f49649c0...                   │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │                                        ┌─────────┴─────────┐
       │                                        │ TokenManager      │
       │                                        │ - Get refresh     │
       │                                        │   token from KV   │
       │                                        │ - Not found! ❌   │
       │                                        │ - Return error:   │
       │                                        │   "Invalid or     │
       │                                        │    expired..."    │
       │                                        └─────────┬─────────┘
       │                                                  │
       │                                        ┌─────────┴─────────┐
       │                                        │ OAuthProvider     │
       │                                        │ - Throw Error     │
       │                                        └─────────┬─────────┘
       │                                                  │
       │                                        ┌─────────┴─────────┐
       │                                        │ OAuthEndpoints    │
       │                                        │ - Catch ALL       │
       │                                        │   errors          │
       │                                        │ - Return generic: │
       │                                        │   "invalid_       │
       │                                        │    request" ❌    │
       │                                        └─────────┬─────────┘
       │                                                  │
       │  6. 400 Bad Request ❌                          │
       │     {                                           │
       │       "error": "invalid_request",               │
       │       "error_description": "Token request       │
       │                            failed"              │
       │     }                                           │
       │<─────────────────────────────────────────────────┤
       │                                                  │
   ┌───┴───┐                                              │
   │ ❌ MCP │                                              │
   │ Client │                                              │
   │ Can't  │                                              │
   │ Handle │                                              │
   │ Generic│                                              │
   │ Error  │                                              │
   └───────┘                                              │
     │                                                    │
     │  - Doesn't know it should clear cache             │
     │  - Doesn't know it should redirect to /authorize  │
     │  - STUCK! ❌                                       │
     │                                                    │
```

---

## 🟢 AFTER: Successful Flow (Proper Error Codes)

```
┌─────────────┐                                    ┌─────────────┐
│             │                                    │             │
│     MCP     │                                    │     MCP     │
│  Inspector  │                                    │   Server    │
│             │                                    │             │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. POST /mcp (with old access token)           │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  2. 401 Unauthorized (token expired)            │
       │     + OAuth challenge with endpoints            │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  3. GET /.well-known/oauth-authorization-server │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  4. 200 OK (metadata with endpoints)            │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  5. POST /token (refresh_token grant)           │
       │     grant_type=refresh_token                    │
       │     refresh_token=mcp_refresh_VHDx...           │
       │     client_id=mcp_f49649c0...                   │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │                                        ┌─────────┴─────────┐
       │                                        │ TokenManager      │
       │                                        │ - Get refresh     │
       │                                        │   token from KV   │
       │                                        │ - Not found!      │
       │                                        │ - Return error:   │
       │                                        │   "Invalid or     │
       │                                        │    expired        │
       │                                        │    refresh token" │
       │                                        └─────────┬─────────┘
       │                                                  │
       │                                        ┌─────────┴─────────┐
       │                                        │ OAuthProvider     │
       │                                        │ - Throw Error     │
       │                                        │   with message    │
       │                                        └─────────┬─────────┘
       │                                                  │
       │                                        ┌─────────┴─────────┐
       │                                        │ OAuthEndpoints    │
       │                                        │ - Catch error     │
       │                                        │ - Check message   │
       │                                        │ - Map to proper   │
       │                                        │   error code:     │
       │                                        │   "invalid_       │
       │                                        │    grant" ✅      │
       │                                        └─────────┬─────────┘
       │                                                  │
       │  6. 400 Bad Request ✅                          │
       │     {                                           │
       │       "error": "invalid_grant",                 │
       │       "error_description": "Invalid or          │
       │                            expired refresh      │
       │                            token"               │
       │     }                                           │
       │<─────────────────────────────────────────────────┤
       │                                                  │
   ┌───┴───┐                                              │
   │ ✅ MCP │                                              │
   │ Client │                                              │
   │ Detects│                                              │
   │ invalid│                                              │
   │ _grant │                                              │
   └───┬───┘                                              │
       │                                                  │
       │  - Recognizes "invalid_grant" = expired token   │
       │  - Clears cached credentials                    │
       │  - Redirects to fresh OAuth flow                │
       │                                                  │
       │  7. GET /authorize?response_type=code&...       │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  8. 302 Redirect to authorization page          │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  9. User approves (or auto-approved)            │
       │                                                  │
       │  10. GET /callback?code=mcp_auth_...&state=...  │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  11. 302 Redirect back to client with code      │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  12. POST /token (authorization_code grant)     │
       │      grant_type=authorization_code              │
       │      code=mcp_auth_...                          │
       │      redirect_uri=...                           │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  13. 200 OK with fresh tokens ✅                │
       │      {                                          │
       │        "access_token": "mcp_token_...",         │
       │        "refresh_token": "mcp_refresh_...",      │
       │        "token_type": "Bearer",                  │
       │        "expires_in": 3600                       │
       │      }                                          │
       │<─────────────────────────────────────────────────┤
       │                                                  │
   ┌───┴───┐                                              │
   │ 🎉     │                                              │
   │ SUCCESS│                                              │
   │ MCP    │                                              │
   │ Client │                                              │
   │ Stores │                                              │
   │ New    │                                              │
   │ Tokens │                                              │
   └───┬───┘                                              │
       │                                                  │
       │  14. POST /mcp (with new access token)          │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │  15. 200 OK (Connection established!) 🎉        │
       │<─────────────────────────────────────────────────┤
       │                                                  │
```

---

## 📊 Key Differences

### Error Response Comparison

| Aspect | Before (❌ Failed) | After (✅ Fixed) |
|--------|-------------------|------------------|
| **Error Code** | `invalid_request` | `invalid_grant` |
| **Description** | "Token request failed" | "Invalid or expired refresh token" |
| **RFC Compliance** | ❌ Non-compliant | ✅ RFC 6749 compliant |
| **Client Handling** | ❌ Can't determine action | ✅ Knows to re-authorize |
| **Result** | ❌ Stuck in error state | ✅ Triggers fresh OAuth flow |

### OAuth Error Code Mapping

```typescript
// BEFORE
catch (error) {
  return {
    error: 'invalid_request',        // ❌ Always generic
    error_description: 'Token request failed'
  };
}

// AFTER
catch (error) {
  const message = error.message;
  let errorCode = 'invalid_request';
  
  if (message.includes('refresh token')) {
    errorCode = 'invalid_grant';     // ✅ Specific for token issues
  } else if (message.includes('client')) {
    errorCode = 'invalid_client';    // ✅ Specific for client issues
  }
  
  return {
    error: errorCode,
    error_description: message       // ✅ Preserve original message
  };
}
```

---

## 🎯 What the Fix Does

### 1. Server Side (OAuthEndpoints.ts)

**Changed**: Error handling in `handleToken()` method

**Impact**:
- ✅ Maps error messages to proper OAuth error codes
- ✅ Preserves specific error descriptions
- ✅ Enables proper client error handling
- ✅ RFC 6749 compliant responses

### 2. Client Side (MCP Inspector)

**Existing Behavior** (now works correctly):
- Detects `invalid_grant` error code
- Recognizes refresh token is invalid
- Clears cached credentials
- Redirects to authorization endpoint
- Completes fresh OAuth flow

**No Changes Needed**: Standard OAuth client behavior now works as expected!

---

## 🔄 Complete OAuth Flow (Success Path)

```
┌──────────────────────────────────────────────────────────────┐
│                    COMPLETE OAUTH FLOW                       │
└──────────────────────────────────────────────────────────────┘

1. Discovery Phase
   ├─ MCP Inspector fetches /.well-known/oauth-authorization-server
   ├─ Gets authorization_endpoint, token_endpoint, etc.
   └─ ✅ Server returns complete metadata

2. Authorization Phase
   ├─ MCP Inspector redirects to /authorize
   ├─ Server validates client_id and redirect_uri
   ├─ Server generates authorization code
   └─ ✅ Redirects back with code

3. Token Exchange Phase
   ├─ MCP Inspector POSTs to /token with authorization code
   ├─ Server validates code and PKCE challenge
   ├─ Server generates access_token and refresh_token
   └─ ✅ Returns tokens to client

4. API Access Phase
   ├─ MCP Inspector uses access_token for API requests
   ├─ Server validates token on each request
   └─ ✅ Grants access if token is valid

5. Token Refresh Phase (when access_token expires)
   ├─ MCP Inspector POSTs to /token with refresh_token
   ├─ Server validates refresh_token
   ├─ Server generates new access_token and refresh_token
   └─ ✅ Returns new tokens (token rotation)

6. Error Recovery Phase (when refresh_token is invalid)
   ├─ Server returns "invalid_grant" error
   ├─ MCP Inspector detects error code
   ├─ Clears cached credentials
   ├─ Redirects to /authorize for re-authorization
   └─ ✅ Completes fresh OAuth flow
```

---

## 📝 Summary

**Problem**: Generic error code prevented proper OAuth error handling

**Solution**: Map specific error messages to RFC 6749 compliant error codes

**Result**: MCP Inspector can now handle token refresh failures correctly

**Status**: ✅ FIXED - Ready for testing

---

**Related Documentation**:
- Complete Analysis: `docs/OAUTH-CONNECTION-SOLUTION.md`
- Quick Reference: `docs/QUICK-FIX-REFERENCE.md`
- Test Script: `docs/TEST-OAUTH-FIX.sh`
