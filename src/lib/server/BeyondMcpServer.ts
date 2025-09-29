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
import { z, type ZodSchema } from 'zod';

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
import { loadInstructions, validateInstructions } from '../utils/InstructionsLoader.ts';

// Import types
import {
  type BeyondMcpRequestContext,
  type BeyondMcpServerConfig,
  type BeyondMcpServerDependencies,
  type CreateMessageRequest,
  type CreateMessageResult,
  type ElicitInputRequest,
  type ElicitInputResult,
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

  protected sdkMcpServer?: SdkMcpServer;
  protected workflowRegistry: WorkflowRegistry;
  protected toolRegistry: ToolRegistry;
  protected coreTools?: CoreTools;
  protected workflowTools: WorkflowTools;

  protected requestContextManager: RequestContextManager;
  protected mcpSDKHelpers?: BeyondMcpSDKHelpers;
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

    // Store provided SDK MCP server for testing or defer creation until initialize()
    if (sdkMcpServer) {
      this.sdkMcpServer = sdkMcpServer;
    }
    // SDK MCP server will be created in initialize() after instructions are loaded

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

    // Initialize components that don't depend on sdkMcpServer
    this.requestContextManager = new RequestContextManager(this.logger);

    this.workflowTools = new WorkflowTools({
      workflowRegistry: this.workflowRegistry,
      logger: this.logger,
      auditLogger: this.auditLogger,
    });

    // Components that depend on sdkMcpServer will be initialized in initialize() method
    // after instructions are loaded and sdkMcpServer is created
  }

  /**
   * Get the underlying SDK MCP Server instance
   */
  getSdkMcpServer(): SdkMcpServer {
    if (!this.sdkMcpServer) {
      throw new Error('BeyondMcpServer not initialized. Call initialize() first.');
    }
    return this.sdkMcpServer;
  }

  /**
   * Execute an operation within the context of an authenticated user
   * PRESERVED: Exact AsyncLocalStorage pattern from ActionStepMCPServer
   */
  async executeWithAuthContext<T>(
    context: BeyondMcpRequestContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.logger.debug('MCPServer: Executing with auth context', {
      authenticatedUserId: context.authenticatedUserId,
      clientId: context.clientId,
      requestId: context.requestId,
    });

    return BeyondMcpServer.contextStorage.run(context, operation);
  }

  /**
   * Get the current authenticated user context from AsyncLocalStorage
   */
  protected getAuthContext(): BeyondMcpRequestContext | null {
    return BeyondMcpServer.contextStorage.getStore() || null;
  }

  /**
   * Get the current authenticated user ID (backward compatibility)
   */
  getAuthenticatedUserId(): string | null {
    const context = this.getAuthContext();
    return context?.authenticatedUserId || null;
  }

  /**
   * Initialize the Beyond MCP server
   */
  async initialize(): Promise<BeyondMcpServer> {
    if (this.initialized) {
      return this;
    }

    this.logger.info('MCPServer: Initializing MCP server...');

    try {
      // Load instructions using flexible loading system
      const instructions = await this.loadInstructions();
      
      // Create SDK MCP server with loaded instructions (if not provided for testing)
      if (!this.sdkMcpServer) {
        await this.createSdkMcpServer(instructions);
      }
      
      // Initialize components that depend on sdkMcpServer
      await this.initializeDependentComponents();
      
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
   * Load instructions using flexible loading system
   */
  private async loadInstructions(): Promise<string> {
    try {
      const instructions = await loadInstructions({
        logger: this.logger,
        instructionsConfig: this.configManager.get('MCP_SERVER_INSTRUCTIONS'),
        instructionsFilePath: this.configManager.get('MCP_INSTRUCTIONS_FILE'),
        defaultFileName: 'mcp_server_instructions.md',
        basePath: Deno.cwd(),
      });

      // Validate the loaded instructions
      if (!validateInstructions(instructions, this.logger)) {
        this.logger.warn('BeyondMcpServer: Loaded instructions failed validation but will be used anyway');
      }

      this.logger.info('BeyondMcpServer: Instructions loaded successfully', {
        source: this.getInstructionsSource(),
        contentLength: instructions.length,
        hasWorkflowContent: instructions.includes('workflow'),
      });

      // Store instructions in config for future reference
      this.config.instructions = instructions;
      
      return instructions;
    } catch (error) {
      this.logger.error('BeyondMcpServer: Failed to load instructions:', error instanceof Error ? error : new Error(String(error)));
      throw ErrorHandler.wrapError(error, 'INSTRUCTIONS_LOADING_FAILED');
    }
  }

  /**
   * Create SDK MCP server with loaded instructions
   */
  private async createSdkMcpServer(instructions: string): Promise<void> {
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
      capabilities: this.config.capabilities || {
        tools: {},
        logging: {},
      },
      instructions: instructions, // Now we can properly set the instructions!
    };

    this.sdkMcpServer = new SdkMcpServer(
      {
        name: this.config.server.name,
        version: this.config.server.version,
        title: this.config.server.title || this.config.server.name,
        description: this.config.server.description,
      },
      serverOptions,
    );

    this.logger.debug('BeyondMcpServer: SDK MCP server created with instructions', {
      instructionsLength: instructions.length,
    });
  }

  /**
   * Initialize components that depend on sdkMcpServer
   */
  private async initializeDependentComponents(): Promise<void> {
    if (!this.sdkMcpServer) {
      throw new Error('SDK MCP server must be created before initializing dependent components');
    }

    // Initialize tool registry with sdkMcpServer
    this.toolRegistry.sdkMcpServer = this.sdkMcpServer;

    // Initialize core tools with sdkMcpServer
    this.coreTools = new CoreTools({
      sdkMcpServer: this.sdkMcpServer,
      logger: this.logger,
      auditLogger: this.auditLogger,
    });

    // Initialize MCP SDK helpers
    this.mcpSDKHelpers = new BeyondMcpSDKHelpers(this.sdkMcpServer, this.logger);

    this.logger.debug('BeyondMcpServer: Dependent components initialized');
  }

  /**
   * Get the source of instructions for logging purposes
   */
  private getInstructionsSource(): string {
    const configInstructions = this.configManager.get('MCP_SERVER_INSTRUCTIONS') as string | undefined;
    const filePath = this.configManager.get('MCP_INSTRUCTIONS_FILE') as string | undefined;
    
    if (configInstructions && typeof configInstructions === 'string' && configInstructions.trim()) {
      return 'configuration';
    } else if (filePath && typeof filePath === 'string') {
      return `file: ${filePath}`;
    } else {
      // Check if default file exists
      try {
        const defaultPath = `${Deno.cwd()}/mcp_server_instructions.md`;
        Deno.statSync(defaultPath);
        return `default file: ${defaultPath}`;
      } catch {
        return 'embedded fallback';
      }
    }
  }

  /**
   * Start the Beyond MCP server
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.sdkMcpServer) {
      throw new Error('BeyondMcpServer: SDK MCP server not initialized. This should not happen after initialize().');
    }

    this.logger.info('BeyondMcpServer: Starting Beyond MCP server...');

    // Start based on transport type
    if (this.config.transport?.type === 'stdio') {
      const transport = new StdioServerTransport();
      await this.sdkMcpServer.connect(transport);
      this.logger.info('BeyondMcpServer: STDIO transport connected');
    } else if (this.config.transport?.type === 'http') {
      // HTTP transport handled by TransportManager from Phase 3
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
      if (this.sdkMcpServer) {
        if (this.config.transport?.type === 'stdio') {
          await this.sdkMcpServer.close();
        } else if (this.config.transport?.type === 'http') {
          await this.transportManager.cleanup();
        }
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
    if (!this.toolRegistrationConfig.workflowTools.enabled) {
      this.logger.debug('BeyondMcpServer: Workflow tools disabled in configuration');
      return;
    }

    const workflowData = this.workflowRegistry.getWorkflowToolData();

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
      // Integrate with TransportManager from Phase 3
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
