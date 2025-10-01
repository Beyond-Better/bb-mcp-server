/**
 * Transport Types for bb-mcp-server
 * Comprehensive type definitions for transport layer
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import type { Logger } from '../utils/Logger.ts';
import type { KVManager } from '../storage/KVManager.ts';
import type { SessionStore } from '../storage/SessionStore.ts';
import type { TransportEventStore } from '../storage/TransportEventStore.ts';
import type { TransportEventStoreChunked } from '../storage/TransportEventStoreChunked.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';

// Core transport interfaces
export interface Transport {
  readonly type: TransportType;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  getMetrics(): TransportMetrics;
}

export type TransportType = 'http' | 'stdio';

// Configuration interfaces
export interface TransportConfig {
  type: TransportType;
  http?: HttpTransportConfig;
  stdio?: StdioTransportConfig;
  session?: SessionConfig;
  eventStore?: EventStoreConfig;
}

export interface HttpTransportConfig {
  hostname: string;
  port: number;
  sessionTimeout: number; // default: 30 minutes
  maxConcurrentSessions: number; // default: 1000
  enableSessionPersistence: boolean; // default: true
  sessionCleanupInterval: number; // default: 5 minutes
  requestTimeout: number; // default: 30 seconds
  maxRequestSize: number; // default: 1MB
  enableCORS: boolean; // default: true
  corsOrigins: string[]; // default: ['*']

  // 🚨 Compatibility configuration - DO NOT DISABLE
  preserveCompatibilityMode: boolean; // default: true - CRITICAL FOR MCP SDK
  enableTransportPersistence?: boolean;
  sessionRestoreEnabled?: boolean;

  // 🔒 Authentication configuration
  enableAuthentication?: boolean; // Auto-enabled if oauthProvider available
  skipAuthentication?: boolean; // Skip auth even if OAuth components available  
  requireAuthentication?: boolean; // Require auth for all endpoints (except open endpoints)
}

export interface StdioTransportConfig {
  enableLogging: boolean; // default: true
  bufferSize: number; // default: 8192
  encoding: string; // default: 'utf8'
  
  // 🔒 Authentication configuration (discouraged by MCP spec)
  enableAuthentication?: boolean; // STDIO SHOULD NOT use OAuth per MCP spec
  skipAuthentication?: boolean; // Skip auth even if OAuth components available
}

export interface SessionConfig {
  maxAge: number; // default: 30 minutes
  cleanupInterval: number; // default: 5 minutes
  persistToDisk: boolean; // default: true
  encryptSessionData: boolean; // default: false
}

export interface EventStoreConfig {
  enableEventLogging: boolean; // default: true
  maxEventsInMemory: number; // default: 1000
  eventRetentionDays: number; // default: 7
}

// Request/Response types for MCP
export interface MCPRequest {
  id: string | number;
  method: string;
  params?: any;
  jsonrpc: '2.0';
}

export interface MCPResponse {
  id: string | number;
  result?: any;
  error?: MCPError;
  jsonrpc: '2.0';
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// Session types
export interface SessionData {
  id: string;
  userId: string;
  clientId?: string;
  scopes: string[];
  transportType: TransportType;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  metadata: Record<string, any>;
}

export interface CreateSessionData {
  userId?: string;
  clientId?: string;
  scopes?: string[];
  metadata?: Record<string, any>;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: SessionData;
  reason?: 'session_not_found' | 'session_expired' | 'invalid_transport';
}

// Context types
export interface RequestContextData {
  requestId: string | undefined;
  sessionId: string | undefined;
  transport: TransportType;
  mcpRequest: MCPRequest;
  authenticatedUserId: string | undefined;
  clientId: string | undefined;
  scopes: string[] | undefined;
  httpRequest: Request | undefined;
  sessionData: SessionData | undefined;
  metadata: Record<string, any> | undefined;
}

export interface RequestContextLogData {
  requestId: string;
  sessionId: string | undefined;
  transport: TransportType;
  authenticatedUserId: string | undefined;
  clientId: string | undefined;
  scopes: string[];
  elapsedMs: number;
  metadata: Record<string, any>;
}

// Beyond MCP Authentication Context (from MCPRequestHandler)
export interface BeyondMcpAuthContext {
  authenticatedUserId: string;
  clientId: string;
  scopes: string[];
  requestId: string;
}

// Event types
export interface TransportEvent {
  type: TransportEventType;
  transport: TransportType;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  requestId?: string;
  sessionId?: string;
  data?: any;
  error?: Error;
}

export type TransportEventType =
  | 'request_received'
  | 'request_processed'
  | 'request_error'
  | 'session_created'
  | 'session_expired'
  | 'session_cleanup'
  | 'transport_started'
  | 'transport_stopped'
  | 'connection_established'
  | 'connection_lost';

export interface StoredTransportEvent extends TransportEvent {
  id: string;
  timestamp: number;
  stored_at: string;
}

// Metrics types
export interface TransportMetrics {
  transport: TransportType;
  uptime: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  sessions?: {
    active: number;
    total: number;
    expired: number;
  };
}

export interface HttpTransportMetrics extends TransportMetrics {
  sessions: {
    active: number;
    total: number;
    expired: number;
    averageSessionDuration: number;
  };
  http: {
    connectionsOpen: number;
    requestsPerSecond: number;
    averageRequestSize: number;
  };
}

export interface StdioTransportMetrics extends TransportMetrics {
  stdio: {
    messagesReceived: number;
    messagesSent: number;
    bytesReceived: number;
    bytesSent: number;
  };
}

// Validation types
export interface TransportValidationResult {
  valid: boolean;
  errors: TransportValidationError[];
}

export interface TransportValidationError {
  field: string;
  message: string;
  code: string;
}

// Filter types for events
export interface EventFilter {
  type?: TransportEventType;
  transport?: TransportType;
  level?: string;
  since?: number;
  until?: number;
  sessionId?: string;
  requestId?: string;
}

export interface EventStats {
  total: number;
  byType: Record<TransportEventType, number>;
  byTransport: Record<TransportType, number>;
  errors: number;
  timeRange: {
    since: number;
    until: number;
  };
}

export interface SessionStats {
  active: number;
  total: number;
  expired: number;
  averageDuration: number;
  oldestActive: number;
  newestActive: number;
}

// Transport dependencies (injected from previous phases)
export interface TransportDependencies {
  logger: Logger;
  kvManager: KVManager;
  sessionStore: SessionStore;
  eventStore: TransportEventStore | TransportEventStoreChunked;

  // 🔒 SECURITY: OAuth authentication components (optional)
  oauthProvider?: any; // OAuthProvider for MCP token validation
  oauthConsumer?: any; // OAuthConsumer for third-party authentication
  thirdPartyApiClient?: any; // Third-party API client for token refresh
}

// Authentication result (from OAuth integration)
export interface AuthenticationResult {
  authorized: boolean;
  clientId?: string;
  userId?: string;
  scope?: string[];
  error?: string;
  errorCode?: string;
  actionTaken?: string;
}

// SSE Stream interface (for compatibility layer)
export interface SSEStreamCapture {
  forceComplete(): void;
  isSSE(): boolean;
  isResponseEnded(): boolean;
}
