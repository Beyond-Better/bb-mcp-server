/**
 * Test Helpers for MCP Server Tests
 * Provides mock implementations and test utilities
 */

import { Logger } from '../../src/lib/utils/Logger.ts';
import { AuditLogger } from '../../src/lib/utils/AuditLogger.ts';
import { ConfigManager } from '../../src/lib/config/ConfigManager.ts';
import { ErrorHandler } from '../../src/lib/utils/ErrorHandler.ts';
import { WorkflowRegistry } from '../../src/lib/workflows/WorkflowRegistry.ts';
import { TransportManager } from '../../src/lib/transport/TransportManager.ts';
import { OAuthProvider } from '../../src/lib/auth/OAuthProvider.ts';
import { BeyondMcpServer } from '../../src/lib/server/BeyondMcpServer.ts';

// Import types
import type {
  AuditEvent,
  BeyondMcpRequestContext,
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
  LogLevel,
} from '../../src/lib/types/BeyondMcpTypes.ts';
import { ToolRegistry } from '../../src/lib/tools/ToolRegistry.ts';

/**
 * Create mock logger for testing
 * Returns SpyLogger for access to test-specific methods like debugCalls, infoCalls, etc.
 */
export function createMockLogger(): SpyLogger {
  return new SpyLogger();
}

/**
 * Create mock audit logger for testing
 * Returns SpyAuditLogger for access to test-specific methods like getApiCallCount, getAuthEventsByType, etc.
 */
export function createMockAuditLogger(): SpyAuditLogger {
  return new SpyAuditLogger();
}

/**
 * Create mock config manager for testing
 */
export function createMockConfigManager(): ConfigManager {
  // Create a real ConfigManager instance for testing
  const config = new ConfigManager();
  // Override methods with spy behavior if needed
  return config;
}

/**
 * Create mock error handler for testing
 */
export function createMockErrorHandler(): ErrorHandler {
  return {
    wrapError: (error: any, code?: string, context?: any) => {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      if (code) {
        wrappedError.message = `${code}: ${wrappedError.message}`;
      }
      return wrappedError;
    },
    handleError: () => {},
    isRecoverableError: () => false,
  } as ErrorHandler;
}

/**
 * Create real workflow registry for testing
 */
export function createMockWorkflowRegistry(): WorkflowRegistry {
  // Create real WorkflowRegistry instance for testing
  return WorkflowRegistry.getInstance({
    logger: createMockLogger(),
    errorHandler: createMockErrorHandler(),
  });
}

/**
 * Create real tool registry for testing
 */
export function createMockToolRegistry(): ToolRegistry {
  // Create real ToolRegistry instance for testing
  return new ToolRegistry({
    logger: createMockLogger(),
    errorHandler: createMockErrorHandler(),
  });
}

/**
 * Create mock transport manager for testing
 */
export function createMockTransportManager(): TransportManager {
  // Use type casting to create TransportManager mock for unit tests
  return {
    start: async () => {},
    cleanup: async () => {},
    initialize: async () => {},
    getTransportType: () => 'stdio' as const,
    isInitialized: () => true,
    getCurrentTransport: () => null,
  } as unknown as TransportManager;
}

/**
 * Create mock OAuth provider for testing
 */
export function createMockOAuthProvider(): OAuthProvider {
  // Use type casting to create OAuthProvider mock
  return {
    handleAuthorizationRequest: async () => ({ success: true, authorizationCode: 'test-code' }),
    handleTokenRequest: async () => ({ accessToken: 'test-token', tokenType: 'Bearer' }),
    handleRefreshRequest: async () => ({ accessToken: 'new-test-token', tokenType: 'Bearer' }),
    validateClient: async () => ({ valid: true }),
    revokeToken: async () => {},
    introspectToken: async () => ({ active: true }),
  } as unknown as OAuthProvider;
}

/**
 * Create mock MCP server instance for testing
 */
export function createMockSdkMcpServer(config: BeyondMcpServerConfig): MockSdkMcpServer {
  return new MockSdkMcpServer(
    {
      name: config.server.name,
      version: config.server.version,
      title: config.server.title || config.server.name,
      description: config.server.description,
    },
    {
      capabilities: config.capabilities || { tools: {}, logging: {} },
      instructions: config.mcpServerInstructions,
    },
  );
}

