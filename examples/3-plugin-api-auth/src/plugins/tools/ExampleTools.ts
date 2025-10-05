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
  AuditLogger,
  type CallToolResult,
  Logger,
  ToolBase,
  ToolHandlerMode,
  type ToolRegistration,
  type ToolRegistry,
} from '@beyondbetter/bb-mcp-server';
import { z } from 'zod'; // Library provides Zod integration

// 🎯 Consumer-specific imports
import { ExampleApiClient } from '../../api/ExampleApiClient.ts';
import { ExampleOAuthConsumer } from '../../auth/ExampleOAuthConsumer.ts';

export interface ExampleToolsDependencies {
  apiClient: ExampleApiClient;
  oauthConsumer: ExampleOAuthConsumer;
  logger: Logger;
  auditLogger?: AuditLogger;
}

/**
 * ExampleCorp-specific MCP tools
 * Demonstrates custom tool implementation using library infrastructure
 */
export class ExampleTools extends ToolBase {
  // Required abstract properties from ToolBase
  readonly name = 'examplecorp-tools';
  readonly version = '1.0.0';
  readonly description =
    'ExampleCorp business tools for customer management, orders, and API integration';
  readonly category = 'business' as const;
  readonly tags = ['examplecorp', 'business', 'customers', 'orders', 'api'];
  override readonly estimatedDuration = 5; // seconds
  override readonly requiresAuth = true;

  private apiClient: ExampleApiClient;
  private oauthConsumer: ExampleOAuthConsumer;
  private logger: Logger;
  private auditLogger: AuditLogger;

  constructor(dependencies: ExampleToolsDependencies) {
    super(); // Call ToolBase constructor
    this.apiClient = dependencies.apiClient;
    this.oauthConsumer = dependencies.oauthConsumer;
    this.logger = dependencies.logger;
    this.auditLogger = dependencies.auditLogger ||
      new AuditLogger(
        { enabled: false, logAllApiCalls: false },
        dependencies.logger,
      );
  }

  /**
   * Get tool overview for documentation and descriptions
   * Required abstract method from ToolBase
   */
  getOverview(): string {
    return `ExampleCorp business tools providing comprehensive API integration for customer management, order processing, and system information. Includes OAuth-authenticated operations for querying customers, creating orders, checking order status, and retrieving API connectivity information. All tools support proper error handling and audit logging.`;
  }

  /**
   * 🎯 Register all ExampleCorp tools with the library's ToolRegistry
   * Library handles: tool registration, Zod validation, error handling
   */
  registerWith(toolRegistry: ToolRegistry): void {
    this.registerQueryCustomersTool(toolRegistry);
    this.registerCreateOrderTool(toolRegistry);
    this.registerGetOrderStatusTool(toolRegistry);
    this.registerGetApiInfoTool(toolRegistry);

    this.logger.info('ExampleCorp custom tools registered', {
      count: 4,
      tools: [
        'query_customers_example',
        'create_order_example',
        'get_order_status_example',
        'get_api_info_example',
      ],
      note:
        'Workflow tools (execute_workflow, get_schema_for_workflow) are registered by the library',
    });
  }

