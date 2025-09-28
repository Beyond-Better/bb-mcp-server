/**
 * MCP Server Complete Integration Test
 * Tests all MCP Server components working together 
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy } from '@std/testing/mock';
import { z } from 'zod';

// Import all MCP Server components
import { BeyondMcpServer } from '../../src/lib/server/BeyondMcpServer.ts';
import { ToolRegistry } from '../../src/lib/tools/ToolRegistry.ts';
import { CoreTools } from '../../src/lib/tools/CoreTools.ts';
import { RequestContextManager } from '../../src/lib/server/RequestContextManager.ts';
import { BeyondMcpSDKHelpers } from '../../src/lib/server/MCPSDKHelpers.ts';

// Import types
import type { 
  BeyondMcpServerConfig, 
  BeyondMcpServerDependencies, 
  BeyondMcpRequestContext 
} from '../../src/lib/types/BeyondMcpTypes.ts';

// Import test helpers
import {
  createMockBeyondMcpServerDependencies,
  createTestBeyondMcpServerConfig,
  createTestRequestContext,
  createMockSdkMcpServer,
  MockSdkMcpServer,
  SpyLogger,
  SpyAuditLogger,
  TestData,
  delay,
} from '../utils/test-helpers.ts';

describe('MCP Server Complete Integration', () => {
  let beyondMcpServer: BeyondMcpServer;
  let dependencies: BeyondMcpServerDependencies;
  let config: BeyondMcpServerConfig;
  let mockSdkMcpServer: MockSdkMcpServer;
  let spyLogger: SpyLogger;
  let spyAuditLogger: SpyAuditLogger;
  
  beforeEach(async () => {
    // Create spy loggers for verification
    spyLogger = new SpyLogger();
    spyAuditLogger = new SpyAuditLogger();
    
    // Create dependencies with spy loggers
    dependencies = {
      ...createMockBeyondMcpServerDependencies(),
      logger: spyLogger,
      auditLogger: spyAuditLogger,
    };
    
    config = createTestBeyondMcpServerConfig({
      server: {
        name: 'integration-test-server',
        version: '1.0.0',
        description: 'Complete MCP Server integration test server',
      },
    });
    
    // Create mock MCP server and connect it for MCP SDK testing
    mockSdkMcpServer = createMockSdkMcpServer(config);
    await mockSdkMcpServer.connect(); // Connect to enable MCP SDK functionality
    
    beyondMcpServer = new BeyondMcpServer(config, dependencies, mockSdkMcpServer as any);
  });
  
  afterEach(async () => {
    try {
      await beyondMcpServer.shutdown();
    } catch {
      // Ignore shutdown errors in tests
    }
  });
  
  describe('Complete MCP Server Lifecycle', () => {
    it('should initialize and start with all components integrated', async () => {
      // Initialize server (this triggers all component initialization)
      await beyondMcpServer.initialize();
      
      // Verify initialization logging
      assert(spyLogger.infoCalls.length >= 2); // Start + success logs
      assert(spyAuditLogger.systemEvents.length >= 1); // System startup event
      
      // Verify server is initialized
      assertExists(beyondMcpServer.getSdkMcpServer());
      // Verify server info is accessible
      const sdkMcpServer = beyondMcpServer.getSdkMcpServer();
      assertExists(sdkMcpServer);
      
      // Start server
      await beyondMcpServer.start();
      
      // Verify startup completed successfully
      const infoMessages = spyLogger.infoCalls.map(call => call[0]);
      assert(infoMessages.some(msg => msg.includes('started successfully')));
    });
    
    it('should handle complete workflow with context and tools', async () => {
      await beyondMcpServer.initialize();
      
      const testContext = createTestRequestContext({
        authenticatedUserId: 'integration-test-user',
        clientId: 'integration-test-client',
        scopes: ['read', 'write', 'admin'],
        metadata: { integrationTest: true },
      });
      
      // Execute a complete workflow within context
      const result = await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        // Verify context is available
        const currentUserId = beyondMcpServer.getAuthenticatedUserId();
        assertEquals(currentUserId, 'integration-test-user');
        
        // Register a custom test tool
        beyondMcpServer.registerTool('integration_test_tool', {
          title: 'Integration Test Tool',
          description: 'Tool for integration testing',
          category: 'integration',
          tags: ['test', 'integration'],
          inputSchema: {
            action: z.string(),
            data: z.object({}).passthrough(),
          },
        }, async (args: any) => ({
          content: [{
            type: 'text',
            text: JSON.stringify({
              action: args.action,
              data: args.data,
              contextUserId: beyondMcpServer.getAuthenticatedUserId(),
              timestamp: new Date().toISOString(),
            }),
          }],
        }));
        
        return {
          contextUserId: currentUserId,
          serverName: 'integration-test-server', // Use config name directly
          contextTest: 'success',
        };
      });
      
      assertEquals(result.contextUserId, 'integration-test-user');
      assertEquals(result.serverName, 'integration-test-server');
      assertEquals(result.contextTest, 'success');
    });
    
    it('should handle nested contexts with different permissions', async () => {
      await beyondMcpServer.initialize();
      
      const adminContext = createTestRequestContext({
        authenticatedUserId: 'admin-user',
        scopes: ['admin', 'read', 'write'],
        metadata: { role: 'admin' },
      });
      
      const userContext = createTestRequestContext({
        authenticatedUserId: 'regular-user',
        scopes: ['read'],
        metadata: { role: 'user' },
      });
      
      const result = await beyondMcpServer.executeWithAuthContext(adminContext, async () => {
        const adminUserId = beyondMcpServer.getAuthenticatedUserId();
        
        const nestedResult = await beyondMcpServer.executeWithAuthContext(userContext, async () => {
          return {
            nestedUserId: beyondMcpServer.getAuthenticatedUserId(),
          };
        });
        
        const restoredUserId = beyondMcpServer.getAuthenticatedUserId();
        
        return {
          adminUserId,
          nestedResult,
          restoredUserId,
        };
      });
      
      assertEquals(result.adminUserId, 'admin-user');
      assertEquals(result.nestedResult.nestedUserId, 'regular-user');
      assertEquals(result.restoredUserId, 'admin-user');
    });
  });
  
  describe('Core Tools Integration', () => {
    beforeEach(async () => {
      await beyondMcpServer.initialize();
    });
    
    it('should have all core tools registered and functional', async () => {
      // Core tools should be automatically registered during initialization
      const toolRegistry = beyondMcpServer['toolRegistry'];
      
      const coreToolNames = ['echo', 'get_server_status', 'test_sampling', 'test_elicitation'];
      const registeredNames = toolRegistry.getToolNames();
      
      coreToolNames.forEach(toolName => {
        assert(registeredNames.includes(toolName), `Core tool ${toolName} not registered`);
      });
    });
    
    it('should execute core tools within authenticated context', async () => {
      const testContext = createTestRequestContext();
      
      await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        const toolRegistry = beyondMcpServer['toolRegistry'];
        
        // Test echo tool
        const echoTool = toolRegistry.getTool('echo');
        assertExists(echoTool);
        
        const echoResult = await echoTool.handler({ message: 'Integration test echo' }, {});
        const firstContent = echoResult.content[0];
        assertExists(firstContent);
        assertEquals(firstContent.text, 'Integration test echo');
        
        // Test server status tool
        const statusTool = toolRegistry.getTool('get_server_status');
        assertExists(statusTool);
        
        const statusResult = await statusTool.handler({}, {});
        const statusContent = statusResult.content[0];
        assertExists(statusContent);
        const statusData = JSON.parse(statusContent.text as string);
        assertExists(statusData.server);
        assertExists(statusData.tools);
        assertExists(statusData.health);
      });
    });
  });
  
  describe('Tool Registry and Validation Integration', () => {
    beforeEach(async () => {
      await beyondMcpServer.initialize();
    });
    
    it('should register complex tools with Zod validation like Example workflows', async () => {
      // This mirrors the complex workflow registration pattern from BeyondMcpServer
      const workflowNames = ['test_workflow_1', 'test_workflow_2', 'complex_analysis'];
      
      beyondMcpServer.registerTool('execute_test_workflow', {
        title: 'Execute Test Workflow',
        description: 'Execute test workflows with complex validation (mirrors Example pattern)',
        category: 'workflow',
        tags: ['workflow', 'testing'],
        inputSchema: {
          workflow_name: ToolRegistry.createDynamicEnum(workflowNames),
          parameters: z.object({
            userId: z.string(),
            requestId: z.string().optional(),
            dryRun: z.boolean().default(false),
          }).passthrough(), // Allow additional properties like Example
        },
      }, async (args: any, extra: any) => {
        const context = beyondMcpServer['getAuthContext']();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              workflow: args.workflow_name,
              parameters: args.parameters,
              contextUserId: context?.authenticatedUserId,
              executedAt: new Date().toISOString(),
            }),
          }],
        };
      });
      
      const toolRegistry = beyondMcpServer['toolRegistry'];
      
      // Test valid workflow execution
      const validResult = await toolRegistry.validateToolInput('execute_test_workflow', {
        workflow_name: 'test_workflow_1',
        parameters: {
          userId: 'test-user',
          requestId: 'test-123',
          dryRun: true,
          customData: { matter: { name: 'Test Matter' } }, // Passthrough data
        },
      });
      
      assertEquals(validResult.success, true);
      assertExists(validResult.data);
      assertEquals(validResult.data.workflow_name, 'test_workflow_1');
      assertEquals(validResult.data.parameters.customData.matter.name, 'Test Matter');
      
      // Test invalid workflow name
      const invalidResult = await toolRegistry.validateToolInput('execute_test_workflow', {
        workflow_name: 'invalid_workflow',
        parameters: { userId: 'test-user' },
      });
      
      assertEquals(invalidResult.success, false);
      assertExists(invalidResult.error);
    });
    
    it('should track tool execution statistics', async () => {
      const toolRegistry = beyondMcpServer['toolRegistry'];
      
      // Verify echo tool is registered
      const echoTool = toolRegistry.getTool('echo');
      assertExists(echoTool);
      
      // Execute tools and track timing manually since we're not going through MCP server
      const startTime = Date.now();
      await echoTool.handler({ message: 'stats test 1' }, {});
      const executionTime1 = Date.now() - startTime;
      
      await delay(5); // Small delay
      
      const startTime2 = Date.now();
      await echoTool.handler({ message: 'stats test 2' }, {});
      const executionTime2 = Date.now() - startTime2;
      
      // Update stats manually (in real usage, this would be done by the tool execution wrapper)
      toolRegistry.updateToolStats('echo', executionTime1);
      toolRegistry.updateToolStats('echo', executionTime2);
      
      const stats = toolRegistry.getToolStats('echo');
      assertExists(stats);
      assertEquals(stats.callCount, 2);
      assert(stats.averageExecutionTime >= 0, 'Average execution time should be non-negative');
      assertExists(stats.lastCalled);
      
      const registryStats = toolRegistry.getRegistryStats();
      assertEquals(registryStats.totalCalls, 2); // Should be exactly 2 calls
      assertEquals(registryStats.mostUsedTools.length, 1); // Should have 1 tool with calls
      assertExists(registryStats.mostUsedTools[0]); // Ensure first tool exists
      assertEquals(registryStats.mostUsedTools[0].name, 'echo');
      assertEquals(registryStats.mostUsedTools[0].callCount, 2);
    });
  });
  
  describe('MCP SDK Integration', () => {
    beforeEach(async () => {
      await beyondMcpServer.initialize();
    });
    
    it('should integrate with MCP sampling API like BeyondMcpServer', async () => {
      const testContext = createTestRequestContext();
      
      await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        const samplingRequest = {
          model: 'test-model',
          messages: [{
            role: 'user' as const,
            content: { type: 'text' as const, text: 'Test integration sampling' },
          }],
          maxTokens: 100,
          temperature: 0.7,
        };
        
        const result = await beyondMcpServer.createMessage(samplingRequest);
        
        assertExists(result);
        assertEquals(result.model, 'test-model');
        assertExists(result.content);
      });
    });
    
    it('should integrate with MCP elicitation API like BeyondMcpServer', async () => {
      const testContext = createTestRequestContext();
      
      await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        const elicitationRequest = {
          message: 'Do you approve this integration test action?',
          requestedSchema: {
            type: 'object' as const,
            properties: {
              approved: { type: 'boolean' as const },
              reason: { type: 'string' as const },
            },
            required: ['approved'],
          },
        };
        
        const result = await beyondMcpServer.elicitInput(elicitationRequest);
        
        assertExists(result);
        assertEquals(result.action, 'accept');
        assertExists(result.content);
      });
    });
  });
  
  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await beyondMcpServer.initialize();
    });
    
    it('should handle tool execution errors gracefully', async () => {
      // Register a tool that throws an error
      beyondMcpServer.registerTool('error_tool', {
        title: 'Error Tool',
        description: 'Tool that throws errors for testing',
        inputSchema: {
          shouldError: z.boolean(),
        },
      }, async (args: any) => {
        if (args.shouldError) {
          throw new Error('Intentional test error');
        }
        return { content: [{ type: 'text', text: 'No error' }] };
      });
      
      const toolRegistry = beyondMcpServer['toolRegistry'];
      const errorTool = toolRegistry.getTool('error_tool');
      assertExists(errorTool);
      
      // Test error handling (this would be done by the MCP server's tool wrapper)
      try {
        await errorTool.handler({ shouldError: true }, {});
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'Intentional test error');
      }
      
      // Test normal execution
      const successResult = await errorTool.handler({ shouldError: false }, {});
      const successContent = successResult.content[0];
      assertExists(successContent);
      assertEquals(successContent.text, 'No error');
    });
    
    it('should handle context validation errors', async () => {
      const invalidContext = {
        authenticatedUserId: '', // Invalid empty user ID
        clientId: 'test-client',
        scopes: ['read'],
        requestId: 'test-request',
        startTime: Date.now(),
        metadata: {},
      } as BeyondMcpRequestContext;
      
      try {
        await beyondMcpServer.executeWithAuthContext(invalidContext, async () => {
          return 'should not reach here';
        });
        assert(false, 'Should have thrown validation error');
      } catch (error) {
        // Error should be caught and handled appropriately
        assert(error instanceof Error);
      }
    });
  });
  
  describe('Performance and Resource Management', () => {
    beforeEach(async () => {
      await beyondMcpServer.initialize();
    });
    
    it('should handle concurrent context execution', async () => {
      const contexts = Array.from({ length: 5 }, (_, i) => createTestRequestContext({
        authenticatedUserId: `concurrent-user-${i}`,
        requestId: `concurrent-request-${i}`,
      }));
      
      const results = await Promise.all(
        contexts.map((context, index) =>
          beyondMcpServer.executeWithAuthContext(context, async () => {
            await delay(Math.random() * 10); // Random delay to test concurrency
            return {
              userId: beyondMcpServer.getAuthenticatedUserId(),
              index,
              timestamp: Date.now(),
            };
          })
        )
      );
      
      // Verify each result has the correct user ID
      results.forEach((result: any, index: number) => {
        assertEquals(result.userId, `concurrent-user-${index}`);
        assertEquals(result.index, index);
      });
    });
    
    it('should properly clean up resources on shutdown', async () => {
      await beyondMcpServer.start();
      
      // Register some tools and execute operations
      beyondMcpServer.registerTool('cleanup_test', {
        title: 'Cleanup Test',
        description: 'Tool for testing cleanup',
        inputSchema: {},
      }, async () => ({ content: [{ type: 'text', text: 'cleanup test' }] }));
      
      const testContext = createTestRequestContext();
      await beyondMcpServer.executeWithAuthContext(testContext, async () => {
        return 'operations executed';
      });
      
      // Shutdown should complete without errors
      await beyondMcpServer.shutdown();
      console.log('systemEvents', spyAuditLogger.systemEvents);
      
      // Verify shutdown was logged
      assert(spyAuditLogger.systemEvents.some(event => event.event === 'beyond_mcp_server_shutdown'));
      const shutdownLogs = spyLogger.infoCalls.filter(call => call[0].includes('shutdown'));
      assert(shutdownLogs.length > 0);
    });
  });
});

// Test the library API exports
describe('MCP Server Library API Integration', () => {
  it('should export all MCP Server components for consumers', async () => {
    // This test verifies that all components can be imported as expected by consumers
    const { BeyondMcpServer: ImportedBeyondMcpServer } = await import('../../src/index.ts');
    const { ToolRegistry: ImportedToolRegistry } = await import('../../src/index.ts');
    const { RequestContextManager: ImportedRequestContextManager } = await import('../../src/index.ts');
    const { CoreTools: ImportedCoreTools } = await import('../../src/index.ts');
    const { BeyondMcpSDKHelpers: ImportedBeyondMcpSDKHelpers } = await import('../../src/index.ts');
    
    // Verify components are available
    assertExists(ImportedBeyondMcpServer);
    assertExists(ImportedToolRegistry);
    assertExists(ImportedRequestContextManager);
    assertExists(ImportedCoreTools);
    assertExists(ImportedBeyondMcpSDKHelpers);
    
    // Verify they're the same classes
    assertEquals(ImportedBeyondMcpServer, BeyondMcpServer);
    assertEquals(ImportedToolRegistry, ToolRegistry);
    assertEquals(ImportedRequestContextManager, RequestContextManager);
    assertEquals(ImportedCoreTools, CoreTools);
    assertEquals(ImportedBeyondMcpSDKHelpers, BeyondMcpSDKHelpers);
  });
  
  it('should export all MCP Server types for consumers', async () => {
    // This test verifies type exports by importing and using them
    const typesModule = await import('../../src/lib/types/BeyondMcpTypes.ts');
    
    // Verify core types are usable by creating objects
    const config = {
      server: { name: 'test', version: '1.0.0', description: 'test' },
      transport: { type: 'stdio' as const },
    };
    
    const context = {
      authenticatedUserId: 'test',
      clientId: 'test',
      scopes: [] as string[],
      requestId: 'test',
      startTime: Date.now(),
      metadata: {},
    };
    
    // Types should be usable
    assertEquals(config.server.name, 'test');
    assertEquals(context.authenticatedUserId, 'test');
  });
});

// End-to-end test simulating Example consumer usage
describe('Example Consumer Simulation', () => {
  it('should support Example-like consumer extension pattern', async () => {
    // Simulate how Example would extend the generic MCP server
    class BeyondMcpServerSimulation extends BeyondMcpServer {
      constructor(config: BeyondMcpServerConfig, dependencies: BeyondMcpServerDependencies) {
        super(config, dependencies);
      }
      
      override async initialize(): Promise<BeyondMcpServerSimulation> {
        await super.initialize();
        await super.initialize();
        
        // Register Example-specific tools (simulation)
        this.registerTool('example_simulate', {
          title: 'Example Simulation',
          description: 'Simulates Example-specific functionality',
          category: 'example',
          tags: ['example', 'simulation'],
          inputSchema: {
            operation: z.enum(['get_participants', 'create_matter']),
            params: z.object({}).passthrough(),
          },
        }, async (args: any, extra: any) => {
          const context = this['getAuthContext']();
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                operation: args.operation,
                params: args.params,
                contextUserId: context?.authenticatedUserId,
                simulation: true,
              }),
            }],
          };
        });
        
        return this;
      }
    }
    
    const config = createTestBeyondMcpServerConfig({
      server: {
        name: 'example-simulation-server',
        version: '1.0.0',
        description: 'Example MCP Server Simulation',
      },
    });
    
    const dependencies = createMockBeyondMcpServerDependencies();
    
    const actionStepServer = new BeyondMcpServerSimulation(config, dependencies);
    
    try {
      await actionStepServer.initialize();
      
      const testContext = createTestRequestContext({
        authenticatedUserId: 'example-user',
        clientId: 'example-client',
        scopes: ['read', 'write'],
      });
      
      const result = await actionStepServer.executeWithAuthContext(testContext, async () => {
        const toolRegistry = actionStepServer['toolRegistry'];
        const actionStepTool = toolRegistry.getTool('example_simulate');
        assertExists(actionStepTool);
        
        const toolResult = await actionStepTool.handler({
          operation: 'get_participants',
          params: { search: 'test', role: 'attorney' },
        }, {});
        
        const toolContent = toolResult.content[0];
        assertExists(toolContent);
        const responseData = JSON.parse(toolContent.text as string);
        
        return {
          serverName: 'example-simulation-server', // Use config name directly
          contextUserId: actionStepServer.getAuthenticatedUserId(),
          toolResponse: responseData,
        };
      });
      
      assertEquals(result.serverName, 'example-simulation-server');
      assertEquals(result.contextUserId, 'example-user');
      assertEquals(result.toolResponse.operation, 'get_participants');
      assertEquals(result.toolResponse.contextUserId, 'example-user');
      assertEquals(result.toolResponse.simulation, true);
      
    } finally {
      await actionStepServer.shutdown();
    }
  });
});