/**
 * Tool-specific Test Helpers
 * Additional utilities specifically for ToolBase and tool-related testing
 * Complements the main test-helpers.ts file
 */

import { z, type ZodSchema } from 'zod';
import type { CallToolResult } from 'mcp/types.js';

// Import types
import type { ToolDefinition } from '../../src/lib/types/BeyondMcpTypes.ts';
import type { PluginCategory } from '../../src/lib/types/PluginTypes.ts';
import { SpyAuditLogger, SpyLogger } from './test-helpers.ts';

/**
 * Type guard to check if a CallToolResult has valid text content
 */
function hasTextContent(result: CallToolResult): result is CallToolResult & {
  content: Array<{ type: 'text'; text: string }>
} {
  return (
    !!result.content &&
    Array.isArray(result.content) &&
    result.content.length > 0 &&
    !!result.content[0] &&
    typeof result.content[0] === 'object' &&
    'type' in result.content[0] &&
    result.content[0].type === 'text' &&
    'text' in result.content[0] &&
    typeof result.content[0].text === 'string'
  );
}

/**
 * Test data generators for ToolBase testing
 */
export const ToolTestData = {
  /**
   * Generate valid tool arguments for testing
   */
  validToolArgs: (overrides: Record<string, unknown> = {}) => ({
    userId: 'test-user-' + Math.random().toString(36).substr(2, 8),
    requestId: 'test-req-' + Math.random().toString(36).substr(2, 8),
    message: 'Test message',
    ...overrides,
  }),

  /**
   * Generate invalid tool arguments for testing validation failures
   */
  invalidToolArgs: () => ({
    // Missing required fields
    invalidField: 'should-not-exist',
    malformedData: { incomplete: true },
  }),

  /**
   * Generate arguments with sensitive data for sanitization testing
   */
  sensitiveArgs: () => ({
    username: 'testuser',
    password: 'secret123',
    apiKey: 'key-abc123',
    auth_token: 'token-xyz789',
    secretValue: 'confidential',
    normalData: 'public-info',
    settings: { theme: 'dark', publicSetting: 'value' },
  }),

  /**
   * Generate complex nested schema for validation testing
   */
  complexSchema: () =>
    z.object({
      user: z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(50),
        email: z.string().email(),
        age: z.number().int().min(0).max(120).optional(),
      }),
      action: z.enum(['create', 'update', 'delete']),
      metadata: z.record(z.unknown()).optional(),
      timestamp: z.string().datetime().default(() => new Date().toISOString()),
      tags: z.array(z.string()).default([]),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
    }),

  /**
   * Generate valid data for complex schema
   */
  complexValidData: () => ({
    user: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test User',
      email: 'test@example.com',
      age: 30,
    },
    action: 'create' as const,
    metadata: {
      source: 'test',
      version: '1.0',
    },
    tags: ['test', 'validation'],
  }),

  /**
   * Generate tool definition for testing
   */
  toolDefinition: (name: string, overrides: Partial<ToolDefinition<any>> = {}) => ({
    title: `Test ${name}`,
    description: `Test tool: ${name}`,
    category: 'testing' as PluginCategory,
    tags: ['test', 'mock'],
    inputSchema: {
      message: z.string().describe('Test message'),
      ...overrides.inputSchema,
    },
    ...overrides,
  } as ToolDefinition<any>),

  /**
   * Generate performance test data
   */
  performanceTestData: (size: number = 100) => ({
    items: Array.from({ length: size }, (_, i) => ({
      id: `item-${i}`,
      data: `data-${i}`.repeat(10), // Moderate size to test performance
      nested: {
        value: i,
        timestamp: new Date().toISOString(),
      },
    })),
  }),

  /**
   * Generate user context variations for testing
   */
  userContextVariations: () => [
    // Standard format
    { userId: 'user-123', requestId: 'req-456', clientId: 'client-789' },
    // Snake case format
    { user_id: 'user-snake', request_id: 'req-snake' },
    // Mixed format
    { userId: 'user-mixed', request_id: 'req-mixed' },
    // Partial context
    { userId: 'user-partial' },
    // Empty context
    {},
    // Invalid types
    { userId: 123, requestId: null, clientId: undefined },
  ],
};

/**
 * Enhanced assertions for ToolBase testing
 */
