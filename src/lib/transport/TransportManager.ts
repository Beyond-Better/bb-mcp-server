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
  //BeyondMcpAuthContext,
  ClientSessionInfo,
  //MCPRequest,
  //MCPResponse,
  SessionData,
  Transport,
  TransportConfig,
  TransportDependencies,
  TransportMetrics,
  TransportType,
} from './TransportTypes.ts';
import type { BeyondMcpServer } from '../server/BeyondMcpServer.ts';
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
  private startTime = performance.now();

  constructor(config: TransportConfig, dependencies: TransportDependencies) {
    this.config = config;
    this.dependencies = dependencies;
    this.logger = dependencies.logger;

    // 🔒 Log authentication configuration status per MCP specification
    this.logAuthenticationStatus(config, dependencies);

    // Initialize the appropriate transport based on configuration
    if (config.type === 'http') {
      if (!config.http) {
        throw new Error('HTTP transport selected but no HTTP configuration provided');
      }

      // 🔒 SECURITY: HTTP transport SHOULD use OAuth per MCP spec
      this.validateHttpAuthConfiguration(config.http, dependencies);

      this.httpTransport = new HttpTransport(config.http, dependencies);
      this.currentTransport = this.httpTransport;
    } else {
      if (!config.stdio) {
        // Provide default STDIO config
        config.stdio = {
          enableLogging: true,
          bufferSize: 8192,
          encoding: 'utf8',
          // 🔒 MCP spec: STDIO SHOULD NOT use OAuth
          enableAuthentication: false,
          skipAuthentication: false,
        };
      }

      // 🔒 SECURITY: STDIO transport SHOULD NOT use OAuth per MCP spec
      this.validateStdioAuthConfiguration(config.stdio, dependencies);

      this.stdioTransport = new StdioTransport(config.stdio, dependencies);
      this.currentTransport = this.stdioTransport;
    }

    this.logger.info('TransportManager: Initialized', {
      transportType: config.type,
      hasHttpConfig: !!config.http,
      hasStdioConfig: !!config.stdio,
      hasOAuthProvider: !!dependencies.oauthProvider,
      hasOAuthConsumer: !!dependencies.oauthConsumer,
      hasThirdPartyApiClient: !!dependencies.thirdPartyApiClient,
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
      await this.currentTransport.start(this.sdkMcpServer);

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
   *
   * 🔒 SECURITY-CRITICAL: Provides authentication context to HTTP transport
   */
  async handleHttpRequest(
    request: Request,
    beyondMcpServer: BeyondMcpServer, // BeyondMcpServer instance for auth context execution
  ): Promise<Response> {
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
      hasBeyondMcpServer: !!beyondMcpServer,
      hasAuthentication: !!this.dependencies.oauthProvider,
    });

    try {
      // 🔒 Pass BeyondMcpServer instance for authentication context execution
      const response = await this.httpTransport.handleHttpRequest(
        request,
        this.sdkMcpServer,
        beyondMcpServer, // BeyondMcpServer for executeWithAuthContext()
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

    if (!this.sdkMcpServer) {
      throw new Error(
        'Cannot switch TransportManager - SDK MCP server not set. Call initialize() first.',
      );
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
      await this.currentTransport.start(this.sdkMcpServer);

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
   * Get client session information (unified API for both transports)
   * Returns array of client session info for all connected clients
   */
  getClientSessions(): ClientSessionInfo[] {
    if (this.config.type === 'http' && this.httpTransport) {
      return this.httpTransport.getAllClientSessions();
    } else if (this.config.type === 'stdio' && this.stdioTransport) {
      const client = this.stdioTransport.getClientSession();
      return client ? [client] : [];
    }
    return [];
  }

  /**
   * Get client session information for a specific session
   */
  getClientSession(sessionId: string): ClientSessionInfo | undefined {
    if (this.config.type === 'http' && this.httpTransport) {
      return this.httpTransport.getClientSession(sessionId);
    } else if (this.config.type === 'stdio' && this.stdioTransport) {
      const client = this.stdioTransport.getClientSession();
      return client?.sessionId === sessionId ? client : undefined;
    }
    return undefined;
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
        uptime: performance.now() - this.startTime,
        initialized: this.initialized,
        connected: this.isConnected(),
        transportType: this.config.type,
      },
    };
  }

  /**
   * Get authentication status for monitoring and health checks
   */
  getAuthenticationStatus(): {
    enabled: boolean;
    oauthProvider: 'available' | 'unavailable';
    oauthConsumer: 'available' | 'unavailable';
    thirdPartyApiClient: 'available' | 'unavailable';
    sessionBinding: 'full' | 'basic' | 'none';
    autoRefresh: 'enabled' | 'disabled';
    mcpSpecCompliance: 'compliant' | 'non-compliant' | 'discouraged-but-allowed';
  } {
    const hasOAuthProvider = !!this.dependencies.oauthProvider;
    const hasOAuthConsumer = !!this.dependencies.oauthConsumer;
    const hasThirdPartyApiClient = !!this.dependencies.thirdPartyApiClient;

    // Determine session binding level
    let sessionBinding: 'full' | 'basic' | 'none';
    if (hasOAuthProvider && hasOAuthConsumer && hasThirdPartyApiClient) {
      sessionBinding = 'full'; // Full session binding with auto-refresh
    } else if (hasOAuthProvider && hasOAuthConsumer) {
      sessionBinding = 'basic'; // Session binding without auto-refresh
    } else {
      sessionBinding = 'none'; // No session binding
    }

    // Determine MCP specification compliance
    let mcpSpecCompliance: 'compliant' | 'non-compliant' | 'discouraged-but-allowed';
    if (this.config.type === 'http') {
      // HTTP SHOULD use OAuth per MCP spec
      mcpSpecCompliance = hasOAuthProvider ? 'compliant' : 'non-compliant';
    } else {
      // STDIO SHOULD NOT use OAuth per MCP spec
      mcpSpecCompliance = hasOAuthProvider ? 'discouraged-but-allowed' : 'compliant';
    }

    return {
      enabled: hasOAuthProvider,
      oauthProvider: hasOAuthProvider ? 'available' : 'unavailable',
      oauthConsumer: hasOAuthConsumer ? 'available' : 'unavailable',
      thirdPartyApiClient: hasThirdPartyApiClient ? 'available' : 'unavailable',
      sessionBinding,
      autoRefresh: hasThirdPartyApiClient ? 'enabled' : 'disabled',
      mcpSpecCompliance,
    };
  }

  /**
   * Get health status with authentication information
   */
  getHealthStatus(): {
    healthy: boolean;
    transportType: TransportType;
    initialized: boolean;
    connected: boolean;
    uptime: number;
    issues: string[];
    authentication: {
      enabled: boolean;
      oauthProvider: 'available' | 'unavailable';
      oauthConsumer: 'available' | 'unavailable';
      thirdPartyApiClient: 'available' | 'unavailable';
      sessionBinding: 'full' | 'basic' | 'none';
      autoRefresh: 'enabled' | 'disabled';
      mcpSpecCompliance: 'compliant' | 'non-compliant' | 'discouraged-but-allowed';
    };
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

    // Get authentication status
    const authentication = this.getAuthenticationStatus();

    // Add authentication-related issues
    if (this.config.type === 'http' && authentication.mcpSpecCompliance === 'non-compliant') {
      issues.push('HTTP transport without OAuth (not recommended by MCP specification)');
    }

    return {
      healthy: issues.length === 0,
      transportType: this.config.type,
      initialized: this.initialized,
      connected: this.isConnected(),
      uptime: performance.now() - this.startTime,
      issues,
      authentication,
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

  /**
   * 🔒 SECURITY: Log authentication configuration status per MCP specification
   */
  private logAuthenticationStatus(
    config: TransportConfig,
    dependencies: TransportDependencies,
  ): void {
    const hasOAuthProvider = !!dependencies.oauthProvider;
    const hasOAuthConsumer = !!dependencies.oauthConsumer;
    const hasThirdPartyApiClient = !!dependencies.thirdPartyApiClient;

    if (config.type === 'http') {
      if (hasOAuthProvider) {
        this.logger.info(
          'TransportManager: HTTP transport with OAuth authentication (recommended by MCP spec)',
          {
            transport: 'http',
            authentication: 'oauth',
            specification: 'MCP HTTP transports SHOULD use OAuth',
            sessionBinding: hasOAuthConsumer && hasThirdPartyApiClient,
          },
        );
      } else {
        this.logger.warn(
          'TransportManager: HTTP transport without OAuth authentication (not recommended by MCP spec)',
          {
            transport: 'http',
            authentication: 'none',
            specification: 'MCP HTTP transports SHOULD use OAuth',
            recommendation: 'Configure OAuth provider for HTTP transport',
          },
        );
      }
    } else if (config.type === 'stdio') {
      if (hasOAuthProvider) {
        this.logger.warn(
          'TransportManager: STDIO transport with OAuth authentication (discouraged by MCP spec)',
          {
            transport: 'stdio',
            authentication: 'oauth',
            specification: 'MCP STDIO transports SHOULD NOT use OAuth',
            recommendation: 'Use environment-based credentials for STDIO transport',
          },
        );
      } else {
        this.logger.info(
          'TransportManager: STDIO transport with environment credentials (recommended by MCP spec)',
          {
            transport: 'stdio',
            authentication: 'environment',
            specification: 'MCP STDIO transports SHOULD NOT use OAuth',
          },
        );
      }
    }

    if (hasOAuthProvider && hasOAuthConsumer && hasThirdPartyApiClient) {
      this.logger.info(
        'TransportManager: Full session binding enabled (MCP + third-party authentication)',
        {
          sessionBinding: 'full',
          autoRefresh: 'enabled',
          security: 'enhanced',
        },
      );
    } else if (hasOAuthProvider && hasOAuthConsumer) {
      this.logger.info('TransportManager: Session binding enabled (no auto-refresh)', {
        sessionBinding: 'basic',
        autoRefresh: 'disabled',
        security: 'standard',
      });
    } else if (hasOAuthProvider) {
      this.logger.info('TransportManager: MCP token validation only', {
        sessionBinding: 'none',
        authentication: 'mcp-only',
        security: 'basic',
      });
    }
  }

  /**
   * 🔒 SECURITY: Validate HTTP transport authentication configuration
   */
  private validateHttpAuthConfiguration(
    httpConfig: any,
    dependencies: TransportDependencies,
  ): void {
    const hasOAuthProvider = !!dependencies.oauthProvider;
    const authEnabled = httpConfig.enableAuthentication;
    const authSkipped = httpConfig.skipAuthentication;

    // MCP spec: HTTP transports SHOULD use OAuth
    if (!hasOAuthProvider && !authSkipped) {
      this.logger.warn(
        'TransportManager: HTTP transport without OAuth provider (MCP spec recommends OAuth)',
        {
          transport: 'http',
          hasOAuthProvider: false,
          mcpSpecification: 'HTTP transports SHOULD use OAuth',
          recommendation: 'Configure OAuth provider or set skipAuthentication=true',
        },
      );
    }

    if (authEnabled && !hasOAuthProvider) {
      throw new Error('HTTP transport authentication enabled but no OAuth provider available');
    }

    if (authSkipped && hasOAuthProvider) {
      this.logger.warn(
        'TransportManager: Authentication explicitly disabled despite OAuth provider availability',
        {
          transport: 'http',
          authSkipped: true,
          hasOAuthProvider: true,
          security: 'REDUCED - Authentication disabled',
        },
      );
    }
  }

  /**
   * 🔒 SECURITY: Validate STDIO transport authentication configuration
   */
  private validateStdioAuthConfiguration(
    stdioConfig: any,
    dependencies: TransportDependencies,
  ): void {
    const hasOAuthProvider = !!dependencies.oauthProvider;
    const authEnabled = stdioConfig.enableAuthentication;

    // MCP spec: STDIO transports SHOULD NOT use OAuth
    if (authEnabled && hasOAuthProvider) {
      this.logger.warn(
        'TransportManager: STDIO transport with OAuth authentication (discouraged by MCP spec)',
        {
          transport: 'stdio',
          authEnabled: true,
          hasOAuthProvider: true,
          mcpSpecification: 'STDIO transports SHOULD NOT use OAuth',
          recommendation: 'Use environment-based credentials for STDIO transport',
          note: 'OAuth is allowed but discouraged - consider disabling for spec compliance',
        },
      );
    }

    if (authEnabled && !hasOAuthProvider) {
      throw new Error('STDIO transport authentication enabled but no OAuth provider available');
    }
  }
}
