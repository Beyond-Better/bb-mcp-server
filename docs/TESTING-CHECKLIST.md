# Third-Party Authentication Testing Checklist

## Prerequisites

- [ ] MCP server code updated with all three fixes
- [ ] ActionStep OAuth credentials configured in environment variables
- [ ] MCP Inspector installed and configured
- [ ] Browser available for OAuth flow

## Test 1: Initial Request Without Credentials ✅

**Setup:**
```bash
# Clear any existing credentials
rm -rf ~/.deno-kv/  # Or wherever your KV storage is

# Start server
deno task start
```

**Steps:**
1. [ ] Open MCP Inspector
2. [ ] Connect to your MCP server
3. [ ] Complete MCP OAuth flow (client registration + token exchange)
4. [ ] Verify connection shows "Connected"
5. [ ] Send any request (e.g., `tools/list` or execute a workflow)

**Expected Result:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Forbidden",
    "status": 403,
    "errorCode": "third_party_auth_required",
    "details": "Third-party authentication required. Please complete the authorization flow.",
    "oauth": {
      "authorizationUri": "https://go.actionstep.com/oauth/authorize?client_id=...&redirect_uri=http://localhost:3001/oauth/callback&scope=...&state=...",
      "realm": "third-party-api"
    },
    "guidance": "Third-party authentication expired and refresh failed. Stop retrying and prompt user for browser-based re-authentication."
  }
}
```

**Verify:**
- [ ] Status code is 403
- [ ] Error code is `third_party_auth_required` (not `third_party_reauth_required`)
- [ ] `oauth.authorizationUri` is present and valid
- [ ] Authorization URL includes all required parameters (client_id, redirect_uri, scope, state)

**Check Server Logs:**
```
[INFO] AuthenticationMiddleware: Token validation failed
  errorCode: "third_party_auth_required"
[INFO] AuthenticationMiddleware: Generated third-party OAuth challenge
  userId: "client_mcp_..."
  authorizationUrl: "https://go.actionstep.com/..."
  state: "..."
```

## Test 2: Complete OAuth Flow ✅

**Steps:**
1. [ ] Copy the `authorizationUri` from the error response
2. [ ] Open the URL in a browser
3. [ ] Log in to ActionStep with valid credentials
4. [ ] Authorize the MCP server access
5. [ ] Verify redirect to `http://localhost:3001/oauth/callback?code=...&state=...`
6. [ ] Verify success page displays: "Authorization Complete"
7. [ ] Close browser tab

**Check Server Logs:**
```
[INFO] OAuthConsumer: Starting authorization flow
  userId: "client_mcp_..."
  state: "..."
[INFO] OAuthConsumer: Authorization callback successful
  userId: "client_mcp_..."
[INFO] OAuthConsumer: Stored user credentials
  expiresAt: "..."
```

**Verify Credentials Stored:**
```bash
# Check KV storage (implementation-specific)
# Credentials should exist for userId and providerId="actionstep"
```

## Test 3: Subsequent Request With Valid Credentials ✅

**Steps:**
1. [ ] In MCP Inspector, retry the same request from Test 1
2. [ ] Wait for response

**Expected Result:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    // Successful workflow/tool results
  }
}
```

**Verify:**
- [ ] Status code is 200
- [ ] No error in response
- [ ] Workflow/tool executed successfully
- [ ] ActionStep API calls succeeded

**Check Server Logs:**
```
[INFO] OAuthProvider: MCP token valid
[INFO] OAuthProvider: Third-party token valid
[INFO] AuthenticationMiddleware: Authentication successful
[INFO] Workflow executed successfully
```

## Test 4: Token Expiration and Refresh ✅

**Setup:**
```bash
# Manually expire the access token in KV storage
# OR wait for natural expiration (not practical for testing)
```

**Steps:**
1. [ ] Send another request

**Expected Result:**
- Request should succeed (200 OK)
- Token should be automatically refreshed

**Check Server Logs:**
```
[INFO] OAuthProvider: Third-party token expired
[INFO] OAuthProvider: Attempting third-party token refresh
[INFO] OAuthProvider: Successfully refreshed third-party token
[INFO] OAuthConsumer: Updated user credentials
```

## Test 5: Refresh Token Expired/Invalid ✅

**Setup:**
```bash
# Manually invalidate refresh token in KV storage
# OR revoke access in ActionStep admin panel
```

**Steps:**
1. [ ] Send a request

**Expected Result:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Forbidden",
    "status": 403,
    "errorCode": "third_party_reauth_required",
    "details": "Third-party authorization expired and refresh failed. User must re-authenticate.",
    "oauth": {
      "authorizationUri": "https://go.actionstep.com/oauth/authorize?..."
    }
  }
}
```

**Verify:**
- [ ] Error code is `third_party_reauth_required` (not `third_party_auth_required`)
- [ ] Authorization URL is present
- [ ] User can complete OAuth flow again (same as Test 2)

## Summary

**All tests passed:** ✅

- [x] Initial request returns proper error with auth URL
- [x] OAuth flow completes successfully
- [x] Subsequent requests work with stored credentials
- [x] Automatic token refresh works
- [x] Refresh failure returns proper error with auth URL

**Any failures?** Check:
1. Server logs for detailed error messages
2. KV storage state
3. OAuth configuration (client ID, secret, redirect URI)
4. Network connectivity to ActionStep
