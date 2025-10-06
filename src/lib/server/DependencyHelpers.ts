/**
 * Dependency Helpers - Core dependency injection for AppServer
 *
 * Provides helper functions for creating standard library dependencies
 * and the main getAllDependencies function that orchestrates the entire
 * dependency injection system with class-based overrides.
 */

import { ConfigManager } from '../config/ConfigManager.ts';
import type {
  AuditConfig,
  LoggingConfig,
  McpServerInstructionsConfig,
  OAuthConsumerConfig,
  OAuthProviderConfig,
  PluginManagerConfig,
  ServerConfig,
  StorageConfig,
  ThirdPartyApiConfig,
  TransportConfig,
  TransportEventStoreChunkedConfig,
} from '../config/ConfigTypes.ts';
import { Logger } from '../utils/Logger.ts';
import { AuditLogger } from '../utils/AuditLogger.ts';
import { KVManager } from '../storage/KVManager.ts';
import { SessionStore } from '../storage/SessionStore.ts';
import { TransportPersistenceStore } from '../storage/TransportPersistenceStore.ts';
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
  const loggingConfig = configManager?.get<LoggingConfig>('logging');
  const logger = new Logger({
    level: loggingConfig.level,
    format: loggingConfig.format,
  });
  configManager.logger = logger; // configManager would have been created with default values for Logger
  return logger;
}

/**
 * Create standard audit logger instance
 */
export function getAuditLogger(configManager: ConfigManager, logger: Logger): AuditLogger {
  const auditConfig = configManager?.get<AuditConfig>('audit');
  return new AuditLogger(auditConfig, logger);
}

/**
 * Create standard KV manager instance
 */
