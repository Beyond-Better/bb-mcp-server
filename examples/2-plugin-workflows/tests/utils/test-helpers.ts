/**
 * Test Helpers for Simple MCP Server Example
 * 
 * This file provides reusable test utilities and mock objects
 * that demonstrate testing patterns for MCP servers.
 * 
 * LEARNING FOCUS:
 * ===============
 * 
 * Shows users how to:
 * 1. Create mock objects for testing isolation
 * 2. Implement spy functions for behavior verification
 * 3. Set up reusable test fixtures
 * 4. Create realistic test environments
 * 5. Mock external dependencies
 * 
 * PATTERNS DEMONSTRATED:
 * =====================
 * 
 * Based on patterns from library's test-helpers.ts:
 * - Mock logger with spy functionality
 * - Mock tool registry for isolated testing
 * - Mock MCP server components
 * - Helper functions for common test scenarios
 * - Reusable test fixtures and data
 */

import { assertEquals, assertExists } from '@std/assert';

/**
 * Mock Logger Implementation
 * 
 * Provides a logger that captures all log calls for verification
 * while maintaining the same interface as the real logger.
 */
export class SpyLogger {
  public infoCalls: Array<[string, any?]> = [];
  public warnCalls: Array<[string, any?]> = [];
  public errorCalls: Array<[string, Error | undefined, any?]> = [];
  public debugCalls: Array<[string, any?]> = [];
  
  info(message: string, data?: any): void {
    this.infoCalls.push([message, data]);
  }
  
  warn(message: string, data?: any): void {
    this.warnCalls.push([message, data]);
  }
  
  error(message: string, error?: Error, data?: any): void {
    this.errorCalls.push([message, error, data]);
  }
  
  debug(message: string, data?: any): void {
    this.debugCalls.push([message, data]);
  }
  
  // Additional methods that real Logger might have
  dir(obj: any): void {
    this.debugCalls.push(['dir', obj]);
  }
  
  child(): SpyLogger {
    return new SpyLogger();
  }
  
  // Properties that real Logger has
  currentLogLevel = 'info';
  config = { level: 'info', format: 'text' };
  
  shouldLog(): boolean {
    return true;
  }
  
  formatMessage(): string {
    return '';
  }
  
  colorMessage(): string {
    return '';
  }
  
  writeToOutput(): void {
    // Mock implementation
  }
  
  // Test helper methods
  clear(): void {
    this.infoCalls = [];
    this.warnCalls = [];
    this.errorCalls = [];
    this.debugCalls = [];
  }
  
  getAllCalls(): Array<[string, string, any?]> {
    return [
      ...this.infoCalls.map(([msg, data]) => ['info', msg, data] as [string, string, any]),
      ...this.warnCalls.map(([msg, data]) => ['warn', msg, data] as [string, string, any]),
      ...this.errorCalls.map(([msg, error, data]) => ['error', msg, { error, data }] as [string, string, any]),
      ...this.debugCalls.map(([msg, data]) => ['debug', msg, data] as [string, string, any]),
    ];
  }
  
  getCallCount(): number {
    return this.infoCalls.length + this.warnCalls.length + this.errorCalls.length + this.debugCalls.length;
  }
  
  hasErrorCalls(): boolean {
    return this.errorCalls.length > 0;
  }
  
  hasLogLevel(level: string): boolean {
    switch (level) {
      case 'info': return this.infoCalls.length > 0;
      case 'warn': return this.warnCalls.length > 0;
      case 'error': return this.errorCalls.length > 0;
      case 'debug': return this.debugCalls.length > 0;
      default: return false;
    }
  }
}

/**
 * Mock Tool Registry Implementation
 * 
 * Provides a registry that captures tool registrations for testing
 * while maintaining the same interface as the real ToolRegistry.
 */
export class MockToolRegistry {
  private tools = new Map<string, any>();
  
  registerTool(name: string, definition: any, handler: Function): void {
    this.tools.set(name, {
      name,
      definition,
      handler,
      registered_at: new Date().toISOString(),
    });
  }
  
  getRegisteredTool(name: string): any | undefined {
    return this.tools.get(name);
  }
  
