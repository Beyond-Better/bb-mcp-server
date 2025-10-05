/**
 * HTTP Server - Core HTTP server implementation
 *
 * Orchestrates all HTTP endpoints and middleware while delegating to specialized handlers.
 * This is the main HTTP server extracted from the original HttpServer.ts, focusing on
 * request routing and orchestration rather than business logic implementation.
 *
 * Split into focused components:
 * - OAuthEndpoints.ts - OAuth HTTP endpoints
 * - APIRouter.ts - API routing system
 * - StatusEndpoints.ts - Status and metrics endpoints
 * - CORSHandler.ts - CORS management
 * - ErrorPages.ts - Error page generation
 */

import type { Logger } from '../../types/library.types.ts';
import type { TransportManager } from '../transport/TransportManager.ts';
import type { OAuthProvider } from '../auth/OAuthProvider.ts';
import type { OAuthConsumer } from '../auth/OAuthConsumer.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import { OAuthEndpoints } from './OAuthEndpoints.ts';
import { BeyondMcpServer } from './BeyondMcpServer.ts';
import { APIRouter } from './APIRouter.ts';
//import { StatusEndpoints } from './StatusEndpoints.ts';
import { CORSHandler } from './CORSHandler.ts';
import { ErrorPages } from './ErrorPages.ts';
import { reconstructOriginalUrl } from '../utils/UrlUtils.ts';

/**
 * HTTP server configuration
 */
export interface HttpServerConfig {
  /** Server hostname */
  hostname: string;
  /** Server port */
  port: number;
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Environment */
  environment?: string;
  /** CORS configuration */
  cors: {
    allowOrigins: string[];
  };
  /** API configuration */
  api: {
    version: string;
    basePath: string;
  };
}

/**
 * Dependencies required by HttpServer
 */
export interface HttpServerDependencies {
  /** Logger for request logging */
  logger: Logger;
  /** BeyondMcpServer for Auth Context */
  beyondMcpServer: BeyondMcpServer;
  /** Transport manager for MCP endpoint */
  transportManager: TransportManager;
  /** OAuth provider for OAuth endpoints */
  oauthProvider: OAuthProvider;
  /** OAuth consumer for third-party OAuth flows (optional) */
  oauthConsumer?: OAuthConsumer;
  /** Workflow registry for status endpoints */
  workflowRegistry: WorkflowRegistry;
  /** Server configuration */
  httpServerConfig: HttpServerConfig;
}

/**
 * Core HTTP server implementation
 *
 * Orchestrates all HTTP endpoints and middleware while delegating business logic
 * to specialized handlers. This maintains clean separation between HTTP transport
 * concerns and business logic implementation.
 */
export class HttpServer {
  private server: Deno.HttpServer | undefined;
  private abortController = new AbortController();
  private httpServerConfig: HttpServerConfig;
  private logger: Logger;
  private startTime: Date;

  // Endpoint handlers (injected)
  private oauthEndpoints: OAuthEndpoints;
  private apiRouter: APIRouter;
  //private statusEndpoints: StatusEndpoints; // only used in APIRouter
  private corsHandler: CORSHandler;
  private errorPages: ErrorPages;

  // Integration components
  private beyondMcpServer: BeyondMcpServer;
  private transportManager: TransportManager;
  //private oauthProvider: OAuthProvider; // not passed down anywhere

  constructor(dependencies: HttpServerDependencies) {
    this.httpServerConfig = dependencies.httpServerConfig;
    this.logger = dependencies.logger;
    this.startTime = new Date();

    // Initialize endpoint handlers
    this.oauthEndpoints = new OAuthEndpoints(dependencies);
    this.apiRouter = new APIRouter(this.httpServerConfig.api, dependencies);
    //this.statusEndpoints = new StatusEndpoints(dependencies, this.startTime); // only used in APIRouter
    this.corsHandler = new CORSHandler(this.httpServerConfig.cors);
    this.errorPages = new ErrorPages(this.httpServerConfig);

    // Integration components
    this.beyondMcpServer = dependencies.beyondMcpServer;
    this.transportManager = dependencies.transportManager;
    //this.oauthProvider = dependencies.oauthProvider; // not passed down anywhere

    this.logger.info('HttpServer: Initialized', {
      hostname: this.httpServerConfig.hostname,
      port: this.httpServerConfig.port,
      name: this.httpServerConfig.name,
      version: this.httpServerConfig.version,
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    this.server = Deno.serve({
      port: this.httpServerConfig.port,
      hostname: this.httpServerConfig.hostname,
      signal: this.abortController.signal,
      onListen: ({ port, hostname }) => {
        this.logger.info(`HTTP server running on http://${hostname}:${port}`);
      },
    }, (request: Request) => this.handleRequest(request));

    this.server.finished.then(() => this.logger.info('HTTP server closed'));
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.abortController.abort('stopping server');
      this.server = undefined;
      this.logger.info('HTTP server stopped');
    }
  }

  /**
   * Main request handler with routing
   */
  private async handleRequest(request: Request): Promise<Response> {
    const url = reconstructOriginalUrl(request);
    const path = url.pathname;
    const method = request.method;

    this.logger.debug(`HTTP request: ${method} ${path}`);

    try {
      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return this.corsHandler.handlePreflight(request);
      }

      // Route request to appropriate handler
      const response = await this.routeRequest(request, path, method);

      // Add CORS headers
      return this.corsHandler.addCORSHeaders(response);
    } catch (error) {
      this.logger.error(
        'HTTP request error:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.corsHandler.addCORSHeaders(
        this.errorPages.generateErrorResponse(
          error instanceof Error ? error : new Error(String(error)),
          500,
        ),
      );
    }
  }

