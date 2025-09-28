/**
 * Transport Manager - Main transport controller
 *
 * Provides unified interface for MCP protocol handling
 * Abstracts STDIO vs HTTP transports and manages transport lifecycle
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import { HttpTransport } from './HttpTransport.ts';
import { StdioTransport } from './StdioTransport.ts';
import type {
  BeyondMcpAuthContext,
  MCPRequest,
  MCPResponse,
  SessionData,
  Transport,
  TransportConfig,
  TransportDependencies,
  TransportMetrics,
  TransportType,
} from './TransportTypes.ts';
import type { Logger } from '../utils/Logger.ts';
import { toError } from '../utils/Error.ts';

/**
 * Main transport controller that abstracts STDIO vs HTTP transports
 * Provides unified interface for MCP protocol handling
 */
export class TransportManager {
  private config: TransportConfig;
  private dependencies: TransportDependencies;
  private logger: Logger;

  // Transport instances
  private httpTransport?: HttpTransport;
  private stdioTransport?: StdioTransport;
  private currentTransport: Transport;

  // SDK MCP Server reference
  private sdkMcpServer?: SdkMcpServer;

  // Manager state
  private initialized = false;
  private startTime = Date.now();

  constructor(config: TransportConfig, dependencies: TransportDependencies) {
    this.config = config;
    this.dependencies = dependencies;
    this.logger = dependencies.logger;

    // Initialize the appropriate transport based on configuration
    if (config.type === 'http') {
      if (!config.http) {
        throw new Error('HTTP transport selected but no HTTP configuration provided');
      }
      this.httpTransport = new HttpTransport(config.http, dependencies);
      this.currentTransport = this.httpTransport;
    } else {
      if (!config.stdio) {
        // Provide default STDIO config
        config.stdio = {
          enableLogging: true,
          bufferSize: 8192,
          encoding: 'utf8',
        };
      }
      this.stdioTransport = new StdioTransport(config.stdio, dependencies);
      this.currentTransport = this.stdioTransport;
    }

    this.logger.info('TransportManager: Initialized', {
      transportType: config.type,
      hasHttpConfig: !!config.http,
      hasStdioConfig: !!config.stdio,
    });
  }

