/**
 * Storage-related type definitions for the bb-mcp-server library
 *
 * Defines interfaces for session management, credential storage, and KV operations.
 */

// Import TransportType for session compatibility
export type TransportType = 'http' | 'stdio';

/**
 * Generic KV operation options
 */
export interface KVSetOptions {
  expireIn?: number;
}

/**
 * Session data structure for transport sessions
 */
export interface SessionData {
  id: string;
  userId: string;
  clientId?: string;
  scopes: string[];
  transportType: TransportType; // Added for transport compatibility
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  metadata: Record<string, unknown>;
}

/**
 * OAuth credentials storage structure
 */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scopes: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Storage configuration options
 */
export interface StorageConfig {
  kvPath?: string;
  keyPrefix?: string[];
  enablePersistence?: boolean;
  cleanupInterval?: number;
}

/**
 * KV statistics for monitoring and debugging
 */
export interface KVStats {
  totalKeys: number;
  authKeys: number;
  oauthClientKeys: number;
  mcpAuthKeys: number;
  transportKeys: number;
  eventKeys: number;
  appKeys: number;
  kvPath: string;
  lastStatsUpdate: number;
}

/**
 * Key prefix organization for unified KV store
 * Made configurable for library consumers
 */
export interface KVPrefixes {
  // Authentication data
  AUTH: readonly string[];
  AUTH_USER_CREDENTIALS: readonly string[];
  AUTH_REQUESTS: readonly string[];

  // OAuth client registration data
  OAUTH_CLIENTS: readonly string[];
  OAUTH_CLIENT_REGISTRATIONS: readonly string[];

  // MCP OAuth flow data
  MCP_AUTH: readonly string[];
  MCP_AUTH_REQUESTS: readonly string[];
  MCP_AUTH_CODES: readonly string[];
  MCP_ACCESS_TOKENS: readonly string[];
  MCP_REFRESH_TOKENS: readonly string[];

  // Transport session data
  TRANSPORT: readonly string[];
  TRANSPORT_SESSIONS: readonly string[];
  TRANSPORT_USER_INDEX: readonly string[];

  // EventStore data
  EVENTS: readonly string[];
  EVENT_STREAMS: readonly string[];
  EVENT_METADATA: readonly string[];

  // Application metadata
  APP: readonly string[];
  APP_METRICS: readonly string[];
  APP_CONFIG: readonly string[];
}

/**
 * Default key prefixes (can be overridden by consumers)
 */
export const DEFAULT_KV_PREFIXES: KVPrefixes = {
  // Authentication data
  AUTH: ['auth'] as const,
  AUTH_USER_CREDENTIALS: ['auth', 'user_credentials'] as const,
  AUTH_REQUESTS: ['auth', 'auth_request'] as const,

  // OAuth client registration data
  OAUTH_CLIENTS: ['oauth_clients'] as const,
  OAUTH_CLIENT_REGISTRATIONS: ['oauth_clients', 'registrations'] as const,

  // MCP OAuth flow data
  MCP_AUTH: ['mcp_auth'] as const,
  MCP_AUTH_REQUESTS: ['mcp_auth', 'requests'] as const,
  MCP_AUTH_CODES: ['mcp_auth', 'codes'] as const,
  MCP_ACCESS_TOKENS: ['mcp_auth', 'tokens'] as const,
  MCP_REFRESH_TOKENS: ['mcp_auth', 'refresh_tokens'] as const,

  // Transport session data
  TRANSPORT: ['transport'] as const,
  TRANSPORT_SESSIONS: ['transport', 'session'] as const,
  TRANSPORT_USER_INDEX: ['transport', 'session_by_user'] as const,

  // EventStore data
  EVENTS: ['events'] as const,
  EVENT_STREAMS: ['events', 'stream'] as const,
  EVENT_METADATA: ['events', 'stream_metadata'] as const,

  // Application metadata
  APP: ['app'] as const,
  APP_METRICS: ['app', 'metrics'] as const,
  APP_CONFIG: ['app', 'config'] as const,
} as const;

/**
 * Configuration for KV Manager initialization
 */
export interface KVManagerConfig {
  kvPath?: string;
  prefixes?: Partial<KVPrefixes>;
}

export type TransportEventStoreType = 'simple' | 'chunked';
/**
 * Configuration for base TransportEventStore
 */
export interface TransportEventStoreConfig {
  // /* Enable chunked storage for large messages */
  // useChunkedStorage: boolean;
  /** Enable chunked storage for large messages */
  storageType: TransportEventStoreType;

  /** Monitoring and debugging */
  monitoring: {
    /** Enable detailed logging for storage operations */
    enableDebugLogging: boolean;
  };

  /** Maintenance and cleanup */
  maintenance: {
    /** Enable automatic cleanup of old events */
    enableAutoCleanup: boolean;
    /** Number of events to keep per stream */
    keepEventCount: number;
    /** Cleanup interval in milliseconds */
    cleanupIntervalMs: number;
  };
}

/**
 * Configuration for TransportEventStoreChunked (extends base config)
 */
export interface TransportEventStoreChunkedConfig extends TransportEventStoreConfig {
  /** Core chunking settings */
  chunking: {
    /** Maximum size per chunk in bytes (should be < 64KB) */
    maxChunkSize: number;
    /** Maximum total message size in bytes */
    maxMessageSize: number;
  };

  /** Compression configuration */
  compression: {
    /** Enable compression for large messages */
    enable: boolean;
    /** Compression threshold in bytes - messages smaller won't be compressed */
    threshold: number;
  };

  /** Extended monitoring for chunked operations */
  monitoring: {
    /** Enable detailed logging for storage operations */
    enableDebugLogging: boolean;
    /** Log compression statistics (chunked store only) */
    logCompressionStats: boolean;
  };
}
