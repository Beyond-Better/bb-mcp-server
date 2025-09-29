/**
 * Core MCP Tools - Generic tools for any MCP server
 * Extracted from ActionStepMCPServer.ts - Generic tool implementations
 *
 * Provides essential tools that every MCP server needs:
 * - Echo tool for testing
 * - Server status and statistics
 * - MCP sampling API integration
 * - MCP elicitation API integration
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import type { CallToolResult } from 'mcp/types.js';
import { z } from 'zod';

// Import library components
import { Logger } from '../utils/Logger.ts';
import { AuditLogger } from '../utils/AuditLogger.ts';
import { toError } from '../utils/Error.ts';

// Import types
import type { ToolRegistry } from '../tools/ToolRegistry.ts';
import type {
  CoreToolsDependencies,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitInputRequest,
  ElicitInputResult,
} from '../types/BeyondMcpTypes.ts';
import { ToolHandlerMode } from '../types/BeyondMcpTypes.ts';

/**
 * Core MCP tools that every server needs
 * EXTRACTED: Generic tool implementations from ActionStepMCPServer
 */
export class CoreTools {
  private dependencies: CoreToolsDependencies;
  private sdkMcpServer: SdkMcpServer;
  private logger: Logger;
  private auditLogger: AuditLogger;
  private enhancedStatusProvider?: () => Promise<CallToolResult>;

  constructor(dependencies: CoreToolsDependencies) {
    this.dependencies = dependencies;
    this.sdkMcpServer = dependencies.sdkMcpServer;
    this.logger = dependencies.logger;
    this.auditLogger = dependencies.auditLogger;
  }

  /**
   * Set enhanced status provider (optional)
   * Allows BeyondMcpServer to provide enhanced status including workflows
   */
  setEnhancedStatusProvider(provider: () => Promise<CallToolResult>): void {
    this.enhancedStatusProvider = provider;
  }

  /**
   * Register all core tools with the tool registry
   */
  registerWith(toolRegistry: ToolRegistry): void {
    this.logger.debug('CoreTools: Registering core tools...');

    this.registerEchoTool(toolRegistry);
    this.registerServerStatusTool(toolRegistry);
    this.registerTestSamplingTool(toolRegistry);
    this.registerTestElicitationTool(toolRegistry);

    this.logger.debug('CoreTools: All core tools registered');
  }

