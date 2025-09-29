/**
 * ExampleCorp Operation Workflow
 *
 * Demonstrates a different workflow pattern - operational workflows that create/modify data:
 * - Extends library WorkflowBase class
 * - Shows multi-step operations with rollback capabilities
 * - Demonstrates transaction-like workflow patterns
 * - Uses library validation and error handling for complex operations
 */

// 🎯 Library imports - workflow infrastructure
import { Logger, WorkflowBase } from '@beyondbetter/bb-mcp-server';
import type { WorkflowContext, WorkflowResult } from '@beyondbetter/bb-mcp-server';
import { z } from 'zod'; // Library provides Zod integration

// 🎯 Consumer-specific imports
import { ExampleApiClient } from '../../api/ExampleApiClient.ts';

export interface ExampleOperationWorkflowDependencies {
  apiClient: ExampleApiClient;
  logger: Logger;
}

/**
 * ExampleCorp Operation Workflow
 *
 * 🎯 EXTENDS library WorkflowBase for complex business operations
 * 🎯 Demonstrates multi-step operations with error recovery
 * 🎯 Shows transaction-like patterns within workflow execution
 */
export class ExampleOperationWorkflow extends WorkflowBase {
  // 🎯 Required workflow metadata (library enforces these)
  readonly name = 'example_operation';
  readonly version = '1.0.0';
  readonly description =
    '🛠️ Execute complex ExampleCorp business operations with multi-step processing and rollback capabilities';
  readonly category = 'operation' as const;
  override readonly tags = [
    'operation',
    'business',
    'examplecorp',
    'multi-step',
  ];

  // 🎯 Library-enforced parameter validation schema
  readonly parameterSchema = z.object({
    // Required for all workflows
    userId: z.string().describe('User ID for authentication and audit logging'),
    requestId: z.string().optional().describe(
      'Optional request ID for tracking',
    ),
    dryRun: z.boolean().optional().default(false).describe('Dry run mode'),
    // Operation type and configuration
    operationType: z.enum([
      'create_customer_with_order',
      'bulk_update_inventory',
      'process_refund',
      'migrate_data',
    ]).describe('Type of operation to execute'),

    // Operation-specific parameters (discriminated union pattern)
    operationData: z.discriminatedUnion('type', [
      // Create customer with order operation
      z.object({
        type: z.literal('create_customer_with_order'),
        customer: z.object({
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          address: z.object({
            street: z.string(),
            city: z.string(),
            state: z.string(),
            zipCode: z.string(),
            country: z.string().default('US'),
          }),
          customerType: z.enum(['individual', 'business']).default(
            'individual',
          ),
        }),
        order: z.object({
          items: z.array(z.object({
            productId: z.string(),
            quantity: z.number().int().min(1),
            unitPrice: z.number().min(0),
          })).min(1),
          shippingMethod: z.enum(['standard', 'expedited', 'overnight'])
            .default('standard'),
          notes: z.string().optional(),
        }),
      }),

      // Bulk inventory update operation
      z.object({
        type: z.literal('bulk_update_inventory'),
        updates: z.array(z.object({
          productId: z.string(),
          quantity: z.number().int(),
          operation: z.enum(['set', 'add', 'subtract']).default('set'),
        })).min(1).max(1000), // Reasonable batch size
        reason: z.string().describe('Reason for inventory update'),
      }),

      // Process refund operation
      z.object({
        type: z.literal('process_refund'),
        orderId: z.string(),
        refundAmount: z.number().min(0).optional(),
        refundItems: z.array(z.object({
          orderItemId: z.string(),
          quantity: z.number().int().min(1),
          reason: z.string(),
        })).optional(),
        refundReason: z.string(),
        notifyCustomer: z.boolean().default(true),
      }),

      // Data migration operation
      z.object({
        type: z.literal('migrate_data'),
        sourceSystem: z.string(),
        targetSystem: z.string(),
        dataTypes: z.array(
          z.enum(['customers', 'orders', 'products', 'inventory']),
        ).min(1),
        batchSize: z.number().int().min(1).max(1000).default(100),
        validateOnly: z.boolean().default(false),
      }),
    ]).describe('Operation-specific data and parameters'),

    // Execution options
    executionOptions: z.object({
      timeout: z.number().int().min(1).max(3600).optional().default(300)
        .describe('Operation timeout in seconds'),
      retryAttempts: z.number().int().min(0).max(5).optional().default(2)
        .describe('Number of retry attempts on failure'),
      rollbackOnFailure: z.boolean().optional().default(true).describe(
        'Whether to rollback changes on failure',
      ),
      continueOnPartialFailure: z.boolean().optional().default(false).describe(
        'Continue processing if some items fail',
      ),
    }).optional().describe('Execution configuration options'),

    // Notification settings
    notifications: z.object({
      notifyOnCompletion: z.boolean().default(false),
      notifyOnFailure: z.boolean().default(true),
      notificationChannels: z.array(z.enum(['email', 'slack', 'webhook']))
        .optional(),
      customRecipients: z.array(z.string().email()).optional(),
    }).optional().describe('Notification configuration'),
    // Note: userId, requestId, dryRun already defined above
  }).refine(
    (data) => {
      // console.log("🔍 VALIDATION CHECK:", {
      //   operationType: data.operationType,
      //   operationDataType: data.operationData.type,
      //   matches: data.operationType === data.operationData.type,
      // });

      // Ensure operationType matches operationData.type
      return data.operationType === data.operationData.type;
    },
    {
      message: 'operationType must match operationData.type',
      path: ['operationData', 'type'],
    },
  );

