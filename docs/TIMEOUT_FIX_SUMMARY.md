# MCP Timeout Fix - Implementation Summary

## Investigation Results

### Root Cause
The **MCP error -32001: Request timed out** originates from the **MCP TypeScript SDK**, not from the `bb-mcp-server` library.

- **SDK Default Timeout**: 60 seconds (hardcoded in the SDK)
- **Location**: `@modelcontextprotocol/sdk/src/shared/protocol.ts`
- **Constant**: `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000`

### Key Finding: Client-Side Timeout
**CRITICAL**: The timeout is controlled by the **MCP client** (Claude Desktop, Beyond Better, etc.), NOT by the server. The client sets the timeout when calling tools on your server.

## Changes Made

### 1. Transport Types Updated (`src/lib/transport/TransportTypes.ts`)

**Added MCP SDK timeout configuration to both HTTP and STDIO transports:**

```typescript
interface HttpTransportConfig {
  // ... existing fields ...
  
  // Clarified: HTTP transport timeout (NOT MCP protocol)
  requestTimeout: number; // HTTP request/response timeout
  
  // NEW: MCP SDK Protocol Timeout Configuration
  mcpRequestTimeout?: number;           // Default: 60000ms
  mcpResetTimeoutOnProgress?: boolean;  // Default: false
  mcpMaxTotalTimeout?: number;          // Optional
}

interface StdioTransportConfig {
  // ... existing fields ...
  
  // NEW: MCP SDK Protocol Timeout Configuration  
  mcpRequestTimeout?: number;
  mcpResetTimeoutOnProgress?: boolean;
  mcpMaxTotalTimeout?: number;
}
```

### 2. Config Manager Updated (`src/lib/config/ConfigManager.ts`)

**Added environment variable support:**

```bash
MCP_SDK_REQUEST_TIMEOUT=60000              # MCP protocol timeout (60s default)
MCP_SDK_RESET_TIMEOUT_ON_PROGRESS=false    # Reset on progress (false default)
MCP_SDK_MAX_TOTAL_TIMEOUT=                 # Optional absolute maximum
```

### 3. Workflow Progress Support (`src/lib/workflows/WorkflowBase.ts`)

**Added `sendProgress()` method for workflows:**

```typescript
protected async sendProgress(
  progress: number,
  message?: string,
  details?: Record<string, unknown>,
): Promise<void>
```

This allows workflows to send progress notifications to prevent client timeouts.

### 4. Documentation (`docs/mcp-timeout-configuration.md`)

Comprehensive guide covering:
- Timeout mechanism explanation
- Configuration options
- Client vs server responsibilities
- Workflow implementation examples
- Troubleshooting guide

## How to Fix Your ActionStep Timeout

### Immediate Solution: Add Progress Notifications

Update your ActionStep query workflow to send progress every 10-15 seconds:

```typescript
// In your ActionStep workflow
export class ActionStepQueryWorkflow extends WorkflowBase {
  protected async executeWorkflow(
    params: QueryParams,
    context: WorkflowContext,
  ): Promise<WorkflowResult> {
    
    // Send initial progress
    await this.sendProgress(10, 'Authenticating with ActionStep API');
    
    // Authenticate
    const auth = await this.authenticate();
    await this.sendProgress(25, 'Building query');
    
    // Build query
    const query = this.buildQuery(params);
    await this.sendProgress(50, 'Executing query');
    
    // Execute (this might take a while)
    const results = await this.executeQuery(query);
    await this.sendProgress(75, 'Processing results');
    
    // Process
    const processed = this.processResults(results);
    await this.sendProgress(100, 'Query complete');
    
    return {
      success: true,
      completed_steps: [/* ... */],
      failed_steps: [],
    };
  }
}
```

### Long-Term Solution: Configure MCP Client

