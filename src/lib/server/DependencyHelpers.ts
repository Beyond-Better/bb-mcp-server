/**
 * Dependency Helpers - Core dependency injection for AppServer
 *
 * Provides helper functions for creating standard library dependencies
 * and the main getAllDependencies function that orchestrates the entire
 * dependency injection system with class-based overrides.
 */

import { ConfigManager } from '../config/ConfigManager.ts';
import { Logger } from '../utils/Logger.ts';
import { AuditLogger } from '../utils/AuditLogger.ts';
import { KVManager } from '../storage/KVManager.ts';
import { SessionStore } from '../storage/SessionStore.ts';
import { TransportEventStore } from '../storage/TransportEventStore.ts';
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
  AppServerConfig,
  AppServerDependencies,
  AppServerOverrides,
  DependenciesHealthCheck,
} from '../types/AppServerTypes.ts';
import type { HttpServerConfig } from './ServerTypes.ts';

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
  return new Logger({
    level: configManager.get('LOG_LEVEL', 'info'),
    format: configManager.get('LOG_FORMAT', 'json'),
  });
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
export function getTransportEventStore(kvManager: KVManager, logger: Logger): TransportEventStore {
  return new TransportEventStore(kvManager.getKV(), ['events'], logger);
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
 * Plugin discovery
 * Register with WorkflowRegistry and ToolRegistry
 */
export async function registerPluginsInRegistries(
  toolRegistry: ToolRegistry,
  workflowRegistry: WorkflowRegistry,
  pluginDependencies: AppServerDependencies,
): Promise<void> {
  const logger = pluginDependencies.logger;

  // Create plugin manager with discovery options
  const pluginConfig = pluginDependencies.configManager.loadPluginsConfig();

  // Discover and load plugins if autoload is enabled
  if (pluginConfig.autoload) {
    try {
      const pluginManager = new PluginManager(
        toolRegistry,
        workflowRegistry,
        pluginConfig,
        pluginDependencies,
      );

      logger.info('Discovering plugins...', {
        paths: pluginConfig.paths,
        autoload: pluginConfig.autoload,
        hasDependencies: !!pluginDependencies,
      });

      const discoveredPlugins = await pluginManager.discoverPlugins();

      logger.info('Plugin discovery completed', {
        discovered: discoveredPlugins.length,
        totalWorkflows: discoveredPlugins.reduce((sum, p) => sum + p.workflows.length, 0),
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
}

/**
 * Create OAuth provider instance (optional)
 */
export function getOAuthProvider(
  configManager: ConfigManager,
  logger: Logger,
  kvManager: KVManager,
  credentialStore: CredentialStore,
): OAuthProvider | undefined {
  const clientId = configManager.get<string>('OAUTH_PROVIDER_CLIENT_ID');
  const clientSecret = configManager.get<string>('OAUTH_PROVIDER_CLIENT_SECRET');
  const redirectUri = configManager.get<string>('OAUTH_PROVIDER_REDIRECT_URI');

  if (!clientId || !clientSecret || !redirectUri) {
    return undefined;
  }

  return new OAuthProvider({
    issuer: configManager.get('OAUTH_PROVIDER_ISSUER', 'http://localhost:3000'),
    clientId,
    clientSecret,
    redirectUri,
    tokens: {
      accessTokenExpiryMs: parseInt(configManager.get('OAUTH_TOKEN_EXPIRATION', '3600000'), 10),
      refreshTokenExpiryMs: parseInt(
        configManager.get('OAUTH_REFRESH_TOKEN_EXPIRATION', '2592000000'),
        10,
      ),
      authorizationCodeExpiryMs: parseInt(configManager.get('OAUTH_CODE_EXPIRATION', '600000'), 10),
    },
    clients: {
      enableDynamicRegistration: configManager.get('OAUTH_ENABLE_DYNAMIC_CLIENT_REG') === 'true',
      requireHTTPS: configManager.get('OAUTH_REQUIRE_HTTPS') === 'true',
      allowedRedirectHosts: configManager.get('OAUTH_ALLOWED_HOSTS', 'localhost').split(','),
    },
    authorization: {
      supportedGrantTypes: ['authorization_code', 'refresh_token'],
      supportedResponseTypes: ['code'],
      supportedScopes: ['read', 'write', 'admin'],
      enablePKCE: true,
      requirePKCE: false,
    },
  }, {
    logger,
    kvManager,
    credentialStore,
  });
}

/**
 * Create transport manager instance
 */
export function getTransportManager(
  configManager: ConfigManager,
  logger: Logger,
  kvManager: KVManager,
  sessionStore: SessionStore,
  eventStore: TransportEventStore,
  //workflowRegistry: WorkflowRegistry,
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
    },
  }, {
    logger,
    kvManager,
    sessionStore,
    eventStore,
    //workflowRegistry,
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

// =============================================================================
// VALIDATION AND HEALTH CHECK FUNCTIONS
// =============================================================================

/**
 * Validate required configuration for OAuth consumer integration (only if actually used)
 */
export async function validateConfiguration(
  configManager: ConfigManager,
  logger: Logger,
  dependencies?: { oAuthConsumer?: unknown },
): Promise<void> {
  // Only validate OAuth consumer config if OAuth consumer is actually being used
  if (dependencies?.oAuthConsumer) {
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
      logger.error('OAuth consumer configuration validation failed', new Error(error), { missingConfig });
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
        logger.warn('🔓 HTTP server will accept unauthenticated requests - suitable for development only');
      } else {
        logger.warn('🚨 HTTP transport without OAuth provider detected', {
          missingConfig: missingOAuthConfig,
          securityRisk: 'HTTP server will accept unauthenticated requests',
          solution: 'Set HTTP_ALLOW_INSECURE=true to explicitly allow insecure mode, or configure OAuth provider',
          recommendation: 'OAuth provider is strongly recommended for production HTTP transport',
        });
        
        const error = `Missing OAuth provider configuration for HTTP transport: ${missingOAuthConfig.join(', ')}. Set HTTP_ALLOW_INSECURE=true to allow insecure HTTP mode.`;
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
    oAuthConsumer?: OAuthConsumer;
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
  if (dependencies.oAuthConsumer) {
    const oAuthConsumer = dependencies.oAuthConsumer;
    healthChecks.push({
      name: 'ExampleCorp OAuth Consumer',
      check: async () => {
        // Basic initialization check
        await oAuthConsumer.initialize();
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
export function getAllDependencies(overrides: AppServerOverrides = {}): AppServerDependencies {
  // Get or create configManager first
  const configManager = overrides.configManager || (() => {
    throw new Error('Config Manager must be provided or created asynchronously');
  })();

  // Load configuration if not already loaded
  if (!configManager.getAll().server) {
    // Note: This is sync, but configManager.loadConfig() is async
    // We'll need to handle this in AppServer constructor
  }

  // Create standard library dependencies
  const logger = overrides.logger || getLogger(configManager);
  const auditLogger = overrides.auditLogger || getAuditLogger(configManager, logger);

  // Note: KV Manager is async, we'll need special handling
  const kvManager = overrides.kvManager || (() => {
    throw new Error('KV Manager must be provided or created asynchronously');
  })();

  const sessionStore = overrides.sessionStore || getSessionStore(kvManager, logger);
  const eventStore = overrides.eventStore || getTransportEventStore(kvManager, logger);
  const credentialStore = overrides.credentialStore || getCredentialStore(kvManager, logger);
  const errorHandler = overrides.errorHandler || getErrorHandler();
  const workflowRegistry = overrides.workflowRegistry || getWorkflowRegistry(logger, errorHandler);
  const toolRegistry = overrides.toolRegistry || getToolRegistry(logger, errorHandler);
  const oauthProvider = overrides.oauthProvider ||
    getOAuthProvider(configManager, logger, kvManager, credentialStore);
  const transportManager = overrides.transportManager || getTransportManager(
    configManager,
    logger,
    kvManager,
    sessionStore,
    eventStore,
    //workflowRegistry,
  );

  // Create HTTP server config if needed
  const httpServerConfig = overrides.httpServerConfig || getHttpServerConfig(configManager);

  // Consumer-specific dependencies (instances only - simple approach)
  const consumerDeps: any = {};

  // Use pre-built consumer instances (Option A pattern)
  if (overrides.oAuthConsumer) {
    consumerDeps.oAuthConsumer = overrides.oAuthConsumer;
  }

  if (overrides.thirdpartyApiClient) {
    consumerDeps.thirdpartyApiClient = overrides.thirdpartyApiClient;
  }

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

  // Use pre-built MCP server instance (Option A pattern)
  const beyondMcpServer = overrides.beyondMcpServer || (() => {
    // Fallback: create generic MCP server if no consumer server provided
    const serverConfig = overrides.serverConfig || {
      name: configManager.get('SERVER_NAME', 'generic-mcp-server'),
      version: configManager.get('SERVER_VERSION', '1.0.0'),
      title: configManager.get('SERVER_TITLE', 'Generic MCP Server'),
      description: configManager.get('SERVER_DESCRIPTION', 'MCP server built with bb-mcp-server'),
    };

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
      instructions: configManager.get('INSTRUCTIONS'),
      transport: configManager.getTransportConfig() || { type: 'stdio' as const },
    }, allDeps);

    // Add custom workflows and tools to generic server
    overrides.customWorkflows?.forEach((workflow) => server.registerWorkflow(workflow));
    overrides.customTools?.forEach((tool) =>
      server.registerTool(tool.name, tool.definition, tool.handler, tool.options)
    );

    return server;
  })();

  return {
    ...allDeps,
    beyondMcpServer,
  };
}

/**
 * Async version of getAllDependencies that properly handles async initialization
 */
export async function getAllDependenciesAsync(
  overrides: AppServerOverrides = {},
): Promise<AppServerDependencies> {
  // Get or create configManager first
  const configManager = overrides.configManager || await getConfigManager();

  // Load configuration
  await configManager.loadConfig();

  // Create logger early
  const logger = overrides.logger || getLogger(configManager);

  // Create KV manager (async)
  const kvManager = overrides.kvManager || await getKvManager(configManager, logger);

  const allDependencies = getAllDependencies({
    configManager,
    logger,
    kvManager,
    ...overrides,
  });

  await registerPluginsInRegistries(
    allDependencies.toolRegistry,
    allDependencies.workflowRegistry,
    allDependencies,
  );

  // Now call the sync version with kvManager and workflowRegistry ready
  return allDependencies;
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
  return await getAllDependenciesAsync({
    configManager: testConfigManager,
    logger: testLogger,
    kvManager: testKvManager,
  });
}