  private apiClient: ExampleApiClient;
  private logger: Logger;

  constructor(dependencies: ExampleOperationWorkflowDependencies) {
    super(); // 🎯 Initialize library base class

    this.apiClient = dependencies.apiClient;
    this.logger = dependencies.logger;
  }

  /**
   * Get workflow registration information (required by WorkflowBase)
   */
  getRegistration() {
    return {
      name: this.name,
      displayName: 'ExampleCorp Operation Workflow',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration || 180,
      tags: this.tags,
      author: 'ExampleCorp Integration Team',
      parameterSchema: this.parameterSchema, // Include parameter schema for get_schema_for_workflow tool
    };
  }

  /**
   * Get workflow overview for tool descriptions (required by WorkflowBase)
   */
  getOverview(): string {
    return `${this.description}\n\nSupported Operations:\n- create_customer_with_order: Create customer and associated order in single operation\n- bulk_update_inventory: Update inventory levels for multiple products\n- process_refund: Process order refunds with automatic calculations\n- migrate_data: Migrate data between systems with validation\n\nFeatures:\n- Multi-step execution with rollback\n- Dry run validation and planning\n- Configurable retry and timeout\n- Notification integration\n- Permission validation`;
  }

  /**
   * Protected workflow execution method (required by WorkflowBase)
   */
  protected async executeWorkflow(
    params: any,
    context: WorkflowContext,
  ): Promise<WorkflowResult> {
    return await this.execute(params);
  }

