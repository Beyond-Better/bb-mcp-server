/**
 * Comprehensive Tests for ExampleOperationWorkflow - Multi-Step OAuth Operations
 *
 * This test file demonstrates complex OAuth-aware workflow testing patterns:
 * - Multi-step operations with rollback capabilities
 * - Complex discriminated union parameter validation
 * - Transaction-like workflow patterns with OAuth
 * - Error handling and recovery in multi-step operations
 * - Rollback mechanism testing
 * - Dry run execution planning
 * - Permission validation and authorization
 *
 * LEARNING FOCUS:
 * ===============
 *
 * Shows users how to:
 * 1. Test complex multi-step OAuth workflows
 * 2. Validate discriminated union parameters
 * 3. Test rollback and transaction patterns
 * 4. Mock complex API operation sequences
 * 5. Test permission-based authorization
 * 6. Validate execution planning and dry runs
 * 7. Test notification and audit integration
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { type Spy, spy, stub } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import {
  //ConfigManager,
  KVManager,
} from '@beyondbetter/bb-mcp-server';

// Import the plugin to get workflows
import createPlugin from '../../src/plugins/ExamplePlugin.ts';
import { ExampleOperationWorkflow } from '../../src/plugins/workflows/ExampleOperationWorkflow.ts';

// Import OAuth-aware test utilities
import {
  createAuthenticatedWorkflowContext,
  createMockAuditLogger,
  //createMockConfigManager,
  createMockKVManager,
  createMockLogger,
  createMockOAuthConsumer,
  MockApiClient,
  MockOAuthConsumer,
} from '../utils/test-helpers.ts';
import { SpyAuditLogger, SpyLogger } from '@beyondbetter/bb-mcp-server/testing';
import { getResultData } from '../utils/type-helpers.ts';

/**
 * Enhanced Mock API Client for Operation Workflow Testing
 *
 * Extends the base mock API client with operation-specific methods
 * needed for multi-step workflow testing.
 */
class MockOperationApiClient extends MockApiClient {
  private rollbackLog: Array<{ action: string; data: any }> = [];

  // Customer operations
  override async createCustomer(
    accessToken: string,
    customerData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('createCustomer', customerData, userId);

    if (this.getFailureStatus('createCustomer')) {
      throw new Error('Customer creation failed: Service unavailable');
    }

    return {
      id: `cust_${Date.now()}`,
      name: customerData.name,
      email: customerData.email,
      address: customerData.address,
      customerType: customerData.customerType || 'individual',
      createdAt: new Date().toISOString(),
    };
  }

  override async deleteCustomer(
    accessToken: string,
    customerId: string,
  ): Promise<void> {
    this.logCall('deleteCustomer', { customerId }, 'system');

    if (this.getFailureStatus('deleteCustomer')) {
      throw new Error('Customer deletion failed: Service unavailable');
    }

    this.rollbackLog.push({ action: 'delete_customer', data: { customerId } });
  }

  // Order operations
  override async cancelOrder(
    accessToken: string,
    orderId: string,
  ): Promise<void> {
    this.logCall('cancelOrder', { orderId }, 'system');
    this.rollbackLog.push({ action: 'cancel_order', data: { orderId } });
  }

  // Inventory operations
  override async getInventoryLevels(
    accessToken: string,
    productIds: string[],
    userId: string,
  ): Promise<any> {
    this.logCall('getInventoryLevels', { productIds }, userId);

    return productIds.map((id) => ({
      productId: id,
      currentLevel: 100,
      lastUpdated: new Date().toISOString(),
    }));
  }

  override async bulkUpdateInventory(
    accessToken: string,
    updateData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('bulkUpdateInventory', updateData, userId);

    if (this.getFailureStatus('bulkUpdateInventory')) {
      throw new Error('Bulk inventory update failed: Database error');
    }

    return {
      updated: updateData.updates.length,
      failed: 0,
      reason: updateData.reason,
      timestamp: new Date().toISOString(),
    };
  }

  override async restoreInventoryLevels(
    accessToken: string,
    inventory: Record<string, number>,
  ): Promise<void> {
    this.logCall('restoreInventoryLevels', { inventory }, 'system');
    this.rollbackLog.push({ action: 'restore_inventory', data: { inventory } });
  }

