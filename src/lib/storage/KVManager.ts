/**
 * KV Manager - Generic Deno KV abstraction for bb-mcp-server library
 * 
 * Provides a unified interface for Deno KV operations with organized key prefixes.
 * Extracted and generalized from ActionStep MCP Server's UnifiedKVManager.
 * 
 * Features:
 * - Configurable key prefixes for organized data storage
 * - Type-safe KV operations
 * - Connection management and lifecycle
 * - Statistics and monitoring capabilities
 * - Cleanup utilities for maintenance
 */

import type {
  KVManagerConfig,
  KVPrefixes,
  KVStats,
} from './StorageTypes.ts';
import { DEFAULT_KV_PREFIXES } from './StorageTypes.ts';
import { toError } from '../utils/Error.ts';

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
}

/**
 * Generic KV manager for Deno KV operations with organized key prefixes
 */
export class KVManager {
  private kv: Deno.Kv | undefined;
  private kvPath: string;
  private prefixes: KVPrefixes;
  private initialized = false;
  private logger?: Logger;

  constructor(config: KVManagerConfig = {}, logger?: Logger) {
    this.kvPath = config.kvPath ?? './data/mcp-server.db';
    if (logger) {
      this.logger = logger;
    }
    
    // Merge provided prefixes with defaults
    this.prefixes = {
      ...DEFAULT_KV_PREFIXES,
      ...config.prefixes,
    } as KVPrefixes;
  }

  /**
   * Initialize the KV connection
   */
  async initialize(): Promise<KVManager> {
    if (this.initialized) {
      return this;
    }

    try {
      this.logger?.info('KVManager: Initializing KV database', {
        kvPath: this.kvPath,
        currentWorkingDirectory: Deno.cwd(),
      });
      
      // Create directory if it doesn't exist
      const kvDir = this.kvPath.substring(0, this.kvPath.lastIndexOf('/'));
      this.logger?.debug('KVManager: Creating directory', {
        kvPath: this.kvPath,
        kvDir,
        willCreateDir: !!kvDir,
      });
      
      if (kvDir) {
        try {
          await Deno.mkdir(kvDir, { recursive: true });
          this.logger?.debug('KVManager: Directory created successfully', { kvDir });
        } catch (dirError) {
          this.logger?.warn('KVManager: Directory creation failed', {
            kvDir,
            error: toError(dirError).message,
          });
          // Continue anyway - directory might already exist
        }
      }

      // Open the KV database
      this.logger?.debug('KVManager: Opening KV database', { kvPath: this.kvPath });
      this.kv = await Deno.openKv(this.kvPath);
      this.initialized = true;
      
      this.logger?.info('KVManager: Initialized KV connection', {
        kvPath: this.kvPath,
        prefixes: Object.keys(this.prefixes),
      });

      return this;
    } catch (error) {
      this.logger?.error('KVManager: Failed to initialize KV connection', toError(error), {
        kvPath: this.kvPath,
        currentWorkingDirectory: Deno.cwd(),
      });
      throw error;
    }
  }

