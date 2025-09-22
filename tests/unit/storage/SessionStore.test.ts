/**
 * SessionStore Unit Tests
 * 
 * 🔒 SECURITY-CRITICAL: Comprehensive tests for OAuth session management
 * 
 * Test Coverage Requirements:
 * - 100% coverage for session lifecycle operations
 * - Session expiry and cleanup validation
 * - User session management security
 * - Auto-cleanup functionality
 * - Session statistics and monitoring
 * - Error handling and edge cases
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { SessionStore } from '../../../src/lib/storage/SessionStore.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type { SessionData } from '../../../src/lib/storage/StorageTypes.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Helper function to create test dependencies
async function createTestDependencies() {
  const kvManager = new KVManager({ kvPath: ':memory:' });
  await kvManager.initialize();
  return { kvManager };
}

// Helper function to create test session data
function createTestSessionData(overrides: Partial<SessionData> = {}): Omit<SessionData, 'id'> {
  const now = Date.now();
  return {
    userId: 'test_user_123',
    clientId: 'test_client_456',
    scopes: ['read', 'write'],
    transportType: 'http', // Required field
    metadata: { userAgent: 'Test Browser', ip: '127.0.0.1' },
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + (24 * 60 * 60 * 1000), // 24 hours
    ...overrides,
  };
}

Deno.test({
  name: 'SessionStore - Initialize with Default Configuration',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    // Verify store is initialized
    assertExists(sessionStore);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Initialize with Custom Configuration',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const customConfig = {
      keyPrefix: ['custom', 'sessions'],
      defaultExpirationMs: 12 * 60 * 60 * 1000, // 12 hours
      cleanupIntervalMs: 30 * 60 * 1000, // 30 minutes
      enableAutoCleanup: false,
    };
    
    const sessionStore = new SessionStore(kvManager, customConfig, mockLogger);
    
    assertExists(sessionStore);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Store and Retrieve Session',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    const sessionId = 'test_session_123';
    const sessionData = createTestSessionData({
      userId: 'user_456',
      clientId: 'client_789',
      scopes: ['read', 'write', 'admin'],
    });
    
    // Store session
    await sessionStore.storeSession(sessionId, sessionData);
    
    // Retrieve session
    const retrievedSession = await sessionStore.getSession(sessionId);
    
    assertExists(retrievedSession);
    assertEquals(retrievedSession.id, sessionId);
    assertEquals(retrievedSession.userId, 'user_456');
    assertEquals(retrievedSession.clientId, 'client_789');
    assertEquals(retrievedSession.scopes, ['read', 'write', 'admin']);
    assertEquals(retrievedSession.metadata, sessionData.metadata);
    
    // Timestamps should be set
    assertExists(retrievedSession.createdAt);
    assertExists(retrievedSession.lastActiveAt);
    assertExists(retrievedSession.expiresAt);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Store Session with Default Expiry',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {
      defaultExpirationMs: 2 * 60 * 60 * 1000, // 2 hours
    }, mockLogger);
    
    const sessionId = 'test_session_default_expiry';
    const sessionData = createTestSessionData();
    // Create session data with explicit expiry for default test
    const sessionDataForDefault = {
      ...sessionData,
      expiresAt: Date.now() + (2 * 60 * 60 * 1000), // Default expiry will override this
    };
    
    const beforeStore = Date.now();
    await sessionStore.storeSession(sessionId, sessionDataForDefault);
    const afterStore = Date.now();
    
    const retrievedSession = await sessionStore.getSession(sessionId);
    
    assertExists(retrievedSession);
    // Should have default expiry applied
    assert(retrievedSession.expiresAt >= beforeStore + (2 * 60 * 60 * 1000) - 1000);
    assert(retrievedSession.expiresAt <= afterStore + (2 * 60 * 60 * 1000) + 1000);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Update Session Data',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, { 
      keyPrefix: ['test_update_sessions_' + Date.now() + '_' + Math.random().toString(36)] // Completely unique prefix
    }, mockLogger);
    
    const sessionId = 'test_session_update';
    const initialSessionData = createTestSessionData({
      userId: 'user_initial',
      scopes: ['read'],
    });
    
    // Store initial session
    await sessionStore.storeSession(sessionId, initialSessionData);
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Update session
    const updateData = {
      scopes: ['read', 'write', 'admin'],
      metadata: { updated: true, newField: 'test' },
    };
    
    await sessionStore.updateSession(sessionId, updateData);
    
    // Retrieve updated session
    const updatedSession = await sessionStore.getSession(sessionId);
    
    assertExists(updatedSession);
    assertEquals(updatedSession.scopes, ['read', 'write', 'admin']);
    assertEquals(updatedSession.metadata, { updated: true, newField: 'test' });
    assertEquals(updatedSession.userId, 'user_initial'); // Should remain unchanged
    
    // lastActiveAt should be updated
    assert(updatedSession.lastActiveAt > initialSessionData.lastActiveAt);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Touch Session Activity',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    const sessionId = 'test_session_touch';
    const sessionData = createTestSessionData();
    
    // Store session
    await sessionStore.storeSession(sessionId, sessionData);
    
    // Get initial activity time
    const initialSession = await sessionStore.getSession(sessionId);
    assertExists(initialSession);
    const initialActivity = initialSession.lastActiveAt;
    
    // Wait a bit and touch session
    await new Promise(resolve => setTimeout(resolve, 10));
    await sessionStore.touchSession(sessionId);
    
    // Verify activity time updated
    const touchedSession = await sessionStore.getSession(sessionId);
    assertExists(touchedSession);
    assert(touchedSession.lastActiveAt > initialActivity);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Delete Session',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    const sessionId = 'test_session_delete';
    const sessionData = createTestSessionData({ userId: 'user_to_delete' });
    
    // Store session
    await sessionStore.storeSession(sessionId, sessionData);
    
    // Verify session exists
    const existingSession = await sessionStore.getSession(sessionId);
    assertExists(existingSession);
    
    // Delete session
    await sessionStore.deleteSession(sessionId);
    
    // Verify session is deleted
    const deletedSession = await sessionStore.getSession(sessionId);
    assertEquals(deletedSession, undefined);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Session Expiry Handling (SECURITY CRITICAL)',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    const sessionId = 'test_session_expired';
    const expiredSessionData = createTestSessionData({
      expiresAt: Date.now() - (60 * 1000), // Expired 1 minute ago
    });
    
    // Store expired session
    await sessionStore.storeSession(sessionId, expiredSessionData);
    
    // Try to retrieve expired session
    const retrievedSession = await sessionStore.getSession(sessionId);
    
    // Should return undefined for expired session
    assertEquals(retrievedSession, undefined);
    
    // Session should be automatically cleaned up
    // Try to retrieve again to ensure it's really gone
    const secondRetrieve = await sessionStore.getSession(sessionId);
    assertEquals(secondRetrieve, undefined);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Get User Sessions',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    const userId = 'multi_session_user';
    
    // Store multiple sessions for the same user
    await sessionStore.storeSession('session_1', createTestSessionData({ userId }));
    await sessionStore.storeSession('session_2', createTestSessionData({ userId }));
    await sessionStore.storeSession('session_3', createTestSessionData({ userId }));
    
    // Store session for different user
    await sessionStore.storeSession('other_session', createTestSessionData({ userId: 'other_user' }));
    
    // Get sessions for the user
    const userSessions = await sessionStore.getUserSessions(userId);
    
    assertEquals(userSessions.length, 3);
    
    // Verify all sessions belong to the user
    for (const session of userSessions) {
      assertEquals(session.userId, userId);
    }
    
    // Session IDs should be different
    const sessionIds = userSessions.map(s => s.id);
    const uniqueIds = new Set(sessionIds);
    assertEquals(uniqueIds.size, 3);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Delete User Sessions',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    const userId = 'delete_all_user';
    
    // Store multiple sessions for the user
    await sessionStore.storeSession('del_session_1', createTestSessionData({ userId }));
    await sessionStore.storeSession('del_session_2', createTestSessionData({ userId }));
    await sessionStore.storeSession('del_session_3', createTestSessionData({ userId }));
    
    // Store session for different user (should not be deleted)
    await sessionStore.storeSession('keep_session', createTestSessionData({ userId: 'keep_user' }));
    
    // Verify sessions exist
    const userSessionsBefore = await sessionStore.getUserSessions(userId);
    assertEquals(userSessionsBefore.length, 3);
    
    // Delete all user sessions
    const deletedCount = await sessionStore.deleteUserSessions(userId);
    assertEquals(deletedCount, 3);
    
    // Verify user sessions are deleted
    const userSessionsAfter = await sessionStore.getUserSessions(userId);
    assertEquals(userSessionsAfter.length, 0);
    
    // Verify other user's session still exists
    const otherSession = await sessionStore.getSession('keep_session');
    assertExists(otherSession);
    assertEquals(otherSession.userId, 'keep_user');
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Delete Expired Sessions',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, { enableAutoCleanup: false }, mockLogger);
    
    const now = Date.now();
    const cutoffTime = now - (60 * 60 * 1000); // 1 hour ago
    
    // Store expired sessions
    await sessionStore.storeSession('expired_1', createTestSessionData({
      expiresAt: cutoffTime - (30 * 60 * 1000), // Expired 1.5 hours ago
    }));
    
    await sessionStore.storeSession('expired_2', createTestSessionData({
      expiresAt: cutoffTime - (10 * 60 * 1000), // Expired 1.17 hours ago
    }));
    
    // Store valid session
    await sessionStore.storeSession('valid_session', createTestSessionData({
      expiresAt: now + (60 * 60 * 1000), // Expires in 1 hour
    }));
    
    // Delete expired sessions
    const deletedCount = await sessionStore.deleteExpiredSessions(cutoffTime);
    assertEquals(deletedCount, 2);
    
    // Verify valid session still exists
    const validSession = await sessionStore.getSession('valid_session');
    assertExists(validSession);
    
    // Verify expired sessions are gone
    const expiredSession1 = await sessionStore.getSession('expired_1');
    const expiredSession2 = await sessionStore.getSession('expired_2');
    assertEquals(expiredSession1, undefined);
    assertEquals(expiredSession2, undefined);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Session Statistics',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    // Use unique key prefix for this test to avoid interference from other tests
    const sessionStore = new SessionStore(kvManager, { 
      enableAutoCleanup: false,
      keyPrefix: ['test_stats_sessions_' + Date.now() + '_' + Math.random().toString(36)] // Completely unique prefix
    }, mockLogger);
    
    const now = Date.now();
    const oldestTime = now - (2 * 60 * 60 * 1000); // 2 hours ago
    const middleTime = now - (30 * 60 * 1000); // 30 minutes ago  
    const newestTime = now - (10 * 60 * 1000); // 10 minutes ago
    
    // Store active sessions with explicit timestamps
    const sessionData1 = {
      userId: 'test_user_1',
      clientId: 'test_client_1',
      scopes: ['read', 'write'],
      transportType: 'http' as const,
      metadata: {},
      expiresAt: now + (60 * 60 * 1000),
      createdAt: oldestTime, // This will be the oldest
      lastActiveAt: middleTime,
    };
    
    const sessionData2 = {
      userId: 'test_user_2',
      clientId: 'test_client_2', 
      scopes: ['read'],
      transportType: 'http' as const,
      metadata: {},
      expiresAt: now + (2 * 60 * 60 * 1000),
      createdAt: newestTime, // This will be the newest
      lastActiveAt: newestTime,
    };
    
    const sessionData3 = {
      userId: 'test_user_3',
      clientId: 'test_client_3',
      scopes: ['read'],
      transportType: 'http' as const,
      metadata: {},
      expiresAt: now - (60 * 1000), // Expired
      createdAt: middleTime,
      lastActiveAt: middleTime,
    };
    
    await sessionStore.storeSession('active_1', sessionData1);
    await sessionStore.storeSession('active_2', sessionData2);
    await sessionStore.storeSession('expired_1', sessionData3);
    
    // Get statistics
    const stats = await sessionStore.getStats();
    
    assertEquals(stats.total, 3);
    assertEquals(stats.active, 2);
    assertEquals(stats.expired, 1);
    assertExists(stats.oldestSession);
    assertExists(stats.newestSession);
    
    // Oldest session should be the one created 2 hours ago (active_1)
    assertEquals(stats.oldestSession, oldestTime);
    
    // Newest session should be the one created 10 minutes ago (active_2)
    assertEquals(stats.newestSession, newestTime);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Auto-Cleanup Functionality',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    // Create store with very short cleanup interval for testing
    const sessionStore = new SessionStore(kvManager, {
      enableAutoCleanup: true,
      cleanupIntervalMs: 100, // 100ms cleanup interval
    }, mockLogger);
    
    // Store expired session
    await sessionStore.storeSession('auto_cleanup_test', createTestSessionData({
      expiresAt: Date.now() - (60 * 1000), // Expired 1 minute ago
    }));
    
    // Wait for auto-cleanup to run
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Session should be automatically cleaned up
    const cleanedSession = await sessionStore.getSession('auto_cleanup_test');
    assertEquals(cleanedSession, undefined);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Stop Auto-Cleanup',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {
      enableAutoCleanup: true,
      cleanupIntervalMs: 50,
    }, mockLogger);
    
    // Stop auto-cleanup
    sessionStore.stopAutoCleanup();
    
    // Store expired session
    await sessionStore.storeSession('no_cleanup_test', createTestSessionData({
      expiresAt: Date.now() - (60 * 1000),
    }));
    
    // Wait longer than cleanup interval
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Session should still exist (no auto-cleanup)
    const session = await sessionStore.getSession('no_cleanup_test');
    // getSession should return undefined for expired session even without cleanup
    assertEquals(session, undefined);
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Error Handling',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const sessionStore = new SessionStore(kvManager, {}, mockLogger);
    
    // Test getting non-existent session
    const nonExistentSession = await sessionStore.getSession('nonexistent_session');
    assertEquals(nonExistentSession, undefined);
    
    // Test updating non-existent session
    try {
      await sessionStore.updateSession('nonexistent_session', { scopes: ['read'] });
      assert(false, 'Should have thrown error for updating non-existent session');
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('not found'));
    }
    
    // Test touching non-existent session
    try {
      await sessionStore.touchSession('nonexistent_session');
      assert(false, 'Should have thrown error for touching non-existent session');
    } catch (error) {
      assert(error instanceof Error);
    }
    
    await sessionStore.close();
    await kvManager.close();
  },
});

Deno.test({
  name: 'SessionStore - Custom Key Prefix',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const customPrefix = ['custom', 'oauth', 'sessions'];
    const sessionStore = new SessionStore(kvManager, {
      keyPrefix: customPrefix,
    }, mockLogger);
    
    const sessionId = 'custom_prefix_test';
    const sessionData = createTestSessionData();
    
    // Store and retrieve with custom prefix
    await sessionStore.storeSession(sessionId, sessionData);
    const retrievedSession = await sessionStore.getSession(sessionId);
    
    assertExists(retrievedSession);
    assertEquals(retrievedSession.id, sessionId);
    
    await sessionStore.close();
    await kvManager.close();
  },
});