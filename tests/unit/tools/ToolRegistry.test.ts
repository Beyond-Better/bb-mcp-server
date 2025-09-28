/**
 * Unit Tests for ToolRegistry
 * Tests sophisticated tool registration and Zod validation extracted from ActionStepMCPServer
 */

import { assertEquals, assertExists, assertRejects, assert } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy, stub } from '@std/testing/mock';
import { z } from 'zod';

// Import components
import { ToolRegistry } from '../../../src/lib/tools/ToolRegistry.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';
import { ErrorHandler } from '../../../src/lib/utils/ErrorHandler.ts';

// Import types
import type { ToolDefinition, ToolHandler, RegisteredTool, ToolRegistryDependencies } from '../../../src/lib/types/BeyondMcpTypes.ts';

// Test helpers
import { createMockLogger } from '../../utils/test-helpers.ts';

// Mock MCP Server
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

describe('ToolRegistry', () => {
  let toolRegistry: ToolRegistry;
  let mockMcpServer: MockMcpServer;
  let mockLogger: Logger;
  let mockErrorHandler: ErrorHandler;
  let dependencies: ToolRegistryDependencies;
  
  beforeEach(() => {
    mockMcpServer = new MockMcpServer();
    mockLogger = createMockLogger();
    mockErrorHandler = {
      wrapError: (error: any, code: string, context?: any) => {
        const wrappedError = error instanceof Error ? error : new Error(String(error));
        wrappedError.message = `${code}: ${wrappedError.message}`;
        return wrappedError;
      },
    } as ErrorHandler;
    
    dependencies = {
      logger: mockLogger,
      errorHandler: mockErrorHandler,
    };
    
    toolRegistry = new ToolRegistry(dependencies);
	toolRegistry.sdkMcpServer = mockMcpServer as any;

  });
  
  afterEach(() => {
    mockMcpServer.clear();
  });
  
  describe('Tool Registration', () => {
    it('should register tool with Zod validation', async () => {
      const definition: ToolDefinition<{ message: z.ZodString }> = {
        title: 'Test Tool',
        description: 'A test tool for validation',
        category: 'testing',
        tags: ['test', 'validation'],
        inputSchema: {
          message: z.string().describe('Test message'),
        },
      };
      
      const handler: ToolHandler<{ message: z.ZodString }> = async (args: { message: string }) => ({
        content: [{ type: 'text' as const, text: args.message } as any],
      });
      
      const logSpy = spy(mockLogger, 'debug');
      
      toolRegistry.registerTool('test_tool', definition, handler);
      
      // Verify tool was registered with MCP server
      assert(mockMcpServer.registeredTools.has('test_tool'));
      
      // Verify tool is available in registry
      const registeredTool = toolRegistry.getTool('test_tool');
      assertExists(registeredTool);
      assertEquals(registeredTool.name, 'test_tool');
      assertEquals(registeredTool.definition.title, 'Test Tool');
      
      // Verify logging
      assertSpyCalls(logSpy, 2); // Registration start + success
      
      logSpy.restore();
    });
    
    it('should create Zod validator from input schema', () => {
      const definition: ToolDefinition<{ value: z.ZodNumber; optional: z.ZodOptional<z.ZodString> }> = {
        title: 'Schema Test',
        description: 'Tests schema validation',
        inputSchema: {
          value: z.number().min(0).max(100),
          optional: z.string().optional(),
        },
      };
      
      const handler: ToolHandler<{ value: z.ZodNumber; optional: z.ZodOptional<z.ZodString> }> = async (args: { value: number; optional?: string | undefined }) => ({
        content: [{ type: 'text' as const, text: String(args.value) } as any],
      });
      
      toolRegistry.registerTool('schema_test', definition, handler);
      
      // Verify validator was created
      const validator = toolRegistry.getToolSchema('schema_test');
      assertExists(validator);
    });
    
    it('should handle registration errors gracefully', () => {
      const definition = {
        title: 'Faulty Tool',
        description: 'This will fail',
        inputSchema: {},
      };
      
      const handler = async () => ({ content: [] as any });
      
      // Mock the static ErrorHandler.wrapError method
      const originalWrapError = ErrorHandler.wrapError;
      ErrorHandler.wrapError = (error: any, code: string, context?: any) => {
        const baseError = error instanceof Error ? error : new Error(String(error));
        const mcpError = Object.assign(baseError, {
          code,
          context,
          timestamp: new Date(),
          info: { code, severity: 'HIGH' as const, category: 'RUNTIME' as const },
          toJSON: () => ({ message: baseError.message, code, timestamp: new Date() }),
          shouldRetry: false,
          isUserError: false,
        });
        mcpError.message = `${code}: ${mcpError.message}`;
        return mcpError as any;
      };
      
      // Create a new mock server that throws on registerTool
      const faultyMcpServer = {
        registerTool: () => {
          throw new Error('MCP registration failed');
        },
      };
      
      const  faultyRegistry = new ToolRegistry(dependencies);
	  faultyRegistry.sdkMcpServer = faultyMcpServer as any;

      const logSpy = spy(mockLogger, 'error');
      
      try {
        faultyRegistry.registerTool('faulty_tool', definition, handler);
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('TOOL_REGISTRATION_FAILED'));
      } finally {
        // Restore the original method
        ErrorHandler.wrapError = originalWrapError;
      }
      
      assertSpyCalls(logSpy, 1);
      
      logSpy.restore();
    });
  });
  
  describe('Tool Validation', () => {
    beforeEach(() => {
      // Register a test tool for validation tests
      const definition = {
        title: 'Validation Test',
        description: 'Tool for testing validation',
        inputSchema: {
          name: z.string().min(1),
          age: z.number().min(0).max(120),
          email: z.string().email().optional(),
          active: z.boolean().default(true),
        },
      };
      
      const handler = async (args: any) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(args) } as any],
      });
      
      toolRegistry.registerTool('validation_test', definition, handler);
    });
    
    it('should validate valid input successfully', async () => {
      const validInput = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
        active: true,
      };
      
      const result = await toolRegistry.validateToolInput('validation_test', validInput);
      
      assertEquals(result.success, true);
      assertExists(result.data);
      assertEquals(result.data.name, 'John Doe');
      assertEquals(result.data.age, 30);
    });
    
    it('should apply default values during validation', async () => {
      const inputWithoutDefaults = {
        name: 'Jane Doe',
        age: 25,
      };
      
      const result = await toolRegistry.validateToolInput('validation_test', inputWithoutDefaults);
      
      assertEquals(result.success, true);
      assertExists(result.data);
      assertEquals(result.data.active, true); // Default value applied
    });
    
    it('should reject invalid input with detailed errors', async () => {
      const invalidInput = {
        name: '', // Too short
        age: -5, // Below minimum
        email: 'invalid-email', // Invalid format
      };
      
      const result = await toolRegistry.validateToolInput('validation_test', invalidInput);
      
      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.message.includes('Validation failed'));
    });
    
    it('should handle missing required fields', async () => {
      const incompleteInput = {
        age: 30,
        // Missing required 'name' field
      };
      
      const result = await toolRegistry.validateToolInput('validation_test', incompleteInput);
      
      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.message.includes('name'));
    });
    
    it('should return error for non-existent tool', async () => {
      const result = await toolRegistry.validateToolInput('nonexistent_tool', {});
      
      assertEquals(result.success, false);
      assertExists(result.error);
      assertEquals(result.error.message, "Tool 'nonexistent_tool' not found");
    });
  });
  
  describe('Dynamic Enum Generation', () => {
    it('should create enum from string array', () => {
      const values = ['option1', 'option2', 'option3'];
      const enumSchema = ToolRegistry.createDynamicEnum(values);
      
      // Test valid values
      assertEquals(enumSchema.parse('option1'), 'option1');
      assertEquals(enumSchema.parse('option2'), 'option2');
      
      // Test invalid value
      try {
        enumSchema.parse('invalid_option');
        assert(false, 'Should have thrown validation error');
      } catch (error) {
        assert(error instanceof z.ZodError);
      }
    });
    
    it('should throw error for empty array', () => {
      try {
        ToolRegistry.createDynamicEnum([]);
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'Enum must have at least one value');
      }
    });
    
    it('should work with workflow names pattern', () => {
      const workflowNames = ['client_creation', 'patent_analysis', 'actionstep_query'];
      const workflowEnum = ToolRegistry.createDynamicEnum(workflowNames);
      
      // This pattern mirrors ActionStepMCPServer workflow registration
      const definition = {
        title: 'Execute Workflow',
        description: 'Execute ActionStep workflows',
        inputSchema: {
          workflow_name: workflowEnum,
          parameters: z.object({}).passthrough(),
        },
      };
      
      const handler = async (args: any) => ({ content: [] });
      
      toolRegistry.registerTool('execute_workflow', definition, handler);
      
      // Test validation with workflow names
      const validResult = toolRegistry.validateToolInput('execute_workflow', {
        workflow_name: 'client_creation',
        parameters: {},
      });
      
      assertExists(validResult);
    });
  });
  
  describe('Tool Management', () => {
    beforeEach(() => {
      // Register multiple tools for management tests
      const tools = [
        { name: 'tool1', category: 'category1' },
        { name: 'tool2', category: 'category1' },
        { name: 'tool3', category: 'category2' },
        { name: 'tool4' }, // No category
      ];
      
      tools.forEach((toolInfo) => {
        const definition = {
          title: toolInfo.name.toUpperCase(),
          description: `Description for ${toolInfo.name}`,
          category: toolInfo.category || 'uncategorized',
          inputSchema: {},
        };
        
        const handler = async () => ({ content: [] as any });
        
        toolRegistry.registerTool(toolInfo.name, definition, handler);
      });
    });
    
    it('should get all registered tools', () => {
      const tools = toolRegistry.getTools();
      assertEquals(tools.length, 4);
      
      const toolNames = tools.map(t => t.name);
      assert(toolNames.includes('tool1'));
      assert(toolNames.includes('tool2'));
      assert(toolNames.includes('tool3'));
      assert(toolNames.includes('tool4'));
    });
    
    it('should get tool names', () => {
      const names = toolRegistry.getToolNames();
      assertEquals(names.length, 4);
      assert(names.includes('tool1'));
    });
    
    it('should get tool count', () => {
      assertEquals(toolRegistry.getToolCount(), 4);
    });
    
    it('should get tools by category', () => {
      const category1Tools = toolRegistry.getToolsByCategory('category1');
      assertEquals(category1Tools.length, 2);
      
      const category2Tools = toolRegistry.getToolsByCategory('category2');
      assertEquals(category2Tools.length, 1);
      
      const nonexistentCategoryTools = toolRegistry.getToolsByCategory('nonexistent');
      assertEquals(nonexistentCategoryTools.length, 0);
    });
    
    it('should get individual tool', () => {
      const tool = toolRegistry.getTool('tool1');
      assertExists(tool);
      assertEquals(tool.name, 'tool1');
      assertEquals(tool.definition.title, 'TOOL1');
      
      const nonexistentTool = toolRegistry.getTool('nonexistent');
      assertEquals(nonexistentTool, undefined);
    });
    
    it('should get tool definition', () => {
      const definition = toolRegistry.getToolDefinition('tool1');
      assertExists(definition);
      assertEquals(definition.title, 'TOOL1');
    });
    
    it('should get tool schema', () => {
      const schema = toolRegistry.getToolSchema('tool1');
      assertExists(schema);
      // Should be a Zod object
      assert(typeof schema.parse === 'function');
    });
  });
  
  describe('Tool Statistics', () => {
    beforeEach(() => {
      // Register a tool for statistics testing
      const definition = {
        title: 'Stats Tool',
        description: 'Tool for testing statistics',
        inputSchema: {},
      };
      
      const handler = async () => ({ content: [] as any });
      
      toolRegistry.registerTool('stats_tool', definition, handler);
    });
    
    it('should track tool execution statistics', () => {
      // Update stats for tool execution
      toolRegistry.updateToolStats('stats_tool', 100);
      toolRegistry.updateToolStats('stats_tool', 200);
      toolRegistry.updateToolStats('stats_tool', 150);
      
      const stats = toolRegistry.getToolStats('stats_tool');
      assertExists(stats);
      assertEquals(stats.callCount, 3);
      assertEquals(stats.averageExecutionTime, 150); // (100 + 200 + 150) / 3
      assertExists(stats.lastCalled);
    });
    
    it('should handle stats for non-existent tool', () => {
      toolRegistry.updateToolStats('nonexistent_tool', 100);
      
      const stats = toolRegistry.getToolStats('nonexistent_tool');
      assertEquals(stats, undefined);
    });
    
    it('should get registry statistics', () => {
      // Add some tools and stats
      toolRegistry.updateToolStats('stats_tool', 100);
      
      const registryStats = toolRegistry.getRegistryStats();
      
      assertExists(registryStats);
      assertEquals(registryStats.totalTools, 1);
      assertEquals(registryStats.totalCalls, 1);
      assertEquals(registryStats.averageExecutionTime, 100);
      assertEquals(registryStats.mostUsedTools.length, 1);
      assertExists(registryStats.mostUsedTools[0]);
      assertEquals(registryStats.mostUsedTools[0].name, 'stats_tool');
    });
  });
  
  describe('Tool Validation Testing', () => {
    it('should test tool validation without execution', async () => {
      const definition = {
        title: 'Test Validation Tool',
        description: 'For testing validation',
        inputSchema: {
          required_field: z.string(),
          optional_field: z.number().optional(),
        },
      };
      
      const handler = async () => ({ content: [] });
      
      toolRegistry.registerTool('validation_tool', definition, handler);
      
      // Test valid input
      const validResult = await toolRegistry.testToolValidation('validation_tool', {
        required_field: 'test',
        optional_field: 42,
      });
      
      assertEquals(validResult.success, true);
      
      // Test invalid input
      const invalidResult = await toolRegistry.testToolValidation('validation_tool', {
        // Missing required_field
        optional_field: 'invalid_type',
      });
      
      assertEquals(invalidResult.success, false);
    });
  });
  
  describe('Tool Removal and Clearing', () => {
    beforeEach(() => {
      // Register some tools
      ['tool_a', 'tool_b', 'tool_c'].forEach(name => {
        toolRegistry.registerTool(name, {
          title: name,
          description: `Description for ${name}`,
          inputSchema: {},
        }, async () => ({ content: [] }));
      });
    });
    
    it('should remove individual tool', () => {
      assertEquals(toolRegistry.getToolCount(), 3);
      
      const removed = toolRegistry.removeTool('tool_b');
      assertEquals(removed, true);
      assertEquals(toolRegistry.getToolCount(), 2);
      
      // Verify tool is gone
      const tool = toolRegistry.getTool('tool_b');
      assertEquals(tool, undefined);
      
      // Other tools should remain
      assertExists(toolRegistry.getTool('tool_a'));
      assertExists(toolRegistry.getTool('tool_c'));
    });
    
    it('should handle removal of non-existent tool', () => {
      const removed = toolRegistry.removeTool('nonexistent_tool');
      assertEquals(removed, false);
      assertEquals(toolRegistry.getToolCount(), 3);
    });
    
    it('should clear all tools', () => {
      assertEquals(toolRegistry.getToolCount(), 3);
      
      const logSpy = spy(mockLogger, 'debug');
      
      toolRegistry.clear();
      
      assertEquals(toolRegistry.getToolCount(), 0);
      assertEquals(toolRegistry.getTools().length, 0);
      
      // Verify logging
      assertSpyCalls(logSpy, 1);
      
      logSpy.restore();
    });
  });
});

