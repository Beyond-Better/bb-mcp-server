/**
 * Chunked Deno KV Implementation of EventStore for MCP Transport Resumability
 *
 * This implementation extends the base TransportEventStore with support for
 * large messages by breaking them into chunks that fit within Deno KV's 64KB
 * value size limit. Inherits all base functionality and overrides only the
 * methods that require chunking behavior.
 */

import type { JSONRPCMessage } from 'mcp/types.js';
import { TransportEventStore } from './TransportEventStore.ts';
import { toError } from '../utils/Error.ts';

export interface StoredEventMetadata {
  eventId: string;
  streamId: string;
  timestamp: number;
  messageSize: number;
  chunkCount: number;
  compressed: boolean;
}

export interface StoredEventChunk {
  chunkIndex: number;
  data: string; // Base64 encoded chunk data
  checksum: string; // For integrity verification
}

export interface StreamMetadata {
  streamId: string;
  createdAt: number;
  lastEventId: string;
  eventCount: number;
}

/**
 * Configuration for the chunked event store
 */
export interface ChunkedEventStoreConfig {
  /** Maximum size per chunk in bytes (default: 60KB, leaving room for metadata) */
  maxChunkSize?: number;
  /** Whether to compress large messages (default: true) */
  enableCompression?: boolean;
  /** Compression threshold in bytes (default: 1KB) */
  compressionThreshold?: number;
  /** Maximum total message size in bytes (default: 10MB) */
  maxMessageSize?: number;
}

/**
 * Chunked Deno KV-backed EventStore implementation for persistent MCP session state
 * Extends TransportEventStore with chunked storage capabilities for large messages
 */
export class TransportEventStoreChunked extends TransportEventStore {
  private config: Required<ChunkedEventStoreConfig>;

  constructor(
    kv: Deno.Kv,
    keyPrefix: readonly string[] = ['events'],
    logger?: any,
    config: ChunkedEventStoreConfig = {},
  ) {
    super(kv, keyPrefix, logger);
    this.config = {
      maxChunkSize: config.maxChunkSize ?? 60 * 1024, // 60KB
      enableCompression: config.enableCompression ?? true,
      compressionThreshold: config.compressionThreshold ?? 1024, // 1KB
      maxMessageSize: config.maxMessageSize ?? 10 * 1024 * 1024, // 10MB
    };
  }

  /**
   * Compress data using Deno's built-in compression with pipeTo
   * Uses Web Streams API pipeTo for proper stream coordination
   */
  private async compressData(data: string): Promise<Uint8Array> {
    // this.logger?.info('TransportEventStoreChunked: Starting compression', {
    //   dataLength: data.length,
    // });

    const encoder = new TextEncoder();
    const inputData = encoder.encode(data);

    // Create a ReadableStream from the input data
    const inputStream = new ReadableStream({
      start(controller) {
        controller.enqueue(inputData);
        controller.close();
      },
    });

    const compressionStream = new CompressionStream('gzip');

    // Collect compressed chunks
    const chunks: Uint8Array[] = [];
    const outputStream = new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    try {
      // this.logger?.info('TransportEventStoreChunked: Piping through compression stream');

      // Use pipeTo for proper stream coordination
      // This handles backpressure and cleanup automatically
      await inputStream
        .pipeThrough(compressionStream)
        .pipeTo(outputStream);

      // this.logger?.info('TransportEventStoreChunked: Compression pipe completed', {
      //   chunkCount: chunks.length,
      // });

      // Assemble result
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      // this.logger?.info('TransportEventStoreChunked: Compression complete', {
      //   originalSize: inputData.length,
      //   compressedSize: result.length,
      // });

      return result;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Compression failed', toError(error));
      throw error;
    }
  }

