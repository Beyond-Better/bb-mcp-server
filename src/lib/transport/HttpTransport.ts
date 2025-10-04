/**
 * HTTP Transport Implementation for MCP
 *
 * 🚨 CRITICAL: Contains extensively tested Deno→Node compatibility layer
 * DO NOT MODIFY compatibility code - moved as-is from MCPRequestHandler.ts
 */

import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from 'mcp/types.js';
import type { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import { StreamableHTTPServerTransport } from 'mcp/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { toError } from '../utils/Error.ts';
import type {
  //AuthenticationResult,
  //BeyondMcpAuthContext,
  HttpTransportConfig,
  HttpTransportMetrics,
  //MCPRequest,
  //MCPResponse,
  SSEStreamCapture,
  Transport,
  TransportDependencies,
  //TransportMetrics,
  TransportType,
} from './TransportTypes.ts';
import type { BeyondMcpServer } from '../server/BeyondMcpServer.ts';
import type { BeyondMcpRequestContext } from '../types/BeyondMcpTypes.ts';
import type { Logger } from '../utils/Logger.ts';
import { reconstructOriginalUrl } from '../utils/UrlUtils.ts';
import {
  type AuthenticationConfig,
  //type AuthenticationContext,
  type AuthenticationDependencies,
  AuthenticationMiddleware,
} from './AuthenticationMiddleware.ts';

/**
 * HTTP transport implementation for MCP
 * Handles RESTful MCP requests with session management
 *
 * 🚨 CRITICAL: Contains extensively tested Deno→Node compatibility layer
 * for MCP SDK integration. This compatibility code must be preserved intact.
 */
export class HttpTransport implements Transport {
  readonly type: TransportType = 'http';

  private config: HttpTransportConfig;
  private dependencies: TransportDependencies;
  private logger: Logger;
  private authenticationMiddleware: AuthenticationMiddleware;

  // MCP Transport Management (from MCPRequestHandler)
  private mcpTransports = new Map<string, StreamableHTTPServerTransport>();
  private activeSSEStreams = new Map<string, SSEStreamCapture>();

  // SSE Keepalive mechanism to prevent network timeout disconnections
  private sseKeepaliveIntervals = new Map<string, number>();
  private readonly KEEPALIVE_INTERVAL_MS = 25000; // 25 seconds - safe margin before 60s timeout

  // Event store cleanup mechanism
  private cleanupIntervalId?: number | undefined;
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 6000; // 6 hours
  private readonly EVENTS_TO_KEEP = 1000; // Keep last 1000 events per stream

  // Metrics tracking
  private startTime = performance.now();
  private requestCount = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalResponseTime = 0;

  constructor(config: HttpTransportConfig, dependencies: TransportDependencies) {
    this.config = {
      ...config,
      preserveCompatibilityMode: config.preserveCompatibilityMode ?? true, // 🚨 CRITICAL - DO NOT DISABLE
      enableTransportPersistence: config.enableTransportPersistence ?? false,
      enableSessionRestore: config.enableSessionRestore ?? false,
    };
    this.dependencies = dependencies;
    this.logger = dependencies.logger;

    // Validate transport persistence dependencies
    if (this.config.enableTransportPersistence && !dependencies.transportPersistence) {
      this.logger.warn(
        'HttpTransport: Transport persistence enabled but transportPersistence service not provided - persistence disabled',
      );
      this.config.enableTransportPersistence = false;
    }

    if (this.config.enableSessionRestore && !dependencies.sdkMcpServer) {
      this.logger.warn(
        'HttpTransport: Session restore enabled but sdkMcpServer not provided - restore disabled',
      );
      this.config.enableSessionRestore = false;
    }

    // Initialize authentication middleware
    const authConfig: AuthenticationConfig = {
      enabled: config.enableAuthentication ?? (!!dependencies.oauthProvider),
      skipAuthentication: config.skipAuthentication ?? false,
      requireAuthentication: config.requireAuthentication ?? true,
    };

    const authDependencies: AuthenticationDependencies = {
      oauthProvider: dependencies.oauthProvider,
      oauthConsumer: dependencies.oauthConsumer,
      thirdPartyApiClient: dependencies.thirdPartyApiClient,
      logger: dependencies.logger,
    };

    this.authenticationMiddleware = new AuthenticationMiddleware(authConfig, authDependencies);
  }

  async start(): Promise<void> {
    this.logger.info('HttpTransport: Starting HTTP transport', {
      hostname: this.config.hostname,
      port: this.config.port,
      compatibilityMode: this.config.preserveCompatibilityMode,
      transportPersistenceEnabled: this.config.enableTransportPersistence,
      sessionRestoreEnabled: this.config.enableSessionRestore,
    });

    // Restore persisted sessions if enabled
    if (
      this.config.enableSessionRestore &&
      this.dependencies.transportPersistence &&
      this.dependencies.sdkMcpServer
    ) {
      try {
        const restoreResult = await this.dependencies.transportPersistence.restoreTransports(
          this.dependencies.sdkMcpServer,
          this.mcpTransports,
          this.dependencies.eventStore,
        );

        this.logger.info('HttpTransport: Session restore completed', restoreResult);

        if (restoreResult.errors.length > 0) {
          this.logger.warn('HttpTransport: Session restore had errors', {
            errors: restoreResult.errors,
          });
        }
      } catch (error) {
        this.logger.error('HttpTransport: Failed to restore sessions', toError(error));
        // Don't fail startup due to restore errors
      }
    }

    // Start periodic event cleanup if event store is available
    if (this.dependencies.eventStore) {
      this.startPeriodicCleanup();
    }
  }

  // deno-lint-ignore require-await
  async stop(): Promise<void> {
    this.logger.info('HttpTransport: Stopping HTTP transport');

    // Stop periodic cleanup
    this.stopPeriodicCleanup();

    await this.cleanup();
  }

  // deno-lint-ignore require-await
  async cleanup(): Promise<void> {
    this.logger.info('HttpTransport: Cleaning up HTTP transport');

    // Clean up all active MCP sessions
    const activeSessions = Array.from(this.mcpTransports.keys());

    for (const sessionId of activeSessions) {
      try {
        // Stop SSE keepalive first
        this.stopSSEKeepalive(sessionId);

        const transport = this.mcpTransports.get(sessionId);
        if (transport) {
          transport.close();
        }

        // Force close any active SSE streams
        const activeSSE = this.activeSSEStreams.get(sessionId);
        if (activeSSE) {
          activeSSE.forceComplete();
        }
      } catch (error) {
        this.logger.error('HttpTransport: Error cleaning up session', toError(error), {
          sessionId,
        });
      }
    }

    // Clean up any remaining keepalive intervals (safety check)
    for (const [sessionId, intervalId] of this.sseKeepaliveIntervals.entries()) {
      try {
        clearInterval(intervalId);
        this.logger.debug('HttpTransport: Cleared orphaned keepalive interval', { sessionId });
      } catch (error) {
        this.logger.warn('HttpTransport: Error clearing keepalive interval', { sessionId, error });
      }
    }

    this.mcpTransports.clear();
    this.activeSSEStreams.clear();
    this.sseKeepaliveIntervals.clear();
  }

  /**
   * Main HTTP request handling entry point
   * Delegates to method-specific handlers with preserved compatibility and authentication
   *
   * 🔒 SECURITY-CRITICAL: Integrates authentication middleware with MCP request execution
   */
  async handleHttpRequest(
    request: Request,
    sdkMcpServer: SdkMcpServer,
    beyondMcpServer: BeyondMcpServer, // BeyondMcpServer instance for auth context execution
  ): Promise<Response> {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = performance.now();
    const method = request.method;
    const url = new URL(request.url);

    this.requestCount++;

    this.logger.info(
      `HttpTransport: Processing HTTP request [${requestId}] ${method} ${request.url}`,
    );

    try {
      let response: Response;
      let authenticatedRequest = request;
      let mcpAuthContext: BeyondMcpRequestContext | undefined;

      // 🔒 SECURITY-CRITICAL: Check if authentication is required
      if (this.authenticationMiddleware.isAuthenticationRequired(url)) {
        this.logger.debug(`HttpTransport: Authentication required [${requestId}]`, {
          requestId,
          pathname: url.pathname,
        });

        // Authenticate the request
        const authResult = await this.authenticationMiddleware.authenticateRequest(
          request,
          requestId,
        );

        if (!authResult.authenticated) {
          // Create enhanced error response with proper status code and guidance
          const errorStatus = this.authenticationMiddleware.getAuthErrorStatus(authResult);
          const guidance = this.authenticationMiddleware.getClientGuidance(authResult.errorCode);

          this.logger.warn(`HttpTransport: Authentication failed [${requestId}]`, {
            requestId,
            error: authResult.error,
            errorCode: authResult.errorCode,
            actionTaken: authResult.actionTaken,
            clientId: authResult.clientId,
            userId: authResult.userId,
            responseStatus: errorStatus,
            duration: performance.now() - startTime,
            hasOAuthChallenge: !!authResult.oauthChallenge,
          });

          return this.createEnhancedErrorResponse(
            errorStatus === 403 ? 'Forbidden' : 'Unauthorized',
            errorStatus,
            authResult.error || 'Authentication required',
            authResult.errorCode,
            authResult.actionTaken,
            guidance,
            authResult.oauthChallenge,
          );
        }

        // Create authentication context for request execution
        mcpAuthContext = {
          ...this.authenticationMiddleware.createAuthContext(authResult, requestId),
          startTime: performance.now(),
          metadata: {},
        } as BeyondMcpRequestContext;

        // Add authentication context to request headers
        authenticatedRequest = this.authenticationMiddleware.addAuthContextToRequest(
          request,
          authResult,
        );

        // this.logger.info(`HttpTransport: Authentication successful [${requestId}]`, {
        //   requestId,
        //   clientId: authResult.clientId,
        //   userId: authResult.userId,
        //   scopes: authResult.scope?.length || 0,
        //   actionTaken: authResult.actionTaken,
        // });
      } else {
        this.logger.debug(`HttpTransport: Authentication not required [${requestId}]`, {
          requestId,
          pathname: url.pathname,
        });
      }

      // 🔒 SECURITY-CRITICAL: Execute request within authentication context
      if (mcpAuthContext) {
        // this.logger.info(`HttpTransport: Handling request with auth context [${requestId}]`, {
        //   mcpAuthContext,
        // });
        // Execute MCP operations within authenticated context using BeyondMcpServer's AsyncLocalStorage
        response = await beyondMcpServer.executeWithAuthContext(mcpAuthContext, async () => {
          switch (method) {
            case 'POST':
              return await this.handleMCPPost(authenticatedRequest, method, sdkMcpServer);
            case 'GET':
              return await this.handleMCPGet(authenticatedRequest, method, sdkMcpServer);
            case 'DELETE':
              return await this.handleMCPDelete(authenticatedRequest, method, sdkMcpServer);
            default:
              this.logger.warn(`HttpTransport: Method not allowed [${requestId}]`, {
                requestId,
                method,
              });
              return this.createErrorResponse(
                'Method Not Allowed',
                405,
                `Method ${method} not allowed for MCP endpoint`,
              );
          }
        });
      } else {
        // this.logger.info(`HttpTransport: Handling request WITHOUT auth context [${requestId}]`);
        // Execute without authentication context for open endpoints
        switch (method) {
          case 'POST':
            response = await this.handleMCPPost(authenticatedRequest, method, sdkMcpServer);
            break;
          case 'GET':
            response = await this.handleMCPGet(authenticatedRequest, method, sdkMcpServer);
            break;
          case 'DELETE':
            response = await this.handleMCPDelete(authenticatedRequest, method, sdkMcpServer);
            break;
          default:
            this.logger.warn(`HttpTransport: Method not allowed [${requestId}]`, {
              requestId,
              method,
            });
            response = this.createErrorResponse(
              'Method Not Allowed',
              405,
              `Method ${method} not allowed for MCP endpoint`,
            );
            break;
        }
      }

      // Update metrics
      this.successfulRequests++;
      this.totalResponseTime += performance.now() - startTime;

      this.logger.info(
        `HttpTransport: HTTP request completed successfully [${requestId}] ${method} ${response.status} ${authenticatedRequest.url}`,
      );
      return response;
    } catch (error) {
      this.failedRequests++;
      this.logger.error(
        `HttpTransport: HTTP request processing failed [${requestId}]:`,
        toError(error),
        {
          requestId,
          method,
          duration: performance.now() - startTime,
        },
      );

      return this.createErrorResponse(
        'Internal Server Error',
        500,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * 🚨 CRITICAL COMPATIBILITY CODE
   * Handle POST requests with session persistence
   * Creates the MCP session
   */
  private async handleMCPPost(
    request: Request,
    method: string,
    sdkMcpServer: SdkMcpServer,
  ): Promise<Response> {
    // Parse request body first
    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch (error) {
      return this.createErrorResponse('Bad Request', 400, 'Invalid JSON in request body');
    }

    // Check for existing session ID
    const sessionId = request.headers.get('mcp-session-id') as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && this.mcpTransports.has(sessionId)) {
      // Reuse existing transport
      transport = this.mcpTransports.get(sessionId)!;
      // this.logger.info('HttpTransport: Using existing MCP session', { sessionId });

      // Update session activity if persistence is enabled
      if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
        this.updateSessionActivity(sessionId);
      }
    } else {
      if (!sessionId && isInitializeRequest(requestBody)) {
        // New initialization request
        const newSessionId = randomUUID();
        // this.logger.info('HttpTransport: Creating new MCP session', { sessionId });

        // 🚨 PRESERVED MCP SDK INTEGRATION - DO NOT MODIFY
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (initializedSessionId) => {
            this.mcpTransports.set(initializedSessionId, transport);
            this.logger.info(`HttpTransport: New MCP session initialized: ${initializedSessionId}`);

            // Persist the new session if enabled
            if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
              this.persistSession(initializedSessionId, transport, request);
            }
          },
          eventStore: this.dependencies.eventStore,
          // Enable DNS rebinding protection for security
          enableDnsRebindingProtection: true,
          allowedHosts: [
            this.config.hostname,
            `${this.config.hostname}:${this.config.port}`,
          ],
        });

        // Set up cleanup handler with persistence support
        transport.onclose = () => {
          const sessionIdToCleanup = transport.sessionId;
          if (sessionIdToCleanup) {
            this.mcpTransports.delete(sessionIdToCleanup);

            // Mark session as inactive in persistence if enabled
            if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
              this.markSessionInactive(sessionIdToCleanup);
            }

            this.logger.info(`HttpTransport: MCP session closed ${sessionIdToCleanup}`);
          }
        };

        // 🚨 PRESERVED MCP SERVER CONNECTION - DO NOT MODIFY
        //await sdkMcpServer.getMcpServer()!.connect(transport);
        await sdkMcpServer.connect(transport);
        this.logger.info('HttpTransport: MCP server connected to new transport');
      } else {
        // Invalid request
        return this.createErrorResponse(
          'Bad Request',
          400,
          'No valid session ID provided for non-initialize request',
        );
      }
    }

    try {
      // 🚨 CRITICAL COMPATIBILITY - Convert Deno Request to Node.js-compatible objects
      const nodeReq = this.createNodeStyleRequest(request, method, requestBody);
      const responseCapture = new SimpleResponseCapture();
      const nodeRes = responseCapture.createNodeResponse();

      // this.logger.info('HttpTransport: About to call transport.handleRequest for POST', {
      //   sessionId: transport.sessionId,
      //   requestBody: JSON.stringify(requestBody).substring(0, 100) + '...'
      // });

      // 🚨 PRESERVED TRANSPORT HANDLING - DO NOT MODIFY TYPE CASTING
      await transport.handleRequest(
        nodeReq,
        nodeRes as unknown as ServerResponse<IncomingMessage>,
        requestBody,
      );

      // POST requests ALWAYS return JSON and complete immediately
      // Use SimpleResponseCapture - no SSE handling
      // this.logger.debug('HttpTransport: POST request - waiting for normal completion', {
      //   sessionId: transport.sessionId,
      // });

      // Wait for completion (always completes normally)
      await responseCapture.waitForCompletion();

      const resBody = responseCapture.getBody();
      const resStatus = responseCapture.getStatusCode();
      const resHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
        ...responseCapture.getHeaders(),
      };

      // logger.info('MCPRequestHandler: MCP handled request', {
      //   resBody: (() => {
      //     try {
      //       return JSON.parse(resBody);
      //     } catch {
      //       return resBody;
      //     }
      //   })(),
      //   resStatus,
      //   resHeaders,
      //   isNewSession,
      // });

      // Return the captured response (non-SSE)
      return new Response(resBody, {
        status: resStatus,
        headers: resHeaders,
      });
    } catch (error) {
      this.logger.error('HttpTransport: MCP POST error', toError(error));
      return this.createErrorResponse(
        'Internal Server Error',
        500,
        error instanceof Error ? error.message : 'Unknown MCP transport error',
      );
    }
  }

  /**
   * 🚨 CRITICAL COMPATIBILITY CODE
   * Handle GET requests (SSE) with session activity tracking
   * Processes JSONP messages for session stream
   */
  private async handleMCPGet(
    request: Request,
    method: string,
    _sdkMcpServer: SdkMcpServer,
  ): Promise<Response> {
    const sessionId = request.headers.get('mcp-session-id') as string | undefined;

    if (!sessionId) {
      return this.createErrorResponse(
        'Bad Request',
        400,
        'Missing session ID header for SSE endpoint',
      );
    }

    if (!this.mcpTransports.has(sessionId)) {
      // Check if session exists in persistent storage (expired but recoverable)
      if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
        try {
          const persistedSession = await this.dependencies.sessionStore.getSession(sessionId);
          if (persistedSession) {
            // Session exists but was cleaned up - indicate expiry
            return this.createErrorResponse(
              'Session Expired',
              410, // Gone - more specific than 400
              'Session expired due to inactivity. Please re-initialize connection.',
            );
          }
        } catch (error) {
          this.logger.warn('HttpTransport: Error checking persisted session', { sessionId, error });
        }
      }

      return this.createErrorResponse(
        'Session Not Found',
        404, // Not Found - clearer than 400
        'Session not found or invalid. Please initialize new session.',
      );
    }

    const transport = this.mcpTransports.get(sessionId)!;

    // Update session activity
    if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
      this.updateSessionActivity(sessionId);
    }

    try {
      this.logger.debug('HttpTransport: Starting GET SSE request', { sessionId });

      // 🚨 PRESERVED SSE STREAM HANDLING - Create ReadableStream for SSE response
      let streamController: ReadableStreamDefaultController<Uint8Array>;
      const logger = this.logger; // Capture logger reference for callbacks
      const sseStream = new ReadableStream({
        start(controller) {
          streamController = controller;
          logger.debug('HttpTransport: SSE ReadableStream started', { sessionId });
        },
        cancel(reason) {
          logger.debug('HttpTransport: SSE ReadableStream cancelled', { sessionId, reason });
        },
      });

      // 🚨 PRESERVED RESPONSE ADAPTER - Create Node.js-compatible ServerResponse
      const serverResponse = new ReadableStreamServerResponse(streamController!, sessionId);
      const nodeRes = serverResponse.createNodeResponse();
      const nodeReq = this.createNodeStyleRequest(request, method);

      // Track for cleanup during session termination
      this.activeSSEStreams.set(sessionId, {
        forceComplete: () => serverResponse.close(),
        isSSE: () => true,
        isResponseEnded: () => false,
      });

      // Start SSE keepalive to prevent network timeout disconnections
      this.startSSEKeepalive(sessionId, serverResponse);

      // this.logger.debug(
      //   'HttpTransport: Awaiting transport setup, then returning streaming response',
      //   { sessionId },
      // );

      try {
        // 🚨 CRITICAL: Await transport to let it set up SSE first
        await transport.handleRequest(nodeReq, nodeRes as any);

        // this.logger.debug(
        //   'HttpTransport: Transport SSE setup completed, returning streaming response',
        //   { sessionId },
        // );

        // Now return streaming response - connection should stay open via ReadableStream
        return new Response(sseStream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'mcp-session-id,authorization',
          },
        });
      } catch (error) {
        this.logger.error('HttpTransport: Transport setup error', toError(error), { sessionId });
        serverResponse.close();
        throw error;
      }
    } catch (error) {
      this.logger.error('HttpTransport: MCP GET error', toError(error));
      return this.createErrorResponse(
        'Internal Server Error',
        500,
        error instanceof Error ? error.message : 'Unknown SSE error',
      );
    }
  }

  /**
   * 🚨 CRITICAL COMPATIBILITY CODE
   * Handle DELETE requests (session termination) with persistence cleanup
   * Tears down session stream
   */
  private async handleMCPDelete(
    request: Request,
    method: string,
    _sdkMcpServer: SdkMcpServer,
  ): Promise<Response> {
    const sessionId = request.headers.get('mcp-session-id') as string | undefined;

    if (!sessionId) {
      return this.createErrorResponse(
        'Bad Request',
        400,
        'Missing session ID header for session termination',
      );
    }

    if (!this.mcpTransports.has(sessionId)) {
      // For DELETE, session not found is acceptable (already terminated)
      this.logger.debug('HttpTransport: DELETE for non-existent session (already terminated)', {
        sessionId,
      });
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: { message: 'Session already terminated or expired' },
          id: null,
        }),
        {
          status: 200, // Success - idempotent operation
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        },
      );
    }

    try {
      const transport = this.mcpTransports.get(sessionId)!;

      // CRITICAL: Force close any active SSE streams for this session before termination
      await this.forceCloseActiveSSEStream(sessionId);

      // 🚨 PRESERVED NODE.JS COMPATIBILITY - Convert to Node.js-compatible objects
      const nodeReq = this.createNodeStyleRequest(request, method);
      const responseCapture = new SimpleResponseCapture();
      const nodeRes = responseCapture.createNodeResponse();

      // Handle termination through transport
      await transport.handleRequest(
        nodeReq,
        nodeRes as unknown as ServerResponse<IncomingMessage>,
      );

      // DELETE always uses SimpleResponseCapture - no SSE handling needed
      await responseCapture.waitForCompletion();

      // Explicitly close the transport to ensure clean shutdown
      transport.close();

      // Clean up session from memory and persistence
      this.mcpTransports.delete(sessionId);
      this.activeSSEStreams.delete(sessionId);

      if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
        this.markSessionInactive(sessionId);
      }

      this.logger.info(
        `HttpTransport: MCP session terminated cleanly ${sessionId} - ${
          this.activeSSEStreams.has(sessionId) ? 'was active stream' : 'was not active stream'
        }`,
      );

      return new Response(responseCapture.getBody(), {
        status: responseCapture.getStatusCode(),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...responseCapture.getHeaders(),
        },
      });
    } catch (error) {
      this.logger.error('HttpTransport: MCP DELETE error', toError(error));

      // Ensure cleanup even on error
      try {
        const transport = this.mcpTransports.get(sessionId!);
        if (transport) {
          transport.close();
        }
        this.mcpTransports.delete(sessionId!);
        this.activeSSEStreams.delete(sessionId!);
      } catch (cleanupError) {
        this.logger.error('HttpTransport: Error during DELETE cleanup', toError(cleanupError));
      }

      return this.createErrorResponse(
        'Internal Server Error',
        500,
        error instanceof Error ? error.message : 'Unknown termination error',
      );
    }
  }

  /**
   * 🚨 PRESERVED COMPATIBILITY METHOD - DO NOT MODIFY
   * Create Node.js-style request object from Deno Request
   */
  private createNodeStyleRequest(request: Request, method: string, body?: any): any {
    const url = reconstructOriginalUrl(request);

    return {
      method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
    };
  }

  /**
   * Start SSE keepalive to prevent network infrastructure timeouts
   * Sends ping comments every 25 seconds to maintain connection
   */
  private startSSEKeepalive(sessionId: string, serverResponse: ReadableStreamServerResponse): void {
    this.logger.debug('HttpTransport: Starting SSE keepalive', { sessionId });

    // Get the node response once and reuse it
    const nodeResponse = serverResponse.createNodeResponse();

    const keepaliveInterval = setInterval(() => {
      try {
        // Check if stream is still open before attempting write
        if (serverResponse.isStreamEnded()) {
          this.logger.debug('HttpTransport: Stream ended, stopping keepalive', { sessionId });
          this.stopSSEKeepalive(sessionId);
          return;
        }

        // Check if controller is still writable
        if (!serverResponse.isControllerWritable()) {
          this.logger.debug('HttpTransport: Controller not writable, stopping keepalive', {
            sessionId,
          });
          this.stopSSEKeepalive(sessionId);
          return;
        }

        // Send SSE comment ping to keep connection alive
        // Format: ": keepalive\n\n" (SSE comment format - comments are ignored by clients)
        const pingMessage = ': keepalive\n\n';

        if (nodeResponse && typeof nodeResponse.write === 'function') {
          const success = nodeResponse.write(pingMessage);
          if (success) {
            this.logger.debug('HttpTransport: Sent SSE keepalive ping', { sessionId });
          } else {
            this.logger.warn('HttpTransport: SSE keepalive write returned false - stopping', {
              sessionId,
            });
            this.stopSSEKeepalive(sessionId);
          }
        } else {
          this.logger.warn('HttpTransport: SSE keepalive failed - response not writable', {
            sessionId,
            hasNodeResponse: !!nodeResponse,
          });
          this.stopSSEKeepalive(sessionId);
        }
      } catch (error) {
        const err = toError(error);
        // Gracefully handle stream controller closure (expected when client disconnects)
        if (err.message.includes('cannot close or enqueue')) {
          this.logger.debug('HttpTransport: Stream controller closed, stopping keepalive', {
            sessionId,
          });
        } else {
          this.logger.error('HttpTransport: SSE keepalive error', err, { sessionId });
        }
        this.stopSSEKeepalive(sessionId);
      }
    }, this.KEEPALIVE_INTERVAL_MS);

    // Store interval for cleanup
    this.sseKeepaliveIntervals.set(sessionId, keepaliveInterval);

    this.logger.info(
      `HttpTransport: SSE keepalive started - runs every ${this.KEEPALIVE_INTERVAL_MS}ms [${sessionId}]`,
    );
  }

  /**
   * Stop SSE keepalive for a session
   */
  private stopSSEKeepalive(sessionId: string): void {
    const intervalId = this.sseKeepaliveIntervals.get(sessionId);
    if (intervalId) {
      clearInterval(intervalId);
      this.sseKeepaliveIntervals.delete(sessionId);
      this.logger.debug('HttpTransport: SSE keepalive stopped', { sessionId });
    }
  }

  /**
   * Start periodic event store cleanup
   * Runs cleanup every hour to maintain storage efficiency
   */
  private startPeriodicCleanup(): void {
    this.logger.info('HttpTransport: Starting periodic event cleanup', {
      intervalMs: this.CLEANUP_INTERVAL_MS,
      eventsToKeep: this.EVENTS_TO_KEEP,
    });

    // Run cleanup immediately on startup
    this.runEventCleanup().catch((error) => {
      this.logger.error('HttpTransport: Initial event cleanup failed', toError(error));
    });

    // Schedule periodic cleanup
    this.cleanupIntervalId = setInterval(async () => {
      try {
        await this.runEventCleanup();
      } catch (error) {
        this.logger.error('HttpTransport: Scheduled event cleanup failed', toError(error));
      }
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.info('HttpTransport: Periodic event cleanup started');
  }

  /**
   * Stop periodic event store cleanup
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupIntervalId !== undefined) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
      this.logger.info('HttpTransport: Periodic event cleanup stopped');
    }
  }

  /**
   * Run event cleanup for all active streams
   */
  private async runEventCleanup(): Promise<void> {
    if (!this.dependencies.eventStore) {
      return;
    }

    try {
      const streams = await this.dependencies.eventStore.listStreams();
      let totalDeleted = 0;

      for (const streamId of streams) {
        try {
          const deletedCount = await this.dependencies.eventStore.cleanupOldEvents(
            streamId,
            this.EVENTS_TO_KEEP,
          );
          totalDeleted += deletedCount;
        } catch (error) {
          this.logger.warn('HttpTransport: Failed to cleanup stream', {
            streamId,
            error: toError(error).message,
          });
        }
      }

      this.logger.info('HttpTransport: Event cleanup completed', {
        streamsProcessed: streams.length,
        eventsDeleted: totalDeleted,
      });
    } catch (error) {
      this.logger.error('HttpTransport: Event cleanup failed', toError(error));
      throw error;
    }
  }

  /**
   * Force close any active SSE stream for a session
   */
  private async forceCloseActiveSSEStream(sessionId: string): Promise<void> {
    const activeSSEStream = this.activeSSEStreams.get(sessionId);

    if (!activeSSEStream) {
      this.logger.debug('HttpTransport: No active SSE stream to close', { sessionId });
      return;
    }

    this.logger.info(`HttpTransport: Force closing active SSE stream ${sessionId}`);

    try {
      // Stop SSE keepalive first
      this.stopSSEKeepalive(sessionId);

      activeSSEStream.forceComplete();
      this.activeSSEStreams.delete(sessionId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.logger.debug('HttpTransport: SSE stream closed successfully', { sessionId });
    } catch (error) {
      this.logger.warn('HttpTransport: Error force closing SSE stream', {
        sessionId,
        error: error instanceof Error ? error.message : error,
      });
      this.activeSSEStreams.delete(sessionId);
    }
  }

  // Session management helpers (async)
  private persistSession(
    sessionId: string,
    transport: StreamableHTTPServerTransport,
    request: Request,
  ): void {
    if (!this.dependencies.transportPersistence) {
      return;
    }

    const userAgent = request.headers.get('user-agent');
    const origin = request.headers.get('origin');

    // Extract userId from authenticated request context
    const userId = request.headers.get('X-MCP-User-ID') || undefined;

    this.dependencies.transportPersistence.persistSession(
      sessionId,
      transport,
      {
        hostname: this.config.hostname,
        port: this.config.port,
        allowedHosts: this.config.allowedHosts || [
          this.config.hostname,
          `${this.config.hostname}:${this.config.port}`,
        ],
      },
      userId,
      {
        userAgent,
        origin,
        createdFromEndpoint: 'POST /mcp',
      },
    ).catch((error) => {
      this.logger.error('HttpTransport: Failed to persist session', toError(error), {
        sessionId,
      });
    });
  }

  private updateSessionActivity(sessionId: string): void {
    if (!this.dependencies.transportPersistence) {
      return;
    }

    this.dependencies.transportPersistence.updateSessionActivity(sessionId).catch((error) => {
      this.logger.debug('HttpTransport: Failed to update session activity', {
        sessionId,
        error: toError(error).message,
      });
    });
  }

  private markSessionInactive(sessionId: string): void {
    if (!this.dependencies.transportPersistence) {
      return;
    }

    this.dependencies.transportPersistence.markSessionInactive(sessionId).catch((error) => {
      this.logger.debug('HttpTransport: Failed to mark session inactive', {
        sessionId,
        error: toError(error).message,
      });
    });
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(message: string, status: number, details?: string): Response {
    const error = {
      error: {
        code: -32000,
        message,
        status,
        details,
        timestamp: new Date().toISOString(),
      },
    };

    return new Response(
      JSON.stringify(
        {
          jsonrpc: '2.0',
          error,
          id: null,
        },
        null,
        2,
      ),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  /**
   * Create enhanced error response with error codes and action context
   * Preserves legacy error handling patterns from MCPRequestHandler.ts
   * Enhanced with OAuth challenge support for auth flow initiation
   */
  private createEnhancedErrorResponse(
    message: string,
    status: number,
    details?: string,
    errorCode?: string,
    actionTaken?: string,
    guidance?: string,
    oauthChallenge?: {
      realm: string;
      authorizationUri: string;
      registrationUri?: string;
      error?: string;
      errorDescription?: string;
    },
  ): Response {
    const error = {
      error: {
        code: -32000,
        message,
        status,
        details,
        errorCode,
        actionTaken,
        timestamp: new Date().toISOString(),
        // Provide guidance to MCP clients (follows legacy pattern)
        guidance,
        // Include OAuth challenge for flow initiation
        ...(oauthChallenge && {
          oauth: {
            authorizationUri: oauthChallenge.authorizationUri,
            registrationUri: oauthChallenge.registrationUri,
            realm: oauthChallenge.realm,
          },
        }),
      },
    };

    // Build response headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // Add custom headers to help clients understand the error (legacy pattern)
      ...(errorCode && { 'X-MCP-Error-Code': errorCode }),
      ...(actionTaken && { 'X-MCP-Action-Taken': actionTaken }),
    };

    // Add WWW-Authenticate header for OAuth challenge (RFC 6750)
    if (oauthChallenge) {
      const wwwAuthenticateValue = this.authenticationMiddleware.buildWWWAuthenticateHeader(
        oauthChallenge,
      );
      headers['WWW-Authenticate'] = wwwAuthenticateValue;

      // Log OAuth challenge for debugging
      this.logger.debug('HttpTransport: Added OAuth challenge to response', {
        authorizationUri: oauthChallenge.authorizationUri,
        registrationUri: oauthChallenge.registrationUri,
        realm: oauthChallenge.realm,
        wwwAuthenticate: wwwAuthenticateValue,
      });
    }

    return new Response(
      JSON.stringify(
        {
          jsonrpc: '2.0',
          error,
          id: null,
        },
        null,
        2,
      ),
      {
        status,
        headers,
      },
    );
  }

  getMetrics(): HttpTransportMetrics {
    const avgResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;

    return {
      transport: 'http',
      uptime: performance.now() - this.startTime,
      requests: {
        total: this.requestCount,
        successful: this.successfulRequests,
        failed: this.failedRequests,
        averageResponseTime: avgResponseTime,
      },
      sessions: {
        active: this.mcpTransports.size,
        total: this.requestCount, // Approximate
        expired: 0, // Would need persistence layer
        averageSessionDuration: 0, // Would need persistence layer
      },
      http: {
        connectionsOpen: this.activeSSEStreams.size,
        requestsPerSecond: this.requestCount / ((performance.now() - this.startTime) / 1000),
        averageRequestSize: 0, // Would need request size tracking
      },
    };
  }

  // Public session management methods
  getSessionCount(): number {
    return this.mcpTransports.size;
  }

  getActiveSessions(): string[] {
    return Array.from(this.mcpTransports.keys());
  }
}

/**
 * 🚨 CRITICAL COMPATIBILITY CLASSES - PRESERVED EXACTLY FROM MCPRequestHandler.ts
 * DO NOT MODIFY THESE CLASSES - THEY ARE BATTLE-TESTED
 */

/**
 * Simple response capture for POST/DELETE requests
 * Always completes normally, never handles SSE
 */
class SimpleResponseCapture implements SSEStreamCapture {
  private statusCode = 200;
  private headers: Record<string, string> = {};
  private body = '';
  private chunks: string[] = [];
  private isEnded = false;
  private endPromise: Promise<void>;
  private resolveEnd!: () => void;

  constructor() {
    this.endPromise = new Promise<void>((resolve) => {
      this.resolveEnd = resolve;
    });
  }

  createNodeResponse() {
    const self = this;
    const nodeResponse = {
      writeHead(status: number, responseHeaders?: Record<string, string>) {
        self.statusCode = status;
        if (responseHeaders) {
          Object.assign(self.headers, responseHeaders);
        }
        nodeResponse.statusCode = status;
        nodeResponse.headersSent = true;
        return this;
      },

      setHeader(name: string, value: string) {
        self.headers[name] = value;
        return this;
      },

      getHeader(name: string) {
        return self.headers[name];
      },

      getHeaders() {
        return { ...self.headers };
      },

      hasHeader(name: string) {
        return name in self.headers;
      },

      removeHeader(name: string) {
        delete self.headers[name];
        return this;
      },

      flushHeaders() {
        return this;
      },

      write(chunk: string) {
        self.chunks.push(chunk);
        return true;
      },

      end(data?: string) {
        if (data) {
          self.chunks.push(data);
        }
        self.body = self.chunks.join('');

        // SimpleResponseCapture ALWAYS completes normally
        self.isEnded = true;
        nodeResponse.writableEnded = true;
        nodeResponse.writableFinished = true;
        self.resolveEnd();
        return this;
      },

      // Event emitter methods
      on: () => nodeResponse,
      once: () => nodeResponse,
      emit: () => nodeResponse,
      removeListener: () => nodeResponse,
      removeAllListeners: () => nodeResponse,

      statusCode: self.statusCode,
      statusMessage: '',
      headersSent: false,
      writableEnded: false,
      writableFinished: false,
    };

    return nodeResponse;
  }

  async waitForCompletion(): Promise<void> {
    await this.endPromise;
  }

  getStatusCode(): number {
    return this.statusCode;
  }

  getHeaders(): Record<string, string> {
    return this.headers;
  }

  getBody(): string {
    return this.body;
  }

  isResponseEnded(): boolean {
    return this.isEnded;
  }

  isSSE(): boolean {
    return false; // Never SSE
  }

  forceComplete(): void {
    if (!this.isEnded) {
      this.isEnded = true;
      this.resolveEnd();
    }
  }
}

/**
 * ReadableStream adapter that implements Node.js ServerResponse interface
 * Bridges MCP SDK transport with Deno's ReadableStream for SSE
 */
class ReadableStreamServerResponse {
  private streamController: ReadableStreamDefaultController<Uint8Array>;
  private textEncoder = new TextEncoder();
  private sessionId: string;
  private responseStatus = 200;
  private responseHeaders: Record<string, string> = {};
  private isEnded = false;
  private eventListeners = new Map<string, Function[]>();
  private nodeResponse: any;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>, sessionId: string) {
    this.streamController = controller;
    this.sessionId = sessionId;
  }

  createNodeResponse() {
    const self = this;
    this.nodeResponse = {
      writeHead(status: number, headers?: Record<string, string>) {
        self.responseStatus = status;
        if (headers) {
          Object.assign(self.responseHeaders, headers);
        }
        return this;
      },

      flushHeaders() {
        return this;
      },

      setHeader(name: string, value: string) {
        self.responseHeaders[name] = value;
        return this;
      },

      write(chunk: string | Uint8Array) {
        if (self.streamController && !self.isEnded) {
          const data = typeof chunk === 'string' ? self.textEncoder.encode(chunk) : chunk;
          self.streamController.enqueue(data);
        }
        return true;
      },

      end(data?: string | Uint8Array) {
        if (data && self.streamController && !self.isEnded) {
          const chunk = typeof data === 'string' ? self.textEncoder.encode(data) : data;
          self.streamController.enqueue(chunk);
        }
        // For SSE, keep stream open - don't close controller
        return this;
      },

      forceClose() {
        if (!self.isEnded && self.streamController) {
          self.isEnded = true;
          self.streamController.close();
        }
      },

      // Proper Node.js ServerResponse event handling for MCP SDK
      on(event: string, listener: Function) {
        if (!self.eventListeners.has(event)) {
          self.eventListeners.set(event, []);
        }
        self.eventListeners.get(event)!.push(listener);
        return this;
      },

      once(event: string, listener: Function) {
        const onceWrapper = (...args: any[]) => {
          listener(...args);
          this.removeListener(event, onceWrapper);
        };
        return this.on(event, onceWrapper);
      },

      emit(event: string, ...args: any[]) {
        const listeners = self.eventListeners.get(event);
        if (listeners) {
          listeners.forEach((listener) => {
            try {
              listener(...args);
            } catch (error) {
              // Error handling in event listener
            }
          });
        }
        return this;
      },

      removeListener(event: string, listener: Function) {
        const listeners = self.eventListeners.get(event);
        if (listeners) {
          const index = listeners.indexOf(listener);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
        return this;
      },

      removeAllListeners(event?: string) {
        if (event) {
          self.eventListeners.delete(event);
        } else {
          self.eventListeners.clear();
        }
        return this;
      },

      // Other required Node.js ServerResponse properties
      statusCode: self.responseStatus,
      headersSent: false,
      writableEnded: false,
      writableFinished: false,
    };

    return this.nodeResponse;
  }

  getStatus(): number {
    return this.responseStatus;
  }

  getHeaders(): Record<string, string> {
    return { ...this.responseHeaders };
  }

  isStreamEnded(): boolean {
    return this.isEnded;
  }

  /**
   * Check if the stream controller is still writable
   * Safely checks controller state without throwing
   */
  isControllerWritable(): boolean {
    if (this.isEnded) {
      return false;
    }

    try {
      // Check if controller still exists and isn't closed
      // ReadableStreamDefaultController has a desiredSize property:
      // - null means the stream is closed
      // - number (including 0) means it's still open
      return this.streamController?.desiredSize !== null;
    } catch {
      // If accessing desiredSize throws, controller is invalid
      return false;
    }
  }

  close(): void {
    if (!this.isEnded && this.streamController) {
      this.isEnded = true;
      this.streamController.close();

      // CRITICAL: Emit 'close' event on the original nodeResponse
      if (this.nodeResponse) {
        this.nodeResponse.emit('close');
      }
    }
  }
}
