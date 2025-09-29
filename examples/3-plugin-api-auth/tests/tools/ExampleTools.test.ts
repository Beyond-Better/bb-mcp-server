/**
 * Comprehensive Tests for ExampleTools - OAuth and API Integration
 * 
 * This test file demonstrates OAuth-aware tool testing patterns:
 * - OAuth authentication flow testing
 * - External API integration testing
 * - Authentication failure scenarios
 * - Complex parameter validation
 * - Error handling with authenticated APIs
 * 
 * LEARNING FOCUS:
 * ===============
 * 
 * Shows users how to:
 * 1. Test OAuth-authenticated tools
 * 2. Mock external API responses
 * 3. Test authentication failure scenarios
 * 4. Validate complex business logic
 * 5. Test API client integration patterns
 * 6. Handle OAuth token management in tests
 * 
 * OAUTH TESTING PATTERNS:
 * ======================
 * 
 * Based on plugin array structure with OAuth extensions:
 * - Plugin array tool discovery and testing
 * - OAuth flow simulation and verification
 * - API client mock integration
 * - Authentication error handling
 * - Multi-user authentication scenarios
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// Import the plugin factory and dependencies
import createPlugin from '../../src/plugins/ExamplePlugin.ts';
import { ExampleTools } from '../../src/plugins/tools/ExampleTools.ts';

// Import OAuth-aware test utilities
import { 
  createMockOAuthConsumer,
  createMockApiClient,
  createMockAuthLogger,
  createAuthenticatedToolContext,
  generateAuthenticatedToolTestParams,
  generateOAuthFailureScenarios,
  assertAuthenticatedCall,
  assertAuthenticationError,
  assertApiClientCall,
  MockOAuthConsumer,
  MockApiClient,
  MockAuthLogger,
} from '../utils/test-helpers.ts';

/**
 * ExampleTools OAuth Authentication Tests
 * 
 * These tests demonstrate comprehensive OAuth-aware tool testing
 * for the plugin array structure with external API integration.
 */
