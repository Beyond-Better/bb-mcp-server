/**
 * ExampleCorp MCP Tools
 * 
 * Demonstrates how to create custom MCP tools using the bb-mcp-server library:
 * - Uses library ToolRegistry for registration
 * - Leverages Zod validation from library
 * - Integrates with workflow execution
 * - Shows third-party API integration patterns
 */

// 🎯 Library imports - tool infrastructure
import {
  type ToolRegistry,
  type ToolDefinition,
  type CallToolResult,
  WorkflowRegistry,
  Logger,
  AuditLogger,
} from '@bb/mcp-server'
import { z } from 'zod' // Library provides Zod integration

// 🎯 Consumer-specific imports
import { ExampleApiClient } from '../api/ExampleApiClient.ts'
import { ExampleOAuthConsumer } from '../auth/ExampleOAuthConsumer.ts'

export interface ExampleToolsDependencies {
  apiClient: ExampleApiClient
  oauthConsumer: ExampleOAuthConsumer
  workflowRegistry: WorkflowRegistry
  logger: Logger
  auditLogger?: AuditLogger
}

/**
 * ExampleCorp-specific MCP tools
 * Demonstrates custom tool implementation using library infrastructure
 */
export class ExampleTools {
  private apiClient: ExampleApiClient
  private oauthConsumer: ExampleOAuthConsumer
  private workflowRegistry: WorkflowRegistry
  private logger: Logger
  private auditLogger?: AuditLogger
  
  constructor(dependencies: ExampleToolsDependencies) {
    this.apiClient = dependencies.apiClient
    this.oauthConsumer = dependencies.oauthConsumer
    this.workflowRegistry = dependencies.workflowRegistry
    this.logger = dependencies.logger
    this.auditLogger = dependencies.auditLogger || new AuditLogger({ enabled: false, logAllApiCalls: false }, dependencies.logger)
  }
  
  /**
   * 🎯 Register all ExampleCorp tools with the library's ToolRegistry
   * Library handles: tool registration, Zod validation, error handling
   */
  registerWith(toolRegistry: ToolRegistry): void {
    this.registerExecuteWorkflowTool(toolRegistry)
    this.registerQueryCustomersTool(toolRegistry)
    this.registerCreateOrderTool(toolRegistry)
    this.registerGetOrderStatusTool(toolRegistry)
    this.registerGetApiInfoTool(toolRegistry)
    
    this.logger.info('ExampleCorp tools registered', {
      count: 5,
      tools: [
        'execute_workflow_example',
        'query_customers_example',
        'create_order_example',
        'get_order_status_example',
        'get_api_info_example',
      ],
    })
  }
  
  /**
   * 🎯 Workflow execution tool
   * Demonstrates integration with library WorkflowRegistry
   */
  private registerExecuteWorkflowTool(registry: ToolRegistry): void {
    const workflows = this.workflowRegistry.list()
    
    registry.registerTool('execute_workflow_example', {
      title: '🎯 Execute ExampleCorp Workflow',
      description: 'Execute specialized ExampleCorp business workflows with comprehensive parameter validation and structured results.',
      category: 'ExampleCorp',
      tags: ['workflow', 'business-logic', 'examplecorp'],
      inputSchema: {
        workflow_name: z.enum(workflows.map(w => w.name) as [string, ...string[]]).describe('Workflow to execute'),
        parameters: z.object({
          userId: z.string().describe('User ID for authentication and audit logging (required for all workflows)'),
          requestId: z.string().optional().describe('Optional request ID for tracking'),
          dryRun: z.boolean().optional().default(false).describe('Dry run mode - validate but do not execute'),
        }).passthrough().describe('Workflow parameters'),
      },
    }, async (args, extra) => await this.executeWorkflow(args, extra))
  }
  
