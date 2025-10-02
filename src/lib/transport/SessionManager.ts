/**
 * Session Manager for Transport Layer
 *
 * Enhanced version of SessionStore for transport-specific needs
 * Handles HTTP transport sessions with creation, persistence, and cleanup
 */

import type { SessionStore } from '../storage/SessionStore.ts';
import type { Logger } from '../utils/Logger.ts';
import type {
  CreateSessionData,
  SessionConfig,
  SessionData,
  SessionStats,
  SessionValidationResult,
  TransportType,
} from './TransportTypes.ts';
import { toError } from '../utils/Error.ts';

/**
 * Manages HTTP transport sessions
 * Handles session creation, persistence, and cleanup
 */
export class SessionManager {
  private sessionStore: SessionStore;
  private logger: Logger;
  private config: SessionConfig;

  // Session tracking
  private activeSessions = new Map<string, SessionData>();
  private sessionActivity = new Map<string, number>(); // sessionId -> lastActive timestamp

  constructor(config: SessionConfig, sessionStore: SessionStore, logger: Logger) {
    this.config = {
      ...config,
      maxAge: config.maxAge ?? (30 * 60 * 1000), // 30 minutes default
      cleanupInterval: config.cleanupInterval ?? (5 * 60 * 1000), // 5 minutes default
      persistToDisk: config.persistToDisk ?? true,
      encryptSessionData: config.encryptSessionData ?? false,
    };
    this.sessionStore = sessionStore;
    this.logger = logger;

    this.logger.info('SessionManager: Initialized', {
      maxAge: this.config.maxAge,
      cleanupInterval: this.config.cleanupInterval,
      persistToDisk: this.config.persistToDisk,
    });
  }

  /**
   * Create a new session for transport requests
   */
  async createSessionForRequest(requestData: CreateSessionData): Promise<string> {
    if (!requestData.userId) {
      throw new Error('userId is required for session creation');
    }

    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const sessionData: SessionData = {
      id: sessionId,
      userId: requestData.userId,
      ...(requestData.clientId && { clientId: requestData.clientId }),
      scopes: requestData.scopes || [],
      transportType: 'http' as TransportType,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + this.config.maxAge,
      metadata: requestData.metadata || {},
    };

    // Store in memory for quick access
    this.activeSessions.set(sessionId, sessionData);
    this.sessionActivity.set(sessionId, now);

    // Persist to storage if enabled
    if (this.config.persistToDisk) {
      try {
        await this.sessionStore.storeSession(sessionId, sessionData);
      } catch (error) {
        this.logger.error('SessionManager: Failed to persist session', toError(error), {
          sessionId,
        });
        // Continue without persistence - session will still work from memory
      }
    }

    this.logger.debug('SessionManager: Session created', {
      sessionId,
      userId: requestData.userId,
      clientId: requestData.clientId,
      scopes: requestData.scopes?.length || 0,
      expiresAt: new Date(sessionData.expiresAt).toISOString(),
    });

    return sessionId;
  }

