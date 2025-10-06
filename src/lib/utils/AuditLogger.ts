/**
 * Audit Logger - Generic audit logging system for MCP servers
 *
 * Provides comprehensive logging for API interactions, workflow operations,
 * authentication events, and system events for compliance and debugging.
 */

import type { Logger } from './Logger.ts';
import { toError } from './Error.ts';

export interface AuditConfig {
  enabled: boolean;
  logFile?: string;
  retentionDays?: number;
  bufferSize?: number;
  flushInterval?: number;
  logCalls: {
    api: boolean;
    auth: boolean;
    workflow: boolean;
    tools: boolean;
    system: boolean;
    custom: boolean;
  };
}

export interface BaseAuditEntry {
  timestamp: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface ApiAuditEntry extends BaseAuditEntry {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  requestSize?: number;
  responseSize?: number;
  userAgent?: string;
  ipAddress?: string;
  error?: string;
}

export interface WorkflowAuditEntry extends BaseAuditEntry {
  workflowName: string;
  operation: string;
  success: boolean;
  durationMs: number;
  inputParams?: unknown;
  outputResult?: unknown;
  error?: string;
  requestSize?: number;
  responseSize?: number;
  ipAddress?: string;
}

export interface AuthAuditEntry extends BaseAuditEntry {
  event: 'login' | 'logout' | 'token_refresh' | 'token_revoke' | 'auth_failure';
  success: boolean;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface SystemAuditEntry extends BaseAuditEntry {
  event: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  details?: Record<string, unknown>;
  component?: string;
}

export interface AuditSearchOptions {
  userId?: string;
  startTime?: Date;
  endTime?: Date;
  type?: 'api_call' | 'workflow_operation' | 'auth_event' | 'system_event';
  event?: string;
  limit?: number;
}

export interface AuditStats {
  totalEntries: number;
  entriesByType: Record<string, number>;
  entriesByUser: Record<string, number>;
  recentActivity: Array<{ timestamp: string; type: string; count: number }>;
}

/**
 * Generic audit logging service for MCP servers
 */
export class AuditLogger {
  private config: AuditConfig;
  private logger: Logger | undefined;
  private auditFile: Deno.FsFile | undefined;
  private buffer: string[] = [];
  private flushTimer?: number;
  private initialized = false;

  constructor(config: AuditConfig, logger?: Logger) {
    this.config = {
      bufferSize: 100,
      flushInterval: 5000, // 5 seconds
      retentionDays: 90,
      ...config,
    };
    this.logger = logger;
  }

  /**
   * Initialize audit logger
   */
  async initialize(): Promise<AuditLogger> {
    if (this.initialized) {
      return this;
    }

    if (!this.config.enabled) {
      this.logger?.info('AuditLogger: Audit logging disabled');
      return this;
    }

    try {
      if (this.config.logFile) {
        // Ensure log directory exists
        const logDir = this.config.logFile.substring(
          0,
          this.config.logFile.lastIndexOf('/'),
        );
        if (logDir) {
          await Deno.mkdir(logDir, { recursive: true });
        }

        // Open audit log file
        this.auditFile = await Deno.open(this.config.logFile, {
          create: true,
          append: true,
        });
      }

      // Start flush timer
      this.flushTimer = setInterval(() => {
        this.flushBuffer();
      }, this.config.flushInterval);

      this.initialized = true;
      this.logger?.info('AuditLogger: Audit logger initialized', {
        logFile: this.config.logFile,
        enabled: this.config.enabled,
      });

      return this;
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to initialize audit logger', toError(error));
      throw error;
    }
  }

  /**
   * Close audit logger
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flushBuffer();

    if (this.auditFile) {
      this.auditFile.close();
      this.auditFile = undefined;
    }

    this.initialized = false;
    this.logger?.info('AuditLogger: Audit logger closed');
  }

  /**
   * Log API call
   */
  async logApiCall(entry: Omit<ApiAuditEntry, 'timestamp'>): Promise<void> {
    if (!this.config.enabled || (!this.config.logCalls.api && !entry.error)) {
      return;
    }

    try {
      const logEntry = {
        type: 'api_call',
        timestamp: new Date().toISOString(),
        ...entry,
      };

      await this.writeLogEntry(logEntry);
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to log API call', toError(error));
    }
  }

