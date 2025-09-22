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

// Workflow exports (Phase 2)
export { WorkflowBase } from './lib/workflows/WorkflowBase.ts';
export { WorkflowRegistry } from './lib/workflows/WorkflowRegistry.ts';
export { PluginManager } from './lib/workflows/discovery/PluginManager.ts';

// Transport exports (Phase 3)
export { TransportManager } from './lib/transport/TransportManager.ts';
export { HttpTransport } from './lib/transport/HttpTransport.ts';
export { StdioTransport } from './lib/transport/StdioTransport.ts';
export { SessionManager } from './lib/transport/SessionManager.ts';
export { RequestContext, executeWithRequestContext, getCurrentRequestContext, requireRequestContext } from './lib/transport/RequestContext.ts';

// OAuth exports (Phase 4)
export { OAuthProvider } from './lib/auth/OAuthProvider.ts';
export { OAuthConsumer } from './lib/auth/OAuthConsumer.ts';
export { TokenManager } from './lib/auth/TokenManager.ts';
export { PKCEHandler } from './lib/auth/PKCEHandler.ts';
export { ClientRegistry } from './lib/auth/ClientRegistry.ts';
export { AuthorizationHandler } from './lib/auth/AuthorizationHandler.ts';
export { OAuthMetadata } from './lib/auth/OAuthMetadata.ts';

// HTTP Server exports (Phase 5)
export { HttpServer } from './lib/server/HttpServer.ts';
export { OAuthEndpoints } from './lib/server/OAuthEndpoints.ts';
export { APIRouter } from './lib/server/APIRouter.ts';
export { StatusEndpoints } from './lib/server/StatusEndpoints.ts';
export { CORSHandler } from './lib/server/CORSHandler.ts';
export { ErrorPages } from './lib/server/ErrorPages.ts';

// Beyond MCP Server exports (Phase 6)
export { BeyondMcpServer } from './lib/server/BeyondMcpServer.ts';
export { AppServer } from './lib/server/AppServer.ts';
export { ToolRegistry } from './lib/server/ToolRegistry.ts';
export { RequestContextManager } from './lib/server/RequestContextManager.ts';
export { BeyondMcpSDKHelpers } from './lib/server/MCPSDKHelpers.ts';
export { CoreTools } from './lib/tools/CoreTools.ts';
export { getAllDependencies, getAllDependenciesAsync } from './lib/server/DependencyHelpers.ts';

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

// OAuth type exports (Phase 4) - specific exports to avoid conflicts
export type {
  // Token types
  MCPAccessToken,
  MCPRefreshToken,
  MCPAuthorizationCode,
  TokenValidation,
  TokenRefreshResult,
  TokenConfig,
  // Request/Response types
  AuthorizeRequest,
  AuthorizeResponse,
  TokenRequest,
  TokenResponse,
  // Client registration types
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  ClientRegistration,
  ClientValidation,
  // Auth flow types
  AuthFlowResult,
  AuthCallbackResult,
  TokenResult,
  // MCP types
  MCPAuthorizationRequest,
  MCPAuthContext,
  // PKCE types
  PKCEMethod,
  PKCEValidation,
  CodeChallengeResult,
} from './lib/auth/OAuthTypes.ts';

// Storage types (avoiding conflicts with consumer.types.ts)
export type {
  OAuthCredentials,
  KVStats,
  KVPrefixes,
  KVManagerConfig,
  KVSetOptions,
} from './lib/storage/StorageTypes.ts';
export { DEFAULT_KV_PREFIXES } from './lib/storage/StorageTypes.ts';

// Config types (avoiding conflicts with WorkflowTypes.ts)
export type {
  AppConfig,
  ServerConfig,
  LoggingConfig,
  AuditConfig,
  ConfigLoaderOptions,
  ConfigValidationResult,
  EnvironmentMapping,
} from './lib/config/ConfigTypes.ts';

// Workflow types (avoiding conflicts with consumer.types.ts)
export type {
  WorkflowCategory,
  WorkflowRegistryConfig,
  WorkflowError,
  WorkflowStep,
  FailedStep,
  WorkflowPlugin,
  LoadedPlugin,
  PluginDiscoveryOptions,
  WorkflowResource,
  BaseWorkflowParameters,
  WorkflowResult,
  WorkflowContext,
  WorkflowRegistration,
} from './lib/workflows/WorkflowTypes.ts';
export { DEFAULT_WORKFLOW_CATEGORIES } from './lib/workflows/WorkflowTypes.ts';

// Transport types (Phase 3)
export type {
  Transport,
  TransportType,
  TransportConfig,
  HttpTransportConfig,
  StdioTransportConfig,
  SessionConfig,
  MCPRequest,
  MCPResponse,
  MCPError,
  SessionData,
  CreateSessionData,
  SessionValidationResult,
  RequestContextData,
  TransportEvent,
  TransportMetrics,
  HttpTransportMetrics,
  StdioTransportMetrics,
  TransportDependencies,
  AuthenticationResult,
} from './lib/transport/TransportTypes.ts';

// HTTP Server types (Phase 5) - with alias exports to avoid conflicts
export type {
  HttpServerConfig,
  HttpServerDependencies,
  APIConfig,
  CORSConfig,
  ServerMetrics,
  HealthCheckResult,
  RateLimitInfo,
  ServerMiddleware,
  RouteHandler,
  ServerFactory,
  ServerInitOptions,
  SecurityConfig,
  CompleteServerConfig,
  EndpointRegistry,
  ComponentStatus,
  ServerStatus,
  ServerEvents,
} from './lib/server/ServerTypes.ts';

// HTTP Server types with aliases to avoid conflicts
export type {
  RequestContext as HttpRequestContext,
  ResponseMetadata as HttpResponseMetadata,
  ErrorInfo as HttpErrorInfo,
  EndpointInfo as HttpEndpointInfo,
  AuthContext as HttpAuthContext,
  LoggingConfig as HttpLoggingConfig,
  ConfigValidationResult as HttpConfigValidationResult,
} from './lib/server/ServerTypes.ts';

// Beyond MCP Server types (Phase 6)
export type {
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
  BeyondMcpRequestContext,
  CreateContextData,
  ToolDefinition,
  ToolHandler,
  ToolRegistration,
  ToolExample,
  ToolCallExtra,
  RegisteredTool,
  ValidationResult,
  ToolRegistryDependencies,
  CoreToolsDependencies,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitInputRequest,
  ElicitInputResult,
  ToolStats,
  ToolRegistryStats,
  SchemaValidationError,
  SchemaValidationResult,
  ToolPlugin,
  ServerState,
  ConfigValidationResult as MCPConfigValidationResult,
  ToolExecutionContext,
  AuditEvent,
  RateLimitInfo as MCPRateLimitInfo,
  SessionInfo,
  AuthenticationInfo,
} from './lib/types/BeyondMcpTypes.ts';

// AppServer types
export type {
  AppServerConfig,
  AppServerDependencies,
  AppServerDependenciesPartial,
  AppServerOverrides,
  DependencyFactory,
  ConsumerApiClient,
  ConsumerOAuthConsumer,
} from './lib/types/AppServerTypes.ts';