  hasRegisteredTool(name: string): boolean {
    return this.tools.has(name);
  }
  
  getRegisteredToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
  
  getRegisteredToolCount(): number {
    return this.tools.size;
  }
  
  getAllRegisteredTools(): Array<{ name: string; definition: any; handler: Function }> {
    return Array.from(this.tools.values());
  }
  
  clear(): void {
    this.tools.clear();
  }
  
  // Mock additional methods that real ToolRegistry might have
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }
  
  // Test verification helpers
  verifyToolRegistered(name: string, expectedDefinition?: Partial<any>): void {
    const tool = this.getRegisteredTool(name);
    assertExists(tool, `Tool '${name}' should be registered`);
    
    if (expectedDefinition) {
      if (expectedDefinition.title) {
        assertEquals(tool.definition.title, expectedDefinition.title);
      }
      if (expectedDefinition.category) {
        assertEquals(tool.definition.category, expectedDefinition.category);
      }
      if (expectedDefinition.tags) {
        for (const tag of expectedDefinition.tags) {
          assertExists(tool.definition.tags.includes(tag), `Tool should have tag '${tag}'`);
        }
      }
    }
  }
  
  verifyToolCount(expectedCount: number): void {
    assertEquals(this.getRegisteredToolCount(), expectedCount, 
      `Expected ${expectedCount} tools, but found ${this.getRegisteredToolCount()}`);
  }
}

/**
 * Mock Audit Logger Implementation
 * 
 * Provides audit logging functionality for testing.
 */
export class SpyAuditLogger {
  public systemEvents: Array<any> = [];
  public toolExecutions: Array<any> = [];
  public apiCalls: Array<any> = [];
  
  logSystemEvent(event: string, severity: string, details: any): void {
    this.systemEvents.push({
      event,
      severity,
      details,
      timestamp: new Date().toISOString(),
    });
  }
  
  logToolExecution(toolName: string, result: string, details: any): void {
    this.toolExecutions.push({
      tool: toolName,
      result,
      details,
      timestamp: new Date().toISOString(),
    });
  }
  
