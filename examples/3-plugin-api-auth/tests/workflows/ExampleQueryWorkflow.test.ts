/**
 * Comprehensive Tests for ExampleQueryWorkflow - OAuth and API Integration
 *
 * This test file demonstrates OAuth-aware workflow testing patterns:
 * - OAuth-authenticated workflow execution
 * - Complex parameter validation with Zod schemas
 * - Multi-query type testing (customers, orders, products, analytics)
 * - API integration with filtering and pagination
 * - Dry run validation and execution planning
 * - Error handling with authenticated workflows
 *
 * LEARNING FOCUS:
 * ===============
 *
 * Shows users how to:
 * 1. Test OAuth-authenticated workflows
 * 2. Validate complex Zod parameter schemas
 * 3. Test multi-step workflow execution
 * 4. Mock API responses for different query types
 * 5. Test pagination and filtering logic
 * 6. Validate workflow result structures
 * 7. Test dry run and execution planning
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { type Spy, spy } from 'https://deno.land/std@0.208.0/testing/mock.ts';
//import { errorMessage } from '@beyondbetter/bb-mcp-server';
import { ConfigManager, KVManager } from '@beyondbetter/bb-mcp-server';

// Import the plugin to get workflows
import createPlugin from '../../src/plugins/ExamplePlugin.ts';
import { ExampleQueryWorkflow } from '../../src/plugins/workflows/ExampleQueryWorkflow.ts';

// Import OAuth-aware test utilities
import {
  createAuthenticatedWorkflowContext,
  createConnectedMocks,
  createMockAuditLogger,
  createMockConfigManager,
  createMockKVManager,
  createMockLogger,
  MockApiClient,
  MockOAuthConsumer,
} from '../utils/test-helpers.ts';
import { SpyAuditLogger, SpyLogger } from '@beyondbetter/bb-mcp-server/testing';
import { getResultData } from '../utils/type-helpers.ts';

type WorkflowContext = any;

/**
 * ExampleQueryWorkflow OAuth Authentication Tests
 *
 * These tests demonstrate comprehensive OAuth-aware workflow testing
 * for complex query workflows with external API integration.
 */