  // Refund operations
  override async processRefund(
    accessToken: string,
    refundData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('processRefund', refundData, userId);

    if (this.getFailureStatus('processRefund')) {
      throw new Error('Refund processing failed: Payment service error');
    }

    return {
      id: `refund_${Date.now()}`,
      orderId: refundData.orderId,
      amount: refundData.refundAmount || 299.99,
      reason: refundData.reason,
      status: 'processed',
      processedAt: new Date().toISOString(),
    };
  }

  // Data migration operations
  override async validateDataMigration(
    accessToken: string,
    migrationData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('validateDataMigration', migrationData, userId);

    return {
      valid: true,
      sourceRecords: 1000,
      targetCapacity: 5000,
      estimatedDuration: '15 minutes',
      warnings: [],
    };
  }

  override async executeDataMigration(
    accessToken: string,
    migrationData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('executeDataMigration', migrationData, userId);

    if (this.getFailureStatus('executeDataMigration')) {
      throw new Error('Data migration failed: Connection timeout');
    }

    return {
      migrationId: `migration_${Date.now()}`,
      recordsMigrated: 1000,
      recordsFailed: 0,
      duration: '12 minutes',
      rollbackAvailable: true,
      completedAt: new Date().toISOString(),
    };
  }

  // Helper methods
  private getFailureStatus(method: string): boolean {
    // Access the failures via the base class's method pattern
    // We'll check if we've set a failure for this method
    return (this as any).failures.has(method);
  }

  getRollbackLog(): Array<{ action: string; data: any }> {
    return [...this.rollbackLog];
  }

  clearRollbackLog(): void {
    this.rollbackLog = [];
  }

  protected override logCall(
    method: string,
    params: any,
    userId: string,
  ): void {
    // Use the parent's logCall method by accessing the private property directly
    super.getCallLog(); // This ensures the parent logging is initialized
    // We'll add to the call log manually
    (this as any).callLog = (this as any).callLog || [];
    (this as any).callLog.push({
      method,
      params: JSON.parse(JSON.stringify(params)),
      userId,
      timestamp: new Date(),
    });
  }
}

type WorkflowContext = any;

/**
 * ExampleOperationWorkflow Multi-Step OAuth Tests
 *
 * These tests demonstrate comprehensive multi-step OAuth-aware workflow testing
 * with rollback capabilities and complex business operations.
 */
