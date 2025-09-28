/**
 * bb-mcp-server Library
 *
 * A comprehensive library for building Deno-based MCP servers with OAuth and workflow capabilities.
 *
 * @module bb-mcp-server
 * @version 0.1.0
 */

// Storage exports
export { KVManager } from './lib/storage/KVManager.ts';
export { CredentialStore } from './lib/storage/CredentialStore.ts';
export { SessionStore } from './lib/storage/SessionStore.ts';
export { TransportEventStore } from './lib/storage/TransportEventStore.ts';
export { TransportPersistenceService } from './lib/storage/TransportPersistenceService.ts';

// Configuration exports
export { ConfigManager } from './lib/config/ConfigManager.ts';

// Utility exports
export { Logger } from './lib/utils/Logger.ts';
export { AuditLogger } from './lib/utils/AuditLogger.ts';
export { ValidationHelpers } from './lib/utils/ValidationHelpers.ts';
export { ErrorHandler } from './lib/utils/ErrorHandler.ts';
export { errorMessage, errorName, isError, toError } from './lib/utils/Error.ts';

// API Client exports
export { BaseApiClient } from './lib/clients/BaseApiClient.ts';

// Tool/Workflow/Plugin exports
export type { ToolContext, ToolResult } from './lib/tools/ToolBase.ts';
export { ToolBase } from './lib/tools/ToolBase.ts';
export { ToolRegistry } from './lib/tools/ToolRegistry.ts';
export { WorkflowBase } from './lib/workflows/WorkflowBase.ts';
export { WorkflowRegistry } from './lib/workflows/WorkflowRegistry.ts';
export { PluginManager } from './lib/plugins/PluginManager.ts';

// Transport exports
export { TransportManager } from './lib/transport/TransportManager.ts';
export { HttpTransport } from './lib/transport/HttpTransport.ts';
export { StdioTransport } from './lib/transport/StdioTransport.ts';
export { SessionManager } from './lib/transport/SessionManager.ts';
export {
  executeWithRequestContext,
  getCurrentRequestContext,
  RequestContext,
  requireRequestContext,
} from './lib/transport/RequestContext.ts';

// OAuth exports
export { OAuthProvider } from './lib/auth/OAuthProvider.ts';
export { OAuthConsumer } from './lib/auth/OAuthConsumer.ts';
export { TokenManager } from './lib/auth/TokenManager.ts';
export { PKCEHandler } from './lib/auth/PKCEHandler.ts';
export { ClientRegistry } from './lib/auth/ClientRegistry.ts';
export { AuthorizationHandler } from './lib/auth/AuthorizationHandler.ts';
export { OAuthMetadata } from './lib/auth/OAuthMetadata.ts';

// HTTP Server exports
export { HttpServer } from './lib/server/HttpServer.ts';
export { OAuthEndpoints } from './lib/server/OAuthEndpoints.ts';
export { APIRouter } from './lib/server/APIRouter.ts';
export { StatusEndpoints } from './lib/server/StatusEndpoints.ts';
export { CORSHandler } from './lib/server/CORSHandler.ts';
export { ErrorPages } from './lib/server/ErrorPages.ts';

// Beyond MCP Server exports
export { BeyondMcpServer } from './lib/server/BeyondMcpServer.ts';
export { AppServer } from './lib/server/AppServer.ts';
export { RequestContextManager } from './lib/server/RequestContextManager.ts';
export { BeyondMcpSDKHelpers } from './lib/server/MCPSDKHelpers.ts';
export { CoreTools } from './lib/tools/CoreTools.ts';
export { WorkflowTools } from './lib/tools/WorkflowTools.ts';
export { ToolValidationHelper } from './lib/utils/ToolValidationHelper.ts';
//export { ZodToJsonSchema } from './lib/utils/ZodToJsonSchema.ts';
//export type { JsonSchema } from './lib/utils/ZodToJsonSchema.ts';
export {
  getAllDependencies,
  getAllDependenciesAsync,
  getAuditLogger,
  getConfigManager,
  getCredentialStore,
  getErrorHandler,
  getHttpServerConfig,
  getKvManager,
  getLogger,
  getOAuthProvider,
  getSessionStore,
  getToolRegistry,
  getTransportEventStore,
  getTransportManager,
  getWorkflowRegistry,
  performHealthChecks,
  validateConfiguration,
} from './lib/server/DependencyHelpers.ts';

// OAuth dependency types from individual components
export type { TokenManagerDependencies } from './lib/auth/TokenManager.ts';
export type { ClientRegistryDependencies } from './lib/auth/ClientRegistry.ts';
export type { AuthorizationHandlerDependencies } from './lib/auth/AuthorizationHandler.ts';
export type { OAuthProviderDependencies } from './lib/auth/OAuthProvider.ts';
export type { OAuthConsumerDependencies } from './lib/auth/OAuthConsumer.ts';

// Type exports - Re-export types with conflict resolution
export type * from './types/library.types.ts';
export type * from './types/consumer.types.ts';

// MCP SDK types
export type { CallToolResult } from 'mcp/types.js';

