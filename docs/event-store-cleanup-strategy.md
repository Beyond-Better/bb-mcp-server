# Event Store Cleanup Strategy

This document describes the comprehensive cleanup strategy implemented for the TransportEventStore and TransportEventStoreChunked classes in bb-mcp-server.

## Overview

The cleanup strategy uses a **hybrid approach** that combines:

1. **Periodic Cleanup** - Active cleanup running hourly
2. **KV Expiry Fallback** - Automatic expiration as a safety net
3. **Manual Maintenance** - Scripts for orphaned chunk cleanup

## Architecture

### 1. Periodic Cleanup (Primary Strategy)

**Location:** `src/lib/transport/HttpTransport.ts`

**How it works:**
- Runs automatically every hour when HttpTransport starts
- Keeps the last 1000 events per stream (configurable)
- Deletes older events using actual chunk counts from metadata
- Non-blocking and efficient

**Configuration:**
```typescript
class HttpTransport {
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly EVENTS_TO_KEEP = 1000; // Keep last 1000 events
}
```

**Implementation:**
```typescript
// In HttpTransport.start()
if (this.dependencies.eventStore) {
  this.startPeriodicCleanup();
}

// Cleanup runs for all active streams
private async runEventCleanup(): Promise<void> {
  const streams = await this.eventStore.listStreams();
  for (const streamId of streams) {
    await this.eventStore.cleanupOldEvents(streamId, this.EVENTS_TO_KEEP);
  }
}
```

**Benefits:**
- Active management of storage
- Count-based retention (last N events)
- Runs automatically without manual intervention
- Efficient batch deletion using metadata chunk counts

### 2. KV Expiry Fallback (Safety Net)

**Location:** `src/lib/storage/TransportEventStore.ts` and `TransportEventStoreChunked.ts`

**How it works:**
- Sets Deno KV `expireIn` option when storing events
- Automatic expiration even if server is offline
- Different TTLs for base vs chunked implementations

**Configuration:**
```typescript
// Base class: 30-day TTL
class TransportEventStore {
  async storeEvent(
    streamId: string,
    message: JSONRPCMessage,
    expiryMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days
  ): Promise<string> {
    await this.kv.atomic()
      .set(key, storedEvent, { expireIn: expiryMs })
      .commit();
  }
}

// Chunked class: 90-day TTL (longer due to multi-entry complexity)
class TransportEventStoreChunked {
  private async storeMessageInChunks(
    eventId: string,
    streamId: string,
    message: JSONRPCMessage,
    timestamp: number,
    expiryMs: number = 90 * 24 * 60 * 60 * 1000 // 90 days
  ): Promise<void> {
    // Store metadata with expiry
    atomic.set(metadataKey, metadata, { expireIn: expiryMs });
    
    // Store all chunks with same expiry
    for (const chunk of chunks) {
      atomic.set(chunkKey, chunk, { expireIn: expiryMs });
    }
  }
}
```

**Why different TTLs?**
- **Base class (30 days):** Simple one-entry-per-event, shorter TTL is safe
- **Chunked class (90 days):** Multiple entries per event, longer TTL reduces risk of partial expiration

**Benefits:**
- Works even when server is offline
- Prevents indefinite storage growth
- Automatic cleanup without code execution
- Safety net if periodic cleanup fails