  /**
   * Get the KV instance (throws if not initialized)
   */
  getKV(): Deno.Kv {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized - call initialize() first');
    }
    return this.kv;
  }

  /**
   * Get a specific key prefix by name
   */
  getPrefix(prefixName: keyof KVPrefixes): readonly string[] {
    return this.prefixes[prefixName];
  }

  /**
   * Generic get operation with type safety
   */
  async get<T>(key: string[]): Promise<T | null> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      const result = await this.kv.get<T>(key);
      return result.value;
    } catch (error) {
      this.logger?.error('KVManager: Failed to get key', toError(error), { key });
      throw error;
    }
  }

  /**
   * Generic set operation with type safety
   */
  async set<T>(key: string[], value: T, options?: { expireIn?: number }): Promise<void> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      const kvOptions: Deno.AtomicCheck[] = [];
      if (options?.expireIn) {
        // Note: Deno KV doesn't have built-in expiration, this is a placeholder
        // for future implementation or manual cleanup
      }
      
      const result = await this.kv.set(key, value);
      if (!result.ok) {
        throw new Error('Failed to set KV value');
      }
    } catch (error) {
      this.logger?.error('KVManager: Failed to set key', toError(error), { key, value });
      throw error;
    }
  }

  /**
   * Generic delete operation
   */
  async delete(key: string[]): Promise<void> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      await this.kv.delete(key);
    } catch (error) {
      this.logger?.error('KVManager: Failed to delete key', toError(error), { key });
      throw error;
    }
  }

  /**
   * List entries with a prefix
   */
  async list<T>(prefix: string[]): Promise<Array<{ key: string[]; value: T }>> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      const results: Array<{ key: string[]; value: T }> = [];
      const iter = this.kv.list<T>({ prefix });
      
      for await (const entry of iter) {
        results.push({
          key: entry.key as string[],
          value: entry.value,
        });
      }
      
      return results;
    } catch (error) {
      this.logger?.error('KVManager: Failed to list keys', toError(error), { prefix });
      throw error;
    }
  }

  /**
   * Close the KV connection
   */
  async close(): Promise<void> {
    if (!this.kv) {
      return;
    }

    try {
      this.kv.close();
      this.kv = undefined;
      this.initialized = false;
      
      this.logger?.info('KVManager: Closed KV connection');
    } catch (error) {
      this.logger?.error('KVManager: Error closing KV connection', toError(error));
      // Continue with cleanup even if there's an error
      this.kv = undefined;
      this.initialized = false;
    }
  }

  /**
   * Get comprehensive statistics about the KV store
   */
  async getStats(): Promise<KVStats> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      let totalKeys = 0;
      let authKeys = 0;
      let oauthClientKeys = 0;
      let mcpAuthKeys = 0;
      let transportKeys = 0;
      let eventKeys = 0;
      let appKeys = 0;

      // Count keys by prefix
      const prefixCounts = await Promise.all([
        this.countKeysWithPrefix(this.prefixes.AUTH),
        this.countKeysWithPrefix(this.prefixes.OAUTH_CLIENTS),
        this.countKeysWithPrefix(this.prefixes.MCP_AUTH),
        this.countKeysWithPrefix(this.prefixes.TRANSPORT),
        this.countKeysWithPrefix(this.prefixes.EVENTS),
        this.countKeysWithPrefix(this.prefixes.APP),
      ]);

      [authKeys, oauthClientKeys, mcpAuthKeys, transportKeys, eventKeys, appKeys] = prefixCounts;
      totalKeys = authKeys + oauthClientKeys + mcpAuthKeys + transportKeys + eventKeys + appKeys;

      const stats: KVStats = {
        totalKeys,
        authKeys,
        oauthClientKeys,
        mcpAuthKeys,
        transportKeys,
        eventKeys,
        appKeys,
        kvPath: this.kvPath,
        lastStatsUpdate: Date.now(),
      };

      this.logger?.debug('KVManager: Generated KV stats', stats);
      
      return stats;
    } catch (error) {
      this.logger?.error('KVManager: Failed to get KV stats', toError(error));
      throw error;
    }
  }

  /**
   * Export all data for backup purposes
   */
  async exportData(): Promise<{
    timestamp: number;
    kvPath: string;
    data: Record<string, unknown>;
    stats: KVStats;
  }> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      const data: Record<string, unknown> = {};
      
      // Export all data
      const iter = this.kv.list({ prefix: [] });
      for await (const entry of iter) {
        const keyStr = entry.key.join('/');
        data[keyStr] = entry.value;
      }

      const stats = await this.getStats();

      const exportResult = {
        timestamp: Date.now(),
        kvPath: this.kvPath,
        data,
        stats,
      };

      this.logger?.info('KVManager: Exported KV data', {
        keyCount: Object.keys(data).length,
        stats,
      });

      return exportResult;
    } catch (error) {
      this.logger?.error('KVManager: Failed to export data', toError(error));
      throw error;
    }
  }

  /**
   * Clean up keys by prefix (utility method)
   */
  async cleanupKeysByPrefix(
    prefix: readonly string[],
    filter?: (entry: Deno.KvEntry<unknown>) => boolean,
    batchSize: number = 10
  ): Promise<number> {
    if (!this.kv || !this.initialized) {
      throw new Error('KVManager not initialized');
    }

    try {
      const keysToDelete: Deno.KvKey[] = [];
      const iter = this.kv.list({ prefix: [...prefix] });

      for await (const entry of iter) {
        if (!filter || filter(entry)) {
          keysToDelete.push(entry.key);
        }
      }

      let deletedCount = 0;

      // Delete in batches
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        
        const atomic = this.kv.atomic();
        for (const key of batch) {
          atomic.delete(key);
        }
        
        const result = await atomic.commit();
        if (result.ok) {
          deletedCount += batch.length;
        } else {
          this.logger?.warn('KVManager: Failed to delete batch', {
            prefix: prefix.join('/'),
            batchStart: i,
            batchSize: batch.length,
          });
        }
      }

      this.logger?.info('KVManager: Cleaned up keys', {
        prefix: prefix.join('/'),
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      this.logger?.error('KVManager: Failed to cleanup keys', toError(error));
      return 0;
    }
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized && !!this.kv;
  }

  /**
   * Get the KV file path
   */
  getKVPath(): string {
    return this.kvPath;
  }

  /**
   * Helper method to count keys with a specific prefix
   */
  private async countKeysWithPrefix(prefix: readonly string[]): Promise<number> {
    if (!this.kv) {
      return 0;
    }

    let count = 0;
    const iter = this.kv.list({ prefix: [...prefix] });
    
    for await (const _entry of iter) {
      count++;
    }
    
    return count;
  }
}