/**
 * Create complete mock dependencies for MCP server testing
 */
export function createMockBeyondMcpServerDependencies(): BeyondMcpServerDependencies {
  return {
    logger: createMockLogger(),
    auditLogger: createMockAuditLogger(),
    configManager: createMockConfigManager(),
    errorHandler: createMockErrorHandler(),
    toolRegistry: createMockToolRegistry(),
    workflowRegistry: createMockWorkflowRegistry(),
    transportManager: createMockTransportManager(),
    oauthProvider: createMockOAuthProvider(),
  };
}

/**
 * Create test MCP server configuration
 */
export function createTestBeyondMcpServerConfig(
  overrides: Partial<BeyondMcpServerConfig> = {},
): BeyondMcpServerConfig {
  const config: BeyondMcpServerConfig = {
    server: {
      name: 'test-mcp-server',
      version: '1.0.0',
      description: 'Test MCP Server',
      ...overrides.server,
    },
    transport: {
      type: 'stdio',
      ...overrides.transport,
    },
    capabilities: {
      tools: {},
      logging: {},
      ...overrides.capabilities,
    },
  };

  // Only add instructions if they exist (exactOptionalPropertyTypes compliance)
  if (overrides.mcpServerInstructions !== undefined) {
    config.mcpServerInstructions = overrides.mcpServerInstructions;
  }

  return config;
}

/**
 * Create test request context
 */
export function createTestRequestContext(
  overrides: Partial<BeyondMcpRequestContext> = {},
): BeyondMcpRequestContext {
  return {
    authenticatedUserId: 'test-user',
    clientId: 'test-client',
    scopes: ['read', 'write'],
    requestId: 'test-request',
    startTime: performance.now(),
    metadata: {},
    ...overrides,
  };
}

/**
 * Mock MCP Server for testing
 * Comprehensive mock that satisfies McpServer interface
 */
export class MockSdkMcpServer {
  public name: string;
  public version: string;
  public title?: string;
  public description: string;
  public capabilities: any;
  public instructions?: string;

  // MCP SDK required properties
  public _registeredResources: Map<string, any> = new Map();
  public _registeredResourceTemplates: Map<string, any> = new Map();
  public _registeredTools: Map<string, any> = new Map<string, any>();
  public _registeredPrompts: Map<string, any> = new Map();
  public _handlerMap: Map<string, any> = new Map();
  public _onRequest: any;
  public _onNotification: any;
  public _onOpen: any;
  public _onClose: any;
  public _onError: any;
  public _requestHandlers: Map<string, any> = new Map();
  public _notificationHandlers: Map<string, any> = new Map();
  public _transport: any = null;
  public _isConnected = false;

  constructor(info: any, options: any) {
    this.name = info.name;
    this.version = info.version;
    this.title = info.title;
    this.description = info.description;
    this.capabilities = options.capabilities;
    this.instructions = options.instructions;
  }

  registerTool(name: string, definition: any, handler: any) {
    this._registeredTools.set(name, { name, definition, handler });
  }

  getRegisteredTool(name: string): { name: string; definition: any; handler: any } | undefined {
    return this._registeredTools.get(name);
  }

  getRegisteredTools(): Array<{ name: string; definition: any; handler: any }> {
    return Array.from(this._registeredTools.values());
  }

  clearTools() {
    this._registeredTools.clear();
  }

  // Additional MCP SDK required methods
  registerPrompt(name: string, definition: any, handler: any) {
    this._registeredPrompts.set(name, { name, definition, handler });
  }

  registerResource(name: string, definition: any, handler: any) {
    this._registeredResources.set(name, { name, definition, handler });
  }

  registerResourceTemplate(name: string, definition: any, handler: any) {
    this._registeredResourceTemplates.set(name, { name, definition, handler });
  }

  setRequestHandler(method: string, handler: any) {
    this._requestHandlers.set(method, handler);
  }

