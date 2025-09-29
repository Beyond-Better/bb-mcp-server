/**
 * Request Context Management for MCP servers
 *
 * Handles AsyncLocalStorage context across MCP requests with:
 * - Thread-safe user identification
 * - Request context validation
 * - Context creation utilities
 * - Authentication context management
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// Import library components
import { Logger } from '../utils/Logger.ts';

// Import types
import type { BeyondMcpRequestContext, CreateContextData } from '../types/BeyondMcpTypes.ts';

/**
 * Request context management for MCP servers
 */
export class RequestContextManager {
  private static contextStorage = new AsyncLocalStorage<BeyondMcpRequestContext>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Execute an operation within a specific context
   */
  async executeWithAuthContext<T>(
    context: BeyondMcpRequestContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.logger.debug('RequestContextManager: Executing with auth context', {
      authenticatedUserId: context.authenticatedUserId,
      clientId: context.clientId,
      requestId: context.requestId,
      scopes: context.scopes,
    });

    // Validate context before execution
    if (!this.validateContext(context)) {
      throw new Error('Invalid context: missing required fields');
    }

    return RequestContextManager.contextStorage.run(context, operation);
  }

  /**
   * Get the current context from AsyncLocalStorage
   */
  getCurrentContext(): BeyondMcpRequestContext | null {
    return RequestContextManager.contextStorage.getStore() || null;
  }

  /**
   * Get the current authenticated user ID (convenience method)
   */
  getAuthenticatedUserId(): string | null {
    const context = this.getCurrentContext();
    return context?.authenticatedUserId || null;
  }

  /**
   * Get the current client ID (convenience method)
   */
  getClientId(): string | null {
    const context = this.getCurrentContext();
    return context?.clientId || null;
  }

  /**
   * Get the current request ID (convenience method)
   */
  getRequestId(): string | null {
    const context = this.getCurrentContext();
    return context?.requestId || null;
  }

  /**
   * Get the current scopes (convenience method)
   */
  getScopes(): string[] {
    const context = this.getCurrentContext();
    return context?.scopes || [];
  }

  /**
   * Check if user has specific scope
   */
  hasScope(scope: string): boolean {
    const scopes = this.getScopes();
    return scopes.includes(scope);
  }

  /**
   * Check if user has any of the specified scopes
   */
  hasAnyScope(scopes: string[]): boolean {
    const userScopes = this.getScopes();
    return scopes.some((scope) => userScopes.includes(scope));
  }

  /**
   * Check if user has all of the specified scopes
   */
  hasAllScopes(scopes: string[]): boolean {
    const userScopes = this.getScopes();
    return scopes.every((scope) => userScopes.includes(scope));
  }

  /**
   * Create a new context with validation
   */
  createContext(data: CreateContextData): BeyondMcpRequestContext {
    const context: BeyondMcpRequestContext = {
      authenticatedUserId: data.authenticatedUserId,
      clientId: data.clientId,
      scopes: data.scopes || [],
      requestId: data.requestId || crypto.randomUUID(),
      startTime: performance.now(),
      metadata: data.metadata || {},
    };

    // Only add sessionId if it exists (exactOptionalPropertyTypes compliance)
    if (data.sessionId) {
      context.sessionId = data.sessionId;
    }

    if (!this.validateContext(context)) {
      throw new Error('Invalid context data provided');
    }

    this.logger.debug('RequestContextManager: Created new context', {
      authenticatedUserId: context.authenticatedUserId,
      clientId: context.clientId,
      requestId: context.requestId,
      scopes: context.scopes,
    });

    return context;
  }

  /**
   * Validate context has required fields
   */
  validateContext(context: BeyondMcpRequestContext): boolean {
    const isValid = !!(
      context.authenticatedUserId &&
      context.clientId &&
      context.requestId &&
      Array.isArray(context.scopes)
    );

    if (!isValid) {
      this.logger.warn('RequestContextManager: Context validation failed', {
        hasAuthenticatedUserId: !!context.authenticatedUserId,
        hasClientId: !!context.clientId,
        hasRequestId: !!context.requestId,
        hasScopesArray: Array.isArray(context.scopes),
        context,
      });
    }

    return isValid;
  }

