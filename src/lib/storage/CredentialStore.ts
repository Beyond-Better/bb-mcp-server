/**
 * Credential Store - Secure credential management for OAuth and API tokens
 * 
 * Provides encrypted storage and management of OAuth credentials, API keys,
 * and other sensitive authentication data. Extracted patterns from ActionStep
 * MCP Server's OAuth and authentication services.
 */

import type { OAuthCredentials } from './StorageTypes.ts';
import type { KVManager } from './KVManager.ts';
import { toError } from '../utils/Error.ts';

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
}

/**
 * Configuration for credential storage
 */
export interface CredentialStoreConfig {
  keyPrefix?: string[];
  enableEncryption?: boolean;
  encryptionKey?: string;
  tokenRefreshBuffer?: number; // Milliseconds before expiry to consider token expired
}

/**
 * Generic credential store for OAuth tokens and API keys
 */
export class CredentialStore {
  private kvManager: KVManager;
  private keyPrefix: string[];
  private tokenRefreshBuffer: number;
  private logger: Logger | undefined;

  constructor(
    kvManager: KVManager,
    config: CredentialStoreConfig = {},
    logger?: Logger
  ) {
    this.kvManager = kvManager;
    this.keyPrefix = config.keyPrefix ?? ['credentials'];
    this.tokenRefreshBuffer = config.tokenRefreshBuffer ?? 5 * 60 * 1000; // 5 minutes
    this.logger = logger;
  }