// Integration test with complex Zod schemas
describe('ToolRegistry Complex Zod Integration', () => {
  let toolRegistry: ToolRegistry;
  let mockMcpServer: MockMcpServer;
  
  beforeEach(() => {
    mockMcpServer = new MockMcpServer();
    const dependencies: ToolRegistryDependencies = {
      logger: createMockLogger(),
      errorHandler: { wrapError: (e: any) => e } as ErrorHandler,
    };
    
    toolRegistry = new ToolRegistry(dependencies);
	toolRegistry.sdkMcpServer = mockMcpServer as any;
  });
  
  it('should handle complex nested Zod schema like ActionStep workflow registration', async () => {
    // This mirrors the complex schema from ActionStepMCPServer executeWorkflow tool
    const workflowNames = ['client_creation', 'patent_analysis'];
    
    const definition = {
      title: 'Execute Workflow',
      description: 'Execute specialized workflows with comprehensive validation',
      inputSchema: {
        workflow_name: ToolRegistry.createDynamicEnum(workflowNames),
        parameters: z.object({
          userId: z.string().describe('User ID for authentication'),
          requestId: z.string().optional().describe('Optional request ID'),
          dryRun: z.boolean().optional().default(false),
        }).passthrough(),
      },
    };
    
    const handler = async (args: any) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(args) } as any],
    });
    
    toolRegistry.registerTool('execute_workflow', definition, handler);
    
    // Test valid workflow execution parameters
    const validInput = {
      workflow_name: 'client_creation',
      parameters: {
        userId: 'test-user',
        requestId: 'test-request-123',
        dryRun: true,
        // Additional parameters passed through
        matter: {
          name: 'Test Matter',
          type: 'AU Standard Patent',
        },
      },
    };
    
    const result = await toolRegistry.validateToolInput('execute_workflow', validInput);
    
    assertEquals(result.success, true);
    assertExists(result.data);
    assertEquals(result.data.workflow_name, 'client_creation');
    assertEquals(result.data.parameters.userId, 'test-user');
    assertEquals(result.data.parameters.dryRun, true);
    assertEquals(result.data.parameters.matter.name, 'Test Matter');
  });
});