/**
 * Test Helpers for Phase 6 MCP Server Tests
 * Provides mock implementations and test utilities
 */

import { Logger } from '../../src/lib/utils/Logger.ts';
import { AuditLogger } from '../../src/lib/utils/AuditLogger.ts';
import { ConfigManager } from '../../src/lib/config/ConfigManager.ts';
import { ErrorHandler } from '../../src/lib/utils/ErrorHandler.ts';
import { WorkflowRegistry } from '../../src/lib/workflows/WorkflowRegistry.ts';
import { TransportManager } from '../../src/lib/transport/TransportManager.ts';
import { OAuthProvider } from '../../src/lib/auth/OAuthProvider.ts';

// Import types
import type { 
  BeyondMcpServerConfig, 
  BeyondMcpServerDependencies, 
  BeyondMcpRequestContext,
  LogLevel,
  AuditEvent 
} from '../../src/lib/types/BeyondMcpTypes.ts';
import { ToolRegistry } from '../../src/lib/tools/ToolRegistry.ts';

/**
 * Create mock logger for testing
 */
export function createMockLogger(): Logger {
  return new SpyLogger();
}

/**
 * Create mock audit logger for testing
 */
export function createMockAuditLogger(): AuditLogger {
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
      instructions: config.instructions,
    }
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
export function createTestBeyondMcpServerConfig(overrides: Partial<BeyondMcpServerConfig> = {}): BeyondMcpServerConfig {
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
  if (overrides.instructions !== undefined) {
    config.instructions = overrides.instructions;
  }
  
  return config;
}

/**
 * Create test request context
 */
export function createTestRequestContext(overrides: Partial<BeyondMcpRequestContext> = {}): BeyondMcpRequestContext {
  return {
    authenticatedUserId: 'test-user',
    clientId: 'test-client',
    scopes: ['read', 'write'],
    requestId: 'test-request',
    startTime: Date.now(),
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
  public _registeredResources = new Map();
  public _registeredResourceTemplates = new Map();
  public _registeredTools = new Map<string, any>();
  public _registeredPrompts = new Map();
  public _handlerMap = new Map();
  public _onRequest: any;
  public _onNotification: any;
  public _onOpen: any;
  public _onClose: any;
  public _onError: any;
  public _requestHandlers = new Map();
  public _notificationHandlers = new Map();
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
  
  getRegisteredTool(name: string) {
    return this._registeredTools.get(name);
  }
  
  getRegisteredTools() {
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
  
  request(params: any) {
    return Promise.resolve({ result: 'mock-response' });
  }
  
  notification(params: any) {
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
    createMessage: async (request: any) => {
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
    elicitInput: async (request: any) => {
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
  
  getAllCalls() {
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
  public systemEvents: AuditEvent[] = [];
  public workflowOperations: any[] = [];
  public securityEvents: any[] = [];
  public performanceEvents: any[] = [];
  
  constructor() {
    // Initialize with disabled configuration for testing
    super(
      { enabled: false, logAllApiCalls: false },
      new SpyLogger()
    );
  }
  
  override async logSystemEvent(event: Omit<AuditEvent, 'timestamp'>) {
    this.systemEvents.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
    // Don't call super to avoid file operations during tests
  }
  
  override async logWorkflowOperation(operation: any) {
    this.workflowOperations.push(operation);
    // Don't call super to avoid file operations during tests
  }
  
  // Add method to match AuditLogger interface
  override async logAuthEvent(event: any) {
    this.securityEvents.push(event);
    // Don't call super to avoid file operations during tests
  }
  
  // Add method to match expected test usage
  async logSecurityEvent(event: any) {
    this.securityEvents.push(event);
  }
  
  async logPerformanceEvent(event: any) {
    this.performanceEvents.push(event);
  }
  
  reset() {
    this.systemEvents = [];
    this.workflowOperations = [];
    this.securityEvents = [];
    this.performanceEvents = [];
  }
  
  getAllEvents() {
    return {
      system: this.systemEvents,
      workflow: this.workflowOperations,
      security: this.securityEvents,
      performance: this.performanceEvents,
    };
  }
}

/**
 * Async test helper - wait for a condition to be met
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 10
): Promise<void> {
  const startTime = Date.now();
  
  while (!condition() && Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  if (!condition()) {
    throw new Error(`Condition not met within ${timeout}ms`);
  }
}

/**
 * Create a promise that resolves after specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  expectedErrorMessage?: string
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
      `Expected error message to contain "${expectedErrorMessage}", but got: "${error.message}"`
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
 * Test data generators
 */
export const TestData = {
  /**
   * Generate test tool definition
   */
  toolDefinition: (name: string, overrides: any = {}) => ({
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
  requestContext: (overrides: Partial<BeyondMcpRequestContext> = {}) => ({
    authenticatedUserId: 'test-user-' + Math.random().toString(36).substr(2, 8),
    clientId: 'test-client-' + Math.random().toString(36).substr(2, 8),
    scopes: ['read', 'write'],
    requestId: 'test-request-' + Math.random().toString(36).substr(2, 8),
    startTime: Date.now(),
    metadata: {},
    ...overrides,
  }),
  
  /**
   * Generate test MCP server config
   */
  mcpServerConfig: (overrides: Partial<BeyondMcpServerConfig> = {}) => ({
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
    const missing = values.filter(value => !array.includes(value));
    if (missing.length > 0) {
      throw new Error(
        message || `Array missing expected values: ${missing.join(', ')}`
      );
    }
  },
  
  /**
   * Assert that an object has specific properties
   */
  hasProperties: (obj: any, properties: string[], message?: string): void => {
    const missing = properties.filter(prop => !(prop in obj));
    if (missing.length > 0) {
      throw new Error(
        message || `Object missing expected properties: ${missing.join(', ')}`
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
        message || `Objects not equal:\nActual: ${actualStr}\nExpected: ${expectedStr}`
      );
    }
  },
};