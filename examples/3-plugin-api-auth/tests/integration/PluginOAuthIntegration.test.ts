/**
 * Plugin OAuth Integration Tests
 *
 * This test file demonstrates complete OAuth-aware plugin integration testing:
 * - Plugin discovery with OAuth dependencies
 * - End-to-end OAuth authentication flows
 * - Complete tool and workflow registration with authentication
 * - Integration between OAuth consumer, API client, and plugin components
 * - Cross-component authentication state management
 *
 * LEARNING FOCUS:
 * ===============
 *
 * Shows users how to:
 * 1. Test complete OAuth-enabled plugin integration
 * 2. Validate plugin discovery with authentication dependencies
 * 3. Test end-to-end OAuth authentication flows
 * 4. Validate cross-component integration
 * 5. Test OAuth state management across tools and workflows
 * 6. Verify authentication consistency throughout the system
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';

// Import plugin factory and components
import createPlugin from '../../src/plugins/ExamplePlugin.ts';
import { ExampleTools } from '../../src/plugins/tools/ExampleTools.ts';
import { ExampleQueryWorkflow } from '../../src/plugins/workflows/ExampleQueryWorkflow.ts';
import { ExampleOperationWorkflow } from '../../src/plugins/workflows/ExampleOperationWorkflow.ts';

// Import OAuth-aware test utilities
import {
  createAuthenticatedWorkflowContext,
  createConnectedMocks,
  createMockApiClient,
  createMockAuthLogger,
  createMockOAuthConsumer,
  MockApiClient,
  MockAuthLogger,
  MockOAuthConsumer,
} from '../utils/test-helpers.ts';

/**
 * Plugin OAuth Integration Tests
 *
 * These tests verify the complete OAuth-enabled plugin integration
 * including authentication flows, dependency injection, and cross-component communication.
 */
