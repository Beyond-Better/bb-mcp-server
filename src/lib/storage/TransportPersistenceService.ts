/**
 * Transport Persistence Service
 *
 * Manages persistence of MCP HTTP transport session information using Deno KV.
 * Enables restoration of transport configurations after server restarts,
 * though actual connections must be re-established by clients.
 */

import { StreamableHTTPServerTransport } from 'mcp/server/streamableHttp.js';
import type { TransportEventStore } from './TransportEventStore.ts';
import { toError } from '../utils/Error.ts';

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
}

/**
 * Generic interface for MCP servers that support transport restoration
 */
export interface MCPServerForRestore {
  getMcpServer(): { connect(transport: StreamableHTTPServerTransport): Promise<void> } | null;
}

export interface PersistedSessionInfo {
  sessionId: string;
  userId?: string;
  createdAt: number;
  lastActivity: number;
  isActive: boolean;
  transportConfig: {
    hostname: string;
    port: number;
    allowedHosts: string[];
    enableDnsRebindingProtection: boolean;
  };
  metadata?: {
    userAgent?: string;
    clientInfo?: string;
    [key: string]: unknown;
  };
}

export interface TransportRestoreResult {
  restoredCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Service for persisting and restoring MCP transport sessions
 */
export class TransportPersistenceService {
  private kv: Deno.Kv;
  private keyPrefix: readonly string[];
  private logger: Logger | undefined;

  constructor(
    kv: Deno.Kv,
    keyPrefix: readonly string[] = ['transport'],
    logger?: Logger,
  ) {
    this.kv = kv;
    this.keyPrefix = keyPrefix;
    this.logger = logger;
  }

  /**
   * Persist a transport session to KV storage
   */
  async persistSession(
    sessionId: string,
    _transport: StreamableHTTPServerTransport,
    config: {
      hostname: string;
      port: number;
      allowedHosts: string[];
    },
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const sessionInfo: PersistedSessionInfo = {
      sessionId,
      ...(userId && { userId }),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isActive: true,
      transportConfig: {
        hostname: config.hostname,
        port: config.port,
        allowedHosts: [...config.allowedHosts],
        enableDnsRebindingProtection: true,
      },
      ...(metadata && { metadata: { ...metadata } }),
    };

    try {
      // Store session info with multiple keys for different access patterns
      const atomic = this.kv.atomic()
        .set([...this.keyPrefix, 'session', sessionId], sessionInfo)
        .set([...this.keyPrefix, 'session_by_user', userId || 'anonymous', sessionId], {
          sessionId,
          createdAt: sessionInfo.createdAt,
        });

      const result = await atomic.commit();

      if (!result.ok) {
        throw new Error('Failed to persist session in KV transaction');
      }

      this.logger?.info(
        `TransportPersistenceService: Persisted session ${sessionId} for user ${userId}`,
      );
    } catch (error) {
      this.logger?.error('TransportPersistenceService: Failed to persist session', toError(error), {
        sessionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Update last activity timestamp for a session
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const sessionKey = [...this.keyPrefix, 'session', sessionId];
      const existing = await this.kv.get<PersistedSessionInfo>(sessionKey);

      if (!existing.value) {
        this.logger?.warn(
          'TransportPersistenceService: Attempted to update activity for unknown session',
          {
            sessionId,
          },
        );
        return;
      }

      const updated = {
        ...existing.value,
        lastActivity: Date.now(),
      };

      await this.kv.set(sessionKey, updated);
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to update session activity',
        toError(error),
        {
          sessionId,
        },
      );
    }
  }

  /**
   * Mark a session as inactive (closed)
   */
  async markSessionInactive(sessionId: string): Promise<void> {
    try {
      const sessionKey = [...this.keyPrefix, 'session', sessionId];
      const existing = await this.kv.get<PersistedSessionInfo>(sessionKey);

      if (!existing.value) {
        return; // Session doesn't exist or already cleaned up
      }

      const updated = {
        ...existing.value,
        isActive: false,
        lastActivity: Date.now(),
      };

      await this.kv.set(sessionKey, updated);

      this.logger?.info('TransportPersistenceService: Marked session as inactive', {
        sessionId,
      });
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to mark session inactive',
        toError(error),
        {
          sessionId,
        },
      );
    }
  }

  /**
   * Get persisted session information
   */
  async getSessionInfo(sessionId: string): Promise<PersistedSessionInfo | null> {
    try {
      const result = await this.kv.get<PersistedSessionInfo>([
        ...this.keyPrefix,
        'session',
        sessionId,
      ]);
      return result.value;
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to get session info',
        toError(error),
        {
          sessionId,
        },
      );
      return null;
    }
  }

  /**
   * Get all persisted sessions for a user
   */
  async getUserSessions(userId: string): Promise<PersistedSessionInfo[]> {
    try {
      const sessions: PersistedSessionInfo[] = [];
      const prefix = [...this.keyPrefix, 'session_by_user', userId];

      const iter = this.kv.list({ prefix });
      for await (const entry of iter) {
        const sessionRef = entry.value as { sessionId: string };
        if (sessionRef.sessionId) {
          const sessionInfo = await this.getSessionInfo(sessionRef.sessionId);
          if (sessionInfo) {
            sessions.push(sessionInfo);
          }
        }
      }

      return sessions;
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to get user sessions',
        toError(error),
        {
          userId,
        },
      );
      return [];
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<PersistedSessionInfo[]> {
    try {
      const sessions: PersistedSessionInfo[] = [];
      const prefix = [...this.keyPrefix, 'session'];

      const iter = this.kv.list<PersistedSessionInfo>({ prefix });
      for await (const entry of iter) {
        if (entry.value && entry.value.isActive) {
          sessions.push(entry.value);
        }
      }

      return sessions;
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to get active sessions',
        toError(error),
      );
      return [];
    }
  }

