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
import { OAuthProvider } from '../auth/OAuthProvider.ts';
import { TransportManager } from '../transport/TransportManager.ts';
import { BeyondMcpServer } from './BeyondMcpServer.ts';
import { toError } from '../utils/Error.ts';
import type { 
  AppServerDependencies, 
  AppServerConfig,
  AppServerOverrides 
} from '../types/AppServerTypes.ts';
import type { HttpServerConfig } from './ServerTypes.ts';

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
export async function getKvManager(configManager: ConfigManager, logger: Logger): Promise<KVManager> {
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
export function getWorkflowRegistry(logger: Logger): WorkflowRegistry {
  return WorkflowRegistry.getInstance({ 
    logger,
    config: {
      allowDynamicCategories: true,
      customCategories: ['query', 'operation'],
    }
  });
}

/**
 * Create OAuth provider instance (optional)
 */
export function getOAuthProvider(
  configManager: ConfigManager, 
  logger: Logger, 
  kvManager: KVManager, 
  credentialStore: CredentialStore
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
      refreshTokenExpiryMs: parseInt(configManager.get('OAUTH_REFRESH_TOKEN_EXPIRATION', '2592000000'), 10),
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
  workflowRegistry: WorkflowRegistry
): TransportManager {
  return new TransportManager({
    type: configManager.get('TRANSPORT', 'stdio') as 'stdio' | 'http',
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
      corsOrigins: configManager.get('HTTP_CORS_ORIGINS', '*').split(','),
      preserveCompatibilityMode: true,
    },
  }, {
    logger,
    kvManager,
    sessionStore,
    eventStore,
    workflowRegistry,
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
 * Main dependency injection function - creates all dependencies with overrides
 */
export function getAllDependencies(overrides: AppServerOverrides = {}): AppServerDependencies {
  // Get or create configManager first
  const configManager = overrides.configManager || new ConfigManager();
  
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
  const workflowRegistry = overrides.workflowRegistry || getWorkflowRegistry(logger);
  const oauthProvider = overrides.oauthProvider || getOAuthProvider(configManager, logger, kvManager, credentialStore);
  const transportManager = overrides.transportManager || getTransportManager(
    configManager, logger, kvManager, sessionStore, eventStore, workflowRegistry
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
    overrides.customWorkflows?.forEach(workflow => server.registerWorkflow(workflow));
    overrides.customTools?.forEach(tool => server.registerTool(tool.name, tool.definition, tool.handler));
    
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
export async function getAllDependenciesAsync(overrides: AppServerOverrides = {}): Promise<AppServerDependencies> {
  // Get or create configManager first
  const configManager = overrides.configManager || new ConfigManager();
  
  // Load configuration
  await configManager.loadConfig();
  
  // Create logger early
  const logger = overrides.logger || getLogger(configManager);
  
  // Create KV manager (async)
  const kvManager = overrides.kvManager || await getKvManager(configManager, logger);
  
  // Now call the sync version with kvManager ready
  return getAllDependencies({
    configManager,
    logger,
    kvManager,
    ...overrides,
  });
}