describe('ExampleTools - OAuth Integration', () => {
  let mockOAuth: MockOAuthConsumer;
  let mockApiClient: MockApiClient;
  let mockLogger: MockAuthLogger;
  let exampleTools: ExampleTools;
  let plugin: any;
  let toolRegistrations: any[];
  
  beforeEach(() => {
    // Set up OAuth and API mocks
    mockOAuth = createMockOAuthConsumer();
    mockApiClient = createMockApiClient();
    mockLogger = createMockAuthLogger();
    
    // Create plugin with mocked dependencies
    plugin = createPlugin({
      thirdpartyApiClient: mockApiClient,
      oAuthConsumer: mockOAuth,
      logger: mockLogger,
      auditLogger: mockLogger,
    } as any);
    
    // Create ExampleTools instance for direct testing
    exampleTools = new ExampleTools({
      apiClient: mockApiClient as any,
      oauthConsumer: mockOAuth as any,
      logger: mockLogger as any,
      auditLogger: mockLogger as any,
    });
    
    // Get tool registrations from plugin
    toolRegistrations = plugin.tools || [];
    
    // Verify plugin was created successfully
    assertExists(plugin, 'Plugin should be created');
    assertExists(toolRegistrations, 'Plugin should have tools array');
  });
  
  /**
   * PLUGIN STRUCTURE TESTING
   * 
   * Tests that verify OAuth-aware tools are properly defined in plugin structure.
   */
  describe('Plugin Structure with OAuth Tools', () => {
    it('should have OAuth-authenticated tools in plugin tools array', () => {
      assertEquals(toolRegistrations.length, 4, 'Should have 4 OAuth tools');
      
      const expectedTools = [
        'query_customers_example',
        'create_order_example', 
        'get_order_status_example',
        'get_api_info_example'
      ];
      
      expectedTools.forEach(toolName => {
        const tool = toolRegistrations.find((t: any) => t.name === toolName);
        assertExists(tool, `Tool '${toolName}' should exist in plugin tools array`);
        assertExists(tool.definition, `Tool '${toolName}' should have definition`);
        assertExists(tool.handler, `Tool '${toolName}' should have handler`);
        assert(typeof tool.handler === 'function', `Tool '${toolName}' handler should be a function`);
      });
    });
    
    it('should have OAuth-specific metadata in tool definitions', () => {
      toolRegistrations.forEach((tool: any) => {
        assertEquals(tool.definition.category, 'ExampleCorp', 'Should have ExampleCorp category');
        assert(tool.definition.tags.includes('api'), 'Should have api tag');
        assertExists(tool.definition.inputSchema, 'Should have input schema');
      });
    });
    
    it('should have ExampleTools class metadata', () => {
      assertEquals(exampleTools.name, 'examplecorp-tools');
      assertEquals(exampleTools.version, '1.0.0');
      assertEquals(exampleTools.category, 'business');
      assert(exampleTools.tags.includes('examplecorp'), 'Should have examplecorp tag');
      assert(exampleTools.tags.includes('api'), 'Should have api tag');
      assertEquals(exampleTools.requiresAuth, true, 'Should require authentication');
    });
  });
  
  /**
   * OAUTH AUTHENTICATION TESTING
   * 
   * Tests that verify OAuth token management and authentication flows.
   */
  describe('OAuth Authentication', () => {
    it('should successfully authenticate with valid OAuth token', async () => {
      const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      assertExists(queryTool);
      
      const result = await queryTool.handler({
        userId: 'test-user',
        search: 'Acme',
        limit: 10
      });
      
      // Should succeed with valid token
      assertEquals(result.isError, undefined, 'Should not have error with valid auth');
      assertExists(result.content);
      
      // Verify OAuth token was used
      assertAuthenticatedCall(result, mockOAuth, 'test-user');
      
      // Verify API was called
      assertApiClientCall(mockApiClient, 'queryCustomers', 1);
    });
    
    it('should handle OAuth token missing error', async () => {
      const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      assertExists(queryTool);
      
      const result = await queryTool.handler({
        userId: 'user-without-token', // User with no token
        search: 'test'
      });
      
      // Should return authentication error
      assertAuthenticationError(result, 'No OAuth token found');
    });
    
    it('should handle OAuth authentication failure', async () => {
      // Set up OAuth failure for specific user
      mockOAuth.setAuthFailure('user-auth-failure', true);
      
      const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      assertExists(queryTool);
      
      const result = await queryTool.handler({
        userId: 'user-auth-failure',
        search: 'test'
      });
      
      // Should return authentication error
      assertAuthenticationError(result, 'OAuth authentication failed');
    });
    
    it('should handle API client authentication errors', async () => {
      // Set up API failure
      mockApiClient.setApiFailure('queryCustomers', true);
      
      const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      assertExists(queryTool);
      
      const result = await queryTool.handler({
        userId: 'test-user',
        search: 'test'
      });
      
      // Should return API error
      assertEquals(result.isError, true);
      assert(result.content[0].text.includes('API call failed'));
    });
  });
  
  /**
   * TOOL-SPECIFIC FUNCTIONALITY TESTING
   * 
   * Tests for each individual OAuth-authenticated tool.
   */
  describe('Query Customers Tool', () => {
    let queryTool: any;
    
    beforeEach(() => {
      queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      assertExists(queryTool, 'Query customers tool should exist');
    });
    
    it('should query customers with search parameter', async () => {
      const result = await queryTool.handler({
        userId: 'test-user',
        search: 'Acme',
        limit: 5
      });
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertExists(responseData.query);
      assertExists(responseData.results);
      assertExists(responseData.results.items);
      assertEquals(responseData.query.search, 'Acme');
      assertEquals(responseData.query.limit, 5);
    });
    
    it('should query customers with filters', async () => {
      const result = await queryTool.handler({
        userId: 'test-user',
        filters: {
          status: 'active',
          region: 'US-West',
          customerType: 'business'
        },
        limit: 10
      });
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.query.filters.status, 'active');
      
      // Verify API client received correct filters
      const apiCalls = mockApiClient.getCallLog();
      const lastCall = apiCalls[apiCalls.length - 1];
      assertEquals(lastCall!.params.filters.status, 'active');
    });
    
    it('should handle empty search results', async () => {
      // Set up empty response
      mockApiClient.setResponse('queryCustomers', {
        items: [],
        totalCount: 0,
        page: 1,
        limit: 10
      });
      
      const result = await queryTool.handler({
        userId: 'test-user',
        search: 'nonexistent'
      });
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.results.items.length, 0);
      assertEquals(responseData.count, 0);
    });
  });
  
  describe('Create Order Tool', () => {
    let createOrderTool: any;
    
    beforeEach(() => {
      createOrderTool = toolRegistrations.find((t: any) => t.name === 'create_order_example');
      assertExists(createOrderTool, 'Create order tool should exist');
    });
    
    it('should create order with valid parameters', async () => {
      const orderParams = {
        userId: 'test-user',
        customerId: 'cust_001',
        items: [
          { productId: 'prod_001', quantity: 2, unitPrice: 150.00 },
          { productId: 'prod_002', quantity: 1, unitPrice: 299.99 }
        ],
        shippingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        },
        priority: 'expedited',
        notes: 'Rush order for important client'
      };
      
      const result = await createOrderTool.handler(orderParams);
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertExists(responseData.orderId);
      assertEquals(responseData.status, 'pending');
      assertExists(responseData.totalAmount);
      assertExists(responseData.trackingNumber);
      
      // Verify API client was called with correct parameters
      const apiCalls = mockApiClient.getCallLog();
      const createOrderCall = apiCalls.find(call => call.method === 'createOrder');
      assertExists(createOrderCall);
      assertEquals(createOrderCall.params.customerId, 'cust_001');
      assertEquals(createOrderCall.params.items.length, 2);
    });
    
    it('should calculate total amount correctly', async () => {
      const result = await createOrderTool.handler({
        userId: 'test-user',
        customerId: 'cust_001',
        items: [
          { productId: 'prod_001', quantity: 2, unitPrice: 100.00 }, // 200.00
          { productId: 'prod_002', quantity: 3, unitPrice: 50.00 }   // 150.00
        ],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345'
        }
      });
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.totalAmount, 350.00); // 200 + 150
    });
    
    it('should handle order creation API failure', async () => {
      mockApiClient.setApiFailure('createOrder', true);
      
      const result = await createOrderTool.handler({
        userId: 'test-user',
        customerId: 'cust_001',
        items: [{ productId: 'prod_001', quantity: 1, unitPrice: 100.00 }],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City', 
          state: 'TS',
          zipCode: '12345'
        }
      });
      
      assertEquals(result.isError, true);
      assert(result.content[0].text.includes('Order creation service unavailable'));
    });
  });
  
  describe('Get Order Status Tool', () => {
    let getOrderStatusTool: any;
    
    beforeEach(() => {
      getOrderStatusTool = toolRegistrations.find((t: any) => t.name === 'get_order_status_example');
      assertExists(getOrderStatusTool, 'Get order status tool should exist');
    });
    
    it('should get order status without history', async () => {
      const result = await getOrderStatusTool.handler({
        userId: 'test-user',
        orderId: 'order_12345',
        includeHistory: false
      });
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.orderId, 'order_12345');
      assertExists(responseData.status);
      assertExists(responseData.trackingNumber);
      assertEquals(responseData.history, undefined, 'Should not include history when not requested');
    });
    
    it('should get order status with history', async () => {
      const result = await getOrderStatusTool.handler({
        userId: 'test-user',
        orderId: 'order_12345',
        includeHistory: true
      });
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.orderId, 'order_12345');
      assertExists(responseData.history, 'Should include history when requested');
      assert(Array.isArray(responseData.history));
      assert(responseData.history.length > 0);
    });
  });
  
  describe('Get API Info Tool', () => {
    let getApiInfoTool: any;
    
    beforeEach(() => {
      getApiInfoTool = toolRegistrations.find((t: any) => t.name === 'get_api_info_example');
      assertExists(getApiInfoTool, 'Get API info tool should exist');
    });
    
    it('should get API information without authentication', async () => {
      const result = await getApiInfoTool.handler({});
      
      assertEquals(result.isError, undefined);
      
      const responseData = JSON.parse(result.content[0].text);
      assertExists(responseData.name);
      assertExists(responseData.version);
      assertEquals(responseData.status, 'operational');
      assertExists(responseData.endpoints);
      assertExists(responseData.rateLimit);
      assertExists(responseData.connectionStatus);
    });
    
    it('should handle API info service failure', async () => {
      mockApiClient.setApiFailure('getApiInfo', true);
      
      const result = await getApiInfoTool.handler({});
      
      assertEquals(result.isError, true);
      assert(result.content[0].text.includes('Service status unavailable'));
    });
  });
  
  /**
   * PARAMETERIZED TESTING
   * 
   * Tests using generated test data to cover OAuth scenarios comprehensively.
   */
  describe('Parameterized OAuth Testing', () => {
    it('should handle all OAuth-authenticated tool scenarios', async () => {
      const testParams = generateAuthenticatedToolTestParams();
      
      for (const scenario of testParams) {
        const tool = toolRegistrations.find((t: any) => t.name === scenario.toolName);
        assertExists(tool, `Tool ${scenario.toolName} should exist`);
        
        // Clear previous API calls
        mockApiClient.clearCallLog();
        
        const result = await tool.handler(scenario.params);
        
        assertEquals(result.isError, undefined, 
          `Scenario '${scenario.name}' should succeed with valid auth`);
        
        if (scenario.expectedAuthRequired && scenario.params.userId) {
          // Verify authentication was used
          assert(mockOAuth.hasValidToken(scenario.params.userId), 
            `Scenario '${scenario.name}' should use OAuth token`);
        }
      }
    });
    
    it('should handle all OAuth failure scenarios', async () => {
      const failureScenarios = generateOAuthFailureScenarios();
      
      for (const scenario of failureScenarios) {
        // Set up failure condition
        switch (scenario.failureType) {
          case 'no_token':
            // User already doesn't have token
            break;
          case 'expired_token':
          case 'invalid_token':
            mockOAuth.setAuthFailure(scenario.userId, true);
            break;
          case 'api_failure':
            mockApiClient.setApiFailure('queryCustomers', true);
            break;
        }
        
        // Test with query customers tool
        const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
        const result = await queryTool.handler({
          userId: scenario.userId,
          search: 'test'
        });
        
        // Should return appropriate error
        assertEquals(result.isError, true, 
          `Scenario '${scenario.name}' should return error`);
        assert(result.content[0].text.includes(scenario.expectedError), 
          `Scenario '${scenario.name}' should contain expected error text`);
        
        // Clean up failure condition
        mockOAuth.setAuthFailure(scenario.userId, false);
        mockApiClient.setApiFailure('queryCustomers', false);
      }
    });
  });
  
  /**
   * INTEGRATION TESTING
   * 
   * Tests that verify end-to-end OAuth and API integration.
   */
  describe('OAuth and API Integration', () => {
    it('should complete full OAuth flow for complex operations', async () => {
      // Step 1: Query customers to find target customer
      const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      const queryResult = await queryTool.handler({
        userId: 'test-user',
        search: 'Acme'
      });
      
      assertEquals(queryResult.isError, undefined);
      const queryData = JSON.parse(queryResult.content[0].text);
      const customerId = queryData.results.items[0].id;
      
      // Step 2: Create order for that customer
      const createOrderTool = toolRegistrations.find((t: any) => t.name === 'create_order_example');
      const orderResult = await createOrderTool.handler({
        userId: 'test-user',
        customerId: customerId,
        items: [{ productId: 'prod_001', quantity: 1, unitPrice: 299.99 }],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345'
        }
      });
      
      assertEquals(orderResult.isError, undefined);
      const orderData = JSON.parse(orderResult.content[0].text);
      const orderId = orderData.orderId;
      
      // Step 3: Check order status
      const statusTool = toolRegistrations.find((t: any) => t.name === 'get_order_status_example');
      const statusResult = await statusTool.handler({
        userId: 'test-user',
        orderId: orderId,
        includeHistory: true
      });
      
      assertEquals(statusResult.isError, undefined);
      
      // Verify all operations used the same OAuth token
      assertEquals(mockApiClient.getCallCount(), 3, 'Should have made 3 API calls');
      
      const apiCalls = mockApiClient.getCallLog();
      assertEquals(apiCalls.every(call => call.userId === 'test-user'), true, 
        'All API calls should use same user context');
    });
    
    it('should handle OAuth token refresh during long operations', async () => {
      // Set up token that will expire soon
      mockOAuth.setTokenForUser('test-user', {
        access_token: 'expiring_token',
        refresh_token: 'refresh_token_123',
        expires_at: Date.now() + 100, // Expires in 100ms
        token_type: 'Bearer'
      });
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Make API call that should trigger token refresh
      const queryTool = toolRegistrations.find((t: any) => t.name === 'query_customers_example');
      
      // This should still work due to token refresh
      const result = await queryTool.handler({
        userId: 'test-user',
        search: 'test'
      });
      
      // Should succeed even with expired initial token
      assertEquals(result.isError, undefined, 'Should succeed with token refresh');
    });
  });
});

