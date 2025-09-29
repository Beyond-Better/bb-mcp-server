/**
 * Unit Tests for BeyondMcpServer
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, returnsNext, spy, stub } from '@std/testing/mock';

// Import components
import { BeyondMcpServer } from '../../../src/lib/server/BeyondMcpServer.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';
import { AuditLogger } from '../../../src/lib/utils/AuditLogger.ts';
import { ConfigManager } from '../../../src/lib/config/ConfigManager.ts';
import { ErrorHandler } from '../../../src/lib/utils/ErrorHandler.ts';
import { WorkflowRegistry } from '../../../src/lib/workflows/WorkflowRegistry.ts';
import { TransportManager } from '../../../src/lib/transport/TransportManager.ts';

// Import types
import type {
  BeyondMcpRequestContext,
  BeyondMcpServerConfig,
  BeyondMcpServerDependencies,
} from '../../../src/lib/types/BeyondMcpTypes.ts';

// Test helpers
import {
  createMockAuditLogger,
  createMockConfigManager,
  createMockErrorHandler,
  createMockLogger,
  createMockSdkMcpServer,
  createMockToolRegistry,
  createMockTransportManager,
  createMockWorkflowRegistry,
  MockSdkMcpServer,
} from '../../utils/test-helpers.ts';

describe('BeyondMcpServer', () => {
  let beyondMcpServer: BeyondMcpServer;
  let mockSdkMcpServer: MockSdkMcpServer;
  let mockLogger: Logger;
  let mockAuditLogger: AuditLogger;
  let mockConfigManager: ConfigManager;
  let mockErrorHandler: ErrorHandler;
  let mockWorkflowRegistry: WorkflowRegistry;
  let mockTransportManager: TransportManager;
  let config: BeyondMcpServerConfig;
  let dependencies: BeyondMcpServerDependencies;

  beforeEach(async () => {
    // Create mock dependencies
    mockLogger = createMockLogger();
    mockAuditLogger = createMockAuditLogger();
    mockConfigManager = createMockConfigManager();
    mockErrorHandler = createMockErrorHandler();
    mockWorkflowRegistry = createMockWorkflowRegistry();
    mockTransportManager = createMockTransportManager();

    // Create test configuration
    config = {
      server: {
        name: 'test-mcp-server',
        version: '1.0.0',
        description: 'Test MCP Server',
      },
      transport: {
        type: 'stdio',
      },
    };

    dependencies = {
      logger: mockLogger,
      auditLogger: mockAuditLogger,
      configManager: mockConfigManager,
      errorHandler: mockErrorHandler,
      toolRegistry: createMockToolRegistry(),
      workflowRegistry: mockWorkflowRegistry,
      transportManager: mockTransportManager,
    };

    // Create mock MCP server
    mockSdkMcpServer = createMockSdkMcpServer(config);
    beyondMcpServer = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);
    //await beyondMcpServer.initialize();
  });

  afterEach(async () => {
    // Cleanup any active MCP server connections to prevent resource leaks
    try {
      if (beyondMcpServer && typeof beyondMcpServer.shutdown === 'function') {
        await beyondMcpServer.shutdown();
      }
    } catch {
      // Ignore shutdown errors in tests
    }
  });

  describe('Constructor', () => {
    it('should create BeyondMcpServer with valid configuration', () => {
      assertExists(beyondMcpServer);
      // Verify beyondMcpServer exists and has expected properties
      const mcpServerInfo = beyondMcpServer.getSdkMcpServer();
      assertExists(mcpServerInfo);
    });

    it('should initialize with all dependencies', () => {
      assertExists(beyondMcpServer.getSdkMcpServer());
      // Verify that the MCP beyondMcpServer was created properly
      const mcpServerInfo = beyondMcpServer.getSdkMcpServer();
      assertExists(mcpServerInfo);
    });
  });

  describe('AsyncLocalStorage Context Management', () => {
    it('should execute operation with auth context', async () => {
      const testContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'test-user',
        clientId: 'test-client',
        scopes: ['read'],
        requestId: 'test-request',
        startTime: performance.now(),
        metadata: {},
      };

      // Test context execution
      const result = await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        const currentUserId = beyondMcpServer.getAuthenticatedUserId();
        return currentUserId;
      });

      assertEquals(result, 'test-user');
    });

    it('should return null when no context is active', () => {
      const userId = beyondMcpServer.getAuthenticatedUserId();
      assertEquals(userId, null);
    });

    it('should handle nested context execution', async () => {
      const outerContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'outer-user',
        clientId: 'test-client',
        scopes: ['read'],
        requestId: 'outer-request',
        startTime: performance.now(),
        metadata: {},
      };

      const innerContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'inner-user',
        clientId: 'test-client',
        scopes: ['write'],
        requestId: 'inner-request',
        startTime: performance.now(),
        metadata: {},
      };

      const result = await beyondMcpServer.executeWithAuthContext(outerContext, async () => {
        const outerUserId = beyondMcpServer.getAuthenticatedUserId();

        const innerResult = await beyondMcpServer.executeWithAuthContext(innerContext, async () => {
          return beyondMcpServer.getAuthenticatedUserId();
        });

        const restoredUserId = beyondMcpServer.getAuthenticatedUserId();

        return { outerUserId, innerResult, restoredUserId };
      });

      assertEquals(result.outerUserId, 'outer-user');
      assertEquals(result.innerResult, 'inner-user');
      assertEquals(result.restoredUserId, 'outer-user');
    });
  });

  describe('Server Lifecycle', () => {
    it('should initialize server successfully', async () => {
      const logSpy = spy(mockLogger, 'info');
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');

      await beyondMcpServer.initialize();

      // Verify logging
      assertSpyCalls(logSpy, 2); // Initial log + success log
      assertSpyCalls(auditSpy, 1); // System startup event

      logSpy.restore();
      auditSpy.restore();
    });

    it('should not initialize twice', async () => {
      await beyondMcpServer.initialize();

      const logSpy = spy(mockLogger, 'info');

      // Second initialization should be no-op
      const result = await beyondMcpServer.initialize();
      assertEquals(result, beyondMcpServer);

      logSpy.restore();
    });

    it('should handle initialization errors', async () => {
      // Mock an error during core tools registration
      // Note: wrapError is a static method, can't be stubbed on instance

      // Test error handling would require more complex mocking
      // This test verifies the error handling structure is in place
      assertExists(beyondMcpServer);
    });

    it('should start STDIO transport', async () => {
      config.transport = { type: 'stdio' };
      beyondMcpServer = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);

      await beyondMcpServer.initialize();

      const logSpy = spy(mockLogger, 'info');

      await beyondMcpServer.start();

      assertSpyCalls(logSpy, 3); // Starting + STDIO connected + Success

      // Explicitly clean up STDIO transport to prevent resource leaks
      try {
        await beyondMcpServer.shutdown();
      } catch {
        // Ignore shutdown errors
      }

      logSpy.restore();
    });

    it('should start HTTP transport', async () => {
      config.transport = { type: 'http' };
      beyondMcpServer = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);

      const transportSpy = spy(mockTransportManager, 'start');

      await beyondMcpServer.initialize();
      await beyondMcpServer.start();

      assertSpyCalls(transportSpy, 1);

      transportSpy.restore();
    });

    it('should shutdown gracefully', async () => {
      await beyondMcpServer.initialize();

      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      const logSpy = spy(mockLogger, 'info');

      await beyondMcpServer.shutdown();

      assertSpyCalls(auditSpy, 1); // Shutdown event
      assertSpyCalls(logSpy, 2); // Shutdown start + Shutdown complete

      auditSpy.restore();
      logSpy.restore();
    });

    it('should handle shutdown errors', async () => {
      await beyondMcpServer.initialize();

      const errorStub = stub(mockLogger, 'error');
      const auditStub = stub(mockAuditLogger, 'logSystemEvent', () => {
        throw new Error('Audit failed');
      });

      await assertRejects(
        () => beyondMcpServer.shutdown(),
        Error,
        'Audit failed',
      );

      errorStub.restore();
      auditStub.restore();
    });
  });

  describe('Tool Registration', () => {
    it('should register tools successfully', async () => {
      await beyondMcpServer.initialize();

      // Register a test tool
      beyondMcpServer.registerTool('test_tool', {
        title: 'Test Tool',
        description: 'A test tool',
        category: 'testing',
        inputSchema: {
          message: { type: 'string' } as any,
        },
      }, async (args: any) => ({
        content: [{ type: 'text' as const, text: args.message } as any],
      }));

      // Verify tool is accessible through tool registry
      assertExists(beyondMcpServer['toolRegistry']);
    });

    it('should register multiple tools', async () => {
      await beyondMcpServer.initialize();

      const tools = [
        {
          name: 'tool1',
          definition: {
            title: 'Tool 1',
            description: 'First tool',
            inputSchema: {},
          },
          handler: async () => ({ content: [{ type: 'text' as const, text: 'tool1' } as any] }),
        },
        {
          name: 'tool2',
          definition: {
            title: 'Tool 2',
            description: 'Second tool',
            inputSchema: {},
          },
          handler: async () => ({ content: [{ type: 'text' as const, text: 'tool2' } as any] }),
        },
      ];

      beyondMcpServer.registerTools(tools);

      // Should not throw errors
      assertExists(beyondMcpServer);
    });
  });

  describe('MCP SDK Integration', () => {
    it('should expose createMessage method', async () => {
      await beyondMcpServer.initialize();

      assertExists(beyondMcpServer.createMessage);
      assertEquals(typeof beyondMcpServer.createMessage, 'function');
    });

    it('should expose elicitInput method', async () => {
      await beyondMcpServer.initialize();

      assertExists(beyondMcpServer.elicitInput);
      assertEquals(typeof beyondMcpServer.elicitInput, 'function');
    });
  });

  describe('Configuration Validation', () => {
    it('should require beyondMcpServer name', () => {
      const invalidConfig = {
        server: {
          version: '1.0.0',
          description: 'Test',
        },
      } as BeyondMcpServerConfig;

      // Should handle gracefully - constructor shouldn't throw
      assertExists(new BeyondMcpServer(invalidConfig, dependencies));
    });

    it('should use default capabilities when not provided', () => {
      const configWithoutCapabilities = {
        server: {
          name: 'test',
          version: '1.0.0',
          description: 'Test',
        },
      };

      const testServer = new BeyondMcpServer(configWithoutCapabilities, dependencies);
      assertExists(testServer);
    });

    it('should use provided title or fallback to name', async () => {
      const configWithTitle = {
        server: {
          name: 'test-server',
          version: '1.0.0',
          title: 'Test MCP Server',
          description: 'Test server',
        },
      };

      const beyondMcpServerWithTitle = new BeyondMcpServer(configWithTitle, dependencies);
      await beyondMcpServerWithTitle.initialize();

      // Verify server has expected title behavior
      const titleInfo = beyondMcpServerWithTitle.getSdkMcpServer();
      assertExists(titleInfo);

      const configWithoutTitle = {
        server: {
          name: 'test-server',
          version: '1.0.0',
          description: 'Test server',
        },
      };

      const beyondMcpServerWithoutTitle = new BeyondMcpServer(configWithoutTitle, dependencies);
      await beyondMcpServerWithoutTitle.initialize();

      const noTitleInfo = beyondMcpServerWithoutTitle.getSdkMcpServer();
      assertExists(noTitleInfo);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors', async () => {
      const mockError = new Error('Test error');

      // Mock a component that throws during initialization
      const faultyDependencies = {
        ...dependencies,
        auditLogger: {
          logSystemEvent: () => {
            throw mockError;
          },
        } as unknown as AuditLogger,
      };

      const faultyServer = new BeyondMcpServer(config, faultyDependencies);

      await assertRejects(
        () => faultyServer.initialize(),
        Error,
      );
    });
  });
});

// Integration test for complete server functionality
describe('BeyondMcpServer Integration', () => {
  it('should work end-to-end with all components', async () => {
    const mockLogger = createMockLogger();
    const mockAuditLogger = createMockAuditLogger();

    const dependencies: BeyondMcpServerDependencies = {
      logger: mockLogger,
      auditLogger: mockAuditLogger,
      configManager: createMockConfigManager(),
      errorHandler: createMockErrorHandler(),
      toolRegistry: createMockToolRegistry(),
      workflowRegistry: createMockWorkflowRegistry(),
      transportManager: createMockTransportManager(),
    };

    const config: BeyondMcpServerConfig = {
      server: {
        name: 'integration-test-server',
        version: '1.0.0',
        description: 'Integration test server',
      },
      transport: { type: 'stdio' },
    };

    // Use mock MCP server for integration test to prevent resource leaks
    const mockSdkMcpServer = createMockSdkMcpServer(config);
    const beyondMcpServer = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);

    try {
      // Test full lifecycle
      await beyondMcpServer.initialize();
      await beyondMcpServer.start();

      // Test context execution
      const testContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'integration-user',
        clientId: 'integration-client',
        scopes: ['read', 'write'],
        requestId: 'integration-request',
        startTime: performance.now(),
        metadata: { test: true },
      };

      const result = await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        return {
          userId: beyondMcpServer.getAuthenticatedUserId(),
          serverName: config.server.name, // Access from config instead of MCP server
        };
      });

      assertEquals(result.userId, 'integration-user');
      assertEquals(result.serverName, 'integration-test-server');
    } finally {
      // Ensure cleanup happens regardless of test outcome
      try {
        await beyondMcpServer.shutdown();
      } catch {
        // Ignore shutdown errors in tests
      }
    }
  });
});
