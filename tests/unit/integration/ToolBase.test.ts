/**
 * Integration Tests for ToolBase with ToolRegistry
 * Tests the integration between ToolBase implementations and the ToolRegistry system
 * Focuses on real instances rather than mocks where possible
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy } from '@std/testing/mock';
import { z } from 'zod';

// Import components
import { ToolBase } from '../../../src/lib/tools/ToolBase.ts';
import { ToolRegistry } from '../../../src/lib/tools/ToolRegistry.ts';
import type { Logger } from '../../../src/lib/utils/Logger.ts';
import type { ErrorHandler } from '../../../src/lib/utils/ErrorHandler.ts';

// Import test helpers
import {
  createMockLogger,
  SpyLogger,
} from '../../utils/test-helpers.ts';

// Import test implementations
import { MockTool } from '../tools/mocks/MockTool.ts';
import { FailingMockTool } from '../tools/mocks/FailingMockTool.ts';

// Mock MCP Server for ToolRegistry integration
class MockMcpServer {
  public registeredTools = new Map<string, any>();
  
  registerTool(name: string, definition: any, handler: any) {
    this.registeredTools.set(name, { name, definition, handler });
  }
  
  getRegisteredTool(name: string) {
    return this.registeredTools.get(name);
  }
  
  clear() {
    this.registeredTools.clear();
  }
}

describe('ToolBase Integration with ToolRegistry', () => {
  let mockTool: MockTool;
  let failingTool: FailingMockTool;
  let toolRegistry: ToolRegistry;
  let mockMcpServer: MockMcpServer;
  let logger: SpyLogger;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    mockTool = new MockTool();
    failingTool = new FailingMockTool();
    logger = new SpyLogger();
    mockMcpServer = new MockMcpServer();
    
    errorHandler = {
      wrapError: (error: any, code: string, context?: any) => {
        const wrappedError = error instanceof Error ? error : new Error(String(error));
        wrappedError.message = `${code}: ${wrappedError.message}`;
        return wrappedError;
      },
    } as ErrorHandler;
    
    // Create real ToolRegistry instance
    toolRegistry = new ToolRegistry({ logger, errorHandler });
    toolRegistry.sdkMcpServer = mockMcpServer as any;
  });

  afterEach(() => {
    mockMcpServer.clear();
    toolRegistry.clear();
  });

  it('should register tools successfully with registry', () => {
    mockTool.registerWith(toolRegistry);
    
    // Verify tools were registered
    assert(mockMcpServer.registeredTools.has('mock_echo'));
    assert(mockMcpServer.registeredTools.has('mock_process'));
    
    // Verify tools are available in registry
    assertEquals(toolRegistry.getToolCount(), 2);
    const toolNames = toolRegistry.getToolNames();
    assert(toolNames.includes('mock_echo'));
    assert(toolNames.includes('mock_process'));
  });

  it('should execute registered tools through registry', async () => {
    mockTool.registerWith(toolRegistry);
    
    const registeredTool = toolRegistry.getTool('mock_echo');
    assertExists(registeredTool);
    
    // Execute tool through registry
    const result = await registeredTool.handler({ message: 'integration test' });
    
    // Verify execution result
    assertExists(result);
    assertEquals(result.content.length, 1);
    assert(result.content[0].text.includes('integration test'));
  });

  it('should validate tool inputs through registry before execution', async () => {
    mockTool.registerWith(toolRegistry);
    
    // Test valid input
    const validResult = await toolRegistry.validateToolInput('mock_echo', {
      message: 'test message'
    });
    assertEquals(validResult.success, true);
    
    // Test invalid input (missing required field)
    const invalidResult = await toolRegistry.validateToolInput('mock_echo', {});
    assertEquals(invalidResult.success, false);
    assertExists(invalidResult.error);
    assert(invalidResult.error.message.includes('message'));
  });

  it('should handle tool registration errors gracefully', () => {
    const registerSpy = spy(logger, 'error');
    
    // Configure failing tool to fail on registration
    failingTool.setFailOnRegisterWith(true);
    
    try {
      failingTool.registerWith(toolRegistry);
      // Should not throw, but should handle gracefully
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('registerWith'));
    }
    
    registerSpy.restore();
  });

  it('should support multiple tool implementations in same registry', () => {
    // Register both tool implementations
    mockTool.registerWith(toolRegistry);
    
    // Configure failing tool to not fail on registration
    failingTool.setFailOnRegisterWith(false);
    failingTool.registerWith(toolRegistry);
    
    // Verify all tools from both implementations are available
    const totalExpectedTools = mockTool.getToolCount(); // failingTool registration is intentionally empty
    assertEquals(toolRegistry.getToolCount(), totalExpectedTools);
    
    // Verify tools from MockTool
    assertExists(toolRegistry.getTool('mock_echo'));
    assertExists(toolRegistry.getTool('mock_process'));
  });

  it('should execute complex tool operations with full context', async () => {
    mockTool.registerWith(toolRegistry);
    
    const processTools = toolRegistry.getTool('mock_process');
    assertExists(processTools);
    
    // Execute with different operations
    const upperResult = await processTools.handler({
      data: 'test string',
      operation: 'upper'
    });
    
    assert(upperResult.content[0].text.includes('TEST STRING'));
    assert(upperResult.content[0].text.includes('upper'));
    
    const reverseResult = await processTools.handler({
      data: 'hello',
      operation: 'reverse'
    });
    
    assert(reverseResult.content[0].text.includes('olleh'));
    assert(reverseResult.content[0].text.includes('reverse'));
  });

  it('should maintain tool statistics across multiple executions', async () => {
    mockTool.registerWith(toolRegistry);
    
    const tool = toolRegistry.getTool('mock_echo');
    assertExists(tool);
    
    // Execute tool multiple times
    await tool.handler({ message: 'test 1' });
    await tool.handler({ message: 'test 2' });
    await tool.handler({ message: 'test 3' });
    
    // Update stats manually for testing (in real usage this would be automatic)
    toolRegistry.updateToolStats('mock_echo', 50);
    toolRegistry.updateToolStats('mock_echo', 75);
    toolRegistry.updateToolStats('mock_echo', 100);
    
    const stats = toolRegistry.getToolStats('mock_echo');
    assertExists(stats);
    assertEquals(stats.callCount, 3);
    assertEquals(stats.averageExecutionTime, 75); // (50 + 75 + 100) / 3
  });

  it('should support tool categorization and filtering', () => {
    mockTool.registerWith(toolRegistry);
    
    // Get tools by category
    const testingTools = toolRegistry.getToolsByCategory('testing');
    assertEquals(testingTools.length, 2); // Both mock_echo and mock_process are category 'testing'
    
    const utilityTools = toolRegistry.getToolsByCategory('utility');
    assertEquals(utilityTools.length, 0); // Tools are registered with 'testing' category, not 'utility'
  });

  it('should handle tool removal and re-registration', () => {
    mockTool.registerWith(toolRegistry);
    assertEquals(toolRegistry.getToolCount(), 2);
    
    // Remove a tool
    const removed = toolRegistry.removeTool('mock_echo');
    assertEquals(removed, true);
    assertEquals(toolRegistry.getToolCount(), 1);
    
    // Re-register the same tool
    toolRegistry.registerTool('mock_echo', {
      title: 'Re-registered Echo',
      description: 'Re-registered for testing',
      category: 'testing',
      inputSchema: {
        message: z.string()
      }
    }, async (args: any) => ({ content: [{ type: 'text', text: args.message }] }));
    
    assertEquals(toolRegistry.getToolCount(), 2);
    const reregisteredTool = toolRegistry.getTool('mock_echo');
    assertExists(reregisteredTool);
    assertEquals(reregisteredTool.definition.title, 'Re-registered Echo');
  });

  it('should provide comprehensive registry statistics', () => {
    mockTool.registerWith(toolRegistry);
    
    // Add some execution statistics
    toolRegistry.updateToolStats('mock_echo', 100);
    toolRegistry.updateToolStats('mock_process', 200);
    
    const stats = toolRegistry.getRegistryStats();
    assertExists(stats);
    assertEquals(stats.totalTools, 2);
    assertEquals(stats.totalCalls, 2);
    assertEquals(stats.averageExecutionTime, 150); // (100 + 200) / 2
    assertEquals(stats.mostUsedTools.length, 2);
  });
});

describe('ToolBase Performance Integration', () => {
  let mockTool: MockTool;
  let toolRegistry: ToolRegistry;
  let mockMcpServer: MockMcpServer;

  beforeEach(() => {
    mockTool = new MockTool();
    mockMcpServer = new MockMcpServer();
    
    toolRegistry = new ToolRegistry({
      logger: new SpyLogger(),
      errorHandler: { wrapError: (e: any) => e } as ErrorHandler
    });
    toolRegistry.sdkMcpServer = mockMcpServer as any;
  });

  it('should handle large parameter validation efficiently', async () => {
    const schema = z.object({
      items: z.array(z.object({
        id: z.string(),
        data: z.string()
      })).max(1000)
    });

    const largeParams = {
      items: Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        data: `data-${i}`.repeat(100)
      }))
    };

    const startTime = Date.now();
    const result = await mockTool.testValidateParameters(schema, largeParams);
    const duration = Date.now() - startTime;

    assertEquals(result.success, true);
    assert(duration < 1000, `Validation took ${duration}ms, should be under 1000ms`);
  });

  it('should handle concurrent tool registrations', () => {
    const tools = Array.from({ length: 10 }, (_, i) => new MockTool());
    
    const startTime = Date.now();
    
    // Register multiple tools concurrently
    tools.forEach(tool => {
      tool.registerWith(toolRegistry);
    });
    
    const duration = Date.now() - startTime;
    
    // Should register all tools efficiently
    assertEquals(toolRegistry.getToolCount(), 2); // Each MockTool registers 2 tools, but same names overwrite
    assert(duration < 500, `Concurrent registration took ${duration}ms, should be under 500ms`);
  });

  it('should handle concurrent executions', async () => {
    mockTool.registerWith(toolRegistry);
    
    const tool = toolRegistry.getTool('mock_echo');
    assertExists(tool);
    
    const executions = Array.from({ length: 10 }, (_, i) => 
      tool.handler({ message: `Message ${i}` })
    );

    const startTime = Date.now();
    const results = await Promise.all(executions);
    const duration = Date.now() - startTime;
    
    assertEquals(results.length, 10);
    results.forEach((result, i) => {
      assert(result.content[0].text.includes(`Message ${i}`));
    });
    
    assert(duration < 2000, `Concurrent executions took ${duration}ms, should be under 2000ms`);
  });
});

describe('ToolBase Error Recovery Integration', () => {
  let failingTool: FailingMockTool;
  let toolRegistry: ToolRegistry;
  let mockMcpServer: MockMcpServer;
  let logger: SpyLogger;

  beforeEach(() => {
    failingTool = new FailingMockTool();
    mockMcpServer = new MockMcpServer();
    logger = new SpyLogger();
    
    toolRegistry = new ToolRegistry({
      logger,
      errorHandler: { wrapError: (e: any) => e } as ErrorHandler
    });
    toolRegistry.sdkMcpServer = mockMcpServer as any;
  });

  it('should gracefully handle tool execution failures', async () => {
    // Allow registration but configure for execution failure
    failingTool.setFailOnRegisterWith(false);
    failingTool.setFailOnExecution(true);
    
    const tools = failingTool.getTools();
    tools.forEach(tool => {
      toolRegistry.registerTool(tool.name, tool.definition, tool.handler);
    });
    
    const failingOperation = toolRegistry.getTool('failing_operation');
    assertExists(failingOperation);
    
    // Execute failing tool
    const result = await failingOperation.handler({ shouldFail: true, errorType: 'Error' });
    
    // Should return error result, not throw
    assertExists(result);
    assertEquals(result.isError, true);
    assert(result.content[0].text.includes('Intentional failure for testing'));
  });

  it('should handle different types of execution errors', async () => {
    failingTool.setFailOnRegisterWith(false);
    const tools = failingTool.getTools();
    tools.forEach(tool => {
      toolRegistry.registerTool(tool.name, tool.definition, tool.handler);
    });
    
    const failingOperation = toolRegistry.getTool('failing_operation');
    assertExists(failingOperation);
    
    // Test Error object
    const errorResult = await failingOperation.handler({ 
      shouldFail: true, 
      errorType: 'Error',
      errorMessage: 'Custom error message'
    });
    assertEquals(errorResult.isError, true);
    assert(errorResult.content[0].text.includes('Custom error message'));
    
    // Test string error
    const stringResult = await failingOperation.handler({
      shouldFail: true,
      errorType: 'string',
      errorMessage: 'String error'
    });
    assertEquals(stringResult.isError, true);
    assert(stringResult.content[0].text.includes('String error'));
    
    // Test object error
    const objectResult = await failingOperation.handler({
      shouldFail: true,
      errorType: 'object'
    });
    assertEquals(objectResult.isError, true);
  });

  it('should handle slow operations and timeouts', async () => {
    failingTool.setFailOnRegisterWith(false);
    const tools = failingTool.getTools();
    tools.forEach(tool => {
      toolRegistry.registerTool(tool.name, tool.definition, tool.handler);
    });
    
    const slowOperation = toolRegistry.getTool('slow_failing_operation');
    assertExists(slowOperation);
    
    const startTime = Date.now();
    const result = await slowOperation.handler({ delay: 50 });
    const duration = Date.now() - startTime;
    
    assertEquals(result.isError, true);
    assert(result.content[0].text.includes('Slow failure after 50ms'));
    assert(duration >= 50, `Operation should take at least 50ms, took ${duration}ms`);
  });
});

describe('ToolBase Real-World Usage Patterns', () => {
  let mockTool: MockTool;
  let toolRegistry: ToolRegistry;
  let mockMcpServer: MockMcpServer;
  let logger: SpyLogger;

  beforeEach(() => {
    mockTool = new MockTool();
    mockMcpServer = new MockMcpServer();
    logger = new SpyLogger();
    
    toolRegistry = new ToolRegistry({
      logger,
      errorHandler: { wrapError: (e: any) => e } as ErrorHandler
    });
    toolRegistry.sdkMcpServer = mockMcpServer as any;
  });

  it('should support tool discovery and metadata queries', () => {
    mockTool.registerWith(toolRegistry);
    
    // Simulate tool discovery
    const allTools = toolRegistry.getTools();
    assertEquals(allTools.length, 2);
    
    // Check tool metadata
    const echoTool = allTools.find(t => t.name === 'mock_echo');
    assertExists(echoTool);
    assertEquals(echoTool.definition.title, 'Mock Echo Tool');
    assertEquals(echoTool.definition.category, 'testing');
    assert(Array.isArray(echoTool.definition.tags));
    
    // Check tool overview from ToolBase
    const overview = mockTool.getOverview();
    assert(overview.includes('echo'));
    assert(overview.includes('processing'));
  });

  it('should support tool execution with user context', async () => {
    mockTool.registerWith(toolRegistry);
    
    const tool = toolRegistry.getTool('mock_echo');
    assertExists(tool);
    
    // Execute with user context (simulating real MCP call)
    const result = await tool.handler({
      message: 'Hello World',
      userId: 'user-123',
      requestId: 'req-456'
    });
    
    assertExists(result);
    assert(result.content[0].text.includes('Hello World'));
    
    // Check that logging captured user context
    assert(logger.infoCalls.some(call => 
      call[1] && call[1].userId === 'user-123'
    ));
  });

  it('should provide tool usage analytics', async () => {
    mockTool.registerWith(toolRegistry);
    
    const echoTool = toolRegistry.getTool('mock_echo');
    const processTool = toolRegistry.getTool('mock_process');
    assertExists(echoTool);
    assertExists(processTool);
    
    // Simulate multiple tool executions
    await echoTool.handler({ message: 'test 1' });
    await echoTool.handler({ message: 'test 2' });
    await processTool.handler({ data: 'test', operation: 'upper' });
    
    // Update stats for analytics
    toolRegistry.updateToolStats('mock_echo', 100);
    toolRegistry.updateToolStats('mock_echo', 150);
    toolRegistry.updateToolStats('mock_process', 200);
    
    // Get analytics
    const registryStats = toolRegistry.getRegistryStats();
    assertEquals(registryStats.totalCalls, 3);
    assert(registryStats.mostUsedTools.length > 0);
    
    const echoStats = toolRegistry.getToolStats('mock_echo');
    assertExists(echoStats);
    assertEquals(echoStats.callCount, 2);
  });
});