  /**
   * Decompress data using Deno's built-in decompression with pipeTo
   * Uses Web Streams API pipeTo for proper stream coordination
   */
  private async decompressData(compressedData: Uint8Array): Promise<string> {
    // this.logger?.info('TransportEventStoreChunked: Starting decompression', {
    //   compressedSize: compressedData.length,
    // });

    // Create a ReadableStream from the compressed data
    const inputStream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      },
    });

    const decompressionStream = new DecompressionStream('gzip');

    // Collect decompressed chunks
    const chunks: Uint8Array[] = [];
    const outputStream = new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    try {
      //this.logger?.info('TransportEventStoreChunked: Piping through decompression stream');

      // Use pipeTo for proper stream coordination
      // This handles backpressure and cleanup automatically
      await inputStream
        .pipeThrough(decompressionStream)
        .pipeTo(outputStream);

      // this.logger?.info('TransportEventStoreChunked: Decompression pipe completed', {
      //   chunkCount: chunks.length,
      // });

      // Assemble result
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder();
      const decompressed = decoder.decode(result);

      // this.logger?.info('TransportEventStoreChunked: Decompression complete', {
      //   decompressedSize: decompressed.length,
      // });

      return decompressed;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Decompression failed', toError(error));
      throw error;
    }
  }

  /**
   * Calculate simple checksum for data integrity
   */
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Break message into chunks and store them
   * Includes KV expiry as a fallback safety net (default: 90 days)
   */
  private async storeMessageInChunks(
    eventId: string,
    streamId: string,
    message: JSONRPCMessage,
    timestamp: number,
    expiryMs: number = 90 * 24 * 60 * 60 * 1000,
  ): Promise<void> {
    // this.logger?.info('TransportEventStoreChunked: storeMessageInChunks started', {
    //   eventId,
    //   streamId,
    // });

    // Serialize the message
    const messageJson = JSON.stringify(message);
    const messageSize = new TextEncoder().encode(messageJson).length;

    // this.logger?.info('TransportEventStoreChunked: Message serialized', {
    //   eventId,
    //   messageSize,
    // });

    // Check if message exceeds maximum allowed size
    if (messageSize > this.config.maxMessageSize) {
      throw new Error(
        `Message size (${messageSize} bytes) exceeds maximum allowed size (${this.config.maxMessageSize} bytes)`,
      );
    }

    let dataToStore = messageJson;
    let compressed = false;

    // Compress if enabled and data is above threshold
    if (this.config.enableCompression && messageSize >= this.config.compressionThreshold) {
      // this.logger?.info('TransportEventStoreChunked: Compression enabled, starting compression', {
      //   eventId,
      //   messageSize,
      //   threshold: this.config.compressionThreshold,
      //   enableCompression: this.config.enableCompression,
      // });

      try {
        const compressedData = await this.compressData(messageJson);

        // this.logger?.info('TransportEventStoreChunked: Compression completed', {
        //   eventId,
        //   compressedSize: compressedData.length,
        // });

        // Convert Uint8Array to base64 without spread operator (which fails for large arrays)
        // Use chunked conversion to avoid stack overflow
        let binaryString = '';
        const chunkSize = 8192; // Process 8KB at a time
        for (let i = 0; i < compressedData.length; i += chunkSize) {
          const chunk = compressedData.subarray(i, i + chunkSize);
          binaryString += String.fromCharCode(...chunk);
        }

        const compressedBase64 = btoa(binaryString);

        // this.logger?.info('TransportEventStoreChunked: Base64 conversion completed', {
        //   eventId,
        //   base64Length: compressedBase64.length,
        //   originalLength: messageJson.length,
        //   compressionThreshold: messageJson.length * 0.9,
        // });

        // Only use compression if it actually reduces size significantly
        if (compressedBase64.length < messageJson.length * 0.9) {
          dataToStore = compressedBase64;
          compressed = true;
          // this.logger?.info('TransportEventStoreChunked: Using compressed data', {
          //   originalSize: messageSize,
          //   compressedSize: compressedBase64.length,
          //   compressionRatio: (compressedBase64.length / messageSize).toFixed(2),
          // });
        } else {
          // this.logger?.info(
          //   'TransportEventStoreChunked: Compression not beneficial, using original',
          //   {
          //     originalSize: messageSize,
          //     compressedSize: compressedBase64.length,
          //     compressionRatio: (compressedBase64.length / messageSize).toFixed(2),
          //   },
          // );
        }
      } catch (error) {
        this.logger?.warn(
          'TransportEventStoreChunked: Failed to compress message, storing uncompressed',
          {
            error: toError(error),
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
        );
      }
    } else {
      // this.logger?.info('TransportEventStoreChunked: Compression not enabled or below threshold', {
      //   eventId,
      //   enableCompression: this.config.enableCompression,
      //   messageSize,
      //   threshold: this.config.compressionThreshold,
      //   meetsThreshold: messageSize >= this.config.compressionThreshold,
      // });
    }

    const chunks: StoredEventChunk[] = [];
    const dataBytes = new TextEncoder().encode(dataToStore);

    // Account for Base64 expansion (4/3 ratio) and metadata overhead
    // Use 45KB effective chunk size to ensure final chunk stays under 64KB
    const effectiveChunkSize = Math.floor(this.config.maxChunkSize * 0.75); // 45KB for 60KB config
    const chunkCount = Math.ceil(dataBytes.length / effectiveChunkSize);

    // Break data into chunks using byte arrays for accurate sizing
    for (let i = 0; i < chunkCount; i++) {
      const start = i * effectiveChunkSize;
      const end = Math.min(start + effectiveChunkSize, dataBytes.length);
      const chunkBytes = dataBytes.slice(start, end);
      const chunkData = new TextDecoder().decode(chunkBytes);

      chunks.push({
        chunkIndex: i,
        data: btoa(chunkData), // Base64 encode for safe storage
        checksum: this.calculateChecksum(chunkData),
      });
    }

    // Create metadata
    const metadata: StoredEventMetadata = {
      eventId,
      streamId,
      timestamp,
      messageSize,
      chunkCount,
      compressed,
    };

    // Store everything in a transaction with KV expiry as fallback
    const atomic = this.kv.atomic();

    // Store metadata with expiry
    atomic.set(
      [...this.keyPrefix, 'stream', streamId, 'metadata', eventId],
      metadata,
      { expireIn: expiryMs },
    );

    // Store all chunks with the same expiry
    for (const chunk of chunks) {
      atomic.set(
        [...this.keyPrefix, 'stream', streamId, 'chunks', eventId, chunk.chunkIndex],
        chunk,
        { expireIn: expiryMs },
      );
    }

    // this.logger?.info('TransportEventStoreChunked: About to commit KV transaction', {
    //   eventId,
    //   chunkCount,
    // });

    const result = await atomic.commit();

    // this.logger?.info('TransportEventStoreChunked: KV transaction committed', {
    //   eventId,
    //   success: result.ok,
    // });

    if (!result.ok) {
      throw new Error('Failed to store chunked event in KV transaction');
    }

    // this.logger?.info('TransportEventStoreChunked: Stored chunked event', {
    //   streamId,
    //   eventId,
    //   chunkCount,
    //   compressed,
    //   originalSize: messageSize,
    // });
  }

  /**
   * Reassemble message from chunks
   */
  private async reassembleMessage(
    eventId: string,
    streamId: string,
  ): Promise<JSONRPCMessage | null> {
    try {
      // Get metadata
      const metadataResult = await this.kv.get<StoredEventMetadata>([
        ...this.keyPrefix,
        'stream',
        streamId,
        'metadata',
        eventId,
      ]);

      if (!metadataResult.value) {
        return null;
      }

      const metadata = metadataResult.value;
      const chunks: StoredEventChunk[] = [];

      // Get all chunks
      for (let i = 0; i < metadata.chunkCount; i++) {
        const chunkResult = await this.kv.get<StoredEventChunk>([
          ...this.keyPrefix,
          'stream',
          streamId,
          'chunks',
          eventId,
          i,
        ]);

        if (!chunkResult.value) {
          throw new Error(`Missing chunk ${i} for event ${eventId}`);
        }

        chunks.push(chunkResult.value);
      }

      // Sort chunks by index (should already be in order, but be safe)
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      // Reassemble data
      let reassembledData = '';
      for (const chunk of chunks) {
        const chunkData = atob(chunk.data);

        // Verify checksum
        const expectedChecksum = this.calculateChecksum(chunkData);
        if (expectedChecksum !== chunk.checksum) {
          throw new Error(`Checksum mismatch for chunk ${chunk.chunkIndex} of event ${eventId}`);
        }

        reassembledData += chunkData;
      }

      // Decompress if needed
      if (metadata.compressed) {
        try {
          // Convert base64 to Uint8Array
          const binaryString = atob(reassembledData);
          const compressedData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            compressedData[i] = binaryString.charCodeAt(i);
          }
          reassembledData = await this.decompressData(compressedData);
        } catch (error) {
          throw new Error(`Failed to decompress event ${eventId}: ${error}`);
        }
      }

      // Parse JSON
      return JSON.parse(reassembledData) as JSONRPCMessage;
    } catch (error) {
      this.logger?.error(
        'TransportEventStoreChunked: Failed to reassemble message',
        toError(error),
        {
          eventId,
          streamId,
        },
      );
      return null;
    }
  }

  /**
   * Stores an event with chunked support
   * Implements EventStore.storeEvent
   */
  override async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    // this.logger?.info('TransportEventStoreChunked: storeEvent called', {
    //   streamId,
    //   messageMethod: (message as any).method,
    // });

    const eventId = this.generateEventId(streamId);
    const timestamp = Date.now();

    try {
      // this.logger?.info('TransportEventStoreChunked: About to store message in chunks', {
      //   eventId,
      //   streamId,
      // });

      await this.storeMessageInChunks(eventId, streamId, message, timestamp);

      //  this.logger?.info('TransportEventStoreChunked: Message stored in chunks successfully', {
      //    eventId,
      //    streamId,
      //  });

      // Update stream metadata separately (non-critical)
      try {
        await this.updateStreamMetadata(streamId, eventId);
      } catch (error) {
        this.logger?.warn('TransportEventStoreChunked: Failed to update stream metadata', {
          streamId,
          eventId,
          error,
        });
      }

      // this.logger?.info('TransportEventStoreChunked: storeEvent completed', {
      //   eventId,
      //   streamId,
      // });

      return eventId;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Failed to store event', toError(error), {
        streamId,
      });
      throw error;
    }
  }

  /**
   * Replays events that occurred after a specific event ID
   * Implements EventStore.replayEventsAfter
   */
  override async replayEventsAfter(
    lastEventId: string,
    { send }: { send: (eventId: string, message: JSONRPCMessage) => Promise<void> },
  ): Promise<string> {
    // If lastEventId is empty, this is a request to replay ALL events
    // We need to iterate through all streams and replay everything
    if (!lastEventId) {
      try {
        const allEvents: Array<
          { eventId: string; streamId: string; metadata: StoredEventMetadata }
        > = [];

        // Collect all event metadata from all streams
        const prefix = [...this.keyPrefix, 'stream'];
        const iter = this.kv.list<StoredEventMetadata>({ prefix }, {
          consistency: 'strong',
          batchSize: 100,
        });

        for await (const entry of iter) {
          if (entry.value && entry.key.includes('metadata')) {
            const metadata = entry.value;
            allEvents.push({
              eventId: metadata.eventId,
              streamId: metadata.streamId,
              metadata,
            });
          }
        }

        // Sort events by timestamp for chronological replay
        allEvents.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);

        // Replay all events
        let replayedCount = 0;
        for (const event of allEvents) {
          const message = await this.reassembleMessage(event.eventId, event.streamId);

          if (message) {
            await send(event.eventId, message);
            replayedCount++;
          } else {
            this.logger?.warn(
              'TransportEventStoreChunked: Failed to reassemble message for replay',
              {
                eventId: event.eventId,
                streamId: event.streamId,
              },
            );
          }
        }

        // this.logger?.info('TransportEventStoreChunked: Replayed all events', { replayedCount });
        return '';
      } catch (error) {
        this.logger?.error(
          'TransportEventStoreChunked: Failed to replay all events',
          toError(error),
        );
        return '';
      }
    }

    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) {
      this.logger?.warn('TransportEventStoreChunked: Invalid lastEventId format', { lastEventId });
      return '';
    }

    try {
      const events: Array<{ eventId: string; metadata: StoredEventMetadata }> = [];

      // Collect all event metadata for the stream
      const prefix = [...this.keyPrefix, 'stream', streamId, 'metadata'];
      const iter = this.kv.list<StoredEventMetadata>({ prefix }, {
        consistency: 'strong',
        batchSize: 100,
      });

      for await (const entry of iter) {
        if (entry.value) {
          events.push({ eventId: entry.value.eventId, metadata: entry.value });
        }
      }

      // Sort events by timestamp for chronological replay
      events.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);

      // Find the position of the last event and replay everything after it
      const lastEventIndex = events.findIndex(({ eventId }) => eventId === lastEventId);
      let replayedCount = 0;

      if (lastEventIndex !== -1) {
        // Replay all events after the last event
        for (let i = lastEventIndex + 1; i < events.length; i++) {
          const eventEntry = events[i];
          if (eventEntry) {
            const { eventId } = eventEntry;
            const message = await this.reassembleMessage(eventId, streamId);

            if (message) {
              await send(eventId, message);
              replayedCount++;
            } else {
              this.logger?.warn(
                'TransportEventStoreChunked: Failed to reassemble message for replay',
                {
                  eventId,
                  streamId,
                },
              );
            }
          }
        }
      }

      // this.logger?.info('TransportEventStoreChunked: Replayed events', {
      //   streamId,
      //   lastEventId,
      //   replayedCount,
      // });

      return streamId;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Failed to replay events', toError(error), {
        streamId,
        lastEventId,
      });
      return '';
    }
  }

  /**
   * Clean up old events (for maintenance)
   * Uses actual chunk count from metadata for efficient deletion
   */
  override async cleanupOldEvents(streamId: string, keepCount: number = 1000): Promise<number> {
    try {
      const metadataPrefix = [...this.keyPrefix, 'stream', streamId, 'metadata'];
      const events: Array<{ eventId: string; timestamp: number; chunkCount: number }> = [];

      // Collect all event metadata including chunk counts
      const iter = this.kv.list<StoredEventMetadata>({ prefix: metadataPrefix });
      for await (const entry of iter) {
        if (entry.value) {
          events.push({
            eventId: entry.value.eventId,
            timestamp: entry.value.timestamp,
            chunkCount: entry.value.chunkCount,
          });
        }
      }

      // Sort by timestamp (oldest first)
      events.sort((a, b) => a.timestamp - b.timestamp);

      // Delete old events if we have more than keepCount
      if (events.length <= keepCount) {
        return 0;
      }

      const toDelete = events.slice(0, events.length - keepCount);
      let deletedCount = 0;

      // Delete in batches to avoid transaction size limits
      const batchSize = 5; // Smaller batches due to multiple keys per event
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);

        try {
          const atomic = this.kv.atomic();

          for (const { eventId, chunkCount } of batch) {
            // Delete metadata
            atomic.delete([...this.keyPrefix, 'stream', streamId, 'metadata', eventId]);

            // Delete actual chunks using the stored chunk count
            for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
              atomic.delete([...this.keyPrefix, 'stream', streamId, 'chunks', eventId, chunkIndex]);
            }
          }

          const result = await atomic.commit();
          if (result.ok) {
            deletedCount += batch.length;
          }
        } catch (error) {
          this.logger?.warn('TransportEventStoreChunked: Failed to delete batch of old events', {
            streamId,
            batchStart: i,
            error: toError(error),
          });
        }
      }

      // this.logger?.info('TransportEventStoreChunked: Cleaned up old events', {
      //   streamId,
      //   deletedCount,
      //   remainingCount: events.length - deletedCount,
      // });

      return deletedCount;
    } catch (error) {
      this.logger?.error(
        'TransportEventStoreChunked: Failed to cleanup old events',
        toError(error),
        {
          streamId,
        },
      );
      return 0;
    }
  }

  /**
   * Clean up orphaned chunks (chunks without metadata)
   * Should be run periodically as maintenance
   */
  async cleanupOrphanedChunks(streamId: string): Promise<number> {
    try {
      // Get all metadata event IDs
      const validEventIds = new Set<string>();
      const metadataIter = this.kv.list<StoredEventMetadata>({
        prefix: [...this.keyPrefix, 'stream', streamId, 'metadata'],
      });

      for await (const entry of metadataIter) {
        if (entry.value) {
          validEventIds.add(entry.value.eventId);
        }
      }

      // Find chunk event IDs
      const chunkEventIds = new Set<string>();
      const chunksIter = this.kv.list({
        prefix: [...this.keyPrefix, 'stream', streamId, 'chunks'],
      });

      for await (const entry of chunksIter) {
        // Extract eventId from key: [..., 'chunks', eventId, chunkIndex]
        const key = entry.key;
        const eventId = key[key.length - 2] as string;
        chunkEventIds.add(eventId);
      }

      // Delete orphaned chunks
      const orphanedEventIds = Array.from(chunkEventIds)
        .filter((id) => !validEventIds.has(id));

      let deletedCount = 0;
      for (const eventId of orphanedEventIds) {
        // Delete all chunks for this orphaned event
        const orphanIter = this.kv.list({
          prefix: [...this.keyPrefix, 'stream', streamId, 'chunks', eventId],
        });

        for await (const entry of orphanIter) {
          await this.kv.delete(entry.key);
          deletedCount++;
        }
      }

      // this.logger?.info('TransportEventStoreChunked: Cleaned up orphaned chunks', {
      //   streamId,
      //   orphanedEvents: orphanedEventIds.length,
      //   chunksDeleted: deletedCount,
      // });

      return deletedCount;
    } catch (error) {
      this.logger?.error(
        'TransportEventStoreChunked: Failed to cleanup orphaned chunks',
        toError(error),
        {
          streamId,
        },
      );
      return 0;
    }
  }

  /**
   * Get statistics about chunk usage (for monitoring)
   */
  async getChunkStatistics(streamId?: string): Promise<{
    totalEvents: number;
    totalChunks: number;
    averageChunksPerEvent: number;
    largestEvent: { eventId: string; chunkCount: number } | null;
    compressionStats: { compressed: number; uncompressed: number };
  }> {
    try {
      const stats = {
        totalEvents: 0,
        totalChunks: 0,
        averageChunksPerEvent: 0,
        largestEvent: null as { eventId: string; chunkCount: number } | null,
        compressionStats: { compressed: 0, uncompressed: 0 },
      };

      const prefix = streamId
        ? [...this.keyPrefix, 'stream', streamId, 'metadata']
        : [...this.keyPrefix, 'stream'];

      const iter = this.kv.list<StoredEventMetadata>({ prefix }, { batchSize: 100 });

      try {
        for await (const entry of iter) {
          console.log('[DEBUG] getChunkStatistics: Processing entry', {
            key: entry.key,
            hasValue: !!entry.value,
            keyIncludesMetadata: entry.key.includes('metadata'),
            compressed: entry.value?.compressed,
          });
          if (entry.value && entry.key.includes('metadata')) {
            const metadata = entry.value;
            stats.totalEvents++;
            stats.totalChunks += metadata.chunkCount;

            if (!stats.largestEvent || metadata.chunkCount > stats.largestEvent.chunkCount) {
              stats.largestEvent = {
                eventId: metadata.eventId,
                chunkCount: metadata.chunkCount,
              };
            }

            if (metadata.compressed) {
              stats.compressionStats.compressed++;
            } else {
              stats.compressionStats.uncompressed++;
            }
          }
        }
      } catch (iterError) {
        // Ensure iterator cleanup on error
        this.logger?.warn(
          'TransportEventStoreChunked: Iterator error during statistics collection',
          {
            error: toError(iterError),
          },
        );
      }

      stats.averageChunksPerEvent = stats.totalEvents > 0
        ? stats.totalChunks / stats.totalEvents
        : 0;

      return stats;
    } catch (error) {
      this.logger?.error(
        'TransportEventStoreChunked: Failed to get chunk statistics',
        toError(error),
      );
      return {
        totalEvents: 0,
        totalChunks: 0,
        averageChunksPerEvent: 0,
        largestEvent: null,
        compressionStats: { compressed: 0, uncompressed: 0 },
      };
    }
  }
}