**Tradeoffs:**
- Chunks may expire out of order (acceptable since we're deleting old data anyway)
- Less precise than count-based retention
- Cannot be cancelled once set

### 3. Manual Maintenance (Orphaned Chunk Cleanup)

**Location:** `scripts/cleanup-orphaned-chunks.ts`

**How it works:**
- Scans for chunks without corresponding metadata
- Identifies orphaned events
- Deletes or reports orphaned chunks

**Usage:**
```bash
# Dry run to see what would be deleted
deno task cleanup:orphaned-chunks:dry-run

# Actually delete orphaned chunks
deno task cleanup:orphaned-chunks

# Verbose mode for detailed progress
deno task cleanup:orphaned-chunks:verbose
```

**When to run:**
- Weekly as preventive maintenance
- After system crashes or unexpected shutdowns
- When storage usage is unexpectedly high
- Before major version upgrades

**Implementation in TransportEventStoreChunked:**
```typescript
async cleanupOrphanedChunks(streamId: string): Promise<number> {
  // Get valid event IDs from metadata
  const validEventIds = new Set<string>();
  const metadataIter = this.kv.list<StoredEventMetadata>({...});
  for await (const entry of metadataIter) {
    validEventIds.add(entry.value.eventId);
  }
  
  // Find chunk event IDs
  const chunkEventIds = new Set<string>();
  const chunksIter = this.kv.list({...});
  for await (const entry of chunksIter) {
    const eventId = entry.key[entry.key.length - 2];
    chunkEventIds.add(eventId);
  }
  
  // Delete orphaned chunks
  const orphanedEventIds = Array.from(chunkEventIds)
    .filter(id => !validEventIds.has(id));
  // ... delete chunks
}
```

**Benefits:**
- Recovers storage from partial deletions
- Complements automatic cleanup
- Safe with dry-run mode
- Detailed reporting

## Critical Fix: Using Actual Chunk Counts

### Problem
The original `cleanupOldEvents` in `TransportEventStoreChunked` had a bug:

```typescript
// ❌ WRONG: Blindly tries to delete 100 chunks
for (let chunkIndex = 0; chunkIndex < 100; chunkIndex++) {
  atomic.delete([...keyPrefix, 'stream', streamId, 'chunks', eventId, chunkIndex]);
}
```

This wastes operations and could hit transaction limits.

### Solution
The metadata already stores `chunkCount`, so we use it:

```typescript
// ✅ CORRECT: Use actual chunk count from metadata
const events: Array<{ eventId: string; timestamp: number; chunkCount: number }> = [];

for await (const entry of iter) {
  if (entry.value) {
    events.push({
      eventId: entry.value.eventId,
      timestamp: entry.value.timestamp,
      chunkCount: entry.value.chunkCount, // ← Use stored count
    });
  }
}

// Delete only actual chunks
for (const { eventId, chunkCount } of batch) {
  atomic.delete(metadataKey);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    atomic.delete(chunkKey);
  }
}
```

**Benefits:**
- Efficient: Only deletes actual chunks
- No wasted operations
- Lower risk of hitting transaction limits
- Faster cleanup

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Storage                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Store Event with KV Expiry (30d base / 90d chunked)        │
│  - Base: Single entry with expiry                            │
│  - Chunked: Metadata + N chunks, all with same expiry       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
        ┌──────────────────┴──────────────────┐
        │                                      │
        ↓                                      ↓
┌─────────────────┐                  ┌──────────────────┐
│ Periodic Cleanup│                  │  KV Auto-Expiry  │
│  (Every hour)   │                  │  (After TTL)     │
│                 │                  │                  │
│ • List streams  │                  │ • 30d (base)     │
│ • Keep last 1K  │                  │ • 90d (chunked)  │
│ • Delete older  │                  │ • Background     │
│ • Use chunk cnt │                  │ • Always active  │
└─────────────────┘                  └──────────────────┘
        │                                      │
        └──────────────────┬──────────────────┘
                           ↓
        ┌─────────────────────────────────────┐
        │     Manual Maintenance (Weekly)     │
        │  • Cleanup orphaned chunks          │
        │  • Verify storage consistency       │
        │  • Report statistics                │
        └─────────────────────────────────────┘
```

## Configuration Options

### HttpTransport Cleanup Settings

```typescript
// In HttpTransport.ts
private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Adjust frequency
private readonly EVENTS_TO_KEEP = 1000; // Adjust retention count
```

**When to adjust:**
- High-traffic servers: Increase `EVENTS_TO_KEEP` for longer history
- Low-traffic servers: Decrease `EVENTS_TO_KEEP` to save storage
- Storage constraints: Decrease `CLEANUP_INTERVAL_MS` for more frequent cleanup

### KV Expiry Settings

```typescript
// In TransportEventStore.ts
async storeEvent(
  streamId: string,
  message: JSONRPCMessage,
  expiryMs: number = 30 * 24 * 60 * 60 * 1000 // Adjust TTL
): Promise<string>

// In TransportEventStoreChunked.ts
private async storeMessageInChunks(
  ...,
  expiryMs: number = 90 * 24 * 60 * 60 * 1000 // Adjust TTL
): Promise<void>
```

**When to adjust:**
- Compliance requirements: Adjust TTL for data retention policies
- Storage constraints: Decrease TTL for faster expiration
- Long-term debugging: Increase TTL to keep more history

## Monitoring and Metrics

### Check Storage Usage

```typescript
import { TransportEventStoreChunked } from '@beyondbetter/bb-mcp-server';

const stats = await eventStore.getChunkStatistics();
console.log({
  totalEvents: stats.totalEvents,
  totalChunks: stats.totalChunks,
  averageChunksPerEvent: stats.averageChunksPerEvent,
  compressed: stats.compressionStats.compressed,
  uncompressed: stats.compressionStats.uncompressed,
  largestEvent: stats.largestEvent,
});
```

### Cleanup Logs

HttpTransport logs cleanup operations:

```
HttpTransport: Starting periodic event cleanup { intervalMs: 3600000, eventsToKeep: 1000 }
HttpTransport: Event cleanup completed { streamsProcessed: 5, eventsDeleted: 2500 }
```

### Manual Script Output

```bash
$ deno task cleanup:orphaned-chunks:dry-run

=== Orphaned Chunk Cleanup ===

KV Path: ./data/mcp-server.db
Key Prefix: events
Mode: DRY RUN (no changes)
Target: All streams

Found 3 stream(s) to process

  Stream stream_123: 2 orphaned events, 15 chunks
  Stream stream_456: 0 orphaned events, 0 chunks
  Stream stream_789: 1 orphaned events, 8 chunks

=== Cleanup Summary ===

Streams processed: 3
Orphaned events found: 3
Chunks to be deleted: 23
Storage to be freed: 1.41 MB

Run without --dry-run to actually delete orphaned chunks.
```

## Recommended Maintenance Schedule

### Automatic (No Action Needed)

- **Hourly:** Periodic cleanup runs automatically
- **Daily:** KV expiry handles aged-out data

### Manual (Scheduled)

**Weekly:**
```bash
# Add to crontab
0 2 * * 0 cd /path/to/bb-mcp-server && deno task cleanup:orphaned-chunks
```

**Monthly:**
```bash
# Review storage and statistics
ls -lh ./data/mcp-server.db
deno task cleanup:orphaned-chunks:dry-run --verbose
```

**Before Upgrades:**
```bash
# Full cleanup and verification
deno task cleanup:orphaned-chunks:verbose
```

## Troubleshooting

### High Storage Usage

1. **Check for orphaned chunks:**
   ```bash
   deno task cleanup:orphaned-chunks:dry-run --verbose
   ```

2. **Review retention settings:**
   - Consider reducing `EVENTS_TO_KEEP` in HttpTransport
   - Check if KV expiry TTLs are too long

3. **Verify compression:**
   ```typescript
   const stats = await eventStore.getChunkStatistics();
   console.log('Compression ratio:', 
     stats.compressionStats.compressed / stats.totalEvents);
   ```

### Slow Cleanup Operations

1. **Reduce batch sizes** in cleanup methods if hitting transaction limits
2. **Run cleanup during off-peak hours** using scheduled tasks
3. **Clean specific streams** instead of all streams

### Missing Events After Cleanup

1. **Check retention policy:** Default keeps 1000 events per stream
2. **Verify KV expiry times:** 30 days (base) or 90 days (chunked)
3. **Adjust settings** in HttpTransport configuration

## Future Enhancements

### Potential Improvements

1. **Configurable retention policies** per stream
2. **Age-based retention** in addition to count-based
3. **Compression statistics** in cleanup logs
4. **Storage usage alerts** when threshold exceeded
5. **Cleanup scheduler** with cron-like configuration
6. **Metrics export** for monitoring dashboards

### Performance Optimizations

1. **Parallel stream cleanup** for faster processing
2. **Incremental cleanup** to avoid blocking operations
3. **Smart scheduling** based on storage pressure
4. **Background cleanup** using Deno workers

## Summary

The hybrid cleanup strategy provides:

✅ **Automatic Management** - Periodic cleanup runs without intervention  
✅ **Safety Net** - KV expiry prevents unbounded growth  
✅ **Efficient Deletion** - Uses actual chunk counts from metadata  
✅ **Maintenance Tools** - Scripts for orphaned chunk cleanup  
✅ **Flexibility** - Configurable retention policies  
✅ **Monitoring** - Comprehensive statistics and logging  
✅ **Data Integrity** - Atomic operations and dry-run modes  

This approach balances performance, storage efficiency, and data integrity while providing multiple layers of protection against storage issues.
