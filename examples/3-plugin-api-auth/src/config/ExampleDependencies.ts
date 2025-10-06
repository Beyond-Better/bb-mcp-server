/**
 * ExampleCorp Dependencies Setup
 *
 * Demonstrates how to create and wire dependencies for a consumer MCP server:
 * - Integrates library components with business-specific components
 * - Shows dependency injection patterns using library infrastructure
 * - Creates configured services for ExampleCorp integration
 * - Demonstrates separation between library and consumer concerns
 */

// 🎯 Library imports - all infrastructure dependencies
import {
  AppServerDependencies,
  type CreateCustomAppServerDependencies,
  //ToolHandlerMode,
  //WorkflowToolNaming,
} from '@beyondbetter/bb-mcp-server';

// 🎯 Consumer-specific imports - business logic components
import { type ExampleOAuthConfig, ExampleOAuthConsumer } from '../auth/ExampleOAuthConsumer.ts';
import { ExampleApiClient, type ExampleApiClientConfig } from '../api/ExampleApiClient.ts';

/**
 * Create ExampleCorp dependencies using library infrastructure
 *
 * 🎯 DEMONSTRATES: How library + consumer components integrate
 * 🎯 Library provides: Config, logging, storage, OAuth, transport, workflows
 * 🎯 Consumer provides: API client, custom OAuth consumer, business config
 */
export async function createExampleDependencies(
  { configManager, logger, auditLogger, kvManager, credentialStore }:
    CreateCustomAppServerDependencies,
): Promise<Partial<AppServerDependencies>> {
  // =============================================================================
  // LIBRARY COMPONENT INITIALIZATION
  // 🎯 Most dependencies come from bb-mcp-server library - zero consumer implementation
  // =============================================================================

  logger.info('Initializing ExampleCorp MCP server dependencies...');

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
  const oauthConsumer = new ExampleOAuthConsumer(exampleOAuthConfig, {
    logger,
    auditLogger,
    kvManager,
    credentialStore,
  });

  // 🎯 Create ExampleCorp API client configuration using standard config keys
  const apiClientConfig: ExampleApiClientConfig = {
    baseUrl: configManager.get(
      'THIRDPARTY_API_BASE_URL',
      'https://jsonplaceholder.typicode.com',
    ),
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

  // =============================================================================
  // RETURN COMBINED DEPENDENCIES
  // 🎯 Library dependencies + consumer dependencies = ready for MCP server creation
  // =============================================================================

  return {
    // 🎯 Library dependencies (from bb-mcp-server)
    configManager,
    logger,

    // 🎯 Consumer dependencies (ExampleCorp-specific)
    thirdpartyApiClient,
    oauthConsumer,

    // 🎯 Server configuration for SDK MCP server creation
    serverConfig: {
      name: 'examplecorp-mcp-server',
      version: '1.0.0',
      title: 'ExampleCorp API Integration',
      description: 'MCP server for ExampleCorp API integration with bb-mcp-server library',
    },
    // 🎯 Tool registration configuration - demonstrates new flexible system
    // NOTE: This would be used when creating BeyondMcpServer, not returned from dependencies
    // toolRegistrationConfig: {
    //   workflowTools: {
    //     enabled: true,
    //     naming: WorkflowToolNaming.NAMESPACED, // Will create execute_workflow_examplecorp-mcp-server
    //     executeWorkflow: { enabled: true },
    //     getSchemaWorkflow: { enabled: true },
    //   },
    //   defaultHandlerMode: ToolHandlerMode.MANAGED, // Use managed validation by default
    // },
  };
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
