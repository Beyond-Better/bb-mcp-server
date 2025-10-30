# Elicitation Error Handling Fix

## Problem Summary

User elicitation requests were failing with encoding errors, but the failure was incorrectly treated as approval instead of rejection. This posed a security and data integrity risk.

## Root Causes

### 1. Encoding Issue in TransportEventStoreChunked

**Location**: `src/lib/storage/TransportEventStoreChunked.ts`

**Problem**: The code used `btoa()` to encode JSON messages containing Unicode characters (like emoji). `btoa()` only supports Latin1 characters (0-255), causing it to throw `InvalidCharacterError` when encountering characters outside this range.

**Example**: The elicitation message contained `⚠️` emoji, which caused the encoding to fail:
```
InvalidCharacterError: Cannot encode string: string contains characters outside of the Latin1 range
    at btoa (ext:deno_web/05_base64.js:52:13)
    at TransportEventStoreChunked.storeMessageInChunks
```

### 2. Silent Failure in Error Handling

**Location**: `src/lib/workflows/WorkflowBase.ts` (before fix)

**Problem**: When `elicitInput()` failed, it returned `{ action: 'reject' }` instead of throwing an error. This made it indistinguishable from a valid user rejection.

**Consumer Code Impact**: In the ActionStep workflow, the code checked:
```typescript
const approved = response && Object.keys(response).length > 0;
```

Since `{ action: 'reject' }` has a key, this evaluated to `true`, incorrectly treating the error as approval!

## Solutions Implemented

### 1. UTF-8 Safe Base64 Encoding

**File**: `src/lib/storage/TransportEventStoreChunked.ts`

**Changes**:
- Added `encodeBase64()` method that properly handles UTF-8 by converting to bytes first
- Added `decodeBase64()` method for the counterpart operation
- Replaced unsafe `btoa(chunkData)` calls with `this.encodeBase64(chunkData)`
- Replaced unsafe `atob(chunk.data)` calls with `this.decodeBase64(chunk.data)`

**Implementation**:
```typescript
private encodeBase64(str: string): string {
  // Convert string to UTF-8 bytes
  const utf8Bytes = new TextEncoder().encode(str);
  
  // Convert bytes to binary string in chunks to avoid stack overflow
  let binaryString = '';
  const chunkSize = 8192;
  for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
    const chunk = utf8Bytes.subarray(i, i + chunkSize);
    binaryString += String.fromCharCode(...chunk);
  }
  
  // Now safe to use btoa on the binary string (all values 0-255)
  return btoa(binaryString);
}
```

### 2. Throw on Elicitation Errors

**File**: `src/lib/workflows/WorkflowBase.ts`

**Changes**:
- Changed `elicitInput()` to throw errors instead of returning `{ action: 'reject' }`
- This forces consumers to handle errors explicitly with try-catch
- Errors are now distinguishable from valid rejections

**Before**:
```typescript
catch (error) {
  this.logWarn('Failed to send elicitation input request', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  return { action: 'reject' }; // ❌ Silently returns rejection
}
```

**After**:
```typescript
catch (error) {
  this.logError('Failed to send elicitation input request', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  // Re-throw to force consumers to handle the error explicitly
  throw new Error(
    `Elicitation request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
}
```

### 3. Safe Approval Checking Helper

**File**: `src/lib/workflows/WorkflowBase.ts`

**Changes**:
- Added `isElicitationApproved()` helper method
- Explicitly checks the `action` field instead of object key count
- Prevents the "has keys = approval" anti-pattern

**Implementation**:
```typescript
/**
 * Check if an elicitation response indicates approval
 *
 * Safely checks the action field to determine if the user approved the request.
 * This should be used instead of checking Object.keys(response).length to avoid
 * treating rejection responses as approval.
 *
 * @param response - The elicitation response to check
 * @returns true if approved, false if rejected or invalid
 */
protected isElicitationApproved(response: ElicitInputResult | undefined | null): boolean {
  if (!response) {
    return false;
  }
  // Explicitly check action field - only 'accept' means approval
  return response.action === 'accept';
}
```

### 4. Enhanced Type Documentation

**File**: `src/lib/types/BeyondMcpTypes.ts`

**Changes**:
- Added comprehensive JSDoc to `ElicitInputResult` interface
- Documented the action values and their meanings
- Added warnings about error handling

**Implementation**:
```typescript
/**
 * Result from MCP elicitation request
 *
 * IMPORTANT: When elicitInput throws an error, consumers should handle it
 * explicitly rather than assuming a rejection response.
 *
 * To safely check for approval, use WorkflowBase.isElicitationApproved()
 * instead of checking Object.keys(result).length which can incorrectly
 * treat rejection as approval.
 */
export interface ElicitInputResult {
  /**
   * User's decision
   * - 'accept': User approved the request
   * - 'reject': User declined the request (mapped from MCP SDK's 'decline')
   */
  action: 'accept' | 'reject';
  /**
   * Optional content provided by the user
   */
  content?: unknown;
}
```

## Migration Guide for Consumers

### Old Pattern (Unsafe)
```typescript
const response = await this.elicitInput({
  message: 'Do you approve?',
  requestedSchema: {},
});

// ❌ WRONG: Treats rejection and errors as approval!
const approved = response && Object.keys(response).length > 0;
```

### New Pattern (Safe)
```typescript
try {
  const response = await this.elicitInput({
    message: 'Do you approve?',
    requestedSchema: {},
  });

  // ✅ CORRECT: Explicitly check action field
  const approved = this.isElicitationApproved(response);
  
  if (approved) {
    // Handle approval
  } else {
    // Handle rejection
  }
} catch (error) {
  // ✅ CORRECT: Handle errors explicitly
  this.logError('Elicitation failed', { error });
  // Default to rejection on error
  return false;
}
```

## Testing Recommendations

1. **Test Unicode Characters**: Verify that elicitation messages with emoji and Unicode work correctly
2. **Test Error Handling**: Verify that transport errors throw and are caught by consumers
3. **Test Rejection**: Verify that user rejection is properly distinguished from errors
4. **Test Approval**: Verify that user approval works as expected

## Security Impact

**Before**: Encoding errors could cause approval flows to incorrectly proceed, potentially allowing unauthorized operations.

**After**: Encoding errors are properly handled and default to rejection, maintaining security posture.

## Performance Impact

Minimal. The UTF-8 encoding uses the same chunking approach as before, just with proper encoding.

## Backward Compatibility

**Breaking Change**: Consumers using `elicitInput()` must now handle errors explicitly with try-catch.

**Migration Required**: Any consumer code checking `Object.keys(response).length` should be updated to use `isElicitationApproved()`.