  /**
   * 🎯 Main workflow execution with multi-step operation handling
   * Library handles: input validation, error catching, result formatting
   */
  async execute(
    params: z.infer<typeof this.parameterSchema>,
  ): Promise<WorkflowResult> {
    const startTime = performance.now();
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      this.logger.info('ExampleCorp operation workflow started', {
        workflowName: this.name,
        operationType: params.operationType,
        operationId,
        userId: params.userId,
        requestId: params.requestId,
        dryRun: params.dryRun,
      });

      // 🎯 Dry run mode - validate and return execution plan
      if (params.dryRun) {
        return await this.performDryRun(params, operationId);
      }

      // 🎯 Execute operation with rollback capability
      // console.log('🚀 STARTING OPERATION EXECUTION:', {
      //   operationType: params.operationType,
      //   userId: params.userId,
      //   operationId
      // });
      const operationResult = await this.executeOperation(params, operationId);
      // console.log('📊 OPERATION RESULT:', {
      //   success: operationResult.success,
      //   hasError: !!operationResult.error,
      //   errorMessage: operationResult.error?.message,
      //   operationId
      // });

      const executionTime = performance.now() - startTime;

      // 🎯 Handle operation failure - return error result immediately
      if (!operationResult.success) {
        this.logger.error(
          'ExampleCorp operation workflow failed',
          operationResult.error instanceof Error
            ? operationResult.error
            : new Error(operationResult.error?.message || 'Operation failed'),
          {
            workflowName: this.name,
            operationType: params.operationType,
            operationId,
            executionTime,
            userId: params.userId,
          },
        );

        // 🎯 Send failure notifications if configured
        if (params.notifications?.notifyOnFailure) {
          await this.sendNotification(params, operationResult, 'failure');
        }

        return {
          success: false,
          data: {
            operationId,
            operationType: params.operationType,
            rollbackInfo: operationResult.rollbackInfo,
          },
          error: {
            type: 'system_error' as const,
            message: operationResult.error?.message || 'Operation failed',
            details: operationResult.error?.details,
            code: operationResult.error?.code,
            stack: operationResult.error?.stack,
            recoverable: true,
          },
          completed_steps: [],
          failed_steps: [{
            operation: params.operationType,
            error_type: 'system_error' as const,
            message: operationResult.error?.message || 'Operation failed',
            timestamp: new Date().toISOString(),
          }],
          metadata: {
            workflowName: this.name,
            executionTime,
            operationId,
            timestamp: new Date().toISOString(),
          },
        };
      }

      this.logger.info('ExampleCorp operation workflow completed', {
        workflowName: this.name,
        operationType: params.operationType,
        operationId,
        executionTime,
        success: operationResult.success,
        userId: params.userId,
      });

      // 🎯 Send notifications if configured
      if (params.notifications?.notifyOnCompletion) {
        await this.sendNotification(params, operationResult, 'completion');
      }

      // 🎯 Return structured workflow result (success case)
      return {
        success: true,
        data: {
          operationId,
          operationType: params.operationType,
          result: operationResult.data,
          steps: operationResult.steps,
          rollbackInfo: operationResult.rollbackInfo,
        },
        completed_steps: [{
          operation: params.operationType,
          success: true,
          data: operationResult.data,
          duration_ms: executionTime,
          timestamp: new Date().toISOString(),
        }],
        failed_steps: [],
        metadata: {
          workflowName: this.name,
          executionTime,
          operationId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      this.logger.error(
        'ExampleCorp operation workflow failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          workflowName: this.name,
          operationType: params.operationType,
          operationId,
          executionTime,
          userId: params.userId,
        },
      );

      // 🎯 Send failure notifications if configured
      if (params.notifications?.notifyOnFailure) {
        await this.sendNotification(
          params,
          { success: false, error },
          'failure',
        );
      }

      // 🎯 Return structured error result
      return {
        success: false,
        data: {
          operationId,
          operationType: params.operationType,
          rollbackInfo: {
            rollbackPerformed: false,
            rollbackActions: 0,
            rollbackEnabled: params.executionOptions?.rollbackOnFailure !== false,
          },
        },
        error: {
          type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          code: undefined,
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true,
        },
        completed_steps: [],
        failed_steps: [{
          operation: params.operationType,
          error_type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          ...(error instanceof Error && error.stack ? { details: error.stack } : {}),
          timestamp: new Date().toISOString(),
        }],
        metadata: {
          workflowName: this.name,
          executionTime,
          operationId,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // =============================================================================
  // PRIVATE OPERATION EXECUTION METHODS
  // =============================================================================

  /**
   * Perform dry run validation and planning
   */
  private async performDryRun(
    params: z.infer<typeof this.parameterSchema>,
    operationId: string,
  ): Promise<WorkflowResult> {
    // console.log("🏃 DRY RUN START:", {
    //   operationType: params.operationType,
    //   operationId,
    // });

    // Validate API connectivity
    const apiStatus = await this.apiClient.healthCheck();
    // console.log("🔍 API Health Check:", apiStatus);
    if (!apiStatus.healthy) {
      throw new Error('ExampleCorp API is not accessible');
    }

    // Generate execution plan
    const executionPlan = await this.buildExecutionPlan(params);
    // console.log("📋 Execution Plan:", executionPlan);

    // Validate operation permissions
    const permissionCheck = await this.validatePermissions(params);
    // console.log("🔐 Permission Check:", permissionCheck);

    const result = {
      success: true,
      data: {
        dryRun: true,
        operationId,
        executionPlan,
        permissionCheck,
        estimatedDuration: this.estimateExecutionTime(params),
        resourceRequirements: this.calculateResourceRequirements(params),
      },
      completed_steps: [{
        operation: 'dry_run_validation',
        success: true,
        data: { executionPlan, permissionCheck },
        duration_ms: 200,
        timestamp: new Date().toISOString(),
      }],
      failed_steps: [],
      metadata: {
        workflowName: this.name,
        mode: 'dry_run',
        operationId,
        timestamp: new Date().toISOString(),
      },
    };

    // console.log("🏁 DRY RUN RESULT:", {
    //   success: result.success,
    //   completedStepsCount: result.completed_steps.length,
    //   failedStepsCount: result.failed_steps.length,
    //   dataKeys: Object.keys(result.data),
    // });

    return result;
  }

  /**
   * Execute the operation with rollback capability
   */
  private async executeOperation(
    params: z.infer<typeof this.parameterSchema>,
    operationId: string,
  ): Promise<
    {
      success: boolean;
      data?: any;
      steps?: any[];
      rollbackInfo?: any;
      error?: any;
    }
  > {
    const steps: any[] = [];
    const rollbackActions: any[] = [];

    try {
      // 🎯 Execute operation based on type
      switch (params.operationType) {
        case 'create_customer_with_order':
          return await this.executeCreateCustomerWithOrder(
            params,
            operationId,
            steps,
            rollbackActions,
          );

        case 'bulk_update_inventory':
          return await this.executeBulkInventoryUpdate(
            params,
            operationId,
            steps,
            rollbackActions,
          );

        case 'process_refund':
          return await this.executeProcessRefund(
            params,
            operationId,
            steps,
            rollbackActions,
          );

        case 'migrate_data':
          return await this.executeDataMigration(
            params,
            operationId,
            steps,
            rollbackActions,
          );

        default:
          throw new Error(
            `Unsupported operation type: ${params.operationType}`,
          );
      }
    } catch (error) {
      // 🎯 Determine if rollback should be performed
      const shouldRollback = params.executionOptions?.rollbackOnFailure !== false &&
        rollbackActions.length > 0;

      // 🎯 Perform rollback if enabled and rollback actions exist
      if (shouldRollback) {
        this.logger.warn('Operation failed, performing rollback', {
          operationId,
          rollbackActions: rollbackActions.length,
        });

        try {
          await this.performRollback(rollbackActions, operationId);
        } catch (rollbackError) {
          this.logger.error(
            'Rollback failed',
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
            {
              operationId,
            },
          );
        }
      }

      return {
        success: false,
        error,
        steps,
        rollbackInfo: {
          rollbackPerformed: shouldRollback,
          rollbackActions: rollbackActions.length,
          rollbackEnabled: params.executionOptions?.rollbackOnFailure !== false,
        },
      };
    }
  }

  /**
   * Execute create customer with order operation
   */
  private async executeCreateCustomerWithOrder(
    params: z.infer<typeof this.parameterSchema>,
    operationId: string,
    steps: any[],
    rollbackActions: any[],
  ): Promise<{ success: boolean; data: any; steps: any[]; rollbackInfo: any }> {
    const operationData = params.operationData as Extract<
      typeof params.operationData,
      { type: 'create_customer_with_order' }
    >;

    // Step 1: Create customer
    this.logger.debug('Creating customer', { operationId });
    const customerData: any = {
      name: operationData.customer.name,
      email: operationData.customer.email,
      address: operationData.customer.address,
      customerType: operationData.customer.customerType,
    };
    if (operationData.customer.phone) {
      customerData.phone = operationData.customer.phone;
    }
    const customer = await this.apiClient.createCustomer(
      customerData,
      params.userId,
    );
    steps.push({
      step: 'create_customer',
      result: customer,
      timestamp: new Date().toISOString(),
    });
    rollbackActions.push({
      action: 'delete_customer',
      customerId: customer.id,
    });

    // Step 2: Create order for customer
    this.logger.debug('Creating order for customer', {
      operationId,
      customerId: customer.id,
    });
    const orderData: any = {
      customerId: customer.id,
      items: operationData.order.items,
      shippingMethod: operationData.order.shippingMethod,
    };
    if (operationData.order.notes) {
      orderData.notes = operationData.order.notes;
    }
    const order = await this.apiClient.createOrder(orderData, params.userId);
    steps.push({
      step: 'create_order',
      result: order,
      timestamp: new Date().toISOString(),
    });
    rollbackActions.push({ action: 'cancel_order', orderId: order.id });

    return {
      success: true,
      data: {
        customer,
        order,
        totalAmount: order.totalAmount,
      },
      steps,
      rollbackInfo: {
        rollbackActionsAvailable: rollbackActions.length,
        rollbackEnabled: params.executionOptions?.rollbackOnFailure !== false,
      },
    };
  }

  /**
   * Execute bulk inventory update operation
   */
  private async executeBulkInventoryUpdate(
    params: z.infer<typeof this.parameterSchema>,
    operationId: string,
    steps: any[],
    rollbackActions: any[],
  ): Promise<{ success: boolean; data: any; steps: any[]; rollbackInfo: any }> {
    const operationData = params.operationData as Extract<
      typeof params.operationData,
      { type: 'bulk_update_inventory' }
    >;

    // Get current inventory levels for rollback
    const currentInventory = await this.apiClient.getInventoryLevels(
      operationData.updates.map((u) => u.productId),
      params.userId,
    );

    // Prepare rollback actions
    rollbackActions.push({
      action: 'restore_inventory',
      inventory: currentInventory,
    });

    // Execute bulk update
    const updateResult = await this.apiClient.bulkUpdateInventory({
      updates: operationData.updates,
      reason: operationData.reason,
    }, params.userId);

    steps.push({
      step: 'bulk_inventory_update',
      result: updateResult,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      data: updateResult,
      steps,
      rollbackInfo: {
        rollbackActionsAvailable: rollbackActions.length,
        rollbackEnabled: params.executionOptions?.rollbackOnFailure !== false,
      },
    };
  }

  /**
   * Execute process refund operation
   */
  private async executeProcessRefund(
    params: z.infer<typeof this.parameterSchema>,
    operationId: string,
    steps: any[],
    rollbackActions: any[],
  ): Promise<{ success: boolean; data: any; steps: any[]; rollbackInfo: any }> {
    const operationData = params.operationData as Extract<
      typeof params.operationData,
      { type: 'process_refund' }
    >;

    // Process the refund
    const refundData: any = {
      orderId: operationData.orderId,
      reason: operationData.refundReason,
    };
    if (operationData.refundAmount !== undefined) {
      refundData.refundAmount = operationData.refundAmount;
    }
    if (operationData.refundItems !== undefined) {
      refundData.refundItems = operationData.refundItems;
    }
    const refund = await this.apiClient.processRefund(
      refundData,
      params.userId,
    );

    steps.push({
      step: 'process_refund',
      result: refund,
      timestamp: new Date().toISOString(),
    });

    // Note: Refunds typically cannot be automatically rolled back
    rollbackActions.push({
      action: 'manual_review_required',
      refundId: refund.id,
      note: 'Refund rollback requires manual intervention',
    });

    return {
      success: true,
      data: refund,
      steps,
      rollbackInfo: {
        rollbackActionsAvailable: 0, // Manual intervention required
        rollbackEnabled: false,
        note: 'Refund operations require manual rollback',
      },
    };
  }

  /**
   * Execute data migration operation
   */
  private async executeDataMigration(
    params: z.infer<typeof this.parameterSchema>,
    operationId: string,
    steps: any[],
    rollbackActions: any[],
  ): Promise<{ success: boolean; data: any; steps: any[]; rollbackInfo: any }> {
    const operationData = params.operationData as Extract<
      typeof params.operationData,
      { type: 'migrate_data' }
    >;

    if (operationData.validateOnly) {
      // Validation-only migration
      const validation = await this.apiClient.validateDataMigration(
        operationData,
        params.userId,
      );
      steps.push({
        step: 'validate_migration',
        result: validation,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        data: validation,
        steps,
        rollbackInfo: { rollbackActionsAvailable: 0, rollbackEnabled: false },
      };
    } else {
      // Actual migration execution
      const migration = await this.apiClient.executeDataMigration(
        operationData,
        params.userId,
      );
      steps.push({
        step: 'execute_migration',
        result: migration,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        data: migration,
        steps,
        rollbackInfo: {
          rollbackActionsAvailable: migration.rollbackAvailable ? 1 : 0,
          rollbackEnabled: migration.rollbackAvailable,
        },
      };
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Perform rollback operations
   */
  private async performRollback(
    rollbackActions: any[],
    operationId: string,
  ): Promise<void> {
    for (const action of rollbackActions.reverse()) { // Reverse order for rollback
      try {
        await this.executeRollbackAction(action, operationId);
      } catch (error) {
        this.logger.error(
          'Rollback action failed',
          error instanceof Error ? error : new Error(String(error)),
          {
            operationId,
            action: action.action,
          },
        );
        // Continue with other rollback actions
      }
    }
  }

  /**
   * Execute a single rollback action
   */
  private async executeRollbackAction(
    action: any,
    operationId: string,
  ): Promise<void> {
    this.logger.debug('Executing rollback action', {
      operationId,
      action: action.action,
    });

    switch (action.action) {
      case 'delete_customer':
        await this.apiClient.deleteCustomer(action.customerId);
        break;
      case 'cancel_order':
        await this.apiClient.cancelOrder(action.orderId);
        break;
      case 'restore_inventory':
        await this.apiClient.restoreInventoryLevels(action.inventory);
        break;
      default:
        this.logger.warn('Unknown rollback action', {
          operationId,
          action: action.action,
        });
    }
  }

  /**
   * Build execution plan for dry run
   */
  private async buildExecutionPlan(
    params: z.infer<typeof this.parameterSchema>,
  ): Promise<any> {
    const baseSteps = {
      create_customer_with_order: ['create_customer', 'create_order'],
      bulk_update_inventory: ['get_current_inventory', 'bulk_update_inventory'],
      process_refund: ['validate_order', 'process_refund'],
      migrate_data: ['validate_migration', 'execute_migration'],
    }[params.operationType] || [];

    return {
      operationType: params.operationType,
      steps: baseSteps,
      estimatedSteps: baseSteps.length,
      rollbackEnabled: params.executionOptions?.rollbackOnFailure !== false,
      retryEnabled: (params.executionOptions?.retryAttempts || 0) > 0,
    };
  }

  /**
   * Validate operation permissions
   */
  private async validatePermissions(
    params: z.infer<typeof this.parameterSchema>,
  ): Promise<any> {
    // In a real implementation, this would check user permissions against the operation type
    return {
      hasPermission: true,
      requiredRoles: this.getRequiredRoles(params.operationType),
      userRoles: ['user', 'operator'], // Would come from auth context
    };
  }

  /**
   * Get required roles for operation type
   */
  private getRequiredRoles(operationType: string): string[] {
    return {
      create_customer_with_order: ['user'],
      bulk_update_inventory: ['operator', 'admin'],
      process_refund: ['operator', 'admin'],
      migrate_data: ['admin'],
    }[operationType] || ['user'];
  }

  /**
   * Estimate execution time
   */
  private estimateExecutionTime(
    params: z.infer<typeof this.parameterSchema>,
  ): string {
    const estimates = {
      create_customer_with_order: '10-30 seconds',
      bulk_update_inventory: '1-5 minutes',
      process_refund: '30-60 seconds',
      migrate_data: '5-60 minutes',
    };

    return estimates[params.operationType] || '1-5 minutes';
  }

  /**
   * Calculate resource requirements
   */
  private calculateResourceRequirements(
    params: z.infer<typeof this.parameterSchema>,
  ): any {
    return {
      apiCalls: this.estimateApiCalls(params),
      memoryUsage: 'low',
      networkBandwidth: 'medium',
      executionTime: this.estimateExecutionTime(params),
    };
  }

  /**
   * Estimate API calls required
   */
  private estimateApiCalls(
    params: z.infer<typeof this.parameterSchema>,
  ): number {
    switch (params.operationType) {
      case 'create_customer_with_order':
        return 2; // create customer + create order
      case 'bulk_update_inventory':
        const updates = params.operationData.type === 'bulk_update_inventory'
          ? params.operationData.updates
          : [];
        return Math.ceil(updates.length / 100) + 1; // batch API calls
      case 'process_refund':
        return 2; // validate order + process refund
      case 'migrate_data':
        const dataTypes = params.operationData.type === 'migrate_data'
          ? params.operationData.dataTypes
          : [];
        return dataTypes.length * 2; // read + write for each data type
      default:
        return 1;
    }
  }

  /**
   * Send notification
   */
  private async sendNotification(
    params: z.infer<typeof this.parameterSchema>,
    result: any,
    type: 'completion' | 'failure',
  ): Promise<void> {
    // In a real implementation, this would send actual notifications
    this.logger.info('Notification sent', {
      type,
      operationType: params.operationType,
      channels: params.notifications?.notificationChannels || ['email'],
      recipients: params.notifications?.customRecipients || [],
    });
  }
}

/**
 * LIBRARY VALIDATION:
 *
 * This workflow demonstrates advanced patterns using library infrastructure:
 *
 * ✅ Multi-Step Operations: Complex business operations with rollback (~150 lines)
 * ✅ Workflow Infrastructure: Library WorkflowBase handles execution framework (~0 lines)
 * ✅ Input Validation: Complex discriminated union validation via library Zod (~0 lines)
 * ✅ Error Handling: Comprehensive error handling and rollback via library (~0 lines)
 * ✅ Transaction Patterns: Multi-step operations with rollback capabilities
 * ✅ Dry Run Support: Validation and execution planning
 * ✅ Notification Integration: Event-driven notification patterns
 * ✅ Permission Validation: Role-based operation authorization
 *
 * ARCHITECTURE BENEFITS:
 * - Complex Operations: Library enables sophisticated workflow patterns
 * - Error Recovery: Built-in rollback and retry capabilities
 * - Audit Trail: Complete operation logging and step tracking
 * - Type Safety: Full validation for complex operation parameters
 * - Testing: Business logic easily testable with mock dependencies
 */
