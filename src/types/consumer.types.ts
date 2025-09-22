/**
 * Consumer type definitions for bb-mcp-server library
 * 
 * Types and interfaces that library consumers need when building MCP servers.
 */

import type {
  AppConfig,
  ServerConfig,
  TransportConfig,
  StorageConfig,
  LoggingConfig,
  AuditConfig,
  OAuthProviderConfig,
  OAuthConsumerConfig,
} from '../lib/config/ConfigTypes.ts';

import type {
  SessionData,
  OAuthCredentials,
  KVStats,
} from '../lib/storage/StorageTypes.ts';

import type {
  Logger,
  LibraryConfig,
} from './library.types.ts';

/**
 * Configuration options for initializing the bb-mcp-server library
 */
export interface MCPServerLibraryConfig extends LibraryConfig {
  /**
   * Application configuration
   */
  config: AppConfig;
  
  /**
   * Custom storage path override
   */
  storagePath?: string;
  
  /**
   * Enable automatic cleanup of expired data
   */
  enableAutoCleanup?: boolean;
  
  /**
   * Custom cleanup interval in milliseconds
   */
  cleanupIntervalMs?: number;
}

/**
 * Options for creating MCP server instances
 */
export interface CreateServerOptions {
  /**
   * Server configuration
   */
  config: AppConfig;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Custom workflows to register
   */
  workflows?: WorkflowRegistration[];
  
  /**
   * OAuth provider configuration
   */
  oauthProvider?: OAuthProviderConfig;
  
  /**
   * OAuth consumer configuration for third-party APIs
   */
  oauthConsumer?: OAuthConsumerConfig;
}

/**
 * Workflow registration information
 */
export interface WorkflowRegistration {
  /**
   * Workflow name/identifier
   */
  name: string;
  
  /**
   * Workflow implementation class
   */
  implementation: WorkflowClass;
  
  /**
   * Workflow configuration options
   */
  options?: WorkflowOptions;
}

/**
 * Base workflow class that consumers must extend
 */
export interface WorkflowClass {
  new (...args: unknown[]): WorkflowInstance;
}

/**
 * Workflow instance interface
 */
export interface WorkflowInstance {
  /**
   * Workflow name
   */
  readonly name: string;
  
  /**
   * Workflow version
   */
  readonly version: string;
  
  /**
   * Workflow description
   */
  readonly description: string;
  
  /**
   * Execute the workflow
   */
  execute(params: unknown, context?: WorkflowContext): Promise<WorkflowResult>;
  
  /**
   * Validate workflow parameters (optional)
   */
  validate?(params: unknown): ValidationResult;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  /**
   * User ID if available
   */
  userId?: string;
  
  /**
   * Request ID for tracking
   */
  requestId?: string;
  
  /**
   * Logger instance
   */
  logger: Logger;
  
  /**
   * Additional context data
   */
  [key: string]: unknown;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  /**
   * Whether the workflow succeeded
   */
  success: boolean;
  
  /**
   * Result data if successful
   */
  data?: unknown;
  
  /**
   * Error information if failed
   */
  error?: string;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Workflow configuration options
 */
export interface WorkflowOptions {
  /**
   * Maximum execution timeout in milliseconds
   */
  timeout?: number;
  
  /**
   * Whether to enable audit logging for this workflow
   */
  enableAuditLogging?: boolean;
  
  /**
   * Custom validation schema
   */
  validationSchema?: Record<string, unknown>;
  
  /**
   * Required permissions/scopes
   */
  requiredScopes?: string[];
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  isValid: boolean;
  
  /**
   * Validation errors if any
   */
  errors: ValidationError[];
  
  /**
   * Validation warnings if any
   */
  warnings?: string[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /**
   * Field that failed validation
   */
  field: string;
  
  /**
   * Error message
   */
  message: string;
  
  /**
   * Error code
   */
  code: string;
  
  /**
   * The invalid value
   */
  value?: unknown;
}

/**
 * MCP tool registration options
 */
export interface MCPToolOptions {
  /**
   * Tool name
   */
  name: string;
  
  /**
   * Tool description
   */
  description: string;
  
  /**
   * Input schema for parameter validation
   */
  inputSchema: Record<string, unknown>;
  
  /**
   * Tool handler function
   */
  handler: MCPToolHandler;
  
  /**
   * Required authentication scopes
   */
  requiredScopes?: string[];
}

/**
 * MCP tool handler function type
 */
export type MCPToolHandler = (
  params: unknown,
  context: WorkflowContext
) => Promise<unknown>;

/**
 * Server statistics and health information
 */
export interface ServerStats {
  /**
   * Server uptime in milliseconds
   */
  uptime: number;
  
  /**
   * Active sessions count
   */
  activeSessions: number;
  
  /**
   * Total requests processed
   */
  totalRequests: number;
  
  /**
   * Storage statistics
   */
  storage: KVStats;
  
  /**
   * Memory usage information
   */
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  
  /**
   * Health status
   */
  health: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Event types that consumers can listen to
 */
export interface MCPServerEvents {
  /**
   * Server started successfully
   */
  'server:started': [];
  
  /**
   * Server stopped
   */
  'server:stopped': [];
  
  /**
   * New client connected
   */
  'client:connected': [sessionId: string];
  
  /**
   * Client disconnected
   */
  'client:disconnected': [sessionId: string];
  
  /**
   * Workflow executed
   */
  'workflow:executed': [workflowName: string, success: boolean, durationMs: number];
  
  /**
   * Error occurred
   */
  'error': [error: Error];
  
  /**
   * Authentication event
   */
  'auth:event': [userId: string, event: string, success: boolean];
}

/**
 * Export commonly used types from internal modules
 */
export type {
  AppConfig,
  ServerConfig,
  TransportConfig,
  StorageConfig,
  LoggingConfig,
  AuditConfig,
  OAuthProviderConfig,
  OAuthConsumerConfig,
  SessionData,
  OAuthCredentials,
  KVStats,
  Logger,
};
