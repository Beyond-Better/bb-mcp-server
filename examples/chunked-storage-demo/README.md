# Chunked Storage Demo

This example demonstrates how to use the `ChunkedTransportEventStore` to handle large MCP messages that exceed Deno KV's 64KB limit.

## Problem Solved

The original `TransportEventStore` fails when trying to store messages larger than 64KB with the error:

```
TypeError: Value too large (max 65536 bytes)
```

The `ChunkedTransportEventStore` solves this by:

- **Breaking large messages into smaller chunks** (default: 60KB each)
- **Compressing data** when beneficial (configurable)
- **Maintaining data integrity** with checksums
- **Providing the same EventStore interface** - drop-in replacement

## Features Demonstrated

### 🔄 Automatic Chunking
- Messages larger than 60KB are automatically split into chunks
- Each chunk is stored separately in Deno KV
- Original message is reconstructed seamlessly during retrieval

### 🗜️ Compression Support
- Automatic gzip compression for messages > 1KB (configurable)
- Only uses compression if it reduces size by at least 10%
- Transparent compression/decompression

### 📊 Monitoring & Statistics
- Real-time chunk statistics
- Compression efficiency metrics
- Storage usage monitoring

### 🛡️ Data Integrity
- Checksums for each chunk to detect corruption
- Atomic transactions ensure all chunks are stored together
- Graceful error handling with detailed logging

## Quick Start

### 1. Install Dependencies

```bash
# Using JSR (when published)
deno add @beyondbetter/bb-mcp-server

# Or using local development
# (Adjust path to your bb-mcp-server directory)
export DENO_PATH="/path/to/bb-mcp-server"
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env to configure chunked storage settings
```

### 3. Run the Demo

```bash
# STDIO transport (default)
deno run --allow-read --allow-write --allow-env main.ts

# HTTP transport
echo "MCP_TRANSPORT=http" >> .env
deno run --allow-read --allow-write --allow-env --allow-net main.ts
```

### 4. Test Large Messages

Once the server is running, you can use the MCP client to test:

```json
// Generate a 500KB JSON message
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "generate_large_message",
    "arguments": {
      "size": 500,
      "content": "json"
    }
  }
}

// Check storage statistics
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_storage_stats",
    "arguments": {}
  }
}
```

## Configuration Options

The demo supports the following environment variables:

### Chunked Storage Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT_USE_CHUNKED_STORAGE` | `true` | Enable chunked storage |
| `TRANSPORT_MAX_CHUNK_SIZE` | `61440` | Maximum size per chunk (60KB) |
| `TRANSPORT_ENABLE_COMPRESSION` | `true` | Enable compression |
| `TRANSPORT_COMPRESSION_THRESHOLD` | `1024` | Compress messages > 1KB |
| `TRANSPORT_MAX_MESSAGE_SIZE` | `10485760` | Maximum total message size (10MB) |

### Performance Tuning Examples

#### High-throughput, small messages
```bash
TRANSPORT_MAX_CHUNK_SIZE=51200          # 50KB chunks
TRANSPORT_ENABLE_COMPRESSION=false       # Skip compression overhead
TRANSPORT_MAX_MESSAGE_SIZE=1048576       # 1MB max
```

#### Large file transfers
```bash
TRANSPORT_MAX_CHUNK_SIZE=46080           # 45KB chunks (more reliable)
TRANSPORT_ENABLE_COMPRESSION=true        # Compress everything
TRANSPORT_COMPRESSION_THRESHOLD=512      # Low threshold
TRANSPORT_MAX_MESSAGE_SIZE=52428800      # 50MB max
```

## Demo Tools

### `generate_large_message`
Generate messages of various sizes to test chunked storage:

**Parameters:**
- `size` (number): Size in KB (1-5000)
- `content` (string): Content type - "json", "text", or "mixed"

**Examples:**
```json
// Generate 100KB JSON data
{"size": 100, "content": "json"}

// Generate 2MB mixed content
{"size": 2048, "content": "mixed"}
```

