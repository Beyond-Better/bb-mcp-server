/**
 * CORS Handler - Cross-Origin Resource Sharing management
 *
 * Manages CORS headers, preflight requests, and cross-origin security for the HTTP server.
 * Provides configurable CORS policies with sensible defaults for MCP server usage.
 *
 * Extracted from: actionstep-mcp-server/src/server/HttpServer.ts CORS handling
 */

import type { Logger } from '../../types/library.types.ts';

/**
 * CORS configuration options
 */
export interface CORSConfig {
  /** Allowed origin (default: '*') */
  allowOrigin: string;
  /** Allowed methods (optional, defaults provided) */
  allowMethods?: string[];
  /** Allowed headers (optional, defaults provided) */
  allowHeaders?: string[];
  /** Exposed headers (optional, defaults provided) */
  exposeHeaders?: string[];
  /** Max age for preflight cache in seconds (default: 86400) */
  maxAge?: number;
  /** Allow credentials (default: false) */
  allowCredentials?: boolean;
}

/**
 * CORS handling for HTTP server
 *
 * Manages cross-origin requests and security headers with configurable policies.
 * Provides comprehensive CORS support for browser-based MCP clients.
 */
export class CORSHandler {
  private config: CORSConfig;
  private logger: Logger | undefined;

  // Default CORS configuration for MCP servers
  private static readonly DEFAULT_CONFIG: Required<CORSConfig> = {
    allowOrigin: '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
    exposeHeaders: ['Mcp-Session-Id'],
    maxAge: 86400, // 24 hours
    allowCredentials: false,
  };

  constructor(config: CORSConfig, logger?: Logger) {
    // Merge provided config with defaults
    this.config = {
      ...CORSHandler.DEFAULT_CONFIG,
      ...config,
    };
    this.logger = logger;

    this.logger?.info('CORSHandler: Initialized', {
      allowOrigin: this.config.allowOrigin,
      allowMethods: this.config.allowMethods?.length || 0,
      allowHeaders: this.config.allowHeaders?.length || 0,
      maxAge: this.config.maxAge,
      allowCredentials: this.config.allowCredentials,
    });
  }

