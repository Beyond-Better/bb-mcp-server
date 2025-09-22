/**
 * Request Context Management for Transport Layer
 * 
 * Maintains context across async operations in transport layer
 * Uses AsyncLocalStorage for thread-safe context management
 * Preserved patterns from MCPRequestHandler.ts
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContextData, RequestContextLogData, MCPRequest, TransportType, SessionData, BeyondMcpAuthContext } from './TransportTypes.ts';

/**
 * Request context for MCP requests
 * Maintains state across the request lifecycle
 * Preserved from MCPRequestHandler.ts context management patterns
 */
export class RequestContext {
  public readonly requestId: string;
  public readonly sessionId: string | undefined;
  public readonly transport: TransportType;
  public readonly startTime: number;
  public readonly mcpRequest: MCPRequest;
  
  // Authentication context (preserved from MCPRequestHandler)
  public authenticatedUserId?: string;
  public clientId?: string;
  public scopes: string[] = [];
  
  // Request metadata
  public metadata: Record<string, any> = {};
  public traceId?: string;
  public parentSpanId?: string;
  
  // Transport-specific data
  public httpRequest?: Request;
  public sessionData?: SessionData;
  
  // Performance tracking
  public performanceMarks: Map<string, number> = new Map();
  
  constructor(data: RequestContextData) {
    this.requestId = data.requestId ?? crypto.randomUUID();
    this.sessionId = data.sessionId ?? undefined;
    this.transport = data.transport;
    this.startTime = Date.now();
    this.mcpRequest = data.mcpRequest;
    
    // Set authentication context if provided
    if (data.authenticatedUserId) {
      this.authenticatedUserId = data.authenticatedUserId;
    }
    if (data.clientId) {
      this.clientId = data.clientId;
    }
    if (data.scopes) {
      this.scopes = data.scopes;
    }
    
    // Set additional context data
    if (data.httpRequest) {
      this.httpRequest = data.httpRequest;
    }
    if (data.sessionData) {
      this.sessionData = data.sessionData;
    }
    if (data.metadata) {
      this.metadata = { ...data.metadata };
    }
    
    // Set initial performance mark
    this.performanceMarks.set('request_start', this.startTime);
  }
  
  /**
   * Create context from MCP auth context (from MCPRequestHandler patterns)
   */
  static fromMCPAuthContext(
    beyondMcpAuthContext: BeyondMcpAuthContext,
    mcpRequest: MCPRequest,
    transport: TransportType,
    additionalData?: {
      sessionId?: string;
      httpRequest?: Request;
      sessionData?: SessionData;
      metadata?: Record<string, any>;
    }
  ): RequestContext {
    return new RequestContext({
      requestId: beyondMcpAuthContext.requestId,
      sessionId: additionalData?.sessionId ?? undefined,
      transport,
      mcpRequest,
      authenticatedUserId: beyondMcpAuthContext.authenticatedUserId,
      clientId: beyondMcpAuthContext.clientId,
      scopes: beyondMcpAuthContext.scopes,
      httpRequest: additionalData?.httpRequest ?? undefined,
      sessionData: additionalData?.sessionData ?? undefined,
      metadata: additionalData?.metadata ?? undefined,
    });
  }
  
  /**
   * Set authentication context
   */
  setAuthentication(userId: string, clientId: string, scopes: string[] = []): void {
    this.authenticatedUserId = userId;
    this.clientId = clientId;
    this.scopes = [...scopes];
  }
  
  /**
   * Update authentication scopes
   */
  updateScopes(scopes: string[]): void {
    this.scopes = [...scopes];
  }
  
