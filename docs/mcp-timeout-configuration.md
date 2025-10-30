# MCP SDK Timeout Configuration Guide

## Overview

The **MCP error -32001: Request timed out** originates from the **MCP TypeScript SDK**, not from the `bb-mcp-server` library. This guide explains the timeout mechanism and how to configure it.

## Key Findings

### 1. Where the Timeout Comes From

**The MCP SDK has a 60-second default timeout for all client requests.** This timeout is defined in the SDK's protocol layer:

```typescript
// From @modelcontextprotocol/sdk
export const DEFAULT_REQUEST_TIMEOUT_MSEC = 60000; // 60 seconds
```

### 2. Client vs Server Side

**CRITICAL DISTINCTION:**
- **Client-side timeout**: The MCP client (e.g., Claude Desktop, Beyond Better) sets a timeout when calling tools on your server
- **Server-side configuration**: Your `bb-mcp-server` can send progress notifications to help clients avoid timing out

### 3. Timeout Configuration Options

The SDK supports these timeout options when making requests:

```typescript
export type RequestOptions = {
  // Individual request timeout (default: 60000ms)
  timeout?: number;
  
  // Reset timeout on progress notifications (default: false)
  resetTimeoutOnProgress?: boolean;
  
  // Maximum total timeout regardless of progress (optional)
  maxTotalTimeout?: number;
  
  // Abort signal for cancellation
  signal?: AbortSignal;
  
  // Progress callback
  onprogress?: ProgressCallback;
};
```

## Changes Made to bb-mcp-server

### 1. Transport Configuration Updates

**Added new MCP SDK timeout configuration options:**

#### `HttpTransportConfig` (in `TransportTypes.ts`)
```typescript
interface HttpTransportConfig {
  // ... existing fields ...
  
  // HTTP request/response timeout (NOT MCP protocol timeout)
  requestTimeout: number; 
  
  // 🎯 NEW: MCP SDK Protocol Timeout Configuration
  mcpRequestTimeout?: number; // MCP protocol-level timeout (default: 60000)
  mcpResetTimeoutOnProgress?: boolean; // Reset on progress (default: false)
  mcpMaxTotalTimeout?: number; // Maximum total timeout (optional)
}
```

#### `StdioTransportConfig` (in `TransportTypes.ts`)
```typescript
interface StdioTransportConfig {
  // ... existing fields ...
  
  // 🎯 NEW: MCP SDK Protocol Timeout Configuration
  mcpRequestTimeout?: number;
  mcpResetTimeoutOnProgress?: boolean;
  mcpMaxTotalTimeout?: number;
}
```

### 2. Environment Variables

**New environment variables added to `ConfigManager.ts`:**

```bash
# MCP SDK Protocol Timeout Configuration
MCP_SDK_REQUEST_TIMEOUT=60000              # Default: 60 seconds
MCP_SDK_RESET_TIMEOUT_ON_PROGRESS=false    # Default: false
MCP_SDK_MAX_TOTAL_TIMEOUT=                 # Optional (no default)
```

### 3. Progress Notification Support

**Added `sendProgress()` method to `WorkflowBase.ts`:**

```typescript
protected async sendProgress(
  progress: number,
  message?: string,
  details?: Record<string, unknown>,
): Promise<void>
```

This allows workflows to send progress notifications to prevent client timeouts.

## How to Fix Timeout Issues

### Option 1: Client-Side Configuration (Recommended)

The **MCP client** (Claude Desktop, Beyond Better, etc.) should configure timeout options when calling tools:

```typescript
// Client code (Beyond Better, Claude Desktop, etc.)
await client.callTool(
  {
    name: 'execute_workflow',
    arguments: { workflow_name: 'long_running_workflow', parameters: {...} },
  },
  undefined,
  { 
    timeout: 300000,              // 5 minutes
    resetTimeoutOnProgress: true  // Reset timeout on each progress update
  }
);
```

### Option 2: Server-Side Progress Notifications

**Update your workflows to send progress notifications:**

```typescript
// In your workflow implementation
export class MyLongRunningWorkflow extends WorkflowBase {
  protected async executeWorkflow(
    params: MyParams,
    context: WorkflowContext,
  ): Promise<WorkflowResult> {
    const steps = ['step1', 'step2', 'step3', 'step4', 'step5'];
    const completedSteps: WorkflowStep[] = [];
    
    for (let i = 0; i < steps.length; i++) {
      // Send progress notification (prevents timeout)
      await this.sendProgress(
        (i / steps.length) * 100,
        `Executing ${steps[i]}`,
        { currentStep: steps[i], totalSteps: steps.length }
      );
      
      // Do the actual work
      const result = await this.performStep(steps[i]);
      completedSteps.push(this.createStepResult(steps[i], true, result, Date.now()));
      
      // Send progress after completion
      await this.sendProgress(
        ((i + 1) / steps.length) * 100,
        `Completed ${steps[i]}`
      );
    }
    
    return {
      success: true,
      completed_steps: completedSteps,
      failed_steps: [],
    };
  }
}
```

### Option 3: Document Client Configuration

Since the timeout is on the **client side**, document in your MCP server's README:

```markdown
## Long-Running Operations

Some workflows may take longer than 60 seconds. To avoid timeouts:

1. Configure your MCP client with longer timeouts:
   ```typescript
   { timeout: 300000, resetTimeoutOnProgress: true }
   ```

2. Our server sends progress notifications every 10-15 seconds during
   long-running operations, which will reset the timeout if you enable
   `resetTimeoutOnProgress: true`.
```

