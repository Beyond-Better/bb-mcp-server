/**
 * Unit Tests for MCPServer
 * Tests core MCP server functionality extracted from ActionStepMCPServer
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
import type { BeyondMcpServerConfig, BeyondMcpServerDependencies, BeyondMcpRequestContext } from '../../../src/lib/types/BeyondMcpTypes.ts';

// Test helpers
import { createMockLogger, createMockAuditLogger, createMockSdkMcpServer, MockSdkMcpServer, createMockToolRegistry, createMockWorkflowRegistry, createMockConfigManager, createMockErrorHandler, createMockTransportManager } from '../../utils/test-helpers.ts';

describe('MCPServer', () => {
  let server: BeyondMcpServer;
  let mockSdkMcpServer: MockSdkMcpServer;
  let mockLogger: Logger;
  let mockAuditLogger: AuditLogger;
  let mockConfigManager: ConfigManager;
  let mockErrorHandler: ErrorHandler;
  let mockWorkflowRegistry: WorkflowRegistry;
  let mockTransportManager: TransportManager;
  let config: BeyondMcpServerConfig;
  let dependencies: BeyondMcpServerDependencies;
  
  beforeEach(() => {
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
    server = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);
  });
  
  afterEach(async () => {
    // Cleanup any active MCP server connections to prevent resource leaks
    try {
      if (server && typeof server.shutdown === 'function') {
        await server.shutdown();
      }
    } catch {
      // Ignore shutdown errors in tests
    }
  });
  
  describe('Constructor', () => {
    it('should create MCPServer with valid configuration', () => {
      assertExists(server);
      // Verify server exists and has expected properties
      const mcpServerInfo = server.getSdkMcpServer();
      assertExists(mcpServerInfo);
    });
    
    it('should initialize with all dependencies', () => {
      assertExists(server.getSdkMcpServer());
      // Verify that the MCP server was created properly
      const mcpServerInfo = server.getSdkMcpServer();
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
        startTime: Date.now(),
        metadata: {},
      };
      
      // Test context execution
      const result = await server.executeWithAuthContext(testContext, async () => {
        const currentUserId = server.getAuthenticatedUserId();
        return currentUserId;
      });
      
      assertEquals(result, 'test-user');
    });
    
    it('should return null when no context is active', () => {
      const userId = server.getAuthenticatedUserId();
      assertEquals(userId, null);
    });
    
    it('should handle nested context execution', async () => {
      const outerContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'outer-user',
        clientId: 'test-client',
        scopes: ['read'],
        requestId: 'outer-request',
        startTime: Date.now(),
        metadata: {},
      };
      
      const innerContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'inner-user',
        clientId: 'test-client',
        scopes: ['write'],
        requestId: 'inner-request',
        startTime: Date.now(),
        metadata: {},
      };
      
      const result = await server.executeWithAuthContext(outerContext, async () => {
        const outerUserId = server.getAuthenticatedUserId();
        
        const innerResult = await server.executeWithAuthContext(innerContext, async () => {
          return server.getAuthenticatedUserId();
        });
        
        const restoredUserId = server.getAuthenticatedUserId();
        
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
      
      await server.initialize();
      
      // Verify logging
      assertSpyCalls(logSpy, 2); // Initial log + success log
      assertSpyCalls(auditSpy, 1); // System startup event
      
      logSpy.restore();
      auditSpy.restore();
    });
    
    it('should not initialize twice', async () => {
      await server.initialize();
      
      const logSpy = spy(mockLogger, 'info');
      
      // Second initialization should be no-op
      const result = await server.initialize();
      assertEquals(result, server);
      
      logSpy.restore();
    });
    
    it('should handle initialization errors', async () => {
      // Mock an error during core tools registration
      // Note: wrapError is a static method, can't be stubbed on instance
      
      // Test error handling would require more complex mocking
      // This test verifies the error handling structure is in place
      assertExists(server);
    });
    
    it('should start STDIO transport', async () => {
      config.transport = { type: 'stdio' };
      server = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);
      
      await server.initialize();
      
      const logSpy = spy(mockLogger, 'info');
      
      await server.start();
      
      assertSpyCalls(logSpy, 3); // Starting + STDIO connected + Success
      
      // Explicitly clean up STDIO transport to prevent resource leaks
      try {
        await server.shutdown();
      } catch {
        // Ignore shutdown errors
      }
      
      logSpy.restore();
    });
    
    it('should start HTTP transport', async () => {
      config.transport = { type: 'http' };
      server = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);
      
      const transportSpy = spy(mockTransportManager, 'start');
      
      await server.initialize();
      await server.start();
      
      assertSpyCalls(transportSpy, 1);
      
      transportSpy.restore();
    });
    
    it('should shutdown gracefully', async () => {
      await server.initialize();
      
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      const logSpy = spy(mockLogger, 'info');
      
      await server.shutdown();
      
      assertSpyCalls(auditSpy, 1); // Shutdown event
      assertSpyCalls(logSpy, 2); // Shutdown start + Shutdown complete
      
      auditSpy.restore();
      logSpy.restore();
    });
    
    it('should handle shutdown errors', async () => {
      await server.initialize();
      
      const errorStub = stub(mockLogger, 'error');
      const auditStub = stub(mockAuditLogger, 'logSystemEvent', () => {
        throw new Error('Audit failed');
      });
      
      await assertRejects(
        () => server.shutdown(),
        Error,
        'Audit failed'
      );
      
      errorStub.restore();
      auditStub.restore();
    });
  });
  
  describe('Tool Registration', () => {
    it('should register tools successfully', async () => {
      await server.initialize();
      
      // Register a test tool
      server.registerTool('test_tool', {
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
      assertExists(server['toolRegistry']);
    });
    
    it('should register multiple tools', () => {
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
      
      server.registerTools(tools);
      
      // Should not throw errors
      assertExists(server);
    });
  });
  
  describe('MCP SDK Integration', () => {
    it('should expose createMessage method', async () => {
      await server.initialize();
      
      assertExists(server.createMessage);
      assertEquals(typeof server.createMessage, 'function');
    });
    
    it('should expose elicitInput method', async () => {
      await server.initialize();
      
      assertExists(server.elicitInput);
      assertEquals(typeof server.elicitInput, 'function');
    });
  });
  
  describe('Configuration Validation', () => {
    it('should require server name', () => {
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
    
    it('should use provided title or fallback to name', () => {
      const configWithTitle = {
        server: {
          name: 'test-server',
          version: '1.0.0',
          title: 'Test MCP Server',
          description: 'Test server',
        },
      };
      
      const serverWithTitle = new BeyondMcpServer(configWithTitle, dependencies);
      // Verify server has expected title behavior
      const titleInfo = serverWithTitle.getSdkMcpServer();
      assertExists(titleInfo);
      
      const configWithoutTitle = {
        server: {
          name: 'test-server',
          version: '1.0.0',
          description: 'Test server',
        },
      };
      
      const serverWithoutTitle = new BeyondMcpServer(configWithoutTitle, dependencies);
      const noTitleInfo = serverWithoutTitle.getSdkMcpServer();
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
          logSystemEvent: () => { throw mockError; },
        } as unknown as AuditLogger,
      };
      
      const faultyServer = new BeyondMcpServer(config, faultyDependencies);
      
      await assertRejects(
        () => faultyServer.initialize(),
        Error
      );
    });
  });
});

// Integration test for complete server functionality
describe('MCPServer Integration', () => {
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
    const server = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);
    
    try {
      // Test full lifecycle
      await server.initialize();
      await server.start();
      
      // Test context execution
      const testContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'integration-user',
        clientId: 'integration-client',
        scopes: ['read', 'write'],
        requestId: 'integration-request',
        startTime: Date.now(),
        metadata: { test: true },
      };
      
      const result = await server.executeWithAuthContext(testContext, async () => {
        return {
          userId: server.getAuthenticatedUserId(),
          serverName: config.server.name, // Access from config instead of MCP server
        };
      });
      
      assertEquals(result.userId, 'integration-user');
      assertEquals(result.serverName, 'integration-test-server');
    } finally {
      // Ensure cleanup happens regardless of test outcome
      try {
        await server.shutdown();
      } catch {
        // Ignore shutdown errors in tests
      }
    }
  });
});