describe('ExampleQueryWorkflow - OAuth Integration', () => {
  let mockOAuth: MockOAuthConsumer;
  let mockApiClient: MockApiClient;
  let mockConfigManager: ConfigManager;
  let mockKVManager: KVManager;
  let mockLogger: SpyLogger;
  let mockAuditLogger: SpyAuditLogger;
  let workflow: ExampleQueryWorkflow;
  let context: WorkflowContext;
  let logSpy: Spy;
  let plugin: any;

  beforeEach(async () => {
    // Set up OAuth and API mocks with proper wiring
    const mocks = createConnectedMocks();
    mockOAuth = mocks.oauthConsumer;
    mockApiClient = mocks.apiClient;
    mockConfigManager = createMockConfigManager();
    mockKVManager = await createMockKVManager();
    mockLogger = createMockLogger();
    mockAuditLogger = createMockAuditLogger();

    // Set up logging spy
    logSpy = spy(mockLogger, 'info');

    // Create plugin and extract workflow
    plugin = createPlugin({
      thirdpartyApiClient: mockApiClient,
      oauthConsumer: mockOAuth,
      logger: mockLogger,
      auditLogger: mockAuditLogger,
      kvManager: mockKVManager,
    } as any);

    // Find the query workflow
    workflow = plugin.workflows.find((w: any) => w.name === 'example_query');
    assertExists(workflow, 'ExampleQueryWorkflow should be found in plugin');

    // Create authenticated workflow context
    context = createAuthenticatedWorkflowContext({
      logger: mockLogger,
    });
  });

  afterEach(async () => {
    logSpy.restore();
    await mockKVManager.close();
  });

  /**
   * WORKFLOW REGISTRATION AND METADATA
   */
  describe('Workflow Registration', () => {
    it('should have correct OAuth-aware workflow metadata', () => {
      assertEquals(workflow.name, 'example_query');
      assertEquals(workflow.version, '1.0.0');
      assertEquals(workflow.category, 'query');
      assert(Array.isArray(workflow.tags));
      assert(workflow.tags.includes('query'));
      assert(workflow.tags.includes('examplecorp'));
    });

    it('should return proper registration with parameter schema', () => {
      const registration = workflow.getRegistration();

      assertEquals(registration.name, 'example_query');
      assertEquals(registration.displayName, 'ExampleCorp Query Workflow');
      assertEquals(registration.version, '1.0.0');
      assertEquals(registration.category, 'query');
      assertExists(
        registration.parameterSchema,
        'Should include parameter schema',
      );
    });

    it('should provide comprehensive workflow overview', () => {
      const overview = workflow.getOverview();

      assert(overview.includes('Query ExampleCorp data'));
      assert(overview.includes('customers: Query customer records'));
      assert(overview.includes('orders: Query order history'));
      assert(overview.includes('products: Query product catalog'));
      assert(overview.includes('analytics: Query business analytics'));
      assert(overview.includes('Advanced filtering and search'));
    });
  });

  /**
   * PARAMETER VALIDATION WITH OAUTH
   */
  describe('OAuth-Aware Parameter Validation', () => {
    it('should validate required OAuth user parameters', async () => {
      const validParams = {
        userId: 'test-user',
        queryType: 'customers',
        searchTerm: 'Acme Corporation',
        outputFormat: 'summary',
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertExists(data);
      assertEquals(data.userId, 'test-user');
    });

    it('should fail validation without userId for OAuth', async () => {
      const invalidParams = {
        queryType: 'customers',
        searchTerm: 'test',
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(Array.isArray(result.errors));
      assert(result.errors.some((err: any) => err.path.includes('userId')));
    });

    it('should validate query type enum values', async () => {
      const invalidParams = {
        userId: 'test-user',
        queryType: 'invalid_query_type',
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('queryType')));
    });

    it('should apply correct default values', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'customers',
      };

      const result = await workflow.validateParameters(params);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertEquals(data.outputFormat, 'summary'); // Default value
      assertEquals(data.dryRun, false); // Default value
      assertEquals(data.includeMetadata, false); // Default value
      assertEquals(data.pagination?.page, 1); // Default value
    });

    it('should validate complex nested filter parameters', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'orders',
        filters: {
          dateRange: {
            startDate: '2024-01-01T00:00:00Z',
            endDate: '2024-12-31T23:59:59Z',
          },
          status: 'completed',
          region: 'US-West',
        },
        pagination: {
          page: 2,
          limit: 50,
          sortBy: 'createdDate',
          sortOrder: 'desc',
        },
      };

      const result = await workflow.validateParameters(params);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertEquals(data.filters.dateRange.startDate, '2024-01-01T00:00:00Z');
      assertEquals(data.pagination.page, 2);
    });
  });

  /**
   * OAUTH-AUTHENTICATED WORKFLOW EXECUTION
   */
  describe('OAuth-Authenticated Execution', () => {
    it('should execute customer query with OAuth authentication', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'customers',
        searchTerm: 'Acme',
        filters: {
          status: 'active',
          region: 'US-West',
        },
        outputFormat: 'detailed',
        includeMetadata: true,
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.completed_steps.length, 1);
      assertEquals(result.failed_steps.length, 0);
      const data = getResultData(result);
      assertExists(data);
      assertExists(result.metadata);

      // Verify OAuth token was used
      assert(mockOAuth.hasValidToken('test-user'));

      // Verify API was called with correct parameters
      assertEquals(mockApiClient.getCallCount('queryCustomers'), 1);
      const apiCalls = mockApiClient.getCallLog();
      const customerCall = apiCalls.find((call) => call.method === 'queryCustomers');
      assertExists(customerCall);
      assertEquals(customerCall.params.search, 'Acme');
      assertEquals(customerCall.params.filters.status, 'active');
    });

    it('should execute orders query with date filtering', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'orders',
        filters: {
          dateRange: {
            startDate: '2024-01-01T00:00:00Z',
            endDate: '2024-03-31T23:59:59Z',
          },
          status: 'completed',
        },
        pagination: {
          page: 1,
          limit: 25,
          sortBy: 'totalAmount',
          sortOrder: 'desc',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Verify API was called with date range filters
      assertEquals(mockApiClient.getCallCount('queryOrders'), 1);
      const apiCalls = mockApiClient.getCallLog();
      const orderCall = apiCalls.find((call) => call.method === 'queryOrders');
      assertExists(orderCall);
      assertEquals(orderCall.params.filters.status, 'completed');
      assertExists(orderCall.params.filters.dateRange);
    });

    it('should execute products query with category filtering', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'products',
        searchTerm: 'Widget',
        filters: {
          category: 'electronics',
        },
        outputFormat: 'raw',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Verify API was called correctly
      assertEquals(mockApiClient.getCallCount('queryProducts'), 1);
      const apiCalls = mockApiClient.getCallLog();
      const productCall = apiCalls.find((call) => call.method === 'queryProducts');
      assertExists(productCall);
      assertEquals(productCall.params.search, 'Widget');
      assertEquals(productCall.params.filters.category, 'electronics');
    });

    it('should execute analytics query with date range', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'analytics',
        filters: {
          dateRange: {
            startDate: '2024-01-01T00:00:00Z',
            endDate: '2024-12-31T23:59:59Z',
          },
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Verify analytics API was called
      assertEquals(mockApiClient.getCallCount('queryAnalytics'), 1);
      const apiCalls = mockApiClient.getCallLog();
      const analyticsCall = apiCalls.find((call) => call.method === 'queryAnalytics');
      assertExists(analyticsCall);
      assertExists(analyticsCall.params.filters.dateRange);
    });
  });

  /**
   * OUTPUT FORMATTING TESTING
   */
  describe('Output Formatting', () => {
    it('should format summary output correctly', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'customers',
        outputFormat: 'summary',
        includeMetadata: false,
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertExists(data.totalCount);
      assertExists(data.itemCount);
      assertExists(data.summary);
      assertEquals(
        data.metadata,
        undefined,
        'Should not include metadata when not requested',
      );
    });

    it('should format detailed output with metadata', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'orders',
        outputFormat: 'detailed',
        includeMetadata: true,
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      // console.log('🧪 DETAILED OUTPUT TEST - Actual Data:', {
      //   dataKeys: Object.keys(data || {}),
      //   hasQuery: 'query' in (data || {}),
      //   hasMetadata: 'metadata' in (data || {}),
      //   dataType: typeof data,
      //   data: data
      // });
      assertExists(data.query);
      assertExists(data.totalCount);
      assertExists(data.items);
      assertExists(data.pagination);
      assertExists(data.summary);
      assertExists(data.metadata, 'Should include metadata when requested');
    });

    it('should return raw output format', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'products',
        outputFormat: 'raw',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      // Raw format should return the API response directly
      const data = getResultData(result);
      assertExists(data.items);
      assertExists(data.totalCount);
    });

    it('should generate type-specific summaries', async () => {
      // Test customer summary
      const customerParams = {
        userId: 'test-user',
        queryType: 'customers',
        outputFormat: 'detailed',
      };

      const customerResult = await workflow.executeWithValidation(
        customerParams,
        context,
      );
      assertEquals(customerResult.success, true);
      const customerData = getResultData(customerResult);
      assertExists(customerData.summary.customerTypes);
      assertExists(customerData.summary.regions);
      assertExists(customerData.summary.statuses);

      // Test order summary
      const orderParams = {
        userId: 'test-user',
        queryType: 'orders',
        outputFormat: 'detailed',
      };

      const orderResult = await workflow.executeWithValidation(
        orderParams,
        context,
      );
      assertEquals(orderResult.success, true);
      const orderData = getResultData(orderResult);
      assertExists(orderData.summary.orderStatuses);
      assertExists(orderData.summary.totalValue);
      assertExists(orderData.summary.averageValue);
    });
  });

  /**
   * DRY RUN AND EXECUTION PLANNING
   */
  describe('Dry Run and Planning', () => {
    it('should perform dry run validation with OAuth check', async () => {
      const params = {
        userId: 'test-user',
        dryRun: true,
        queryType: 'customers',
        searchTerm: 'test',
        filters: {
          status: 'active',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertEquals(data.dryRun, true);
      assertExists(data.validation);
      assertExists(data.estimatedResults);
      assertExists(data.queryPlan);

      // Should validate API connectivity
      assertEquals(mockApiClient.getCallCount('healthCheck'), 1);

      // Should not perform actual query
      assertEquals(mockApiClient.getCallCount('queryCustomers'), 0);
    });

    it('should validate API connectivity in dry run', async () => {
      // Set API as unhealthy
      mockApiClient.setApiFailure('healthCheck', true);

      const params = {
        userId: 'test-user',
        dryRun: true,
        queryType: 'customers',
      };

      const result = await workflow.executeWithValidation(params, context);

      // console.log('🏥 HEALTH CHECK TEST - Expected Failure Result:', {
      //   resultSuccess: result.success,
      //   hasError: !!result.error,
      //   errorMessage: result.error?.message,
      //   healthCheckCalls: mockApiClient.getCallCount('healthCheck'),
      //   includesExpectedError: result.error?.message?.includes('API is not accessible')
      // });

      // Should return failure result, not throw exception
      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.message.includes('API is not accessible'));
    });

    it('should generate appropriate execution plan', async () => {
      const params = {
        userId: 'test-user',
        dryRun: true,
        queryType: 'analytics',
        filters: {
          dateRange: {
            startDate: '2024-01-01T00:00:00Z',
            endDate: '2024-12-31T23:59:59Z',
          },
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertEquals(data.queryPlan.queryType, 'analytics');
      assertEquals(data.queryPlan.searchEnabled, false);
      assertEquals(data.queryPlan.estimatedApiCalls, 1);
      assertExists(data.queryPlan.estimatedExecutionTime);
    });
  });

  /**
   * ERROR HANDLING WITH OAUTH
   */
  describe('OAuth Error Handling', () => {
    it('should handle OAuth authentication failure', async () => {
      // Set up OAuth failure
      mockOAuth.setAuthFailure('auth-fail-user', true);

      const params = {
        userId: 'auth-fail-user',
        queryType: 'customers',
        searchTerm: 'test',
      };

      const result = await workflow.executeWithValidation(params, context);

      // console.log('📋 DETAILED ERROR TEST - Actual Result:', {
      //   success: result.success,
      //   hasError: !!result.error,
      //   errorMessage: result.error?.message,
      //   hasFailedSteps: !!result.failed_steps,
      //   failedStepsLength: result.failed_steps?.length || 0,
      //   queryOrdersCalls: mockApiClient.getCallCount('queryOrders'),
      //   apiFailureSet: 'Should be true after setApiFailure call'
      // });

      assertEquals(result.success, false);
      assertExists(result.error);
      assertEquals(result.error.type, 'system_error');
      assert(result.error.message.includes('OAuth authentication failed'));
      assertEquals(result.failed_steps.length, 1);
      assertEquals(result.failed_steps[0]!.operation, 'query_customers');
    });

    it('should handle API service failure', async () => {
      // Set up API failure
      mockApiClient.setApiFailure('queryCustomers', true);

      const params = {
        userId: 'test-user',
        queryType: 'customers',
        searchTerm: 'test',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assertExists(result.error);
      assert(
        result.error.message.includes(
          'Customer service temporarily unavailable',
        ),
      );
    });

    it('should handle invalid query type gracefully', async () => {
      // This should be caught by parameter validation, but test runtime handling
      const workflow_direct = new ExampleQueryWorkflow({
        apiClient: mockApiClient as any,
        logger: mockLogger as any,
        configManager: mockConfigManager,
        kvManager: mockKVManager,
        oauthConsumer: mockOAuth as any,
      });

      const invalidParams = {
        userId: 'test-user',
        queryType: 'invalid_type' as any,
      };

      const result = await workflow_direct.execute(invalidParams as any);

      assertEquals(result.success, false);
      assert(result.error?.message.includes('Unsupported query type'));
    });

    it('should provide detailed error information', async () => {
      // Ensure OAuth is properly set up for test user
      mockOAuth.setTokenForUser('test-user', {
        access_token: 'valid_token_for_api_test',
        refresh_token: 'refresh_token',
        expires_at: Date.now() + 3600000,
        token_type: 'Bearer',
      });

      // Set API failure AFTER OAuth is confirmed working
      mockApiClient.setApiFailure('queryOrders', true);

      const params = {
        userId: 'test-user',
        queryType: 'orders',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assertExists(result.failed_steps);
      assertEquals(result.failed_steps.length, 1);
      assertEquals(result.failed_steps[0]!.operation, 'query_orders');
      assertEquals(result.failed_steps[0]!.error_type, 'system_error');
      assertExists(result.failed_steps[0]!.message);
      assertExists(result.failed_steps[0]!.timestamp);
    });
  });

  /**
   * PAGINATION AND FILTERING
   */
  describe('Pagination and Filtering', () => {
    it('should handle pagination parameters correctly', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'customers',
        pagination: {
          page: 3,
          limit: 15,
          sortBy: 'name',
          sortOrder: 'desc',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Verify pagination was passed to API
      const apiCalls = mockApiClient.getCallLog();
      const customerCall = apiCalls.find((call) => call.method === 'queryCustomers');
      assertExists(customerCall);
      assertEquals(customerCall.params.pagination.page, 3);
      assertEquals(customerCall.params.pagination.limit, 15);
      assertEquals(customerCall.params.pagination.sortBy, 'name');
      assertEquals(customerCall.params.pagination.sortOrder, 'desc');
    });

    it('should apply complex filters correctly', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'orders',
        searchTerm: 'urgent',
        filters: {
          dateRange: {
            startDate: '2024-06-01T00:00:00Z',
            endDate: '2024-06-30T23:59:59Z',
          },
          status: 'processing',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Verify filters were applied
      const apiCalls = mockApiClient.getCallLog();
      const orderCall = apiCalls.find((call) => call.method === 'queryOrders');
      assertExists(orderCall);
      assertEquals(orderCall.params.search, 'urgent');
      assertEquals(orderCall.params.filters.status, 'processing');
      assertExists(orderCall.params.filters.dateRange);
      assertEquals(
        orderCall.params.filters.dateRange.startDate,
        '2024-06-01T00:00:00Z',
      );
    });
  });

  /**
   * LOGGING AND MONITORING
   */
  describe('Logging and Monitoring', () => {
    it('should log workflow execution steps with OAuth context', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'customers',
        searchTerm: 'test',
      };

      await workflow.executeWithValidation(params, context);

      // Should log workflow start
      const logCalls = logSpy.calls;
      assert(logCalls.length > 0);

      const startLog = logCalls.find((call) =>
        call.args[0].includes('ExampleCorp query workflow started')
      );
      assertExists(startLog);

      // Should include OAuth context in logs
      const logData = startLog.args[1];
      assertEquals(logData.userId, 'test-user');
      assertEquals(logData.queryType, 'customers');
    });

    it('should track execution performance', async () => {
      const params = {
        userId: 'test-user',
        queryType: 'products',
      };

      const result = await workflow.executeWithValidation(params, context);

      // console.log('🕒 PERFORMANCE TEST - Result Metadata:', {
      //   hasMetadata: !!result.metadata,
      //   executionTime: result.metadata?.executionTime,
      //   executionTimeType: typeof result.metadata?.executionTime,
      //   executionTimeGreaterThanZero: typeof result.metadata?.executionTime === 'number' ? result.metadata.executionTime > 0 : false,
      //   metadataKeys: result.metadata ? Object.keys(result.metadata) : null
      // });

      assertEquals(result.success, true);
      assertExists(result.metadata);
      assertExists(result.metadata.executionTime);
      assert(typeof result.metadata.executionTime === 'number');
      assert(result.metadata.executionTime > 0);
    });
  });
});

/**
 * EDUCATIONAL SUMMARY - OAUTH WORKFLOW TESTING
 * ============================================
 *
 * This comprehensive test file demonstrates OAuth-aware workflow testing:
 *
 * 1. 🔐 OAUTH WORKFLOW AUTHENTICATION:
 *    - OAuth token validation in workflow context
 *    - User authentication across workflow steps
 *    - Authentication failure handling
 *    - Token-based authorization testing
 *
 * 2. 📊 COMPLEX PARAMETER VALIDATION:
 *    - Zod schema validation testing
 *    - Nested object validation
 *    - Enum value validation
 *    - Default value application
 *
 * 3. 🔄 MULTI-QUERY WORKFLOW EXECUTION:
 *    - Different query types (customers, orders, products, analytics)
 *    - API integration for each query type
 *    - Parameter passing and filtering
 *    - Response formatting and processing
 *
 * 4. 📋 OUTPUT FORMATTING TESTING:
 *    - Summary, detailed, and raw output formats
 *    - Metadata inclusion/exclusion
 *    - Type-specific summary generation
 *    - Data structure validation
 *
 * 5. 🌫️ DRY RUN AND PLANNING:
 *    - Execution planning and validation
 *    - API connectivity checking
 *    - Resource estimation
 *    - Pre-flight validation
 *
 * 6. ⚠️ ERROR HANDLING:
 *    - OAuth authentication failures
 *    - API service failures
 *    - Invalid parameter handling
 *    - Structured error reporting
 *
 * 7. 📏 LOGGING AND MONITORING:
 *    - Workflow execution logging
 *    - Performance tracking
 *    - OAuth context logging
 *    - Audit trail verification
 *
 * KEY OAUTH WORKFLOW BENEFITS:
 * ============================
 *
 * - **Authentication Integration**: Verifies OAuth throughout workflow
 * - **Complex Validation**: Tests sophisticated parameter schemas
 * - **Multi-Step Testing**: Validates complex workflow execution
 * - **API Integration**: Tests external service integration
 * - **Error Recovery**: Validates comprehensive error handling
 *
 * This demonstrates how to build thorough test suites for
 * OAuth-authenticated workflows with complex business logic.
 */