describe('Plugin OAuth Integration', () => {
  let mockOAuth: MockOAuthConsumer;
  let mockApiClient: MockApiClient;
  let mockLogger: MockAuthLogger;
  let plugin: any;
  let dependencies: any;

  beforeEach(() => {
    // Set up comprehensive OAuth and API mocks with proper wiring
    const mocks = createConnectedMocks();
    mockOAuth = mocks.oauthConsumer;
    mockApiClient = mocks.apiClient;
    mockLogger = createMockAuthLogger();

    // Create complete dependency set
    dependencies = {
      thirdpartyApiClient: mockApiClient,
      oAuthConsumer: mockOAuth,
      logger: mockLogger,
      auditLogger: mockLogger,
    };

    // Create plugin with dependencies
    plugin = createPlugin(dependencies as any);
  });

  /**
   * PLUGIN DISCOVERY AND INITIALIZATION
   */
  describe('Plugin Discovery with OAuth Dependencies', () => {
    it('should create plugin with OAuth dependencies successfully', () => {
      assertExists(plugin, 'Plugin should be created');
      assertEquals(plugin.name, 'example-corp-plugin');
      assertEquals(plugin.version, '1.0.0');
      assert(plugin.tags.includes('api'), 'Should have API tag');
      assert(plugin.tags.includes('examplecorp'), 'Should have ExampleCorp tag');
    });

    it('should initialize tools with OAuth dependencies', () => {
      assertExists(plugin.tools, 'Plugin should have tools array');
      assertEquals(plugin.tools.length, 4, 'Should have 4 OAuth-authenticated tools');

      const expectedTools = [
        'query_customers_example',
        'create_order_example',
        'get_order_status_example',
        'get_api_info_example',
      ];

      expectedTools.forEach((toolName) => {
        const tool = plugin.tools.find((t: any) => t.name === toolName);
        assertExists(tool, `Tool '${toolName}' should be registered`);
        assertExists(tool.definition, `Tool '${toolName}' should have definition`);
        assertExists(tool.handler, `Tool '${toolName}' should have handler`);
      });
    });

    it('should initialize workflows with OAuth dependencies', () => {
      assertExists(plugin.workflows, 'Plugin should have workflows array');
      assertEquals(plugin.workflows.length, 2, 'Should have 2 OAuth-authenticated workflows');

      const expectedWorkflows = [
        'example_query',
        'example_operation',
      ];

      expectedWorkflows.forEach((workflowName) => {
        const workflow = plugin.workflows.find((w: any) => w.name === workflowName);
        assertExists(workflow, `Workflow '${workflowName}' should be registered`);
      });
    });

    it('should handle missing OAuth dependencies gracefully', () => {
      // Create plugin without OAuth dependencies
      const pluginWithoutOAuth = createPlugin({
        thirdpartyApiClient: null,
        oAuthConsumer: null,
        logger: mockLogger,
        auditLogger: mockLogger,
      } as any);

      // Should create plugin but with warnings
      assertExists(pluginWithoutOAuth);
      assertEquals(pluginWithoutOAuth.tools.length, 0, 'Should have no tools without OAuth');

      // Should log warnings about missing dependencies
      const warnCalls = mockLogger.warnCalls;
      assert(warnCalls.some((call) => call[0].includes('Missing required dependencies')));
    });
  });

  /**
   * END-TO-END OAUTH AUTHENTICATION FLOWS
   */
  describe('End-to-End OAuth Authentication', () => {
    it('should complete full OAuth flow across tools and workflows', async () => {
      const userId = 'integration-test-user';

      // Step 1: Use query tool to authenticate and get customer
      const queryTool = plugin.tools.find((t: any) => t.name === 'query_customers_example');
      const queryResult = await queryTool.handler({
        userId,
        search: 'Acme',
        limit: 1,
      });

      assertEquals(queryResult.isError, undefined, 'Query tool should succeed');

      // Step 2: Use workflow to perform complex operation
      const operationWorkflow = plugin.workflows.find((w: any) => w.name === 'example_operation');
      const workflowResult = await operationWorkflow.executeWithValidation({
        userId,
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Integration Test Customer',
            email: 'integration@test.com',
            address: {
              street: '123 Integration St',
              city: 'Test City',
              state: 'TS',
              zipCode: '12345',
            },
          },
          order: {
            items: [
              { productId: 'prod_001', quantity: 1, unitPrice: 299.99 },
            ],
          },
        },
      }, createAuthenticatedWorkflowContext());

      assertEquals(workflowResult.success, true, 'Workflow should succeed');

      // Step 3: Use another tool to check the created order
      const statusTool = plugin.tools.find((t: any) => t.name === 'get_order_status_example');
      const orderId = workflowResult.data.result.order.id;
      const statusResult = await statusTool.handler({
        userId,
        orderId,
        includeHistory: true,
      });

      assertEquals(statusResult.isError, undefined, 'Status tool should succeed');

      // Verify OAuth token was used consistently
      assert(mockOAuth.hasValidToken(userId), 'Should have valid OAuth token');

      // Verify API calls were made in sequence
      const apiCalls = mockApiClient.getCallLog();
      assert(apiCalls.length >= 4, 'Should have made multiple authenticated API calls');
      assert(
        apiCalls.every((call) => call.userId === userId),
        'All calls should use same user context',
      );
    });

    it('should handle OAuth token refresh during long operations', async () => {
      const userId = 'refresh-test-user';

      // Set up token that expires quickly
      mockOAuth.setTokenForUser(userId, {
        access_token: 'short_lived_token',
        refresh_token: 'refresh_token_123',
        expires_at: Date.now() + 500, // Expires in 500ms
        token_type: 'Bearer',
      });

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Execute workflow that should refresh token
      const queryWorkflow = plugin.workflows.find((w: any) => w.name === 'example_query');
      const result = await queryWorkflow.executeWithValidation({
        userId,
        queryType: 'customers',
        searchTerm: 'test',
      }, createAuthenticatedWorkflowContext());

      assertEquals(result.success, true, 'Should succeed with token refresh');

      // Verify token was refreshed
      const tokenInfo = mockOAuth.getTokenInfo(userId);
      assertExists(tokenInfo);
      assert(
        tokenInfo.access_token !== 'short_lived_token',
        `Token should have been refreshed. Got: ${tokenInfo.access_token}`,
      );
    });

    it('should isolate OAuth tokens between different users', async () => {
      const user1 = 'user1';
      const user2 = 'user2';

      // Set up different tokens for each user
      mockOAuth.setTokenForUser(user1, {
        access_token: 'token_user1',
        refresh_token: 'refresh_user1',
        expires_at: Date.now() + 3600000,
        token_type: 'Bearer',
      });

      mockOAuth.setTokenForUser(user2, {
        access_token: 'token_user2',
        refresh_token: 'refresh_user2',
        expires_at: Date.now() + 3600000,
        token_type: 'Bearer',
      });

      // Execute operations with both users
      const queryTool = plugin.tools.find((t: any) => t.name === 'query_customers_example');

      const result1 = await queryTool.handler({ userId: user1, search: 'test1' });
      const result2 = await queryTool.handler({ userId: user2, search: 'test2' });

      assertEquals(result1.isError, undefined, 'User1 operation should succeed');
      assertEquals(result2.isError, undefined, 'User2 operation should succeed');

      // Verify each user used their own token
      assertEquals(mockOAuth.getTokenInfo(user1).access_token, 'token_user1');
      assertEquals(mockOAuth.getTokenInfo(user2).access_token, 'token_user2');

      // Verify API calls were made with correct user context
      const apiCalls = mockApiClient.getCallLog();
      const user1Calls = apiCalls.filter((call) => call.userId === user1);
      const user2Calls = apiCalls.filter((call) => call.userId === user2);

      assertEquals(user1Calls.length, 1);
      assertEquals(user2Calls.length, 1);
      assertEquals(user1Calls[0]!.params.search, 'test1');
      assertEquals(user2Calls[0]!.params.search, 'test2');
    });
  });

  /**
   * CROSS-COMPONENT AUTHENTICATION STATE
   */
  describe('Cross-Component Authentication State', () => {
    it('should maintain authentication state between tools and workflows', async () => {
      const userId = 'cross-component-user';

      // Step 1: Execute tool that requires authentication
      const queryTool = plugin.tools.find((t: any) => t.name === 'query_customers_example');
      const toolResult = await queryTool.handler({
        userId,
        search: 'Acme',
      });

      assertEquals(toolResult.isError, undefined);

      // Step 2: Execute workflow that requires authentication
      const queryWorkflow = plugin.workflows.find((w: any) => w.name === 'example_query');
      const workflowResult = await queryWorkflow.executeWithValidation({
        userId,
        queryType: 'orders',
        searchTerm: 'urgent',
      }, createAuthenticatedWorkflowContext());

      assertEquals(workflowResult.success, true);

      // Step 3: Execute another tool with same authentication
      const statusTool = plugin.tools.find((t: any) => t.name === 'get_order_status_example');
      const statusResult = await statusTool.handler({
        userId,
        orderId: 'order_12345',
      });

      assertEquals(statusResult.isError, undefined);

      // Verify same OAuth token was used consistently
      assert(mockOAuth.hasValidToken(userId));

      // Verify API calls all used same authentication context
      const apiCalls = mockApiClient.getCallLog();
      const userCalls = apiCalls.filter((call) => call.userId === userId);
      assertEquals(userCalls.length, 3, 'Should have made 3 authenticated calls');
    });

    it('should handle authentication failure across components', async () => {
      const userId = 'failing-auth-user';

      // Set up OAuth failure
      mockOAuth.setAuthFailure(userId, true);

      // Test tool failure
      const queryTool = plugin.tools.find((t: any) => t.name === 'query_customers_example');
      const toolResult = await queryTool.handler({
        userId,
        search: 'test',
      });

      assertEquals(toolResult.isError, true);
      assert(toolResult.content[0].text.includes('OAuth authentication failed'));

      // Test workflow failure
      const queryWorkflow = plugin.workflows.find((w: any) => w.name === 'example_query');
      const workflowResult = await queryWorkflow.executeWithValidation({
        userId,
        queryType: 'customers',
      }, createAuthenticatedWorkflowContext());

      assertEquals(workflowResult.success, false);
      assert(workflowResult.error.message.includes('OAuth authentication failed'));

      // Verify consistent authentication failure handling
      const authEvents = mockLogger.getAuthEventsForUser(userId);
      assert(authEvents.length > 0, 'Should have logged authentication events');
    });
  });

  /**
   * PLUGIN LIFECYCLE WITH OAUTH
   */
  describe('Plugin Lifecycle with OAuth', () => {
    it('should initialize plugin with OAuth dependencies', async () => {
      // Simulate plugin initialization
      await plugin.initialize(dependencies, null, null);

      // Should log successful initialization
      const logCalls = mockLogger.infoCalls;
      const initLog = logCalls.find((call) => call[0].includes('plugin initialized'));
      assertExists(initLog);

      // Should track OAuth dependency availability
      const logData = initLog[1];
      assertEquals(logData.workflows, 2);
      assertEquals(logData.tools, 4);
    });

    it('should cleanup plugin resources properly', async () => {
      await plugin.cleanup();

      // Plugin cleanup should not affect OAuth state (handled by library)
      assert(mockOAuth.hasValidToken('test-user'));
    });
  });

  /**
   * COMPREHENSIVE OAUTH FLOW TESTING
   */
  describe('Comprehensive OAuth Flow Testing', () => {
    it('should handle complete business process with OAuth', async () => {
      const userId = 'business-process-user';

      // Complete business process: Query customer → Create order → Check status

      // Step 1: Query existing customers
      const queryTool = plugin.tools.find((t: any) => t.name === 'query_customers_example');
      const customerQuery = await queryTool.handler({
        userId,
        search: 'Acme',
        filters: { status: 'active' },
      });

      assertEquals(customerQuery.isError, undefined);
      const customers = JSON.parse(customerQuery.content[0].text);
      const customerId = customers.results.items[0].id;

      // Step 2: Create order via workflow
      const operationWorkflow = plugin.workflows.find((w: any) => w.name === 'example_operation');
      const orderCreation = await operationWorkflow.executeWithValidation({
        userId,
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'New Business Customer',
            email: 'new@business.com',
            address: {
              street: '456 Business Blvd',
              city: 'Commerce City',
              state: 'CC',
              zipCode: '67890',
            },
          },
          order: {
            items: [
              { productId: 'prod_001', quantity: 5, unitPrice: 100.00 },
            ],
          },
        },
      }, createAuthenticatedWorkflowContext());

      assertEquals(orderCreation.success, true);
      const newOrderId = orderCreation.data.result.order.id;

      // Step 3: Check order status
      const statusTool = plugin.tools.find((t: any) => t.name === 'get_order_status_example');
      const statusCheck = await statusTool.handler({
        userId,
        orderId: newOrderId,
        includeHistory: true,
      });

      assertEquals(statusCheck.isError, undefined);

      // Verify OAuth authentication worked throughout
      assert(mockOAuth.hasValidToken(userId));

      // Verify comprehensive API interaction
      const apiCalls = mockApiClient.getCallLog();
      const userCalls = apiCalls.filter((call) => call.userId === userId);
      assert(userCalls.length >= 4, 'Should have made multiple authenticated API calls');

      // Verify call sequence: query → create customer → create order → get status
      const callMethods = userCalls.map((call) => call.method);
      assert(callMethods.includes('queryCustomers'));
      assert(callMethods.includes('createCustomer'));
      assert(callMethods.includes('createOrder'));
      assert(callMethods.includes('getOrderStatus'));
    });

    it('should handle OAuth errors consistently across components', async () => {
      const userId = 'consistent-error-user';

      // Set up OAuth failure
      mockOAuth.setAuthFailure(userId, true);

      // Test all tools fail consistently
      const tools = plugin.tools.filter((t: any) => t.name !== 'get_api_info_example' // This tool doesn't require auth
      );

      for (const tool of tools) {
        const result = await tool.handler({
          userId,
          ...(tool.name === 'query_customers_example'
            ? { search: 'test' }
            : tool.name === 'create_order_example'
            ? {
              customerId: 'test',
              items: [{ productId: 'test', quantity: 1, unitPrice: 100 }],
              shippingAddress: { street: 'test', city: 'test', state: 'TS', zipCode: '12345' },
            }
            : tool.name === 'get_order_status_example'
            ? { orderId: 'test' }
            : {}),
        });

        assertEquals(result.isError, true, `Tool ${tool.name} should fail with OAuth error`);
        assert(
          result.content[0].text.includes('OAuth authentication failed'),
          `Tool ${tool.name} should return OAuth error`,
        );
      }

      // Test workflows fail consistently
      const workflows = plugin.workflows;
      for (const workflow of workflows) {
        const result = await workflow.executeWithValidation({
          userId,
          ...(workflow.name === 'example_query'
            ? { queryType: 'customers' }
            : workflow.name === 'example_operation'
            ? {
              operationType: 'create_customer_with_order',
              operationData: {
                type: 'create_customer_with_order',
                customer: {
                  name: 'test',
                  email: 'test@test.com',
                  address: { street: 'test', city: 'test', state: 'TS', zipCode: '12345' },
                },
                order: { items: [{ productId: 'test', quantity: 1, unitPrice: 100 }] },
              },
            }
            : {}),
        }, createAuthenticatedWorkflowContext());

        assertEquals(
          result.success,
          false,
          `Workflow ${workflow.name} should fail with OAuth error. Got result: ${
            JSON.stringify(result, null, 2)
          }`,
        );
        assertExists(result.error, `Workflow ${workflow.name} should have error object`);
        assert(
          result.error.message.includes('OAuth authentication failed'),
          `Workflow ${workflow.name} should return OAuth error`,
        );
      }
    });
  });

  /**
   * PERFORMANCE AND CONCURRENCY
   */
  describe('Performance and Concurrency with OAuth', () => {
    it('should handle concurrent OAuth operations', async () => {
      const users = ['user1', 'user2', 'user3'];

      // Set up tokens for all users
      users.forEach((userId) => {
        mockOAuth.setTokenForUser(userId, {
          access_token: `token_${userId}`,
          refresh_token: `refresh_${userId}`,
          expires_at: Date.now() + 3600000,
          token_type: 'Bearer',
        });
      });

      // Execute concurrent operations
      const queryTool = plugin.tools.find((t: any) => t.name === 'query_customers_example');
      const promises = users.map((userId) =>
        queryTool.handler({
          userId,
          search: `search_${userId}`,
          limit: 5,
        })
      );

      const results = await Promise.all(promises);

      // All operations should succeed
      assertEquals(results.length, 3);
      results.forEach((result, index) => {
        assertEquals(result.isError, undefined, `User ${users[index]} operation should succeed`);
      });

      // Verify each user's OAuth token was used correctly
      users.forEach((userId) => {
        assert(mockOAuth.hasValidToken(userId), `User ${userId} should have valid token`);
      });

      // Verify API calls were made for all users
      const apiCalls = mockApiClient.getCallLog();
      assertEquals(apiCalls.length, 3, 'Should have made 3 API calls');

      users.forEach((userId) => {
        const userCalls = apiCalls.filter((call) => call.userId === userId);
        assertEquals(userCalls.length, 1, `Should have 1 call for ${userId}`);
      });
    });
  });
});