  setNotificationHandler(method: string, handler: any) {
    this._notificationHandlers.set(method, handler);
  }

  request(params: any): Promise<{ result: string }> {
    return Promise.resolve({ result: 'mock-response' });
  }

  notification(params: any): Promise<void> {
    return Promise.resolve();
  }

  onRequest(handler: any) {
    this._onRequest = handler;
  }

  onNotification(handler: any) {
    this._onNotification = handler;
  }

  onOpen(handler: any) {
    this._onOpen = handler;
  }

  onClose(handler: any) {
    this._onClose = handler;
  }

  onError(handler: any) {
    this._onError = handler;
  }

  // Mock server for MCP SDK integration

  server = {
    createMessage: async (request: any): Promise<{
      content: Array<{ type: string; text: string }>;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
    }> => {
      if (!this._isConnected) {
        throw new Error('Not connected');
      }
      return {
        content: [{
          type: 'text',
          text: `Mock response to: ${request.messages[0]?.content?.text || 'unknown'}`,
        }],
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 15 },
      };
    },
    elicitInput: async (request: any): Promise<{
      action: 'accept';
      content: { mockResponse: boolean; message: any };
    }> => {
      if (!this._isConnected) {
        throw new Error('Not connected');
      }
      return {
        action: 'accept' as const,
        content: { mockResponse: true, message: request.message },
      };
    },
  };

  // Mock connection methods
  async connect() {
    // Mock STDIO transport connection - enables server methods after connection
    this._isConnected = true;
  }

  async close() {
    // Mock server shutdown - disables server methods
    this._isConnected = false;
  }
}

/**
 * Create spy logger that captures log calls for verification
 */
export class SpyLogger extends Logger {
  public debugCalls: any[][] = [];
  public infoCalls: any[][] = [];
  public warnCalls: any[][] = [];
  public errorCalls: any[][] = [];
  public logCalls: any[][] = [];

  constructor() {
    // Initialize with silent configuration for testing
    super({ level: 'debug', format: 'json', colorize: false });
  }

  override debug(message: string, data?: unknown): void {
    this.debugCalls.push([message, data]);
    // Don't call super to avoid console output during tests
  }

  override info(message: string, data?: unknown): void {
    this.infoCalls.push([message, data]);
    // Don't call super to avoid console output during tests
  }

  override warn(message: string, data?: unknown): void {
    this.warnCalls.push([message, data]);
    // Don't call super to avoid console output during tests
  }

  override error(message: string, error?: Error, data?: unknown): void {
    this.errorCalls.push([message, error, data]);
    // Don't call super to avoid console output during tests
  }

  // Add a log method that's not in the base Logger class
  log(level: LogLevel, message: string, ...args: any[]) {
    this.logCalls.push([level, message, ...args]);
  }

  reset() {
    this.debugCalls = [];
    this.infoCalls = [];
    this.warnCalls = [];
    this.errorCalls = [];
    this.logCalls = [];
  }

  getAllCalls(): {
    debug: any[][];
    info: any[][];
    warn: any[][];
    error: any[][];
    log: any[][];
  } {
    return {
      debug: this.debugCalls,
      info: this.infoCalls,
      warn: this.warnCalls,
      error: this.errorCalls,
      log: this.logCalls,
    };
  }
}

/**
 * Create spy audit logger that captures audit events
 */
export class SpyAuditLogger extends AuditLogger {
  public apiCalls: any[] = [];
  public authEvents: any[] = [];
  public workflowExecutions: any[] = [];
  public workflowOperations: any[] = [];
  public toolCalls: any[] = [];
  public systemEvents: AuditEvent[] = [];
  public customEvents: any[] = [];