/**
 * EDUCATIONAL SUMMARY - OAUTH TOOL TESTING
 * ========================================
 * 
 * This comprehensive test file demonstrates OAuth-aware tool testing:
 * 
 * 1. 🔐 OAUTH AUTHENTICATION TESTING:
 *    - Valid token authentication flows
 *    - Missing token error handling
 *    - Expired token scenarios
 *    - Token refresh testing
 *    - Multi-user authentication isolation
 * 
 * 2. 🌐 API INTEGRATION TESTING:
 *    - External API call verification
 *    - API response validation
 *    - API failure scenario handling
 *    - Request parameter verification
 *    - Response data structure validation
 * 
 * 3. 🛠️ TOOL-SPECIFIC TESTING:
 *    - Business logic validation
 *    - Parameter handling and validation
 *    - Complex data structure processing
 *    - Error condition handling
 *    - Edge case coverage
 * 
 * 4. 🔄 INTEGRATION TESTING:
 *    - End-to-end OAuth flows
 *    - Multi-step authenticated operations
 *    - Cross-tool data consistency
 *    - Authentication state management
 * 
 * 5. 🎭 PARAMETERIZED TESTING:
 *    - Generated test scenarios
 *    - OAuth failure mode coverage
 *    - Tool-specific parameter variations
 *    - Comprehensive error scenario testing
 * 
 * KEY OAUTH TESTING BENEFITS:
 * ===========================
 * 
 * - **Authentication Security**: Verifies proper OAuth implementation
 * - **API Integration**: Validates external service integration
 * - **Error Handling**: Tests all failure modes and recovery
 * - **User Context**: Ensures proper user isolation and security
 * - **Token Management**: Validates token lifecycle and refresh
 * 
 * This demonstrates how to build comprehensive test suites for
 * OAuth-authenticated MCP tools with external API dependencies.
 */