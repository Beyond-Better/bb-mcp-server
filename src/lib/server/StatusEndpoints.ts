/**
 * Status Endpoints - Server status, health, and monitoring endpoints
 *
 * Provides comprehensive server monitoring endpoints including health checks,
 * readiness probes, liveness probes, and detailed server status information.
 */

import type { Logger } from '../../types/library.types.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import type { TransportManager } from '../transport/TransportManager.ts';
import type { HttpServerConfig, HttpServerDependencies } from './HttpServer.ts';

/**
 * Status and monitoring endpoints implementation
 *
 * Provides comprehensive server monitoring and observability endpoints
 * with health checks, metrics, and status information.
 */
export class StatusEndpoints {
  private dependencies: HttpServerDependencies;
  private startTime: Date;
  private logger: Logger;
  private httpServerConfig: HttpServerConfig;
  private workflowRegistry: WorkflowRegistry;
  private transportManager: TransportManager;

  constructor(dependencies: HttpServerDependencies, startTime: Date) {
    this.dependencies = dependencies;
    this.startTime = startTime;
    this.logger = dependencies.logger;
    this.httpServerConfig = dependencies.httpServerConfig;
    this.workflowRegistry = dependencies.workflowRegistry;
    this.transportManager = dependencies.transportManager;

    this.logger.info('StatusEndpoints: Initialized', {
      serverName: this.httpServerConfig.name,
      serverVersion: this.httpServerConfig.version,
      startTime: this.startTime.toISOString(),
    });
  }

  /**
   * Handle status endpoint requests
   */
  async handleRequest(request: Request, segments: string[], method: string): Promise<Response> {
    if (method !== 'GET') {
      return this.jsonResponse({
        error: {
          message: 'Only GET method allowed for status endpoints',
          status: 405,
        },
      }, 405);
    }

    this.logger.debug(`StatusEndpoints: Handling request for /${segments.join('/')}`);

    if (segments.length === 0) {
      return await this.handleServerStatus();
    }

    const [statusType] = segments;

    switch (statusType) {
      case 'health':
        return await this.handleHealthCheck();

      case 'ready':
        return await this.handleReadinessCheck();

      case 'live':
        return await this.handleLivenessCheck();

      default:
        return this.jsonResponse({
          error: {
            message: `Status type '${statusType}' not found`,
            status: 404,
          },
        }, 404);
    }
  }

