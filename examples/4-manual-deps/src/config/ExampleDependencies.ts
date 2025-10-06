/**
 * ExampleCorp Dependencies Setup
 *
 * Demonstrates how to create and wire dependencies for a consumer MCP server:
 * - Integrates library components with business-specific components
 * - Shows dependency injection patterns using library infrastructure
 * - Creates configured services for ExampleCorp integration
 * - Demonstrates separation between library and consumer concerns
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';

// 🎯 Library imports - all infrastructure dependencies
import {
  AppServerDependencies,
  type AuditConfig,
  AuditLogger,
  //BeyondMcpServerDependencies,
  ConfigManager,
  CreateCustomAppServerDependencies,
  CredentialStore,
  ErrorHandler,
  getCredentialStore,
  getKvManager,
  getLogger,
  KVManager,
  Logger,
  type LoggingConfig,
  type McpServerInstructionsConfig,
  OAuthProvider,
  type OAuthProviderConfig,
  performHealthChecks,
  SessionStore,
  type StorageConfig,
  type TransportConfig,
  TransportEventStore,
  TransportEventStoreChunked,
  type TransportEventStoreChunkedConfig,
  TransportManager,
  validateConfiguration,
  //WorkflowRegistry,
  //type MCPServerDependencies,
  //type WorkflowRegistryConfig,
} from '@beyondbetter/bb-mcp-server';

// 🎯 Import dependency helpers from the library
import { getAuditLogger, getToolRegistry, getWorkflowRegistry } from '@beyondbetter/bb-mcp-server';

// 🎯 Consumer-specific imports - business logic components
import { type ExampleOAuthConfig, ExampleOAuthConsumer } from '../auth/ExampleOAuthConsumer.ts';
import { ExampleApiClient, type ExampleApiClientConfig } from '../api/ExampleApiClient.ts';
import { ExampleTools } from '../tools/ExampleTools.ts';
import { ExampleQueryWorkflow } from '../workflows/ExampleQueryWorkflow.ts';
import { ExampleOperationWorkflow } from '../workflows/ExampleOperationWorkflow.ts';
import { loadInstructions, validateInstructions } from '../utils/InstructionsLoader.ts';

/**
 * Create ExampleCorp dependencies using library infrastructure
 *
 * 🎯 DEMONSTRATES: How library + consumer components integrate
 * 🎯 Library provides: Config, logging, storage, OAuth, transport, workflows
 * 🎯 Consumer provides: API client, custom OAuth consumer, business config
 */