### `get_storage_stats`
Get statistics about chunked storage usage:

**Parameters:**
- `streamId` (string, optional): Get stats for specific stream

**Returns:**
- `totalEvents`: Number of stored events
- `totalChunks`: Total chunks across all events
- `averageChunksPerEvent`: Average chunks per event
- `largestEvent`: Event with most chunks
- `compressionStats`: Compression usage statistics

## Integration in Your Project

To use chunked storage in your own MCP server:

### Option 1: Direct Usage

```typescript
import { ChunkedTransportEventStore, KVManager, Logger } from '@beyondbetter/bb-mcp-server';

const kvManager = new KVManager({ kvPath: './data/my-server.db' }, logger);
const eventStore = new ChunkedTransportEventStore(
  kvManager.getKV(),
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

### Option 2: Smart Selection (Recommended)

```typescript
import { getSmartTransportEventStore } from '@beyondbetter/bb-mcp-server';

// Automatically chooses chunked storage if TRANSPORT_USE_CHUNKED_STORAGE=true
const eventStore = getSmartTransportEventStore(kvManager, logger, configManager);
```

### Option 3: Library Integration

The chunked storage is automatically used when you configure:

```bash
TRANSPORT_USE_CHUNKED_STORAGE=true
```

All library helper functions (`getAllDependencies`, `getSmartTransportEventStore`) will automatically use chunked storage.

## Monitoring and Maintenance

### Storage Statistics

```typescript
const stats = await eventStore.getChunkStatistics();
console.log('Storage stats:', {
  totalEvents: stats.totalEvents,
  totalChunks: stats.totalChunks,
  averageChunksPerEvent: stats.averageChunksPerEvent,
  compressionRatio: stats.compressionStats.compressed / stats.totalEvents
});
```

### Cleanup Old Events

```typescript
// Keep only the last 1000 events per stream
const streams = await eventStore.listStreams();
for (const streamId of streams) {
  await eventStore.cleanupOldEvents(streamId, 1000);
}
```

## Troubleshooting

### Common Issues

**Error: "Missing chunk X for event Y"**
- Cause: Incomplete storage transaction or corruption
- Solution: Check logs for storage errors, ensure atomic transactions completed

**Error: "Checksum mismatch for chunk X"**
- Cause: Data corruption during storage/retrieval
- Solution: Check Deno KV integrity, consider data recovery from backups

**Error: "Failed to decompress event X"**
- Cause: Compression/decompression error
- Solution: Check compression settings, may need to disable compression

**Performance degradation**
- Cause: Too many small chunks or inefficient chunk size
- Solution: Adjust `TRANSPORT_MAX_CHUNK_SIZE` based on typical message sizes

### Debug Logging

Enable debug logging to see chunked storage operations:

```bash
LOG_LEVEL=debug
TRANSPORT_CHUNKED_DEBUG_LOGGING=true
```

## Performance Characteristics

### Storage Overhead
- **Metadata**: ~200 bytes per event (vs ~100 bytes original)
- **Chunking**: ~50 bytes per chunk overhead
- **Compression**: 20-80% size reduction for text-heavy messages

### Read/Write Performance
- **Write**: Slightly slower due to chunking (typically < 10ms overhead)
- **Read**: Comparable for small messages, slower for large chunked messages
- **Replay**: Linear with chunk count, uses batch operations for efficiency

## Architecture Details

### Storage Structure

The chunked storage uses a hierarchical key structure in Deno KV:

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

### Data Flow

1. **Storage**: Message → Compression (optional) → Chunking → KV Storage
2. **Retrieval**: KV Storage → Chunk Assembly → Decompression (optional) → Message
3. **Integrity**: Checksums validated during assembly
4. **Atomicity**: All chunks stored in a single transaction

## License

This example is part of the bb-mcp-server library and follows the same licensing terms.