  /**
   * Update context metadata
   */
  updateContextMetadata(metadata: Record<string, unknown>): void {
    const context = this.getCurrentContext();
    if (context) {
      context.metadata = { ...context.metadata, ...metadata };
      this.logger.debug('RequestContextManager: Updated context metadata', {
        requestId: context.requestId,
        updatedFields: Object.keys(metadata),
      });
    } else {
      this.logger.warn('RequestContextManager: Cannot update metadata - no active context');
    }
  }

  /**
   * Get context metadata
   */
  getContextMetadata(): Record<string, unknown> {
    const context = this.getCurrentContext();
    return context?.metadata || {};
  }

  /**
   * Get context duration in milliseconds
   */
  getContextDuration(): number | null {
    const context = this.getCurrentContext();
    if (!context || !context.startTime) return null;

    return performance.now() - context.startTime;
  }

  /**
   * Create context from authentication headers or session
   */
  createContextFromAuth(authData: {
    userId: string;
    clientId: string;
    scopes?: string[];
    sessionId?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): BeyondMcpRequestContext {
    const contextData: CreateContextData = {
      authenticatedUserId: authData.userId,
      clientId: authData.clientId,
    };

    // Only add optional properties if they exist (exactOptionalPropertyTypes compliance)
    if (authData.scopes) {
      contextData.scopes = authData.scopes;
    }
    if (authData.sessionId) {
      contextData.sessionId = authData.sessionId;
    }
    if (authData.requestId) {
      contextData.requestId = authData.requestId;
    }
    if (authData.metadata) {
      contextData.metadata = authData.metadata;
    }

    return this.createContext(contextData);
  }

  /**
   * Log context information (for debugging)
   */
  logCurrentContext(message?: string): void {
    const context = this.getCurrentContext();
    const prefix = message ? `${message}: ` : 'Current context: ';

    if (context) {
      this.logger.debug(prefix, {
        authenticatedUserId: context.authenticatedUserId,
        clientId: context.clientId,
        requestId: context.requestId,
        scopes: context.scopes,
        sessionId: context.sessionId,
        duration: this.getContextDuration(),
        metadataKeys: Object.keys(context.metadata || {}),
      });
    } else {
      this.logger.debug(`${prefix}No active context`);
    }
  }

  /**
   * Check if there is an active context
   */
  hasActiveContext(): boolean {
    return this.getCurrentContext() !== null;
  }

  /**
   * Get context summary for logging/audit purposes
   */
  getContextSummary(): {
    hasContext: boolean;
    authenticatedUserId?: string;
    clientId?: string;
    requestId?: string;
    scopes?: string[];
    duration?: number;
  } {
    const context = this.getCurrentContext();

    if (!context) {
      return { hasContext: false };
    }

    const summary: {
      hasContext: boolean;
      authenticatedUserId?: string;
      clientId?: string;
      requestId?: string;
      scopes?: string[];
      duration?: number;
    } = {
      hasContext: true,
      authenticatedUserId: context.authenticatedUserId,
      clientId: context.clientId,
      requestId: context.requestId,
      scopes: context.scopes,
    };

    // Only add duration if it exists (exactOptionalPropertyTypes compliance)
    const duration = this.getContextDuration();
    if (duration !== null) {
      summary.duration = duration;
    }

    return summary;
  }

  /**
   * Execute operation with temporary context override
   */
  async executeWithTemporaryContext<T>(
    contextOverride: Partial<BeyondMcpRequestContext>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const currentContext = this.getCurrentContext();
    if (!currentContext) {
      throw new Error('No base context available for temporary override');
    }

    const temporaryContext: BeyondMcpRequestContext = {
      ...currentContext,
      ...contextOverride,
      // Ensure required fields are not overridden to null/undefined
      authenticatedUserId: contextOverride.authenticatedUserId ||
        currentContext.authenticatedUserId,
      clientId: contextOverride.clientId || currentContext.clientId,
      requestId: contextOverride.requestId || currentContext.requestId,
      scopes: contextOverride.scopes || currentContext.scopes,
    };

    this.logger.debug('RequestContextManager: Executing with temporary context override', {
      originalRequestId: currentContext.requestId,
      temporaryRequestId: temporaryContext.requestId,
      overrideFields: Object.keys(contextOverride),
    });

    return this.executeWithAuthContext(temporaryContext, operation);
  }
}
