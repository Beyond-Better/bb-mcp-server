/**
 * Tests for enhanced WorkflowBase class
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { z } from 'zod';

import { WorkflowBase, WorkflowDependencies } from '../../../src/lib/workflows/WorkflowBase.ts';
import type {
  WorkflowContext,
  WorkflowRegistration,
  WorkflowResult,
} from '../../../src/lib/types/WorkflowTypes.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';
import { AuditLogger } from '../../../src/lib/utils/AuditLogger.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import { createMockConfigManager, createMockKVManager } from '../../utils/test-helpers.ts';

// Test workflow implementation
class TestWorkflow extends WorkflowBase {
  readonly name = 'test_workflow';
  readonly version = '1.0.0';
  readonly description = 'Test workflow for unit testing';
  readonly category = 'utility' as const;
  override readonly tags = ['test', 'utility'];
  override readonly requiresAuth = true;
  override readonly estimatedDuration = 30; // 30 seconds

  readonly parameterSchema = z.object({
    userId: z.string().min(1),
    message: z.string().min(1),
    count: z.number().int().positive().default(1),
    optional: z.string().optional(),
  });

  constructor(dependencies: WorkflowDependencies) {
    super(dependencies);
  }

  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'Test Workflow',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration,
      tags: this.tags,
      parameterSchema: this.parameterSchema,
    };
  }

  getOverview(): string {
    return 'A simple test workflow for unit testing purposes';
  }

  protected async executeWorkflow(
    params: z.infer<typeof this.parameterSchema>,
    context: WorkflowContext,
  ): Promise<WorkflowResult> {
    // Simulate some work
    const steps = [];

    for (let i = 0; i < params.count; i++) {
      const stepResult = this.createStepResult(
        `process_message_${i}`,
        true,
        { processed: `${params.message} - ${i}` },
      );
      steps.push(stepResult);
    }

    return {
      success: true,
      data: {
        processed_messages: steps.map((s) => s.data),
        total_count: params.count,
      },
      completed_steps: steps,
      failed_steps: [],
      metadata: {
        workflow_type: 'test',
      },
    };
  }
}

// Failing test workflow
class FailingTestWorkflow extends WorkflowBase {
  readonly name = 'failing_workflow';
  readonly version = '1.0.0';
  readonly description = 'Workflow that always fails';
  readonly category = 'utility' as const;
  override readonly tags = ['test', 'failing'];
  override readonly requiresAuth = false;

  readonly parameterSchema = z.object({
    userId: z.string(),
  });

  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'Failing Workflow',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      parameterSchema: this.parameterSchema,
    };
  }

  getOverview(): string {
    return 'A workflow that always fails for testing error handling';
  }

  protected async executeWorkflow(): Promise<WorkflowResult> {
    throw new Error('This workflow always fails');
  }
}

// Helper function to create test context
function createTestContext(
  logger?: Logger,
  auditLogger?: AuditLogger,
  kvManager?: KVManager,
): WorkflowContext {
  return {
    userId: 'test-user',
    requestId: 'test-req-123',
    workflowName: 'test_workflow',
    startTime: new Date(),
    auditLogger: auditLogger ||
      new AuditLogger(
        {
          enabled: true,
          logCalls: {
            api: true,
            auth: true,
            workflow_execution: true,
            workflow_operation: true,
            tools: true,
            system: true,
            custom: true,
          },
        },
        logger || new Logger({ level: 'info' }),
      ),
    logger,
    kvManager,
    thirdPartyClient: undefined,
    parameterUserId: 'param-user',
    _meta: {
      testMode: true,
    },
    authenticatedUserId: 'auth-user',
    clientId: 'test-client',
    scopes: ['read', 'write'],
  };
}

Deno.test('WorkflowBase - parameter validation with Zod', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const workflow = new TestWorkflow({ logger, configManager, kvManager });

  // Valid parameters
  const validParams = {
    userId: 'test-user',
    message: 'hello world',
    count: 2,
  };

  const validResult = await workflow.validateParameters(validParams);
  assertEquals(validResult.valid, true);
  assertEquals(validResult.data?.count, 2);
  assertEquals(validResult.data?.userId, 'test-user');
  assertEquals(validResult.errors.length, 0);

  // Invalid parameters - missing required field
  const invalidParams = {
    userId: 'test-user',
    // missing message
    count: 2,
  };

  const invalidResult = await workflow.validateParameters(invalidParams);
  assertEquals(invalidResult.valid, false);
  assert(invalidResult.errors.length > 0);
  assert(invalidResult.errors[0]!.path.includes('message'));

  // Parameters with defaults
  const defaultParams = {
    userId: 'test-user',
    message: 'test',
    // count should default to 1
  };

  const defaultResult = await workflow.validateParameters(defaultParams);
  assertEquals(defaultResult.valid, true);
  assertEquals(defaultResult.data?.count, 1); // default value applied

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - successful execution with validation', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const auditLogger = new AuditLogger({
    enabled: true,
    logCalls: {
      api: true,
      auth: true,
      workflow_execution: true,
      workflow_operation: true,
      tools: true,
      system: true,
      custom: true,
    },
  }, logger);
  const context = createTestContext(logger, auditLogger, kvManager);

  const workflow = new TestWorkflow({ logger, configManager, kvManager });
  const params = {
    userId: 'test-user',
    message: 'hello world',
    count: 3,
  };

  const result = await workflow.executeWithValidation(params, context);
  console.log('result', result);

  assertEquals(result.success, true);
  assertExists(result.duration);
  assertExists(result.resources);
  assertEquals(result.completed_steps.length, 3);
  assertEquals(result.failed_steps.length, 0);
  assertEquals((result.data as any).total_count, 3);

  // Check step results
  for (let i = 0; i < 3; i++) {
    assertEquals(result.completed_steps[i]!.operation, `process_message_${i}`);
    assertEquals(result.completed_steps[i]!.success, true);
    assertExists(result.completed_steps[i]!.timestamp);
  }

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - parameter validation errors', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const context = createTestContext();
  const workflow = new TestWorkflow({ logger, configManager, kvManager });

  const invalidParams = {
    userId: '', // empty string - should fail min(1) validation
    message: 'test',
    count: -1, // negative - should fail positive() validation
  };

  const result = await workflow.executeWithValidation(invalidParams, context);

  assertEquals(result.success, false);
  assertExists(result.error);
  assertEquals(result.error.type, 'validation');
  assert(result.failed_steps.length > 0);
  assertEquals(result.failed_steps[0]!.error_type, 'validation');
  assert(result.error.message.includes('Parameter validation failed'));

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - execution error handling', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const context = createTestContext(logger);

  const workflow = new FailingTestWorkflow({ logger, configManager, kvManager });
  const params = {
    userId: 'test-user',
  };

  const result = await workflow.executeWithValidation(params, context);

  assertEquals(result.success, false);
  assertExists(result.error);
  assertEquals(result.error.type, 'system_error');
  assertEquals(result.error.message, 'This workflow always fails');
  assertExists(result.duration);
  assertEquals(result.failed_steps.length, 1);
  assertEquals(result.failed_steps[0]!.operation, 'failing_workflow');

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - safe execution wrapper', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const workflow = new TestWorkflow({ logger, configManager, kvManager });
  const context = createTestContext(); // Mock workflow context
  (workflow as any).context = context;
  (workflow as any).resources = [];

  // Test successful operation
  const successResult = await (workflow as any).safeExecute(
    'test_operation',
    async () => ({ result: 'success' }),
  );

  assertEquals(successResult.success, true);
  assertEquals(successResult.data?.result, 'success');

  // Test failing operation
  const failResult = await (workflow as any).safeExecute(
    'failing_operation',
    async () => {
      throw new Error('Operation failed');
    },
  );

  assertEquals(failResult.success, false);
  assertExists(failResult.error);
  assertEquals(failResult.error?.message, 'Operation failed');

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - resource tracking', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const workflow = new TestWorkflow({ logger, configManager, kvManager });
  const context = createTestContext(); // Set up workflow context
  (workflow as any).context = context;
  (workflow as any).resources = [];

  // Track a resource
  const startTime = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 10)) // Small delay
  ;
  (workflow as any).trackResource(
    'api_call',
    'test_api',
    startTime,
    'success',
    { endpoint: '/test' },
  );

  const resources = (workflow as any).resources;
  assertEquals(resources.length, 1);
  assertEquals(resources[0].type, 'api_call');
  assertEquals(resources[0].name, 'test_api');
  assertEquals(resources[0].status, 'success');
  assert(resources[0].duration_ms > 0);
  assertEquals(resources[0].metadata?.endpoint, '/test');

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - error classification', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const workflow = new TestWorkflow({ logger, configManager, kvManager });

  // Test different error types
  const validationError = new Error('validation failed for field');
  assertEquals((workflow as any).classifyError(validationError), 'validation');

  const authError = new Error('unauthorized access');
  assertEquals((workflow as any).classifyError(authError), 'authentication');

  const apiError = new Error('API request failed');
  assertEquals((workflow as any).classifyError(apiError), 'api_error');

  const timeoutError = new Error('request timeout');
  assertEquals((workflow as any).classifyError(timeoutError), 'timeout');

  const unknownError = new Error('something went wrong');
  assertEquals((workflow as any).classifyError(unknownError), 'system_error');

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - workflow registration', async () => {
  const logger = new Logger({ level: 'debug', format: 'text' });
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const workflow = new TestWorkflow({ logger, configManager, kvManager });
  const registration = workflow.getRegistration();

  assertEquals(registration.name, 'test_workflow');
  assertEquals(registration.version, '1.0.0');
  assertEquals(registration.category, 'utility');
  assertEquals(registration.requiresAuth, true);
  assertEquals(registration.estimatedDuration, 30);
  assert(registration.tags?.includes('test'));
  assert(registration.tags?.includes('utility'));

  await kvManager.close();
  // kvManager = undefined;
});

Deno.test('WorkflowBase - logging integration', async () => {
  const logs: string[] = [];

  // Create mock logger that captures log messages
  const mockLogger = {
    info: (message: string) => logs.push(`INFO: ${message}`),
    warn: (message: string) => logs.push(`WARN: ${message}`),
    error: (message: string) => logs.push(`ERROR: ${message}`),
    debug: (message: string) => logs.push(`DEBUG: ${message}`),
    dir: () => {},
    child: () => mockLogger,
    currentLogLevel: 'info' as any,
    config: { level: 'info', format: 'text' } as any,
    shouldLog: () => true,
    formatMessage: () => '',
    colorMessage: () => '',
    writeToOutput: () => {},
  } as unknown as Logger;

  const context = createTestContext(mockLogger);
  const configManager = await createMockConfigManager();
  const kvManager = await createMockKVManager();
  const workflow = new TestWorkflow({ logger: mockLogger, configManager, kvManager });

  const params = {
    userId: 'test-user',
    message: 'test message',
    count: 1,
  };

  await workflow.executeWithValidation(params, context);

  // Check that logging occurred
  assert(logs.some((log) => log.includes('Workflow starting')));
  assert(logs.some((log) => log.includes('Workflow completed')));

  await kvManager.close();
  // kvManager = undefined;
});
