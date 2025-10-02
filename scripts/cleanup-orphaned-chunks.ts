#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * Orphaned Chunk Cleanup Script
 * 
 * This script cleans up orphaned chunks in the TransportEventStore.
 * Orphaned chunks are chunks that exist without corresponding metadata entries,
 * which can occur due to partial deletions or system failures.
 * 
 * Usage:
 *   deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts [options]
 * 
 * Options:
 *   --kv-path <path>       Path to Deno KV database (default: ./data/mcp-server.db)
 *   --key-prefix <prefix>  KV key prefix for events (default: events)
 *   --stream-id <id>       Specific stream ID to clean (optional, cleans all if omitted)
 *   --dry-run              Show what would be deleted without actually deleting
 *   --verbose              Show detailed progress information
 * 
 * Examples:
 *   # Clean all streams
 *   deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts
 * 
 *   # Dry run to see what would be deleted
 *   deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --dry-run
 * 
 *   # Clean specific stream
 *   deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --stream-id "stream_123"
 * 
 *   # Verbose mode with custom KV path
 *   deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --kv-path ./my-db.db --verbose
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';

interface StoredEventMetadata {
  eventId: string;
  streamId: string;
  timestamp: number;
  messageSize: number;
  chunkCount: number;
  compressed: boolean;
}

interface CleanupStats {
  streamsProcessed: number;
  orphanedEventsFound: number;
  chunksDeleted: number;
  bytesFreed: number;
}

interface CleanupOptions {
  kvPath: string;
  keyPrefix: string[];
  streamId?: string;
  dryRun: boolean;
  verbose: boolean;
}

/**
 * Parse command-line arguments
 */
function parseArguments(): CleanupOptions {
  const args = parseArgs(Deno.args, {
    string: ['kv-path', 'key-prefix', 'stream-id'],
    boolean: ['dry-run', 'verbose', 'help'],
    default: {
      'kv-path': './data/mcp-server.db',
      'key-prefix': 'events',
      'dry-run': false,
      'verbose': false,
    },
    alias: {
      h: 'help',
      v: 'verbose',
      d: 'dry-run',
    },
  });

  if (args.help) {
    console.log(`
Orphaned Chunk Cleanup Script

Usage:
  deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts [options]

Options:
  --kv-path <path>       Path to Deno KV database (default: ./data/mcp-server.db)
  --key-prefix <prefix>  KV key prefix for events (default: events)
  --stream-id <id>       Specific stream ID to clean (optional, cleans all if omitted)
  --dry-run, -d          Show what would be deleted without actually deleting
  --verbose, -v          Show detailed progress information
  --help, -h             Show this help message

Examples:
  # Clean all streams
  deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts

  # Dry run to see what would be deleted
  deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --dry-run

  # Clean specific stream with verbose output
  deno run --allow-read --allow-write --allow-env scripts/cleanup-orphaned-chunks.ts --stream-id "stream_123" --verbose
`);
    Deno.exit(0);
  }

  return {
    kvPath: args['kv-path'],
    keyPrefix: args['key-prefix'].split('.'),
    streamId: args['stream-id'],
    dryRun: args['dry-run'],
    verbose: args['verbose'],
  };
}

/**
 * Get all stream IDs from the KV store
 */
async function getStreamIds(kv: Deno.Kv, keyPrefix: string[]): Promise<string[]> {
  const streams = new Set<string>();
  const prefix = [...keyPrefix, 'stream_metadata'];
  const iter = kv.list<StoredEventMetadata>({ prefix });

  for await (const entry of iter) {
    if (entry.value && entry.value.streamId) {
      streams.add(entry.value.streamId);
    }
  }

  return Array.from(streams);
}

/**
 * Clean up orphaned chunks for a specific stream
 */
