/**
 * Tool Registry with comprehensive Zod validation
 * Extracted from ActionStepMCPServer.ts - Tool registration logic
 *
 * Manages tool registration and validation for MCP servers with:
 * - Sophisticated Zod schema validation
 * - Dynamic enum generation for workflow names
 * - Comprehensive error handling and validation
 * - Tool management and inspection capabilities
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import type { CallToolResult } from 'mcp/types.js';
import { z, type ZodObject, type ZodRawShape, type ZodSchema } from 'zod';

// Import library components
import { Logger } from '../utils/Logger.ts';
import { ErrorHandler } from '../utils/ErrorHandler.ts';
import { toError } from '../utils/Error.ts';

// Import types
import {
  ToolHandlerMode,
  type RegisteredTool,
  type ToolDefinition,
  type ToolHandler,
  type ToolRegistryDependencies,
  type ToolRegistrationOptions,
  type ValidationResult,
} from '../types/BeyondMcpTypes.ts';

/**
 * Tool registry with comprehensive Zod validation
 * EXTRACTED: From ActionStepMCPServer.ts tool registration patterns
 */
export class ToolRegistry {
  private static instance: ToolRegistry | undefined;

  private tools = new Map<string, RegisteredTool>();
  private toolValidators = new Map<string, ZodObject<any>>();

  private _sdkMcpServer: SdkMcpServer | undefined;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor(dependencies: ToolRegistryDependencies) {
    if (dependencies.sdkMcpServer) this._sdkMcpServer = dependencies.sdkMcpServer;
    this.logger = dependencies.logger;
    this.errorHandler = dependencies.errorHandler;
  }