export const ToolAssertions = {
  /**
   * Assert that a tool result has the expected structure
   */
  hasValidToolResult: (result: CallToolResult, expectedContent?: string) => {
    if (!hasTextContent(result)) {
      throw new Error('Tool result must have valid text content');
    }

    // After type guard, we know result.content[0] exists and has text property
    const firstContent = result.content[0]!; // Non-null assertion after type guard
    if (expectedContent && !firstContent.text.includes(expectedContent)) {
      throw new Error(
        `Expected content to include "${expectedContent}", got: ${firstContent.text}`,
      );
    }
  },

  /**
   * Assert that a tool result indicates an error
   */
  isErrorResult: (result: CallToolResult, expectedErrorText?: string) => {
    if (!result.isError) {
      throw new Error('Expected result to have isError: true');
    }

    if (!hasTextContent(result)) {
      throw new Error('Error result must have valid text content');
    }

    // After type guard, we know result.content[0] exists and has text property
    const firstContent = result.content[0]!; // Non-null assertion after type guard
    if (expectedErrorText && !firstContent.text.includes(expectedErrorText)) {
      throw new Error(`Expected error message to include "${expectedErrorText}"`);
    }
  },

  /**
   * Assert that a validation result succeeded
   */
  validationSucceeded: <T>(
    result: { success: boolean; data?: T; error?: string },
    expectedData?: Partial<T>,
  ) => {
    if (!result.success) {
      throw new Error(`Validation failed: ${result.error}`);
    }

    if (!result.data) {
      throw new Error('Validation result should have data when successful');
    }

    if (expectedData) {
      for (const [key, value] of Object.entries(expectedData)) {
        if ((result.data as any)[key] !== value) {
          throw new Error(`Expected data.${key} to be ${value}, got ${(result.data as any)[key]}`);
        }
      }
    }
  },

  /**
   * Assert that a validation result failed
   */
  validationFailed: (
    result: { success: boolean; data?: any; error?: string },
    expectedErrorFragment?: string,
  ) => {
    if (result.success) {
      throw new Error('Expected validation to fail, but it succeeded');
    }

    if (!result.error) {
      throw new Error('Failed validation result should have error message');
    }

    if (expectedErrorFragment && !result.error.includes(expectedErrorFragment)) {
      throw new Error(`Expected error to include "${expectedErrorFragment}", got: ${result.error}`);
    }
  },

  /**
   * Assert that logging calls include expected context
   */
  hasLoggingContext: (logger: SpyLogger, expectedContext: Record<string, any>) => {
    const allCalls = [
      ...logger.infoCalls,
      ...logger.warnCalls,
      ...logger.errorCalls,
      ...logger.debugCalls,
    ];

    if (allCalls.length === 0) {
      throw new Error('Expected at least one logging call');
    }

    const hasContextCall = allCalls.some((call) => {
      const data = call[1]; // Second argument is the data object
      if (!data) return false;

      return Object.entries(expectedContext).every(([key, value]) => data[key] === value);
    });

    if (!hasContextCall) {
      throw new Error(
        `No logging call found with expected context: ${JSON.stringify(expectedContext)}`,
      );
    }
  },

  /**
   * Assert that audit events were logged correctly
   */
  hasAuditEvents: (
    auditLogger: SpyAuditLogger,
    expectedEventType: string,
    expectedCount: number = 1,
  ) => {
    const matchingEvents = auditLogger.systemEvents.filter((event) =>
      event.event === expectedEventType
    );

    if (matchingEvents.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} audit events of type "${expectedEventType}", got ${matchingEvents.length}`,
      );
    }
  },

  /**
   * Assert tool execution performance
   */
  executionWithinTimeLimit: (result: { executionTime?: number }, maxMs: number) => {
    if (!result.executionTime) {
      throw new Error('Result should include executionTime');
    }

    if (result.executionTime > maxMs) {
      throw new Error(`Execution took ${result.executionTime}ms, expected under ${maxMs}ms`);
    }
  },
};

/**
 * Performance testing utilities
 */
export const PerformanceTestUtils = {
  /**
   * Measure execution time of an async function
   */
  measureAsync: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const startTime = performance.now();
    const result = await fn();
    const duration = performance.now() - startTime;
    return { result, duration };
  },

  /**
   * Run concurrent executions and measure performance
   */
  measureConcurrent: async <T>(fn: () => Promise<T>, count: number): Promise<{
    results: T[];
    totalDuration: number;
    averageDuration: number;
    maxDuration: number;
    minDuration: number;
  }> => {
    const startTime = performance.now();

    const promises = Array.from({ length: count }, async () => {
      const execStart = performance.now();
      const result = await fn();
      const execDuration = performance.now() - execStart;
      return { result, duration: execDuration };
    });

    const executions = await Promise.all(promises);
    const totalDuration = performance.now() - startTime;

    const durations = executions.map((e) => e.duration);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    return {
      results: executions.map((e) => e.result),
      totalDuration,
      averageDuration,
      maxDuration,
      minDuration,
    };
  },

  /**
   * Assert performance characteristics
   */
  assertPerformance: (metrics: {
    totalDuration?: number;
    averageDuration?: number;
    maxDuration?: number;
  }, limits: {
    maxTotal?: number;
    maxAverage?: number;
    maxSingle?: number;
  }) => {
    if (limits.maxTotal && metrics.totalDuration && metrics.totalDuration > limits.maxTotal) {
      throw new Error(
        `Total duration ${metrics.totalDuration}ms exceeded limit ${limits.maxTotal}ms`,
      );
    }

    if (
      limits.maxAverage && metrics.averageDuration && metrics.averageDuration > limits.maxAverage
    ) {
      throw new Error(
        `Average duration ${metrics.averageDuration}ms exceeded limit ${limits.maxAverage}ms`,
      );
    }

    if (limits.maxSingle && metrics.maxDuration && metrics.maxDuration > limits.maxSingle) {
      throw new Error(
        `Max single duration ${metrics.maxDuration}ms exceeded limit ${limits.maxSingle}ms`,
      );
    }
  },
};

/**
 * Mock factory for creating test-specific implementations
 */
export const MockFactory = {
  /**
   * Create a minimal tool definition for testing
   */
  createToolDefinition: (name: string, schema?: ZodSchema<any>): ToolDefinition<any> => ({
    title: `Mock ${name}`,
    description: `Mock tool for testing: ${name}`,
    category: 'testing',
    tags: ['mock', 'test'],
    inputSchema: schema || { message: z.string() },
  }),

  /**
   * Create a simple tool handler for testing
   */
  createToolHandler: (responseText: string = 'Mock response') => {
    return async (args: any): Promise<CallToolResult> => ({
      content: [{ type: 'text', text: `${responseText}: ${JSON.stringify(args)}` }],
    });
  },

  /**
   * Create a failing tool handler for error testing
   */
  createFailingHandler: (errorMessage: string = 'Mock error') => {
    return async (): Promise<never> => {
      throw new Error(errorMessage);
    };
  },
};

/**
 * Utilities for testing different error scenarios
 */
export const ErrorTestUtils = {
  /**
   * Generate different types of errors for testing error handling
   */
  errorTypes: {
    standardError: () => new Error('Standard test error'),
    stringError: () => 'String error message',
    objectError: () => ({ message: 'Object error', code: 'TEST_ERROR' }),
    nullError: () => null,
    undefinedError: () => undefined,
  },

  /**
   * Test that an async function handles all error types correctly
   */
  testErrorHandling: async <T>(
    testFn: (error: any) => Promise<T>,
    validator: (result: T, errorType: string) => void,
  ) => {
    for (const [errorType, errorGenerator] of Object.entries(ErrorTestUtils.errorTypes)) {
      const error = errorGenerator();
      const result = await testFn(error);
      validator(result, errorType);
    }
  },
};

/**
 * Test scenario generators for common ToolBase testing patterns
 */
export const TestScenarios = {
  /**
   * Generate validation test scenarios
   */
  validationScenarios: () => [
    {
      name: 'valid_simple_object',
      schema: z.object({ name: z.string(), value: z.number() }),
      input: { name: 'test', value: 42 },
      shouldSucceed: true,
    },
    {
      name: 'invalid_missing_required',
      schema: z.object({ required: z.string() }),
      input: {},
      shouldSucceed: false,
    },
    {
      name: 'valid_with_defaults',
      schema: z.object({ name: z.string(), priority: z.string().default('normal') }),
      input: { name: 'test' },
      shouldSucceed: true,
      expectedDefaults: { priority: 'normal' },
    },
    {
      name: 'invalid_wrong_type',
      schema: z.object({ count: z.number() }),
      input: { count: 'not-a-number' },
      shouldSucceed: false,
    },
    {
      name: 'valid_nested_object',
      schema: z.object({
        user: z.object({ id: z.string(), name: z.string() }),
        metadata: z.record(z.unknown()).optional(),
      }),
      input: {
        user: { id: '123', name: 'Test User' },
        metadata: { version: '1.0' },
      },
      shouldSucceed: true,
    },
  ],

  /**
   * Generate context extraction test scenarios
   */
  contextExtractionScenarios: () => [
    {
      name: 'standard_format',
      input: { userId: 'user1', requestId: 'req1', clientId: 'client1' },
      expected: { userId: 'user1', requestId: 'req1', clientId: 'client1' },
    },
    {
      name: 'snake_case_format',
      input: { user_id: 'user2', request_id: 'req2' },
      expected: { userId: 'user2', requestId: 'req2' },
    },
    {
      name: 'mixed_format',
      input: { userId: 'user3', request_id: 'req3' },
      expected: { userId: 'user3', requestId: 'req3' },
    },
    {
      name: 'partial_context',
      input: { userId: 'user4' },
      expected: { userId: 'user4' },
    },
    {
      name: 'empty_context',
      input: {},
      expected: {},
    },
  ],

  /**
   * Generate sanitization test scenarios
   */
  sanitizationScenarios: () => [
    {
      name: 'common_secrets',
      input: { password: 'secret', apiKey: 'key123', token: 'token456' },
      expected: { password: '[REDACTED]', apiKey: '[REDACTED]', token: '[REDACTED]' },
    },
    {
      name: 'mixed_case_secrets',
      input: { PASSWORD: 'secret', ApiKey: 'key123', Auth_Token: 'token456' },
      expected: { PASSWORD: '[REDACTED]', ApiKey: '[REDACTED]', Auth_Token: '[REDACTED]' },
    },
    {
      name: 'public_data_preserved',
      input: { name: 'John', email: 'john@example.com', settings: { theme: 'dark' } },
      expected: { name: 'John', email: 'john@example.com', settings: { theme: 'dark' } },
    },
  ],
};