export async function createManualDependencies(
  { configManager }: CreateCustomAppServerDependencies,
): Promise<Partial<AppServerDependencies>> {
  // =============================================================================
  // LIBRARY COMPONENT INITIALIZATION
  // 🎯 These come from bb-mcp-server library - zero consumer implementation
  // =============================================================================

  // 🎯 Initialize library logger with ExampleCorp configuration
  const loggingConfig = configManager?.get<LoggingConfig>('logging');
  const logger = new Logger({
    level: loggingConfig.level,
    format: loggingConfig.format,
  });

  logger.info('Initializing ExampleCorp MCP server dependencies...');

  // 🎯 Initialize library audit logger
  const auditConfig = configManager?.get<AuditConfig>('audit');
  const auditLogger = new AuditLogger(auditConfig, logger);

  // 🎯 Initialize library KV storage using ConfigManager
  const storageConfig = configManager?.get<StorageConfig>('storage');
  const kvPath = storageConfig.denoKvPath;
  const kvManager = new KVManager({ kvPath }, logger);
  logger.info('ExampleCorp: Configuring KV storage', {
    kvPath,
    resolvedPath: new URL(kvPath, `file://${Deno.cwd()}/`).pathname,
    currentWorkingDirectory: Deno.cwd(),
  });
  // Initialize KV connection before using it
  await kvManager.initialize();

  // 🎯 Initialize library credential store
  const credentialStore = new CredentialStore(kvManager, {}, logger);

  // 🎯 Initialize library session store (required by TransportManager)
  const sessionStore = new SessionStore(
    kvManager,
    { keyPrefix: ['sessions'] },
    logger,
  );

  const transportEventStoreConfig = configManager?.get<
    TransportEventStoreChunkedConfig
  >(
    'transportEventStore',
  );

  // 🎯 Initialize library event store (required by TransportManager)
  // Use chunked storage for handling large messages (recommended)
  const useChunkedStorage = transportEventStoreConfig.storageType === 'chunked';

  const eventStore = useChunkedStorage
    ? new TransportEventStoreChunked(
      kvManager,
      ['events'],
      logger,
      {
        maxChunkSize: transportEventStoreConfig.chunking.maxChunkSize,
        enableCompression: transportEventStoreConfig.compression.enable,
        compressionThreshold: transportEventStoreConfig.compression.threshold,
        maxMessageSize: transportEventStoreConfig.chunking.maxMessageSize,
      },
    )
    : new TransportEventStore(
      kvManager,
      ['events'],
      logger,
    );

  // 🎯 Initialize library error handler
  const errorHandler = new ErrorHandler();

  // 🎯 Initialize library OAuth provider (MCP server as OAuth provider)
  const oauthConfig = configManager.get<OAuthProviderConfig>('oauthProvider');
  const oauthProvider = new OAuthProvider(oauthConfig, {
    logger,
    kvManager,
    credentialStore,
  });

  // =============================================================================
  // CONSUMER COMPONENT INITIALIZATION
  // 🎯 These are ExampleCorp-specific - business logic integration
  // =============================================================================

  // 🎯 Create ExampleCorp OAuth consumer configuration using standard config keys
  const apiBaseUrl = configManager.get(
    'THIRDPARTY_API_BASE_URL',
    'https://jsonplaceholder.typicode.com',
  );
  const exampleOAuthConfig: ExampleOAuthConfig = {
    // Standard OAuth 2.0 configuration (using standard config keys)
    providerId: 'examplecorp',
    authUrl: configManager.get(
      'OAUTH_CONSUMER_AUTH_URL',
      'https://httpbin.org/anything/oauth/authorize',
    ),
    tokenUrl: configManager.get(
      'OAUTH_CONSUMER_TOKEN_URL',
      'https://httpbin.org/anything/oauth/token',
    ),
    clientId: configManager.get('OAUTH_CONSUMER_CLIENT_ID', 'demo-client-id'),
    clientSecret: configManager.get(
      'OAUTH_CONSUMER_CLIENT_SECRET',
      'demo-client-secret',
    ),
    redirectUri: configManager.get(
      'OAUTH_CONSUMER_REDIRECT_URI',
      'http://localhost:3000/oauth/consumer/callback',
    ),
    scopes: configManager.get('OAUTH_CONSUMER_SCOPES', ['read', 'write']),

    tokenRefreshBufferMinutes: 5,
    maxTokenRefreshRetries: 3,

    // ExampleCorp-specific configuration
    exampleCorp: {
      apiBaseUrl,
      apiVersion: configManager.get('THIRDPARTY_API_VERSION', 'v1'),
      scopes: configManager.get('OAUTH_CONSUMER_SCOPES', ['read', 'write']),
      customClaims: {
        // ExampleCorp-specific OAuth claims
        organization: configManager.get('THIRDPARTY_ORGANIZATION'),
        department: configManager.get('THIRDPARTY_DEPARTMENT'),
      },
    },
  };

  // 🎯 Create ExampleCorp OAuth consumer (extends library OAuthConsumer)
  const oauthConsumer = new ExampleOAuthConsumer(
    exampleOAuthConfig,
    { logger, auditLogger, kvManager, credentialStore },
  );

  // 🎯 Create ExampleCorp API client configuration using standard config keys
  const apiClientConfig: ExampleApiClientConfig = {
    baseUrl: apiBaseUrl,
    apiVersion: configManager.get('THIRDPARTY_API_VERSION', 'v1'),
    timeout: configManager.get('THIRDPARTY_API_TIMEOUT', 30000),
    retryAttempts: configManager.get('THIRDPARTY_API_RETRY_ATTEMPTS', 3),
    retryDelayMs: configManager.get('THIRDPARTY_API_RETRY_DELAY', 1000),
    userAgent: `ExampleCorp-MCP-Server/1.0 (Deno/${Deno.version.deno})`,
  };

  // 🎯 Create ExampleCorp API client
  const thirdpartyApiClient = new ExampleApiClient(
    apiClientConfig,
    oauthConsumer,
    logger,
    auditLogger,
  );

  // 📝 Step 4: Manual tool and workflow registration (NO plugin discovery)

  // 🎯 Create tool registry for tool registration

  const toolRegistry = await getToolRegistry(logger, errorHandler);

  const mcpServerInstructionsConfig = configManager.get<
    McpServerInstructionsConfig
  >(
    'mcpServerInstructionsConfig',
  );
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

  const serverOptions: {
    capabilities?: {
      tools?: {};
      logging?: {};
      prompts?: {};
      resources?: { subscribe?: boolean };
      completions?: {};
    };
    instructions?: string;
  } = {
    capabilities: {
      tools: {},
      logging: {},
    },
    instructions,
  };
  toolRegistry.sdkMcpServer = new SdkMcpServer(
    {
      name: 'examplecorp-mcp-server',
      version: '1.0.0',
      title: 'ExampleCorp API Integration',
      description: 'MCP server for ExampleCorp API integration with bb-mcp-server library',
    },
    serverOptions,
  );

  const exampleTools = new ExampleTools({
    apiClient: thirdpartyApiClient,
    oauthConsumer: oauthConsumer,
    logger: logger,
    auditLogger: auditLogger,
  });

  // Register each tool manually - complete control over registration
  const toolRegistrations = exampleTools.getTools();
  for (const registration of toolRegistrations) {
    toolRegistry.registerTool(
      registration.name,
      registration.definition,
      registration.handler,
      registration.options,
    );
    logger.info(`Manually registered tool: ${registration.definition.title}`);
  }

  // 🎯 Create workflow registry
  const workflowRegistry = await getWorkflowRegistry(logger, errorHandler);

  // Create and register workflows manually
  const queryWorkflow = new ExampleQueryWorkflow({
    apiClient: thirdpartyApiClient,
    logger: logger,
    oauthConsumer: oauthConsumer,
  });

  const operationWorkflow = new ExampleOperationWorkflow({
    apiClient: thirdpartyApiClient,
    logger: logger,
    oauthConsumer: oauthConsumer,
  });

  // Manual registration with complete control
  workflowRegistry.registerWorkflow(queryWorkflow);
  workflowRegistry.registerWorkflow(operationWorkflow);

  logger.info('Manually registered workflows:', {
    workflows: [queryWorkflow.name, operationWorkflow.name],
  });

  // 🎯 Initialize library transport manager with minimal config
  const transportConfig = configManager.get<TransportConfig>('transport');
  const transportManager = new TransportManager(transportConfig, {
    logger,
    kvManager,
    sessionStore,
    eventStore,
  });

  // =============================================================================
  // DEPENDENCY VALIDATION AND HEALTH CHECKS
  // =============================================================================

  // Validate required configuration (OAuth consumer is required for this example)
  await validateConfiguration(configManager, logger, { oauthConsumer });

  // Perform health checks on external dependencies
  await performHealthChecks(
    {
      thirdpartyApiClient,
      oauthConsumer,
      oauthProvider,
      kvManager,
    },
    logger,
    // addition health checks
    [
      {
        name: 'Workflow Registry (Manual)',
        check: async () => {
          const workflowNames = workflowRegistry.getWorkflowNames();
          if (workflowNames.length === 0) {
            throw new Error(
              'No workflows registered - manual registration may have failed',
            );
          }
          return {
            healthy: true,
            status: 'Workflows registered',
            workflowCount: workflowNames.length,
            discoveryMode: 'manual',
          };
        },
      },
    ],
  );

  // Log successful initialization
  logger.info('ExampleCorp MCP server dependencies initialized successfully', {
    libraryComponents: [
      'Logger',
      'AuditLogger',
      'KVManager',
      'WorkflowRegistry',
      'OAuthProvider',
      'TransportManager',
    ],
    consumerComponents: [
      'ExampleOAuthConsumer',
      'ExampleApiClient',
    ],
    transportType: configManager.get('MCP_TRANSPORT', 'stdio'),
    exampleCorpApiUrl: apiClientConfig.baseUrl,
  });

  // =============================================================================
  // RETURN COMBINED DEPENDENCIES (without mcpServer to avoid circular dependency)
  // 🎯 Library dependencies + consumer dependencies = ready for MCP server creation
  // =============================================================================

  return {
    // 🎯 Library dependencies (from bb-mcp-server)
    logger,
    auditLogger,
    kvManager: kvManager!, // Assert non-null since we initialized it
    toolRegistry,
    workflowRegistry,
    oauthProvider,
    transportManager,
    configManager,
    errorHandler,

    // 🎯 Consumer dependencies (ExampleCorp-specific)
    thirdpartyApiClient,
    oauthConsumer,
  };
}