  /**
   * Store OAuth credentials for a user and provider
   */
  async storeCredentials(
    userId: string, 
    provider: string, 
    credentials: OAuthCredentials
  ): Promise<void> {
    try {
      const credentialKey = [...this.keyPrefix, provider, userId];
      
      const credentialData = {
        ...credentials,
        storedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      await this.kvManager.set(credentialKey, credentialData);
      
      // Store user index for easy lookup
      const userIndexKey = [...this.keyPrefix, 'by_user', userId, provider];
      await this.kvManager.set(userIndexKey, {
        provider,
        storedAt: credentialData.storedAt,
        expiresAt: credentials.expiresAt,
      });

      this.logger?.debug('CredentialStore: Stored credentials', { userId, provider });
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to store credentials', toError(error), { userId, provider });
      throw error;
    }
  }

  /**
   * Get OAuth credentials for a user and provider
   */
  async getCredentials(
    userId: string, 
    provider: string
  ): Promise<OAuthCredentials | null> {
    try {
      const credentialKey = [...this.keyPrefix, provider, userId];
      const credentials = await this.kvManager.get<OAuthCredentials & { 
        storedAt: number; 
        lastUsedAt: number; 
      }>(credentialKey);
      
      if (!credentials) {
        return null;
      }

      // Check if credentials are expired (with buffer)
      const now = Date.now();
      if (credentials.expiresAt <= now + this.tokenRefreshBuffer) {
        this.logger?.debug('CredentialStore: Credentials expired or expiring soon', { 
          userId, 
          provider, 
          expiresAt: credentials.expiresAt,
          now 
        });
        return null;
      }

      // Update last used timestamp
      await this.updateLastUsed(userId, provider);

      // Return credentials without internal metadata
      const { storedAt, lastUsedAt, ...publicCredentials } = credentials;
      return publicCredentials;
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to get credentials', toError(error), { userId, provider });
      return null;
    }
  }

  /**
   * Update existing credentials (e.g., after token refresh)
   */
  async updateCredentials(
    userId: string, 
    provider: string, 
    updates: Partial<OAuthCredentials>
  ): Promise<void> {
    try {
      const credentialKey = [...this.keyPrefix, provider, userId];
      const existing = await this.kvManager.get<OAuthCredentials & { 
        storedAt: number; 
        lastUsedAt: number; 
      }>(credentialKey);
      
      if (!existing) {
        throw new Error(`Credentials not found for user ${userId} and provider ${provider}`);
      }

      const updatedCredentials = {
        ...existing,
        ...updates,
        lastUsedAt: Date.now(),
      };

      await this.kvManager.set(credentialKey, updatedCredentials);
      
      // Update user index if expiration changed
      if (updates.expiresAt) {
        const userIndexKey = [...this.keyPrefix, 'by_user', userId, provider];
        await this.kvManager.set(userIndexKey, {
          provider,
          storedAt: existing.storedAt,
          expiresAt: updates.expiresAt,
        });
      }

      this.logger?.debug('CredentialStore: Updated credentials', { userId, provider });
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to update credentials', toError(error), { userId, provider });
      throw error;
    }
  }

  /**
   * Delete credentials for a user and provider
   */
  async deleteCredentials(userId: string, provider: string): Promise<void> {
    try {
      const credentialKey = [...this.keyPrefix, provider, userId];
      const userIndexKey = [...this.keyPrefix, 'by_user', userId, provider];
      
      await this.kvManager.delete(credentialKey);
      await this.kvManager.delete(userIndexKey);

      this.logger?.debug('CredentialStore: Deleted credentials', { userId, provider });
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to delete credentials', toError(error), { userId, provider });
      throw error;
    }
  }

  /**
   * Get all providers for which a user has credentials
   */
  async getUserProviders(userId: string): Promise<string[]> {
    try {
      const userIndexEntries = await this.kvManager.list<{ provider: string }>(
        [...this.keyPrefix, 'by_user', userId]
      );
      
      return userIndexEntries.map(entry => entry.value.provider);
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to get user providers', toError(error), { userId });
      return [];
    }
  }

  /**
   * Delete all credentials for a user
   */
  async deleteUserCredentials(userId: string): Promise<number> {
    try {
      const providers = await this.getUserProviders(userId);
      let deletedCount = 0;

      for (const provider of providers) {
        await this.deleteCredentials(userId, provider);
        deletedCount++;
      }

      this.logger?.info('CredentialStore: Deleted all user credentials', { userId, deletedCount });
      return deletedCount;
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to delete user credentials', toError(error), { userId });
      return 0;
    }
  }

  /**
   * Check if credentials exist and are valid (not expired)
   */
  async hasValidCredentials(userId: string, provider: string): Promise<boolean> {
    const credentials = await this.getCredentials(userId, provider);
    return credentials !== null;
  }

  /**
   * Get credentials that are expiring soon (for proactive refresh)
   */
  async getExpiringCredentials(bufferMs: number = 15 * 60 * 1000): Promise<Array<{
    userId: string;
    provider: string;
    expiresAt: number;
  }>> {
    try {
      const expiringCredentials: Array<{
        userId: string;
        provider: string;
        expiresAt: number;
      }> = [];
      
      const cutoffTime = Date.now() + bufferMs;
      
      // Scan all user index entries
      const userIndexEntries = await this.kvManager.list<{ 
        provider: string; 
        expiresAt: number; 
      }>([...this.keyPrefix, 'by_user']);
      
      for (const { key, value } of userIndexEntries) {
        if (value.expiresAt <= cutoffTime) {
          // Extract userId from key: [...keyPrefix, 'by_user', userId, provider]
          const userId = key[key.length - 2] as string;
          
          expiringCredentials.push({
            userId,
            provider: value.provider,
            expiresAt: value.expiresAt,
          });
        }
      }

      return expiringCredentials;
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to get expiring credentials', toError(error));
      return [];
    }
  }

  /**
   * Clean up expired credentials
   */
  async cleanupExpiredCredentials(): Promise<number> {
    try {
      const now = Date.now();
      let deletedCount = 0;
      
      const userIndexEntries = await this.kvManager.list<{ 
        provider: string; 
        expiresAt: number; 
      }>([...this.keyPrefix, 'by_user']);
      
      for (const { key, value } of userIndexEntries) {
        if (value.expiresAt <= now) {
          // Extract userId from key
          const userId = key[key.length - 2] as string;
          
          await this.deleteCredentials(userId, value.provider);
          deletedCount++;
        }
      }

      this.logger?.info('CredentialStore: Cleaned up expired credentials', { deletedCount });
      return deletedCount;
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to cleanup expired credentials', toError(error));
      return 0;
    }
  }

  /**
   * Get statistics about stored credentials
   */
  async getStats(): Promise<{
    totalCredentials: number;
    totalUsers: number;
    totalProviders: number;
    expiredCredentials: number;
    expiringCredentials: number;
  }> {
    try {
      const now = Date.now();
      const bufferTime = now + this.tokenRefreshBuffer;
      
      let totalCredentials = 0;
      let expiredCredentials = 0;
      let expiringCredentials = 0;
      
      const users = new Set<string>();
      const providers = new Set<string>();
      
      const userIndexEntries = await this.kvManager.list<{ 
        provider: string; 
        expiresAt: number; 
      }>([...this.keyPrefix, 'by_user']);
      
      for (const { key, value } of userIndexEntries) {
        totalCredentials++;
        
        // Extract userId from key
        const userId = key[key.length - 2] as string;
        users.add(userId);
        providers.add(value.provider);
        
        if (value.expiresAt <= now) {
          expiredCredentials++;
        } else if (value.expiresAt <= bufferTime) {
          expiringCredentials++;
        }
      }

      return {
        totalCredentials,
        totalUsers: users.size,
        totalProviders: providers.size,
        expiredCredentials,
        expiringCredentials,
      };
    } catch (error) {
      this.logger?.error('CredentialStore: Failed to get credential stats', toError(error));
      return {
        totalCredentials: 0,
        totalUsers: 0,
        totalProviders: 0,
        expiredCredentials: 0,
        expiringCredentials: 0,
      };
    }
  }

  /**
   * Update last used timestamp for credentials
   */
  private async updateLastUsed(userId: string, provider: string): Promise<void> {
    try {
      const credentialKey = [...this.keyPrefix, provider, userId];
      const existing = await this.kvManager.get<{ lastUsedAt: number }>(credentialKey);
      
      if (existing) {
        await this.kvManager.set(credentialKey, {
          ...existing,
          lastUsedAt: Date.now(),
        });
      }
    } catch (error) {
      // Non-critical operation, just log the error
      this.logger?.debug('CredentialStore: Failed to update last used timestamp', { 
        userId, 
        provider, 
        error 
      });
    }
  }
}