describe('ExampleOperationWorkflow - Multi-Step OAuth Operations', () => {
  let mockOAuth: MockOAuthConsumer;
  let mockApiClient: MockOperationApiClient;
  let mockLogger: SpyLogger;
  //let mockConfigManager: ConfigManager;
  let mockKVManager: KVManager;
  let mockAuditLogger: SpyAuditLogger;
  let workflow: ExampleOperationWorkflow;
  let context: WorkflowContext;
  let logSpy: Spy;
  let plugin: any;
  let sendNotificationStub: Spy;

  beforeEach(async () => {
    // Set up OAuth and enhanced API mocks
    mockOAuth = createMockOAuthConsumer();
    mockApiClient = new MockOperationApiClient();
    mockLogger = createMockLogger();
    mockAuditLogger = createMockAuditLogger();
    //mockConfigManager = createMockConfigManager();
    mockKVManager = await createMockKVManager();

    // Connect OAuth consumer to API client for authentication
    mockApiClient.setOAuthConsumer(mockOAuth);

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

    // Find the operation workflow
    workflow = plugin.workflows.find((w: any) => w.name === 'example_operation');
    assertExists(
      workflow,
      'ExampleOperationWorkflow should be found in plugin',
    );

    // Create authenticated workflow context
    context = createAuthenticatedWorkflowContext({
      logger: mockLogger,
    });

    // Stub sendNotification to bypass beyondMcpServer requirement
    sendNotificationStub = stub(
      workflow as any,
      'sendNotification',
      async (request: any) => {
        // Log the notification like the real implementation would
        // Determine type based on notification level: "error" = failure, "notice" = completion
        const type = request.level === 'error' ? 'failure' : 'completion';
        mockLogger.info('Notification sent', {
          type,
          level: request.level,
          message: request.data?.params || 'Operation completed',
        });
      },
    );
  });

  afterEach(async () => {
    logSpy.restore();
    sendNotificationStub?.restore();
    mockApiClient.clearRollbackLog();
    await mockKVManager.close();
  });

  /**
   * WORKFLOW REGISTRATION AND METADATA
   */
  describe('Multi-Step Workflow Registration', () => {
    it('should have correct multi-step workflow metadata', () => {
      assertEquals(workflow.name, 'example_operation');
      assertEquals(workflow.version, '1.0.0');
      assertEquals(workflow.category, 'operation');
      assert(Array.isArray(workflow.tags));
      assert(workflow.tags.includes('operation'));
      assert(workflow.tags.includes('multi-step'));
    });

    it('should return proper registration with complex parameter schema', () => {
      const registration = workflow.getRegistration();

      assertEquals(registration.name, 'example_operation');
      assertEquals(registration.displayName, 'ExampleCorp Operation Workflow');
      assertEquals(registration.estimatedDuration, 180); // 3 minutes
      assertExists(
        registration.parameterSchema,
        'Should include complex parameter schema',
      );
    });

    it('should provide comprehensive multi-operation overview', () => {
      const overview = workflow.getOverview();

      assert(overview.includes('complex ExampleCorp business operations'));
      assert(overview.includes('create_customer_with_order'));
      assert(overview.includes('bulk_update_inventory'));
      assert(overview.includes('process_refund'));
      assert(overview.includes('migrate_data'));
      assert(overview.includes('Multi-step execution with rollback'));
    });
  });

  /**
   * DISCRIMINATED UNION PARAMETER VALIDATION
   */
  describe('Discriminated Union Parameter Validation', () => {
    it('should validate create_customer_with_order parameters', async () => {
      const validParams = {
        userId: 'test-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Acme Corporation',
            email: 'contact@acme.com',
            address: {
              street: '123 Business Ave',
              city: 'Business City',
              state: 'BC',
              zipCode: '12345',
              country: 'US',
            },
            customerType: 'business',
          },
          order: {
            items: [
              { productId: 'prod_001', quantity: 2, unitPrice: 150.00 },
            ],
            shippingMethod: 'expedited',
            notes: 'Urgent delivery required',
          },
        },
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertExists(data);
      assertEquals(data.operationType, 'create_customer_with_order');
      assertEquals(data.operationData.type, 'create_customer_with_order');
    });

    it('should validate bulk_update_inventory parameters', async () => {
      const validParams = {
        userId: 'test-user',
        operationType: 'bulk_update_inventory',
        operationData: {
          type: 'bulk_update_inventory',
          updates: [
            { productId: 'prod_001', quantity: 50, operation: 'add' },
            { productId: 'prod_002', quantity: 100, operation: 'set' },
          ],
          reason: 'Quarterly inventory adjustment',
        },
        executionOptions: {
          rollbackOnFailure: true,
          retryAttempts: 2,
        },
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertEquals(data.operationData.updates.length, 2);
      assertEquals(data.executionOptions.rollbackOnFailure, true);
    });

    it('should validate process_refund parameters', async () => {
      const validParams = {
        userId: 'test-user',
        operationType: 'process_refund',
        operationData: {
          type: 'process_refund',
          orderId: 'order_12345',
          refundAmount: 150.00,
          refundReason: 'Customer not satisfied with product quality',
          notifyCustomer: true,
        },
        notifications: {
          notifyOnCompletion: true,
          notificationChannels: ['email', 'slack'],
        },
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertEquals(data.operationData.refundAmount, 150.00);
      assertEquals(data.notifications.notifyOnCompletion, true);
    });

    it('should validate migrate_data parameters', async () => {
      const validParams = {
        userId: 'test-user',
        operationType: 'migrate_data',
        operationData: {
          type: 'migrate_data',
          sourceSystem: 'legacy_erp',
          targetSystem: 'modern_crm',
          dataTypes: ['customers', 'orders'],
          batchSize: 500,
          validateOnly: true,
        },
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      const data = getResultData(result);
      assertEquals(data.operationData.dataTypes.length, 2);
      assertEquals(data.operationData.validateOnly, true);
    });

    it('should fail validation for mismatched discriminated union', async () => {
      const invalidParams = {
        userId: 'test-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'bulk_update_inventory', // Wrong type for operation
          updates: [],
        },
      };

      const result = await workflow.validateParameters(invalidParams);
      // console.log('🚨 VALIDATION FAILURE RESULT:', {
      //   valid: result.valid,
      //   errorCount: result.errors?.length || 0,
      //   errors: result.errors?.map(e => ({ message: e.message, path: e.path, code: e.code }))
      // });
      assertEquals(result.valid, false);
      assert(Array.isArray(result.errors));
      // Check for the actual validation errors from discriminated union mismatch
      const hasRequiredFieldError = result.errors.some((err: any) =>
        err.message.includes('Required') && err.path.includes('reason')
      );
      const hasArrayMinError = result.errors.some((err: any) =>
        err.message.includes('Array must contain at least') &&
        err.path.includes('updates')
      );
      // console.log('🔍 ERROR CHECK:', {
      //   hasRequiredFieldError,
      //   hasArrayMinError,
      //   errorCount: result.errors.length,
      //   allErrors: result.errors.map(e => ({ message: e.message, path: e.path, code: e.code }))
      // });
      assert(
        hasRequiredFieldError || hasArrayMinError,
        'Should have validation errors from discriminated union mismatch',
      );
    });
  });

  /**
   * MULTI-STEP OAUTH OPERATION EXECUTION
   */
  describe('Multi-Step OAuth Operations', () => {
    it('should execute create_customer_with_order operation', async () => {
      const params = {
        userId: 'test-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Test Customer',
            email: 'test@example.com',
            address: {
              street: '123 Test St',
              city: 'Test City',
              state: 'TS',
              zipCode: '12345',
            },
          },
          order: {
            items: [
              { productId: 'prod_001', quantity: 1, unitPrice: 299.99 },
            ],
            shippingMethod: 'standard',
          },
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.completed_steps.length, 1);
      assertEquals(result.failed_steps.length, 0);
      const data = getResultData(result);
      assertExists(data.operationId);
      assertExists(data.result.customer);
      assertExists(data.result.order);
      assertExists(data.rollbackInfo);

      // Verify both API calls were made in sequence
      assertEquals(mockApiClient.getCallCount('createCustomer'), 1);
      assertEquals(mockApiClient.getCallCount('createOrder'), 1);

      // Verify OAuth was used for both operations
      assert(mockOAuth.hasValidToken('test-user'));
    });

    it('should execute bulk_update_inventory operation', async () => {
      const params = {
        userId: 'test-user',
        operationType: 'bulk_update_inventory',
        operationData: {
          type: 'bulk_update_inventory',
          updates: [
            { productId: 'prod_001', quantity: 50, operation: 'add' },
            { productId: 'prod_002', quantity: 25, operation: 'subtract' },
          ],
          reason: 'Stock adjustment after audit',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertExists(data.result.updated);
      assertEquals(data.result.updated, 2);

      // Verify inventory operations were called
      assertEquals(mockApiClient.getCallCount('getInventoryLevels'), 1);
      assertEquals(mockApiClient.getCallCount('bulkUpdateInventory'), 1);
    });

    it('should execute process_refund operation', async () => {
      const params = {
        userId: 'test-user',
        operationType: 'process_refund',
        operationData: {
          type: 'process_refund',
          orderId: 'order_12345',
          refundAmount: 199.99,
          refundReason: 'Defective product',
          notifyCustomer: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertExists(data.result.id);
      assertEquals(data.result.status, 'processed');
      assertEquals(data.result.amount, 199.99);

      // Verify refund processing was called
      assertEquals(mockApiClient.getCallCount('processRefund'), 1);
    });

    it('should execute data migration validation', async () => {
      const params = {
        userId: 'test-user',
        operationType: 'migrate_data',
        operationData: {
          type: 'migrate_data',
          sourceSystem: 'old_system',
          targetSystem: 'new_system',
          dataTypes: ['customers'],
          validateOnly: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertEquals(data.result.valid, true);
      assertExists(data.result.sourceRecords);

      // Should only validate, not execute migration
      assertEquals(mockApiClient.getCallCount('validateDataMigration'), 1);
      assertEquals(mockApiClient.getCallCount('executeDataMigration'), 0);
    });
  });

  /**
   * ROLLBACK MECHANISM TESTING
   */
  describe('Rollback Mechanisms', () => {
    it('should perform rollback on customer creation failure', async () => {
      // Set up failure on order creation (second step)
      mockApiClient.setApiFailure('createOrder', true);

      const params = {
        userId: 'test-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Test Customer',
            email: 'test@example.com',
            address: {
              street: '123 Test St',
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
        executionOptions: {
          rollbackOnFailure: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      const data = getResultData(result);
      assertExists(data.rollbackInfo);
      assertEquals(data.rollbackInfo.rollbackPerformed, true);

      // Verify rollback actions were performed
      const rollbackLog = mockApiClient.getRollbackLog();
      assert(rollbackLog.length > 0);
      assert(rollbackLog.some((action) => action.action === 'delete_customer'));
    });

    it('should skip rollback when disabled', async () => {
      // Set up failure on order creation
      mockApiClient.setApiFailure('createOrder', true);

      const params = {
        userId: 'test-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Test Customer',
            email: 'test@example.com',
            address: {
              street: '123 Test St',
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
        executionOptions: {
          rollbackOnFailure: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      const data = getResultData(result);
      assertEquals(data.rollbackInfo.rollbackPerformed, false);

      // Verify no rollback actions were performed
      const rollbackLog = mockApiClient.getRollbackLog();
      assertEquals(rollbackLog.length, 0);
    });

    it('should handle rollback failure gracefully', async () => {
      // Set up failure on both operation and rollback
      mockApiClient.setApiFailure('createOrder', true);
      mockApiClient.setApiFailure('deleteCustomer', true);

      const params = {
        userId: 'test-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Test Customer',
            email: 'test@example.com',
            address: {
              street: '123 Test St',
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
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      // Should still indicate rollback was attempted
      const data = getResultData(result);
      assertEquals(data.rollbackInfo.rollbackPerformed, true);

      // Should log rollback failures but not throw
      const errorLogs = mockLogger.errorCalls;
      assert(
        errorLogs.some((call) => call[0].includes('Rollback action failed')),
      );
    });
  });

  /**
   * DRY RUN AND EXECUTION PLANNING
   */
  describe('Dry Run and Execution Planning', () => {
    it('should perform dry run with execution planning', async () => {
      const params = {
        userId: 'test-user',
        dryRun: true,
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Test Customer',
            email: 'test@example.com',
            address: {
              street: '123 Test St',
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
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertEquals(data.dryRun, true);
      assertExists(data.executionPlan);
      assertExists(data.permissionCheck);
      assertExists(data.estimatedDuration);
      assertExists(data.resourceRequirements);

      // Should validate API connectivity
      assertEquals(mockApiClient.getCallCount('healthCheck'), 1);

      // Should not perform actual operations
      assertEquals(mockApiClient.getCallCount('createCustomer'), 0);
      assertEquals(mockApiClient.getCallCount('createOrder'), 0);
    });

    it('should generate appropriate execution plan for complex operations', async () => {
      const params = {
        userId: 'test-user',
        dryRun: true,
        operationType: 'bulk_update_inventory',
        operationData: {
          type: 'bulk_update_inventory',
          updates: Array(150).fill(null).map((_, i) => ({
            productId: `prod_${i}`,
            quantity: 10,
            operation: 'add',
          })),
          reason: 'Large inventory adjustment',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertEquals(data.executionPlan.operationType, 'bulk_update_inventory');
      assertEquals(data.executionPlan.rollbackEnabled, true);
      assertExists(data.resourceRequirements.apiCalls);

      // Should estimate higher API calls for bulk operations
      assert(data.resourceRequirements.apiCalls > 1);
    });
  });

  /**
   * PERMISSION AND AUTHORIZATION
   */
  describe('Permission and Authorization', () => {
    it('should validate permissions for operation types', async () => {
      const params = {
        userId: 'test-user',
        dryRun: true,
        operationType: 'migrate_data',
        operationData: {
          type: 'migrate_data',
          sourceSystem: 'old',
          targetSystem: 'new',
          dataTypes: ['customers'],
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      const data = getResultData(result);
      assertExists(data.permissionCheck);
      assertEquals(data.permissionCheck.hasPermission, true);
      assertExists(data.permissionCheck.requiredRoles);

      // Migration should require admin role
      assert(data.permissionCheck.requiredRoles.includes('admin'));
    });
  });

  /**
   * ERROR HANDLING IN MULTI-STEP OPERATIONS
   */
  describe('Multi-Step Error Handling', () => {
    it('should handle OAuth failure in multi-step operation', async () => {
      // Set up OAuth failure
      mockOAuth.setAuthFailure('auth-fail-user', true);

      const params = {
        userId: 'auth-fail-user',
        operationType: 'create_customer_with_order',
        operationData: {
          type: 'create_customer_with_order',
          customer: {
            name: 'Test Customer',
            email: 'test@example.com',
            address: {
              street: '123 Test St',
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
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assertExists(result.error);
      assertEquals(result.error.type, 'system_error');
      assert(result.error.message.includes('OAuth authentication failed'));
      assertEquals(result.failed_steps.length, 1);
    });

    it('should provide detailed error information for step failures', async () => {
      // Set up API failure
      mockApiClient.setApiFailure('bulkUpdateInventory', true);

      const params = {
        userId: 'test-user',
        operationType: 'bulk_update_inventory',
        operationData: {
          type: 'bulk_update_inventory',
          updates: [
            { productId: 'prod_001', quantity: 50, operation: 'add' },
          ],
          reason: 'Test update',
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.message.includes('Database error'));
      assertEquals(result.failed_steps.length, 1);
      assertEquals(result.failed_steps[0]!.error_type, 'system_error');
      assertExists(result.failed_steps[0]!.timestamp);
    });
  });

  /**
   * NOTIFICATION INTEGRATION
   */
  describe('Notification Integration', () => {
    it('should log notification sending for completion', async () => {
      const params = {
        userId: 'test-user',
        operationType: 'process_refund',
        operationData: {
          type: 'process_refund',
          orderId: 'order_12345',
          refundReason: 'Product defect',
        },
        notifications: {
          notifyOnCompletion: true,
          notificationChannels: ['email', 'slack'],
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Should log notification sending
      const logCalls = logSpy.calls;
      const notificationLog = logCalls.find((call) => call.args[0].includes('Notification sent'));
      assertExists(notificationLog);
      assertEquals(notificationLog.args[1].type, 'completion');
    });

    it('should log notification sending for failure', async () => {
      // Set up API failure
      mockApiClient.setApiFailure('processRefund', true);

      const params = {
        userId: 'test-user',
        operationType: 'process_refund',
        operationData: {
          type: 'process_refund',
          orderId: 'order_12345',
          refundReason: 'Product defect',
        },
        notifications: {
          notifyOnFailure: true,
          notificationChannels: ['email'],
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);

      // Should log failure notification
      const logCalls = logSpy.calls;
      const notificationLog = logCalls.find((call) => call.args[0].includes('Notification sent'));
      assertExists(notificationLog);
      assertEquals(notificationLog.args[1].type, 'failure');
    });
  });
});

/**
 * EDUCATIONAL SUMMARY - MULTI-STEP OAUTH WORKFLOW TESTING
 * =======================================================
 *
 * This comprehensive test file demonstrates multi-step OAuth workflow testing:
 *
 * 1. 🔄 MULTI-STEP OPERATION TESTING:
 *    - Complex business operations with multiple API calls
 *    - Sequential step execution with OAuth context
 *    - Transaction-like operation patterns
 *    - Step-by-step verification and validation
 *
 * 2. 🔐 OAUTH IN MULTI-STEP CONTEXT:
 *    - Authentication across multiple operation steps
 *    - Token usage consistency throughout workflow
 *    - OAuth failure handling in complex operations
 *    - User context preservation across steps
 *
 * 3. 🔄 ROLLBACK MECHANISM TESTING:
 *    - Rollback action execution and verification
 *    - Rollback failure handling and error recovery
 *    - Rollback configuration and control
 *    - Transaction integrity validation
 *
 * 4. 📋 DISCRIMINATED UNION VALIDATION:
 *    - Complex parameter schema validation
 *    - Type-specific parameter verification
 *    - Union type mismatch handling
 *    - Nested object validation
 *
 * 5. 🌫️ EXECUTION PLANNING AND DRY RUN:
 *    - Multi-step execution planning
 *    - Resource requirement estimation
 *    - Permission and authorization checking
 *    - Pre-flight validation
 *
 * 6. ⚠️ ADVANCED ERROR HANDLING:
 *    - Step-specific error reporting
 *    - Rollback error handling
 *    - OAuth failure in multi-step context
 *    - Detailed error metadata
 *
 * 7. 🗺️ INTEGRATION TESTING:
 *    - End-to-end multi-step operation flows
 *    - API sequencing and dependency management
 *    - Cross-step data flow validation
 *    - Complete business process testing
 *
 * KEY MULTI-STEP WORKFLOW BENEFITS:
 * =================================
 *
 * - **Transaction Patterns**: Validates complex business transactions
 * - **Rollback Safety**: Ensures data integrity with rollback mechanisms
 * - **OAuth Consistency**: Verifies authentication across multiple steps
 * - **Error Recovery**: Tests sophisticated error handling and recovery
 * - **Business Logic**: Validates complex multi-step business operations
 *
 * This demonstrates how to build comprehensive test suites for
 * complex OAuth-authenticated workflows with transaction-like patterns.
 */
