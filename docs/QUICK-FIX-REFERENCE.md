# OAuth Connection Fix - Quick Reference

## 🎯 Problem

MCP Inspector can't connect - keeps showing "Access token expired" error and fails to refresh tokens.

## ✅ Solution Applied

**Fixed**: `src/lib/server/OAuthEndpoints.ts`
- Changed generic `invalid_request` error to proper OAuth error codes
- Returns `invalid_grant` for expired/invalid refresh tokens (RFC 6749 compliant)
- Preserves specific error messages from TokenManager

## 🚀 How to Test

### Step 1: Restart Server

```bash
# Stop current server (Ctrl+C)
# Start fresh
deno task dev
```

### Step 2: Test Error Codes (Optional)

```bash
# Run automated tests
./docs/TEST-OAUTH-FIX.sh

# Or manual test
curl -X POST http://localhost:3001/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=invalid&client_id=test"

# Should return:
# {"error":"invalid_grant","error_description":"Invalid or expired refresh token",...}
```

### Step 3: Clear MCP Inspector Cache

**Method A - Browser Console**:
```javascript
// In MCP Inspector, open DevTools Console (F12)
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Method B - Application Tab**:
1. Open DevTools (F12)
2. Go to Application → Storage
3. Clear Local Storage and Session Storage
4. Refresh page

**Method C - Fresh Browser Session**:
- Use incognito/private mode
- Or close browser completely and reopen

### Step 4: Connect in MCP Inspector

1. **Enter server URL**: `http://localhost:3001/mcp`
2. **Click Connect**
3. **Expected flow**:
   - Redirects to authorization page
   - Auto-approves (or shows approval prompt)
   - Returns with authorization code
   - Exchanges code for tokens
   - ✅ **Connection Established**

## 🔍 What to Look For

### Success Indicators

✅ **Server Logs**:
```
OAuthEndpoints: Authorization request [abc123]
OAuthProvider: Processing authorization request [abc123]
TokenManager: Generating authorization code [def456]
OAuthEndpoints: Token request [ghi789]
TokenManager: Generating access token [jkl012]
```

✅ **Browser Console**:
- No "invalid_request" errors
- OAuth metadata fetched successfully
- Token exchange completed
- Connection status: Connected

✅ **MCP Inspector UI**:
- Shows "Connected" status
- Can list tools/resources
- No error messages

### Failure Indicators

❌ **Still getting "invalid_request"**:
- Server not restarted after code change
- Check server logs for error mapping

❌ **Still seeing old token errors**:
- MCP Inspector cache not cleared
- Try incognito mode

❌ **Redirect not working**:
- Check redirect URI configuration
- Verify client registration

## 🐛 Troubleshooting

### Issue: Still Getting "invalid_request"

**Solution**:
```bash
# Verify server is running the new code
grep -A 10 "Extract specific error message" src/lib/server/OAuthEndpoints.ts

# Should show the new error handling code
# If not, check git status:
git diff src/lib/server/OAuthEndpoints.ts
```

### Issue: MCP Inspector Not Redirecting

**Solution**:
```bash
# Test authorization endpoint directly
curl "http://localhost:3001/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&state=test123"

# Should return 302 redirect
```

### Issue: Token Exchange Failing

**Solution**:
```bash
# Check KV store for clients
deno task kv:list  # if you have this task

# Or check logs for client registration
grep "Client registered" logs/server.log
```

## 📊 Error Code Reference

| Error Code | Meaning | When You'll See It |
|------------|---------|--------------------|
| `invalid_grant` | Token/code invalid or expired | Old refresh token, expired auth code |
| `invalid_request` | Malformed request | Missing required parameters |
| `invalid_client` | Client auth failed | Wrong client_secret (if using) |
| `unsupported_grant_type` | Grant type not allowed | Trying unsupported flow |

## 🎉 Success!

Once working, you should see:

```
MCP Inspector
├─ Status: Connected ✅
├─ Server: bb-mcp-server v1.0.0
├─ Transport: HTTP
└─ OAuth: Authenticated

Available Tools:
  - test_http_server
  - echo
  ...
```

## 📚 Full Documentation

- **Complete Analysis**: `docs/OAUTH-CONNECTION-SOLUTION.md`
- **Test Script**: `docs/TEST-OAUTH-FIX.sh`
- **Implementation Status**: `docs/IMPLEMENTATION-STATUS.md`

## 🆘 Need Help?

**Check These Files**:
1. Server logs - Look for "Token error" messages
2. Browser console - Look for OAuth error responses
3. Network tab - Check actual HTTP requests/responses

**Common Issues**:
- Cache not cleared → Use incognito mode
- Server not restarted → Restart deno task
- Port conflicts → Check if 3001 is free

---

**Status**: 🟢 READY FOR TESTING

**Last Updated**: 2025-09-30
