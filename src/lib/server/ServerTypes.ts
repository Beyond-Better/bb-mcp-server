/**
 * Server Types - HTTP server type definitions and interfaces
 *
 * Comprehensive type definitions for the HTTP server components including
 * configuration, dependencies, request/response types, and integration interfaces.
 *
 * Provides type safety and documentation for all HTTP server components.
 */

import type { Logger } from '../../types/library.types.ts';
import type { OAuthProvider } from '../auth/OAuthProvider.ts';
import type { TransportManager } from '../transport/TransportManager.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';

// Re-export core server types for convenience
export type { HttpServerConfig, HttpServerDependencies } from './HttpServer.ts';
export type { APIConfig } from './APIRouter.ts';
export type { CORSConfig } from './CORSHandler.ts';

/**
 * HTTP request context for server operations
 */
export interface RequestContext {
  /** Request ID for tracking */
  requestId: string;
  /** Request start timestamp */
  startTime: number;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Query parameters */
  query: URLSearchParams;
  /** Request headers */
  headers: Headers;
  /** Client IP address */
  clientIP: string;
  /** User agent */
  userAgent?: string;
}

/**
 * Response metadata for logging and monitoring
 */
export interface ResponseMetadata {
  /** Response status code */
  status: number;
  /** Response size in bytes */
  size?: number;
  /** Response time in milliseconds */
  responseTime: number;
  /** Content type */
  contentType?: string;
  /** Cache status */
  cacheStatus?: 'hit' | 'miss' | 'bypass';
}

/**
 * Error information for structured error handling
 */
export interface ErrorInfo {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: string;
  /** Error category */
  category: 'client' | 'server' | 'network' | 'auth' | 'validation';
  /** Whether error is retryable */
  retryable: boolean;
  /** Error timestamp */
  timestamp: string;
}

/**
 * Endpoint registration information
 */
export interface EndpointInfo {
  /** Endpoint path pattern */
  path: string;
  /** Supported HTTP methods */
  methods: string[];
  /** Endpoint description */
  description: string;
  /** Whether endpoint requires authentication */
  requiresAuth: boolean;
  /** Rate limit configuration */
  rateLimit?: {
    requests: number;
    window: number; // seconds
  };
  /** Response content types */
  produces?: string[];
  /** Request content types accepted */
  consumes?: string[];
}

/**
 * Server metrics for monitoring
 */
export interface ServerMetrics {
  /** Server uptime in milliseconds */
  uptime: number;
  /** Request counts by status code */
  requests: {
    total: number;
    byStatus: Record<number, number>;
    byMethod: Record<string, number>;
    byPath: Record<string, number>;
  };
  /** Response time statistics */
  responseTime: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
  /** Memory usage */
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  /** Active connections */
  connections: {
    active: number;
    idle: number;
    total: number;
  };
  /** Error rates */
  errors: {
    total: number;
    rate: number; // errors per minute
    byType: Record<string, number>;
  };
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Individual component checks */
  checks: Record<string, {
    status: 'ok' | 'warn' | 'error';
    message?: string;
    responseTime?: number;
  }>;
  /** Check timestamp */
  timestamp: string;
  /** Check duration */
  duration: number;
}

/**
 * Rate limiting information
 */
export interface RateLimitInfo {
  /** Limit identifier */
  id: string;
  /** Maximum requests allowed */
  limit: number;
  /** Time window in seconds */
  window: number;
  /** Remaining requests */
  remaining: number;
  /** Reset timestamp */
  resetTime: number;
  /** Whether limit is exceeded */
  exceeded: boolean;
}

/**
 * Authentication context for requests
 */
export interface AuthContext {
  /** Whether request is authenticated */
  authenticated: boolean;
  /** User identifier */
  userId?: string;
  /** Client identifier */
  clientId?: string;
  /** Access token information */
  token?: {
    type: string;
    scope?: string;
    expiresAt?: number;
  };
  /** Authentication method used */
  method?: 'oauth' | 'apikey' | 'basic' | 'bearer';
}

/**
 * Server middleware function signature
 */
export type ServerMiddleware = (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>,
) => Promise<Response>;

/**
 * Route handler function signature
 */
export type RouteHandler = (
  request: Request,
  context: RequestContext,
  params: Record<string, string>,
) => Promise<Response>;

/**
 * Server event types for monitoring and hooks
 */
export interface ServerEvents {
  'server:start': { port: number; hostname: string };
  'server:stop': { reason?: string };
  'request:start': { context: RequestContext };
  'request:complete': { context: RequestContext; metadata: ResponseMetadata };
  'request:error': { context: RequestContext; error: ErrorInfo };
  'auth:success': { context: RequestContext; auth: AuthContext };
  'auth:failure': { context: RequestContext; reason: string };
  'ratelimit:exceeded': { context: RequestContext; limit: RateLimitInfo };
  'health:check': { result: HealthCheckResult };
}