  /**
   * 🎯 Customer query tool
   * Demonstrates third-party API integration with OAuth
   */
  private registerQueryCustomersTool(registry: ToolRegistry): void {
    registry.registerTool('query_customers_example', {
      title: '🔍 Query ExampleCorp Customers',
      description: 'Search and retrieve customer data from ExampleCorp API with OAuth authentication.',
      category: 'ExampleCorp',
      tags: ['query', 'customers', 'api'],
      inputSchema: {
        search: z.string().optional().describe('Search term for customer names or IDs'),
        limit: z.number().int().min(1).max(100).optional().default(10).describe('Maximum number of results'),
        filters: z.object({
          status: z.enum(['active', 'inactive', 'suspended']).optional(),
          region: z.string().optional(),
          customerType: z.enum(['individual', 'business']).optional(),
        }).optional().describe('Additional filters'),
        userId: z.string().describe('User ID for authentication'),
      },
    }, async (args, extra) => await this.queryCustomers(args, extra))
  }
  
  /**
   * 🎯 Order creation tool
   * Demonstrates complex business operations with validation
   */
  private registerCreateOrderTool(registry: ToolRegistry): void {
    registry.registerTool('create_order_example', {
      title: '📦 Create ExampleCorp Order',
      description: 'Create new orders in ExampleCorp system with comprehensive validation.',
      category: 'ExampleCorp',
      tags: ['create', 'orders', 'business'],
      inputSchema: {
        customerId: z.string().describe('Customer ID for the order'),
        items: z.array(z.object({
          productId: z.string(),
          quantity: z.number().int().min(1),
          unitPrice: z.number().min(0),
          notes: z.string().optional(),
        })).min(1).describe('Order items'),
        shippingAddress: z.object({
          street: z.string(),
          city: z.string(),
          state: z.string(),
          zipCode: z.string(),
          country: z.string().default('US'),
        }).describe('Shipping address'),
        priority: z.enum(['standard', 'expedited', 'urgent']).optional().default('standard'),
        notes: z.string().optional(),
        userId: z.string().describe('User ID for authentication'),
      },
    }, async (args, extra) => await this.createOrder(args, extra))
  }
  
  /**
   * 🎯 Order status tool
   * Demonstrates simple API queries with OAuth
   */
  private registerGetOrderStatusTool(registry: ToolRegistry): void {
    registry.registerTool('get_order_status_example', {
      title: '📊 Get ExampleCorp Order Status',
      description: 'Retrieve current status and tracking information for ExampleCorp orders.',
      category: 'ExampleCorp',
      tags: ['query', 'orders', 'status'],
      inputSchema: {
        orderId: z.string().describe('Order ID to query'),
        includeHistory: z.boolean().optional().default(false).describe('Include order status history'),
        userId: z.string().describe('User ID for authentication'),
      },
    }, async (args, extra) => await this.getOrderStatus(args, extra))
  }
  
  /**
   * 🎯 API information tool
   * Demonstrates system integration information
   */
  private registerGetApiInfoTool(registry: ToolRegistry): void {
    registry.registerTool('get_api_info_example', {
      title: 'ℹ️ Get ExampleCorp API Information',
      description: 'Get information about ExampleCorp API connectivity and available operations.',
      category: 'ExampleCorp',
      tags: ['info', 'api', 'status'],
      inputSchema: {},
    }, async (args, extra) => await this.getApiInfo(args, extra))
  }
  
  // =============================================================================
  // TOOL IMPLEMENTATIONS
  // =============================================================================
  