async function cleanupStreamOrphanedChunks(
  kv: Deno.Kv,
  keyPrefix: string[],
  streamId: string,
  dryRun: boolean,
  verbose: boolean,
): Promise<{ orphanedEvents: number; chunksDeleted: number; bytesFreed: number }> {
  if (verbose) {
    console.log(`\n  Processing stream: ${streamId}`);
  }

  // Get all metadata event IDs
  const validEventIds = new Set<string>();
  const metadataIter = kv.list<StoredEventMetadata>({
    prefix: [...keyPrefix, 'stream', streamId, 'metadata'],
  });

  for await (const entry of metadataIter) {
    if (entry.value) {
      validEventIds.add(entry.value.eventId);
    }
  }

  if (verbose) {
    console.log(`    Valid events: ${validEventIds.size}`);
  }

  // Find chunk event IDs
  const chunkEventIds = new Map<string, number>();
  const chunksIter = kv.list({
    prefix: [...keyPrefix, 'stream', streamId, 'chunks'],
  });

  for await (const entry of chunksIter) {
    // Extract eventId from key: [..., 'chunks', eventId, chunkIndex]
    const key = entry.key;
    const eventId = key[key.length - 2] as string;
    const currentCount = chunkEventIds.get(eventId) || 0;
    chunkEventIds.set(eventId, currentCount + 1);
  }

  if (verbose) {
    console.log(`    Events with chunks: ${chunkEventIds.size}`);
  }

  // Identify orphaned chunks
  const orphanedEventIds = Array.from(chunkEventIds.keys())
    .filter(id => !validEventIds.has(id));

  if (orphanedEventIds.length === 0) {
    if (verbose) {
      console.log(`    No orphaned chunks found`);
    }
    return { orphanedEvents: 0, chunksDeleted: 0, bytesFreed: 0 };
  }

  if (verbose) {
    console.log(`    Orphaned events found: ${orphanedEventIds.length}`);
  }

  // Delete or count orphaned chunks
  let chunksDeleted = 0;
  let bytesFreed = 0;

  for (const eventId of orphanedEventIds) {
    const orphanIter = kv.list({
      prefix: [...keyPrefix, 'stream', streamId, 'chunks', eventId],
    });

    const chunksToDelete: Deno.KvKey[] = [];
    for await (const entry of orphanIter) {
      chunksToDelete.push(entry.key);
      // Estimate bytes (rough approximation)
      bytesFreed += 64 * 1024; // Assume ~64KB per chunk
    }

    if (verbose) {
      console.log(`      Event ${eventId}: ${chunksToDelete.length} chunks`);
    }

    if (!dryRun) {
      // Delete chunks in batches
      const batchSize = 10;
      for (let i = 0; i < chunksToDelete.length; i += batchSize) {
        const batch = chunksToDelete.slice(i, i + batchSize);
        const atomic = kv.atomic();
        for (const key of batch) {
          atomic.delete(key);
        }
        await atomic.commit();
      }
    }

    chunksDeleted += chunksToDelete.length;
  }

  return {
    orphanedEvents: orphanedEventIds.length,
    chunksDeleted,
    bytesFreed,
  };
}

/**
 * Main cleanup function
 */
async function runCleanup(options: CleanupOptions): Promise<CleanupStats> {
  console.log('\n=== Orphaned Chunk Cleanup ===\n');
  console.log(`KV Path: ${options.kvPath}`);
  console.log(`Key Prefix: ${options.keyPrefix.join('.')}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE (will delete)'}`);
  if (options.streamId) {
    console.log(`Target Stream: ${options.streamId}`);
  } else {
    console.log(`Target: All streams`);
  }
  console.log('');

  // Open KV store
  const kv = await Deno.openKv(options.kvPath);

  try {
    const stats: CleanupStats = {
      streamsProcessed: 0,
      orphanedEventsFound: 0,
      chunksDeleted: 0,
      bytesFreed: 0,
    };

    // Get stream IDs to process
    let streamIds: string[];
    if (options.streamId) {
      streamIds = [options.streamId];
    } else {
      streamIds = await getStreamIds(kv, options.keyPrefix);
    }

    console.log(`Found ${streamIds.length} stream(s) to process\n`);

    // Process each stream
    for (const streamId of streamIds) {
      const result = await cleanupStreamOrphanedChunks(
        kv,
        options.keyPrefix,
        streamId,
        options.dryRun,
        options.verbose,
      );

      stats.streamsProcessed++;
      stats.orphanedEventsFound += result.orphanedEvents;
      stats.chunksDeleted += result.chunksDeleted;
      stats.bytesFreed += result.bytesFreed;

      if (!options.verbose && result.orphanedEvents > 0) {
        console.log(`  Stream ${streamId}: ${result.orphanedEvents} orphaned events, ${result.chunksDeleted} chunks`);
      }
    }

    // Print summary
    console.log('\n=== Cleanup Summary ===\n');
    console.log(`Streams processed: ${stats.streamsProcessed}`);
    console.log(`Orphaned events found: ${stats.orphanedEventsFound}`);
    console.log(`Chunks ${options.dryRun ? 'to be deleted' : 'deleted'}: ${stats.chunksDeleted}`);
    console.log(`Storage ${options.dryRun ? 'to be freed' : 'freed'}: ${(stats.bytesFreed / 1024 / 1024).toFixed(2)} MB`);

    if (options.dryRun && stats.chunksDeleted > 0) {
      console.log('\nRun without --dry-run to actually delete orphaned chunks.');
    }

    console.log('');

    return stats;
  } finally {
    kv.close();
  }
}

/**
 * Entry point
 */
if (import.meta.main) {
  try {
    const options = parseArguments();
    const stats = await runCleanup(options);
    
    // Exit with error code if chunks were found but not deleted in dry-run mode
    if (options.dryRun && stats.chunksDeleted > 0) {
      Deno.exit(1);
    }
    
    Deno.exit(0);
  } catch (error) {
    console.error('\nError during cleanup:', error);
    Deno.exit(1);
  }
}
