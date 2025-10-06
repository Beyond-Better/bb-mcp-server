/**
 * Configuration type definitions for bb-mcp-server library
 *
 * Defines interfaces for server configuration, transport options, and
 * third-party integrations.
 */

/**
 * Server configuration options
 */
export interface ServerConfig {
  name: string;
  version: string;
  transport: 'stdio' | 'http';
  httpPort?: number;
  httpHost?: string;
  devMode: boolean;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  denoKvPath: string;
  enablePersistence?: boolean;
  cleanupInterval?: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'text' | 'json';
  //file?: string;
}

/**
 * Audit logging configuration
 */
import type { AuditConfig } from '../utils/AuditLogger.ts';
export type { AuditConfig };

/**
 * Rate limiting configuration
 */
import type { RateLimitConfig } from '../types/RateLimitTypes.ts';
export type { RateLimitConfig };

/**
 * Rate limiting configuration
 */
export interface ThirdPartyApiConfig {
  providerId: string;
  version: string;
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

/**
 * OAuth Provider configuration (when MCP server acts as OAuth provider)
 * @see ../auth/OAuthTypes.ts for full type definition
 */
import type { PluginDiscoveryOptions as PluginManagerConfig } from '../types/PluginTypes.ts';
export type { PluginManagerConfig };

/**
 * Transport Event Store configuration (event store for MCP Server)
 * @see ../storage/StorageTypes.ts for full type definition
 */
import type {
  TransportEventStoreChunkedConfig,
  TransportEventStoreConfig,
  TransportEventStoreType,
} from '../storage/StorageTypes.ts';
export type {
  TransportEventStoreChunkedConfig,
  TransportEventStoreConfig,
  TransportEventStoreType,
};

/**
 * OAuth Provider configuration (when MCP server acts as OAuth provider)
 * @see ../auth/OAuthTypes.ts for full type definition
 */
import type { OAuthProviderConfig } from '../auth/OAuthTypes.ts';
export type { OAuthProviderConfig };

/**
 * OAuth Consumer configuration (for third-party API integration)
 * @see ../auth/OAuthTypes.ts for full type definition
 */
import type { OAuthConsumerConfig } from '../auth/OAuthTypes.ts';
export type { OAuthConsumerConfig };

/**
 * Session configuration
 */
export interface SessionConfig {
  maxAge: number; // Session timeout in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
  persistToDisk: boolean; // Enable session persistence
  encryptSessionData: boolean; // Enable session encryption
}

/**
 * Transport-specific configuration
 */
import type { HttpTransportConfig, StdioTransportConfig } from '../transport/TransportTypes.ts';
export type { HttpTransportConfig, StdioTransportConfig };

export interface TransportConfig {
  type: 'stdio' | 'http';
  http?: HttpTransportConfig;
  stdio?: StdioTransportConfig;
  session?: SessionConfig; // Added session configuration
}

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  enablePluginDiscovery?: boolean;
  pluginDirectory?: string;
  maxConcurrentWorkflows?: number;
  defaultTimeout?: number;
}

/**
 * MCP Server Instructions configuration
 */
export interface McpServerInstructionsConfig {
  instructionsContent: string;
  instructionsFilePath: string;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  enableEncryption?: boolean;
  encryptionKey?: string;
  sessionSecrets?: string[];
  cookieSettings?: {
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
  };
}

/**
 * Generic third-party integration configuration
 */
export interface ThirdPartyIntegrationConfig {
  name: string;
  baseUrl: string;
  oauth?: OAuthConsumerConfig;
  apiKey?: string;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  retryAttempts?: number;
  customHeaders?: Record<string, string>;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
  server: ServerConfig;
  transport: TransportConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  audit: AuditConfig;
  pluginManager: PluginManagerConfig;
  rateLimit: RateLimitConfig;
  oauthProvider?: OAuthProviderConfig;
  oauthConsumer?: OAuthConsumerConfig;
  workflows?: WorkflowConfig;
  security?: SecurityConfig;
  thirdPartyIntegrations?: ThirdPartyIntegrationConfig[];
  // Allow for custom configuration extensions
  [key: string]: unknown;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Environment variable mapping for configuration
 */
export interface EnvironmentMapping {
  [configPath: string]: {
    envVar: string;
    required?: boolean;
    defaultValue?: unknown;
    validator?: (value: string) => boolean;
    transformer?: (value: string) => unknown;
  };
}

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
  environment?: string;
  envFile?: string;
  envPrefix?: string;
  validateRequired?: boolean;
  allowUnknownKeys?: boolean;
  customMapping?: EnvironmentMapping;
}
