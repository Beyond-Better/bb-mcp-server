/**
 * KVManager Unit Tests
 * 
 * Tests for the core KVManager functionality extracted from ActionStep MCP Server.
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import type { KVManagerConfig } from '../../../src/lib/storage/StorageTypes.ts';

// Mock logger for testing
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

Deno.test('KVManager - Basic Operations', async (t) => {
  await t.step('should initialize with default configuration', async () => {
    const config: KVManagerConfig = {
      kvPath: ':memory:', // Use in-memory database for tests
    };
    
    const kvManager = new KVManager(config, mockLogger);
    await kvManager.initialize();
    
    assertEquals(kvManager.isInitialized(), true);
    assertEquals(kvManager.getKVPath(), ':memory:');
    
    await kvManager.close();
  });

  await t.step('should store and retrieve values', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    const testKey = ['test', 'key'];
    const testValue = { data: 'test', number: 42 };
    
    await kvManager.set(testKey, testValue);
    const retrieved = await kvManager.get<typeof testValue>(testKey);
    
    assertEquals(retrieved, testValue);
    
    await kvManager.close();
  });

  await t.step('should return null for non-existent keys', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    const result = await kvManager.get(['non', 'existent', 'key']);
    assertEquals(result, null);
    
    await kvManager.close();
  });

  await t.step('should delete values', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    const testKey = ['test', 'delete'];
    const testValue = { data: 'to-delete' };
    
    await kvManager.set(testKey, testValue);
    let retrieved = await kvManager.get(testKey);
    assertEquals(retrieved, testValue);
    
    await kvManager.delete(testKey);
    retrieved = await kvManager.get(testKey);
    assertEquals(retrieved, null);
    
    await kvManager.close();
  });

  await t.step('should list values by prefix', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    const prefix = ['list', 'test'];
    const values = [
      { key: [...prefix, 'item1'], value: { name: 'Item 1' } },
      { key: [...prefix, 'item2'], value: { name: 'Item 2' } },
      { key: [...prefix, 'item3'], value: { name: 'Item 3' } },
    ];
    
    // Store test values
    for (const { key, value } of values) {
      await kvManager.set(key, value);
    }
    
    // List values by prefix
    const results = await kvManager.list(prefix);
    assertEquals(results.length, 3);
    
    // Check that all expected items are present
    for (const expectedValue of values) {
      const found = results.some(result => 
        JSON.stringify(result.key) === JSON.stringify(expectedValue.key) &&
        JSON.stringify(result.value) === JSON.stringify(expectedValue.value)
      );
      assertEquals(found, true, `Expected to find ${JSON.stringify(expectedValue)}`);
    }
    
    await kvManager.close();
  });
});

Deno.test('KVManager - Configuration and Prefixes', async (t) => {
  await t.step('should use custom key prefixes', async () => {
    const customPrefixes = {
      AUTH: ['custom', 'auth'] as const,
      SESSIONS: ['custom', 'sessions'] as const,
    };
    
    const config: KVManagerConfig = {
      kvPath: ':memory:',
      prefixes: customPrefixes,
    };
    
    const kvManager = new KVManager(config, mockLogger);
    await kvManager.initialize();
    
    const authPrefix = kvManager.getPrefix('AUTH');
    assertEquals(JSON.stringify(authPrefix), JSON.stringify(['custom', 'auth']));
    
    await kvManager.close();
  });

  await t.step('should get statistics about stored data', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    // Store some test data with different prefixes that match the expected KV prefixes
    await kvManager.set(['auth', 'user1'], { userId: 'user1' });
    await kvManager.set(['auth', 'user2'], { userId: 'user2' });
    await kvManager.set(['transport', 'session1'], { sessionId: 'session1' });
    await kvManager.set(['app', 'config'], { version: '1.0.0' });
    
    const stats = await kvManager.getStats();
    
    assertExists(stats);
    assertEquals(typeof stats.totalKeys, 'number');
    assertEquals(stats.totalKeys >= 4, true, 'Should have at least 4 keys');
    assertEquals(typeof stats.kvPath, 'string');
    assertEquals(typeof stats.lastStatsUpdate, 'number');
    
    await kvManager.close();
  });
});

Deno.test('KVManager - Error Handling', async (t) => {
  await t.step('should throw error when not initialized', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    
    await assertRejects(
      () => kvManager.get(['test']),
      Error,
      'KVManager not initialized'
    );
    
    await assertRejects(
      () => kvManager.set(['test'], 'value'),
      Error,
      'KVManager not initialized'
    );
  });

  await t.step('should handle cleanup operations', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    // Store test data
    const prefix = ['cleanup', 'test'];
    await kvManager.set([...prefix, 'keep'], { data: 'keep' });
    await kvManager.set([...prefix, 'remove'], { data: 'remove' });
    
    // Clean up with filter
    const deletedCount = await kvManager.cleanupKeysByPrefix(
      prefix,
      (entry) => entry.key[entry.key.length - 1] === 'remove'
    );
    
    assertEquals(deletedCount, 1);
    
    // Verify only the correct item was removed
    const keepValue = await kvManager.get([...prefix, 'keep']);
    const removeValue = await kvManager.get([...prefix, 'remove']);
    
    assertExists(keepValue);
    assertEquals(removeValue, null);
    
    await kvManager.close();
  });
});

Deno.test('KVManager - Export and Import', async (t) => {
  await t.step('should export all data', async () => {
    const kvManager = new KVManager({ kvPath: ':memory:' }, mockLogger);
    await kvManager.initialize();
    
    // Store test data
    await kvManager.set(['export', 'test1'], { data: 'test1' });
    await kvManager.set(['export', 'test2'], { data: 'test2' });
    
    const exportResult = await kvManager.exportData();
    
    assertExists(exportResult);
    assertEquals(typeof exportResult.timestamp, 'number');
    assertEquals(exportResult.kvPath, ':memory:');
    assertExists(exportResult.data);
    assertExists(exportResult.stats);
    
    // Should contain our test data
    const hasTestData = Object.keys(exportResult.data).some(key => key.includes('export/test'));
    assertEquals(hasTestData, true, 'Export should contain test data');
    
    await kvManager.close();
  });
});
