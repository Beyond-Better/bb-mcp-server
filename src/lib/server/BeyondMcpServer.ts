/**
 * Beyond MCP Server - Higher-level wrapper around the MCP SDK
 *
 * Provides base functionality for any MCP server implementation with:
 * - Official MCP TypeScript SDK integration
 * - Tool registration with Zod validation
 * - AsyncLocalStorage request context management
 * - Core tools (echo, server status, sampling, elicitation)
 * - Transport integration with all previous phases
 */

import { McpServer as SdkMcpServer } from 'mcp/server/mcp.js';
import { StdioServerTransport } from 'mcp/server/stdio.js';
import type { CallToolResult } from 'mcp/types.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { //z,
  type ZodSchema,
} from 'zod';

// Import library components from previous phases
import { Logger } from '../utils/Logger.ts';
import { AuditLogger } from '../utils/AuditLogger.ts';
import { ConfigManager } from '../config/ConfigManager.ts';
import { ErrorHandler } from '../utils/ErrorHandler.ts';
import { toError } from '../utils/Error.ts';
import { ToolRegistry } from '../tools/ToolRegistry.ts';
import { CoreTools } from '../tools/CoreTools.ts';
import { WorkflowTools } from '../tools/WorkflowTools.ts';
import { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import { TransportManager } from '../transport/TransportManager.ts';
import { KVManager } from '../storage/KVManager.ts';
import { OAuthProvider } from '../auth/OAuthProvider.ts';
import { RequestContextManager } from './RequestContextManager.ts';
import { BeyondMcpSDKHelpers } from './MCPSDKHelpers.ts';

// Import types
import {
  type BeyondMcpRequestContext,
  type BeyondMcpServerConfig,
  type BeyondMcpServerDependencies,
  type CreateMessageRequest,
  type CreateMessageResult,
  type ElicitInputRequest,
  type ElicitInputResult,
  type SendNotificationRequest,
  type ToolDefinition,
  type ToolHandler,
  ToolHandlerMode,
  type ToolRegistration,
  type ToolRegistrationConfig,
  WorkflowToolNaming,
} from '../types/BeyondMcpTypes.ts';

/**
 * Beyond MCP Server using official MCP SDK
 * Provides base functionality that any MCP server can extend
 */
export class BeyondMcpServer {
  protected initialized = false;

  protected logger: Logger;
  protected config: BeyondMcpServerConfig;
  protected configManager: ConfigManager;

  protected sdkMcpServer: SdkMcpServer;
  protected workflowRegistry: WorkflowRegistry;
  protected toolRegistry: ToolRegistry;
  protected coreTools: CoreTools;
  protected workflowTools: WorkflowTools;

  protected requestContextManager: RequestContextManager;
  protected mcpSDKHelpers: BeyondMcpSDKHelpers;
  protected errorHandler: ErrorHandler;
  protected auditLogger: AuditLogger;
  protected transportManager: TransportManager;
  protected kvManager?: KVManager;
  protected oauthProvider?: OAuthProvider;
  protected toolRegistrationConfig: ToolRegistrationConfig;

  // AsyncLocalStorage for request context
  private static contextStorage = new AsyncLocalStorage<BeyondMcpRequestContext>();

  constructor(
    config: BeyondMcpServerConfig & { toolRegistration?: ToolRegistrationConfig },
    dependencies: BeyondMcpServerDependencies,
    sdkMcpServer?: SdkMcpServer,
  ) {
    this.config = config;

    // Inject dependencies from all previous phases
    this.logger = dependencies.logger;
    this.auditLogger = dependencies.auditLogger;
    this.configManager = dependencies.configManager;
    this.errorHandler = dependencies.errorHandler;
    this.toolRegistry = dependencies.toolRegistry;
    this.workflowRegistry = dependencies.workflowRegistry;
    this.transportManager = dependencies.transportManager;
    // Only assign optional dependencies if they exist (exactOptionalPropertyTypes compliance)
    if (dependencies.kvManager) {
      this.kvManager = dependencies.kvManager;
    }
    if (dependencies.oauthProvider) {
      this.oauthProvider = dependencies.oauthProvider;
    }

    if (!this.toolRegistry) {
      throw ErrorHandler.wrapError('Tool Registry must be set', 'BEYOND_MCP_SERVER_INIT_FAILED');
    }
    if (!this.workflowRegistry) {
      throw ErrorHandler.wrapError(
        'Workflow Registry must be set',
        'BEYOND_MCP_SERVER_INIT_FAILED',
      );
    }

    // Use provided SDK MCP server for testing or create real one
    if (sdkMcpServer) {
      this.sdkMcpServer = sdkMcpServer;
    } else {
      // Create MCP server with official SDK
      const serverOptions: {
        capabilities?: {
          tools?: {};
          logging?: {};
          prompts?: {};
          resources?: { subscribe?: boolean };
          completions?: {};
        };
        instructions?: string;
      } = {
        capabilities: config.capabilities || {
          tools: {},
          logging: {},
        },
      };

      // Only add instructions if they exist (exactOptionalPropertyTypes compliance)
      if (config.mcpServerInstructions) {
        serverOptions.instructions = config.mcpServerInstructions;
      }

      this.sdkMcpServer = new SdkMcpServer(
        {
          name: config.server.name,
          version: config.server.version,
          title: config.server.title || config.server.name,
          description: config.server.description,
        },
        serverOptions,
      );
    }

    this.mcpSDKHelpers = new BeyondMcpSDKHelpers(this.sdkMcpServer, this.logger);

    // Initialize tool registration configuration
    this.toolRegistrationConfig = config.toolRegistration || {
      workflowTools: {
        enabled: true,
        naming: WorkflowToolNaming.SIMPLE,
        executeWorkflow: { enabled: true },
        getSchemaWorkflow: { enabled: true },
      },
      defaultHandlerMode: ToolHandlerMode.MANAGED,
    };

    // Initialize components

    this.toolRegistry.sdkMcpServer = this.sdkMcpServer;

    this.coreTools = new CoreTools({
      sdkMcpServer: this.sdkMcpServer,
      logger: this.logger,
      auditLogger: this.auditLogger,
    });

    this.workflowTools = new WorkflowTools({
      workflowRegistry: this.workflowRegistry,
      logger: this.logger,
      auditLogger: this.auditLogger,
    });

    this.requestContextManager = new RequestContextManager(this.logger);
  }

  /**
   * Initialize the Beyond MCP server
   */
  async initialize(): Promise<BeyondMcpServer> {
    if (this.initialized) {
      return this;
    }

    this.logger.info('BeyondMcpServer: Initializing MCP server...');

    try {
      // Register core tools
      await this.registerCoreTools();

      // Register workflow tools if enabled and workflows exist
      await this.registerWorkflowTools();

      // Setup transport integration
      await this.setupTransport();

      this.initialized = true;

      this.logger.info('BeyondMcpServer: Beyond MCP server initialized successfully', {
        coreToolsCount: this.toolRegistry.getToolCount(),
        transport: this.config.transport?.type || 'stdio',
      });

      // Log system startup
      await this.auditLogger.logSystemEvent({
        event: 'beyond_mcp_server_startup',
        severity: 'info',
        details: {
          server_name: this.config.server.name,
          server_version: this.config.server.version,
          transport: this.config.transport?.type || 'stdio',
        },
      });

      return this;
    } catch (error) {
      this.logger.error('BeyondMcpServer: Failed to initialize Beyond MCP server:', toError(error));
      throw ErrorHandler.wrapError(error, 'BEYOND_MCP_SERVER_INIT_FAILED');
    }
  }

  /**
   * Get the underlying SDK MCP Server instance
   */
  getSdkMcpServer(): SdkMcpServer {
    return this.sdkMcpServer;
  }

  /**
   * Execute an operation within the context of an authenticated user
   */
  async executeWithAuthContext<T>(
    context: BeyondMcpRequestContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.logger.debug('BeyondMcpServer: Executing with auth context', {
      authenticatedUserId: context.authenticatedUserId,
      clientId: context.clientId,
      requestId: context.requestId,
    });

    return BeyondMcpServer.contextStorage.run(context, operation);
  }

  /**
   * Get the current authenticated user context from AsyncLocalStorage (both as static class and protected instance methods)
   */
  static getCurrentAuthContext(): BeyondMcpRequestContext | null {
    return BeyondMcpServer.contextStorage.getStore() || null;
  }
  protected getAuthContext(): BeyondMcpRequestContext | null {
    return BeyondMcpServer.contextStorage.getStore() || null;
  }

  /**
   * Get the current authenticated user ID  (both as static class and protected instance methods)
   */
  static getCurrentAuthenticatedUserId(): string | null {
    const context = BeyondMcpServer.getCurrentAuthContext();
    return context?.authenticatedUserId || null;
  }
  getAuthenticatedUserId(): string | null {
    const context = this.getAuthContext();
    return context?.authenticatedUserId || null;
  }

  /**
   * Start the Beyond MCP server
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.sdkMcpServer) {
      throw new Error(
        'BeyondMcpServer: SDK MCP server not initialized. This should not happen after initialize().',
      );
    }

    this.logger.info('BeyondMcpServer: Starting Beyond MCP server...');

    // Start based on transport type
    if (this.config.transport?.type === 'stdio') {
      const transport = new StdioServerTransport();
      await this.sdkMcpServer.connect(transport);
      this.logger.info('BeyondMcpServer: STDIO transport connected');
    } else if (this.config.transport?.type === 'http') {
      // HTTP transport handled by TransportManager
      await this.transportManager.start();
      this.logger.info('BeyondMcpServer: HTTP transport started via TransportManager');
    }

    this.logger.info('BeyondMcpServer: Beyond MCP server started successfully');
  }

  /**
   * Shutdown the Beyond MCP server
   */
  async shutdown(): Promise<void> {
    this.logger.info('BeyondMcpServer: Shutting down Beyond MCP server...');

    try {
      // Log system shutdown
      await this.auditLogger.logSystemEvent({
        event: 'beyond_mcp_server_shutdown',
        severity: 'info',
      });

      // Close SDK MCP connections
      if (this.config.transport?.type === 'stdio') {
        await this.sdkMcpServer.close();
      } else if (this.config.transport?.type === 'http') {
        await this.transportManager.cleanup();
      }

      this.initialized = false;
      this.logger.info('BeyondMcpServer: Beyond MCP server shutdown complete');
    } catch (error) {
      this.logger.error('BeyondMcpServer: Error during shutdown:', toError(error));
      throw error;
    }
  }

  /**
   * Register a tool with the MCP server
   * Delegates to ToolRegistry with Zod validation
   */
  registerTool<T extends Record<string, ZodSchema>>(
    name: string,
    definition: ToolDefinition<T>,
    handler: ToolHandler<T>,
    options?: { handlerMode?: ToolHandlerMode },
  ): void {
    this.toolRegistry.registerTool(name, definition, handler, options);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: ToolRegistration[]): void {
    for (const tool of tools) {
      this.registerTool(tool.name, tool.definition, tool.handler, tool.options);
    }
  }

  /**
   * Register a workflow with the workflow registry
   */
  registerWorkflow(workflow: any): void { // WorkflowBase type
    this.workflowRegistry.registerWorkflow(workflow);
  }

  /**
   * MCP SDK integration methods
   */
  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    if (!this.mcpSDKHelpers) {
      throw new Error('BeyondMcpServer not initialized. Call initialize() first.');
    }
    return await this.mcpSDKHelpers.createMessage(request);
  }

  async elicitInput(request: ElicitInputRequest): Promise<ElicitInputResult> {
    if (!this.mcpSDKHelpers) {
      throw new Error('BeyondMcpServer not initialized. Call initialize() first.');
    }
    return await this.mcpSDKHelpers.elicitInput(request);
  }

  async sendNotification(request: SendNotificationRequest, sessionId?: string): Promise<void> {
    if (!this.mcpSDKHelpers) {
      throw new Error('BeyondMcpServer not initialized. Call initialize() first.');
    }
    return await this.mcpSDKHelpers.sendNotification(request, sessionId);
  }

  /**
   * Register core tools that every Beyond MCP server needs
   */
  protected async registerCoreTools(): Promise<void> {
    if (!this.coreTools) {
      throw new Error('Core tools not initialized. This should not happen after initialize().');
    }

    this.logger.debug('BeyondMcpServer: Registering core tools...');

    // Set enhanced status provider to include workflow information
    this.coreTools.setEnhancedStatusProvider(() => this.getServerStatus());

    // Register all core tools via CoreTools component
    this.coreTools.registerWith(this.toolRegistry);

    this.logger.debug('BeyondMcpServer: Core tools registered', {
      toolCount: this.toolRegistry.getToolCount(),
      tools: this.toolRegistry.getToolNames(),
    });
  }

  /**
   * Register workflow tools if workflows exist and tools are enabled
   */
  private async registerWorkflowTools(): Promise<void> {
    this.logger.info('BeyondMcpServer: Registering workflow tools', {
      toolRegistrationConfig: this.toolRegistrationConfig,
    });
    if (!this.toolRegistrationConfig.workflowTools.enabled) {
      this.logger.debug('BeyondMcpServer: Workflow tools disabled in configuration');
      return;
    }

    const workflowData = this.workflowRegistry.getWorkflowToolData();
    // this.logger.info('BeyondMcpServer: Registering workflow tools', { workflowData });

    if (!workflowData.hasWorkflows) {
      this.logger.debug('BeyondMcpServer: No workflows registered, skipping workflow tools');
      return;
    }

    // Register workflow tools with app name for namespaced mode
    const appName = this.config.server.name;

    this.workflowTools.registerWith(
      this.toolRegistry,
      this.toolRegistrationConfig,
      appName,
    );

    this.logger.info('BeyondMcpServer: Workflow tools registered', {
      workflowCount: workflowData.count,
      executeWorkflow: this.toolRegistrationConfig.workflowTools.executeWorkflow.enabled,
      getSchemaWorkflow: this.toolRegistrationConfig.workflowTools.getSchemaWorkflow.enabled,
      namingMode: this.toolRegistrationConfig.workflowTools.naming,
    });
  }

  /**
   * Setup transport integration
   */
  protected async setupTransport(): Promise<void> {
    if (this.config.transport?.type === 'http') {
      if (!this.sdkMcpServer) {
        throw new Error('SDK MCP server must be initialized before setting up transport');
      }
      // Integrate with TransportManager
      // Cast to compatible type for TransportManager
      await this.transportManager.initialize(this.sdkMcpServer as any);
    }
  }

  /**
   * Get server status - generic implementation
   */
  protected async getServerStatus(): Promise<CallToolResult> {
    const status = {
      server: {
        name: this.config.server.name,
        version: this.config.server.version,
        initialized: this.initialized,
        transport: this.config.transport?.type || 'stdio',
      },
      tools: {
        count: this.toolRegistry.getToolCount(),
        available: this.toolRegistry.getToolNames(),
      },
      workflows: {
        count: this.workflowRegistry.getWorkflowNames().length,
        available: this.workflowRegistry.getWorkflowNames(),
      },
      timestamp: new Date().toISOString(),
      health: {
        status: 'healthy',
        uptime: performance.now() / 1000,
        memory: {
          used: Math.round(Deno.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(Deno.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(Deno.memoryUsage().rss / 1024 / 1024),
          external: Math.round(Deno.memoryUsage().external / 1024 / 1024),
        },
        version: Deno.version.deno,
        //permissions: await Deno.permissions.query({ name: 'net' }), // example
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
}

// Re-export types for consumers
export type {
  BeyondMcpRequestContext,
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
  ToolDefinition,
  ToolHandler,
  ToolRegistration,
} from '../types/BeyondMcpTypes.ts';
