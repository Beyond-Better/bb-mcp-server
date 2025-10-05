/**
 * TransportEventStoreChunked Unit Tests
 *
 * Tests for chunked storage functionality including:
 * - Large message handling beyond 64KB limit
 * - Compression and decompression
 * - Chunk integrity verification
 * - Storage statistics and monitoring
 * - Error handling for oversized messages
 */

import { assert, assertEquals, assertExists, assertRejects } from '@std/assert';
import { TransportEventStoreChunked } from '../../../src/lib/storage/TransportEventStoreChunked.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type { JSONRPCMessage } from 'mcp/types.js';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Helper to create test KV instance
async function createTestKvManager(): Promise<KVManager> {
  const kvManager = new KVManager({ kvPath: ':memory:' });
  await kvManager.initialize();
  return kvManager;
}

// Helper function to close kvManager
async function cleanupTestDependencies(kvManager: KVManager): Promise<void> {
  await kvManager.close();
}

// Helper to create test config that avoids hanging promises
function getTestConfig() {
  return {
    maxChunkSize: 50 * 1024, // 50KB
    enableCompression: false, // Disable compression to avoid stream cleanup issues
    compressionThreshold: 2048,
    maxMessageSize: 5 * 1024 * 1024, // 5MB
  };
}

// Helper to create large test message
function createLargeMessage(sizeKB: number): JSONRPCMessage {
  const targetSize = sizeKB * 1024;
  const baseItem = {
    id: 0,
    timestamp: new Date().toISOString(),
    content: 'This is test content that will be repeated to create a large message. ',
    metadata: {
      category: 'test',
      tags: ['large', 'test', 'chunked'],
    },
  };

  const itemJson = JSON.stringify(baseItem);
  const itemCount = Math.ceil(targetSize / itemJson.length);

  const data = [];
  for (let i = 0; i < itemCount; i++) {
    data.push({
      ...baseItem,
      id: i,
      content: baseItem.content.repeat(Math.max(1, Math.floor(100 / itemCount))),
    });
  }

  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'test/large_message',
    params: {
      type: 'large_test_data',
      size: `${sizeKB}KB`,
      itemCount,
      data,
      generatedAt: new Date().toISOString(),
    },
  };
}

