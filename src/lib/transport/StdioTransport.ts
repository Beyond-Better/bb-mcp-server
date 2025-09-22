/**
 * STDIO Transport Implementation for MCP
 * 
 * Simpler than HTTP transport - delegates most work to MCP SDK
 * Handles standard input/output communication for traditional MCP clients
 */

import { McpServer } from 'mcp/server/mcp.js';
import { StdioServerTransport } from 'mcp/server/stdio.js';
import type { Transport, TransportType, StdioTransportConfig, TransportDependencies, StdioTransportMetrics } from './TransportTypes.ts';
import type { Logger } from '../utils/Logger.ts';
import { toError } from '../utils/Error.ts';

/**
 * STDIO transport implementation using official MCP SDK
 * Simpler than HTTP transport - delegates most work to MCP SDK
 */
export class StdioTransport implements Transport {
  readonly type: TransportType = 'stdio';
  
  private config: StdioTransportConfig;
  private dependencies: TransportDependencies;
  private logger: Logger;
  
  // MCP SDK components
  private mcpServer?: McpServer;
  private stdioServerTransport: StdioServerTransport;
  
  // Metrics tracking
  private startTime = Date.now();
  private messagesReceived = 0;
  private messagesSent = 0;
  private bytesReceived = 0;
  private bytesSent = 0;
  private connected = false;
  
  constructor(config: StdioTransportConfig, dependencies: TransportDependencies) {
    this.config = {
      ...config,
      enableLogging: config.enableLogging ?? true,
      bufferSize: config.bufferSize ?? 8192,
      encoding: config.encoding ?? 'utf8',
    };
    this.dependencies = dependencies;
    this.logger = dependencies.logger;
    
    // Initialize STDIO transport from MCP SDK
    this.stdioServerTransport = new StdioServerTransport();
  }
  
  async start(): Promise<void> {
    this.logger.info('StdioTransport: Starting STDIO transport', {
      enableLogging: this.config.enableLogging,
      bufferSize: this.config.bufferSize,
      encoding: this.config.encoding,
    });
  }
  
  async stop(): Promise<void> {
    this.logger.info('StdioTransport: Stopping STDIO transport');
    await this.disconnect();
  }
  
  async cleanup(): Promise<void> {
    this.logger.info('StdioTransport: Cleaning up STDIO transport');
    await this.disconnect();
  }
  
