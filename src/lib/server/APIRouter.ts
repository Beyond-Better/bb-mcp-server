/**
 * API Router - HTTP API routing and versioning system
 *
 * Handles /api/v1/* endpoints with extensible routing for auth, status, metrics,
 * and workflow endpoints. Provides clean API structure and delegation to specialized handlers.
 */

import type { Logger } from '../../types/library.types.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import { StatusEndpoints } from './StatusEndpoints.ts';
import type { HttpServerDependencies } from './HttpServer.ts';
import { reconstructOriginalUrl } from '../utils/UrlUtils.ts';

/**
 * API configuration
 */
export interface APIConfig {
  /** API version */
  version: string;
  /** Base path for API */
  basePath: string;
}

/**
 * API routing and versioning system
 *
 * Handles /api/v1/* endpoints with clean routing architecture.
 * Delegates to specialized handlers while maintaining API structure.
 */
export class APIRouter {
  private config: APIConfig;
  private logger: Logger;
  private statusEndpoints: StatusEndpoints;
  private workflowRegistry: WorkflowRegistry;
  private dependencies: HttpServerDependencies;

  constructor(config: APIConfig, dependencies: HttpServerDependencies) {
    this.config = config;
    this.logger = dependencies.logger;
    this.statusEndpoints = new StatusEndpoints(dependencies, new Date());
    this.workflowRegistry = dependencies.workflowRegistry;
    this.dependencies = dependencies;

    this.logger.info('APIRouter: Initialized', {
      version: this.config.version,
      basePath: this.config.basePath,
    });
  }

  /**
   * Handle API requests
   */
  async handleRequest(request: Request, path: string, method: string): Promise<Response> {
    // Remove any leading slash from path
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const segments = cleanPath.split('/').filter((s) => s.length > 0);

    this.logger.debug(`APIRouter: Routing ${method} /${cleanPath}`, {
      segments: segments.length,
      resource: segments[0] || 'root',
    });

    if (segments.length === 0) {
      return await this.handleAPIRoot();
    }

    const [resource, ...rest] = segments;

    switch (resource) {
      case 'auth':
        return await this.handleAuthResource(request, rest, method);

      case 'status':
        return await this.statusEndpoints.handleRequest(request, rest, method);

      case 'metrics':
        return await this.handleMetricsResource(request, rest, method);

      case 'workflows':
        return await this.handleWorkflowsResource(request, rest, method);

      default:
        return this.jsonResponse({
          error: {
            message: `API resource '${resource}' not found`,
            status: 404,
          },
        }, 404);
    }
  }

  /**
   * Handle API root endpoint
   */
  private async handleAPIRoot(): Promise<Response> {
    const apiInfo = {
      version: this.config.version,
      description: 'MCP Server API v1',
      resources: {
        auth: 'Authentication endpoints',
        status: 'Server status and health checks',
        metrics: 'Server metrics and statistics',
        workflows: 'Available workflows information',
      },
      endpoints: {
        auth: `${this.config.basePath}/auth`,
        status: `${this.config.basePath}/status`,
        metrics: `${this.config.basePath}/metrics`,
        workflows: `${this.config.basePath}/workflows`,
      },
    };

    return this.jsonResponse(apiInfo);
  }

  /**
   * Handle authentication resource endpoints
   */
  private async handleAuthResource(
    request: Request,
    segments: string[],
    method: string,
  ): Promise<Response> {
    if (segments.length === 0) {
      return this.jsonResponse({
        message: 'Authentication API',
        version: this.config.version,
        endpoints: {
          callback: `${this.config.basePath}/auth/callback`,
        },
      });
    }

    const [action] = segments;

    switch (action) {
      case 'callback':
      case 'callback/debug': // Support MCP Inspector debug mode
        if (method === 'GET') {
          // Delegate to OAuth endpoints for callback handling
          const url = reconstructOriginalUrl(request);
          //const code = url.searchParams.get('code') || '';
          const state = url.searchParams.get('state') || '';

          try {
            // Handle OAuth callback by looking up MCP auth request
            const mcpAuthRequest = await this.dependencies.oauthProvider.getMCPAuthRequest(state);

            if (!mcpAuthRequest) {
              return this.jsonResponse({
                error: {
                  message: 'OAuth callback failed',
                  details: 'Invalid or expired authorization request',
                  status: 400,
                },
              }, 400);
            }

            // Generate MCP authorization code
            const mcpAuthCode = await this.dependencies.oauthProvider.generateMCPAuthorizationCode(
              mcpAuthRequest.client_id,
              mcpAuthRequest.user_id,
              mcpAuthRequest.redirect_uri,
              mcpAuthRequest.code_challenge,
            );

            // Build redirect URL back to MCP client
            const redirectUrl = new URL(mcpAuthRequest.redirect_uri);
            redirectUrl.searchParams.set('code', mcpAuthCode);
            redirectUrl.searchParams.set('state', mcpAuthRequest.state);

            return new Response(null, {
              status: 302,
              headers: { 'Location': redirectUrl.toString() },
            });
          } catch (error) {
            this.logger.error(
              'APIRouter: Auth callback error:',
              error instanceof Error ? error : new Error(String(error)),
            );
            return this.jsonResponse({
              error: {
                message: 'OAuth callback error',
                details: error instanceof Error ? error.message : 'Unknown error',
                status: 500,
              },
            }, 500);
          }
        }
        break;

      default:
        return this.jsonResponse({
          error: {
            message: `Auth action '${action}' not found`,
            status: 404,
          },
        }, 404);
    }

    return this.jsonResponse({
      error: {
        message: `Method ${method} not allowed`,
        status: 405,
      },
    }, 405);
  }

