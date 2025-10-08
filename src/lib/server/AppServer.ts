/**
 * AppServer - Ultimate clean entry point for MCP servers
 *
 * Provides zero-config MCP server startup with full customization capabilities.
 * Handles MCP server lifecycle, HTTP server lifecycle, transport detection,
 * signal handling, and error recovery.
 *
 * Usage patterns:
 * - new AppServer() // Zero config
 * - new AppServer({ config }) // Custom config
 * - new AppServer({ thirdpartyApiClientClass: MyApiClient }) // Custom classes
 * - new AppServer(new ExampleDependencies()) // Class-based config
 */

import { ConfigManager } from '../config/ConfigManager.ts';
import { BeyondMcpServer } from './BeyondMcpServer.ts';
import { HttpServer } from './HttpServer.ts';
import { Logger } from '../utils/Logger.ts';
//import { KVManager } from '../storage/KVManager.ts';
import { toError } from '../utils/Error.ts';
import type {
  //AppServerConfig,
  AppServerDependencies,
  CreateCustomAppServerDependencies,
} from '../types/AppServerTypes.ts';
import type { TransportConfig } from '../transport/TransportTypes.ts';
import {
  getAllDependencies,
  getAuditLogger,
  getConfigManager,
  getCredentialStore,
  getKvManager,
  getLogger,
  performHealthChecks,
  validateConfiguration,
} from './DependencyHelpers.ts';

/**
 * Main application server that orchestrates MCP and HTTP servers
 */
export class AppServer {
  private dependencies: AppServerDependencies;
  private _configManager: ConfigManager;
  private _logger: Logger;
  private beyondMcpServer: BeyondMcpServer;
  private httpServer?: HttpServer;
  private started = false;
  private initialized = false;

  get configManager(): ConfigManager {
    return this._configManager;
  }
  set configManager(configManager: ConfigManager) {
    this._configManager = configManager;
  }
  get logger(): Logger {
    return this._logger;
  }
  set logger(logger: Logger) {
    this._logger = logger;
  }

  private constructor(dependencies: AppServerDependencies) {
    this.dependencies = dependencies;
    this._configManager = dependencies.configManager;
    this._logger = dependencies.logger;
    this.beyondMcpServer = dependencies.beyondMcpServer;

    this._logger.info('AppServer: Initialized with dependencies');
    this.initialized = true;
  }

  /**
   * Create AppServer instance with async dependency initialization
   */
  static async create(
    dependenciesOrFunction?:
      | Partial<AppServerDependencies>
      | ((
        { configManager, logger, auditLogger, kvManager }: CreateCustomAppServerDependencies,
      ) => Promise<Partial<AppServerDependencies>>),
  ): Promise<AppServer> {
    // =============================================================================
    // LIBRARY COMPONENT INITIALIZATION
    // 🎯 Most dependencies come from bb-mcp-server library - zero consumer implementation
    // =============================================================================

    let appDependencies: Partial<AppServerDependencies>;

    if (typeof dependenciesOrFunction === 'function') {
      const configManager = await getConfigManager();
      const logger = getLogger(configManager);
      const auditLogger = getAuditLogger(configManager, logger);
      const kvManager = await getKvManager(configManager, logger);
      const credentialStore = getCredentialStore(kvManager, logger);
      // logger.info('AppServer: Calling client dependencies function', {
      //   kvManager,
      //   credentialStore,
      // });
      appDependencies = await dependenciesOrFunction({
        configManager,
        logger,
        auditLogger,
        kvManager,
        credentialStore,
      });
    } else {
      appDependencies = dependenciesOrFunction || {};
      // appDependencies.logger.info('AppServer: Got client dependencies values', {
      //   kvManager: appDependencies.kvManager,
      //   credentialStore: appDependencies.credentialStore,
      // });
    }
    const resolvedDependencies: AppServerDependencies = await getAllDependencies(
      appDependencies,
    );

    // =============================================================================
    // DEPENDENCY VALIDATION AND HEALTH CHECKS
    // =============================================================================

    // Validate required configuration (only validates OAuth consumer config if OAuth consumer is actually used)
    await validateConfiguration(resolvedDependencies.configManager, resolvedDependencies.logger, {
      oauthConsumer: resolvedDependencies.oauthConsumer,
    });

    // Perform health checks on external dependencies
    await performHealthChecks(
      {
        kvManager: resolvedDependencies.kvManager,
        oauthProvider: resolvedDependencies.oauthProvider,
        oauthConsumer: resolvedDependencies.oauthConsumer,
        thirdpartyApiClient: resolvedDependencies.thirdpartyApiClient,
      },
      resolvedDependencies.logger,
      resolvedDependencies.additionalHealthChecks,
    );

    const componentsCreatedLibrary = [
      'Logger',
      'AuditLogger',
      'KVManager',
      'WorkflowRegistry',
      'OAuthProvider',
      'TransportManager',
    ];
    const componentsCreatedConsumer = [];
    if (resolvedDependencies.oauthConsumer) componentsCreatedConsumer.push('OAuthConsumer');
    if (resolvedDependencies.thirdpartyApiClient) {
      componentsCreatedConsumer.push('ThirdPartyApiClient');
    }

    // Log successful initialization
    resolvedDependencies.logger.info(
      `AppServer: ${
        resolvedDependencies.serverConfig?.title
          ? resolvedDependencies.serverConfig?.title
          : 'Custom'
      } MCP server dependencies initialized successfully`,
      {
        libraryComponents: componentsCreatedLibrary,
        consumerComponents: componentsCreatedConsumer,
        transportType: resolvedDependencies.configManager.get('MCP_TRANSPORT', 'stdio'),
        thirdPartyApiUrl: resolvedDependencies.thirdpartyApiClient?.baseUrl || 'n/a',
      },
    );

    return new AppServer(resolvedDependencies);
  }

