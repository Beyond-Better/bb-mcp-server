/**
 * HTTP Transport Implementation for MCP
 * 
 * 🚨 CRITICAL: Contains extensively tested Deno→Node compatibility layer
 * DO NOT MODIFY compatibility code - moved as-is from MCPRequestHandler.ts
 */

import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from 'mcp/types.js';
import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import { StreamableHTTPServerTransport } from 'mcp/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { toError } from '../utils/Error.ts';
import type { Transport, TransportType, HttpTransportConfig, MCPRequest, MCPResponse, BeyondMcpAuthContext, TransportDependencies, AuthenticationResult, SSEStreamCapture, TransportMetrics, HttpTransportMetrics } from './TransportTypes.ts';
import type { Logger } from '../utils/Logger.ts';
import { reconstructOriginalUrl } from '../utils/UrlUtils.ts';

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
  
  // MCP Transport Management (from MCPRequestHandler)
  private mcpTransports = new Map<string, StreamableHTTPServerTransport>();
  private activeSSEStreams = new Map<string, SSEStreamCapture>();
  
  // SSE Keepalive mechanism to prevent network timeout disconnections
  private sseKeepaliveIntervals = new Map<string, number>();
  private readonly KEEPALIVE_INTERVAL_MS = 25000; // 25 seconds - safe margin before 60s timeout
  
  // Metrics tracking
  private startTime = Date.now();
  private requestCount = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalResponseTime = 0;
  
  constructor(config: HttpTransportConfig, dependencies: TransportDependencies) {
    this.config = {
      ...config,
      preserveCompatibilityMode: config.preserveCompatibilityMode ?? true, // 🚨 CRITICAL - DO NOT DISABLE
      enableTransportPersistence: config.enableTransportPersistence ?? false,
      sessionRestoreEnabled: config.sessionRestoreEnabled ?? false,
    };
    this.dependencies = dependencies;
    this.logger = dependencies.logger;
  }
  
  async start(): Promise<void> {
    this.logger.info('HttpTransport: Starting HTTP transport', {
      hostname: this.config.hostname,
      port: this.config.port,
      compatibilityMode: this.config.preserveCompatibilityMode,
    });
  }
  
  async stop(): Promise<void> {
    this.logger.info('HttpTransport: Stopping HTTP transport');
    await this.cleanup();
  }
  
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
   * Delegates to method-specific handlers with preserved compatibility
   */
  async handleHttpRequest(request: Request, sdkMcpServer: SdkMcpServer, authContext?: BeyondMcpAuthContext): Promise<Response> {
    const requestId = Math.random().toString(36).substring(2, 15);
    const startTime = Date.now();
    const method = request.method;
    
    this.requestCount++;
    
    this.logger.info(`HttpTransport: Processing HTTP request [${requestId}] ${method} ${request.url}`);
    
    try {
      let response: Response;
      
      switch (method) {
        case 'POST':
          response = await this.handleMCPPost(request, method, sdkMcpServer, authContext);
          break;
        case 'GET':
          response = await this.handleMCPGet(request, method, sdkMcpServer, authContext);
          break;
        case 'DELETE':
          response = await this.handleMCPDelete(request, method, sdkMcpServer, authContext);
          break;
        default:
          this.logger.warn(`HttpTransport: Method not allowed [${requestId}]`, { requestId, method });
          response = this.createErrorResponse('Method Not Allowed', 405, `Method ${method} not allowed for MCP endpoint`);
          break;
      }
      
      // Update metrics
      this.successfulRequests++;
      this.totalResponseTime += (Date.now() - startTime);
      
      this.logger.info(`HttpTransport: HTTP request completed successfully [${requestId}] ${method} ${response.status}`);
      return response;
      
    } catch (error) {
      this.failedRequests++;
      this.logger.error(`HttpTransport: HTTP request processing failed [${requestId}]:`, toError(error), {
        requestId,
        method,
        duration: Date.now() - startTime,
      });
      
      return this.createErrorResponse(
        'Internal Server Error',
        500,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
  
  /**
   * 🚨 CRITICAL COMPATIBILITY CODE - PRESERVED FROM MCPRequestHandler.ts
   * Handle POST requests with session persistence
   * Lines ~187-337 from original MCPRequestHandler.ts
   */
  private async handleMCPPost(request: Request, method: string, sdkMcpServer: SdkMcpServer, authContext?: BeyondMcpAuthContext): Promise<Response> {
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
      this.logger.debug('HttpTransport: Using existing MCP session', { sessionId });
      
      // Update session activity if persistence is enabled
      if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
        this.updateSessionActivityAsync(sessionId);
      }
    } else {
      if (!sessionId && isInitializeRequest(requestBody)) {
        // New initialization request
        const newSessionId = randomUUID();
        
        // 🚨 PRESERVED MCP SDK INTEGRATION - DO NOT MODIFY
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (initializedSessionId) => {
            this.mcpTransports.set(initializedSessionId, transport);
            this.logger.info('HttpTransport: New MCP session initialized', {
              sessionId: initializedSessionId,
            });
            
            // Persist the new session if enabled
            if (this.config.enableTransportPersistence && this.dependencies.sessionStore) {
              this.persistSessionAsync(initializedSessionId, transport, request);
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
              this.markSessionInactiveAsync(sessionIdToCleanup);
            }
            
            this.logger.info('HttpTransport: MCP session closed', {
              sessionId: sessionIdToCleanup,
            });
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
      
      // 🚨 PRESERVED TRANSPORT HANDLING - DO NOT MODIFY TYPE CASTING
      await transport.handleRequest(
        nodeReq,
        nodeRes as unknown as ServerResponse<IncomingMessage>,
        requestBody,
      );
      
      // POST requests ALWAYS return JSON and complete immediately
      // Use SimpleResponseCapture - no SSE handling
      this.logger.debug('HttpTransport: POST request - waiting for normal completion', {
        sessionId: transport.sessionId,
      });
      
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
   * 🚨 CRITICAL COMPATIBILITY CODE - PRESERVED FROM MCPRequestHandler.ts
   * Handle GET requests (SSE) with session activity tracking
   * Lines ~345-426 from original MCPRequestHandler.ts
   */
  private async handleMCPGet(request: Request, method: string, sdkMcpServer: SdkMcpServer, authContext?: BeyondMcpAuthContext): Promise<Response> {
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
      this.updateSessionActivityAsync(sessionId);
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
        }
      });
      
      // 🚨 PRESERVED RESPONSE ADAPTER - Create Node.js-compatible ServerResponse
      const serverResponse = new ReadableStreamServerResponse(streamController!, sessionId);
      const nodeRes = serverResponse.createNodeResponse();
      const nodeReq = this.createNodeStyleRequest(request, method);
      
      // Track for cleanup during session termination
      this.activeSSEStreams.set(sessionId, {
        forceComplete: () => serverResponse.close(),
        isSSE: () => true,
        isResponseEnded: () => false
      });
      
      // Start SSE keepalive to prevent network timeout disconnections
      this.startSSEKeepalive(sessionId, serverResponse);
      
      this.logger.debug('HttpTransport: Awaiting transport setup, then returning streaming response', { sessionId });
      
      try {
        // 🚨 CRITICAL: Await transport to let it set up SSE first
        await transport.handleRequest(nodeReq, nodeRes as any);
        
        this.logger.debug('HttpTransport: Transport SSE setup completed, returning streaming response', { sessionId });
        
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
   * 🚨 CRITICAL COMPATIBILITY CODE - PRESERVED FROM MCPRequestHandler.ts
   * Handle DELETE requests (session termination) with persistence cleanup
   * Lines ~432-508 from original MCPRequestHandler.ts
   */
  private async handleMCPDelete(request: Request, method: string, sdkMcpServer: SdkMcpServer, authContext?: BeyondMcpAuthContext): Promise<Response> {
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
      this.logger.debug('HttpTransport: DELETE for non-existent session (already terminated)', { sessionId });
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        result: { message: 'Session already terminated or expired' },
        id: null
      }), {
        status: 200, // Success - idempotent operation
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
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
        this.markSessionInactiveAsync(sessionId);
      }
      
      this.logger.info('HttpTransport: MCP session terminated cleanly', {
        sessionId,
        hadActiveSSE: this.activeSSEStreams.has(sessionId),
      });
      
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
   * Line ~629 from original MCPRequestHandler.ts
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
        // Send SSE comment ping to keep connection alive
        // Format: ": keepalive\n\n" (SSE comment format - comments are ignored by clients)
        const pingMessage = ': keepalive\n\n';
        
        if (nodeResponse && typeof nodeResponse.write === 'function' && !serverResponse.isStreamEnded()) {
          const success = nodeResponse.write(pingMessage);
          if (success) {
            this.logger.debug('HttpTransport: Sent SSE keepalive ping', { sessionId });
          } else {
            this.logger.warn('HttpTransport: SSE keepalive write failed - stopping', { sessionId });
            this.stopSSEKeepalive(sessionId);
          }
        } else {
          this.logger.warn('HttpTransport: SSE keepalive failed - response ended or not writable', { 
            sessionId, 
            hasNodeResponse: !!nodeResponse,
            isEnded: serverResponse.isStreamEnded()
          });
          this.stopSSEKeepalive(sessionId);
        }
      } catch (error) {
        this.logger.error('HttpTransport: SSE keepalive error', toError(error), { sessionId });
        this.stopSSEKeepalive(sessionId);
      }
    }, this.KEEPALIVE_INTERVAL_MS);
    
    // Store interval for cleanup
    this.sseKeepaliveIntervals.set(sessionId, keepaliveInterval);
    
    this.logger.info('HttpTransport: SSE keepalive started', { 
      sessionId, 
      intervalMs: this.KEEPALIVE_INTERVAL_MS 
    });
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
   * Force close any active SSE stream for a session
   * Preserved from MCPRequestHandler.ts lines ~784-808
   */
  private async forceCloseActiveSSEStream(sessionId: string): Promise<void> {
    const activeSSEStream = this.activeSSEStreams.get(sessionId);
    
    if (!activeSSEStream) {
      this.logger.debug('HttpTransport: No active SSE stream to close', { sessionId });
      return;
    }
    
    this.logger.info('HttpTransport: Force closing active SSE stream', { sessionId });
    
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
  private persistSessionAsync(sessionId: string, transport: StreamableHTTPServerTransport, request: Request): void {
    // Implementation depends on TransportPersistenceService availability
    // Placeholder for future integration
  }
  
  private updateSessionActivityAsync(sessionId: string): void {
    // Implementation depends on TransportPersistenceService availability
    // Placeholder for future integration
  }
  
  private markSessionInactiveAsync(sessionId: string): void {
    // Implementation depends on TransportPersistenceService availability
    // Placeholder for future integration
  }
  
  /**
   * Create standardized error response
   * Preserved from MCPRequestHandler.ts
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
  
  getMetrics(): HttpTransportMetrics {
    const avgResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;
    
    return {
      transport: 'http',
      uptime: Date.now() - this.startTime,
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
        requestsPerSecond: this.requestCount / ((Date.now() - this.startTime) / 1000),
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
 * Preserved from MCPRequestHandler.ts lines ~806-948
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
 * Preserved from MCPRequestHandler.ts lines ~956-1175
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
          listeners.forEach(listener => {
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