  /**
   * Handle metrics resource endpoints
   */
  private async handleMetricsResource(
    request: Request,
    segments: string[],
    method: string,
  ): Promise<Response> {
    if (method !== 'GET') {
      return this.jsonResponse({
        error: {
          message: 'Only GET method allowed for metrics endpoints',
          status: 405,
        },
      }, 405);
    }

    if (segments.length === 0) {
      return await this.handleAllMetrics();
    }

    const [metricType] = segments;

    switch (metricType) {
      case 'auth':
        return await this.handleAuthMetrics();

      case 'workflows':
        return await this.handleWorkflowMetrics();

      case 'performance':
        return await this.handlePerformanceMetrics();

      default:
        return this.jsonResponse({
          error: {
            message: `Metric type '${metricType}' not found`,
            status: 404,
          },
        }, 404);
    }
  }

  /**
   * Handle workflows resource endpoints
   */
  private async handleWorkflowsResource(
    request: Request,
    segments: string[],
    method: string,
  ): Promise<Response> {
    if (method !== 'GET') {
      return this.jsonResponse({
        error: {
          message: 'Only GET method allowed for workflow endpoints',
          status: 405,
        },
      }, 405);
    }

    if (segments.length === 0) {
      return await this.handleWorkflowList();
    }

    const [workflowName] = segments;
    if (!workflowName) {
      return this.jsonResponse({
        error: {
          message: 'Workflow name is required',
          status: 400,
        },
      }, 400);
    }
    return await this.handleWorkflowDetails(workflowName);
  }

  // ============================================================================
  // Metrics Handlers
  // ============================================================================

  /**
   * Handle all metrics endpoint
   */
  private async handleAllMetrics(): Promise<Response> {
    try {
      // Get metrics from various components
      const metrics = {
        server: {
          memory_usage: this.getMemoryUsage(),
          timestamp: new Date().toISOString(),
        },
        auth: {
          oauth_provider: 'Generic OAuth Provider',
          // Note: These would come from actual auth service integration
          authenticated_users_total: 0,
          active_sessions: 0,
        },
        workflows: {
          registered_total: this.workflowRegistry.getWorkflowNames().length,
          available: this.workflowRegistry.getWorkflowNames(),
        },
        mcp: {
          // Note: These would come from transport manager integration
          active_sessions: 0,
          session_ids: [],
        },
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(metrics);
    } catch (error) {
      this.logger.error(
        'APIRouter: Error getting all metrics:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve metrics',
          status: 500,
        },
      }, 500);
    }
  }

  /**
   * Handle auth metrics endpoint
   */
  private async handleAuthMetrics(): Promise<Response> {
    try {
      const authMetrics = {
        oauth_provider: 'Generic OAuth Provider',
        // Note: These would come from actual auth service integration
        authenticated_users: 0,
        active_sessions: 0,
        oauth_clients: {
          total: 0,
          active: 0,
        },
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(authMetrics);
    } catch (error) {
      this.logger.error(
        'APIRouter: Error getting auth metrics:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve auth metrics',
          status: 500,
        },
      }, 500);
    }
  }

  /**
   * Handle workflow metrics endpoint
   */
  private async handleWorkflowMetrics(): Promise<Response> {
    try {
      const workflows = this.workflowRegistry.getWorkflowNames();

      const workflowMetrics = {
        total_registered: workflows.length,
        by_category: {}, // TODO: Group by category when available
        available: workflows,
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(workflowMetrics);
    } catch (error) {
      this.logger.error(
        'APIRouter: Error getting workflow metrics:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve workflow metrics',
          status: 500,
        },
      }, 500);
    }
  }

  /**
   * Handle performance metrics endpoint
   */
  private async handlePerformanceMetrics(): Promise<Response> {
    try {
      const performanceMetrics = {
        memory_usage: this.getMemoryUsage(),
        // Note: Additional performance metrics would come from actual services
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(performanceMetrics);
    } catch (error) {
      this.logger.error(
        'APIRouter: Error getting performance metrics:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve performance metrics',
          status: 500,
        },
      }, 500);
    }
  }

  // ============================================================================
  // Workflow Handlers
  // ============================================================================

  /**
   * Handle workflow list endpoint
   */
  private async handleWorkflowList(): Promise<Response> {
    try {
      const workflows = this.workflowRegistry.getAllRegistrations();

      const workflowList = {
        total: workflows.length,
        workflows: workflows.map((w) => ({
          name: w.name,
          displayName: w.displayName,
          description: w.description,
          version: w.version,
          category: w.category,
          requiresAuth: w.requiresAuth,
          estimatedDuration: w.estimatedDuration,
          tags: w.tags,
        })),
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(workflowList);
    } catch (error) {
      this.logger.error(
        'APIRouter: Error getting workflow list:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve workflows',
          status: 500,
        },
      }, 500);
    }
  }

  /**
   * Handle workflow details endpoint
   */
  private async handleWorkflowDetails(workflowName: string): Promise<Response> {
    try {
      const registration = this.workflowRegistry.getRegistration(workflowName);

      if (!registration) {
        return this.jsonResponse({
          error: {
            message: `Workflow '${workflowName}' not found`,
            status: 404,
          },
        }, 404);
      }

      const workflowDetails = {
        ...registration,
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(workflowDetails);
    } catch (error) {
      this.logger.error(
        `APIRouter: Error getting workflow details for ${workflowName}:`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve workflow details',
          status: 500,
        },
      }, 500);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get memory usage information
   */
  private getMemoryUsage() {
    try {
      return Deno.memoryUsage ? Deno.memoryUsage() : { unavailable: true };
    } catch {
      return { unavailable: true };
    }
  }

  /**
   * Create JSON response
   */
  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