  /**
   * Initialize transport manager and optionally restore persisted sessions
   */
  async initialize(sdkMcpServer: SdkMcpServer): Promise<void> {
    if (this.initialized) {
      this.logger.warn('TransportManager: Already initialized');
      return;
    }

    this.sdkMcpServer = sdkMcpServer;

    this.logger.info('TransportManager: Initializing transport manager', {
      transportType: this.config.type,
      hasSdkMcpServer: !!sdkMcpServer,
    });

    try {
      // Start the current transport
      await this.currentTransport.start();

      // For STDIO transport, establish the connection immediately
      if (this.stdioTransport && this.config.type === 'stdio') {
        await this.stdioTransport.connect(sdkMcpServer);
      }

      this.initialized = true;

      // Log initialization success
      await this.dependencies.eventStore.logEvent({
        type: 'transport_started',
        transport: this.config.type,
        level: 'info',
        message: `Transport manager initialized with ${this.config.type} transport`,
        data: {
          transportType: this.config.type,
          initialized: true,
        },
      });

      this.logger.info('TransportManager: Initialization completed successfully', {
        transportType: this.config.type,
        initialized: this.initialized,
      });
    } catch (error) {
      this.logger.error('TransportManager: Failed to initialize', toError(error));

      // Log initialization error
      await this.dependencies.eventStore.logEvent({
        type: 'transport_started',
        transport: this.config.type,
        level: 'error',
        message: `Failed to initialize transport manager: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  }

  /**
   * Start the transport manager (alias for initialize for backward compatibility)
   */
  async start(): Promise<void> {
    if (!this.sdkMcpServer) {
      throw new Error(
        'Cannot start TransportManager - SDK MCP server not set. Call initialize() first.',
      );
    }

    if (this.initialized) {
      this.logger.warn('TransportManager: Already started');
      return;
    }

    await this.initialize(this.sdkMcpServer);
  }

  /**
   * Handle HTTP MCP request (for HTTP transport only)
   */
  async handleHttpRequest(request: Request, authContext?: BeyondMcpAuthContext): Promise<Response> {
    if (!this.initialized) {
      throw new Error('TransportManager not initialized');
    }

    if (this.config.type !== 'http' || !this.httpTransport) {
      throw new Error('HTTP requests not supported - transport is not HTTP');
    }

    if (!this.sdkMcpServer) {
      throw new Error('SDK MCP server not available');
    }

    const requestId = Math.random().toString(36).substring(2, 15);

    this.logger.debug('TransportManager: Handling HTTP MCP request', {
      requestId,
      method: request.method,
      url: request.url,
      hasAuthContext: !!authContext,
    });

    try {
      const response = await this.httpTransport.handleHttpRequest(
        request,
        this.sdkMcpServer,
        authContext,
      );

      this.logger.debug('TransportManager: HTTP MCP request completed', {
        requestId,
        status: response.status,
      });

      return response;
    } catch (error) {
      this.logger.error('TransportManager: HTTP MCP request failed:', toError(error), {
        requestId,
      });

      throw error;
    }
  }

  /**
   * Get current transport type
   */
  getTransportType(): TransportType {
    return this.config.type;
  }

  /**
   * Check if transport manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if transport is connected (mainly for STDIO)
   */
  isConnected(): boolean {
    if (this.config.type === 'stdio' && this.stdioTransport) {
      return this.stdioTransport.isConnected();
    }

    // HTTP transport is always "connected" when initialized
    return this.initialized;
  }

  /**
   * Get SDK MCP server instance
   */
  getSdkMcpServer(): SdkMcpServer | undefined {
    return this.sdkMcpServer;
  }

  /**
   * Transport switching (for future use)
   */
  async switchTransport(
    newType: TransportType,
    newConfig?: Partial<TransportConfig>,
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('Cannot switch transport - manager not initialized');
    }

    if (newType === this.config.type) {
      this.logger.warn('TransportManager: Attempt to switch to same transport type', { newType });
      return;
    }

    this.logger.info('TransportManager: Switching transport', {
      from: this.config.type,
      to: newType,
    });

    try {
      // Stop current transport
      await this.currentTransport.stop();

      // Update configuration
      this.config = {
        ...this.config,
        type: newType,
        ...newConfig,
      };

      // Initialize new transport
      if (newType === 'http') {
        if (!this.config.http) {
          throw new Error('No HTTP configuration provided for transport switch');
        }
        this.httpTransport = new HttpTransport(this.config.http, this.dependencies);
        this.currentTransport = this.httpTransport;
      } else {
        if (!this.config.stdio) {
          this.config.stdio = {
            enableLogging: true,
            bufferSize: 8192,
            encoding: 'utf8',
          };
        }
        this.stdioTransport = new StdioTransport(this.config.stdio, this.dependencies);
        this.currentTransport = this.stdioTransport;
      }

      // Start new transport
      await this.currentTransport.start();

      // For STDIO, establish connection
      if (newType === 'stdio' && this.stdioTransport && this.sdkMcpServer) {
        await this.stdioTransport.connect(this.sdkMcpServer);
      }

      this.logger.info('TransportManager: Transport switch completed', {
        newType,
        connected: this.isConnected(),
      });
    } catch (error) {
      this.logger.error('TransportManager: Transport switch failed', toError(error));
      throw error;
    }
  }

  /**
   * Session management (HTTP transport only)
   */
  async createSession(
    sessionData: Omit<
      SessionData,
      'id' | 'createdAt' | 'lastActiveAt' | 'expiresAt' | 'transportType'
    >,
  ): Promise<string> {
    if (this.config.type !== 'http' || !this.httpTransport) {
      throw new Error('Session management only available for HTTP transport');
    }

    // Session creation would be handled by HttpTransport or SessionManager
    // This is a placeholder for future implementation
    const sessionId = crypto.randomUUID();

    this.logger.info('TransportManager: Session creation requested', {
      sessionId,
      userId: sessionData.userId,
      clientId: sessionData.clientId,
    });

    return sessionId;
  }

  /**
   * Get session information (HTTP transport only)
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (this.config.type !== 'http' || !this.httpTransport) {
      return null;
    }

    // Session retrieval would be handled by HttpTransport or SessionManager
    // This is a placeholder for future implementation
    this.logger.debug('TransportManager: Session retrieval requested', { sessionId });

    return null;
  }

  /**
   * Get active session count (HTTP transport only)
   */
  getSessionCount(): number {
    if (this.config.type === 'http' && this.httpTransport) {
      return this.httpTransport.getSessionCount();
    }

    return 0;
  }

  /**
   * Get active session IDs (HTTP transport only)
   */
  getActiveSessions(): string[] {
    if (this.config.type === 'http' && this.httpTransport) {
      return this.httpTransport.getActiveSessions();
    }

    return [];
  }

  /**
   * Get comprehensive transport metrics
   */
  getMetrics(): TransportMetrics & {
    manager: {
      uptime: number;
      initialized: boolean;
      connected: boolean;
      transportType: TransportType;
    };
  } {
    const baseMetrics = this.currentTransport.getMetrics();

    return {
      ...baseMetrics,
      manager: {
        uptime: Date.now() - this.startTime,
        initialized: this.initialized,
        connected: this.isConnected(),
        transportType: this.config.type,
      },
    };
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    healthy: boolean;
    transportType: TransportType;
    initialized: boolean;
    connected: boolean;
    uptime: number;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!this.initialized) {
      issues.push('Transport manager not initialized');
    }

    if (!this.isConnected()) {
      issues.push('Transport not connected');
    }

    if (!this.sdkMcpServer) {
      issues.push('SDK MCP server not available');
    }

    // Additional transport-specific checks
    if (this.config.type === 'stdio' && this.stdioTransport) {
      const envCheck = StdioTransport.validateEnvironment();
      if (!envCheck.valid) {
        issues.push(...envCheck.issues);
      }
    }

    return {
      healthy: issues.length === 0,
      transportType: this.config.type,
      initialized: this.initialized,
      connected: this.isConnected(),
      uptime: Date.now() - this.startTime,
      issues,
    };
  }

  /**
   * Cleanup and shutdown transport manager
   */
  async cleanup(): Promise<void> {
    this.logger.info('TransportManager: Starting cleanup');

    try {
      // Stop current transport
      await this.currentTransport.stop();

      // Additional cleanup for specific transports
      if (this.stdioTransport) {
        await this.stdioTransport.cleanup();
      }
      if (this.httpTransport) {
        await this.httpTransport.cleanup();
      }

      this.initialized = false;
      delete this.sdkMcpServer;

      // Log cleanup completion
      await this.dependencies.eventStore.logEvent({
        type: 'transport_stopped',
        transport: this.config.type,
        level: 'info',
        message: 'Transport manager cleaned up successfully',
        data: {
          transportType: this.config.type,
          cleanShutdown: true,
        },
      });

      this.logger.info('TransportManager: Cleanup completed');
    } catch (error) {
      this.logger.error('TransportManager: Error during cleanup', toError(error));

      // Force cleanup even on error
      this.initialized = false;
      delete this.sdkMcpServer;

      throw error;
    }
  }
}