// Test suite
Deno.test({
  name: 'TransportEventStoreChunked - Initialize with Default Configuration',
  async fn() {
    const kvManager = await createTestKvManager();

    const eventStore = new TransportEventStoreChunked(
      kvManager,
      undefined,
      mockLogger,
      getTestConfig(),
    );

    // Verify store is initialized
    assertExists(eventStore);

    cleanupTestDependencies(kvManager);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'TransportEventStoreChunked - Initialize with Custom Configuration',
  async fn() {
    const kvManager = await createTestKvManager();

    const config = {
      maxChunkSize: 50 * 1024, // 50KB
      enableCompression: false,
      compressionThreshold: 2048,
      maxMessageSize: 5 * 1024 * 1024, // 5MB
    };

    const eventStore = new TransportEventStoreChunked(
      kvManager,
      ['test_events'],
      mockLogger,
      config,
    );

    assertExists(eventStore);

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Store Small Message (No Chunking)',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(
      kvManager,
      ['test'],
      mockLogger,
      getTestConfig(),
    );

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test/small_message',
      params: { content: 'Small test message' },
    };

    const eventId = await eventStore.storeEvent('test-stream-1', message);

    assertExists(eventId);
    assert(eventId.startsWith('test-stream-1|'));

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Store Large Message (100KB)',
  async fn() {
    const kvManager = await createTestKvManager();
    let eventStore: TransportEventStoreChunked | undefined;

    try {
      // Disable compression for this test to avoid stream cleanup issues
      eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger, {
        enableCompression: false,
      });

      // Create a 100KB message
      const largeMessage = createLargeMessage(100);

      const eventId = await eventStore.storeEvent('test-stream-large', largeMessage);

      assertExists(eventId);
      assert(eventId.startsWith('test-stream-large|'));

      // Verify chunk statistics
      const stats = await eventStore.getChunkStatistics('test-stream-large');
      assertEquals(stats.totalEvents, 1);
      assert(stats.totalChunks > 1); // Should be chunked
    } finally {
      cleanupTestDependencies(kvManager);
    }
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Store Very Large Message (500KB)',
  async fn() {
    const kvManager = await createTestKvManager();

    try {
      // Disable compression to avoid stream cleanup issues
      const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger, {
        enableCompression: false,
      });

      // Create a 500KB message
      const veryLargeMessage = createLargeMessage(500);

      const eventId = await eventStore.storeEvent('test-stream-xl', veryLargeMessage);

      assertExists(eventId);

      // Verify chunk statistics
      const stats = await eventStore.getChunkStatistics('test-stream-xl');
      assertEquals(stats.totalEvents, 1);
      assert(stats.totalChunks >= 8); // Should require multiple chunks
      assert(stats.averageChunksPerEvent >= 8);
    } finally {
      cleanupTestDependencies(kvManager);
    }
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Reject Oversized Message',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger, {
      maxMessageSize: 100 * 1024, // 100KB limit
    });

    // Try to store a 200KB message (should fail)
    const oversizedMessage = createLargeMessage(200);

    await assertRejects(
      async () => {
        await eventStore.storeEvent('test-stream-oversized', oversizedMessage);
      },
      Error,
      'exceeds maximum allowed size',
    );

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Message Replay After Storage',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger);

    const streamId = 'test-stream-replay';

    // Store multiple messages
    const message1 = createLargeMessage(50);
    const message2 = createLargeMessage(75);
    const message3 = createLargeMessage(100);

    const eventId1 = await eventStore.storeEvent(streamId, message1);
    const eventId2 = await eventStore.storeEvent(streamId, message2);
    const eventId3 = await eventStore.storeEvent(streamId, message3);

    // Test replay from first event
    const replayedMessages: Array<{ eventId: string; message: JSONRPCMessage }> = [];

    await eventStore.replayEventsAfter(eventId1, {
      send: async (eventId: string, message: JSONRPCMessage) => {
        replayedMessages.push({ eventId, message });
      },
    });

    // Should replay 2 messages (after eventId1)
    assertEquals(replayedMessages.length, 2);
    assertEquals(replayedMessages[0]?.eventId, eventId2);
    assertEquals(replayedMessages[1]?.eventId, eventId3);

    // Verify message content integrity
    assertEquals((replayedMessages[0]?.message as any)?.params?.size, '75KB');
    assertEquals((replayedMessages[1]?.message as any)?.params?.size, '100KB');

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Compression Functionality',
  async fn() {
    const kvManager = await createTestKvManager();

    try {
      const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger, {
        enableCompression: true,
        compressionThreshold: 1024, // 1KB
      });

      // Create a message with highly compressible content
      const compressibleContent = 'This is highly repetitive content. '.repeat(1000);
      const compressibleMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/compressible',
        params: {
          type: 'compressible_test',
          content: compressibleContent,
        },
      };

      const eventId = await eventStore.storeEvent('test-stream-compress', compressibleMessage);

      assertExists(eventId);

      // Get statistics to verify compression was used
      const stats = await eventStore.getChunkStatistics('test-stream-compress');
      assertEquals(stats.totalEvents, 1);
      assert(stats.compressionStats.compressed >= 1); // At least one compressed event

      // Verify replay works correctly with compressed data
      const replayedMessages: JSONRPCMessage[] = [];
      await eventStore.replayEventsAfter('', {
        send: async (eventId: string, message: JSONRPCMessage) => {
          replayedMessages.push(message);
        },
      });

      assertEquals(replayedMessages.length, 1);
      assertEquals((replayedMessages[0] as any)?.params?.content, compressibleContent);
    } finally {
      cleanupTestDependencies(kvManager);
    }
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Global Statistics',
  async fn() {
    const kvManager = await createTestKvManager();

    try {
      // Disable compression to avoid hanging promises
      const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger, {
        enableCompression: false,
      });

      // Store messages in multiple streams
      await eventStore.storeEvent('stream-1', createLargeMessage(50));
      await eventStore.storeEvent('stream-1', createLargeMessage(75));
      await eventStore.storeEvent('stream-2', createLargeMessage(100));

      // Get global statistics
      const stats = await eventStore.getChunkStatistics();

      assertEquals(stats.totalEvents, 3);
      assert(stats.totalChunks >= 3); // Should have multiple chunks
      assert(stats.averageChunksPerEvent >= 1);
      assertExists(stats.largestEvent);

      // Get stream-specific statistics
      const stream1Stats = await eventStore.getChunkStatistics('stream-1');
      assertEquals(stream1Stats.totalEvents, 2);

      const stream2Stats = await eventStore.getChunkStatistics('stream-2');
      assertEquals(stream2Stats.totalEvents, 1);
    } finally {
      cleanupTestDependencies(kvManager);
    }
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Stream Management',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger);

    const streams = ['stream-a', 'stream-b', 'stream-c'];

    // Store events in different streams
    for (const streamId of streams) {
      await eventStore.storeEvent(streamId, createLargeMessage(25));
    }

    // List all streams
    const listedStreams = await eventStore.listStreams();

    // Should contain all our test streams
    for (const streamId of streams) {
      assert(listedStreams.includes(streamId), `Stream ${streamId} should be listed`);
    }

    // Get metadata for each stream
    for (const streamId of streams) {
      const metadata = await eventStore.getStreamMetadata(streamId);
      assertExists(metadata);
      assertEquals(metadata.streamId, streamId);
      assertEquals(metadata.eventCount, 1);
      assertExists(metadata.lastEventId);
    }

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Cleanup Old Events',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger);

    const streamId = 'test-stream-cleanup';

    // Store 5 events - timestamps will naturally be different due to async processing
    const events = [];
    for (let i = 0; i < 5; i++) {
      // Add a small variation to ensure different messages and timestamps
      const message = createLargeMessage(25 + (i % 3)); // Vary size slightly (25, 26, 27KB)
      const eventId = await eventStore.storeEvent(streamId, message);
      events.push(eventId);
    }

    // Verify all events are stored
    let stats = await eventStore.getChunkStatistics(streamId);
    assertEquals(stats.totalEvents, 5);

    // Cleanup keeping only 3 events
    const deletedCount = await eventStore.cleanupOldEvents(streamId, 3);
    assertEquals(deletedCount, 2);

    // Verify only 3 events remain
    stats = await eventStore.getChunkStatistics(streamId);
    assertEquals(stats.totalEvents, 3);

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Transport Event Logging',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger);

    // Log various transport events
    await eventStore.logEvent({
      type: 'request',
      transport: 'http',
      level: 'info',
      message: 'Received MCP request',
      requestId: 'req-123',
      sessionId: 'session-456',
      data: { method: 'tools/list' },
    });

    await eventStore.logEvent({
      type: 'response',
      transport: 'http',
      level: 'info',
      message: 'Sent MCP response',
      requestId: 'req-123',
      sessionId: 'session-456',
      data: { toolCount: 5 },
    });

    await eventStore.logEvent({
      type: 'error',
      transport: 'http',
      level: 'error',
      message: 'Request processing failed',
      requestId: 'req-456',
      sessionId: 'session-456',
      error: new Error('Test error'),
      data: { method: 'tools/call' },
    });

    // Events should be logged without throwing errors
    // (Verification of log content would require more complex KV inspection)

    cleanupTestDependencies(kvManager);
  },
});

Deno.test({
  name: 'TransportEventStoreChunked - Error Handling for Corrupted Data',
  async fn() {
    const kvManager = await createTestKvManager();
    const eventStore = new TransportEventStoreChunked(kvManager, ['test'], mockLogger);

    // Store a valid message
    const message = createLargeMessage(50);
    const eventId = await eventStore.storeEvent('test-stream-corrupt', message);

    const kv = kvManager.getKV();

    // Manually corrupt a chunk by writing invalid data
    const corruptChunkKey = ['test', 'stream', 'test-stream-corrupt', 'chunks', eventId, 0];
    await kv.set(corruptChunkKey, {
      chunkIndex: 0,
      data: 'invalid-base64-data',
      checksum: 'invalid-checksum',
    });

    // Replay should handle corrupted data gracefully
    const replayedMessages: JSONRPCMessage[] = [];

    // This should not throw, but should log warnings about corruption
    await eventStore.replayEventsAfter('', {
      send: async (eventId: string, message: JSONRPCMessage) => {
        replayedMessages.push(message);
      },
    });

    // Should not replay the corrupted message
    assertEquals(replayedMessages.length, 0);

    cleanupTestDependencies(kvManager);
  },
});