  /**
   * 🎯 Get tool definitions for plugin registration
   * Returns tool objects that PluginManager can register automatically
   * Required abstract method from ToolBase
   */
  getTools(): ToolRegistration[] {
    return [
      {
        name: 'query_customers_example',
        definition: {
          title: '🔍 Query ExampleCorp Customers',
          description:
            'Search and retrieve customer data from ExampleCorp API with OAuth authentication.',
          category: 'ExampleCorp',
          tags: ['query', 'customers', 'api'],
          inputSchema: {
            search: z.string().optional().describe(
              'Search term for customer names or IDs',
            ),
            limit: z.number().int().min(1).max(100).optional().default(10)
              .describe(
                'Maximum number of results',
              ),
            filters: z.object({
              status: z.enum(['active', 'inactive', 'suspended']).optional(),
              region: z.string().optional(),
              customerType: z.enum(['individual', 'business']).optional(),
            }).optional().describe('Additional filters'),
            userId: z.string().describe('User ID for authentication'),
          },
        },
        handler: async (args, extra) => await this.queryCustomers(args, extra),
        options: { handlerMode: ToolHandlerMode.MANAGED },
      },
      {
        name: 'create_order_example',
        definition: {
          title: '📦 Create ExampleCorp Order',
          description: 'Create new orders in ExampleCorp system with comprehensive validation.',
          category: 'ExampleCorp',
          tags: ['create', 'orders', 'business', 'api'],
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
            priority: z.enum(['standard', 'expedited', 'urgent']).optional()
              .default('standard'),
            notes: z.string().optional(),
            userId: z.string().describe('User ID for authentication'),
          },
        },
        handler: async (args, extra) => await this.createOrder(args, extra),
        options: { handlerMode: ToolHandlerMode.MANAGED },
      },
      {
        name: 'get_order_status_example',
        definition: {
          title: '📊 Get ExampleCorp Order Status',
          description: 'Retrieve current status and tracking information for ExampleCorp orders.',
          category: 'ExampleCorp',
          tags: ['query', 'orders', 'status', 'api'],
          inputSchema: {
            orderId: z.string().describe('Order ID to query'),
            includeHistory: z.boolean().optional().default(false).describe(
              'Include order status history',
            ),
            userId: z.string().describe('User ID for authentication'),
          },
        },
        handler: async (args, extra) => await this.getOrderStatus(args, extra),
        options: { handlerMode: ToolHandlerMode.MANAGED },
      },
      {
        name: 'get_api_info_example',
        definition: {
          title: 'ℹ️ Get ExampleCorp API Information',
          description:
            'Get information about ExampleCorp API connectivity and available operations.',
          category: 'ExampleCorp',
          tags: ['info', 'api', 'status'],
          inputSchema: {},
        },
        handler: async (args, extra) => await this.getApiInfo(args, extra),
        options: { handlerMode: ToolHandlerMode.MANAGED },
      },
    ];
  }

  /**
   * 🎯 Customer query tool
   * Demonstrates third-party API integration with OAuth
   */
  private registerQueryCustomersTool(registry: ToolRegistry): void {
    registry.registerTool(
      'query_customers_example',
      {
        title: '🔍 Query ExampleCorp Customers',
        description:
          'Search and retrieve customer data from ExampleCorp API with OAuth authentication.',
        category: 'ExampleCorp',
        tags: ['query', 'customers', 'api'],
        inputSchema: {
          search: z.string().optional().describe(
            'Search term for customer names or IDs',
          ),
          limit: z.number().int().min(1).max(100).optional().default(10)
            .describe(
              'Maximum number of results',
            ),
          filters: z.object({
            status: z.enum(['active', 'inactive', 'suspended']).optional(),
            region: z.string().optional(),
            customerType: z.enum(['individual', 'business']).optional(),
          }).optional().describe('Additional filters'),
          userId: z.string().describe('User ID for authentication'),
        },
      },
      async (args, extra) => await this.queryCustomers(args, extra),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * 🎯 Order creation tool
   * Demonstrates complex business operations with validation
   */
  private registerCreateOrderTool(registry: ToolRegistry): void {
    registry.registerTool(
      'create_order_example',
      {
        title: '📦 Create ExampleCorp Order',
        description: 'Create new orders in ExampleCorp system with comprehensive validation.',
        category: 'ExampleCorp',
        tags: ['create', 'orders', 'business', 'api'],
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
          priority: z.enum(['standard', 'expedited', 'urgent']).optional()
            .default('standard'),
          notes: z.string().optional(),
          userId: z.string().describe('User ID for authentication'),
        },
      },
      async (args, extra) => await this.createOrder(args, extra),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * 🎯 Order status tool
   * Demonstrates simple API queries with OAuth
   */
  private registerGetOrderStatusTool(registry: ToolRegistry): void {
    registry.registerTool(
      'get_order_status_example',
      {
        title: '📊 Get ExampleCorp Order Status',
        description: 'Retrieve current status and tracking information for ExampleCorp orders.',
        category: 'ExampleCorp',
        tags: ['query', 'orders', 'status', 'api'],
        inputSchema: {
          orderId: z.string().describe('Order ID to query'),
          includeHistory: z.boolean().optional().default(false).describe(
            'Include order status history',
          ),
          userId: z.string().describe('User ID for authentication'),
        },
      },
      async (args, extra) => await this.getOrderStatus(args, extra),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  /**
   * 🎯 API information tool
   * Demonstrates system integration information
   */
  private registerGetApiInfoTool(registry: ToolRegistry): void {
    registry.registerTool(
      'get_api_info_example',
      {
        title: 'ℹ️ Get ExampleCorp API Information',
        description: 'Get information about ExampleCorp API connectivity and available operations.',
        category: 'ExampleCorp',
        tags: ['info', 'api', 'status'],
        inputSchema: {},
      },
      async (args, extra) => await this.getApiInfo(args, extra),
      { handlerMode: ToolHandlerMode.MANAGED },
    );
  }

  // =============================================================================
  // TOOL IMPLEMENTATIONS
  // =============================================================================

  /**
   * 🎯 Query customers from ExampleCorp API
   * Demonstrates OAuth-authenticated API calls
   */
  private async queryCustomers(
    args: any,
    extra?: any,
  ): Promise<CallToolResult> {
    try {
      const { search, limit, filters, userId } = args;

      // 🎯 Get OAuth access token (library handles token refresh)
      const accessToken = await this.oauthConsumer.getAccessToken(userId);

      // 🎯 Make authenticated API call
      const customers = await this.apiClient.queryCustomers(accessToken, {
        search,
        filters,
        pagination: {
          page: 1,
          limit: limit || 10,
          sortBy: 'name',
          sortOrder: 'asc',
        },
        userId,
      });

      await this.auditLogger.logSystemEvent({
        event: 'query_customers_executed',
        severity: 'info',
        details: {
          customers_length: customers.items.length,
          success: true,
        },
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            {
              query: { search, limit, filters },
              results: customers,
              count: customers.items.length,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    } catch (error) {
      this.logger.error(
        'Customer query failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        content: [{
          type: 'text',
          text: `Customer query failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        }],
        isError: true,
      };
    }
  }

  /**
   * 🎯 Create order in ExampleCorp system
   * Demonstrates complex business operations
   */
  private async createOrder(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const {
        customerId,
        items,
        shippingAddress: _shippingAddress,
        priority,
        notes,
        userId,
      } = args;

      // 🎯 Get OAuth access token
      const accessToken = await this.oauthConsumer.getAccessToken(userId);

      // 🎯 Create order via API
      const order = await this.apiClient.createOrder(accessToken, {
        customerId,
        items,
        shippingMethod: priority === 'urgent'
          ? 'overnight'
          : (priority === 'expedited' ? 'expedited' : 'standard'),
        notes,
      }, userId);

      await this.auditLogger.logSystemEvent({
        event: 'create_order_executed',
        severity: 'info',
        details: {
          customer_id: order.customerId,
          success: true,
        },
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            {
              orderId: order.id,
              status: order.status,
              totalAmount: order.totalAmount,
              estimatedDelivery: order.estimatedDelivery,
              trackingNumber: order.trackingNumber,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    } catch (error) {
      this.logger.error(
        'Order creation failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        content: [{
          type: 'text',
          text: `Order creation failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        }],
        isError: true,
      };
    }
  }

  /**
   * 🎯 Get order status from ExampleCorp API
   */
  private async getOrderStatus(
    args: any,
    extra?: any,
  ): Promise<CallToolResult> {
    try {
      const { orderId, includeHistory, userId } = args;

      // 🎯 Get OAuth access token
      const accessToken = await this.oauthConsumer.getAccessToken(userId);

      // 🎯 Query order status
      const orderStatus = await this.apiClient.getOrderStatus(accessToken, {
        orderId,
        includeHistory,
        userId,
      });

      await this.auditLogger.logSystemEvent({
        event: 'get_order_status_executed',
        severity: 'info',
        details: {
          order_id: orderStatus.orderId,
          success: true,
        },
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(orderStatus, null, 2),
        }],
      };
    } catch (error) {
      this.logger.error(
        'Order status query failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        content: [{
          type: 'text',
          text: `Order status query failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        }],
        isError: true,
      };
    }
  }

  /**
   * 🎯 Get ExampleCorp API information
   */
  private async getApiInfo(args: any, extra?: any): Promise<CallToolResult> {
    try {
      const apiInfo = await this.apiClient.getApiInfo();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            {
              ...apiInfo,
              connectionStatus: 'connected',
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        }],
      };
    } catch (error) {
      this.logger.error(
        'API info query failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        content: [{
          type: 'text',
          text: `API info query failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        }],
        isError: true,
      };
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