  /**
   * Start the application server
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        'AppServer not initialized - use AppServer.create() instead of new AppServer()',
      );
    }

    if (this.started) {
      this._logger.warn('AppServer: Already started');
      return;
    }

    this._logger.info('AppServer: Starting application server...');

    try {
      // Get transport configuration
      const transportConfig = this._configManager.getTransportConfig();

      // only start http server for transport mode 'http' or if using OAuth provider in 'stdio' mode

      // Start servers based on transport type
      if (transportConfig?.type === 'http') {
        await this.startHttpMode(transportConfig);
      } else {
        await this.startStdioMode(transportConfig);
      }

      // Setup graceful shutdown
      this.setupShutdownHandlers();

      this.started = true;
      this._logger.info('AppServer: Application server started successfully', {
        transport: transportConfig?.type || 'stdio',
        httpServer: !!this.httpServer,
      });
    } catch (error) {
      this._logger.error('AppServer: Failed to start application server', toError(error));
      throw error;
    }
  }

  /**
   * Stop the application server
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this._logger.info('AppServer: Stopping application server...');

    try {
      // Stop HTTP server first (if running)
      if (this.httpServer) {
        await this.httpServer.stop();
      }

      // Stop Beyond MCP server
      await this.beyondMcpServer.shutdown();

      this.started = false;
      this._logger.info('AppServer: Application server stopped successfully');
    } catch (error) {
      this._logger.error('AppServer: Error during shutdown', toError(error));
      throw error;
    }
  }

  /**
   * Start in HTTP mode - HTTP server handles both MCP and API endpoints
   */
  private async startHttpMode(transportConfig: TransportConfig): Promise<void> {
    this._logger.info('AppServer: Starting HTTP mode...');

    // Create HTTP server if we have the dependencies
    if (this.dependencies.httpServerConfig) {
      this.httpServer = new HttpServer({
        logger: this._logger,
        beyondMcpServer: this.dependencies.beyondMcpServer,
        transportManager: this.dependencies.transportManager,
        oauthProvider: this.dependencies.oauthProvider!,
        oauthConsumer: this.dependencies.oauthConsumer,
        workflowRegistry: this.dependencies.workflowRegistry,
        httpServerConfig: this.dependencies.httpServerConfig,
        docsEndpointHandler: this.dependencies.docsEndpointHandler,
      });

      // Start HTTP server (handles MCP via /mcp endpoint)
      await this.httpServer.start();
    } else {
      this._logger.warn('AppServer: HTTP transport configured but no HTTP server config provided');
    }
  }

  /**
   * Start in STDIO mode - MCP server uses STDIO + optional HTTP server for OAuth
   */
  private async startStdioMode(transportConfig?: TransportConfig): Promise<void> {
    this._logger.info('AppServer: Starting STDIO mode...');

    // Start Beyond MCP server with STDIO transport
    await this.beyondMcpServer.start();

    // Start HTTP server for OAuth callbacks (if configured)
    if (this.dependencies.httpServerConfig && this.dependencies.oauthProvider) {
      this.httpServer = new HttpServer({
        logger: this._logger,
        beyondMcpServer: this.dependencies.beyondMcpServer,
        transportManager: this.dependencies.transportManager,
        oauthProvider: this.dependencies.oauthProvider,
        oauthConsumer: this.dependencies.oauthConsumer,
        workflowRegistry: this.dependencies.workflowRegistry,
        httpServerConfig: this.dependencies.httpServerConfig,
      });

      await this.httpServer.start();
      this._logger.info('AppServer: HTTP server started for OAuth callbacks');
    }
  }

  /**
   * Setup graceful shutdown signal handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      this._logger.info(`AppServer: Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        Deno.exit(0);
      } catch (error) {
        this._logger.error('AppServer: Error during graceful shutdown', toError(error));
        Deno.exit(1);
      }
    };

    // Handle shutdown signals
    Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'));
    Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'));

    // Keep process alive for HTTP mode
    const transportConfig = this._configManager.getTransportConfig();
    if (transportConfig?.type === 'http') {
      this._logger.info('AppServer: HTTP server running. Press Ctrl+C to shutdown.');
    }
  }

  /**
   * Get application server status
   */
  getStatus(): {
    started: boolean;
    transport: string;
    beyondMcpServerInitialized: boolean;
    httpServerRunning: boolean;
    uptime?: number;
  } {
    const transportConfig = this._configManager.getTransportConfig();

    return {
      started: this.started,
      transport: transportConfig?.type || 'stdio',
      beyondMcpServerInitialized: true, // If we got this far, it's initialized
      httpServerRunning: !!this.httpServer,
    };
  }
}