  /**
   * Set metadata value
   */
  setMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }
  
  /**
   * Get metadata value
   */
  getMetadata<T>(key: string): T | undefined {
    return this.metadata[key] as T;
  }
  
  /**
   * Set multiple metadata values
   */
  setMultipleMetadata(metadata: Record<string, any>): void {
    Object.assign(this.metadata, metadata);
  }
  
  /**
   * Performance timing helpers
   */
  mark(name: string): void {
    this.performanceMarks.set(name, Date.now());
  }
  
  /**
   * Get duration between performance marks
   */
  getDuration(startMark: string, endMark?: string): number | null {
    const startTime = this.performanceMarks.get(startMark);
    if (!startTime) return null;
    
    const endTime = endMark 
      ? this.performanceMarks.get(endMark)
      : Date.now();
    
    if (!endTime) return null;
    
    return endTime - startTime;
  }
  
  /**
   * Get total elapsed time since request start
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
  
  /**
   * Get elapsed time with better precision
   */
  getElapsedTime(): {
    milliseconds: number;
    seconds: number;
    formatted: string;
  } {
    const ms = this.getElapsedMs();
    const seconds = ms / 1000;
    
    return {
      milliseconds: ms,
      seconds: parseFloat(seconds.toFixed(3)),
      formatted: seconds < 1 ? `${ms}ms` : `${seconds.toFixed(3)}s`,
    };
  }
  
  /**
   * Authentication state checks
   */
  isAuthenticated(): boolean {
    return !!this.authenticatedUserId;
  }
  
  /**
   * Check if context has specific scope
   */
  hasScope(scope: string): boolean {
    return this.scopes.includes(scope);
  }
  
  /**
   * Check if context has all required scopes
   */
  hasAllScopes(requiredScopes: string[]): boolean {
    return requiredScopes.every(scope => this.hasScope(scope));
  }
  
  /**
   * Check if context has any of the required scopes
   */
  hasAnyScope(requiredScopes: string[]): boolean {
    return requiredScopes.some(scope => this.hasScope(scope));
  }
  
  /**
   * Get authentication info summary
   */
  getAuthInfo(): {
    authenticated: boolean;
    userId: string | undefined;
    clientId: string | undefined;
    scopes: string[];
    scopeCount: number;
  } {
    return {
      authenticated: this.isAuthenticated(),
      userId: this.authenticatedUserId,
      clientId: this.clientId,
      scopes: [...this.scopes],
      scopeCount: this.scopes.length,
    };
  }
  
  /**
   * Session context helpers
   */
  hasSession(): boolean {
    return !!this.sessionId;
  }
  
  /**
   * Get session info summary
   */
  getSessionInfo(): {
    hasSession: boolean;
    sessionId: string | undefined;
    sessionData: SessionData | undefined;
  } {
    return {
      hasSession: this.hasSession(),
      sessionId: this.sessionId,
      sessionData: this.sessionData,
    };
  }
  
  /**
   * MCP request helpers
   */
  getMCPMethod(): string {
    return this.mcpRequest.method;
  }
  
  /**
   * Get MCP request info summary
   */
  getMCPRequestInfo(): {
    id: string | number;
    method: string;
    hasParams: boolean;
    paramsCount: number;
  } {
    const params = this.mcpRequest.params;
    const paramsCount = params ? 
      (Array.isArray(params) ? params.length : Object.keys(params).length) : 0;
    
    return {
      id: this.mcpRequest.id,
      method: this.mcpRequest.method,
      hasParams: !!params,
      paramsCount,
    };
  }
  
  /**
   * Create logging data structure
   * Preserved pattern from MCPRequestHandler.ts
   */
  toLogData(): RequestContextLogData {
    return {
      requestId: this.requestId,
      sessionId: this.sessionId,
      transport: this.transport,
      authenticatedUserId: this.authenticatedUserId,
      clientId: this.clientId,
      scopes: [...this.scopes],
      elapsedMs: this.getElapsedMs(),
      metadata: { ...this.metadata },
    };
  }
  
  /**
   * Create detailed logging data with performance marks
   */
  toDetailedLogData(): RequestContextLogData & {
    mcpRequest: {
      id: string | number;
      method: string;
      hasParams: boolean;
    };
    performance: {
      elapsedMs: number;
      marks: Record<string, number>;
    };
    session: {
      hasSession: boolean;
      sessionId: string | undefined;
    };
  } {
    const baseLogData = this.toLogData();
    
    return {
      ...baseLogData,
      mcpRequest: {
        id: this.mcpRequest.id,
        method: this.mcpRequest.method,
        hasParams: !!this.mcpRequest.params,
      },
      performance: {
        elapsedMs: this.getElapsedMs(),
        marks: Object.fromEntries(this.performanceMarks),
      },
      session: {
        hasSession: this.hasSession(),
        sessionId: this.sessionId,
      },
    };
  }
  
  /**
   * Clone context with updates
   */
  clone(updates: Partial<{
    metadata: Record<string, any>;
    scopes: string[];
    sessionData: SessionData;
  }>): RequestContext {
    const cloned = new RequestContext({
      requestId: this.requestId,
      sessionId: this.sessionId ?? undefined,
      transport: this.transport,
      mcpRequest: this.mcpRequest,
      authenticatedUserId: this.authenticatedUserId,
      clientId: this.clientId,
      scopes: this.scopes,
      httpRequest: this.httpRequest ?? undefined,
      sessionData: this.sessionData ?? undefined,
      metadata: this.metadata,
    });
    
    // Apply updates
    if (updates.metadata) {
      cloned.setMultipleMetadata(updates.metadata);
    }
    if (updates.scopes) {
      cloned.updateScopes(updates.scopes);
    }
    if (updates.sessionData) {
      cloned.sessionData = updates.sessionData;
    }
    
    // Copy performance marks
    cloned.performanceMarks = new Map(this.performanceMarks);
    
    return cloned;
  }
  
  /**
   * Get context summary for debugging
   */
  getSummary(): {
    requestId: string;
    transport: TransportType;
    method: string;
    authenticated: boolean;
    hasSession: boolean;
    elapsedMs: number;
    scopeCount: number;
  } {
    return {
      requestId: this.requestId,
      transport: this.transport,
      method: this.getMCPMethod(),
      authenticated: this.isAuthenticated(),
      hasSession: this.hasSession(),
      elapsedMs: this.getElapsedMs(),
      scopeCount: this.scopes.length,
    };
  }
  
  /**
   * Execute operation within this context using AsyncLocalStorage
   * Preserved pattern from MCPRequestHandler.ts
   */
  async executeWithContext<T>(operation: () => Promise<T>): Promise<T> {
    return await requestContextStorage.run(this, operation);
  }
  
  /**
   * Static method to get current context from AsyncLocalStorage
   * Preserved pattern from MCPRequestHandler.ts
   */
  static getCurrentContext(): RequestContext | null {
    return requestContextStorage.getStore() || null;
  }
  
  /**
   * Static method to check if we're currently in a request context
   */
  static hasCurrentContext(): boolean {
    return !!requestContextStorage.getStore();
  }
  
  /**
   * Static method to get current context or throw error
   */
  static requireCurrentContext(): RequestContext {
    const context = requestContextStorage.getStore();
    if (!context) {
      throw new Error('No request context available - operation must be called within request context');
    }
    return context;
  }
  
  /**
   * Static helper to create context for testing
   */
  static createTestContext(overrides: Partial<RequestContextData> = {}): RequestContext {
    return new RequestContext({
      requestId: undefined,
      sessionId: undefined,
      transport: 'http',
      mcpRequest: {
        id: 'test-request',
        method: 'test/method',
        jsonrpc: '2.0',
      },
      authenticatedUserId: undefined,
      clientId: undefined,
      scopes: undefined,
      httpRequest: undefined,
      sessionData: undefined,
      metadata: undefined,
      ...overrides,
    });
  }
}

/**
 * AsyncLocalStorage for transport context
 * Preserved from MCPRequestHandler.ts patterns
 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Export the storage for advanced use cases
 */
export { requestContextStorage };

/**
 * Helper function to execute operation with context
 * Convenience wrapper for RequestContext.executeWithContext
 */
export async function executeWithRequestContext<T>(
  context: RequestContext,
  operation: () => Promise<T>
): Promise<T> {
  return await context.executeWithContext(operation);
}

/**
 * Helper function to get current context with type safety
 */
export function getCurrentRequestContext(): RequestContext | null {
  return RequestContext.getCurrentContext();
}

/**
 * Helper function to require current context with better error message
 */
export function requireRequestContext(): RequestContext {
  return RequestContext.requireCurrentContext();
}