/**
 * Create test/mock dependencies for development and testing
 */
export async function createTestExampleDependencies(): Promise<
  Partial<AppServerDependencies>
> {
  // Create mock configuration for testing
  const testConfigManager = new ConfigManager();
  const testLogger = getLogger(testConfigManager);
  const testAuditLogger = getAuditLogger(testConfigManager, testLogger);
  const testKvManager = await getKvManager(testConfigManager, testLogger);
  const testCredentialStore = getCredentialStore(testKvManager, testLogger);
  testConfigManager.set('EXAMPLECORP_CLIENT_ID', 'test-client-id');
  testConfigManager.set('EXAMPLECORP_CLIENT_SECRET', 'test-client-secret');
  testConfigManager.set(
    'EXAMPLECORP_API_BASE_URL',
    'http://localhost:3001/api',
  );
  testConfigManager.set('LOG_LEVEL', 'debug');
  testConfigManager.set('MCP_TRANSPORT', 'stdio');

  // Create dependencies with test configuration
  return await createManualDependencies({
    configManager: testConfigManager,
    logger: testLogger,
    auditLogger: testAuditLogger,
    kvManager: testKvManager,
    credentialStore: testCredentialStore,
  });
}

/**
 * LIBRARY VALIDATION:
 *
 * This file demonstrates dependency integration patterns:
 *
 * ✅ Library Integration: Uses all library components seamlessly (~50 lines)
 * ✅ Consumer Integration: Creates business-specific components (~30 lines)
 * ✅ Configuration Management: Library ConfigManager handles all settings (~0 lines)
 * ✅ Dependency Injection: Clean separation of concerns with typed dependencies
 * ✅ Health Checking: Validates all dependencies before server startup (~100 lines)
 * ✅ Error Handling: Comprehensive validation and error reporting
 * ✅ Testing Support: Mock dependencies for development and testing
 *
 * ARCHITECTURE BENEFITS:
 * - Clear Separation: Library vs consumer dependencies clearly separated
 * - Type Safety: Full TypeScript support for all dependency injection
 * - Configuration: Library handles all configuration loading and validation
 * - Health Monitoring: Built-in health checks for all components
 * - Testing: Easy to create test/mock versions of all dependencies
 * - Extensibility: Easy to add new dependencies following same patterns
 */