  /**
   * Request routing
   */
  private async routeRequest(request: Request, path: string, method: string): Promise<Response> {
    // OAuth endpoints
    if (this.isOAuthEndpoint(path)) {
      return await this.oauthEndpoints.handleRequest(request, path, method);
    }

    // API endpoints
    if (path.startsWith('/api/v1/')) {
      return await this.apiRouter.handleRequest(request, path.slice(8), method);
    }

    // Well-known endpoints
    if (path.startsWith('/.well-known/')) {
      return await this.oauthEndpoints.handleWellKnown(request, path.slice(13), method);
    }

    // MCP transport endpoint
    if (path === '/mcp') {
      return await this.handleMCPEndpoint(request);
    }

    // Root endpoint
    if (path === '/' && method === 'GET') {
      return await this.handleRoot();
    }

    // Legacy health endpoint
    if (path === '/health' && method === 'GET') {
      return await this.handleLegacyHealth();
    }

    // 404 for unknown endpoints
    return this.errorPages.generateNotFoundResponse(path);
  }

  /**
   * Check if path is an OAuth endpoint
   */
  private isOAuthEndpoint(path: string): boolean {
    const oauthPaths = [
      '/authorize',
      '/token',
      '/register',
      '/callback',
      '/oauth/callback',
      '/auth/callback',
      // Support API-versioned callback paths
      '/api/v1/auth/callback',
      '/api/v1/oauth/callback',
    ];
    return oauthPaths.includes(path);
  }

  /**
   * MCP endpoint integration
   */
  private async handleMCPEndpoint(request: Request): Promise<Response> {
    return await this.transportManager.handleHttpRequest(request, this.beyondMcpServer);
  }

  /**
   * Handle root endpoint
   */
  private async handleRoot(): Promise<Response> {
    const info = {
      name: this.httpServerConfig.name,
      version: this.httpServerConfig.version,
      description: 'MCP Server HTTP API',
      api: {
        version: this.httpServerConfig.api.version,
        base_url: this.httpServerConfig.api.basePath,
        endpoints: {
          auth: `${this.httpServerConfig.api.basePath}/auth`,
          status: `${this.httpServerConfig.api.basePath}/status`,
          metrics: `${this.httpServerConfig.api.basePath}/metrics`,
          workflows: `${this.httpServerConfig.api.basePath}/workflows`,
        },
      },
      oauth2: {
        well_known: '/.well-known/oauth-authorization-server',
        endpoints: {
          authorize: '/authorize',
          token: '/token',
          register: '/register',
        },
      },
      mcp: {
        endpoints: {
          mcp: '/mcp',
        },
      },
    };

    return new Response(JSON.stringify(info, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle legacy health endpoint
   */
  private async handleLegacyHealth(): Promise<Response> {
    const status = {
      status: 'healthy',
      server: 'http-server',
      timestamp: new Date().toISOString(),
      version: this.httpServerConfig.version,
    };

    return new Response(JSON.stringify(status, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get server metrics for monitoring
   */
  getMetrics(): {
    uptime: { seconds: number; human: string };
    started_at: string;
    endpoints: { oauth: unknown; mcp: unknown };
  } {
    const uptime = performance.now() - this.startTime.getTime();

    return {
      uptime: {
        seconds: Math.floor(uptime / 1000),
        human: this.formatUptime(uptime),
      },
      started_at: this.startTime.toISOString(),
      endpoints: {
        oauth: this.oauthEndpoints.getMetrics?.() || {},
        mcp: this.transportManager.getMetrics?.() || {},
      },
    };
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