  /**
   * Get standard CORS headers
   */
  getCORSHeaders(): Headers {
    const headers = new Headers();

    // Basic CORS headers
    headers.set('Access-Control-Allow-Origin', this.config.allowOrigin);

    if (this.config.allowMethods) {
      headers.set('Access-Control-Allow-Methods', this.config.allowMethods.join(', '));
    }

    if (this.config.allowHeaders) {
      headers.set('Access-Control-Allow-Headers', this.config.allowHeaders.join(', '));
    }

    if (this.config.exposeHeaders && this.config.exposeHeaders.length > 0) {
      headers.set('Access-Control-Expose-Headers', this.config.exposeHeaders.join(', '));
    }

    if (this.config.maxAge !== undefined) {
      headers.set('Access-Control-Max-Age', this.config.maxAge.toString());
    }

    if (this.config.allowCredentials) {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return headers;
  }

  /**
   * Handle CORS preflight requests (OPTIONS)
   */
  handlePreflight(request: Request): Response {
    this.logger?.debug('CORSHandler: Handling preflight request', {
      origin: request.headers.get('origin'),
      requestMethod: request.headers.get('access-control-request-method'),
      requestHeaders: request.headers.get('access-control-request-headers'),
    });

    const corsHeaders = this.getCORSHeaders();

    // Additional preflight-specific headers
    const requestMethod = request.headers.get('access-control-request-method');
    const requestHeaders = request.headers.get('access-control-request-headers');

    // Validate requested method
    if (requestMethod && this.config.allowMethods) {
      if (!this.config.allowMethods.includes(requestMethod)) {
        this.logger?.warn('CORSHandler: Requested method not allowed', {
          requestMethod,
          allowedMethods: this.config.allowMethods,
        });

        return new Response(null, {
          status: 405, // Method Not Allowed
          headers: corsHeaders,
        });
      }
    }

    // Validate requested headers
    if (requestHeaders && this.config.allowHeaders) {
      const requestedHeaders = requestHeaders.split(',').map((h) => h.trim().toLowerCase());
      const allowedHeaders = this.config.allowHeaders.map((h) => h.toLowerCase());

      const disallowedHeaders = requestedHeaders.filter((h) => !allowedHeaders.includes(h));

      if (disallowedHeaders.length > 0) {
        this.logger?.warn('CORSHandler: Some requested headers not allowed', {
          disallowedHeaders,
          allowedHeaders: this.config.allowHeaders,
        });

        // Note: We don't fail here, just log the warning
        // Some browsers send additional headers that might not be critical
      }
    }

    return new Response(null, {
      status: 204, // No Content
      headers: corsHeaders,
    });
  }

  /**
   * Add CORS headers to an existing response
   */
  addCORSHeaders(response: Response): Response {
    const corsHeaders = this.getCORSHeaders();
    const responseHeaders = new Headers(response.headers);

    // Add CORS headers to response
    corsHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  /**
   * Check if a request origin is allowed
   */
  isOriginAllowed(origin: string | null): boolean {
    if (!origin) {
      // No origin header (e.g., same-origin requests)
      return true;
    }

    if (this.config.allowOrigin === '*') {
      // Allow all origins
      return true;
    }

    // Check exact match
    return this.config.allowOrigin === origin;
  }

  /**
   * Check if a request method is allowed
   */
  isMethodAllowed(method: string): boolean {
    if (!this.config.allowMethods) {
      return true;
    }

    return this.config.allowMethods.includes(method.toUpperCase());
  }

  /**
   * Validate CORS request
   */
  validateRequest(request: Request): { valid: boolean; reason?: string } {
    const origin = request.headers.get('origin');
    const method = request.method;

    // Check origin
    if (!this.isOriginAllowed(origin)) {
      return {
        valid: false,
        reason: `Origin '${origin}' not allowed`,
      };
    }

    // Check method
    if (!this.isMethodAllowed(method)) {
      return {
        valid: false,
        reason: `Method '${method}' not allowed`,
      };
    }

    return { valid: true };
  }

  /**
   * Create error response for CORS violations
   */
  createCORSErrorResponse(reason: string): Response {
    const errorResponse = {
      error: {
        message: 'CORS policy violation',
        details: reason,
        status: 403,
      },
      timestamp: new Date().toISOString(),
    };

    // Note: We still add CORS headers to error responses
    // so the browser can read the error
    const corsHeaders = this.getCORSHeaders();
    corsHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(errorResponse, null, 2), {
      status: 403,
      headers: corsHeaders,
    });
  }

  /**
   * Update CORS configuration
   */
  updateConfig(newConfig: Partial<CORSConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };

    this.logger?.info('CORSHandler: Configuration updated', {
      allowOrigin: this.config.allowOrigin,
      allowMethods: this.config.allowMethods?.length || 0,
      allowHeaders: this.config.allowHeaders?.length || 0,
    });
  }

  /**
   * Get current CORS configuration
   */
  getConfig(): Readonly<CORSConfig> {
    return { ...this.config };
  }

  /**
   * Create a middleware function for use with other HTTP frameworks
   */
  createMiddleware() {
    return async (
      request: Request,
      handler: (request: Request) => Promise<Response>,
    ): Promise<Response> => {
      // Validate CORS request
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return this.createCORSErrorResponse(validation.reason!);
      }

      // Handle preflight
      if (request.method === 'OPTIONS') {
        return this.handlePreflight(request);
      }

      // Process request and add CORS headers to response
      try {
        const response = await handler(request);
        return this.addCORSHeaders(response);
      } catch (error) {
        // Ensure CORS headers are added to error responses too
        const errorResponse = new Response(
          JSON.stringify({
            error: {
              message: 'Internal server error',
              details: error instanceof Error ? error.message : 'Unknown error',
            },
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        );

        return this.addCORSHeaders(errorResponse);
      }
    };
  }

  /**
   * Create development-friendly CORS config
   */
  static createDevelopmentConfig(): CORSConfig {
    return {
      allowOrigin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'mcp-session-id',
        'X-Requested-With',
        'Accept',
        'Origin',
      ],
      exposeHeaders: ['Mcp-Session-Id', 'X-Total-Count'],
      maxAge: 3600, // 1 hour (shorter for development)
      allowCredentials: false,
    };
  }

  /**
   * Create production-friendly CORS config
   */
  static createProductionConfig(allowedOrigins: string[]): CORSConfig {
    return {
      allowOrigin: allowedOrigins.length === 1 ? allowedOrigins[0]! : allowedOrigins.join(','),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
      exposeHeaders: ['Mcp-Session-Id'],
      maxAge: 86400, // 24 hours
      allowCredentials: false,
    };
  }
}
