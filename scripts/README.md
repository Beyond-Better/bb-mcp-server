# Maintenance Scripts

This directory contains maintenance and utility scripts for the bb-mcp-server library.

## Event Store Cleanup

### cleanup-orphaned-chunks.ts

Cleans up orphaned chunks in the TransportEventStoreChunked implementation. Orphaned chunks are chunks that exist without corresponding metadata entries, which can occur due to partial deletions or system failures.

**Usage:**

```bash
# Clean all streams
deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts

# Dry run to see what would be deleted
deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --dry-run

# Clean specific stream
deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --stream-id "stream_123"

# Verbose mode with custom KV path
deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --kv-path ./my-db.db --verbose
```

**Options:**

- `--kv-path <path>` - Path to Deno KV database (default: `./data/mcp-server.db`)
- `--key-prefix <prefix>` - KV key prefix for events (default: `events`)
- `--stream-id <id>` - Specific stream ID to clean (optional, cleans all if omitted)
- `--dry-run, -d` - Show what would be deleted without actually deleting
- `--verbose, -v` - Show detailed progress information
- `--help, -h` - Show help message

**When to run:**

- Weekly as preventive maintenance
- After system crashes or unexpected shutdowns
- When you notice unexpectedly high storage usage
- Before major version upgrades

**How it works:**

1. Scans all stream metadata to build a list of valid event IDs
2. Scans all chunks to find which events have chunks stored
3. Identifies chunks whose event IDs don't have metadata (orphaned)
4. Deletes orphaned chunks or reports what would be deleted (dry-run)

**Safety:**

- Always performs read operations first to identify orphans
- Uses atomic transactions for deletions
- Dry-run mode allows safe preview of changes
- Does not affect valid events with metadata

## Event Store Cleanup Strategy

The bb-mcp-server uses a hybrid cleanup approach:

### Automatic Cleanup (Built-in)

**Periodic Cleanup** (HttpTransport):
- Runs every hour automatically
- Keeps the last 1000 events per stream
- Deletes older events using metadata chunk counts
- Efficient and maintains recent session history

**KV Expiry Fallback**:
- Base class (TransportEventStore): 30-day TTL
- Chunked class (TransportEventStoreChunked): 90-day TTL
- Automatic expiration even if server is offline
- Safety net for long-running or forgotten data

### Manual Cleanup (Scripts)

**Orphaned Chunk Cleanup** (this script):
- Run weekly or as needed
- Removes chunks without metadata
- Recovers storage from partial deletions
- Complements automatic cleanup

### Recommended Maintenance Schedule

```bash
# Daily: Automatic (no action needed)
# - Hourly periodic cleanup runs automatically
# - KV expiry handles old data

# Weekly: Manual orphaned chunk cleanup
crontab -e
# Add: 0 2 * * 0 cd /path/to/bb-mcp-server && deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts

# Monthly: Storage review
# Check KV database size and adjust retention policies if needed
ls -lh ./data/mcp-server.db

# Before upgrades: Full cleanup
deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --verbose
```

## Monitoring Storage

You can monitor storage usage through the TransportEventStoreChunked statistics:

```typescript
import { TransportEventStoreChunked } from '@beyondbetter/bb-mcp-server';

const stats = await eventStore.getChunkStatistics();
console.log('Storage Stats:', {
  totalEvents: stats.totalEvents,
  totalChunks: stats.totalChunks,
  averageChunksPerEvent: stats.averageChunksPerEvent.toFixed(2),
  compressionRatio: `${stats.compressionStats.compressed}/${stats.compressionStats.uncompressed}`,
});
```

## Troubleshooting

### High storage usage

1. Check for orphaned chunks: `scripts/cleanup-orphaned-chunks.ts --dry-run --verbose`
2. Review event retention: Consider reducing `EVENTS_TO_KEEP` in HttpTransport
3. Check compression: Ensure compression is enabled for large messages

### Slow cleanup operations

1. Reduce batch size in cleanup methods if hitting transaction limits
2. Run cleanup during off-peak hours
3. Consider cleaning specific streams instead of all streams

### Missing events after cleanup

1. Check retention policy: Default keeps 1000 events per stream
2. Verify KV expiry times: 30 days (base) or 90 days (chunked)
3. Adjust retention parameters in HttpTransport configuration

## Contributing

When adding new maintenance scripts:

1. Use consistent command-line argument patterns
2. Always provide `--dry-run` option for destructive operations
3. Include `--verbose` option for detailed logging
4. Document in this README with examples
5. Add error handling and graceful cleanup
6. Use Deno KV transactions for atomic operations
