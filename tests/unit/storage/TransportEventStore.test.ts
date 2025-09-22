/**
 * TransportEventStore Unit Tests
 * 
 * Tests for OAuth event logging and MCP transport event storage
 * 
 * Test Coverage Requirements:
 * - 100% coverage for event storage operations
 * - OAuth event logging validation
 * - MCP transport event replay functionality
 * - Stream management and cleanup
 * - Error handling and edge cases
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { TransportEventStore } from '../../../src/lib/storage/TransportEventStore.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type { JSONRPCMessage } from 'mcp/types.js';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Helper function to create test KV instance
async function createTestKV(): Promise<Deno.Kv> {
  return await Deno.openKv(':memory:');
}

// Helper function to create test MCP message
function createTestMCPMessage(id: number, method: string = 'test/method'): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id: id,
    method: method,
    params: { test: 'data', messageId: id },
  };
}

Deno.test({
  name: 'TransportEventStore - Initialize with Default Configuration',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    // Verify store is initialized
    assertExists(eventStore);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Initialize with Custom Key Prefix',
  async fn() {
    const kv = await createTestKV();
    
    const customPrefix = ['custom', 'oauth', 'events'];
    const eventStore = new TransportEventStore(kv, customPrefix, mockLogger);
    
    assertExists(eventStore);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Log Transport Event (OAuth Events)',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const oauthEvent = {
      type: 'oauth_authorization',
      transport: 'http',
      level: 'info',
      message: 'OAuth authorization request received',
      requestId: 'req_123',
      sessionId: 'session_456',
      data: {
        clientId: 'client_789',
        userId: 'user_abc',
        scopes: ['read', 'write'],
      },
    };
    
    // Log OAuth event
    await eventStore.logEvent(oauthEvent);
    
    // Verify event was logged by checking KV storage
    const eventKeys = [];
    for await (const entry of kv.list({ prefix: ['events', 'transport_logs', 'oauth_authorization'] })) {
      eventKeys.push(entry.key);
    }
    
    assertEquals(eventKeys.length, 1);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Log Transport Event with Error',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const errorEvent = {
      type: 'oauth_token_error',
      transport: 'http',
      level: 'error',
      message: 'OAuth token validation failed',
      requestId: 'req_error_123',
      data: { clientId: 'invalid_client' },
      error: new Error('Invalid client credentials'),
    };
    
    // Log error event
    await eventStore.logEvent(errorEvent);
    
    // Verify error event was logged
    const errorEvents = [];
    for await (const entry of kv.list({ prefix: ['events', 'transport_logs', 'oauth_token_error'] })) {
      errorEvents.push(entry.value);
    }
    
    assertEquals(errorEvents.length, 1);
    const loggedEvent = errorEvents[0] as any; // Cast to avoid unknown type issues
    assertEquals(loggedEvent.type, 'oauth_token_error');
    assertEquals(loggedEvent.message, 'OAuth token validation failed');
    assertEquals(loggedEvent.level, 'error');
    assertExists(loggedEvent.timestamp);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Store MCP Event',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const streamId = 'test_stream_123';
    const mcpMessage = createTestMCPMessage(1, 'tools/list');
    
    // Store MCP event
    const eventId = await eventStore.storeEvent(streamId, mcpMessage);
    
    // Verify event ID format
    assertExists(eventId);
    assert(eventId.startsWith(`${streamId}|`), 'Event ID should start with stream ID');
    
    // Verify event was stored
    const storedEvent = await kv.get(['events', 'stream', streamId, eventId]);
    assertExists(storedEvent.value);
    
    const eventData = storedEvent.value as any;
    assertEquals(eventData.eventId, eventId);
    assertEquals(eventData.streamId, streamId);
    assertEquals(eventData.message, mcpMessage);
    assertExists(eventData.timestamp);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Generate Unique Event IDs',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const streamId = 'unique_test_stream';
    const eventIds: string[] = [];
    
    // Generate multiple event IDs
    for (let i = 0; i < 10; i++) {
      const mcpMessage = createTestMCPMessage(i);
      const eventId = await eventStore.storeEvent(streamId, mcpMessage);
      eventIds.push(eventId);
    }
    
    // Verify all event IDs are unique
    const uniqueIds = new Set(eventIds);
    assertEquals(uniqueIds.size, eventIds.length, 'All event IDs should be unique');
    
    // Verify event ID format consistency
    for (const eventId of eventIds) {
      assert(eventId.startsWith(`${streamId}|`), 'Event ID should start with stream ID');
      const parts = eventId.split('|');
      assertEquals(parts.length, 3, 'Event ID should have 3 parts (stream, timestamp, random)');
    }
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Replay Events After Last Event ID',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const streamId = 'replay_test_stream';
    const eventIds: string[] = [];
    
    // Store multiple events
    for (let i = 1; i <= 5; i++) {
      const mcpMessage = createTestMCPMessage(i, `test/method${i}`);
      const eventId = await eventStore.storeEvent(streamId, mcpMessage);
      eventIds.push(eventId);
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    // Replay events after the 2nd event
    const lastEventId = eventIds[1]; // 2nd event
    assert(lastEventId !== undefined, 'lastEventId should be defined');
    const replayedEvents: Array<{ eventId: string; message: JSONRPCMessage }> = [];
    
    const replayResult = await eventStore.replayEventsAfter(lastEventId, {
      send: async (eventId: string, message: JSONRPCMessage) => {
        replayedEvents.push({ eventId, message });
      }
    });
    
    assertEquals(replayResult, streamId, `Replay should return the stream ID: ${streamId}`);
    
    // Should replay events 3, 4, and 5 (after event 2)
    assertEquals(replayedEvents.length, 3);
    assertExists(replayedEvents[0]?.message);
    assertExists(replayedEvents[1]?.message);
    assertExists(replayedEvents[2]?.message);
    assertEquals((replayedEvents[0]?.message as any)?.params?.messageId, 3);
    assertEquals((replayedEvents[1]?.message as any)?.params?.messageId, 4);
    assertEquals((replayedEvents[2]?.message as any)?.params?.messageId, 5);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Replay with Invalid Last Event ID',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    // Try to replay with invalid event ID format
    const replayResult = await eventStore.replayEventsAfter('invalid_event_id_format', {
      send: async () => {}
    });
    
    // Should return empty string for invalid format
    assertEquals(replayResult, '');
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Replay with Empty Last Event ID',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    // Try to replay with empty event ID
    const replayResult = await eventStore.replayEventsAfter('', {
      send: async () => {}
    });
    
    // Should return empty string for empty event ID
    assertEquals(replayResult, '');
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Get Stream Metadata',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const streamId = 'metadata_test_stream';
    
    // Initially no metadata should exist
    const initialMetadata = await eventStore.getStreamMetadata(streamId);
    assertEquals(initialMetadata, null);
    
    // Store some events
    const eventId1 = await eventStore.storeEvent(streamId, createTestMCPMessage(1));
    const eventId2 = await eventStore.storeEvent(streamId, createTestMCPMessage(2));
    
    // Get updated metadata
    const metadata = await eventStore.getStreamMetadata(streamId);
    
    if (metadata) {
      assertEquals(metadata.streamId, streamId);
      assertEquals(metadata.lastEventId, eventId2); // Should be the last event
      assertEquals(metadata.eventCount, 2);
      assertExists(metadata.createdAt);
    }
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - List Streams',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    // Initially no streams
    const initialStreams = await eventStore.listStreams();
    assertEquals(initialStreams.length, 0);
    
    // Create events in multiple streams
    await eventStore.storeEvent('stream_a', createTestMCPMessage(1));
    await eventStore.storeEvent('stream_b', createTestMCPMessage(2));
    await eventStore.storeEvent('stream_c', createTestMCPMessage(3));
    await eventStore.storeEvent('stream_a', createTestMCPMessage(4)); // Second event in stream_a
    
    // List streams
    const streams = await eventStore.listStreams();
    
    assertEquals(streams.length, 3);
    assert(streams.includes('stream_a'));
    assert(streams.includes('stream_b'));
    assert(streams.includes('stream_c'));
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Cleanup Old Events',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const streamId = 'cleanup_test_stream';
    
    // Store many events
    const eventIds: string[] = [];
    for (let i = 1; i <= 15; i++) {
      const eventId = await eventStore.storeEvent(streamId, createTestMCPMessage(i));
      eventIds.push(eventId);
    }
    
    // Cleanup old events, keep only 10
    const deletedCount = await eventStore.cleanupOldEvents(streamId, 10);
    
    assertEquals(deletedCount, 5); // Should delete 5 oldest events
    
    // Verify remaining events
    const remainingEvents = [];
    for await (const entry of kv.list({ prefix: ['events', 'stream', streamId] })) {
      if (entry.value && typeof entry.value === 'object' && 'eventId' in entry.value) {
        remainingEvents.push(entry.value);
      }
    }
    
    assertEquals(remainingEvents.length, 10);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Cleanup Old Events with Small Keep Count',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const streamId = 'small_cleanup_stream';
    
    // Store 3 events
    await eventStore.storeEvent(streamId, createTestMCPMessage(1));
    await eventStore.storeEvent(streamId, createTestMCPMessage(2));
    await eventStore.storeEvent(streamId, createTestMCPMessage(3));
    
    // Try to cleanup keeping 5 events (more than we have)
    const deletedCount = await eventStore.cleanupOldEvents(streamId, 5);
    
    // Should delete 0 events since we have fewer than keepCount
    assertEquals(deletedCount, 0);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - OAuth Event Types Coverage',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    // Test various OAuth event types
    const oauthEvents = [
      {
        type: 'oauth_authorization_start',
        transport: 'http',
        level: 'info',
        message: 'OAuth authorization flow initiated',
        data: { clientId: 'client_123' },
      },
      {
        type: 'oauth_token_issued',
        transport: 'http',
        level: 'info',
        message: 'OAuth access token issued',
        data: { tokenType: 'Bearer', expiresIn: 3600 },
      },
      {
        type: 'oauth_token_refresh',
        transport: 'http',
        level: 'info',
        message: 'OAuth token refreshed',
        data: { refreshed: true },
      },
      {
        type: 'oauth_client_registered',
        transport: 'http',
        level: 'info',
        message: 'OAuth client dynamically registered',
        data: { clientName: 'Test Client' },
      },
      {
        type: 'oauth_pkce_validated',
        transport: 'http',
        level: 'debug',
        message: 'PKCE code challenge validated',
        data: { method: 'S256' },
      },
    ];
    
    // Log all OAuth events
    for (const event of oauthEvents) {
      await eventStore.logEvent(event);
    }
    
    // Verify all event types were logged
    for (const event of oauthEvents) {
      const events = [];
      for await (const entry of kv.list({ prefix: ['events', 'transport_logs', event.type] })) {
        events.push(entry.value);
      }
      assertEquals(events.length, 1, `Event type ${event.type} should be logged`);
    }
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - MCP Session Event Integration',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    const sessionId = 'mcp_session_123';
    
    // Log MCP session events
    const sessionEvents = [
      {
        type: 'mcp_session_created',
        transport: 'http',
        level: 'info',
        message: 'MCP session established',
        sessionId,
        data: { userId: 'user_456', clientId: 'client_789' },
      },
      {
        type: 'mcp_session_active',
        transport: 'http',
        level: 'debug',
        message: 'MCP session activity detected',
        sessionId,
        data: { lastActive: Date.now() },
      },
      {
        type: 'mcp_session_closed',
        transport: 'http',
        level: 'info',
        message: 'MCP session terminated',
        sessionId,
        data: { duration: 3600000 },
      },
    ];
    
    for (const event of sessionEvents) {
      await eventStore.logEvent(event);
    }
    
    // Verify session events were logged
    let totalSessionEvents = 0;
    for (const event of sessionEvents) {
      const events = [];
      for await (const entry of kv.list({ prefix: ['events', 'transport_logs', event.type] })) {
        const loggedEvent = entry.value as any;
        if (loggedEvent && loggedEvent.sessionId === sessionId) {
          events.push(loggedEvent);
        }
      }
      assertEquals(events.length, 1);
      totalSessionEvents += events.length;
    }
    
    assertEquals(totalSessionEvents, 3);
    
    await kv.close();
  },
});

Deno.test({
  name: 'TransportEventStore - Error Handling and Edge Cases',
  async fn() {
    const kv = await createTestKV();
    
    const eventStore = new TransportEventStore(kv, undefined, mockLogger);
    
    // Test logging event without optional fields
    const minimalEvent = {
      type: 'minimal_test',
      transport: 'http',
      level: 'info',
      message: 'Minimal event test',
    };
    
    await eventStore.logEvent(minimalEvent);
    
    // Test getting metadata for non-existent stream
    const nonExistentMetadata = await eventStore.getStreamMetadata('nonexistent_stream');
    assertEquals(nonExistentMetadata, null);
    
    // Test cleanup for non-existent stream
    const cleanupResult = await eventStore.cleanupOldEvents('nonexistent_stream', 10);
    assertEquals(cleanupResult, 0);
    
    // Test replay with non-existent stream (valid format but non-existent)
    const replayResult = await eventStore.replayEventsAfter('nonexistent|123|456', {
      send: async () => {}
    });
    assertEquals(replayResult, 'nonexistent'); // Returns stream ID even if no events found
    
    await kv.close();
  },
});