/**
 * EDUCATIONAL SUMMARY - OAUTH PLUGIN INTEGRATION TESTING
 * ======================================================
 *
 * This comprehensive integration test file demonstrates OAuth plugin testing:
 *
 * 1. 🔌 PLUGIN INTEGRATION WITH OAUTH:
 *    - Complete plugin discovery with OAuth dependencies
 *    - Tool and workflow registration with authentication
 *    - OAuth dependency injection and validation
 *    - Plugin lifecycle management with authentication
 *
 * 2. 🔄 END-TO-END OAUTH FLOWS:
 *    - Multi-component authentication flows
 *    - OAuth token consistency across tools and workflows
 *    - Authentication state management
 *    - Token refresh during long operations
 *
 * 3. 🔒 AUTHENTICATION ISOLATION:
 *    - Multi-user OAuth token isolation
 *    - Cross-user authentication state management
 *    - User-specific token validation
 *    - Authentication failure isolation
 *
 * 4. 🔄 CROSS-COMPONENT TESTING:
 *    - Tool-to-workflow authentication consistency
 *    - Authentication state preservation
 *    - OAuth error handling across components
 *    - Integrated business process flows
 *
 * 5. 🚀 PERFORMANCE AND CONCURRENCY:
 *    - Concurrent OAuth operations
 *    - Multi-user authentication performance
 *    - OAuth token management under load
 *    - Authentication scalability testing
 *
 * 6. 🛠️ PLUGIN LIFECYCLE:
 *    - OAuth-aware plugin initialization
 *    - Authentication dependency validation
 *    - Plugin cleanup with OAuth state
 *    - Dependency injection verification
 *
 * KEY OAUTH INTEGRATION BENEFITS:
 * ===============================
 *
 * - **Complete Authentication**: Tests full OAuth integration
 * - **Cross-Component Consistency**: Validates authentication across all components
 * - **Multi-User Support**: Tests multi-tenant authentication patterns
 * - **Error Consistency**: Verifies consistent OAuth error handling
 * - **Performance Validation**: Tests OAuth performance under load
 * - **Integration Verification**: Validates complete plugin integration
 *
 * This demonstrates how to build comprehensive integration test suites
 * for OAuth-enabled MCP plugins with complex authentication requirements.
 */