  /**
   * Get session data for a transport request
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!this.isValidSessionId(sessionId)) {
      return null;
    }

    // Check memory first
    let session = this.activeSessions.get(sessionId);

    // If not in memory and persistence is enabled, try storage
    if (!session && this.config.persistToDisk) {
      try {
        session = await this.sessionStore.getSession(sessionId);
        if (session) {
          // Restore to memory
          this.activeSessions.set(sessionId, session);
          this.sessionActivity.set(sessionId, session.lastActiveAt);
        }
      } catch (error) {
        this.logger.error(
          'SessionManager: Failed to retrieve session from storage',
          toError(error),
          {
            sessionId,
          },
        );
        return null;
      }
    }

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (this.isSessionExpired(session)) {
      this.logger.debug('SessionManager: Session expired, removing', {
        sessionId,
        expiresAt: new Date(session.expiresAt).toISOString(),
        now: new Date().toISOString(),
      });

      await this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Validate session for transport requests
   */
  async validateSessionForTransport(
    sessionId: string,
    transportType: TransportType,
  ): Promise<SessionValidationResult> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { valid: false, reason: 'session_not_found' };
    }

    if (session.transportType !== transportType) {
      return { valid: false, reason: 'invalid_transport' };
    }

    if (this.isSessionExpired(session)) {
      await this.deleteSession(sessionId);
      return { valid: false, reason: 'session_expired' };
    }

    // Update last active timestamp
    await this.updateLastActive(sessionId);

    return { valid: true, session };
  }

  /**
   * Update session data
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Omit<SessionData, 'id' | 'createdAt'>>,
  ): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const updatedSession: SessionData = {
      ...session,
      ...updates,
      lastActiveAt: Date.now(),
    };

    // Update memory
    this.activeSessions.set(sessionId, updatedSession);
    this.sessionActivity.set(sessionId, updatedSession.lastActiveAt);

    // Update storage if enabled
    if (this.config.persistToDisk) {
      try {
        await this.sessionStore.storeSession(sessionId, updatedSession);
      } catch (error) {
        this.logger.error('SessionManager: Failed to update session in storage', toError(error), {
          sessionId,
        });
        // Continue - session is still updated in memory
      }
    }

    this.logger.debug('SessionManager: Session updated', {
      sessionId,
      updatedFields: Object.keys(updates),
    });

    return true;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Remove from memory
    this.activeSessions.delete(sessionId);
    this.sessionActivity.delete(sessionId);

    // Remove from storage if enabled
    if (this.config.persistToDisk) {
      try {
        await this.sessionStore.deleteSession(sessionId);
      } catch (error) {
        this.logger.error('SessionManager: Failed to delete session from storage', toError(error), {
          sessionId,
        });
      }
    }

    this.logger.debug('SessionManager: Session deleted', { sessionId });
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(sessionId: string): Promise<void> {
    const now = Date.now();
    this.sessionActivity.set(sessionId, now);

    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActiveAt = now;

      // Update in storage if enabled
      if (this.config.persistToDisk) {
        try {
          await this.sessionStore.storeSession(sessionId, session);
        } catch (error) {
          this.logger.debug('SessionManager: Failed to update last active in storage', {
            sessionId,
            error: toError(error),
          });
        }
      }
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    //const now = Date.now();
    let cleanedCount = 0;

    // Get all session IDs
    const sessionIds = new Set([
      ...this.activeSessions.keys(),
      // Add session IDs from storage if persistence is enabled
      ...(this.config.persistToDisk ? await this.getStorageSessionIds() : []),
    ]);

    for (const sessionId of sessionIds) {
      try {
        const session = await this.getSession(sessionId);
        if (!session || this.isSessionExpired(session)) {
          await this.deleteSession(sessionId);
          cleanedCount++;
        }
      } catch (error) {
        this.logger.error('SessionManager: Error during cleanup', toError(error), {
          sessionId,
        });
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('SessionManager: Cleaned up expired sessions', {
        cleanedCount,
        remainingActive: this.activeSessions.size,
      });
    }

    return cleanedCount;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<SessionStats> {
    const now = Date.now();
    const sessions = Array.from(this.activeSessions.values());

    // Calculate statistics
    const active = sessions.filter((s) => !this.isSessionExpired(s)).length;
    const expired = sessions.length - active;

    const durations = sessions
      .filter((s) => !this.isSessionExpired(s))
      .map((s) => now - s.createdAt);

    const averageDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const activeSessions = sessions.filter((s) => !this.isSessionExpired(s));
    const oldestActive = activeSessions.length > 0
      ? Math.min(...activeSessions.map((s) => s.createdAt))
      : now;
    const newestActive = activeSessions.length > 0
      ? Math.max(...activeSessions.map((s) => s.createdAt))
      : now;

    return {
      active,
      total: sessions.length,
      expired,
      averageDuration,
      oldestActive,
      newestActive,
    };
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<SessionData[]> {
    const activeSessions: SessionData[] = [];

    for (const session of this.activeSessions.values()) {
      if (!this.isSessionExpired(session)) {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanupInterval(): number {
    this.logger.info('SessionManager: Starting automatic cleanup interval', {
      interval: this.config.cleanupInterval,
    });

    return setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        this.logger.error('SessionManager: Error in automatic cleanup', toError(error));
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Validate session ID format
   */
  private isValidSessionId(sessionId: string): boolean {
    // UUID format validation
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId);
  }

  /**
   * Check if session is expired
   */
  private isSessionExpired(session: SessionData): boolean {
    return Date.now() > session.expiresAt;
  }

  /**
   * Get session IDs from storage (if persistence is enabled)
   */
  private async getStorageSessionIds(): Promise<string[]> {
    // This would depend on the SessionStore implementation
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get memory usage information
   */
  getMemoryUsage(): {
    activeSessions: number;
    sessionActivities: number;
    estimatedMemoryKB: number;
  } {
    const activeSessionsSize = this.activeSessions.size;
    const sessionActivitiesSize = this.sessionActivity.size;

    // Rough estimate: each session ~1KB, each activity entry ~50 bytes
    const estimatedMemoryKB = Math.round(
      (activeSessionsSize * 1) + (sessionActivitiesSize * 0.05),
    );

    return {
      activeSessions: activeSessionsSize,
      sessionActivities: sessionActivitiesSize,
      estimatedMemoryKB,
    };
  }
}
