/**
 * Beyond MCP Server - Higher-level wrapper around the MCP SDK
 * Extracted from ActionStepMCPServer.ts - Generic MCP functionality only
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
import { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import { TransportManager } from '../transport/TransportManager.ts';
import { KVManager } from '../storage/KVManager.ts';
import { OAuthProvider } from '../auth/OAuthProvider.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { RequestContextManager } from './RequestContextManager.ts';
import { CoreTools } from '../tools/CoreTools.ts';
import { BeyondMcpSDKHelpers } from './MCPSDKHelpers.ts';

// Import types
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitInputRequest,
  ElicitInputResult,
  BeyondMcpRequestContext,
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
  ToolDefinition,
  ToolHandler,
  ToolRegistration,
} from '../types/BeyondMcpTypes.ts';

/**
 * Beyond MCP Server using official MCP SDK
 * Provides base functionality that any MCP server can extend
 */
export class BeyondMcpServer {
  protected sdkMcpServer: SdkMcpServer;
  protected toolRegistry: ToolRegistry;
  protected requestContextManager: RequestContextManager;
  protected coreTools: CoreTools;
  protected mcpSDKHelpers: BeyondMcpSDKHelpers;
  protected config: BeyondMcpServerConfig;
  protected initialized = false;
  
  // AsyncLocalStorage for request context (preserve exact pattern from ActionStepMCPServer)
  private static contextStorage = new AsyncLocalStorage<BeyondMcpRequestContext>();
  
  // Dependencies from all previous phases
  protected logger: Logger;
  protected auditLogger: AuditLogger;
  protected configManager: ConfigManager;
  protected errorHandler: ErrorHandler;
  protected workflowRegistry: WorkflowRegistry;
  protected transportManager: TransportManager;
  protected kvManager?: KVManager;
  protected oauthProvider?: OAuthProvider;
  
  constructor(config: BeyondMcpServerConfig, dependencies: BeyondMcpServerDependencies, mockSdkMcpServer?: SdkMcpServer) {
    this.config = config;
    
    // Inject dependencies from all previous phases
    this.logger = dependencies.logger;
    this.auditLogger = dependencies.auditLogger;
    this.configManager = dependencies.configManager;
    this.errorHandler = dependencies.errorHandler;
    this.workflowRegistry = dependencies.workflowRegistry;
    this.transportManager = dependencies.transportManager;
    // Only assign optional dependencies if they exist (exactOptionalPropertyTypes compliance)
    if (dependencies.kvManager) {
      this.kvManager = dependencies.kvManager;
    }
    if (dependencies.oauthProvider) {
      this.oauthProvider = dependencies.oauthProvider;
    }
    
    // Use mock SDK MCP server for testing or create real one
    if (mockSdkMcpServer) {
      this.sdkMcpServer = mockSdkMcpServer;
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
      if (config.instructions) {
        serverOptions.instructions = config.instructions;
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
    
    // Initialize components
    this.toolRegistry = new ToolRegistry(this.sdkMcpServer, {
      logger: this.logger,
      errorHandler: this.errorHandler,
    });
    
    this.requestContextManager = new RequestContextManager(this.logger);
    
    this.coreTools = new CoreTools({
      logger: this.logger,
      sdkMcpServer: this.sdkMcpServer,
      auditLogger: this.auditLogger,
    });
    
    this.mcpSDKHelpers = new BeyondMcpSDKHelpers(this.sdkMcpServer, this.logger);
  }
  
  /**
   * Get the underlying SDK MCP Server instance
   */
  getSdkMcpServer(): SdkMcpServer {
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
   * PRESERVED: Exact pattern from ActionStepMCPServer
   */
  protected getAuthContext(): BeyondMcpRequestContext | null {
    return BeyondMcpServer.contextStorage.getStore() || null;
  }
  
  /**
   * Get the current authenticated user ID (backward compatibility)
   * PRESERVED: Exact method from ActionStepMCPServer
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
      // Register core tools
      await this.registerCoreTools();
      
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
   * Start the Beyond MCP server
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
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
    handler: ToolHandler<T>
  ): void {
    this.toolRegistry.registerTool(name, definition, handler);
  }
  
  /**
   * Register multiple tools at once
   */
  registerTools(tools: ToolRegistration[]): void {
    for (const tool of tools) {
      this.registerTool(tool.name, tool.definition, tool.handler);
    }
  }

  /**
   * Register a workflow with the workflow registry
   */
  registerWorkflow(workflow: any): void { // WorkflowBase type
    this.workflowRegistry.register(workflow);
  }
  
  /**
   * MCP SDK integration methods
   * PRESERVED: Exact patterns from ActionStepMCPServer
   */
  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    return await this.mcpSDKHelpers.createMessage(request);
  }
  
  async elicitInput(request: ElicitInputRequest): Promise<ElicitInputResult> {
    return await this.mcpSDKHelpers.elicitInput(request);
  }
  
  /**
   * Register core tools that every Beyond MCP server needs
   * EXTRACTED: Generic tools from ActionStepMCPServer
   */
  protected async registerCoreTools(): Promise<void> {
    this.logger.debug('BeyondMcpServer: Registering core tools...');
    
    // Register all core tools via CoreTools component
    this.coreTools.registerWith(this.toolRegistry);
    
    this.logger.debug('BeyondMcpServer: Core tools registered', {
      toolCount: this.toolRegistry.getToolCount(),
      tools: this.toolRegistry.getToolNames(),
    });
  }
  
  /**
   * Setup transport integration
   */
  protected async setupTransport(): Promise<void> {
    if (this.config.transport?.type === 'http') {
      // Integrate with TransportManager from Phase 3
      // Cast to compatible type for TransportManager
      await this.transportManager.initialize(this.sdkMcpServer as any);
    }
  }
  
  /**
   * Get server status - generic implementation
   * EXTRACTED: From ActionStepMCPServer getServerStatus()
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
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
  BeyondMcpRequestContext,
  ToolDefinition,
  ToolHandler,
  ToolRegistration,
} from '../types/BeyondMcpTypes.ts';