/**
 * Server configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether configuration is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Configuration summary */
  summary: {
    endpoints: number;
    middlewares: number;
    features: string[];
  };
}

/**
 * Server initialization options
 */
export interface ServerInitOptions {
  /** Server configuration */
  config: {
    hostname: string;
    port: number;
    name: string;
    version: string;
    environment?: string;
  };
  /** Component dependencies */
  dependencies: {
    logger: Logger;
    oauthProvider: OAuthProvider;
    transportManager: TransportManager;
    workflowRegistry: WorkflowRegistry;
  };
  /** Optional features to enable */
  features?: {
    cors?: boolean;
    rateLimit?: boolean;
    metrics?: boolean;
    healthCheck?: boolean;
  };
  /** Custom middleware to register */
  middleware?: ServerMiddleware[];
  /** Custom routes to register */
  routes?: Record<string, RouteHandler>;
}

/**
 * Server factory function signature
 */
export type ServerFactory = (options: ServerInitOptions) => Promise<{
  start(): Promise<void>;
  stop(): Promise<void>;
  getMetrics(): ServerMetrics;
  getHealth(): Promise<HealthCheckResult>;
}>;

/**
 * Endpoint handler registry
 */
export interface EndpointRegistry {
  /** Register endpoint handler */
  register(
    path: string,
    methods: string[],
    handler: RouteHandler,
    info?: Partial<EndpointInfo>,
  ): void;

  /** Unregister endpoint */
  unregister(path: string, method?: string): boolean;

  /** Get registered endpoints */
  getEndpoints(): EndpointInfo[];

  /** Find handler for request */
  findHandler(
    path: string,
    method: string,
  ): {
    handler: RouteHandler;
    params: Record<string, string>;
    info: EndpointInfo;
  } | null;
}

/**
 * Request/response logging configuration
 */
export interface LoggingConfig {
  /** Log level for requests */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Include request headers */
  includeHeaders: boolean;
  /** Include request body (be careful with sensitive data) */
  includeBody: boolean;
  /** Include response headers */
  includeResponseHeaders: boolean;
  /** Maximum body size to log */
  maxBodySize: number;
  /** Sensitive headers to redact */
  sensitiveHeaders: string[];
  /** Request ID header name */
  requestIdHeader: string;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  /** Content Security Policy */
  csp?: string;
  /** HTTP Strict Transport Security */
  hsts?: {
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  /** X-Frame-Options */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
  /** X-Content-Type-Options */
  contentTypeOptions?: boolean;
  /** Referrer Policy */
  referrerPolicy?: string;
  /** Trusted proxies for IP detection */
  trustedProxies?: string[];
}

/**
 * Complete server configuration
 */
export interface CompleteServerConfig {
  /** Basic server settings */
  server: {
    hostname: string;
    port: number;
    name: string;
    version: string;
    environment: string;
  };

  /** API configuration */
  api: {
    version: string;
    basePath: string;
    documentation?: string;
  };

  /** CORS configuration */
  cors: {
    allowOrigin: string;
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    maxAge?: number;
    allowCredentials?: boolean;
  };

  /** Logging configuration */
  logging?: LoggingConfig;

  /** Security configuration */
  security?: SecurityConfig;

  /** Feature flags */
  features?: {
    oauth: boolean;
    mcp: boolean;
    metrics: boolean;
    healthCheck: boolean;
    rateLimit: boolean;
  };
}

/**
 * Server component status
 */
export interface ComponentStatus {
  /** Component name */
  name: string;
  /** Component status */
  status: 'active' | 'inactive' | 'error' | 'starting' | 'stopping';
  /** Status message */
  message?: string;
  /** Last status update */
  lastUpdate: string;
  /** Component version */
  version?: string;
  /** Component metrics */
  metrics?: Record<string, unknown>;
}

/**
 * Complete server status
 */
export interface ServerStatus {
  /** Server status */
  status: 'running' | 'starting' | 'stopping' | 'stopped' | 'error';
  /** Server start time */
  startTime: string;
  /** Server uptime */
  uptime: string;
  /** Component statuses */
  components: ComponentStatus[];
  /** Server metrics */
  metrics: ServerMetrics;
  /** Health check result */
  health: HealthCheckResult;
  /** Configuration summary */
  config: {
    hostname: string;
    port: number;
    version: string;
    environment: string;
    features: string[];
  };
}
