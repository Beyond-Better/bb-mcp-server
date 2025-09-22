/**
 * Session Store - Generic session management for MCP servers
 * 
 * Provides a clean interface for managing user sessions with automatic cleanup
 * and expiration handling. Extracted patterns from the ActionStep MCP Server
 * transport and authentication services.
 */

import type { SessionData } from './StorageTypes.ts';
import type { KVManager } from './KVManager.ts';
import { toError } from '../utils/Error.ts';

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
}

/**
 * Configuration for session management
 */
export interface SessionStoreConfig {
  keyPrefix?: string[];
  defaultExpirationMs?: number;
  cleanupIntervalMs?: number;
  enableAutoCleanup?: boolean;
}

/**
 * Generic session store implementation using KVManager
 */
export class SessionStore {
  private kvManager: KVManager;
  private keyPrefix: string[];
  private defaultExpirationMs: number;
  private cleanupIntervalMs: number;
  private enableAutoCleanup: boolean;
  private logger: Logger | undefined;
  private cleanupTimer: number | undefined;

  constructor(
    kvManager: KVManager,
    config: SessionStoreConfig = {},
    logger?: Logger
  ) {
    this.kvManager = kvManager;
    this.keyPrefix = config.keyPrefix ?? ['sessions'];
    this.defaultExpirationMs = config.defaultExpirationMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.cleanupIntervalMs = config.cleanupIntervalMs ?? 60 * 60 * 1000; // 1 hour
    this.enableAutoCleanup = config.enableAutoCleanup ?? true;
    this.logger = logger;

    if (this.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Store a new session
   */
  async storeSession(sessionId: string, sessionData: Omit<SessionData, 'id'>): Promise<void> {
    const now = Date.now();
    const expiresAt = sessionData.expiresAt || (now + this.defaultExpirationMs);
    
    const fullSessionData: SessionData = {
      id: sessionId,
      ...sessionData,
      createdAt: sessionData.createdAt || now, // Use provided createdAt or default to now
      lastActiveAt: sessionData.lastActiveAt || now, // Use provided lastActiveAt or default to now
      expiresAt,
      scopes: sessionData.scopes ?? [],
      metadata: sessionData.metadata ?? {},
    };

    try {
      await this.kvManager.set([...this.keyPrefix, sessionId], fullSessionData);
      
      // Also store by user ID if provided for easy lookup
      if (sessionData.userId) {
        await this.kvManager.set(
          [...this.keyPrefix, 'by_user', sessionData.userId, sessionId], 
          { sessionId, createdAt: now }
        );
      }

      this.logger?.debug('SessionStore: Stored session', { sessionId, userId: sessionData.userId });
    } catch (error) {
      this.logger?.error('SessionStore: Failed to store session', toError(error), { sessionId });
      throw error;
    }
  }

  /**
   * Get session data by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | undefined> {
    try {
      const sessionData = await this.kvManager.get<SessionData>([...this.keyPrefix, sessionId]);
      
      if (!sessionData) {
        return undefined;
      }

      // Check if session is expired
      if (sessionData.expiresAt < Date.now()) {
        await this.deleteSession(sessionId);
        this.logger?.debug('SessionStore: Session expired and removed', { sessionId });
        return undefined;
      }

      return sessionData;
    } catch (error) {
      this.logger?.error('SessionStore: Failed to get session', toError(error), { sessionId });
      return undefined;
    }
  }

  /**
   * Update session data (partial update)
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    try {
      const existingSession = await this.getSession(sessionId);
      if (!existingSession) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const updatedSession: SessionData = {
        ...existingSession,
        ...updates,
        id: sessionId, // Ensure ID can't be changed
        lastActiveAt: Date.now(), // Always update activity
      };

      await this.kvManager.set([...this.keyPrefix, sessionId], updatedSession);
      
      this.logger?.debug('SessionStore: Updated session', { sessionId });
    } catch (error) {
      this.logger?.error('SessionStore: Failed to update session', toError(error), { sessionId });
      throw error;
    }
  }

  /**
   * Update session activity timestamp
   */
  async touchSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, { lastActiveAt: Date.now() });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      // Get session info first to clean up user index
      const sessionData = await this.kvManager.get<SessionData>([...this.keyPrefix, sessionId]);
      
      // Delete main session record
      await this.kvManager.delete([...this.keyPrefix, sessionId]);
      
      // Clean up user index if session had a userId
      if (sessionData?.userId) {
        await this.kvManager.delete([...this.keyPrefix, 'by_user', sessionData.userId, sessionId]);
      }

      this.logger?.debug('SessionStore: Deleted session', { sessionId });
    } catch (error) {
      this.logger?.error('SessionStore: Failed to delete session', toError(error), { sessionId });
      throw error;
    }
  }

  /**
   * Get all sessions for a specific user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const sessions: SessionData[] = [];
      const userSessionRefs = await this.kvManager.list<{ sessionId: string; createdAt: number }>(
        [...this.keyPrefix, 'by_user', userId]
      );

      for (const { value } of userSessionRefs) {
        const session = await this.getSession(value.sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      this.logger?.error('SessionStore: Failed to get user sessions', toError(error), { userId });
      return [];
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<number> {
    try {
      const userSessions = await this.getUserSessions(userId);
      let deletedCount = 0;

      for (const session of userSessions) {
        await this.deleteSession(session.id);
        deletedCount++;
      }

      this.logger?.info('SessionStore: Deleted user sessions', { userId, deletedCount });
      return deletedCount;
    } catch (error) {
      this.logger?.error('SessionStore: Failed to delete user sessions', toError(error), { userId });
      return 0;
    }
  }

  /**
   * Clean up expired sessions
   */
  async deleteExpiredSessions(beforeTimestamp?: number): Promise<number> {
    const cutoffTime = beforeTimestamp ?? Date.now();
    let deletedCount = 0;

    try {
      // Only look at direct session entries, not user index entries
      const sessionEntries = [];
      const allEntries = await this.kvManager.list<SessionData>(this.keyPrefix);
      
      for (const entry of allEntries) {
        // Skip user index entries (they contain 'by_user' in the key path)
        const keyPath = entry.key as string[];
        if (keyPath.includes('by_user')) {
          continue;
        }
        
        if (entry.value && typeof entry.value === 'object' && 'id' in entry.value) {
          sessionEntries.push(entry.value);
        }
      }
      
      for (const session of sessionEntries) {
        if (session.expiresAt < cutoffTime) {
          await this.deleteSession(session.id);
          deletedCount++;
        }
      }

      this.logger?.info('SessionStore: Cleaned up expired sessions', { deletedCount });
      return deletedCount;
    } catch (error) {
      this.logger?.error('SessionStore: Failed to cleanup expired sessions', toError(error));
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    oldestSession: number | null;
    newestSession: number | null;
  }> {
    try {
      const now = Date.now();
      let total = 0;
      let active = 0;
      let expired = 0;
      let oldestTime: number | null = null;
      let newestTime: number | null = null;

      const allEntries = await this.kvManager.list<SessionData>(this.keyPrefix);
      
      for (const entry of allEntries) {
        // Skip user index entries (they contain 'by_user' in the key path)
        const keyPath = entry.key as string[];
        if (keyPath.includes('by_user')) {
          continue;
        }
        
        const session = entry.value;
        if (session && typeof session === 'object' && 'id' in session) {
          total++;

          if (session.expiresAt < now) {
            expired++;
          } else {
            active++;
          }

          if (oldestTime === null || session.createdAt < oldestTime) {
            oldestTime = session.createdAt;
          }

          if (newestTime === null || session.createdAt > newestTime) {
            newestTime = session.createdAt;
          }
        }
      }

      return {
        total,
        active,
        expired,
        oldestSession: oldestTime,
        newestSession: newestTime,
      };
    } catch (error) {
      this.logger?.error('SessionStore: Failed to get session stats', toError(error));
      return {
        total: 0,
        active: 0,
        expired: 0,
        oldestSession: null,
        newestSession: null,
      };
    }
  }

  /**
   * Start automatic cleanup of expired sessions
   */
  private startAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        const deletedCount = await this.deleteExpiredSessions();
        if (deletedCount > 0) {
          this.logger?.debug('SessionStore: Auto-cleanup completed', { deletedCount });
        }
      } catch (error) {
        this.logger?.error('SessionStore: Auto-cleanup failed', toError(error));
      }
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    this.stopAutoCleanup();
  }
}