  /**
   * Connect MCP server to STDIO transport
   */
  async connect(mcpServer: McpServer): Promise<void> {
    if (this.connected) {
      this.logger.warn('StdioTransport: Already connected');
      return;
    }
    
    this.mcpServer = mcpServer;
    
    try {
      // Connect using official MCP SDK
      await mcpServer.connect(this.stdioServerTransport);
      this.connected = true;
      
      this.logger.info('StdioTransport: STDIO transport connected successfully');
      
      // Log transport event
      await this.dependencies.eventStore.logEvent({
        type: 'connection_established',
        transport: 'stdio',
        level: 'info',
        message: 'STDIO transport connected',
        data: {
          serverConnected: true,
          transportType: 'stdio',
        },
      });
      
    } catch (error) {
      this.connected = false;
      this.logger.error('StdioTransport: Failed to connect STDIO transport', toError(error));
      
      // Log error event
      await this.dependencies.eventStore.logEvent({
        type: 'connection_lost',
        transport: 'stdio',
        level: 'error',
        message: 'Failed to connect STDIO transport',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      
      throw error;
    }
  }
  
  /**
   * Disconnect STDIO transport
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.mcpServer) {
      return;
    }
    
    try {
      await this.mcpServer.close();
      this.connected = false;
      delete this.mcpServer;
      
      this.logger.info('StdioTransport: STDIO transport disconnected successfully');
      
      // Log transport event
      await this.dependencies.eventStore.logEvent({
        type: 'connection_lost',
        transport: 'stdio',
        level: 'info',
        message: 'STDIO transport disconnected',
        data: {
          cleanShutdown: true,
        },
      });
      
    } catch (error) {
      this.logger.error('StdioTransport: Error during STDIO disconnect', toError(error));
      
      // Force cleanup even on error
      this.connected = false;
      delete this.mcpServer;
      
      throw error;
    }
  }
  
  /**
   * Check if transport is connected
   */
  isConnected(): boolean {
    return this.connected && !!this.mcpServer;
  }
  
  /**
   * Get MCP server instance (if connected)
   */
  getMcpServer(): McpServer | undefined {
    return this.mcpServer;
  }
  
  /**
   * Get STDIO server transport instance
   */
  getStdioServerTransport(): StdioServerTransport {
    return this.stdioServerTransport;
  }
  
  /**
   * Log transport activity (for debugging)
   */
  async logActivity(activity: 'message_received' | 'message_sent', data: {
    messageType?: string;
    messageSize?: number;
    messageId?: string | number;
  }): Promise<void> {
    if (!this.config.enableLogging) {
      return;
    }
    
    // Update metrics
    if (activity === 'message_received') {
      this.messagesReceived++;
      if (data.messageSize) {
        this.bytesReceived += data.messageSize;
      }
    } else {
      this.messagesSent++;
      if (data.messageSize) {
        this.bytesSent += data.messageSize;
      }
    }
    
    // Log detailed activity
    this.logger.debug(`StdioTransport: ${activity}`, {
      activity,
      messageType: data.messageType,
      messageSize: data.messageSize,
      messageId: data.messageId,
      totalReceived: this.messagesReceived,
      totalSent: this.messagesSent,
    });
    
    // Log transport event for major activities
    if (data.messageType && ['tools/list', 'tools/call', 'initialize'].includes(data.messageType)) {
      await this.dependencies.eventStore.logEvent({
        type: activity === 'message_received' ? 'request_received' : 'request_processed',
        transport: 'stdio',
        level: 'debug',
        message: `STDIO ${activity}: ${data.messageType}`,
        data: {
          messageType: data.messageType,
          messageId: data.messageId,
          messageSize: data.messageSize,
        },
      });
    }
  }
  
  /**
   * Handle transport errors
   */
  async handleError(error: Error, context?: {
    messageType?: string;
    messageId?: string | number;
  }): Promise<void> {
    this.logger.error('StdioTransport: Transport error:', toError(error), {
      context,
      connected: this.connected,
    });
    
    // Log transport error event
    await this.dependencies.eventStore.logEvent({
      type: 'request_error',
      transport: 'stdio',
      level: 'error',
      message: `STDIO transport error: ${error.message}`,
      error,
      data: context,
    });
    
    // Consider disconnecting on critical errors
    if (error.name === 'ConnectionError' || error.message.includes('EPIPE')) {
      this.logger.warn('StdioTransport: Critical error detected, disconnecting');
      await this.disconnect();
    }
  }
  
  getMetrics(): StdioTransportMetrics {
    const uptime = Date.now() - this.startTime;
    const totalMessages = this.messagesReceived + this.messagesSent;
    const averageMessageSize = totalMessages > 0 
      ? (this.bytesReceived + this.bytesSent) / totalMessages 
      : 0;
    
    return {
      transport: 'stdio',
      uptime,
      requests: {
        total: totalMessages,
        successful: totalMessages, // STDIO doesn't track failed separately yet
        failed: 0,
        averageResponseTime: 0, // Would need request timing
      },
      stdio: {
        messagesReceived: this.messagesReceived,
        messagesSent: this.messagesSent,
        bytesReceived: this.bytesReceived,
        bytesSent: this.bytesSent,
      },
    };
  }
  
  /**
   * Get connection status and health information
   */
  getHealthStatus(): {
    connected: boolean;
    uptime: number;
    lastActivity: number;
    messagesProcessed: number;
  } {
    return {
      connected: this.connected,
      uptime: Date.now() - this.startTime,
      lastActivity: Date.now(), // Would need actual last activity tracking
      messagesProcessed: this.messagesReceived + this.messagesSent,
    };
  }
  
  /**
   * Validate STDIO environment
   */
  static validateEnvironment(): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Check if running in appropriate environment for STDIO
    if (typeof process === 'undefined') {
      issues.push('process global not available - may not be Node.js compatible environment');
    }
    
    if (typeof process !== 'undefined') {
      if (!process.stdin) {
        issues.push('process.stdin not available');
      }
      if (!process.stdout) {
        issues.push('process.stdout not available');
      }
      if (!process.stderr) {
        issues.push('process.stderr not available');
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }
}