  logApiCall(method: string, endpoint: string, status: number, details?: any): void {
    this.apiCalls.push({
      method,
      endpoint,
      status,
      details,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Test helper methods
  clear(): void {
    this.systemEvents = [];
    this.toolExecutions = [];
    this.apiCalls = [];
  }
  
  getEventCount(): number {
    return this.systemEvents.length + this.toolExecutions.length + this.apiCalls.length;
  }
  
  hasSystemEvent(event: string): boolean {
    return this.systemEvents.some(e => e.event === event);
  }
  
  hasToolExecution(toolName: string): boolean {
    return this.toolExecutions.some(e => e.tool === toolName);
  }
  
  hasApiCall(method: string, endpoint: string): boolean {
    return this.apiCalls.some(e => e.method === method && e.endpoint === endpoint);
  }
}

/**
 * Helper Functions for Creating Mock Objects
 * 
 * These factory functions create properly configured mock objects
 * for common testing scenarios.
 */

/**
 * Create a mock logger with spy functionality
 */
export function createMockLogger(): SpyLogger {
  return new SpyLogger();
}

/**
 * Create a mock tool registry for isolated testing
 */
export function createMockToolRegistry(): MockToolRegistry {
  return new MockToolRegistry();
}

/**
 * Create a mock audit logger with spy functionality
 */
export function createMockAuditLogger(): SpyAuditLogger {
  return new SpyAuditLogger();
}

/**
 * Create a complete mock context for tool testing
 */
export function createMockToolContext(overrides: any = {}): any {
  return {
    userId: 'test-user',
    requestId: 'test-request-123',
    clientId: 'test-client',
    startTime: new Date(),
    logger: createMockLogger(),
    auditLogger: createMockAuditLogger(),
    ...overrides,
  };
}

/**
 * Create a test context for workflow testing
 */
export function createTestContext(overrides: any = {}): any {
  return {
    userId: 'test-user',
    requestId: 'test-request-123',
    clientId: 'test-client',
    startTime: new Date(),
    logger: createMockLogger(),
    auditLogger: createMockAuditLogger(),
    sessionId: 'test-session-456',
    workflowId: 'test-workflow-789',
    ...overrides,
  };
}

/**
 * Mock Configuration Manager
 * 
 * Provides configuration values for testing without requiring .env files.
 */
export class MockConfigManager {
  private config = new Map<string, any>();
  
  constructor(initialConfig: Record<string, any> = {}) {
    Object.entries(initialConfig).forEach(([key, value]) => {
      this.config.set(key, value);
    });
    
    // Set common test defaults
    this.setDefaults();
  }
  
  private setDefaults(): void {
    const defaults = {
      'LOG_LEVEL': 'debug',
      'LOG_FORMAT': 'text',
      'MCP_TRANSPORT': 'stdio',
      'PLUGINS_DISCOVERY_PATHS': './src/plugins',
      'PLUGINS_AUTOLOAD': 'true',
      'DENO_KV_PATH': ':memory:', // In-memory database for tests
      'DEV_MODE': 'true',
    };
    
    Object.entries(defaults).forEach(([key, value]) => {
      if (!this.config.has(key)) {
        this.config.set(key, value);
      }
    });
  }
  
  get(key: string, defaultValue?: any): any {
    return this.config.get(key) ?? defaultValue;
  }
  
  set(key: string, value: any): void {
    this.config.set(key, value);
  }
  
  has(key: string): boolean {
    return this.config.has(key);
  }
  
  getRequired(key: string): any {
    const value = this.config.get(key);
    if (value === undefined) {
      throw new Error(`Required configuration key '${key}' not found`);
    }
    return value;
  }
  
  // Test helper methods
  clear(): void {
    this.config.clear();
    this.setDefaults();
  }
  
  setTestConfig(testConfig: Record<string, any>): void {
    Object.entries(testConfig).forEach(([key, value]) => {
      this.config.set(key, value);
    });
  }
}

/**
 * Create a mock configuration manager with test-friendly defaults
 */
export function createMockConfigManager(config: Record<string, any> = {}): MockConfigManager {
  return new MockConfigManager(config);
}

/**
 * Test Data Generators
 * 
 * Functions that generate realistic test data for various scenarios.
 */

/**
 * Generate test parameters for current_datetime tool
 */
export function generateDateTimeTestParams(): Array<{
  name: string;
  params: any;
  expectedFormat: string;
}> {
  return [
    {
      name: 'default parameters',
      params: {},
      expectedFormat: 'iso',
    },
    {
      name: 'ISO format with timezone',
      params: { format: 'iso', timezone: 'UTC' },
      expectedFormat: 'iso',
    },
    {
      name: 'human readable format',
      params: { format: 'human' },
      expectedFormat: 'human',
    },
    {
      name: 'unix timestamp',
      params: { format: 'unix' },
      expectedFormat: 'unix',
    },
    {
      name: 'custom format',
      params: { format: 'custom', customFormat: 'YYYY-MM-DD' },
      expectedFormat: 'custom',
    },
  ];
}

/**
 * Generate test parameters for system_info tool
 */
export function generateSystemInfoTestParams(): Array<{
  name: string;
  params: any;
  expectedFields: string[];
}> {
  return [
    {
      name: 'basic system info',
      params: {},
      expectedFields: ['runtime', 'system', 'process', 'timestamp'],
    },
    {
      name: 'detailed with memory',
      params: { detail: 'detailed', includeMemory: true },
      expectedFields: ['runtime', 'system', 'process', 'memory', 'detailed'],
    },
    {
      name: 'with environment variables',
      params: { includeEnvironment: true },
      expectedFields: ['runtime', 'system', 'process', 'environment'],
    },
  ];
}

/**
 * Generate test parameters for JSON validation tool
 */
export function generateJsonValidationTestParams(): Array<{
  name: string;
  params: any;
  expectValid: boolean;
}> {
  return [
    {
      name: 'valid simple JSON',
      params: { json_string: '{"test": true}' },
      expectValid: true,
    },
    {
      name: 'valid complex JSON',
      params: { json_string: '{"user": {"name": "test", "items": [1,2,3]}}' },
      expectValid: true,
    },
    {
      name: 'invalid JSON syntax',
      params: { json_string: '{invalid}' },
      expectValid: false,
    },
    {
      name: 'empty JSON object',
      params: { json_string: '{}' },
      expectValid: true,
    },
    {
      name: 'JSON array',
      params: { json_string: '[1, 2, 3]' },
      expectValid: true,
    },
  ];
}

/**
 * Assertion Helpers
 * 
 * Custom assertion functions for common test scenarios.
 */

/**
 * Assert that a tool response has the correct MCP structure
 */
export function assertValidMcpResponse(response: any, toolName?: string): void {
  assertExists(response, 'Response should exist');
  assertExists(response.content, 'Response should have content');
  assertEquals(Array.isArray(response.content), true, 'Content should be an array');
  assertEquals(response.content.length > 0, true, 'Content should not be empty');
  assertEquals(response.content[0].type, 'text', 'Content type should be text');
  assertExists(response.content[0].text, 'Content should have text');
  
  if (toolName) {
    assertExists(response.metadata, 'Response should have metadata');
    assertEquals(response.metadata.tool, toolName, `Metadata should identify tool as ${toolName}`);
  }
}

/**
 * Assert that a response contains valid JSON data
 */
export function assertValidJsonResponse(response: any): any {
  assertValidMcpResponse(response);
  
  let parsedData;
  try {
    parsedData = JSON.parse(response.content[0].text);
  } catch (error) {
    throw new Error(`Response content is not valid JSON: ${error}`);
  }
  
  return parsedData;
}

/**
 * Assert that a response indicates an error condition
 */
export function assertErrorResponse(response: any, expectedErrorText?: string): void {
  assertEquals(response.isError, true, 'Response should indicate error');
  assertExists(response.content, 'Error response should have content');
  
  if (expectedErrorText) {
    const responseText = response.content[0].text;
    assertEquals(responseText.includes(expectedErrorText), true, 
      `Error response should contain '${expectedErrorText}', but got: ${responseText}`);
  }
}

/**
 * Performance Testing Helpers
 * 
 * Utilities for testing performance characteristics of tools.
 */

/**
 * Measure execution time of an async function
 */
export async function measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  return { result, duration };
}

/**
 * Assert that a function executes within a time limit
 */
export async function assertExecutionTime<T>(
  fn: () => Promise<T>, 
  maxDuration: number, 
  description: string = 'Function'
): Promise<T> {
  const { result, duration } = await measureExecutionTime(fn);
  
  assertEquals(duration <= maxDuration, true, 
    `${description} should execute in under ${maxDuration}ms, but took ${duration.toFixed(2)}ms`);
  
  return result;
}

/**
 * EDUCATIONAL SUMMARY
 * ===================
 * 
 * This test helpers file demonstrates essential patterns for MCP testing:
 * 
 * 1. 🔍 MOCK OBJECTS:
 *    - SpyLogger: Captures log calls for verification
 *    - MockToolRegistry: Simulates tool registration
 *    - MockConfigManager: Provides test configuration
 *    - SpyAuditLogger: Tracks audit events
 * 
 * 2. 🎭 TEST FIXTURES:
 *    - Parameterized test data generators
 *    - Realistic test scenarios
 *    - Common configuration setups
 *    - Reusable mock contexts
 * 
 * 3. ✅ ASSERTION HELPERS:
 *    - MCP response validation
 *    - JSON response verification
 *    - Error response checking
 *    - Performance testing utilities
 * 
 * 4. 🚀 PERFORMANCE TESTING:
 *    - Execution time measurement
 *    - Performance assertion helpers
 *    - Benchmark comparison utilities
 * 
 * KEY BENEFITS:
 * =============
 * 
 * - **Isolation**: Tests run independently without side effects
 * - **Verification**: Spy objects capture behavior for verification
 * - **Reusability**: Common test patterns are abstracted
 * - **Maintainability**: Test helpers reduce code duplication
 * - **Debugging**: Rich mock objects provide detailed test feedback
 * 
 * Users can extend these patterns for their own testing needs,
 * creating robust test suites for their MCP server implementations.
 */