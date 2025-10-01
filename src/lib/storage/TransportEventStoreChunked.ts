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
   * Compress data using Deno's built-in compression
   */
  private async compressData(data: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const inputData = encoder.encode(data);
    
    const compressionStream = new CompressionStream('gzip');
    const writer = compressionStream.writable.getWriter();
    const reader = compressionStream.readable.getReader();
    
    try {
      await writer.write(inputData);
      await writer.close();
      
      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }
      
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      
      return result;
    } finally {
      // Ensure streams are properly cleaned up to prevent hanging promises
      try {
        reader.releaseLock();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Decompress data using Deno's built-in decompression
   */
  private async decompressData(compressedData: Uint8Array): Promise<string> {
    const decompressionStream = new DecompressionStream('gzip');
    const writer = decompressionStream.writable.getWriter();
    const reader = decompressionStream.readable.getReader();
    
    try {
      await writer.write(new Uint8Array(compressedData));
      await writer.close();
      
      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }
      
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      
      const decoder = new TextDecoder();
      return decoder.decode(result);
    } finally {
      // Ensure streams are properly cleaned up to prevent hanging promises
      try {
        reader.releaseLock();
      } catch {
        // Ignore cleanup errors
      }
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
   */
  private async storeMessageInChunks(
    eventId: string,
    streamId: string,
    message: JSONRPCMessage,
    timestamp: number,
  ): Promise<void> {
    // Serialize the message
    const messageJson = JSON.stringify(message);
    const messageSize = new TextEncoder().encode(messageJson).length;

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
      try {
        const compressedData = await this.compressData(messageJson);
        const compressedBase64 = btoa(String.fromCharCode(...compressedData));
        
        // Only use compression if it actually reduces size significantly
        if (compressedBase64.length < messageJson.length * 0.9) {
          dataToStore = compressedBase64;
          compressed = true;
          this.logger?.debug('TransportEventStoreChunked: Compressed message', {
            originalSize: messageSize,
            compressedSize: compressedBase64.length,
            compressionRatio: (compressedBase64.length / messageSize).toFixed(2),
          });
        }
      } catch (error) {
        this.logger?.warn('TransportEventStoreChunked: Failed to compress message, storing uncompressed', {
          error: toError(error),
        });
      }
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

    // Store everything in a transaction
    const atomic = this.kv.atomic();
    
    // Store metadata
    atomic.set([...this.keyPrefix, 'stream', streamId, 'metadata', eventId], metadata);
    
    // Store all chunks
    for (const chunk of chunks) {
      atomic.set([...this.keyPrefix, 'stream', streamId, 'chunks', eventId, chunk.chunkIndex], chunk);
    }

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error('Failed to store chunked event in KV transaction');
    }

    this.logger?.debug('TransportEventStoreChunked: Stored chunked event', {
      streamId,
      eventId,
      chunkCount,
      compressed,
      originalSize: messageSize,
    });
  }

  /**
   * Reassemble message from chunks
   */
  private async reassembleMessage(eventId: string, streamId: string): Promise<JSONRPCMessage | null> {
    try {
      // Get metadata
      const metadataResult = await this.kv.get<StoredEventMetadata>([
        ...this.keyPrefix, 'stream', streamId, 'metadata', eventId,
      ]);
      
      if (!metadataResult.value) {
        return null;
      }
      
      const metadata = metadataResult.value;
      const chunks: StoredEventChunk[] = [];
      
      // Get all chunks
      for (let i = 0; i < metadata.chunkCount; i++) {
        const chunkResult = await this.kv.get<StoredEventChunk>([
          ...this.keyPrefix, 'stream', streamId, 'chunks', eventId, i,
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
          const compressedData = Uint8Array.from(atob(reassembledData), c => c.charCodeAt(0));
          reassembledData = await this.decompressData(compressedData);
        } catch (error) {
          throw new Error(`Failed to decompress event ${eventId}: ${error}`);
        }
      }
      
      // Parse JSON
      return JSON.parse(reassembledData) as JSONRPCMessage;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Failed to reassemble message', toError(error), {
        eventId,
        streamId,
      });
      return null;
    }
  }

  /**
   * Stores an event with chunked support
   * Implements EventStore.storeEvent
   */
  override async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    const eventId = this.generateEventId(streamId);
    const timestamp = Date.now();

    try {
      await this.storeMessageInChunks(eventId, streamId, message, timestamp);

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
    if (!lastEventId) {
      return '';
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
              this.logger?.warn('TransportEventStoreChunked: Failed to reassemble message for replay', {
                eventId,
                streamId,
              });
            }
          }
        }
      }

      this.logger?.info('TransportEventStoreChunked: Replayed events', {
        streamId,
        lastEventId,
        replayedCount,
      });

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
   */
  override async cleanupOldEvents(streamId: string, keepCount: number = 1000): Promise<number> {
    try {
      const metadataPrefix = [...this.keyPrefix, 'stream', streamId, 'metadata'];
      const events: Array<{ eventId: string; timestamp: number }> = [];

      // Collect all event metadata
      const iter = this.kv.list<StoredEventMetadata>({ prefix: metadataPrefix });
      for await (const entry of iter) {
        if (entry.value) {
          events.push({
            eventId: entry.value.eventId,
            timestamp: entry.value.timestamp,
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
          
          for (const { eventId } of batch) {
            // Delete metadata
            atomic.delete([...this.keyPrefix, 'stream', streamId, 'metadata', eventId]);
            
            // Delete all chunks (we don't know the exact count, so we'll try a reasonable range)
            for (let chunkIndex = 0; chunkIndex < 100; chunkIndex++) {
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

      this.logger?.info('TransportEventStoreChunked: Cleaned up old events', {
        streamId,
        deletedCount,
        remainingCount: events.length - deletedCount,
      });

      return deletedCount;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Failed to cleanup old events', toError(error), {
        streamId,
      });
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
        this.logger?.warn('TransportEventStoreChunked: Iterator error during statistics collection', {
          error: toError(iterError),
        });
      }

      stats.averageChunksPerEvent = stats.totalEvents > 0 ? stats.totalChunks / stats.totalEvents : 0;

      return stats;
    } catch (error) {
      this.logger?.error('TransportEventStoreChunked: Failed to get chunk statistics', toError(error));
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