  /**
   * Get singleton instance of ToolRegistry
   */
  static getInstance(
    dependencies: { logger: Logger; config?: ToolRegistryDependencies; errorHandler: ErrorHandler },
  ): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry(dependencies);
    }
    return ToolRegistry.instance;
  }

  /**
   * Clear singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    ToolRegistry.instance = undefined;
  }

  get sdkMcpServer(): SdkMcpServer | undefined {
    return this._sdkMcpServer;
  }
  set sdkMcpServer(sdkMcpServer: SdkMcpServer) {
    this._sdkMcpServer = sdkMcpServer;
  }

  /**
   * Register a tool with comprehensive Zod validation
   */
  registerTool<T extends Record<string, ZodSchema>>(
    name: string,
    definition: ToolDefinition<T>,
    handler: ToolHandler<T>,
    options?: ToolRegistrationOptions,
  ): void {
    const handlerMode = options?.handlerMode || ToolHandlerMode.MANAGED;

    this.logger.debug('ToolRegistry: Registering tool', {
      name,
      title: definition.title,
      category: definition.category,
      handlerMode,
    });

    if (!this._sdkMcpServer) {
      throw ErrorHandler.wrapError('SDK MCP server has not been set - create a new BeyondMcpServer first to set sdkMcpServer in ToolRegistry', 'TOOL_REGISTRATION_FAILED', {
        toolName: name,
      });
    }

    try {
      // Validate tool definition and handler
      const validationErrors = this.validateToolRegistration(name, definition, handler);
      if (validationErrors.length > 0) {
        const errorMessage = `Tool registration has errors:\n${validationErrors.join('\n')}`;
        this.logger.error('ToolRegistry: Tool registration validation failed', toError(errorMessage), {
          toolName: name,
          errors: validationErrors,
        });
        throw new Error(errorMessage);
      }

      // Create Zod validator from input schema (always needed for tracking)
      const validator = z.object(definition.inputSchema);
      this.toolValidators.set(name, validator);

      if (handlerMode === ToolHandlerMode.NATIVE) {
        // NATIVE MODE: Direct registration - tool handles own validation/errors
        this._sdkMcpServer.registerTool(
          name,
          {
            title: definition.title,
            description: definition.description,
            inputSchema: definition.inputSchema as any, // Cast Zod schema for MCP SDK
          },
          handler as any // Direct handler, no wrapper
        );
      } else {
        // MANAGED MODE: Complex validation and error handling (default)
        this._sdkMcpServer.registerTool(
          name,
          {
            title: definition.title,
            description: definition.description,
            inputSchema: definition.inputSchema as any, // Cast Zod schema for MCP SDK
          },
          async (args: any, extra: any) => {
            // PRESERVED: Exact validation and error handling pattern
            try {
              // Validate input with Zod
              const validation = await this.validateToolInput(name, args);
              if (!validation.success) {
                this.logger.warn('ToolRegistry: Tool validation failed', {
                  toolName: name,
                  error: validation.error?.message,
                  args,
                });

                return {
                  content: [{
                    type: 'text',
                    text: `Validation error: ${
                      validation.error?.message || 'Unknown validation error'
                    }`,
                  }],
                  isError: true,
                };
              }

              // Execute handler with validated args
              const result = await handler(validation.data, {
                requestId: typeof extra.requestId === 'number'
                  ? String(extra.requestId)
                  : extra.requestId,
                ...(extra ? { ...extra } : {}),
              } as any);

              // PRESERVED: Result format from ActionStepMCPServer
              return {
                content: result.content,
                _meta: {
                  ...(extra?._meta || {}),
                  ...result._meta,
                },
              };
            } catch (error) {
              this.logger.error(`ToolRegistry: Tool execution failed: ${name}`, toError(error));

              const wrappedError = ErrorHandler.wrapError(error, 'TOOL_EXECUTION_FAILED', {
                toolName: name,
                args,
              });

              return {
                content: [{
                  type: 'text',
                  text: `Tool execution error: ${wrappedError.message}`,
                }],
                isError: true,
              };
            }
          },
        );
      }

      // Store tool registration with metadata
      const registeredTool: RegisteredTool = {
        name,
        definition,
        handler,
        validator,
        registeredAt: new Date(),
        callCount: 0,
        averageExecutionTime: 0,
        // lastCalled is omitted since it's undefined - TypeScript exactOptionalPropertyTypes
      };

      this.tools.set(name, registeredTool);

      this.logger.debug(`ToolRegistry: Tool registered successfully: ${name}`, {
        title: definition.title,
        category: definition.category,
        hasValidator: !!validator,
      });
    } catch (error) {
      this.logger.error(`ToolRegistry: Failed to register tool: ${name}`, toError(error));
      throw ErrorHandler.wrapError(error, 'TOOL_REGISTRATION_FAILED', {
        toolName: name,
      });
    }
  }

  /**
   * Validate tool input with detailed error reporting
   * PRESERVED: Exact validation pattern from ActionStepMCPServer
   */
  async validateToolInput(
    toolName: string,
    input: unknown,
  ): Promise<ValidationResult<any>> {
    const validator = this.toolValidators.get(toolName);
    if (!validator) {
      return {
        success: false,
        error: new Error(`Tool '${toolName}' not found`),
      };
    }

    try {
      const data = await validator.parseAsync(input);
      return { success: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path ? path + ': ' : ''}${err.message}`;
        }).join(', ');

        return {
          success: false,
          error: new Error(`Validation failed: ${errorDetails}`),
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown validation error'),
      };
    }
  }

  /**
   * Create dynamic enum from array of values
   * PRESERVED: Exact pattern used in ActionStepMCPServer for workflow names
   */
  static createDynamicEnum<T extends string>(values: T[]): z.ZodEnum<[T, ...T[]]> {
    if (values.length === 0) {
      throw new Error('Enum must have at least one value');
    }
    return z.enum(values as [T, ...T[]]);
  }

  /**
   * Update tool statistics after execution
   */
  updateToolStats(toolName: string, executionTimeMs: number): void {
    const tool = this.tools.get(toolName);
    if (!tool) return;

    tool.callCount = (tool.callCount || 0) + 1;
    tool.lastCalled = new Date();

    // Calculate running average execution time
    const currentAverage = tool.averageExecutionTime || 0;
    tool.averageExecutionTime = (currentAverage * (tool.callCount - 1) + executionTimeMs) /
      tool.callCount;

    this.logger.debug('ToolRegistry: Updated tool stats', {
      toolName,
      callCount: tool.callCount,
      executionTimeMs,
      averageExecutionTime: tool.averageExecutionTime,
    });
  }

  /**
   * Get registered tool information
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): RegisteredTool[] {
    return this.getTools().filter((tool) => tool.definition.category === category);
  }

  /**
   * Get tool schema for inspection
   */
  getToolSchema(name: string): ZodObject<any> | undefined {
    return this.toolValidators.get(name);
  }

  /**
   * Get tool definition for inspection
   */
  getToolDefinition(name: string): ToolDefinition<any> | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Validate tool registration (definition and handler)
   */
  private validateToolRegistration<T extends Record<string, ZodSchema>>(
    name: string,
    definition: ToolDefinition<T>,
    handler: ToolHandler<T>
  ): string[] {
    const errors: string[] = [];

    // Validate name
    if (!name || typeof name !== 'string') {
      errors.push('Tool name is required and must be a string');
    }

    // Validate definition
    if (!definition) {
      errors.push('Tool definition is required');
      return errors; // Can't validate further without definition
    }

    if (!definition.title || typeof definition.title !== 'string') {
      errors.push('Tool title is required and must be a string');
    }

    if (!definition.description || typeof definition.description !== 'string') {
      errors.push('Tool description is required and must be a string');
    }

    if (!definition.inputSchema || typeof definition.inputSchema !== 'object') {
      errors.push('Tool inputSchema is required and must be an object');
    }

    // Validate handler
    if (!handler || typeof handler !== 'function') {
      errors.push('Tool handler is required and must be a function');
    }

    return errors;
  }

  /**
   * Test tool validation without execution
   */
  async testToolValidation(name: string, input: unknown): Promise<ValidationResult<any>> {
    return await this.validateToolInput(name, input);
  }

  /**
   * Get tool statistics
   */
  getToolStats(name: string): {
    callCount: number;
    lastCalled?: Date;
    averageExecutionTime: number;
  } | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;

    const stats: {
      callCount: number;
      lastCalled?: Date;
      averageExecutionTime: number;
    } = {
      callCount: tool.callCount || 0,
      averageExecutionTime: tool.averageExecutionTime || 0,
    };

    // Only include lastCalled if it exists (exactOptionalPropertyTypes compliance)
    if (tool.lastCalled) {
      stats.lastCalled = tool.lastCalled;
    }

    return stats;
  }

  /**
   * Get registry statistics
   */
  getRegistryStats(): {
    totalTools: number;
    totalCalls: number;
    averageExecutionTime: number;
    toolsByCategory: Record<string, number>;
    mostUsedTools: Array<{ name: string; callCount: number }>;
  } {
    const tools = this.getTools();
    const totalCalls = tools.reduce((sum, tool) => sum + (tool.callCount || 0), 0);
    const totalExecutionTime = tools.reduce(
      (sum, tool) => sum + ((tool.callCount || 0) * (tool.averageExecutionTime || 0)),
      0,
    );

    const toolsByCategory: Record<string, number> = {};
    tools.forEach((tool) => {
      const category = tool.definition.category || 'uncategorized';
      toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
    });

    const mostUsedTools = tools
      .filter((tool) => (tool.callCount || 0) > 0)
      .sort((a, b) => (b.callCount || 0) - (a.callCount || 0))
      .slice(0, 5)
      .map((tool) => ({
        name: tool.name,
        callCount: tool.callCount || 0,
      }));

    return {
      totalTools: tools.length,
      totalCalls,
      averageExecutionTime: totalCalls > 0 ? totalExecutionTime / totalCalls : 0,
      toolsByCategory,
      mostUsedTools,
    };
  }

  /**
   * Clear all registered tools (for testing)
   */
  clear(): void {
    this.tools.clear();
    this.toolValidators.clear();
    this.logger.debug('ToolRegistry: All tools cleared');
  }

  /**
   * Remove a specific tool
   */
  removeTool(name: string): boolean {
    const removed = this.tools.delete(name) && this.toolValidators.delete(name);
    if (removed) {
      this.logger.debug(`ToolRegistry: Tool removed: ${name}`);
    }
    return removed;
  }
}
