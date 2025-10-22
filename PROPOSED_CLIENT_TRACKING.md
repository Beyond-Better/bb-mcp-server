# Proposed Client Tracking Enhancement for bb-mcp-server

## Overview

Enhance HttpTransport to track client metadata from MCP protocol messages, specifically:
1. Client information from `initialize` requests
2. `_meta` field from all client→server requests
3. Expose this information through public API

## Changes Required

### 1. Add ClientMetadata Interface

**File**: `src/lib/transport/TransportTypes.ts`

```typescript
/**
 * Client metadata tracked per session
 */
export interface ClientMetadata {
  sessionId: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  protocolVersion?: string;
  connectedAt: number;
  lastActivity: number;
  lastMeta?: Record<string, unknown>; // Most recent _meta from client
  requestCount: number;
}
```

### 2. Track Client Metadata in HttpTransport

**File**: `src/lib/transport/HttpTransport.ts`

Add private member:
```typescript
private clientMetadata = new Map<string, ClientMetadata>();
```

Extract client info in `handleMCPPost()` when handling initialize:
```typescript
// After session creation, extract client info
if (isInitializeRequest(requestBody)) {
  const clientInfo = requestBody.params?.clientInfo;
  const protocolVersion = requestBody.params?.protocolVersion;
  
  this.clientMetadata.set(newSessionId, {
    sessionId: newSessionId,
    clientInfo,
    protocolVersion,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    lastMeta: requestBody._meta,
    requestCount: 1,
  });
}
```

Update metadata on each request:
```typescript
// In handleMCPPost, handleMCPGet, handleMCPDelete
private updateClientActivity(sessionId: string, requestBody?: any): void {
  const metadata = this.clientMetadata.get(sessionId);
  if (metadata) {
    metadata.lastActivity = Date.now();
    metadata.requestCount++;
    if (requestBody?._meta) {
      metadata.lastMeta = requestBody._meta;
    }
  }
}
```

### 3. Add Public API Methods

**File**: `src/lib/transport/HttpTransport.ts`

```typescript
/**
 * Get metadata for a specific client session
 */
getClientMetadata(sessionId: string): ClientMetadata | undefined {
  return this.clientMetadata.get(sessionId);
}

/**
 * Get metadata for all active client sessions
 */
getAllClientMetadata(): ClientMetadata[] {
  return Array.from(this.clientMetadata.values());
}
```

### 4. Expose Through TransportManager

**File**: `src/lib/transport/TransportManager.ts`

```typescript
/**
 * Get metadata for a specific client (HTTP transport only)
 */
getClientMetadata(sessionId: string): ClientMetadata | undefined {
  if (this.config.type === 'http' && this.httpTransport) {
    return this.httpTransport.getClientMetadata(sessionId);
  }
  return undefined;
}

/**
 * Get metadata for all clients (HTTP transport only)
 */
getAllClientMetadata(): ClientMetadata[] {
  if (this.config.type === 'http' && this.httpTransport) {
    return this.httpTransport.getAllClientMetadata();
  }
  return [];
}
```

### 5. Cleanup on Session End

**File**: `src/lib/transport/HttpTransport.ts`

In `handleMCPDelete()` and cleanup:
```typescript
// Clean up client metadata
this.clientMetadata.delete(sessionId);
```

## Usage in Inspector

The inspector can now:

```typescript
// In ConsoleManager, when handling get_clients command
const transportManager = beyondMcpServer.getTransportManager();
const clientMetadata = transportManager.getAllClientMetadata();

// Convert to ClientInfo for console
const clients: ClientInfo[] = clientMetadata.map(meta => ({
  clientId: meta.sessionId,
  sessionId: meta.sessionId,
  connectedAt: meta.connectedAt,
  lastSeen: meta.lastActivity,
  transport: 'http',
  metadata: {
    name: meta.clientInfo?.name,
    version: meta.clientInfo?.version,
    protocolVersion: meta.protocolVersion,
    requestCount: meta.requestCount,
    lastMeta: meta.lastMeta,
  },
}));
```

## Benefits

1. **Non-Breaking**: All changes are additive, no existing functionality affected
2. **Minimal**: Only adds essential tracking, no complex features
3. **MCP-Compliant**: Extracts standard MCP protocol fields
4. **Extensible**: Easy to add more metadata fields in future
5. **Performance**: Minimal overhead, just Map lookups

## Testing Checklist

- [ ] Initialize request extracts client info
- [ ] `_meta` field captured from requests
- [ ] Metadata updated on each request
- [ ] Public API returns correct data
- [ ] Cleanup removes metadata on disconnect
- [ ] STDIO transport returns empty arrays (not applicable)
- [ ] No impact on existing functionality