## Configuration Examples

### Example 1: Environment Variables

```bash
# .env file

# HTTP Transport Settings
HTTP_HOST=localhost
HTTP_PORT=3000
MCP_TRANSPORT=http

# HTTP request/response timeout (30 seconds)
MCP_REQUEST_TIMEOUT=30000

# MCP SDK protocol timeout (5 minutes)
MCP_SDK_REQUEST_TIMEOUT=300000
MCP_SDK_RESET_TIMEOUT_ON_PROGRESS=true
MCP_SDK_MAX_TOTAL_TIMEOUT=600000  # Absolute max: 10 minutes
```

### Example 2: Programmatic Configuration

```typescript
import { ConfigManager } from '@beyondbetter/bb-mcp-server';

const config = new ConfigManager();
await config.loadConfig();

const transportConfig = config.getTransportConfig();

// These settings are for documentation/recommendation purposes
// The actual timeout is controlled by the MCP client
console.log('Recommended timeout:', transportConfig.http?.mcpRequestTimeout);
console.log('Progress reset enabled:', transportConfig.http?.mcpResetTimeoutOnProgress);
```

### Example 3: Workflow with Progress

```typescript
import { WorkflowBase } from '@beyondbetter/bb-mcp-server';
import { z } from 'zod';

export class DataMigrationWorkflow extends WorkflowBase {
  readonly name = 'data_migration';
  readonly version = '1.0.0';
  readonly description = 'Migrate data from old system to new';
  readonly category = 'operation';
  readonly tags = ['migration', 'data'];
  readonly estimatedDuration = 300; // 5 minutes
  
  readonly parameterSchema = z.object({
    sourceId: z.string(),
    targetId: z.string(),
    batchSize: z.number().default(100),
  });
  
  protected async executeWorkflow(
    params: z.infer<typeof this.parameterSchema>,
    context: WorkflowContext,
  ): Promise<WorkflowResult> {
    const totalRecords = await this.getTotalRecords(params.sourceId);
    const batches = Math.ceil(totalRecords / params.batchSize);
    
    for (let i = 0; i < batches; i++) {
      // Send progress every batch (prevents 60s timeout)
      await this.sendProgress(
        (i / batches) * 100,
        `Processing batch ${i + 1} of ${batches}`,
        { recordsProcessed: i * params.batchSize, totalRecords }
      );
      
      // Process batch
      await this.processBatch(params, i);
    }
    
    // Final progress
    await this.sendProgress(100, 'Migration complete');
    
    return {
      success: true,
      completed_steps: [/* ... */],
      failed_steps: [],
    };
  }
}
```

## Important Distinctions

### HTTP `requestTimeout` vs MCP `mcpRequestTimeout`

| Setting | Purpose | Default | Scope |
|---------|---------|---------|-------|
| `requestTimeout` | HTTP transport request/response timeout | 30s | Server-side HTTP layer |
| `mcpRequestTimeout` | MCP protocol tool call timeout | 60s | Client-side SDK |

**Key Point:** The `mcpRequestTimeout` in your server config is for **documentation/recommendation purposes**. The actual timeout is controlled by the **MCP client** when it calls your server's tools.

## Troubleshooting

### Problem: "MCP error -32001: Request timed out" after 60 seconds

**Diagnosis:** The MCP client is using the default 60-second timeout.

**Solutions:**
1. **Client-side**: Configure the client to use longer timeout with `resetTimeoutOnProgress`
2. **Server-side**: Add progress notifications to your workflow (every 10-15 seconds)
3. **Both**: Combine progress notifications + client timeout configuration

### Problem: Timeout even with progress notifications

**Diagnosis:** Client may not have `resetTimeoutOnProgress: true` enabled.

**Solution:** Ensure the MCP client is configured with:
```typescript
{ timeout: 300000, resetTimeoutOnProgress: true }
```

### Problem: Timeout after exact amount regardless of progress

**Diagnosis:** Client may have `maxTotalTimeout` set.

**Solution:** This is a hard limit. Either:
1. Increase `maxTotalTimeout` on client side
2. Optimize workflow to complete faster
3. Break workflow into smaller operations

## SDK Documentation References

- **GitHub Issue**: [#245 - mcp client times out after 60 seconds](https://github.com/modelcontextprotocol/typescript-sdk/issues/245)
- **Default Timeout**: `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` in `protocol.ts`
- **Progress Reset**: `resetTimeoutOnProgress` was added to fix long-running operations

## Summary

1. **Timeout is CLIENT-SIDE**: The 60-second timeout comes from the MCP SDK client, not your server
2. **Server sends progress**: Your server can send progress notifications to help clients avoid timeouts
3. **Client configures timeout**: The client must enable `resetTimeoutOnProgress: true` to benefit from progress notifications
4. **Configuration added**: New `mcpRequestTimeout`, `mcpResetTimeoutOnProgress`, and `mcpMaxTotalTimeout` config options for documentation/recommendations
5. **Progress method added**: Workflows can now call `this.sendProgress()` to send progress notifications

## Next Steps

1. **Update ActionStep workflows** to send progress notifications every 10-15 seconds
2. **Configure Beyond Better client** to use longer timeouts with progress reset
3. **Document in README** that long-running operations require client-side timeout configuration
4. **Test with real workflows** to ensure progress notifications work correctly