  /**
   * Log workflow operation
   */
  async logWorkflowOperation(entry: Omit<WorkflowAuditEntry, 'timestamp'>): Promise<void> {
    if (!this.config.enabled || (!this.config.logCalls.workflow && !entry.error)) {
      return;
    }

    try {
      const logEntry = {
        type: 'workflow_operation',
        timestamp: new Date().toISOString(),
        ...entry,
      };

      await this.writeLogEntry(logEntry);
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to log workflow operation', toError(error));
    }
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(entry: Omit<AuthAuditEntry, 'timestamp'>): Promise<void> {
    if (!this.config.enabled || (!this.config.logCalls.auth && !entry.error)) {
      return;
    }

    try {
      const logEntry = {
        type: 'auth_event',
        timestamp: new Date().toISOString(),
        ...entry,
      };

      await this.writeLogEntry(logEntry);
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to log auth event', toError(error));
    }
  }

  /**
   * Log system event
   */
  async logSystemEvent(entry: Omit<SystemAuditEntry, 'timestamp'>): Promise<void> {
    if (!this.config.enabled || (!this.config.logCalls.system && !entry.error)) {
      return;
    }

    try {
      const logEntry = {
        type: 'system_event',
        timestamp: new Date().toISOString(),
        ...entry,
      };

      await this.writeLogEntry(logEntry);
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to log system event', toError(error));
    }
  }

  /**
   * Log custom audit entry
   */
  async logCustomEvent(type: string, entry: Omit<BaseAuditEntry, 'timestamp'>): Promise<void> {
    if (!this.config.enabled || (!this.config.logCalls.custom && !entry.error)) {
      return;
    }

    try {
      const logEntry = {
        type,
        timestamp: new Date().toISOString(),
        ...entry,
      };

      await this.writeLogEntry(logEntry);
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to log custom event', toError(error), { type });
    }
  }

  /**
   * Search audit logs
   */
  async searchLogs(options: AuditSearchOptions = {}): Promise<Array<Record<string, unknown>>> {
    if (!this.config.enabled || !this.config.logFile) {
      return [];
    }

    const { userId, startTime, endTime, type, event, limit = 100 } = options;

    try {
      // This is a basic implementation - in production you'd want a proper log search
      const content = await Deno.readTextFile(this.config.logFile);
      const lines = content.split('\n').filter((line) => line.trim());
      const results: Array<Record<string, unknown>> = [];

      for (const line of lines.reverse()) { // Most recent first
        if (results.length >= limit) break;

        try {
          const entry = JSON.parse(line);

          // Apply filters
          if (userId && entry.userId !== userId) continue;
          if (type && entry.type !== type) continue;
          if (event && entry.event !== event) continue;

          if (startTime) {
            const entryTime = new Date(entry.timestamp);
            if (entryTime < startTime) continue;
          }

          if (endTime) {
            const entryTime = new Date(entry.timestamp);
            if (entryTime > endTime) continue;
          }

          results.push(entry);
        } catch {
          // Skip malformed lines
          continue;
        }
      }

      return results;
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to search logs', toError(error));
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(): Promise<AuditStats> {
    if (!this.config.enabled || !this.config.logFile) {
      return {
        totalEntries: 0,
        entriesByType: {},
        entriesByUser: {},
        recentActivity: [],
      };
    }

    try {
      const content = await Deno.readTextFile(this.config.logFile);
      const lines = content.split('\n').filter((line) => line.trim());

      const entriesByType: Record<string, number> = {};
      const entriesByUser: Record<string, number> = {};
      const hourlyActivity: Record<string, Record<string, number>> = {};

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Count by type
          entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;

          // Count by user
          if (entry.userId) {
            entriesByUser[entry.userId] = (entriesByUser[entry.userId] || 0) + 1;
          }

          // Hourly activity
          const hour = new Date(entry.timestamp).toISOString().substring(0, 13);
          if (!hourlyActivity[hour]) {
            hourlyActivity[hour] = {};
          }
          hourlyActivity[hour][entry.type] = (hourlyActivity[hour][entry.type] || 0) + 1;
        } catch {
          // Skip malformed lines
          continue;
        }
      }

      // Convert hourly activity to recent activity
      const recentActivity = Object.entries(hourlyActivity)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 24) // Last 24 hours
        .map(([timestamp, types]) => ({
          timestamp,
          type: 'all',
          count: Object.values(types).reduce((sum, count) => sum + count, 0),
        }));

      return {
        totalEntries: lines.length,
        entriesByType,
        entriesByUser,
        recentActivity,
      };
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to get audit stats', toError(error));
      return {
        totalEntries: 0,
        entriesByType: {},
        entriesByUser: {},
        recentActivity: [],
      };
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(): Promise<number> {
    if (!this.config.enabled || !this.config.logFile || !this.config.retentionDays) {
      return 0;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const content = await Deno.readTextFile(this.config.logFile);
      const lines = content.split('\n');
      const validLines: string[] = [];
      let removedCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line);
          const entryDate = new Date(entry.timestamp);

          if (entryDate >= cutoffDate) {
            validLines.push(line);
          } else {
            removedCount++;
          }
        } catch {
          // Keep malformed lines to avoid data loss
          validLines.push(line);
        }
      }

      if (removedCount > 0) {
        await Deno.writeTextFile(this.config.logFile, validLines.join('\n') + '\n');
        this.logger?.info('AuditLogger: Cleaned up old audit logs', { removedCount });
      }

      return removedCount;
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to cleanup old logs', toError(error));
      return 0;
    }
  }

  /**
   * Check if audit logging is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Update audit configuration
   */
  updateConfig(newConfig: Partial<AuditConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Write log entry to file and buffer
   */
  private async writeLogEntry(entry: Record<string, unknown>): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';

    // Add to buffer
    this.buffer.push(logLine);

    // Flush if buffer is full
    if (this.buffer.length >= (this.config.bufferSize || 100)) {
      await this.flushBuffer();
    }

    // Also log debug info
    this.logger?.debug('AuditLogger: Audit entry logged', { type: entry.type });
  }

  /**
   * Flush buffer to file
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0 || !this.auditFile) {
      return;
    }

    try {
      const content = this.buffer.join('');
      await this.auditFile.write(new TextEncoder().encode(content));
      await this.auditFile.sync();

      this.buffer = [];
    } catch (error) {
      this.logger?.error('AuditLogger: Failed to flush audit buffer', toError(error));
    }
  }
}