  /**
   * Register echo tool - simple testing tool
   * EXTRACTED: From ActionStepMCPServer.ts echo handler
   */
  private registerEchoTool(registry: ToolRegistry): void {
    registry.registerTool(
      'echo',
      {
        title: 'Echo',
        description: 'Simple echo tool that returns the provided message',
        category: 'core',
        tags: ['testing', 'core'],
        inputSchema: {
          message: z.string().describe('Message to echo back'),
        },
      },
      async (args) => this.handleEcho(args),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * Register server status tool
   * EXTRACTED: From ActionStepMCPServer.ts getServerStatus handler
   */
  private registerServerStatusTool(registry: ToolRegistry): void {
    registry.registerTool(
      'get_server_status',
      {
        title: 'Get Server Status',
        description: 'Get server status and statistics',
        category: 'core',
        tags: ['monitoring', 'status', 'core'],
        inputSchema: {},
      },
      async () => this.handleServerStatus(),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * Register test sampling tool - MCP sampling API integration
   * EXTRACTED: From ActionStepMCPServer.ts testSampling handler
   */
  private registerTestSamplingTool(registry: ToolRegistry): void {
    registry.registerTool(
      'test_sampling',
      {
        title: 'Test Sampling',
        description:
          'Test sampling tool that makes a request to the MCP client for text generation',
        category: 'core',
        tags: ['testing', 'mcp-api', 'sampling'],
        inputSchema: {
          prompt: z.string().describe('Prompt to send to the model'),
          model: z.string().describe('Model identifier to use for sampling'),
        },
      },
      async (args, extra) =>
        this.handleTestSampling(args, extra as Record<string, unknown> | undefined),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * Register test elicitation tool - MCP elicitation API integration
   * EXTRACTED: From ActionStepMCPServer.ts testElicitation handler
   */
  private registerTestElicitationTool(registry: ToolRegistry): void {
    registry.registerTool(
      'test_elicitation',
      {
        title: 'Test Elicitation',
        description:
          'Test elicitation tool that makes a request to the MCP client for user input/approval',
        category: 'core',
        tags: ['testing', 'mcp-api', 'elicitation'],
        inputSchema: {
          message: z.string().describe('Message to present to the user'),
          requestedSchema: z.string().describe(
            'Requested schema to use for elicitation (JSON string)',
          ),
        },
      },
      async (args, extra) =>
        this.handleTestElicitation(args, extra as Record<string, unknown> | undefined),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * Handle echo tool execution
   * PRESERVED: Exact implementation from ActionStepMCPServer
   */
  private async handleEcho(args: { message: string }): Promise<CallToolResult> {
    const { message } = args;

    if (!message) {
      throw new Error('message is required');
    }

    this.logger.debug('CoreTools: Echo executed', { message: message.substring(0, 50) });

    return {
      content: [{
        type: 'text' as const,
        text: message,
      }],
    };
  }

  /**
   * Handle server status tool execution
   * Uses enhanced status provider if available (includes workflows), otherwise uses basic status
   */
  private async handleServerStatus(): Promise<CallToolResult> {
    this.logger.debug('CoreTools: Server status requested');

    // Use enhanced status provider if available (e.g., from BeyondMcpServer)
    if (this.enhancedStatusProvider) {
      try {
        return await this.enhancedStatusProvider();
      } catch (error) {
        this.logger.warn('CoreTools: Enhanced status provider failed, falling back to basic status', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Fallback to basic server status
    const status = {
      server: {
        name: 'MCP Server',
        initialized: true,
        timestamp: new Date().toISOString(),
      },
      tools: {
        available: ['echo', 'get_server_status', 'test_sampling', 'test_elicitation'],
        core_tools_loaded: true,
      },
      health: {
        status: 'healthy',
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      },
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(status, null, 2),
      }],
    };
  }

  /**
   * Handle test sampling tool execution
   * PRESERVED: Exact implementation from ActionStepMCPServer testSampling
   */
  private async handleTestSampling(
    args: { prompt: string; model: string },
    extra?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { prompt, model } = args;

    // Validate parameters first
    if (!prompt) {
      throw new Error('prompt is required');
    }

    if (!model) {
      throw new Error('model is required');
    }

    this.logger.info('CoreTools: Test sampling requested', {
      model,
      prompt: prompt.substring(0, 50) + '...',
      extra,
    });

    try {
      // Check that SDK MCP server is available
      if (!this.sdkMcpServer) {
        throw new Error('SDK MCP server not available - check dependency injection');
      }

      // PRESERVED: Exact MCP SDK sampling pattern from ActionStepMCPServer
      const samplingResult = await this.sdkMcpServer.server.createMessage({
        _meta: (extra?._meta || {}) as {
          [x: string]: unknown;
          progressToken?: string | number | undefined;
        },
        model: model,
        messages: [{
          role: 'user',
          content: { type: 'text', text: prompt },
        }],
        maxTokens: 2000,
        temperature: 0.3,
      });

      this.logger.info('CoreTools: Test sampling completed successfully', {
        model,
        prompt: prompt.substring(0, 50) + '...',
        resultType: typeof samplingResult,
        hasContent: !!samplingResult?.content,
      });

      // Log sampling usage for audit
      await this.auditLogger.logSystemEvent({
        event: 'test_sampling_executed',
        severity: 'info',
        details: {
          model,
          prompt_length: prompt.length,
          success: true,
        },
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            {
              prompt,
              model,
              result: samplingResult,
              status: 'success',
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CoreTools: Test sampling failed:', toError(error));

      // Log sampling failure for audit
      await this.auditLogger.logSystemEvent({
        event: 'test_sampling_failed',
        severity: 'error',
        details: {
          model,
          prompt_length: prompt.length,
          error: errorMessage,
        },
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            {
              prompt,
              model,
              error: errorMessage,
              status: 'failed',
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    }
  }

  /**
   * Handle test elicitation tool execution
   * PRESERVED: Exact implementation from ActionStepMCPServer testElicitation
   */
  private async handleTestElicitation(
    args: { message: string; requestedSchema: string },
    extra?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { message, requestedSchema } = args;

    // Validate parameters first
    if (!message) {
      throw new Error('message is required');
    }

    if (!requestedSchema) {
      throw new Error('requestedSchema is required');
    }

    this.logger.info('CoreTools: Test elicitation requested', {
      message: message.substring(0, 50) + '...',
      requestedSchema,
    });

    let parsedSchema: unknown;
    try {
      const parsed = JSON.parse(requestedSchema);
      // Validate that it has the required structure
      if (!parsed || typeof parsed !== 'object' || parsed.type !== 'object' || !parsed.properties) {
        throw new Error('Schema must be an object with type: "object" and properties');
      }
      parsedSchema = parsed;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Schema must be')) {
        throw error;
      }
      throw new Error('requestedSchema must be valid JSON');
    }

    try {
      // Check that SDK MCP server is available
      if (!this.sdkMcpServer) {
        throw new Error('SDK MCP server not available - check dependency injection');
      }

      // PRESERVED: Exact MCP SDK elicitation pattern from ActionStepMCPServer
      const elicitationResult = await this.sdkMcpServer.server.elicitInput({
        message,
        requestedSchema: parsedSchema as any, // Cast for MCP SDK compatibility
      });

      this.logger.info('CoreTools: Test elicitation completed successfully', {
        message: message.substring(0, 50) + '...',
        resultType: typeof elicitationResult,
        hasContent: !!elicitationResult?.content,
        action: elicitationResult.action,
      });

      // Log elicitation usage for audit
      await this.auditLogger.logSystemEvent({
        event: 'test_elicitation_executed',
        severity: 'info',
        details: {
          message_length: message.length,
          action: elicitationResult.action,
          success: true,
        },
      });

      // PRESERVED: Handle elicitation response patterns from ActionStepMCPServer
      if (elicitationResult.action === 'accept' && elicitationResult.content) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(
              {
                message,
                requestedSchema: parsedSchema,
                result: elicitationResult,
                status: 'accepted',
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            {
              message,
              requestedSchema: parsedSchema,
              result: elicitationResult,
              status: 'completed',
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CoreTools: Test elicitation failed:', toError(error));

      // Log elicitation failure for audit
      await this.auditLogger.logSystemEvent({
        event: 'test_elicitation_failed',
        severity: 'error',
        details: {
          message_length: message.length,
          error: errorMessage,
        },
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            {
              message,
              requestedSchema: parsedSchema,
              error: errorMessage,
              status: 'failed',
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    }
  }
}
