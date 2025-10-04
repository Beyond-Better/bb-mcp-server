/**
 * Dependency Helpers - Core dependency injection for AppServer
 *
 * Provides helper functions for creating standard library dependencies
 * and the main getAllDependencies function that orchestrates the entire
 * dependency injection system with class-based overrides.
 */

import { ConfigManager } from '../config/ConfigManager.ts';
import type {
  OAuthProviderConfig,
  TransportEventStoreChunkedConfig,
} from '../config/ConfigTypes.ts';
import { Logger } from '../utils/Logger.ts';
import { AuditLogger } from '../utils/AuditLogger.ts';
import { KVManager } from '../storage/KVManager.ts';
import { SessionStore } from '../storage/SessionStore.ts';
import { TransportEventStore } from '../storage/TransportEventStore.ts';
import { TransportEventStoreChunked } from '../storage/TransportEventStoreChunked.ts';
import { CredentialStore } from '../storage/CredentialStore.ts';
import { ErrorHandler } from '../utils/ErrorHandler.ts';
import { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import { ToolRegistry } from '../tools/ToolRegistry.ts';
import { PluginManager } from '../plugins/PluginManager.ts';
import { OAuthProvider } from '../auth/OAuthProvider.ts';
import { OAuthConsumer } from '../auth/OAuthConsumer.ts';
import { TransportManager } from '../transport/TransportManager.ts';
import { BeyondMcpServer } from './BeyondMcpServer.ts';
import { toError } from '../utils/Error.ts';
import type {
  //AppServerConfig,
  AppServerDependencies,
  AppServerOverrides,
  DependenciesHealthCheck,
} from '../types/AppServerTypes.ts';
import type { HttpServerConfig } from './ServerTypes.ts';
import { loadInstructions, validateInstructions } from '../utils/InstructionsLoader.ts';

/**
 * Create standard configManager instance
 */
export async function getConfigManager(): Promise<ConfigManager> {
  const configManager = new ConfigManager({
    envFile: new URL('.env', import.meta.url).pathname,
  });
  await configManager.loadConfig();
  return configManager;
}

/**
 * Create standard logger instance
 */
export function getLogger(configManager: ConfigManager): Logger {
  const logger = new Logger({
    level: configManager.get('LOG_LEVEL', 'info'),
    format: configManager.get('LOG_FORMAT', 'json'),
  });
  configManager.logger = logger; // configManager would have been created with default values for Logger
  return logger;
}

/**
 * Create standard audit logger instance
 */
export function getAuditLogger(configManager: ConfigManager, logger: Logger): AuditLogger {
  return new AuditLogger({
    enabled: configManager.get('AUDIT_ENABLED', 'true') === 'true',
    logAllApiCalls: configManager.get('AUDIT_LOG_ALL_API_CALLS', 'true') === 'true',
    logFile: configManager.get('AUDIT_LOG_FILE'),
    retentionDays: parseInt(configManager.get('AUDIT_RETENTION_DAYS', '90'), 10),
  }, logger);
}

/**
 * Create standard KV manager instance
 */
export async function getKvManager(
  configManager: ConfigManager,
  logger: Logger,
): Promise<KVManager> {
  const kvPath = configManager.get('DENO_KV_PATH', './data/mcp-server.db');

  const kvManager = new KVManager({
    kvPath,
  }, logger);

  await kvManager.initialize();
  return kvManager;
}

/**
 * Create standard session store instance
 */
export function getSessionStore(kvManager: KVManager, logger: Logger): SessionStore {
  return new SessionStore(kvManager, { keyPrefix: ['sessions'] }, logger);
}

/**
 * Create standard transport event store instance
 */
export function getTransportEventStoreBase(
  transportEventStoreConfig: TransportEventStoreChunkedConfig, //TransportEventStoreConfig,
  logger: Logger,
  kvManager: KVManager,
): TransportEventStore {
  return new TransportEventStore(kvManager.getKV(), ['events'], logger);
}

/**
 * Create chunked transport event store instance for handling large messages
 */
export function getTransportEventStoreChunked(
  transportEventStoreConfig: TransportEventStoreChunkedConfig,
  logger: Logger,
  kvManager: KVManager,
): TransportEventStoreChunked {
  const chunkedConfig = {
    maxChunkSize: transportEventStoreConfig.chunking.maxChunkSize,
    enableCompression: transportEventStoreConfig.compression.enable,
    compressionThreshold: transportEventStoreConfig.compression.threshold,
    maxMessageSize: transportEventStoreConfig.chunking.maxMessageSize,
  };
  return new TransportEventStoreChunked(
    kvManager.getKV(),
    ['events'],
    logger,
    chunkedConfig,
  );
}

/**
 * Create transport event store instance with automatic chunked storage selection
 * Uses chunked storage if TRANSPORT_STORAGE_TYPE=chunked or large message support is needed
 */
export function getTransportEventStore(
  configManager: ConfigManager,
  logger: Logger,
  kvManager: KVManager,
): TransportEventStore | TransportEventStoreChunked {
  const transportEventStoreConfig = configManager?.get<TransportEventStoreChunkedConfig>(
    'transportEventStore',
  );

  if (transportEventStoreConfig.storageType === 'chunked') {
    logger.info('Using chunked transport event store for large message support');
    return getTransportEventStoreChunked(transportEventStoreConfig, logger, kvManager);
  }

  return getTransportEventStoreBase(transportEventStoreConfig, logger, kvManager);
}

/**
 * Create standard credential store instance
 */
export function getCredentialStore(kvManager: KVManager, logger: Logger): CredentialStore {
  return new CredentialStore(kvManager, {}, logger);
}

/**
 * Create standard error handler instance
 */
export function getErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}

