/**
 * ToolBase abstract class for bb-mcp-server
 * 
 * Provides a base implementation for tool classes, similar to WorkflowBase.
 * Tool classes can inherit from this to get common functionality and structure.
 * 
 * Features:
 * - Abstract methods for tool registration patterns
 * - Common logging and validation utilities
 * - Plugin system integration support
 * - Consistent tool metadata management
 */

import { z, type ZodSchema } from 'zod'
import type { CallToolResult } from 'mcp/types.js'

// Import library components
import type { Logger } from '../utils/Logger.ts'
import type { AuditLogger } from '../utils/AuditLogger.ts'
import type { ToolRegistry } from './ToolRegistry.ts'
import type {
  ToolDefinition,
  ToolHandler,
  ToolRegistration,
  ToolRegistrationOptions,
} from '../types/BeyondMcpTypes.ts'

import type {
  PluginCategory,
  RateLimitConfig,
} from '../types/PluginTypes.ts'

/**
 * Tool execution context for consistent logging and tracking
 */
export interface ToolContext {
  userId?: string
  requestId?: string
  clientId?: string
  startTime: Date
  logger: Logger
  auditLogger?: AuditLogger
}

/**
 * Tool registration information for plugin system
 */
// export interface ToolRegistration {
//   name: string
//   definition: ToolDefinition<any>
//   handler: ToolHandler<any>
//   options?: ToolRegistrationOptions
// }

/**
 * Tool execution result with enhanced metadata
 */
export interface ToolResult extends CallToolResult {
  executionTime?: number
  metadata?: Record<string, unknown>
}

/**
 * Abstract base class for all tool implementations
 * 
 * Provides common functionality and enforces consistent patterns
 * across different tool classes.
 */
export abstract class ToolBase {
  protected context?: ToolContext
  protected startTime?: number

  // Required tool metadata (similar to WorkflowBase)
  abstract readonly name: string
  abstract readonly version: string
  abstract readonly description: string
  abstract readonly category: PluginCategory
  abstract readonly tags: string[]

  // Optional metadata
  readonly estimatedDuration?: number // seconds
  readonly requiresAuth: boolean = true
  readonly rateLimit?: RateLimitConfig

  /**
   * Abstract method: Get tool definitions for plugin registration
   * This is the key method that tool classes must implement
   * 
   * @returns Array of tool registrations for PluginManager
   */
  abstract getTools(): ToolRegistration[]

  /**
   * Abstract method: Register tools directly with ToolRegistry
   * This supports the direct registration pattern
   * 
   * @param toolRegistry - The registry to register tools with
   */
  abstract registerWith(toolRegistry: ToolRegistry): void

  /**
   * Abstract method: Get tool overview for documentation
   * 
   * @returns Human-readable description of the tool set
   */
  abstract getOverview(): string