  /**
   * Restore transports from persisted sessions
   * Note: This creates new transport instances with the same session IDs,
   * but clients will need to reconnect to re-establish the connection.
   */
  async restoreTransports(
    mcpServer: MCPServerForRestore,
    transportMap: Map<string, StreamableHTTPServerTransport>,
    eventStore: TransportEventStore,
  ): Promise<TransportRestoreResult> {
    const result: TransportRestoreResult = {
      restoredCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      const activeSessions = await this.getActiveSessions();

      this.logger?.info('TransportPersistenceService: Attempting to restore sessions', {
        sessionCount: activeSessions.length,
      });

      for (const sessionInfo of activeSessions) {
        try {
          await this.restoreSession(mcpServer, transportMap, sessionInfo, eventStore);
          result.restoredCount++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.failedCount++;
          result.errors.push(`Session ${sessionInfo.sessionId}: ${errorMsg}`);

          this.logger?.error(
            'TransportPersistenceService: Failed to restore session',
            toError(error),
            {
              sessionId: sessionInfo.sessionId,
            },
          );
        }
      }

      this.logger?.info('TransportPersistenceService: Transport restoration completed', {
        restored: result.restoredCount,
        failed: result.failedCount,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Restoration process failed: ${errorMsg}`);
      this.logger?.error(
        'TransportPersistenceService: Transport restoration failed',
        toError(error),
      );
    }

    return result;
  }

  /**
   * Restore a single session
   */
  private async restoreSession(
    mcpServer: MCPServerForRestore,
    transportMap: Map<string, StreamableHTTPServerTransport>,
    sessionInfo: PersistedSessionInfo,
    eventStore: TransportEventStore,
  ): Promise<void> {
    // Create new transport with the same session ID
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionInfo.sessionId, // Use existing session ID
      onsessioninitialized: (restoredSessionId) => {
        transportMap.set(restoredSessionId, transport);
        this.logger?.info('TransportPersistenceService: Restored MCP session', {
          sessionId: restoredSessionId,
        });
      },
      eventStore: eventStore,
      enableDnsRebindingProtection: sessionInfo.transportConfig.enableDnsRebindingProtection,
      allowedHosts: sessionInfo.transportConfig.allowedHosts,
    });

    // Set up cleanup handler
    transport.onclose = () => {
      transportMap.delete(sessionInfo.sessionId);
      this.markSessionInactive(sessionInfo.sessionId).catch((error) => {
        this.logger?.error(
          'TransportPersistenceService: Failed to mark restored session inactive',
          error,
          {
            sessionId: sessionInfo.sessionId,
          },
        );
      });
      this.logger?.info('TransportPersistenceService: Restored MCP session closed', {
        sessionId: sessionInfo.sessionId,
      });
    };

    // Connect to the MCP server
    const server = mcpServer.getMcpServer();
    if (!server) {
      throw new Error('MCP server not available for session restoration');
    }

    await server.connect(transport);

    // Update last activity to mark as recently restored
    await this.updateSessionActivity(sessionInfo.sessionId);
  }

  /**
   * Clean up old inactive sessions
   */
  async cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const cutoffTime = Date.now() - maxAgeMs;
      let deletedCount = 0;

      const prefix = [...this.keyPrefix, 'session'];
      const iter = this.kv.list<PersistedSessionInfo>({ prefix });

      const sessionsToDelete: string[] = [];

      for await (const entry of iter) {
        const session = entry.value;
        if (
          session &&
          (!session.isActive || session.lastActivity < cutoffTime)
        ) {
          sessionsToDelete.push(session.sessionId);
        }
      }

      // Delete sessions in batches
      const batchSize = 10;
      for (let i = 0; i < sessionsToDelete.length; i += batchSize) {
        const batch = sessionsToDelete.slice(i, i + batchSize);

        const atomic = this.kv.atomic();
        for (const sessionId of batch) {
          // Get session info to find userId for cleanup
          const sessionInfo = await this.getSessionInfo(sessionId);

          // Delete main session record
          atomic.delete([...this.keyPrefix, 'session', sessionId]);

          // Delete user index record
          if (sessionInfo?.userId) {
            atomic.delete([...this.keyPrefix, 'session_by_user', sessionInfo.userId, sessionId]);
          }
        }

        const result = await atomic.commit();
        if (result.ok) {
          deletedCount += batch.length;
        } else {
          this.logger?.warn('TransportPersistenceService: Failed to delete batch of old sessions', {
            batchStart: i,
            batchSize: batch.length,
          });
        }
      }

      this.logger?.info('TransportPersistenceService: Cleaned up old sessions', {
        deletedCount,
        maxAgeMs,
      });

      return deletedCount;
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to cleanup old sessions',
        toError(error),
      );
      return 0;
    }
  }

  /**
   * Get statistics about persisted sessions
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    oldestSession: number | null;
    newestSession: number | null;
  }> {
    try {
      let total = 0;
      let active = 0;
      let inactive = 0;
      let oldestTime: number | null = null;
      let newestTime: number | null = null;

      const prefix = [...this.keyPrefix, 'session'];
      const iter = this.kv.list<PersistedSessionInfo>({ prefix });

      for await (const entry of iter) {
        const session = entry.value;
        if (session) {
          total++;

          if (session.isActive) {
            active++;
          } else {
            inactive++;
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
        inactive,
        oldestSession: oldestTime,
        newestSession: newestTime,
      };
    } catch (error) {
      this.logger?.error(
        'TransportPersistenceService: Failed to get session stats',
        toError(error),
      );
      return {
        total: 0,
        active: 0,
        inactive: 0,
        oldestSession: null,
        newestSession: null,
      };
    }
  }
}