// OAuth type exports - specific exports to avoid conflicts
export type {
  AuthCallbackResult,
  // Auth flow types
  AuthFlowResult,
  // Request/Response types
  AuthorizeRequest,
  AuthorizeResponse,
  ClientRegistration,
  // Client registration types
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  ClientValidation,
  CodeChallengeResult,
  // Token types
  MCPAccessToken,
  MCPAuthContext,
  MCPAuthorizationCode,
  // MCP types
  MCPAuthorizationRequest,
  MCPRefreshToken,
  // PKCE types
  PKCEMethod,
  PKCEValidation,
  TokenConfig,
  TokenRefreshResult,
  TokenRequest,
  TokenResponse,
  TokenResult,
  TokenValidation,
} from './lib/auth/OAuthTypes.ts';

// Storage types (avoiding conflicts with consumer.types.ts)
export type {
  KVManagerConfig,
  KVPrefixes,
  KVSetOptions,
  KVStats,
  OAuthCredentials,
} from './lib/storage/StorageTypes.ts';
export { DEFAULT_KV_PREFIXES } from './lib/storage/StorageTypes.ts';

// Config types (avoiding conflicts with WorkflowTypes.ts)
export type {
  AppConfig,
  AuditConfig,
  ConfigLoaderOptions,
  ConfigValidationResult,
  EnvironmentMapping,
  LoggingConfig,
  ServerConfig,
} from './lib/config/ConfigTypes.ts';

// Workflow types (avoiding conflicts with consumer.types.ts)
export type {
  BaseWorkflowParameters,
  FailedStep,
  //WorkflowCategory,
  WorkflowContext,
  WorkflowError,
  WorkflowRegistration,
  WorkflowRegistryConfig,
  WorkflowResource,
  WorkflowResult,
  WorkflowStep,
} from './lib/types/WorkflowTypes.ts';
//export { DEFAULT_WORKFLOW_CATEGORIES } from './lib/types/WorkflowTypes.ts';

// Plugin types
export type {
  AppPlugin,
  LoadedPlugin,
  PluginCategory,
  PluginDiscoveryOptions,
} from './lib/types/PluginTypes.ts';
export { DEFAULT_PLUGIN_CATEGORIES } from './lib/types/PluginTypes.ts';

// Transport types (Phase 3)
export type {
  AuthenticationResult,
  CreateSessionData,
  HttpTransportConfig,
  HttpTransportMetrics,
  MCPError,
  MCPRequest,
  MCPResponse,
  RequestContextData,
  SessionConfig,
  SessionData,
  SessionValidationResult,
  StdioTransportConfig,
  StdioTransportMetrics,
  Transport,
  TransportConfig,
  TransportDependencies,
  TransportEvent,
  TransportMetrics,
  TransportType,
} from './lib/transport/TransportTypes.ts';

// HTTP Server types - with alias exports to avoid conflicts
export type {
  APIConfig,
  CompleteServerConfig,
  ComponentStatus,
  CORSConfig,
  EndpointRegistry,
  HealthCheckResult,
  HttpServerConfig,
  HttpServerDependencies,
  RateLimitInfo,
  RouteHandler,
  SecurityConfig,
  ServerEvents,
  ServerFactory,
  ServerInitOptions,
  ServerMetrics,
  ServerMiddleware,
  ServerStatus,
} from './lib/server/ServerTypes.ts';

// HTTP Server types with aliases to avoid conflicts
export type {
  AuthContext as HttpAuthContext,
  ConfigValidationResult as HttpConfigValidationResult,
  EndpointInfo as HttpEndpointInfo,
  ErrorInfo as HttpErrorInfo,
  LoggingConfig as HttpLoggingConfig,
  RequestContext as HttpRequestContext,
  ResponseMetadata as HttpResponseMetadata,
} from './lib/server/ServerTypes.ts';

// Beyond MCP Server types
export { ToolHandlerMode, WorkflowToolNaming } from './lib/types/BeyondMcpTypes.ts';

export type {
  AuditEvent,
  AuthenticationInfo,
  BeyondMcpRequestContext,
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
  ConfigValidationResult as MCPConfigValidationResult,
  CoreToolsDependencies,
  CreateContextData,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitInputRequest,
  ElicitInputResult,
  RateLimitInfo as MCPRateLimitInfo,
  RegisteredTool,
  SchemaValidationError,
  SchemaValidationResult,
  ServerState,
  SessionInfo,
  ToolCallExtra,
  ToolDefinition,
  ToolExample,
  ToolExecutionContext,
  ToolHandler,
  ToolPlugin,
  ToolRegistration,
  ToolRegistrationConfig,
  ToolRegistrationOptions,
  ToolRegistryDependencies,
  ToolRegistryStats,
  ToolStats,
  ValidationResult,
} from './lib/types/BeyondMcpTypes.ts';

// AppServer types
export type {
  AppServerConfig,
  AppServerDependencies,
  AppServerDependenciesPartial,
  AppServerOverrides,
  ConsumerApiClient,
  ConsumerOAuthConsumer,
  CreateCustomAppServerDependencies,
  DependenciesHealthCheck,
  DependencyFactory,
  ThirdPartyApiHealthStatus,
  ThirdPartyApiInfo,
} from './lib/types/AppServerTypes.ts';

// API Client types
export type { BaseApiClientConfig } from './lib/clients/BaseApiClient.ts';
