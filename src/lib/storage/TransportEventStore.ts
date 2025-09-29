/**
 * Deno KV Implementation of EventStore for MCP Transport Resumability
 *
 * This implementation provides persistent event storage for MCP transports,
 * enabling session resumability across server restarts. It replaces the
 * in-memory EventStore with a Deno KV-backed solution.
 */

import type { JSONRPCMessage } from 'mcp/types.js';
import type { EventStore } from 'mcp/server/streamableHttp.js';
import { toError } from '../utils/Error.ts';

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
}

export interface StoredEvent {
  eventId: string;
  streamId: string;
  message: JSONRPCMessage;
  timestamp: number;
}

export interface StreamMetadata {
  streamId: string;
  createdAt: number;
  lastEventId: string;
  eventCount: number;
}

/**
 * Deno KV-backed EventStore implementation for persistent MCP session state
 */
export class TransportEventStore implements EventStore {
  private kv: Deno.Kv;
  private keyPrefix: readonly string[];
  private logger: Logger | undefined;

  constructor(
    kv: Deno.Kv,
    keyPrefix: readonly string[] = ['events'],
    logger?: Logger,
  ) {
    this.kv = kv;
    this.keyPrefix = keyPrefix;
    this.logger = logger;
  }

  /**
   * Log a transport event (for transport layer logging)
   */
  async logEvent(event: {
    type: string;
    transport: string;
    level: string;
    message: string;
    requestId?: string;
    sessionId?: string;
    data?: unknown;
    error?: Error;
  }): Promise<void> {
    try {
      const eventId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const logEntry = {
        ...event,
        id: eventId,
        timestamp: Date.now(),
        stored_at: new Date().toISOString(),
      };

      await this.kv.set([...this.keyPrefix, 'transport_logs', event.type, eventId], logEntry);

      // Also log to the logger if available
      if (this.logger) {
        const logMessage = `Transport: ${event.message}`;
        const logData = {
          type: event.type,
          transport: event.transport,
          requestId: event.requestId,
          sessionId: event.sessionId,
          data: event.data,
        };

        switch (event.level) {
          case 'error':
            this.logger.error(logMessage, event.error, logData);
            break;
          case 'warn':
            this.logger.warn(logMessage, logData);
            break;
          case 'debug':
            this.logger.debug(logMessage, logData);
            break;
          default:
            this.logger.info(logMessage, logData);
            break;
        }
      }
    } catch (error) {
      this.logger?.error('TransportEventStore: Failed to log event', toError(error), { event });
    }
  }