  /**
   * 🎯 Execute ExampleCorp workflow
   * Demonstrates workflow integration with library infrastructure
   */
  private async executeWorkflow(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const { workflow_name, parameters } = args
      
      // 🎯 Get workflow from library registry
      const workflow = this.workflowRegistry.get(workflow_name)
      if (!workflow) {
        return {
          content: [{
            type: 'text',
            text: `Workflow '${workflow_name}' not found. Available workflows: ${this.workflowRegistry.list().map(w => w.name).join(', ')}`,
          }],
          isError: true,
        }
      }
      
      // 🎯 Execute with authentication context (library handles context management)
      const result = await workflow.executeWithValidation(parameters, {
        userId: parameters.userId,
        requestId: parameters.requestId || 'unknown',
        workflowName: workflow.name,
        startTime: new Date(),
        auditLogger: this.auditLogger ?? new AuditLogger({ enabled: false, logAllApiCalls: false }, this.logger),
        logger: this.logger,
        kvManager: undefined,
        thirdPartyClient: undefined,
        parameterUserId: parameters.userId,
        _meta: {},
        authenticatedUserId: parameters.userId,
        clientId: 'example-tools',
        scopes: [],
      })
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            workflow: workflow_name,
            status: 'success',
            result,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      }
      
    } catch (error) {
      this.logger.error('Workflow execution failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [{
          type: 'text',
          text: `Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      }
    }
  }
  
  /**
   * 🎯 Query customers from ExampleCorp API
   * Demonstrates OAuth-authenticated API calls
   */
  private async queryCustomers(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const { search, limit, filters, userId } = args
      
      // 🎯 Get OAuth access token (library handles token refresh)
      const accessToken = await this.oauthConsumer.getAccessToken(userId)
      
      // 🎯 Make authenticated API call
      const customers = await this.apiClient.queryCustomers({
        search,
        filters,
        pagination: {
          page: 1,
          limit: limit || 10,
          sortBy: 'name',
          sortOrder: 'asc',
        },
        userId,
      })
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: { search, limit, filters },
            results: customers,
            count: customers.items.length,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      }
      
    } catch (error) {
      this.logger.error('Customer query failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [{
          type: 'text',
          text: `Customer query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      }
    }
  }
  
  /**
   * 🎯 Create order in ExampleCorp system
   * Demonstrates complex business operations
   */
  private async createOrder(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const { customerId, items, shippingAddress, priority, notes, userId } = args
      
      // 🎯 Get OAuth access token
      const accessToken = await this.oauthConsumer.getAccessToken(userId)
      
      // 🎯 Create order via API
      const order = await this.apiClient.createOrder({
        customerId,
        items,
        shippingMethod: priority === 'urgent' ? 'overnight' : (priority === 'expedited' ? 'expedited' : 'standard'),
        notes,
      }, userId)
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            orderId: order.id,
            status: order.status,
            totalAmount: order.totalAmount,
            estimatedDelivery: order.estimatedDelivery,
            trackingNumber: order.trackingNumber,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      }
      
    } catch (error) {
      this.logger.error('Order creation failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [{
          type: 'text',
          text: `Order creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      }
    }
  }
  
  /**
   * 🎯 Get order status from ExampleCorp API
   */
  private async getOrderStatus(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const { orderId, includeHistory, userId } = args
      
      // 🎯 Get OAuth access token
      const accessToken = await this.oauthConsumer.getAccessToken(userId)
      
      // 🎯 Query order status
      const orderStatus = await this.apiClient.getOrderStatus({
        orderId,
        includeHistory,
        userId,
      })
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(orderStatus, null, 2),
        }],
      }
      
    } catch (error) {
      this.logger.error('Order status query failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [{
          type: 'text',
          text: `Order status query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      }
    }
  }
  
  /**
   * 🎯 Get ExampleCorp API information
   */
  private async getApiInfo(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const apiInfo = await this.apiClient.getApiInfo()
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...apiInfo,
            connectionStatus: 'connected',
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      }
      
    } catch (error) {
      this.logger.error('API info query failed', error instanceof Error ? error : new Error(String(error)))
      return {
        content: [{
          type: 'text',
          text: `API info query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      }
    }
  }
}

/**
 * LIBRARY VALIDATION:
 * 
 * This file demonstrates how custom tools integrate with library infrastructure:
 * 
 * ✅ Tool Registration: Uses library ToolRegistry (~5 lines vs complex registration)
 * ✅ Zod Validation: Leverages library Zod integration (~0 lines vs manual validation)
 * ✅ Error Handling: Uses library error handling patterns (~5 lines vs complex handling)
 * ✅ OAuth Integration: Uses library OAuth consumer (~2 lines vs complex token management)
 * ✅ Workflow Integration: Uses library WorkflowRegistry (~5 lines vs complex workflow management)
 * ✅ Logging: Uses library Logger (~1 line vs complex audit setup)
 * ✅ Context Management: Library handles AsyncLocalStorage context automatically
 * 
 * ARCHITECTURE BENEFITS:
 * - Clean separation: Tools focus on business logic, library handles infrastructure
 * - Type safety: Full TypeScript support with Zod validation
 * - Extensibility: Easy to add new tools following same patterns
 * - Maintainability: Small focused methods, clear responsibilities
 * - Testing: Tools can be unit tested independently of MCP infrastructure
 */