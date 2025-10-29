/**
 * Beyond MCP Server Type Definitions
 * Comprehensive type system for bb-mcp-server library
 *
 * Defines types for:
 * - Beyond MCP server configuration and dependencies
 * - Tool registration and validation
 * - Request context management
 * - MCP SDK integration
 * - Component interfaces
 */

import type {
  CallToolResult,
  //LoggingLevelSchema
} from 'mcp/types.js';
import type { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import type { ZodObject, ZodSchema } from 'zod';

// Import component types
import type { Logger, LogLevel } from '../utils/Logger.ts';
import type { AuditLogger } from '../utils/AuditLogger.ts';
import type { ConfigManager } from '../config/ConfigManager.ts';
import type { ErrorHandler } from '../utils/ErrorHandler.ts';
import type { ToolRegistry } from '../tools/ToolRegistry.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
//import type { WorkflowRegistryConfig } from '../types/WorkflowTypes.ts';
import type { TransportManager } from '../transport/TransportManager.ts';
import type { KVManager } from '../storage/KVManager.ts';
import type { OAuthProvider } from '../auth/OAuthProvider.ts';

/**
 * Beyond MCP Server Configuration
 * Defines how the Beyond MCP server should be configured
 */
export interface BeyondMcpServerConfig {
  server: {
    name: string;
    version: string;
    title?: string;
    description: string;
  };
  capabilities?: {
    tools?: Record<PropertyKey, never>;
    logging?: Record<PropertyKey, never>;
    prompts?: Record<PropertyKey, never>;
    resources?: { subscribe?: boolean };
    completions?: Record<PropertyKey, never>;
  };
  mcpServerInstructions?: string;
  transport?: TransportConfig;
  //workflows?: WorkflowRegistryConfig;
  //tools?: ToolRegistryConfig;
}

/**
 * Transport Configuration
 */
export interface TransportConfig {
  type: 'stdio' | 'http';
  port?: number;
  host?: string;
  cors?: {
    enabled: boolean;
    origins?: string[];
    credentials?: boolean;
  };
}

/**
 * Beyond MCP Server Dependencies
 * All components that the Beyond MCP server needs from previous phases
 */
export interface BeyondMcpServerDependencies {
  logger: Logger;
  auditLogger: AuditLogger;
  configManager: ConfigManager;
  errorHandler: ErrorHandler;
  toolRegistry: ToolRegistry;
  workflowRegistry: WorkflowRegistry;
  transportManager: TransportManager;
  kvManager?: KVManager;
  oauthProvider?: OAuthProvider;
}

/**
 * Beyond MCP Request Context
 */
export interface BeyondMcpRequestContext {
  authenticatedUserId: string;
  clientId: string;
  scopes: string[];
  requestId: string;
  sessionId?: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

/**
 * Create Context Data
 * Used for creating new request contexts
 */
export interface CreateContextData {
  authenticatedUserId: string;
  clientId: string;
  scopes?: string[];
  requestId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool Definition with Zod Integration
 */
// deno-lint-ignore no-explicit-any
export interface ToolDefinition<T extends Record<string, ZodSchema> = any> {
  title: string;
  description: string;
  inputSchema: T;
  examples?: ToolExample[];
  tags?: string[];
  category?: string;
  version?: string;
}

/**
 * Tool Example
 */
export interface ToolExample {
  name: string;
  description: string;
  input: unknown;
  expectedOutput?: string;
}

/**
 * Tool Handler with Strong Typing
 */
// deno-lint-ignore no-explicit-any
export type ToolHandler<T extends Record<string, ZodSchema> = any> = (
  args: InferZodSchema<T>,
  extra?: ToolCallExtra,
) => Promise<CallToolResult>;

/**
 * Extract types from Zod schema
 * Utility type for getting properly typed args from inputSchema
 */
// deno-lint-ignore no-explicit-any
export type InferZodSchema<T extends Record<string, ZodSchema> = any> = {
  [K in keyof T]: T[K] extends ZodSchema<infer U> ? U : never;
};

/**
 * Tool Call Metadata
 */
export interface ToolCallExtra {
  _meta?: Record<string, unknown>;
  sessionId?: string;
  requestId?: string;
  requestInfo?: unknown;
}

/**
 * Registered Tool Information
 */
// deno-lint-ignore no-explicit-any
export interface RegisteredTool<T extends Record<string, ZodSchema> = any> {
  name: string;
  definition: ToolDefinition<T>;
  handler: ToolHandler<T>;
  // deno-lint-ignore no-explicit-any
  validator: ZodObject<any>;
  registeredAt: Date;
  callCount?: number;
  lastCalled?: Date;
  averageExecutionTime?: number;
}

/**
 * Tool Registration for Batch Operations
 *
 * Generic type parameter T allows proper type inference from inputSchema to handler args.
 * Defaults to 'any' for backward compatibility.
 */
// deno-lint-ignore no-explicit-any
export interface ToolRegistration<T extends Record<string, ZodSchema> = any> {
  name: string;
  definition: ToolDefinition<T>;
  handler: ToolHandler<T>;
  options?: ToolRegistrationOptions;
}

/**
 * Validation Result
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Tool Registry Dependencies
 */
export interface ToolRegistryDependencies {
  logger: Logger;
  errorHandler: ErrorHandler;
  sdkMcpServer?: SdkMcpServer;
}

/**
 * Core Tools Dependencies
 */
export interface CoreToolsDependencies {
  logger: Logger;
  sdkMcpServer: SdkMcpServer; // SdkMcpServer from mcp/server/mcp.js
  auditLogger: AuditLogger;
}

/**
 * Tool Dependencies for Plugin Tool Modules
 *
 * Standard dependencies passed to tool modules from plugin initialization.
 * Provides type-safe access to core server components for tool implementations.
 */
export interface ToolDependencies {
  logger: Logger;
  configManager?: ConfigManager;
  auditLogger?: AuditLogger;
  errorHandler?: ErrorHandler;
  kvManager?: KVManager;
  // deno-lint-ignore no-explicit-any
  [key: string]: any; // Allow custom dependencies for extensibility
}

/**
 * MCP SDK API Types
 */
export interface CreateMessageRequest {
  _meta?: Record<string, unknown>;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface CreateMessageResult {
  content?: {
    type: 'text';
    text: string;
  }[];
  model?: string;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ElicitInputRequest {
  message: string;
  requestedSchema: unknown;
}

/**
 * Result from MCP elicitation request
 *
 * IMPORTANT: When elicitInput throws an error, consumers should handle it
 * explicitly rather than assuming a rejection response.
 *
 * To safely check for approval, use WorkflowBase.isElicitationApproved()
 * instead of checking Object.keys(result).length which can incorrectly
 * treat rejection as approval.
 */
export interface ElicitInputResult {
  /**
   * User's decision
   * - 'accept': User approved the request
   * - 'reject': User declined the request (mapped from MCP SDK's 'decline')
   */
  action: 'accept' | 'reject';
  /**
   * Optional content provided by the user
   */
  content?: unknown;
}

/**
 * Logging level for notifications
 */
export type LoggingLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency'; // taken from LoggingLevelSchema in MCP SDK

/**
 * Send notification (logging message) request
 */
export interface SendNotificationRequest {
  /**
   * The severity of this log message.
   */
  level: LoggingLevel;
  /**
   * An optional name of the logger issuing this message.
   */
  logger?: string;
  /**
   * The data to be logged, such as a string message or an object. Any JSON serializable type is allowed here.
   */
  data: unknown;
}

export interface SendNotificationProgressRequest {
  progress: number;
  progressToken?: string | number; // Required by MCP spec for client association
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Tool Statistics and Monitoring
 */
export interface ToolStats {
  name: string;
  callCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  lastCalled?: Date;
  errorCount: number;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export interface ToolRegistryStats {
  totalTools: number;
  totalCalls: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  errorRate: number;
  topTools: Array<{
    name: string;
    callCount: number;
    averageTime: number;
  }>;
}

/**
 * Schema Validation Types
 */
export interface SchemaValidationError {
  path: string[];
  message: string;
  code: string;
  expected?: string;
  received?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
  data?: unknown;
}

/**
 * Tool Plugin Interface (Future)
 */
export interface ToolPlugin {
  name: string;
  version: string;
  description: string;
  tools: ToolRegistration[];
  dependencies?: string[];
  // deno-lint-ignore no-explicit-any
  initialize?(server: any): Promise<void>; // BeyondMcpServer
  cleanup?(): Promise<void>;
}

/**
 * Server Lifecycle States
 */
export type ServerState =
  | 'uninitialized'
  | 'initializing'
  | 'initialized'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Server Metrics
 */
export interface ServerMetrics {
  startTime: Date;
  uptime: number;
  requestCount: number;
  errorCount: number;
  toolExecutions: number;
  memoryUsage: {
    used: number;
    total: number;
    heap: number;
  };
  transport: {
    type: 'stdio' | 'http';
    connections?: number;
    requests?: number;
  };
}

/**
 * Error Types
 */
export interface BeyondMcpError extends Error {
  code: string;
  context?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Component Status
 */
export interface ComponentStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  metrics?: Record<string, number>;
}

/**
 * Health Check Result
 */
export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: ComponentStatus[];
  timestamp: Date;
  uptime: number;
}

/**
 * Configuration Validation
 */
export interface MCPConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config?: BeyondMcpServerConfig;
}

/**
 * Tool Context for Execution Tracking
 */
export interface ToolExecutionContext {
  toolName: string;
  startTime: number;
  endTime?: number;
  success?: boolean;
  error?: Error;
  args: Record<string, unknown>;
  result?: CallToolResult;
  requestContext?: BeyondMcpRequestContext;
}

/**
 * Audit Event Types
 */
export interface AuditEvent {
  timestamp: string;
  event: string;
  severity: 'info' | 'warn' | 'error';
  userId?: string;
  clientId?: string;
  requestId?: string;
  details: Record<string, unknown>;
}

/**
 * Rate Limiting Types
 */
export interface MCPRateLimitInfo {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

/**
 * Session Types
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  clientId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Authentication Types
 */
export interface AuthenticationInfo {
  authenticated: boolean;
  userId?: string;
  clientId?: string;
  scopes?: string[];
  expiresAt?: Date;
  tokenInfo?: {
    type: 'bearer' | 'oauth';
    expiresAt: Date;
    scopes: string[];
  };
}

// Re-export LogLevel from Logger for convenience
/**
 * Tool handler modes for registration
 */
export enum ToolHandlerMode {
  MANAGED = 'managed', // Current complex validation/error handling (default)
  NATIVE = 'native', // Direct registration, tool handles own validation
}

/**
 * Tool naming modes for workflow tools
 */
export enum WorkflowToolNaming {
  SIMPLE = 'simple', // execute_workflow, get_schema_for_workflow
  NAMESPACED = 'namespaced', // execute_workflow_$name, get_schema_for_workflow_$name
  CUSTOM = 'custom', // Completely custom tool names
}

/**
 * Tool registration options
 */
export interface ToolRegistrationOptions {
  handlerMode?: ToolHandlerMode;
  // Additional options can be added here
}

/**
 * Tool registration configuration
 */
export interface ToolRegistrationConfig {
  workflowTools: {
    enabled: boolean;
    naming: WorkflowToolNaming;
    customNames?: {
      executeWorkflow?: string;
      getSchemaWorkflow?: string;
    };
    executeWorkflow: {
      enabled: boolean;
    };
    getSchemaWorkflow: {
      enabled: boolean;
    };
  };
  defaultHandlerMode: ToolHandlerMode;
}

export type { LogLevel };
