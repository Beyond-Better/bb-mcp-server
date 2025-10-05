/**
 * TransportPersistenceStore Unit Tests
 *
 * Comprehensive tests for HTTP transport session persistence and restoration
 *
 * Test Coverage Requirements:
 * - Session persistence lifecycle (persist, update, mark inactive)
 * - Session restoration after server restart
 * - Session querying (by ID, by user, active sessions)
 * - Session cleanup and statistics
 * - Error handling and edge cases
 * - Integration with KVManager and MCP SDK
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { TransportPersistenceStore } from '../../../src/lib/storage/TransportPersistenceStore.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import { TransportEventStore } from '../../../src/lib/storage/TransportEventStore.ts';
//import type { Logger } from '../../../src/types/library.types.ts';
import type { TransportConfig } from '../../../src/lib/transport/TransportTypes.ts';
import type { PersistedSessionInfo } from '../../../src/lib/storage/TransportPersistenceStore.ts';
import { MockSdkMcpServer, SpyLogger } from '../../utils/test-helpers.ts';
import { StreamableHTTPServerTransport } from 'mcp/server/streamableHttp.js';

// Helper function to create test dependencies
async function createTestDependencies() {
  const kvManager = new KVManager({ kvPath: ':memory:' });
  await kvManager.initialize();

  const spyLogger = new SpyLogger();
  const eventStore = new TransportEventStore(kvManager, undefined, spyLogger);

  const transportConfig: TransportConfig = {
    type: 'http',
    http: {
      hostname: 'localhost',
      port: 3000,
      sessionTimeout: 30 * 60 * 1000,
      sessionCleanupInterval: 5 * 60 * 1000,
      maxConcurrentSessions: 100,
      enableSessionPersistence: true,
      requestTimeout: 30000,
      maxRequestSize: 1048576,
      preserveCompatibilityMode: true,
      allowInsecure: false,
    },
  };

  return {
    kvManager,
    eventStore,
    spyLogger,
    transportConfig,
  };
}

// Helper function to clean up test dependencies
async function cleanupTestDependencies(dependencies: {
  kvManager: KVManager;
}): Promise<void> {
  await dependencies.kvManager.close();
}

// Helper function to create test session info
function createTestSessionInfo(
  sessionId: string,
  overrides: Partial<PersistedSessionInfo> = {},
): PersistedSessionInfo {
  return {
    sessionId,
    userId: `user_${sessionId}`,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    isActive: true,
    transportConfig: {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost', 'localhost:3000'],
      enableDnsRebindingProtection: true,
    },
    metadata: {
      userAgent: 'Test Browser',
      clientInfo: 'test-client',
    },
    ...overrides,
  };
}

Deno.test({
  name: 'TransportPersistenceStore - Initialize with Default Configuration',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    assertExists(persistenceStore);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Initialize with Custom Key Prefix',
  async fn() {
    const dependencies = await createTestDependencies();

    const customPrefix = ['custom', 'transport', 'sessions'];
    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
      customPrefix,
    );

    assertExists(persistenceStore);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Persist Session',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const sessionId = 'test_session_persist';
    const userId = 'test_user_123';

    // Mock transport (we don't need actual implementation)
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost', 'localhost:3000'],
    };

    const metadata = {
      userAgent: 'Test Browser/1.0',
      clientInfo: 'test-client-id',
    };

    // Persist session
    await persistenceStore.persistSession(
      sessionId,
      mockTransport,
      config,
      userId,
      metadata,
    );

    // Retrieve persisted session
    const retrievedSession = await persistenceStore.getSessionInfo(sessionId);

    assertExists(retrievedSession);
    assertEquals(retrievedSession.sessionId, sessionId);
    assertEquals(retrievedSession.userId, userId);
    assertEquals(retrievedSession.isActive, true);
    assertEquals(retrievedSession.transportConfig.hostname, 'localhost');
    assertEquals(retrievedSession.transportConfig.port, 3000);
    assertEquals(retrievedSession.metadata?.userAgent, 'Test Browser/1.0');
    assertEquals(retrievedSession.metadata?.clientInfo, 'test-client-id');

    // Verify timestamps are set
    assertExists(retrievedSession.createdAt);
    assertExists(retrievedSession.lastActivity);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Persist Session Without User ID',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const sessionId = 'test_session_anonymous';
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist session without userId
    await persistenceStore.persistSession(
      sessionId,
      mockTransport,
      config,
      undefined, // No userId
      undefined, // No metadata
    );

    // Retrieve persisted session
    const retrievedSession = await persistenceStore.getSessionInfo(sessionId);

    assertExists(retrievedSession);
    assertEquals(retrievedSession.sessionId, sessionId);
    assertEquals(retrievedSession.userId, undefined);
    assertEquals(retrievedSession.isActive, true);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Update Session Activity',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const sessionId = 'test_session_activity';
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist session
    await persistenceStore.persistSession(
      sessionId,
      mockTransport,
      config,
      'test_user',
    );

    // Get initial session
    const initialSession = await persistenceStore.getSessionInfo(sessionId);
    assertExists(initialSession);
    const initialActivity = initialSession.lastActivity;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Update session activity
    await persistenceStore.updateSessionActivity(sessionId);

    // Get updated session
    const updatedSession = await persistenceStore.getSessionInfo(sessionId);
    assertExists(updatedSession);

    // Verify activity timestamp was updated
    assert(updatedSession.lastActivity > initialActivity);
    assertEquals(updatedSession.isActive, true); // Should remain active

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Update Activity for Non-Existent Session',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    // Try to update non-existent session (should not throw)
    await persistenceStore.updateSessionActivity('nonexistent_session');

    // Verify session doesn't exist
    const session = await persistenceStore.getSessionInfo('nonexistent_session');
    assertEquals(session, null);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Mark Session Inactive',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const sessionId = 'test_session_inactive';
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist active session
    await persistenceStore.persistSession(
      sessionId,
      mockTransport,
      config,
      'test_user',
    );

    // Verify session is active
    const activeSession = await persistenceStore.getSessionInfo(sessionId);
    assertExists(activeSession);
    assertEquals(activeSession.isActive, true);

    // Mark session as inactive
    await persistenceStore.markSessionInactive(sessionId);

    // Verify session is now inactive
    const inactiveSession = await persistenceStore.getSessionInfo(sessionId);
    assertExists(inactiveSession);
    assertEquals(inactiveSession.isActive, false);

    // Verify lastActivity was updated
    assert(inactiveSession.lastActivity >= activeSession.lastActivity);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Mark Non-Existent Session Inactive',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    // Try to mark non-existent session as inactive (should not throw)
    await persistenceStore.markSessionInactive('nonexistent_session');

    // Verify session doesn't exist
    const session = await persistenceStore.getSessionInfo('nonexistent_session');
    assertEquals(session, null);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get Session Info',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const sessionId = 'test_session_get';
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'test-host',
      port: 8080,
      allowedHosts: ['test-host', 'test-host:8080'],
    };

    // Persist session
    await persistenceStore.persistSession(
      sessionId,
      mockTransport,
      config,
      'get_test_user',
      { custom: 'metadata' },
    );

    // Get session info
    const sessionInfo = await persistenceStore.getSessionInfo(sessionId);

    assertExists(sessionInfo);
    assertEquals(sessionInfo.sessionId, sessionId);
    assertEquals(sessionInfo.userId, 'get_test_user');
    assertEquals(sessionInfo.transportConfig.hostname, 'test-host');
    assertEquals(sessionInfo.transportConfig.port, 8080);
    assertEquals(sessionInfo.metadata?.custom, 'metadata');

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get Non-Existent Session Info',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    // Try to get non-existent session
    const sessionInfo = await persistenceStore.getSessionInfo('nonexistent_session');

    assertEquals(sessionInfo, null);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get User Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const userId = 'multi_session_user';
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist multiple sessions for the same user
    await persistenceStore.persistSession('session_1', mockTransport, config, userId);
    await persistenceStore.persistSession('session_2', mockTransport, config, userId);
    await persistenceStore.persistSession('session_3', mockTransport, config, userId);

    // Persist session for different user
    await persistenceStore.persistSession(
      'other_session',
      mockTransport,
      config,
      'other_user',
    );

    // Get sessions for the user
    const userSessions = await persistenceStore.getUserSessions(userId);

    assertEquals(userSessions.length, 3);

    // Verify all sessions belong to the user
    for (const session of userSessions) {
      assertEquals(session.userId, userId);
    }

    // Session IDs should be different
    const sessionIds = userSessions.map((s) => s.sessionId);
    const uniqueIds = new Set(sessionIds);
    assertEquals(uniqueIds.size, 3);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get User Sessions for Non-Existent User',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    // Try to get sessions for non-existent user
    const userSessions = await persistenceStore.getUserSessions('nonexistent_user');

    assertEquals(userSessions.length, 0);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get Active Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist active sessions
    await persistenceStore.persistSession('active_1', mockTransport, config, 'user_1');
    await persistenceStore.persistSession('active_2', mockTransport, config, 'user_2');

    // Persist and mark one as inactive
    await persistenceStore.persistSession('inactive_1', mockTransport, config, 'user_3');
    await persistenceStore.markSessionInactive('inactive_1');

    // Get active sessions
    const activeSessions = await persistenceStore.getActiveSessions();

    assertEquals(activeSessions.length, 2);

    // Verify all returned sessions are active
    for (const session of activeSessions) {
      assertEquals(session.isActive, true);
    }

    // Verify session IDs
    const sessionIds = activeSessions.map((s) => s.sessionId).sort();
    assertEquals(sessionIds, ['active_1', 'active_2']);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Restore Transports',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost', 'localhost:3000'],
    };

    // Persist active sessions
    await persistenceStore.persistSession('restore_1', mockTransport, config, 'user_1');
    await persistenceStore.persistSession('restore_2', mockTransport, config, 'user_2');

    // Create mock MCP server
    const mockSdkMcpServer = new MockSdkMcpServer(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: {} },
    );

    // Mock the connect method
    await mockSdkMcpServer.connect();

    // Create transport map for restoration
    const transportMap = new Map<string, StreamableHTTPServerTransport>();

    // Restore transports
    const result = await persistenceStore.restoreTransports(
      mockSdkMcpServer as any,
      transportMap,
      dependencies.eventStore,
    );

    // Verify restoration result
    assertEquals(result.restoredCount, 2);
    assertEquals(result.failedCount, 0);
    assertEquals(result.errors.length, 0);

    // Verify transports were added to map
    assertEquals(transportMap.size, 2);
    assert(transportMap.has('restore_1'));
    assert(transportMap.has('restore_2'));

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Restore Transports with No Active Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    // Create mock MCP server
    const mockSdkMcpServer = new MockSdkMcpServer(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: {} },
    );

    await mockSdkMcpServer.connect();

    const transportMap = new Map<string, StreamableHTTPServerTransport>();

    // Restore transports (no active sessions)
    const result = await persistenceStore.restoreTransports(
      mockSdkMcpServer as any,
      transportMap,
      dependencies.eventStore,
    );

    // Verify restoration result
    assertEquals(result.restoredCount, 0);
    assertEquals(result.failedCount, 0);
    assertEquals(result.errors.length, 0);
    assertEquals(transportMap.size, 0);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Restore Transports Ignores Inactive Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist sessions
    await persistenceStore.persistSession('active_session', mockTransport, config, 'user_1');
    await persistenceStore.persistSession('inactive_session', mockTransport, config, 'user_2');

    // Mark one as inactive
    await persistenceStore.markSessionInactive('inactive_session');

    // Create mock MCP server
    const mockSdkMcpServer = new MockSdkMcpServer(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: {} },
    );

    await mockSdkMcpServer.connect();

    const transportMap = new Map<string, StreamableHTTPServerTransport>();

    // Restore transports
    const result = await persistenceStore.restoreTransports(
      mockSdkMcpServer as any,
      transportMap,
      dependencies.eventStore,
    );

    // Verify only active session was restored
    assertEquals(result.restoredCount, 1);
    assertEquals(result.failedCount, 0);
    assertEquals(transportMap.size, 1);
    assert(transportMap.has('active_session'));
    assert(!transportMap.has('inactive_session'));

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Clean Up Old Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    const now = Date.now();
    const oldTime = now - (2 * 60 * 60 * 1000); // 2 hours ago

    // Persist recent session
    await persistenceStore.persistSession('recent_session', mockTransport, config, 'user_1');

    // Persist old session (manually create with old timestamp)
    const kv = dependencies.kvManager.getKV();
    const oldSession = createTestSessionInfo('old_session', {
      userId: 'user_2',
      createdAt: oldTime,
      lastActivity: oldTime,
      isActive: true,
    });

    await kv.set(['transport', 'session', 'old_session'], oldSession);
    await kv.set(['transport', 'session_by_user', 'user_2', 'old_session'], {
      sessionId: 'old_session',
      createdAt: oldTime,
    });

    // Clean up sessions older than 1 hour
    const maxAge = 60 * 60 * 1000; // 1 hour
    const deletedCount = await persistenceStore.cleanupOldSessions(maxAge);

    // Verify old session was deleted
    assertEquals(deletedCount, 1);

    const oldSessionInfo = await persistenceStore.getSessionInfo('old_session');
    assertEquals(oldSessionInfo, null);

    // Verify recent session still exists
    const recentSessionInfo = await persistenceStore.getSessionInfo('recent_session');
    assertExists(recentSessionInfo);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Clean Up Inactive Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist active session
    await persistenceStore.persistSession('active_session', mockTransport, config, 'user_1');

    // Persist and mark as inactive
    await persistenceStore.persistSession('inactive_session', mockTransport, config, 'user_2');
    await persistenceStore.markSessionInactive('inactive_session');

    // Clean up old sessions (max age = 24 hours, default)
    const deletedCount = await persistenceStore.cleanupOldSessions();

    // Verify inactive session was deleted
    assert(deletedCount >= 1);

    const inactiveSessionInfo = await persistenceStore.getSessionInfo('inactive_session');
    assertEquals(inactiveSessionInfo, null);

    // Verify active session still exists
    const activeSessionInfo = await persistenceStore.getSessionInfo('active_session');
    assertExists(activeSessionInfo);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get Session Statistics',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
      ['test_stats_' + Date.now()],
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    const now = Date.now();

    // Persist sessions with specific timestamps
    await persistenceStore.persistSession('session_1', mockTransport, config, 'user_1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await persistenceStore.persistSession('session_2', mockTransport, config, 'user_2');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await persistenceStore.persistSession('session_3', mockTransport, config, 'user_3');

    // Mark one as inactive
    await persistenceStore.markSessionInactive('session_2');

    // Get statistics
    const stats = await persistenceStore.getSessionStats();

    assertEquals(stats.total, 3);
    assertEquals(stats.active, 2);
    assertEquals(stats.inactive, 1);
    assertExists(stats.oldestSession);
    assertExists(stats.newestSession);

    // Verify oldest is before newest
    assert(stats.oldestSession! < stats.newestSession!);

    // Verify timestamps are reasonable (within last minute)
    assert(stats.oldestSession! >= now - 60000);
    assert(stats.newestSession! <= Date.now());

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Get Session Statistics with No Sessions',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    // Get statistics with no sessions
    const stats = await persistenceStore.getSessionStats();

    assertEquals(stats.total, 0);
    assertEquals(stats.active, 0);
    assertEquals(stats.inactive, 0);
    assertEquals(stats.oldestSession, null);
    assertEquals(stats.newestSession, null);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Batch Session Cleanup',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    // Persist multiple sessions
    for (let i = 0; i < 25; i++) {
      await persistenceStore.persistSession(
        `batch_session_${i}`,
        mockTransport,
        config,
        `user_${i}`,
      );
      // Mark as inactive
      await persistenceStore.markSessionInactive(`batch_session_${i}`);
    }

    // Verify sessions exist
    const statsBefore = await persistenceStore.getSessionStats();
    assertEquals(statsBefore.total, 25);
    assertEquals(statsBefore.inactive, 25);

    // Clean up all sessions
    const deletedCount = await persistenceStore.cleanupOldSessions();

    assertEquals(deletedCount, 25);

    // Verify all sessions deleted
    const statsAfter = await persistenceStore.getSessionStats();
    assertEquals(statsAfter.total, 0);

    await cleanupTestDependencies(dependencies);
  },
});

Deno.test({
  name: 'TransportPersistenceStore - Persist Session with Complex Metadata',
  async fn() {
    const dependencies = await createTestDependencies();

    const persistenceStore = new TransportPersistenceStore(
      dependencies.kvManager,
      dependencies.transportConfig,
      dependencies.spyLogger,
    );

    const sessionId = 'test_complex_metadata';
    const mockTransport = {} as StreamableHTTPServerTransport;

    const config = {
      hostname: 'localhost',
      port: 3000,
      allowedHosts: ['localhost'],
    };

    const complexMetadata = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      clientInfo: 'test-client-v2.0',
      connectionInfo: {
        ip: '127.0.0.1',
        protocol: 'HTTP/1.1',
        secure: false,
      },
      customData: {
        sessionType: 'development',
        features: ['tools', 'workflows', 'oauth'],
        config: {
          debug: true,
          verbose: false,
        },
      },
    };

    // Persist session with complex metadata
    await persistenceStore.persistSession(
      sessionId,
      mockTransport,
      config,
      'test_user',
      complexMetadata,
    );

    // Retrieve and verify
    const retrievedSession = await persistenceStore.getSessionInfo(sessionId);

    assertExists(retrievedSession);
    assertEquals(retrievedSession.metadata?.userAgent, complexMetadata.userAgent);
    assertEquals(
      retrievedSession.metadata?.connectionInfo,
      complexMetadata.connectionInfo,
    );
    assertEquals(
      retrievedSession.metadata?.customData,
      complexMetadata.customData,
    );

    await cleanupTestDependencies(dependencies);
  },
});
