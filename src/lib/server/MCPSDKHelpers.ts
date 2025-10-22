/**
 * MCP SDK Integration Helpers
 *
 * Utilities for MCP SDK integration with:
 * - Sampling API integration
 * - Elicitation API integration
 * - Protocol handling utilities
 * - Tool schema generation helpers
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import type { CallToolResult } from 'mcp/types.js';

// Import library components
import { Logger } from '../utils/Logger.ts';
import { toError } from '../utils/Error.ts';

// Import types
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitInputRequest,
  ElicitInputResult,
  LoggingLevel,
  RegisteredTool,
  SendNotificationRequest,
} from '../types/BeyondMcpTypes.ts';

/**
 * Utilities for Beyond MCP SDK integration
 */
export class BeyondMcpSDKHelpers {
  private sdkMcpServer: SdkMcpServer;
  private logger: Logger;

  constructor(sdkMcpServer: SdkMcpServer, logger: Logger) {
    this.sdkMcpServer = sdkMcpServer;
    this.logger = logger;
  }

  /**
   * MCP Sampling API integration
   */
  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    this.logger.debug('MCPSDKHelpers: Creating message via MCP sampling API', {
      model: request.model,
      messageCount: request.messages.length,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });

    try {
      // Cast to MCP SDK expected type
      const mcpRequest = {
        ...request,
        maxTokens: request.maxTokens || 2000, // Ensure maxTokens is present
      } as any;

      const result = await this.sdkMcpServer.server.createMessage(mcpRequest);

      this.logger.debug('MCPSDKHelpers: Message created successfully', {
        model: request.model,
        hasContent: !!result?.content,
        contentLength: result?.content ? JSON.stringify(result.content).length : 0,
      });

      // Cast result to expected type with unknown intermediate
      return result as unknown as CreateMessageResult;
    } catch (error) {
      this.logger.error('MCPSDKHelpers: MCP sampling failed:', toError(error));
      throw new Error(
        `MCP sampling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * MCP Notification API integration
   * Sends a logging message notification to the client
   */
  async sendNotification(request: SendNotificationRequest, sessionId?: string): Promise<void> {
    this.logger.debug('MCPSDKHelpers: Sending notification via MCP notification API', {
      level: request.level,
      logger: request.logger,
      hasData: !!request.data,
      sessionId,
    });

    try {
      // Send notification using SDK's sendLoggingMessage
      await this.sdkMcpServer.sendLoggingMessage(
        {
          level: request.level,
          logger: request.logger,
          data: request.data,
        },
        sessionId,
      );

      this.logger.debug('MCPSDKHelpers: Notification sent successfully', {
        level: request.level,
        logger: request.logger,
      });
    } catch (error) {
      this.logger.error('MCPSDKHelpers: MCP notification failed:', toError(error));
      throw new Error(
        `MCP notification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * MCP Elicitation API integration
   */
  async elicitInput(request: ElicitInputRequest): Promise<ElicitInputResult> {
    this.logger.debug('MCPSDKHelpers: Eliciting input via MCP elicitation API', {
      messageLength: request.message.length,
      hasSchema: !!request.requestedSchema,
    });

    try {
      // Cast to MCP SDK expected type
      const mcpRequest = {
        ...request,
        requestedSchema: request.requestedSchema as any,
      };

      const result = await this.sdkMcpServer.server.elicitInput(mcpRequest as any);

      this.logger.debug('MCPSDKHelpers: Input elicited successfully', {
        action: result.action,
        hasContent: !!result.content,
      });

      // Cast result to expected type - handle action mapping
      const mappedResult = {
        ...result,
        action: result.action === 'decline' ? 'reject' : result.action,
      } as ElicitInputResult;

      return mappedResult;
    } catch (error) {
      this.logger.error('MCPSDKHelpers: MCP elicitation failed:', toError(error));
      throw new Error(
        `MCP elicitation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Generate comprehensive tool overview text
   */
  generateToolOverview(tools: RegisteredTool[]): string {
    if (tools.length === 0) {
      return 'No tools available';
    }

    return tools.map((tool, index) => {
      const overview = tool.definition.description || tool.definition.title;
      const category = tool.definition.category ? ` (${tool.definition.category})` : '';
      const tags = tool.definition.tags ? ` [${tool.definition.tags.join(', ')}]` : '';
      const version = tool.definition.version ? ` v${tool.definition.version}` : '';

      return `${index + 1}. **${tool.name}**: ${overview}${category}${tags}${version}`;
    }).join('\n\n');
  }

  /**
   * Generate tool schema documentation
   */
  generateToolSchemaDoc(tool: RegisteredTool): string {
    const { name, definition } = tool;
    const { title, description, category, tags, version } = definition;

    const sections = [
      `# ${title || name}`,
      '',
      `**Name:** \`${name}\``,
      description ? `**Description:** ${description}` : '',
      category ? `**Category:** ${category}` : '',
      tags && tags.length > 0 ? `**Tags:** ${tags.join(', ')}` : '',
      version ? `**Version:** ${version}` : '',
      '',
      '## Input Schema',
      '```json',
      JSON.stringify(definition.inputSchema, null, 2),
      '```',
    ].filter(Boolean);

    return sections.join('\n');
  }

  /**
   * Validate SDK MCP server availability
   */
  validateSdkMcpServer(): void {
    if (!this.sdkMcpServer) {
      throw new Error('SDK MCP server not available - check dependency injection');
    }

    if (!this.sdkMcpServer.server) {
      throw new Error('SDK MCP server.server not available - server may not be initialized');
    }
  }

  /**
   * Create standardized tool response
   */
  createToolResponse(data: unknown, meta?: Record<string, unknown>): CallToolResult {
    return {
      content: [{
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      }],
      _meta: meta,
    };
  }

  /**
   * Create error tool response
   */
  createErrorResponse(error: Error | string, meta?: Record<string, unknown>): CallToolResult {
    const errorMessage = error instanceof Error ? error.message : error;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(
          {
            error: errorMessage,
            status: 'error',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      }],
      isError: true,
      _meta: meta,
    };
  }

  /**
   * Merge tool metadata with existing metadata
   */
  mergeToolMetadata(
    existing?: Record<string, unknown>,
    additional?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...existing,
      ...additional,
    };
  }

  /**
   * Create sampling request with defaults
   */
  createSamplingRequest(
    prompt: string,
    model: string,
    options?: Partial<CreateMessageRequest>,
  ): CreateMessageRequest {
    return {
      model,
      messages: [{
        role: 'user',
        content: { type: 'text', text: prompt },
      }],
      maxTokens: 2000,
      temperature: 0.3,
      ...options,
    };
  }

  /**
   * Create elicitation request with schema validation
   */
  createElicitationRequest(
    message: string,
    requestedSchema: unknown,
  ): ElicitInputRequest {
    // Validate schema is an object
    if (typeof requestedSchema !== 'object' || requestedSchema === null) {
      throw new Error('requestedSchema must be a valid object');
    }

    return {
      message,
      requestedSchema,
    };
  }

  /**
   * Parse and validate JSON schema string
   */
  parseJsonSchema(schemaString: string): unknown {
    try {
      const parsed = JSON.parse(schemaString);

      // Basic schema validation
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Schema must be a valid object');
      }

      return parsed;
    } catch (error) {
      throw new Error(
        `Invalid JSON schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get SDK MCP server capabilities
   */
  getSdkMcpCapabilities(): {
    supportsSampling: boolean;
    supportsElicitation: boolean;
    serverAvailable: boolean;
  } {
    try {
      this.validateSdkMcpServer();

      return {
        supportsSampling: typeof this.sdkMcpServer.server.createMessage === 'function',
        supportsElicitation: typeof this.sdkMcpServer.server.elicitInput === 'function',
        serverAvailable: true,
      };
    } catch {
      return {
        supportsSampling: false,
        supportsElicitation: false,
        serverAvailable: false,
      };
    }
  }

  /**
   * Log MCP operation for debugging
   */
  logMCPOperation(
    operation: 'sampling' | 'elicitation',
    details: Record<string, unknown>,
  ): void {
    this.logger.debug(`MCPSDKHelpers: ${operation} operation`, {
      operation,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  /**
   * Create tool execution context
   */
  createToolContext(
    toolName: string,
    args: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): {
    toolName: string;
    args: Record<string, unknown>;
    extra?: Record<string, unknown>;
    startTime: number;
    requestId: string;
  } {
    const context: {
      toolName: string;
      args: Record<string, unknown>;
      extra?: Record<string, unknown>;
      startTime: number;
      requestId: string;
    } = {
      toolName,
      args,
      startTime: performance.now(),
      requestId: crypto.randomUUID(),
    };

    // Only include extra if it's defined (exactOptionalPropertyTypes compliance)
    if (extra !== undefined) {
      context.extra = extra;
    }

    return context;
  }

  /**
   * Calculate tool execution time
   */
  calculateExecutionTime(startTime: number): number {
    return performance.now() - startTime;
  }
}
