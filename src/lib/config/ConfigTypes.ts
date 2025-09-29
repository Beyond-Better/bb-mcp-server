/**
 * Configuration type definitions for bb-mcp-server library
 *
 * Defines interfaces for server configuration, transport options, and
 * third-party integrations. Extracted and generalized from ActionStep
 * MCP Server configuration.
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
  format?: 'text' | 'json';
  file?: string;
}

/**
 * Audit logging configuration
 */
export interface AuditConfig {
  enabled: boolean;
  logAllApiCalls: boolean;
  logFile?: string;
  retentionDays?: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  burstLimit?: number;
  windowMs?: number;
}

/**
 * OAuth Provider configuration (when MCP server acts as OAuth provider)
 */
export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer?: string;
  enablePKCE?: boolean;
  enableDynamicRegistration?: boolean;
  tokenExpirationMs?: number;
  refreshTokenExpirationMs?: number;
}

/**
 * OAuth Consumer configuration (for third-party API integration)
 */
export interface OAuthConsumerConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes?: string[];
  additionalParams?: Record<string, string>;
}

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
export interface TransportConfig {
  type: 'stdio' | 'http';
  http?: {
    hostname: string; // Changed from 'host' to 'hostname'
    port: number;
    // Session management configuration (production critical)
    sessionTimeout: number; // Session timeout in milliseconds
    sessionCleanupInterval: number; // Cleanup interval in milliseconds
    maxConcurrentSessions: number;
    enableSessionPersistence: boolean;
    requestTimeout: number;
    maxRequestSize: number;
    enableCORS: boolean;
    corsOrigins: string[];
    preserveCompatibilityMode: boolean;
    allowInsecure: boolean; // Allow HTTP transport without OAuth provider (development only)
    // Optional transport persistence settings
    enableTransportPersistence?: boolean;
    sessionRestoreEnabled?: boolean;
    cors?: {
      enabled: boolean;
      origins: string[];
      methods: string[];
      headers: string[];
    };
    rateLimit?: RateLimitConfig;
    enableDnsRebindingProtection?: boolean;
    allowedHosts?: string[];
  };
  stdio?: {
    enableLogging: boolean; // Added missing property
    bufferSize: number;
    encoding: string;
  };
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
  envFile?: string;
  envPrefix?: string;
  validateRequired?: boolean;
  allowUnknownKeys?: boolean;
  customMapping?: EnvironmentMapping;
}
