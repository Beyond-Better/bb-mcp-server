/**
 * AppServer Types - Type definitions for AppServer and dependency injection
 */

import type { ConfigManager } from '../config/ConfigManager.ts';
import type { Logger } from '../utils/Logger.ts';
import type { AuditLogger } from '../utils/AuditLogger.ts';
import type { KVManager } from '../storage/KVManager.ts';
import type { CredentialStore } from '../storage/CredentialStore.ts';
import type { SessionStore } from '../storage/SessionStore.ts';
import type { TransportPersistenceStore } from '../storage/TransportPersistenceStore.ts';
import type { TransportEventStore } from '../storage/TransportEventStore.ts';
import type { TransportEventStoreChunked } from '../storage/TransportEventStoreChunked.ts';
import type { ErrorHandler } from '../utils/ErrorHandler.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import type { ToolRegistry } from '../tools/ToolRegistry.ts';
import type { OAuthProvider } from '../auth/OAuthProvider.ts';
import type { TransportManager } from '../transport/TransportManager.ts';
import type { BeyondMcpServer } from '../server/BeyondMcpServer.ts';
import type { HttpServerConfig } from '../server/ServerTypes.ts';
import type { DocsEndpointHandler } from '../server/DocsEndpointHandler.ts';
import type { DocsEndpointConfig } from './DocsTypes.ts';
import type { WorkflowBase } from '../workflows/WorkflowBase.ts';
import type { ToolRegistration } from '../types/BeyondMcpTypes.ts';
import type { TransportConfig } from '../transport/TransportTypes.ts';
import type { AppPlugin } from './PluginTypes.ts';

/**
 * Configuration interface for AppServer
 */
export interface AppServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Server title */
  title?: string;
  /** Server description */
  description: string;
  /** Transport configuration */
  transport?: TransportConfig;
}

/**
 * Complete dependencies interface for AppServer
 */
export interface AppServerDependencies {
  // Core library dependencies
  configManager: ConfigManager;
  //config: ConfigManager;
  logger: Logger;
  auditLogger: AuditLogger;
  kvManager: KVManager;
  sessionStore: SessionStore;
  transportPersistenceStore: TransportPersistenceStore;
  eventStore: TransportEventStore | TransportEventStoreChunked;
  credentialStore: CredentialStore;
  errorHandler: ErrorHandler;
  workflowRegistry: WorkflowRegistry;
  toolRegistry: ToolRegistry;
  oauthProvider: OAuthProvider;
  transportManager: TransportManager;

  // Beyond MCP Server (must be created with all dependencies)
  beyondMcpServer: BeyondMcpServer;

  // HTTP Server configuration (optional)
  httpServerConfig?: HttpServerConfig;

  // Documentation endpoint handler (optional)
  docsEndpointHandler?: DocsEndpointHandler;

  // Consumer-specific dependencies (pre-built instances
  thirdpartyApiClient?: any;
  oauthConsumer?: any;

  // Server configuration for generic fallback
  serverConfig?: {
    name: string;
    version: string;
    title?: string;
    description: string;
  };

  additionalHealthChecks?: DependenciesHealthCheck[];

  // Custom workflows and tools
  customWorkflows?: WorkflowBase[];
  customTools?: ToolRegistration[];

  // Static plugins (for compiled binaries or explicit registration)
  // If provided, these plugins are registered before discovery runs
  staticPlugins?: AppPlugin[];
}
type AppOnlyKeys = 'sessionStore' | 'eventStore' | 'credentialStore' | 'beyondMcpServer';

export type AppServerDependenciesPartial = Omit<AppServerDependencies, AppOnlyKeys>;

export interface CreateCustomAppServerDependencies {
  configManager: ConfigManager;
  logger: Logger;
  auditLogger: AuditLogger;
  kvManager: KVManager;
  credentialStore: CredentialStore;
}

export type DependenciesHealthCheck = {
  name: string;
  check: () => Promise<{ healthy: boolean; status: string }>;
};

/**
 * Partial dependencies for consumer override
 */
export interface AppServerOverrides extends Partial<AppServerDependencies> {
  // Common override patterns
  config?: ConfigManager;
  serverConfig?: AppServerConfig;
  // Documentation endpoint configuration (alternative to providing docsEndpointHandler)
  docsEndpointConfig?: DocsEndpointConfig;
}

/**
 * Standard dependency factory function signature
 */
export type DependencyFactory<T> = (config: ConfigManager, logger?: Logger) => T | Promise<T>;

/**
 * Third-party API health status information
 */
export interface ThirdPartyApiHealthStatus {
  healthy: boolean;
  version: string;
  uptime: number;
  services: Record<string, 'healthy' | 'degraded' | 'down'>;
}

/**
 * API information and capabilities
 */
export interface ThirdPartyApiInfo {
  /** API name */
  name: string;
  /** API version */
  version: string;
  /** API description */
  description?: string;
  /** Available endpoints or capabilities */
  capabilities?: string[];
  /** API documentation URL */
  documentationUrl?: string;
  /** Rate limiting information */
  rateLimits?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  /** API status page URL */
  statusPageUrl?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Consumer API client interface (for type safety)
 *
 * @deprecated Use BaseApiClient abstract class instead for stronger type safety
 */
export interface ConsumerApiClient {
  healthCheck(): Promise<{ healthy: boolean; status?: string }>;
  disconnect(): Promise<void>;
}

/**
 * Consumer OAuth consumer interface (for type safety)
 */
export interface ConsumerOAuthConsumer {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  getAccessToken(userId: string): Promise<string>;
}