  constructor() {
    // Initialize with disabled configuration for testing
    super(
      {
        enabled: false,
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
      new SpyLogger(),
    );
  }

  override async logApiCall(entry: any) {
    this.apiCalls.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  override async logAuthEvent(entry: any) {
    this.authEvents.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  override async logWorkflowExecution(entry: any) {
    this.workflowExecutions.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  override async logWorkflowOperation(entry: any) {
    this.workflowOperations.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  override async logToolCall(entry: any) {
    this.toolCalls.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  override async logSystemEvent(event: Omit<AuditEvent, 'timestamp'>) {
    this.systemEvents.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  override async logCustomEvent(type: string, entry: any) {
    this.customEvents.push({
      type,
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }

  reset() {
    this.apiCalls = [];
    this.authEvents = [];
    this.workflowExecutions = [];
    this.workflowOperations = [];
    this.toolCalls = [];
    this.systemEvents = [];
    this.customEvents = [];
  }

  getAllEvents(): {
    api: any[];
    auth: any[];
    workflowExecutions: any[];
    workflowOperations: any[];
    tools: any[];
    system: AuditEvent[];
    custom: any[];
  } {
    return {
      api: this.apiCalls,
      auth: this.authEvents,
      workflowExecutions: this.workflowExecutions,
      workflowOperations: this.workflowOperations,
      tools: this.toolCalls,
      system: this.systemEvents,
      custom: this.customEvents,
    };
  }

  // Helper methods for test assertions
  getApiCallCount(): number {
    return this.apiCalls.length;
  }

  getAuthEventCount(): number {
    return this.authEvents.length;
  }

  getWorkflowExecutionCount(): number {
    return this.workflowExecutions.length;
  }

  getWorkflowOperationCount(): number {
    return this.workflowOperations.length;
  }

  getToolCallCount(): number {
    return this.toolCalls.length;
  }

  getSystemEventCount(): number {
    return this.systemEvents.length;
  }

  getCustomEventCount(): number {
    return this.customEvents.length;
  }

  // Get specific events by filter
  getApiCallsByEndpoint(endpoint: string): any[] {
    return this.apiCalls.filter((call) => call.endpoint === endpoint);
  }

  getAuthEventsByType(eventType: string): any[] {
    return this.authEvents.filter((event) => event.event === eventType);
  }

  getToolCallsByName(toolName: string): any[] {
    return this.toolCalls.filter((call) => call.toolName === toolName);
  }

  getWorkflowExecutionsByName(workflowName: string): any[] {
    return this.workflowExecutions.filter((exec) => exec.workflowName === workflowName);
  }

  getWorkflowOperationsByName(workflowName: string, operation?: string): any[] {
    let filtered = this.workflowOperations.filter((op) => op.workflowName === workflowName);
    if (operation) {
      filtered = filtered.filter((op) => op.operation === operation);
    }
    return filtered;
  }

  // Get failed events
  getFailedApiCalls(): any[] {
    return this.apiCalls.filter((call) => !call.success || call.statusCode >= 400);
  }

  getFailedAuthEvents(): any[] {
    return this.authEvents.filter((event) => !event.success);
  }

  getFailedWorkflowExecutions(): any[] {
    return this.workflowExecutions.filter((exec) => !exec.success);
  }

  getFailedWorkflowOperations(): any[] {
    return this.workflowOperations.filter((op) => !op.success);
  }

  getFailedToolCalls(): any[] {
    return this.toolCalls.filter((call) => !call.success);
  }
}

/**
 * Async test helper - wait for a condition to be met
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 10,
): Promise<void> {
  const startTime = performance.now();

  while (!condition() && performance.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  if (!condition()) {
    throw new Error(`Condition not met within ${timeout}ms`);
  }
}

/**
 * Create a promise that resolves after specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate unique test IDs
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Assert that an async function throws an error
 */
export async function assertAsyncThrows(
  fn: () => Promise<any>,
  expectedErrorMessage?: string,
): Promise<Error> {
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  if (!error) {
    throw new Error('Expected function to throw an error, but it did not');
  }

  if (expectedErrorMessage && !error.message.includes(expectedErrorMessage)) {
    throw new Error(
      `Expected error message to contain "${expectedErrorMessage}", but got: "${error.message}"`,
    );
  }

  return error;
}

/**
 * Create a test timeout that fails the test if it takes too long
 */
export function createTestTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Test timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Test BeyondMcpServer that extends the real class for comprehensive testing
 * This replaces the incomplete TestBeyondMcpServer from HttpTransport.test.ts
 */
export class TestBeyondMcpServer extends BeyondMcpServer {
  constructor(
    config?: Partial<BeyondMcpServerConfig>,
    dependencies?: Partial<BeyondMcpServerDependencies>,
  ) {
    const fullConfig = {
      ...createTestBeyondMcpServerConfig(),
      ...config,
    };

    const fullDependencies = {
      ...createMockBeyondMcpServerDependencies(),
      ...dependencies,
    };

    super(fullConfig, fullDependencies);
  }

  override async initialize(): Promise<TestBeyondMcpServer> {
    await super.initialize();
    return this;
  }

  // Helper methods for testing
  getToolRegistry(): ToolRegistry {
    return this['toolRegistry'];
  }

  getWorkflowRegistry(): WorkflowRegistry {
    return this['workflowRegistry'];
  }

  getCurrentAuthContext(): BeyondMcpRequestContext | null {
    return this['getAuthContext']();
  }
}

/**
 * Create a test BeyondMcpServer instance ready for testing
 */
export async function createTestBeyondMcpServer(
  config?: Partial<BeyondMcpServerConfig>,
  dependencies?: Partial<BeyondMcpServerDependencies>,
): Promise<TestBeyondMcpServer> {
  const server = new TestBeyondMcpServer(config, dependencies);
  await server.initialize();
  return server;
}

/**
 * Test data generators
 */
export const TestData = {
  /**
   * Generate test tool definition
   */
  toolDefinition: (name: string, overrides: any = {}): {
    title: string;
    description: string;
    category: string;
    tags: string[];
    inputSchema: { message: { type: string } };
    [key: string]: any;
  } => ({
    title: `Test ${name}`,
    description: `Test tool: ${name}`,
    category: 'testing',
    tags: ['test'],
    inputSchema: {
      message: { type: 'string' },
    },
    ...overrides,
  }),

  /**
   * Generate test request context
   */
  requestContext: (overrides: Partial<BeyondMcpRequestContext> = {}): BeyondMcpRequestContext => ({
    authenticatedUserId: 'test-user-' + Math.random().toString(36).substr(2, 8),
    clientId: 'test-client-' + Math.random().toString(36).substr(2, 8),
    scopes: ['read', 'write'],
    requestId: 'test-request-' + Math.random().toString(36).substr(2, 8),
    startTime: performance.now(),
    metadata: {},
    ...overrides,
  }),

  /**
   * Generate test MCP server config
   */
  mcpServerConfig: (
    overrides: Partial<BeyondMcpServerConfig> = {},
  ): Partial<BeyondMcpServerConfig> => ({
    server: {
      name: 'test-server-' + Math.random().toString(36).substr(2, 8),
      version: '1.0.0',
      description: 'Generated test server',
    },
    transport: { type: 'stdio' as const },
    ...overrides,
  }),
};

/**
 * Test assertion helpers
 */
export const TestAssertions = {
  /**
   * Assert that a value is defined (not null or undefined)
   */
  isDefined: <T>(value: T | null | undefined, message?: string): T => {
    if (value == null) {
      throw new Error(message || `Expected value to be defined, got ${value}`);
    }
    return value;
  },

  /**
   * Assert that an array contains specific values
   */
  arrayContains: <T>(array: T[], values: T[], message?: string): void => {
    const missing = values.filter((value) => !array.includes(value));
    if (missing.length > 0) {
      throw new Error(
        message || `Array missing expected values: ${missing.join(', ')}`,
      );
    }
  },

  /**
   * Assert that an object has specific properties
   */
  hasProperties: (obj: any, properties: string[], message?: string): void => {
    const missing = properties.filter((prop) => !(prop in obj));
    if (missing.length > 0) {
      throw new Error(
        message || `Object missing expected properties: ${missing.join(', ')}`,
      );
    }
  },

  /**
   * Assert that two objects are deep equal
   */
  deepEqual: (actual: any, expected: any, message?: string): void => {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);

    if (actualStr !== expectedStr) {
      throw new Error(
        message || `Objects not equal:\nActual: ${actualStr}\nExpected: ${expectedStr}`,
      );
    }
  },
};