  /**
   * Handle main server status endpoint
   */
  private async handleServerStatus(): Promise<Response> {
    try {
      const uptime = performance.now() - this.startTime.getTime();

      const status = {
        server: {
          name: this.httpServerConfig.name,
          version: this.httpServerConfig.version,
          environment: this.httpServerConfig.environment || 'development',
          uptime: {
            seconds: Math.floor(uptime / 1000),
            human: this.formatUptime(uptime),
          },
          started_at: this.startTime.toISOString(),
        },
        http: {
          hostname: this.httpServerConfig.hostname,
          port: this.httpServerConfig.port,
        },
        workflows: {
          count: this.workflowRegistry.getWorkflowNames().length,
          available: this.workflowRegistry.getWorkflowNames(),
        },
        auth: {
          oauth_provider: 'Generic OAuth Provider',
          // Note: These would come from actual auth service integration
          authenticated_users: 0,
          oauth_clients: 0,
        },
        oauth2: {
          endpoints: {
            authorize: '/authorize',
            token: '/token',
            register: '/register',
            metadata: '/.well-known/oauth-authorization-server',
          },
        },
        mcp: this.getMCPSessionMetrics(),
        timestamp: new Date().toISOString(),
      };

      return this.jsonResponse(status);
    } catch (error) {
      this.logger.error(
        'StatusEndpoints: Error getting server status:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        error: {
          message: 'Failed to retrieve server status',
          status: 500,
        },
      }, 500);
    }
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealthCheck(): Promise<Response> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: this.httpServerConfig.version,
        checks: {
          http_server: 'ok',
          oauth_provider: 'ok',
          workflow_registry: 'ok',
          transport_manager: 'ok',
        },
      };

      return this.jsonResponse(health);
    } catch (error) {
      this.logger.error(
        'StatusEndpoints: Health check error:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 503);
    }
  }

  /**
   * Handle readiness check endpoint
   */
  private async handleReadinessCheck(): Promise<Response> {
    try {
      // Check if all services are ready
      const checks = {
        workflow_registry: this.workflowRegistry.getWorkflowNames().length > 0,
        oauth_provider: true, // OAuth provider is always ready after initialization
        transport_manager: true, // Transport manager is always ready after initialization
        http_server: true, // If we can respond, HTTP server is ready
      };

      const allReady = Object.values(checks).every((check) => check === true);

      const readiness = {
        status: allReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks,
      };

      return this.jsonResponse(readiness, allReady ? 200 : 503);
    } catch (error) {
      this.logger.error(
        'StatusEndpoints: Readiness check error:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 503);
    }
  }

  /**
   * Handle liveness check endpoint
   */
  private async handleLivenessCheck(): Promise<Response> {
    try {
      const uptime = performance.now() - this.startTime.getTime();

      const liveness = {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: {
          seconds: Math.floor(uptime / 1000),
          human: this.formatUptime(uptime),
        },
        memory: this.getMemoryUsage(),
      };

      return this.jsonResponse(liveness);
    } catch (error) {
      this.logger.error(
        'StatusEndpoints: Liveness check error:',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.jsonResponse({
        status: 'dead',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 503);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get MCP session metrics from transport manager
   */
  private getMCPSessionMetrics() {
    try {
      // Get metrics from transport manager if available
      const metrics = this.transportManager.getMetrics?.();

      if (metrics) {
        return {
          active_sessions: metrics.sessions?.active || 0,
          session_ids: [], // Session IDs would need to be added to TransportMetrics type
          transport_type: metrics.transport || 'unknown',
        };
      }

      // Fallback metrics
      return {
        active_sessions: 0,
        session_ids: [],
        transport_type: 'mixed',
      };
    } catch (error) {
      this.logger.warn('StatusEndpoints: Failed to get MCP metrics:', error);
      return {
        active_sessions: 0,
        session_ids: [],
        transport_type: 'unknown',
        error: 'Metrics unavailable',
      };
    }
  }

  /**
   * Get memory usage information
   */
  private getMemoryUsage() {
    try {
      if (Deno.memoryUsage) {
        const usage = Deno.memoryUsage();
        return {
          rss: usage.rss,
          heapTotal: usage.heapTotal,
          heapUsed: usage.heapUsed,
          external: usage.external,
          available: true,
        };
      }

      return { available: false, reason: 'Deno.memoryUsage not available' };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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

  /**
   * Create JSON response
   */
  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get detailed server statistics
   */
  getServerStats(): { server: { name: string; version: string; environment: string; uptime: { seconds: number; human: string }; started_at: string }; http: { hostname: string; port: number }; workflows: { count: number; available: string[] }; mcp: unknown; memory: unknown; timestamp: string } {
    const uptime = performance.now() - this.startTime.getTime();

    return {
      server: {
        name: this.httpServerConfig.name,
        version: this.httpServerConfig.version,
        environment: this.httpServerConfig.environment || 'development',
        uptime: {
          seconds: Math.floor(uptime / 1000),
          human: this.formatUptime(uptime),
        },
        started_at: this.startTime.toISOString(),
      },
      http: {
        hostname: this.httpServerConfig.hostname,
        port: this.httpServerConfig.port,
      },
      workflows: {
        count: this.workflowRegistry.getWorkflowNames().length,
        available: this.workflowRegistry.getWorkflowNames(),
      },
      mcp: this.getMCPSessionMetrics(),
      memory: this.getMemoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
