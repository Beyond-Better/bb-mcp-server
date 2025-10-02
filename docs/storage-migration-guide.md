# Transport Event Store Migration Guide

## Problem: Deno KV 64KB Value Size Limit

The original `TransportEventStore` fails when storing large MCP messages that exceed Deno KV's 64KB value size limit, resulting in:

```
TypeError: Value too large (max 65536 bytes)
```

## Solution: Chunked Storage

The new `TransportEventStoreChunked` implements a chunked storage strategy that:

1. **Breaks large messages into smaller chunks** (default: 60KB each)
2. **Compresses data** when beneficial (configurable)
3. **Maintains data integrity** with checksums
4. **Provides the same EventStore interface** - drop-in replacement

## Key Features

### Automatic Chunking
- Messages larger than 60KB are automatically split into chunks
- Each chunk is stored separately in Deno KV
- Original message is reconstructed seamlessly during retrieval

### Compression Support
- Automatic gzip compression for messages > 1KB (configurable)
- Only uses compression if it reduces size by at least 10%
- Transparent compression/decompression

### Data Integrity
- Checksums for each chunk to detect corruption
- Atomic transactions ensure all chunks are stored together
- Graceful error handling with detailed logging

### Monitoring & Maintenance
- Chunk statistics for monitoring storage efficiency
- Cleanup operations for old events
- Detailed logging for troubleshooting

## Configuration Options

```typescript
interface ChunkedEventStoreConfig {
  /** Maximum size per chunk in bytes (default: 60KB) */
  maxChunkSize?: number;
  
  /** Whether to compress large messages (default: true) */
  enableCompression?: boolean;
  
  /** Compression threshold in bytes (default: 1KB) */
  compressionThreshold?: number;
  
  /** Maximum total message size in bytes (default: 10MB) */
  maxMessageSize?: number;
}
```

## Migration Steps

### Step 1: Update Imports

**Before:**
```typescript
import { TransportEventStore } from './lib/storage/TransportEventStore.ts';
```

**After:**
```typescript
import { TransportEventStoreChunked } from './lib/storage/TransportEventStoreChunked.ts';
```

### Step 2: Update Instantiation

**Before:**
```typescript
const eventStore = new TransportEventStore(kv, ['events'], logger);
```

**After:**
```typescript
const eventStore = new TransportEventStoreChunked(
  kv, 
  ['events'], 
  logger, 
  {
    maxChunkSize: 60 * 1024,      // 60KB chunks
    enableCompression: true,       // Enable compression
    compressionThreshold: 1024,    // Compress messages > 1KB
    maxMessageSize: 10 * 1024 * 1024 // 10MB max message size
  }
);
```

### Step 3: No Code Changes Required

The `TransportEventStoreChunked` implements the same `EventStore` interface, so no other code changes are needed:

- `storeEvent()` - automatically handles chunking
- `replayEventsAfter()` - automatically reassembles messages
- `logEvent()` - unchanged behavior

## Storage Structure Changes

### Original Structure
```
events/
├── stream/
│   └── {streamId}/
│       └── {eventId} → StoredEvent (limited to 64KB)
└── stream_metadata/
    └── {streamId} → StreamMetadata
```

### Chunked Structure
```
events/
├── stream/
│   └── {streamId}/
│       ├── metadata/
│       │   └── {eventId} → StoredEventMetadata
│       └── chunks/
│           └── {eventId}/
│               ├── 0 → StoredEventChunk
│               ├── 1 → StoredEventChunk
│               └── ...
└── stream_metadata/
    └── {streamId} → StreamMetadata
```

## Monitoring & Troubleshooting

### Get Chunk Statistics

```typescript
const stats = await eventStore.getChunkStatistics();
console.log('Storage statistics:', {
  totalEvents: stats.totalEvents,
  totalChunks: stats.totalChunks,
  averageChunksPerEvent: stats.averageChunksPerEvent,
  largestEvent: stats.largestEvent,
  compressionStats: stats.compressionStats
});
```

### Common Issues & Solutions

#### Issue: "Missing chunk X for event Y"
**Cause:** Incomplete storage transaction or corruption  
**Solution:** Check logs for storage errors, ensure atomic transactions completed

#### Issue: "Checksum mismatch for chunk X"
**Cause:** Data corruption during storage/retrieval  
**Solution:** Check Deno KV integrity, consider data recovery from backups

#### Issue: "Failed to decompress event X"
**Cause:** Compression/decompression error  
**Solution:** Check compression settings, may need to disable compression for certain message types

#### Issue: Performance degradation
**Cause:** Too many small chunks or inefficient chunk size  
**Solution:** Adjust `maxChunkSize` based on typical message sizes

### Recommended Settings by Use Case

#### High-throughput, small messages (< 10KB average)
```typescript
{
  maxChunkSize: 50 * 1024,       // 50KB chunks
  enableCompression: false,       // Skip compression overhead
  maxMessageSize: 1024 * 1024    // 1MB max
}
```

#### Mixed message sizes with some large payloads
```typescript
{
  maxChunkSize: 60 * 1024,       // 60KB chunks (default)
  enableCompression: true,        // Enable compression
  compressionThreshold: 2048,     // 2KB threshold
  maxMessageSize: 10 * 1024 * 1024 // 10MB max
}
```

#### Large file transfers or data dumps
```typescript
{
  maxChunkSize: 45 * 1024,       // Smaller chunks for reliability
  enableCompression: true,        // Definitely compress
  compressionThreshold: 512,      // Low threshold
  maxMessageSize: 50 * 1024 * 1024 // 50MB max
}
```

## Performance Considerations

### Storage Overhead
- **Metadata:** ~200 bytes per event (vs ~100 bytes original)
- **Chunking:** ~50 bytes per chunk overhead
- **Compression:** 20-80% size reduction for text-heavy messages

### Read/Write Performance
- **Write:** Slightly slower due to chunking (typically < 10ms overhead)
- **Read:** Comparable for small messages, slower for large chunked messages
- **Replay:** Linear with chunk count, uses batch operations for efficiency

### Recommended Maintenance

```typescript
// Clean up old events periodically
setInterval(async () => {
  const streams = await eventStore.listStreams();
  for (const streamId of streams) {
    await eventStore.cleanupOldEvents(streamId, 1000); // Keep last 1000 events
  }
}, 24 * 60 * 60 * 1000); // Daily cleanup
```

## Backward Compatibility

The chunked store cannot directly read events stored by the original `TransportEventStore`. For migration:

1. **Gradual migration:** Run both stores simultaneously, with new events using chunked storage
2. **Full migration:** Export old data and reimport through chunked store
3. **Clean slate:** Start fresh with chunked storage (lose historical events)

The new implementation is fully forward-compatible and maintains the same EventStore interface.