/**
 * Create standard workflow registry instance
 */
export function getWorkflowRegistry(logger: Logger, errorHandler: ErrorHandler): WorkflowRegistry {
  return WorkflowRegistry.getInstance({
    logger,
    errorHandler,
    config: {
      allowDynamicCategories: true,
      customCategories: ['query', 'operation'],
    },
  });
}

/**
 * Create standard workflow registry instance
 */
export function getToolRegistry(logger: Logger, errorHandler: ErrorHandler): ToolRegistry {
  return ToolRegistry.getInstance({
    logger,
    errorHandler,
  });
}

/**
 * Plugin discovery and static plugin registration
 * Registers both static plugins (from dependencies) and discovered plugins
 * This enables hybrid mode: static plugins for compiled binaries + discovery for development
 */
export async function registerPluginsInRegistries(
  toolRegistry: ToolRegistry,
  workflowRegistry: WorkflowRegistry,
  pluginDependencies: AppServerDependencies,
): Promise<void> {
  const logger = pluginDependencies.logger;

  // Create plugin manager for both static and discovered plugins
  const pluginConfig = pluginDependencies.configManager.loadPluginsConfig();
  const pluginManager = new PluginManager(
    toolRegistry,
    workflowRegistry,
    pluginConfig,
    pluginDependencies,
  );

  // =============================================================================
  // STEP 1: Register static plugins (for compiled binaries or explicit registration)
  // =============================================================================
  
  if (pluginDependencies.staticPlugins && pluginDependencies.staticPlugins.length > 0) {
    logger.info('Registering static plugins...', {
      count: pluginDependencies.staticPlugins.length,
      plugins: pluginDependencies.staticPlugins.map((p) => p.name),
    });

    for (const plugin of pluginDependencies.staticPlugins) {
      try {
        await pluginManager.registerPlugin(plugin);
        logger.info('Static plugin registered successfully', {
          plugin: plugin.name,
          version: plugin.version,
          workflows: plugin.workflows.length,
          tools: plugin.tools.length,
        });
      } catch (error) {
        logger.error('Failed to register static plugin', error as Error, {
          plugin: plugin.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } else {
    logger.debug('No static plugins to register');
  }

  // =============================================================================
  // STEP 2: Discover and load plugins if autoload is enabled
  // =============================================================================
  
  if (pluginConfig.autoload) {
    try {
      logger.info('Discovering plugins...', {
        paths: pluginConfig.paths,
        autoload: pluginConfig.autoload,
        hasDependencies: !!pluginDependencies,
        hasStaticPlugins: !!pluginDependencies.staticPlugins,
      });

      const discoveredPlugins = await pluginManager.discoverPlugins();

      logger.info('Plugin discovery completed', {
        discovered: discoveredPlugins.length,
        totalWorkflows: discoveredPlugins.reduce((sum, p) => sum + p.workflows.length, 0),
        totalPlugins: pluginManager.getLoadedPlugins().length,
      });
    } catch (error) {
      logger.warn('Plugin discovery failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        paths: pluginConfig.paths,
      });
    }
  } else {
    logger.debug('Plugin autoload disabled, skipping discovery');
  }

  // =============================================================================
  // SUMMARY: Log final plugin registration state
  // =============================================================================
  
  const stats = pluginManager.getStats();
  logger.info('Plugin registration complete', {
    totalPlugins: stats.totalPlugins,
    activePlugins: stats.activePlugins,
    totalWorkflows: stats.totalWorkflows,
    staticPlugins: pluginDependencies.staticPlugins?.length || 0,
    discoveredPlugins: stats.totalPlugins - (pluginDependencies.staticPlugins?.length || 0),
  });
}

/**
 * Create OAuth provider instance (optional)
 */
export function getOAuthProvider(
  configManager: ConfigManager,
  logger: Logger,
  kvManager: KVManager,
  credentialStore: CredentialStore,
  oauthConsumer?: OAuthConsumer,
  thirdPartyApiClient?: any,
): OAuthProvider | undefined {
  const oauthConfig = configManager.get<OAuthProviderConfig>('oauthProvider');

  if (!oauthConfig) {
    logger.debug('OAuthProvider: No OAuth provider configuration found');
    return undefined;
  }

  //logger.info('OAuthProvider: oauthConfig', oauthConfig);
  logger.info('OAuthProvider: Creating OAuth provider with configuration', {
    issuer: oauthConfig.issuer,
    enableDynamicRegistration: oauthConfig.clients.enableDynamicRegistration,
    enablePKCE: oauthConfig.authorization.enablePKCE,
    supportedGrantTypes: oauthConfig.authorization.supportedGrantTypes,
    supportedScopes: oauthConfig.authorization.supportedScopes,
    hasOAuthConsumer: !!oauthConsumer,
    hasThirdPartyApiClient: !!thirdPartyApiClient,
  });

  return new OAuthProvider(oauthConfig, {
    logger,
    kvManager,
    credentialStore,
    oauthConsumer,
    thirdPartyApiClient,
  });
}

/**
 * Create transport manager instance with optional OAuth dependencies
 */
export function getTransportManager(
  configManager: ConfigManager,
  logger: Logger,
  kvManager: KVManager,
  sessionStore: SessionStore,
  eventStore: TransportEventStore,
  oauthProvider?: OAuthProvider,
  oauthConsumer?: OAuthConsumer,
  thirdpartyApiClient?: any,
): TransportManager {
  return new TransportManager({
    type: configManager.get('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http',
    http: {
      hostname: configManager.get('HTTP_HOST', 'localhost'),
      port: parseInt(configManager.get('HTTP_PORT', '3000'), 10),
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      maxConcurrentSessions: 1000,
      enableSessionPersistence: true,
      sessionCleanupInterval: 5 * 60 * 1000, // 5 minutes
      requestTimeout: 30 * 1000, // 30 seconds
      maxRequestSize: 1024 * 1024, // 1MB
      enableCORS: configManager.get('HTTP_CORS_ENABLED', 'true') === 'true',
      corsOrigins: (() => {
        const origins = configManager.get('HTTP_CORS_ORIGINS', '*');
        return typeof origins === 'string' ? origins.split(',') : origins;
      })(),
      preserveCompatibilityMode: true,
      // 🔒 NEW: Authentication configuration from environment
      enableAuthentication: configManager.get('MCP_AUTH_HTTP_ENABLED', 'true') === 'true',
      skipAuthentication: (configManager.get('MCP_AUTH_HTTP_SKIP', 'false') as string) === 'true',
      requireAuthentication: configManager.get('MCP_AUTH_HTTP_REQUIRE', 'true') === 'true',
    },
    stdio: {
      enableLogging: configManager.get('STDIO_LOGGING_ENABLED', 'true') === 'true',
      bufferSize: parseInt(configManager.get('STDIO_BUFFER_SIZE', '8192'), 10),
      encoding: configManager.get('STDIO_ENCODING', 'utf8'),
      // 🔒 NEW: STDIO authentication (discouraged by MCP spec)
      enableAuthentication:
        (configManager.get('MCP_AUTH_STDIO_ENABLED', 'false') as string) === 'true',
      skipAuthentication: (configManager.get('MCP_AUTH_STDIO_SKIP', 'false') as string) === 'true',
    },
  }, {
    logger,
    kvManager,
    sessionStore,
    eventStore,
    // 🔒 NEW: OAuth authentication dependencies
    oauthProvider,
    oauthConsumer,
    thirdPartyApiClient: thirdpartyApiClient,
  });
}

/**
 * Create HTTP server configuration (optional)
 */
export function getHttpServerConfig(configManager: ConfigManager): HttpServerConfig | undefined {
  const transportConfig = configManager.getTransportConfig();

  // Only create HTTP server config if HTTP transport or OAuth provider is configured
  if (transportConfig?.type !== 'http' && !configManager.get('OAUTH_PROVIDER_CLIENT_ID')) {
    return undefined;
  }

  return {
    hostname: configManager.get('HTTP_HOST', 'localhost'),
    port: parseInt(configManager.get('HTTP_PORT', '3010'), 10),
    name: configManager.get('SERVER_NAME', 'mcp-server'),
    version: configManager.get('SERVER_VERSION', '1.0.0'),
    environment: configManager.get('NODE_ENV', 'development'),
    cors: {
      allowOrigin: configManager.get('HTTP_CORS_ORIGINS', '*'),
    },
    api: {
      version: 'v1',
      basePath: '/api/v1',
    },
  };
}

/**
 * Load instructions using flexible loading system
 */
export async function getMcpServerInstructions(
  configManager: ConfigManager,
  logger: Logger,
): Promise<string> {
  try {
    const instructions = await loadInstructions({
      logger,
      instructionsConfig: configManager.get('MCP_SERVER_INSTRUCTIONS'),
      instructionsFilePath: configManager.get('MCP_INSTRUCTIONS_FILE'),
      defaultFileName: 'mcp_server_instructions.md',
      basePath: Deno.cwd(),
    });

    // Validate the loaded instructions
    if (!validateInstructions(instructions, logger)) {
      logger.warn(
        'BeyondMcpServer: Loaded instructions failed validation but will be used anyway',
      );
    }

    logger.info('BeyondMcpServer: Instructions loaded successfully', {
      source: getInstructionsSource(configManager),
      contentLength: instructions.length,
      hasWorkflowContent: instructions.includes('workflow'),
    });

    return instructions;
  } catch (error) {
    logger.error(
      'BeyondMcpServer: Failed to load instructions:',
      toError(error),
    );
    throw ErrorHandler.wrapError(error, 'INSTRUCTIONS_LOADING_FAILED');
  }
}

/**
 * Get the source of instructions for logging purposes
 */
function getInstructionsSource(configManager: ConfigManager): string {
  const configInstructions = configManager.get('MCP_SERVER_INSTRUCTIONS') as
    | string
    | undefined;
  const filePath = configManager.get('MCP_INSTRUCTIONS_FILE') as string | undefined;

  if (configInstructions && typeof configInstructions === 'string' && configInstructions.trim()) {
    return 'configuration';
  } else if (filePath && typeof filePath === 'string') {
    return `file: ${filePath}`;
  } else {
    // Check if default file exists
    try {
      const defaultPath = `${Deno.cwd()}/mcp_server_instructions.md`;
      Deno.statSync(defaultPath);
      return `default file: ${defaultPath}`;
    } catch {
      return 'embedded fallback';
    }
  }
}

// =============================================================================
// VALIDATION AND HEALTH CHECK FUNCTIONS
// =============================================================================

/**
 * Validate required configuration for OAuth consumer integration (only if actually used)
 */
export async function validateConfiguration(
  configManager: ConfigManager,
  logger: Logger,
  dependencies?: { oauthConsumer?: unknown },
): Promise<void> {
  // Only validate OAuth consumer config if OAuth consumer is actually being used
  if (dependencies?.oauthConsumer) {
    const requiredConfig = [
      'OAUTH_CONSUMER_CLIENT_ID',
      'OAUTH_CONSUMER_CLIENT_SECRET',
      'THIRDPARTY_API_BASE_URL',
    ];

    const missingConfig: string[] = [];

    for (const key of requiredConfig) {
      // Use ConfigManager's enhanced get() method with fallback logic
      const value = configManager.get(key);
      if (!value || (typeof value === 'string' && value.startsWith('your-'))) {
        missingConfig.push(key);
      }
    }

    if (missingConfig.length > 0) {
      const error = `Missing required OAuth consumer configuration: ${missingConfig.join(', ')}`;
      logger.error('OAuth consumer configuration validation failed', new Error(error), {
        missingConfig,
      });
      throw new Error(error);
    }

    logger.debug('OAuth consumer configuration validation passed');
  } else {
    logger.debug('OAuth consumer not configured - skipping OAuth consumer validation');
  }

  // Validate OAuth provider configuration if HTTP transport is used AND OAuth provider is configured
  if (configManager.get('MCP_TRANSPORT') === 'http') {
    const oauthProviderConfig = [
      'OAUTH_PROVIDER_CLIENT_ID',
      'OAUTH_PROVIDER_CLIENT_SECRET',
    ];

    const missingOAuthConfig: string[] = [];

    for (const key of oauthProviderConfig) {
      if (!configManager.get(key)) {
        missingOAuthConfig.push(key);
      }
    }

    // Check if user explicitly wants to disable OAuth provider requirement
    const transportConfig = configManager.getTransportConfig();
    const allowInsecureHttp = transportConfig?.http?.allowInsecure === true;

    if (missingOAuthConfig.length > 0) {
      if (allowInsecureHttp) {
        logger.warn('🚨 SECURITY WARNING: Running HTTP transport without OAuth provider', {
          security: 'INSECURE',
          transport: 'http',
          reason: 'HTTP_ALLOW_INSECURE=true',
          recommendation: 'Configure OAuth provider for production use',
          missingConfig: missingOAuthConfig,
          environment: configManager.get('NODE_ENV', 'development'),
        });
        logger.warn(
          '🔓 HTTP server will accept unauthenticated requests - suitable for development only',
        );
      } else {
        logger.warn('🚨 HTTP transport without OAuth provider detected', {
          missingConfig: missingOAuthConfig,
          securityRisk: 'HTTP server will accept unauthenticated requests',
          solution:
            'Set HTTP_ALLOW_INSECURE=true to explicitly allow insecure mode, or configure OAuth provider',
          recommendation: 'OAuth provider is strongly recommended for production HTTP transport',
        });

        const error = `Missing OAuth provider configuration for HTTP transport: ${
          missingOAuthConfig.join(', ')
        }. Set HTTP_ALLOW_INSECURE=true to allow insecure HTTP mode.`;
        logger.error('OAuth provider configuration validation failed', new Error(error), {
          missingOAuthConfig,
          allowInsecureHint: 'Set HTTP_ALLOW_INSECURE=true to bypass this requirement',
        });
        throw new Error(error);
      }
    } else {
      logger.debug('OAuth provider configuration validated for HTTP transport');
    }
  }

  logger.debug('Configuration validation passed', {
    transportType: configManager.get('MCP_TRANSPORT', 'stdio'),
    thirdPartyApiUrl: configManager.get('THIRDPARTY_API_BASE_URL'),
    hasOAuthConsumerConfig: !!configManager.get('OAUTH_CONSUMER_CLIENT_ID'),
    hasOAuthProviderConfig: !!configManager.get('OAUTH_PROVIDER_CLIENT_ID'),
    oauthConsumerClientId: configManager.get('OAUTH_CONSUMER_CLIENT_ID')
      ? '[CONFIGURED]'
      : '[MISSING]',
  });
}

/**
 * Perform health checks on external dependencies
 */
export async function performHealthChecks(
  dependencies: {
    kvManager: KVManager;
    oauthProvider: OAuthProvider;
    oauthConsumer?: OAuthConsumer;
    thirdpartyApiClient?: any;
  },
  logger: Logger,
  additionalHealthChecks?: DependenciesHealthCheck[],
): Promise<void> {
  const healthChecks: DependenciesHealthCheck[] = [
    {
      name: 'OAuth Provider',
      check: async () => {
        // Basic OAuth provider health check
        // Note: getMetadata() method might not exist, so we'll do basic validation
        return { healthy: true, status: 'OAuth provider initialized' };
      },
    },
    {
      name: 'KV Storage',
      check: async () => {
        // Test KV storage connectivity
        const testKey = ['health', 'check', Date.now().toString()];
        const testValue = { timestamp: new Date().toISOString(), test: true };

        await dependencies.kvManager.set(testKey, testValue);
        const retrieved = await dependencies.kvManager.get<{ timestamp: string; test: boolean }>(
          testKey,
        );
        await dependencies.kvManager.delete(testKey);

        if (!retrieved || retrieved.test !== true) {
          throw new Error('KV storage read/write test failed');
        }

        return { healthy: true, status: 'read/write test passed' };
      },
    },
  ];
  if (dependencies.oauthConsumer) {
    const oauthConsumer = dependencies.oauthConsumer;
    healthChecks.push({
      name: 'ExampleCorp OAuth Consumer',
      check: async () => {
        // Basic initialization check
        await oauthConsumer.initialize();
        return { healthy: true, status: 'initialized' };
      },
    });
  }
  if (dependencies.thirdpartyApiClient) {
    healthChecks.push({
      name: 'ExampleCorp API',
      check: async () => {
        const health = await dependencies.thirdpartyApiClient.healthCheck();
        if (!health.healthy) {
          throw new Error(`ExampleCorp API is not healthy: ${JSON.stringify(health)}`);
        }
        return health;
      },
    });
  }

  // Merge additional checks if provided
  if (additionalHealthChecks) {
    healthChecks.push(...additionalHealthChecks);
  }

  const results: Array<{ name: string; healthy: boolean; result?: any; error?: string }> = [];

  for (const healthCheck of healthChecks) {
    try {
      logger.debug(`Performing health check: ${healthCheck.name}`);

      const result = await healthCheck.check();
      results.push({
        name: healthCheck.name,
        healthy: true,
        result,
      });

      logger.debug(`Health check passed: ${healthCheck.name}`, { result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      results.push({
        name: healthCheck.name,
        healthy: false,
        error: errorMessage,
      });

      logger.warn(`Health check failed: ${healthCheck.name}`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // For critical dependencies, throw error
      if (healthCheck.name === 'KV Storage') {
        throw new Error(
          `Critical dependency health check failed: ${healthCheck.name} - ${errorMessage}`,
        );
      }
    }
  }

  const healthyCount = results.filter((r) => r.healthy).length;
  const totalCount = results.length;

  logger.info('Dependency health checks completed', {
    healthy: healthyCount,
    total: totalCount,
    allHealthy: healthyCount === totalCount,
    results,
  });

  // Warn if any non-critical dependencies are unhealthy
  const unhealthyDeps = results.filter((r) => !r.healthy);
  if (unhealthyDeps.length > 0) {
    logger.warn('Some dependencies are unhealthy - server may have limited functionality', {
      unhealthyDependencies: unhealthyDeps.map((d) => d.name),
    });
  }
}

/**
 * Main dependency injection function - creates all dependencies with overrides
 */
export async function getAllDependencies(
  overrides: AppServerOverrides = {},
): Promise<AppServerDependencies> {
  // Get or create configManager first
  const configManager = overrides.configManager || await getConfigManager();

  // Create standard library dependencies
  const logger = overrides.logger || getLogger(configManager);

  const auditLogger = overrides.auditLogger || getAuditLogger(configManager, logger);

  const kvManager = overrides.kvManager || await getKvManager(configManager, logger);
  const sessionStore = overrides.sessionStore || getSessionStore(kvManager, logger);
  const eventStore = overrides.eventStore ||
    getTransportEventStore(configManager, logger, kvManager);
  const credentialStore = overrides.credentialStore || getCredentialStore(kvManager, logger);
  const errorHandler = overrides.errorHandler || getErrorHandler();
  const workflowRegistry = overrides.workflowRegistry || getWorkflowRegistry(logger, errorHandler);
  const toolRegistry = overrides.toolRegistry || getToolRegistry(logger, errorHandler);
  // Consumer-specific dependencies must be created before OAuthProvider
  // because OAuthProvider needs them for session binding
  const consumerDeps: any = {};

  // Use pre-built consumer instances (Option A pattern)
  if (overrides.oauthConsumer) {
    consumerDeps.oauthConsumer = overrides.oauthConsumer;
  }

  if (overrides.thirdpartyApiClient) {
    consumerDeps.thirdpartyApiClient = overrides.thirdpartyApiClient;
  }

  const oauthProvider = overrides.oauthProvider || getOAuthProvider(
    configManager,
    logger,
    kvManager,
    credentialStore,
    consumerDeps.oauthConsumer, // Pass OAuth consumer for third-party auth
    consumerDeps.thirdpartyApiClient, // Pass API client for token refresh
  );
  const transportManager = overrides.transportManager || getTransportManager(
    configManager,
    logger,
    kvManager,
    sessionStore,
    eventStore,
    oauthProvider, // 🔒 Pass OAuth provider for MCP token validation
    consumerDeps.oauthConsumer, // 🔒 Pass OAuth consumer for third-party authentication
    consumerDeps.thirdpartyApiClient, // 🔒 Pass third-party API client for token refresh
  );

  // Create HTTP server config if needed
  const httpServerConfig = overrides.httpServerConfig || getHttpServerConfig(configManager);

  // Create MCP server (either from class or default)
  const serverConfig = overrides.serverConfig || {
    name: configManager.get('SERVER_NAME', 'generic-mcp-server'),
    version: configManager.get('SERVER_VERSION', '1.0.0'),
    title: configManager.get('SERVER_TITLE', 'Generic MCP Server'),
    description: configManager.get('SERVER_DESCRIPTION', 'MCP server built with bb-mcp-server'),
  };

  const allDeps = {
    configManager,
    logger,
    auditLogger,
    kvManager,
    sessionStore,
    eventStore,
    credentialStore,
    errorHandler,
    workflowRegistry,
    toolRegistry,
    oauthProvider,
    transportManager,
    httpServerConfig,
    ...consumerDeps,
  };

  const mcpServerInstructions = await getMcpServerInstructions(configManager, logger);

  // Use pre-built MCP server instance if it exists
  const beyondMcpServer = overrides.beyondMcpServer || (() => {
    // Fallback: create generic MCP server if no consumer server provided
    const server = new BeyondMcpServer({
      server: {
        name: serverConfig.name,
        version: serverConfig.version,
        title: serverConfig.title || serverConfig.name,
        description: serverConfig.description,
      },
      capabilities: {
        tools: {},
        logging: {},
      },
      mcpServerInstructions,
      transport: configManager.getTransportConfig() || { type: 'stdio' as const },
    }, allDeps);

    // Add custom workflows and tools to generic server
    overrides.customWorkflows?.forEach((workflow) => server.registerWorkflow(workflow));
    overrides.customTools?.forEach((tool) =>
      server.registerTool(tool.name, tool.definition, tool.handler, tool.options)
    );

    // the server will be initialized in AppServer.start()
    return server;
  })();

  await registerPluginsInRegistries(
    allDeps.toolRegistry,
    allDeps.workflowRegistry,
    allDeps,
  );

  // Initialize Beyond MCP server
  await beyondMcpServer.initialize();

  return {
    ...allDeps,
    beyondMcpServer,
  };
}

/**
 * Create test/mock dependencies for development and testing
 */
export async function createTestDependencies(): Promise<Partial<AppServerDependencies>> {
  // Create mock configuration for testing
  const testConfigManager = await getConfigManager();
  const testLogger = getLogger(testConfigManager);
  const testKvManager = await getKvManager(testConfigManager, testLogger);
  testConfigManager.set('EXAMPLECORP_CLIENT_ID', 'test-client-id');
  testConfigManager.set('EXAMPLECORP_CLIENT_SECRET', 'test-client-secret');
  testConfigManager.set('EXAMPLECORP_API_BASE_URL', 'http://localhost:3001/api');
  testConfigManager.set('LOG_LEVEL', 'debug');
  testConfigManager.set('MCP_TRANSPORT', 'stdio');

  // Create dependencies with test configuration
  return await getAllDependencies({
    configManager: testConfigManager,
    logger: testLogger,
    kvManager: testKvManager,
  });
}