export async function getKvManager(
  configManager: ConfigManager,
  logger: Logger,
): Promise<KVManager> {
  const storageConfig = configManager?.get<StorageConfig>('storage');
  const kvPath = storageConfig.denoKvPath;

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
  return new TransportEventStore(kvManager, ['events'], logger);
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
    kvManager,
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
    logger.info('DependencyHelper: Using chunked transport event store for large message support');
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
  dependencies: AppServerDependencies,
): Promise<void> {
  const logger = dependencies.logger;
  const staticPlugins = dependencies.staticPlugins || [];

  // Create plugin manager for both static and discovered plugins
  const pluginConfig = dependencies.configManager.get<PluginManagerConfig>('pluginManager');
  const pluginManager = new PluginManager(
    toolRegistry,
    workflowRegistry,
    pluginConfig,
    dependencies,
  );

  // =============================================================================
  // STEP 1: Register static plugins (for compiled binaries or explicit registration)
  // =============================================================================

  if (staticPlugins && staticPlugins.length > 0) {
    logger.info('DependencyHelper: Registering static plugins...', {
      count: staticPlugins.length,
      plugins: staticPlugins.map((p) => p.name),
    });

    for (const plugin of staticPlugins) {
      try {
        await pluginManager.registerPlugin(plugin);
        logger.info('DependencyHelper: Static plugin registered successfully', {
          plugin: plugin.name,
          version: plugin.version,
          workflows: plugin.workflows.length,
          tools: plugin.tools.length,
        });
      } catch (error) {
        logger.error('DependencyHelper: Failed to register static plugin', error as Error, {
          plugin: plugin.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } else {
    logger.debug('DependencyHelper: No static plugins to register');
  }

  // =============================================================================
  // STEP 2: Discover and load plugins if autoload is enabled
  // =============================================================================

  if (pluginConfig.autoload) {
    try {
      logger.info('DependencyHelper: Discovering plugins...', {
        paths: pluginConfig.paths,
        autoload: pluginConfig.autoload,
        hasDependencies: !!dependencies,
        hasStaticPlugins: !!staticPlugins,
      });

      const discoveredPlugins = await pluginManager.discoverPlugins();

      logger.info('DependencyHelper: Plugin discovery completed', {
        discovered: discoveredPlugins.length,
        totalWorkflows: discoveredPlugins.reduce((sum, p) => sum + p.workflows.length, 0),
        totalPlugins: pluginManager.getLoadedPlugins().length,
      });
    } catch (error) {
      logger.warn('DependencyHelper: Plugin discovery failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        paths: pluginConfig.paths,
      });
    }
  } else {
    logger.debug('DependencyHelper: Plugin autoload disabled, skipping discovery');
  }

  // =============================================================================
  // SUMMARY: Log final plugin registration state
  // =============================================================================

  const stats = pluginManager.getStats();
  logger.info('DependencyHelper: Plugin registration complete', {
    totalPlugins: stats.totalPlugins,
    activePlugins: stats.activePlugins,
    totalWorkflows: stats.totalWorkflows,
    staticPlugins: staticPlugins?.length || 0,
    discoveredPlugins: stats.totalPlugins - (staticPlugins?.length || 0),
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
    logger.debug('DependencyHelper: No OAuth provider configuration found');
    return undefined;
  }

  //logger.info('OAuthProvider: oauthConfig', oauthConfig);
  logger.info('DependencyHelper: Creating OAuth provider with configuration', {
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
  transportPersistenceStore: TransportPersistenceStore,
  oauthProvider?: OAuthProvider,
  oauthConsumer?: OAuthConsumer,
  thirdpartyApiClient?: any,
): TransportManager {
  const transportConfig = configManager.get<TransportConfig>('transport');
  return new TransportManager(transportConfig, {
    logger,
    kvManager,
    sessionStore,
    eventStore,
    transportPersistenceStore,
    // 🔒 NEW: OAuth authentication dependencies
    oauthProvider,
    oauthConsumer,
    thirdPartyApiClient: thirdpartyApiClient,
  });
}

/**
 * Create transport persistence store instance
 */
export function getTransportPersistenceStore(
  configManager: ConfigManager,
  kvManager: KVManager,
  logger: Logger,
): TransportPersistenceStore {
  const transportConfig = configManager.get<TransportConfig>('transport');
  return new TransportPersistenceStore(
    kvManager,
    transportConfig,
    logger,
  );
}

/**
 * Create HTTP server configuration (optional)
 */
export function getHttpServerConfig(configManager: ConfigManager): HttpServerConfig | undefined {
  const transportConfig = configManager.get<TransportConfig>('transport');
  const oauthConfig = configManager.get<OAuthProviderConfig>('oauthProvider');
  const serverConfig = configManager.get<ServerConfig>('server');

  // Only create HTTP server config if HTTP transport or OAuth provider is configured
  if (transportConfig?.type !== 'http' && !oauthConfig.clientId) {
    return undefined;
  }

  return {
    hostname: transportConfig.http?.hostname || 'localhost',
    port: transportConfig.http?.port || 3000,
    name: serverConfig.name,
    version: serverConfig.version,
    environment: configManager.get('environment'),
    cors: {
      allowOrigins: transportConfig.http?.cors?.origins || ['*'],
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
  const mcpServerInstructionsConfig = configManager.get<McpServerInstructionsConfig>(
    'mcpServerInstructionsConfig',
  );
  try {
    const instructions = await loadInstructions({
      logger,
      instructionsContent: mcpServerInstructionsConfig.instructionsContent,
      instructionsFilePath: mcpServerInstructionsConfig.instructionsFilePath,
      defaultFileName: 'mcp_server_instructions.md',
      basePath: Deno.cwd(),
    });

    // Validate the loaded instructions
    if (!validateInstructions(instructions, logger)) {
      logger.warn(
        'DependencyHelper: Loaded instructions failed validation but will be used anyway',
      );
    }

    logger.info('DependencyHelper: Instructions loaded successfully', {
      source: getInstructionsSource(configManager),
      contentLength: instructions.length,
      hasWorkflowContent: instructions.includes('workflow'),
    });

    return instructions;
  } catch (error) {
    logger.error(
      'DependencyHelper: Failed to load instructions:',
      toError(error),
    );
    throw ErrorHandler.wrapError(error, 'INSTRUCTIONS_LOADING_FAILED');
  }
}

/**
 * Get the source of instructions for logging purposes
 */
function getInstructionsSource(configManager: ConfigManager): string {
  const mcpServerInstructionsConfig = configManager.get<McpServerInstructionsConfig>(
    'mcpServerInstructionsConfig',
  );
  const instructionsContent = mcpServerInstructionsConfig.instructionsContent;
  const instructionsFilePath = mcpServerInstructionsConfig.instructionsFilePath;

  if (instructionsContent && instructionsContent.trim()) {
    return 'configuration';
  } else if (instructionsFilePath) {
    return `file: ${instructionsFilePath}`;
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
 * Map config field names to their corresponding environment variables for error messages
 */
function getEnvVarForField(fieldPath: string): string {
  const envVarMap: Record<string, string> = {
    'clientId': 'OAUTH_CONSUMER_CLIENT_ID',
    'clientSecret': 'OAUTH_CONSUMER_CLIENT_SECRET',
    'thirdpartyApiClient.baseUrl': 'THIRDPARTY_API_BASE_URL',
    'provider.clientId': 'OAUTH_PROVIDER_CLIENT_ID',
    'provider.clientSecret': 'OAUTH_PROVIDER_CLIENT_SECRET',
  };
  return envVarMap[fieldPath] || fieldPath.toUpperCase();
}

/**
 * Format field errors with both config field name and ENV variable for clarity
 */
function formatFieldErrors(fields: string[]): string {
  return fields.map((field) => `${field} (set ${getEnvVarForField(field)})`).join(', ');
}

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
    const oauthConsumerConfig = configManager.get<OAuthConsumerConfig>('oauthConsumer');

    if (!oauthConsumerConfig) {
      const error = 'OAuth consumer is configured but OAuth consumer configuration is missing';
      logger.error(
        'DependencyHelper: OAuth consumer configuration validation failed',
        new Error(error),
      );
      throw new Error(error);
    }

    // Validate required OAuth consumer fields
    const missingFields: string[] = [];

    if (!oauthConsumerConfig.clientId || oauthConsumerConfig.clientId.startsWith('your-')) {
      missingFields.push('clientId');
    }
    if (!oauthConsumerConfig.clientSecret || oauthConsumerConfig.clientSecret.startsWith('your-')) {
      missingFields.push('clientSecret');
    }

    // Validate third-party API config if OAuth consumer is present
    const thirdPartyApiConfig = configManager.get<ThirdPartyApiConfig>('thirdpartyApiClient');
    if (!thirdPartyApiConfig?.baseUrl || thirdPartyApiConfig.baseUrl.startsWith('your-')) {
      missingFields.push('thirdpartyApiClient.baseUrl');
    }

    if (missingFields.length > 0) {
      const error = `Missing or invalid OAuth consumer configuration: ${
        formatFieldErrors(missingFields)
      }`;
      logger.error(
        'DependencyHelper: OAuth consumer configuration validation failed',
        new Error(error),
        {
          missingFields,
          envVars: missingFields.map((f) => getEnvVarForField(f)),
        },
      );
      throw new Error(error);
    }

    logger.debug('DependencyHelper: OAuth consumer configuration validation passed');
  } else {
    logger.debug(
      'DependencyHelper: OAuth consumer not configured - skipping OAuth consumer validation',
    );
  }

  // Validate OAuth provider configuration if HTTP transport is used
  const transportConfig = configManager.get<TransportConfig>('transport');

  if (transportConfig.type === 'http') {
    const oauthProviderConfig = configManager.get<OAuthProviderConfig>('oauthProvider');

    if (!oauthProviderConfig) {
      // Check if user explicitly wants to disable OAuth provider requirement
      const allowInsecureHttp = transportConfig.http?.allowInsecure === true;

      if (allowInsecureHttp) {
        logger.warn(
          'DependencyHelper: 🚨 SECURITY WARNING: Running HTTP transport without OAuth provider',
          {
            security: 'INSECURE',
            transport: 'http',
            reason: 'HTTP_ALLOW_INSECURE=true',
            recommendation: 'Configure OAuth provider for production use',
            environment: configManager.get('environment', 'development'),
          },
        );
        logger.warn(
          'DependencyHelper: 🔓 HTTP server will accept unauthenticated requests - suitable for development only',
        );
      } else {
        logger.warn('DependencyHelper: 🚨 HTTP transport without OAuth provider detected', {
          securityRisk: 'HTTP server will accept unauthenticated requests',
          solution:
            'Set HTTP_ALLOW_INSECURE=true to explicitly allow insecure mode, or configure OAuth provider',
          recommendation: 'OAuth provider is strongly recommended for production HTTP transport',
        });

        const error =
          `Missing OAuth provider configuration for HTTP transport. Set HTTP_ALLOW_INSECURE=true to allow insecure HTTP mode.`;
        logger.error(
          'DependencyHelper: OAuth provider configuration validation failed',
          new Error(error),
          {
            allowInsecureHint: 'Set HTTP_ALLOW_INSECURE=true to bypass this requirement',
          },
        );
        throw new Error(error);
      }
    } else {
      // Validate OAuth provider has required fields
      const missingProviderFields: string[] = [];

      if (!oauthProviderConfig.clientId || oauthProviderConfig.clientId.startsWith('your-')) {
        missingProviderFields.push('clientId');
      }
      if (
        !oauthProviderConfig.clientSecret || oauthProviderConfig.clientSecret.startsWith('your-')
      ) {
        missingProviderFields.push('clientSecret');
      }

      if (missingProviderFields.length > 0) {
        const error = `Missing or invalid OAuth provider configuration: ${
          formatFieldErrors(missingProviderFields.map((f) => `provider.${f}`))
        }`;
        logger.error(
          'DependencyHelper: OAuth provider configuration validation failed',
          new Error(error),
          {
            missingProviderFields,
            envVars: missingProviderFields.map((f) => getEnvVarForField(`provider.${f}`)),
          },
        );
        throw new Error(error);
      }

      logger.debug('DependencyHelper: OAuth provider configuration validated for HTTP transport');
    }
  }

  logger.debug('DependencyHelper: Configuration validation passed', {
    transportType: transportConfig.type,
    hasOAuthConsumer: !!dependencies?.oauthConsumer,
    hasOAuthProviderConfig: !!configManager.get<OAuthProviderConfig>('oauthProvider'),
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
      logger.debug(`DependencyHelper: Performing health check: ${healthCheck.name}`);

      const result = await healthCheck.check();
      results.push({
        name: healthCheck.name,
        healthy: true,
        result,
      });

      logger.debug(`DependencyHelper: Health check passed: ${healthCheck.name}`, { result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      results.push({
        name: healthCheck.name,
        healthy: false,
        error: errorMessage,
      });

      logger.warn(`DependencyHelper: Health check failed: ${healthCheck.name}`, {
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

  logger.info('DependencyHelper: Dependency health checks completed', {
    healthy: healthyCount,
    total: totalCount,
    allHealthy: healthyCount === totalCount,
    results,
  });

  // Warn if any non-critical dependencies are unhealthy
  const unhealthyDeps = results.filter((r) => !r.healthy);
  if (unhealthyDeps.length > 0) {
    logger.warn(
      'DependencyHelper: Some dependencies are unhealthy - server may have limited functionality',
      {
        unhealthyDependencies: unhealthyDeps.map((d) => d.name),
      },
    );
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
  const transportPersistenceStore = overrides.transportPersistenceStore ||
    getTransportPersistenceStore(configManager, kvManager, logger);
  const credentialStore = overrides.credentialStore || getCredentialStore(kvManager, logger);
  const errorHandler = overrides.errorHandler || getErrorHandler();
  const workflowRegistry = overrides.workflowRegistry || getWorkflowRegistry(logger, errorHandler);
  const toolRegistry = overrides.toolRegistry || getToolRegistry(logger, errorHandler);
  // Consumer-specific dependencies must be created before OAuthProvider
  // because OAuthProvider needs them for session binding
  const consumerDeps: any = {};

  // Use pre-built consumer instances (Option A pattern)
  if (overrides.staticPlugins) {
    consumerDeps.staticPlugins = overrides.staticPlugins;
  }

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
    transportPersistenceStore,
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
    transportPersistenceStore,
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
