# RFC 9728 Protected Resource Metadata Fix

**Date**: 2025-09-30  
**Status**: ✅ FIXED - Ready for Testing  
**Issue**: MCP Inspector requesting resource-specific metadata endpoint that returned 404  

---

## 🎯 Root Cause

MCP Inspector was correctly implementing **RFC 9728 (OAuth 2.0 Protected Resource Metadata)** by requesting:

```
GET /.well-known/oauth-protected-resource/mcp
```

But our server was only handling:
```
GET /.well-known/oauth-protected-resource
```

This is the difference between **general metadata** and **resource-specific metadata**.

---

## 📖 RFC 9728 Explanation

Per RFC 9728 Section 3.1:

> If the resource identifier value contains a path or query component,
> any terminating slash (/) following the host component MUST be
> removed before inserting /.well-known/ and the well-known URI path
> suffix between the host component and the path and/or query
> components.

**Example from RFC 9728**:

When resource identifier is `https://resource.example.com/resource1`, the metadata URL is:
```
GET /.well-known/oauth-protected-resource/resource1 HTTP/1.1
Host: resource.example.com
```

**Our Case**:

Resource identifier: `http://localhost:3001/mcp`  
Metadata URL: `http://localhost:3001/.well-known/oauth-protected-resource/mcp`

---

## 🔧 What Was Fixed

### File: `src/lib/server/OAuthEndpoints.ts`

#### Before (Only accepted exact paths):
```typescript
if ((path === 'oauth-authorization-server' || path === 'oauth-protected-resource') && method === 'GET') {
  // Only matches exact paths
```

#### After (Accepts resource-specific paths):
```typescript
// RFC 9728: Resource-specific metadata paths like oauth-protected-resource/mcp are also supported
const isAuthServerMetadata = path === 'oauth-authorization-server';
const isProtectedResourceMetadata = path === 'oauth-protected-resource' || path.startsWith('oauth-protected-resource/');

if ((isAuthServerMetadata || isProtectedResourceMetadata) && method === 'GET') {
  // Now accepts both general and resource-specific paths
```

#### Added Resource Field:
```typescript
// RFC 9728: If this is a resource-specific metadata request, add the resource field
if (isProtectedResourceMetadata && path.startsWith('oauth-protected-resource/')) {
  const resourcePath = '/' + path.substring('oauth-protected-resource/'.length);
  const url = new URL(request.url);
  const resourceUrl = `${url.protocol}//${url.host}${resourcePath}`;
  
  // Add resource field to metadata for RFC 9728 compliance
  (metadata as any).resource = resourceUrl;
}
```

---

## ✅ What Now Works

### 1. General Protected Resource Metadata
```bash
curl http://localhost:3001/.well-known/oauth-protected-resource

# Returns general OAuth metadata (no resource field)
```

### 2. Resource-Specific Metadata for /mcp
```bash
curl http://localhost:3001/.well-known/oauth-protected-resource/mcp

# Returns OAuth metadata WITH resource field:
{
  "resource": "http://localhost:3001/mcp",
  "issuer": "http://localhost:3001",
  "authorization_endpoint": "http://localhost:3001/authorize",
  "token_endpoint": "http://localhost:3001/token",
  ...
}
```

---

## 🧪 Testing

### Test Script
```bash
./test-rfc9728.sh
```

### Manual Tests

**Test 1: General metadata (should NOT have resource field)**
```bash
curl -s http://localhost:3001/.well-known/oauth-protected-resource | jq -r '.resource // "NO RESOURCE FIELD"'
# Expected: NO RESOURCE FIELD
```

**Test 2: Resource-specific metadata (SHOULD have resource field)**
```bash
curl -s http://localhost:3001/.well-known/oauth-protected-resource/mcp | jq -r '.resource // "NO RESOURCE FIELD"'
# Expected: http://localhost:3001/mcp
```

**Test 3: MCP Inspector should now find the endpoint**
1. Clear MCP Inspector cache
2. Connect to `http://localhost:3001/mcp`
3. Should fetch `/.well-known/oauth-protected-resource/mcp` successfully
4. Should proceed with OAuth flow

---

## 📊 Impact on MCP Inspector Flow

### Before Fix:
```
MCP Inspector
  |
  v
GET /.well-known/oauth-protected-resource/mcp
  |
  v
404 Not Found ❌
  |
  v
Connection fails
```

### After Fix:
```
MCP Inspector
  |
  v
GET /.well-known/oauth-protected-resource/mcp
  |
  v
200 OK with resource field ✅
  |
  v
Proceeds with OAuth flow
  |
  v
Connection succeeds
```

---

## 🔍 Why This Matters

### RFC 9728 Validation (Section 3.3)

> The resource value returned MUST be identical to the protected
> resource's resource identifier value into which the well-known URI
> path suffix was inserted to create the URL used to retrieve the
> metadata. If these values are not identical, the data contained in
> the response MUST NOT be used.

This is a **security feature** that prevents metadata impersonation attacks!

MCP Inspector validates:
1. Resource identifier: `http://localhost:3001/mcp`
2. Metadata URL constructed: `http://localhost:3001/.well-known/oauth-protected-resource/mcp`
3. Metadata `resource` field: **MUST** be `http://localhost:3001/mcp`

If they don't match, the client MUST reject the metadata.

---

## 📚 RFC References

### RFC 9728 - OAuth 2.0 Protected Resource Metadata
- **Section 2**: Metadata parameters (including `resource` field)
- **Section 3.1**: Protected Resource Metadata Request (path construction)
- **Section 3.2**: Protected Resource Metadata Response
- **Section 3.3**: Protected Resource Metadata Validation (security)

### RFC 8414 - OAuth 2.0 Authorization Server Metadata
- Our general metadata endpoint (backward compatible)

---

## 🎯 Next Steps

1. **Restart server** to apply changes
2. **Test with script**: `./test-rfc9728.sh`
3. **Test with MCP Inspector**:
   - Clear cache
   - Connect to `http://localhost:3001/mcp`
   - Should complete OAuth flow
4. **Verify in HAR file**: No more 404 for `oauth-protected-resource/mcp`

---

## ✨ Summary

**Problem**: Server didn't implement RFC 9728 resource-specific metadata endpoints

**Solution**: Added support for resource-specific paths with proper `resource` field

**Result**: MCP Inspector can now discover OAuth endpoints for the `/mcp` resource

**Status**: ✅ Ready for testing

---

**Related Files**:
- `src/lib/server/OAuthEndpoints.ts` - The fix
- `test-rfc9728.sh` - Testing script
- `docs/localhost-2.har` - Network trace showing the issue