  /**
   * Enhanced tool execution wrapper with consistent logging and error handling
   * Tool implementations can use this for consistent execution patterns
   */
  protected async executeWithContext<T>(
    toolName: string,
    args: Record<string, unknown>,
    execution: (args: Record<string, unknown>, context: ToolContext) => Promise<T>,
    context?: Partial<ToolContext>,
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const toolContext: ToolContext = {
      startTime: new Date(),
      logger: context?.logger || this.createFallbackLogger(),
    }
    
    // Only add optional properties if they exist
    if (context?.userId) toolContext.userId = context.userId
    if (context?.requestId) toolContext.requestId = context.requestId
    else toolContext.requestId = crypto.randomUUID()
    if (context?.clientId) toolContext.clientId = context.clientId
    if (context?.auditLogger) toolContext.auditLogger = context.auditLogger

    this.context = toolContext
    this.startTime = startTime

    try {
      this.logInfo(`Tool execution started: ${toolName}`, {
        tool: toolName,
        userId: toolContext.userId,
        requestId: toolContext.requestId,
        argumentKeys: Object.keys(args),
      })

      const result = await execution(args, toolContext)
      const executionTime = Date.now() - startTime

      this.logInfo(`Tool execution completed: ${toolName}`, {
        tool: toolName,
        status: 'success',
        executionTime,
        userId: toolContext.userId,
        requestId: toolContext.requestId,
      })

      // Audit log if available
      await this.logToolExecution(toolName, 'success', executionTime, toolContext)

      return {
        content: Array.isArray(result) ? result : [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }],
        executionTime,
        metadata: {
          tool: toolName,
          executionTime,
          timestamp: new Date().toISOString(),
        },
      }

    } catch (error) {
      const executionTime = Date.now() - startTime
      const toolError = error instanceof Error ? error : new Error(String(error))

      this.logError(`Tool execution failed: ${toolName}`, toolError, {
        tool: toolName,
        status: 'failed',
        executionTime,
        userId: toolContext.userId,
        requestId: toolContext.requestId,
      })

      // Audit log failure
      await this.logToolExecution(toolName, 'failure', executionTime, toolContext)

      return {
        content: [{
          type: 'text',
          text: `Tool execution error in ${toolName}: ${toolError.message}`,
        }],
        isError: true,
        executionTime,
        metadata: {
          tool: toolName,
          error: toolError.message,
          executionTime,
          timestamp: new Date().toISOString(),
        },
      }
    }
  }

  /**
   * Parameter validation helper using Zod
   */
  protected async validateParameters<T>(
    schema: ZodSchema<T>,
    params: unknown,
  ): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
      const validatedParams = await schema.parseAsync(params)
      return { success: true, data: validatedParams }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map((err) => {
          const path = err.path.join('.')
          return `${path ? path + ': ' : ''}${err.message}`
        }).join(', ')
        return { success: false, error: `Validation failed: ${errorDetails}` }
      }
      return { success: false, error: 'Unknown validation error' }
    }
  }

  /**
   * Create standardized success response
   */
  protected createSuccessResponse(
    data: unknown,
    metadata?: Record<string, unknown>,
  ): CallToolResult {
    return {
      content: [{
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      }],
      _meta: metadata,
    }
  }

  /**
   * Create standardized error response
   */
  protected createErrorResponse(
    error: Error | string,
    toolName?: string,
  ): CallToolResult {
    const errorMessage = error instanceof Error ? error.message : error
    const displayMessage = toolName
      ? `Tool execution error in ${toolName}: ${errorMessage}`
      : `Tool error: ${errorMessage}`

    return {
      content: [{
        type: 'text',
        text: displayMessage,
      }],
      isError: true,
    }
  }

  /**
   * Helper to extract user context from tool arguments
   */
  protected extractUserContext(
    args: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): { userId?: string; requestId?: string; clientId?: string } {
    const userId = (args.userId || args.user_id || extra?.userId) as string | undefined
    const requestId = (
      args.requestId ||
      args.request_id ||
      extra?.requestId ||
      extra?.request_id
    ) as string | undefined
    const clientId = (args.clientId || extra?.clientId) as string | undefined

    const result: { userId?: string; requestId?: string; clientId?: string } = {}
    if (userId) result.userId = userId
    if (requestId) result.requestId = requestId
    if (clientId) result.clientId = clientId
    
    return result
  }

  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  protected sanitizeArgsForLogging(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...args }
    const sensitiveKeys = [
      'password',
      'token',
      'apiKey',
      'secret',
      'key',
      'credential',
      'auth',
      'authorization',
    ]

    Object.keys(sanitized).forEach(key => {
      const lowerKey = key.toLowerCase()
      if (sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
        sanitized[key] = '[REDACTED]'
      }
    })

    return sanitized
  }

  /**
   * Logging helpers with consistent format
   */
  protected logInfo(message: string, data?: Record<string, unknown>): void {
    this.context?.logger?.info(`[${this.name}] ${message}`, {
      toolClass: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }

  protected logWarn(message: string, data?: Record<string, unknown>): void {
    this.context?.logger?.warn(`[${this.name}] ${message}`, {
      toolClass: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }

  protected logError(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.context?.logger?.error(`[${this.name}] ${message}`, error, {
      toolClass: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }

  protected logDebug(message: string, data?: Record<string, unknown>): void {
    this.context?.logger?.debug(`[${this.name}] ${message}`, {
      toolClass: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }

  /**
   * Audit logging for tool execution
   */
  private async logToolExecution(
    toolName: string,
    result: 'success' | 'failure',
    executionTime: number,
    context: ToolContext,
  ): Promise<void> {
    if (!context.auditLogger) {
      return
    }

    try {
      // Use the correct AuditLogger method - logSystemEvent for tool operations
      await context.auditLogger.logSystemEvent({
        event: 'tool_execution',
        severity: result === 'success' ? 'info' : 'error',
        details: {
          tool: toolName,
          toolClass: this.name,
          version: this.version,
          category: this.category,
          userId: context.userId || 'unknown',
          requestId: context.requestId || 'unknown',
          result,
          executionTime,
        },
      })
    } catch (error) {
      this.logWarn('Failed to log tool execution to audit log', { error })
    }
  }

  /**
   * Create fallback logger if none provided
   */
  private createFallbackLogger(): Logger {
    return {
      debug: (message: string, data?: any) => console.debug(message, data),
      info: (message: string, data?: any) => console.info(message, data),
      warn: (message: string, data?: any) => console.warn(message, data),
      error: (message: string, error?: Error, data?: any) => console.error(message, error, data),
    } as Logger
  }

  /**
   * Utility methods for tool implementations
   */
  protected getToolCount(): number {
    return this.getTools().length
  }

  protected getToolNames(): string[] {
    return this.getTools().map(tool => tool.name)
  }

  protected getCategory(): PluginCategory {
    return this.category
  }

  protected supportsAuth(): boolean {
    return this.requiresAuth
  }

  protected getEstimatedDuration(): number | undefined {
    return this.estimatedDuration
  }
}
