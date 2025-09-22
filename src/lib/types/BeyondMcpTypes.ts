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

import type { CallToolResult } from 'mcp/types.js';
import { type ZodSchema, type ZodObject } from 'zod';

// Import component types
import type { Logger, LogLevel } from '../utils/Logger.ts';
import type { AuditLogger } from '../utils/AuditLogger.ts';
import type { ConfigManager } from '../config/ConfigManager.ts';
import type { ErrorHandler } from '../utils/ErrorHandler.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import type { WorkflowRegistryConfig } from '../workflows/WorkflowTypes.ts';
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
    tools?: {};
    logging?: {};
    prompts?: {};
    resources?: { subscribe?: boolean };
    completions?: {};
  };
  instructions?: string;
  transport?: TransportConfig;
  workflows?: WorkflowRegistryConfig;
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
  workflowRegistry: WorkflowRegistry;
  transportManager: TransportManager;
  kvManager?: KVManager;
  oauthProvider?: OAuthProvider;
}

/**
 * Beyond MCP Request Context
 * PRESERVED: Exact interface from ActionStepMCPServer
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
export interface ToolDefinition<T extends Record<string, ZodSchema>> {
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
export type ToolHandler<T extends Record<string, ZodSchema>> = (
  args: InferZodSchema<T>,
  extra?: ToolCallExtra
) => Promise<CallToolResult>;

/**
 * Extract types from Zod schema
 */
type InferZodSchema<T extends Record<string, ZodSchema>> = {
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
export interface RegisteredTool {
  name: string;
  definition: ToolDefinition<any>;
  handler: ToolHandler<any>;
  validator: ZodObject<any>;
  registeredAt: Date;
  callCount?: number;
  lastCalled?: Date;
  averageExecutionTime?: number;
}

/**
 * Tool Registration for Batch Operations
 */
export interface ToolRegistration {
  name: string;
  definition: ToolDefinition<any>;
  handler: ToolHandler<any>;
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
}

/**
 * Core Tools Dependencies
 */
export interface CoreToolsDependencies {
  logger: Logger;
  sdkMcpServer: any; // SdkMcpServer from mcp/server/mcp.js
  auditLogger: AuditLogger;
}

/**
 * MCP SDK API Types
 * PRESERVED: Exact interfaces from ActionStepMCPServer
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

export interface ElicitInputResult {
  action: 'accept' | 'reject';
  content?: unknown;
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
  initialize?(server: any): Promise<void>; // BeyondMcpServer
  cleanup?(): Promise<void>;
}

/**
 * Tool Registry Interface
 * Defines the interface that ToolRegistry must implement
 */
export interface ToolRegistry {
  registerTool<T extends Record<string, ZodSchema>>(
    name: string,
    definition: ToolDefinition<T>,
    handler: ToolHandler<T>
  ): void;
  
  validateToolInput(
    toolName: string,
    input: unknown
  ): Promise<ValidationResult<any>>;
  
  getTool(name: string): RegisteredTool | undefined;
  getTools(): RegisteredTool[];
  getToolNames(): string[];
  getToolCount(): number;
  getToolsByCategory(category: string): RegisteredTool[];
  getToolSchema(name: string): ZodObject<any> | undefined;
  getToolDefinition(name: string): ToolDefinition<any> | undefined;
  getToolStats(name: string): {
    callCount: number;
    lastCalled?: Date;
    averageExecutionTime: number;
  } | undefined;
  getRegistryStats(): {
    totalTools: number;
    totalCalls: number;
    averageExecutionTime: number;
    toolsByCategory: Record<string, number>;
    mostUsedTools: Array<{ name: string; callCount: number }>;
  };
  
  updateToolStats(toolName: string, executionTimeMs: number): void;
  testToolValidation(name: string, input: unknown): Promise<ValidationResult<any>>;
  clear(): void;
  removeTool(name: string): boolean;
}

/**
 * Server Lifecycle States
 */
export type ServerState = 'uninitialized' | 'initializing' | 'initialized' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

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
export interface ConfigValidationResult {
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
export interface RateLimitInfo {
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
export type { LogLevel };