  /**
   * Generates a unique event ID for a given stream ID
   * Uses format: streamId|timestamp|random to avoid underscore conflicts
   */
  private generateEventId(streamId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${streamId}|${timestamp}|${random}`;
  }

  /**
   * Extracts the stream ID from an event ID
   */
  private getStreamIdFromEventId(eventId: string): string {
    const parts = eventId.split('|');
    return parts.length >= 3 ? (parts[0] ?? '') : '';
  }

  /**
   * Get the timestamp from an event ID for ordering
   */
  private getTimestampFromEventId(eventId: string): number {
    const parts = eventId.split('|');
    if (parts.length >= 3 && parts[1]) {
      return parseInt(parts[1], 36);
    }
    return 0;
  }

  /**
   * Stores an event with a generated event ID
   * Implements EventStore.storeEvent
   */
  async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    const eventId = this.generateEventId(streamId);
    const timestamp = Date.now();

    const storedEvent: StoredEvent = {
      eventId,
      streamId,
      message,
      timestamp,
    };

    try {
      // Use a transaction to store event and update metadata atomically
      const result = await this.kv.atomic()
        .set([...this.keyPrefix, 'stream', streamId, eventId], storedEvent)
        .commit();

      if (!result.ok) {
        throw new Error('Failed to store event in KV transaction');
      }

      // Update stream metadata separately (non-critical)
      try {
        await this.updateStreamMetadata(streamId, eventId);
      } catch (error) {
        this.logger?.warn('TransportEventStore: Failed to update stream metadata', {
          streamId,
          eventId,
          error,
        });
      }

      this.logger?.debug('TransportEventStore: Stored event', { streamId, eventId });
      return eventId;
    } catch (error) {
      this.logger?.error('TransportEventStore: Failed to store event', toError(error), {
        streamId,
      });
      throw error;
    }
  }

  /**
   * Replays events that occurred after a specific event ID
   * Implements EventStore.replayEventsAfter
   */
  async replayEventsAfter(
    lastEventId: string,
    { send }: { send: (eventId: string, message: JSONRPCMessage) => Promise<void> },
  ): Promise<string> {
    if (!lastEventId) {
      return '';
    }

    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) {
      this.logger?.warn('TransportEventStore: Invalid lastEventId format', { lastEventId });
      return '';
    }

    try {
      // Get the timestamp of the last event for efficient filtering
      const lastEventTimestamp = this.getTimestampFromEventId(lastEventId);
      let foundLastEvent = false;
      let replayedCount = 0;

      // Iterate through events for the stream, ordered by eventId
      const prefix = [...this.keyPrefix, 'stream', streamId];
      const iter = this.kv.list<StoredEvent>({ prefix }, {
        consistency: 'strong',
        batchSize: 100,
      });

      const events: Array<{ eventId: string; event: StoredEvent }> = [];

      // Collect all events first for sorting
      for await (const entry of iter) {
        const event = entry.value;
        if (event) {
          events.push({ eventId: event.eventId, event });
        }
      }

      // Sort events by timestamp for chronological replay
      events.sort((a, b) => a.event.timestamp - b.event.timestamp);

      // Find the position of the last event and replay everything after it
      const lastEventIndex = events.findIndex(({ eventId }) => eventId === lastEventId);

      if (lastEventIndex !== -1) {
        // Replay all events after the last event
        for (let i = lastEventIndex + 1; i < events.length; i++) {
          const eventEntry = events[i];
          if (eventEntry) {
            const { eventId, event } = eventEntry;
            await send(eventId, event.message);
            replayedCount++;
          }
        }
        foundLastEvent = true;
      }

      this.logger?.info('TransportEventStore: Replayed events', {
        streamId,
        lastEventId,
        replayedCount,
      });

      return streamId;
    } catch (error) {
      this.logger?.error('TransportEventStore: Failed to replay events', toError(error), {
        streamId,
        lastEventId,
      });
      return '';
    }
  }

  /**
   * Get stream metadata (for debugging/monitoring)
   */
  async getStreamMetadata(streamId: string): Promise<StreamMetadata | null> {
    try {
      const result = await this.kv.get<StreamMetadata>([
        ...this.keyPrefix,
        'stream_metadata',
        streamId,
      ]);
      return result.value;
    } catch (error) {
      this.logger?.error('TransportEventStore: Failed to get stream metadata', toError(error), {
        streamId,
      });
      return null;
    }
  }

  /**
   * List all streams (for debugging/monitoring)
   */
  async listStreams(): Promise<string[]> {
    try {
      const streams = new Set<string>();
      const prefix = [...this.keyPrefix, 'stream_metadata'];
      const iter = this.kv.list<StreamMetadata>({ prefix });

      for await (const entry of iter) {
        if (entry.value) {
          streams.add(entry.value.streamId);
        }
      }

      return Array.from(streams);
    } catch (error) {
      this.logger?.error('TransportEventStore: Failed to list streams', toError(error));
      return [];
    }
  }

  /**
   * Clean up old events (for maintenance)
   */
  async cleanupOldEvents(streamId: string, keepCount: number = 1000): Promise<number> {
    try {
      const prefix = [...this.keyPrefix, 'stream', streamId];
      const events: Array<{ key: Deno.KvKey; timestamp: number }> = [];

      // Collect all events with their timestamps
      const iter = this.kv.list<StoredEvent>({ prefix });
      for await (const entry of iter) {
        if (entry.value) {
          events.push({
            key: entry.key,
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
      const batchSize = 10;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);

        const atomic = this.kv.atomic();
        for (const { key } of batch) {
          atomic.delete(key);
        }

        const result = await atomic.commit();
        if (result.ok) {
          deletedCount += batch.length;
        } else {
          this.logger?.warn('TransportEventStore: Failed to delete batch of old events', {
            streamId,
            batchStart: i,
          });
        }
      }

      this.logger?.info('TransportEventStore: Cleaned up old events', {
        streamId,
        deletedCount,
        remainingCount: events.length - deletedCount,
      });

      return deletedCount;
    } catch (error) {
      this.logger?.error('TransportEventStore: Failed to cleanup old events', toError(error), {
        streamId,
      });
      return 0;
    }
  }

  /**
   * Update stream metadata
   */
  private async updateStreamMetadata(streamId: string, lastEventId: string): Promise<void> {
    const metadataKey = [...this.keyPrefix, 'stream_metadata', streamId];

    try {
      const existing = await this.kv.get<StreamMetadata>(metadataKey);
      const metadata: StreamMetadata = existing.value || {
        streamId,
        createdAt: Date.now(),
        lastEventId: '',
        eventCount: 0,
      };

      metadata.lastEventId = lastEventId;
      metadata.eventCount += 1;

      await this.kv.set(metadataKey, metadata);
    } catch (error) {
      // Non-critical error, just log it
      this.logger?.debug('TransportEventStore: Failed to update stream metadata', {
        streamId,
        error,
      });
    }
  }
}