The **Beyond Better client** (or whichever MCP client you're using) should be configured:

```typescript
// In Beyond Better or MCP client code
await client.callTool(
  {
    name: 'execute_workflow_actionstep-local',
    arguments: { 
      workflow_name: 'actionstep_query',
      parameters: { /* ... */ }
    },
  },
  undefined,
  { 
    timeout: 300000,              // 5 minutes instead of 60 seconds
    resetTimeoutOnProgress: true  // Reset on each progress update
  }
);
```

## Why Connect() Doesn't Take Timeout Options

After reviewing the MCP SDK source code:

```typescript
// From MCP SDK protocol.ts
async connect(transport: Transport): Promise<void> {
  // No timeout options - connection is immediate
  this._transport = transport;
  await this._transport.start();
}
```

**The timeout applies to individual tool calls, not to the connection itself.** The connection is established immediately, but each subsequent `callTool()` request has its own timeout.

## Files Modified

1. ✅ `src/lib/transport/TransportTypes.ts` - Added MCP timeout config
2. ✅ `src/lib/config/ConfigManager.ts` - Added environment variable support
3. ✅ `src/lib/workflows/WorkflowBase.ts` - Added sendProgress() method
4. ✅ `docs/mcp-timeout-configuration.md` - Comprehensive documentation
5. ✅ `docs/TIMEOUT_FIX_SUMMARY.md` - This summary

## Files Reviewed (No Changes Needed)

1. `src/lib/transport/HttpTransport.ts` - Calls `connect()` correctly (line 495)
2. `src/lib/transport/StdioTransport.ts` - Calls `connect()` correctly (line 92)
3. `src/lib/transport/TransportManager.ts` - Calls `connect()` correctly (lines 119, 325)
4. `src/lib/server/BeyondMcpServer.ts` - Calls `connect()` correctly (line 309)
5. `src/lib/storage/TransportPersistenceStore.ts` - Calls `connect()` correctly (line 378)
6. `src/lib/server/MCPSDKHelpers.ts` - Client-side operations (sampling, elicitation)

**Why no changes?** The `connect()` method in the SDK doesn't accept timeout options. Timeouts are configured per-request by the client, not during connection.

## Testing Recommendations

### 1. Test Progress Notifications

```bash
# Set environment variable for testing
export MCP_SDK_RESET_TIMEOUT_ON_PROGRESS=true

# Run your MCP server
deno task start

# In client, call long-running workflow and observe progress
```

### 2. Verify Progress Messages

Add logging to see progress notifications:

```typescript
// In your workflow
await this.sendProgress(50, 'Halfway there');
this.logInfo('Progress notification sent', { progress: 50 });
```

### 3. Test with Real ActionStep Queries

Test with queries that previously timed out:
- Queries with large result sets
- Queries with complex filters
- Analytics queries with aggregations

## Next Steps

1. **Update ActionStep workflows** to call `this.sendProgress()` every 10-15 seconds
2. **Configure MCP client** (Beyond Better) with longer timeout and `resetTimeoutOnProgress: true`
3. **Test thoroughly** with real ActionStep queries
4. **Document in README** that long-running operations require client configuration
5. **Consider** adding automatic progress for all workflows (middleware approach)

## Important Notes

### Client Configuration is Key

No matter how many progress notifications your server sends, they won't help unless the **client** enables `resetTimeoutOnProgress: true`. Make sure to:

1. Document this requirement in your server's README
2. Configure the Beyond Better client appropriately
3. Provide example client configuration

### Two Different Timeouts

| Setting | Layer | Controlled By | Purpose |
|---------|-------|---------------|----------|
| `requestTimeout` | HTTP Transport | Server | HTTP request/response timeout |
| `mcpRequestTimeout` | MCP Protocol | Client | Tool call timeout |

These are **separate** and serve different purposes. Don't confuse them!

### The Real Fix

The complete solution requires **both**:

1. **Server-side**: Send progress notifications (`this.sendProgress()`)
2. **Client-side**: Enable timeout reset (`resetTimeoutOnProgress: true`)

Without both, long-running operations will still timeout.

## References

- **GitHub Issue**: https://github.com/modelcontextprotocol/typescript-sdk/issues/245
- **MCP SDK Source**: https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/src/shared/protocol.ts
- **Full Documentation**: `docs/mcp-timeout-configuration.md`

## Questions?

If you encounter issues:

1. Check that progress notifications are being sent (add logging)
2. Verify client has `resetTimeoutOnProgress: true`
3. Ensure workflow calls `sendProgress()` at least every 30 seconds
4. Review the full documentation in `docs/mcp-timeout-configuration.md`
