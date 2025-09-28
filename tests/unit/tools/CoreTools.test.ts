/**
 * Unit Tests for CoreTools
 * Tests generic MCP tools extracted from ActionStepMCPServer
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy, stub, returnsNext } from '@std/testing/mock';

// Import components
import { CoreTools } from '../../../src/lib/tools/CoreTools.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';
import { AuditLogger } from '../../../src/lib/utils/AuditLogger.ts';

// Import types
import type { CoreToolsDependencies } from '../../../src/lib/types/BeyondMcpTypes.ts';
import type { ToolRegistry } from '../../../src/lib/tools/ToolRegistry.ts';

// Test helpers
import { createMockLogger, createMockAuditLogger, MockSdkMcpServer } from '../../utils/test-helpers.ts';

// Mock MCP Server with sampling/elicitation capabilities
class MockMcpServer {
  public server = {
    createMessage: async (request: any) => {
      return {
        content: [{ type: 'text', text: `Mock response to: ${request.messages[0].content.text}` }],
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
    elicitInput: async (request: any) => {
      return {
        action: 'accept',
        content: { response: 'Mock elicitation response' },
      };
    },
  };
}

// Mock ToolRegistry
class MockToolRegistry {
  public registeredTools = new Map<string, any>();
  
  registerTool(name: string, definition: any, handler: any) {
    this.registeredTools.set(name, { name, definition, handler });
  }
  
  getRegisteredTool(name: string) {
    return this.registeredTools.get(name);
  }
  
  hasTools() {
    return this.registeredTools.size > 0;
  }
  
  getToolNames() {
    return Array.from(this.registeredTools.keys());
  }
  
  clear() {
    this.registeredTools.clear();
  }
}

describe('CoreTools', () => {
  let coreTools: CoreTools;
  let mockLogger: Logger;
  let mockAuditLogger: AuditLogger;
  let mockMcpServer: MockMcpServer;
  let mockToolRegistry: MockToolRegistry;
  let dependencies: CoreToolsDependencies;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    mockAuditLogger = createMockAuditLogger();
    mockMcpServer = new MockMcpServer();
    mockToolRegistry = new MockToolRegistry();
    
    dependencies = {
      logger: mockLogger,
      sdkMcpServer: mockMcpServer as any,
      auditLogger: mockAuditLogger,
    };
    
    coreTools = new CoreTools(dependencies);
  });
  
  afterEach(() => {
    mockToolRegistry.clear();
  });
  
  describe('Tool Registration', () => {
    it('should register all core tools', () => {
      const logSpy = spy(mockLogger, 'debug');
      
      coreTools.registerWith(mockToolRegistry as any);
      
      // Verify all core tools are registered
      const registeredToolNames = mockToolRegistry.getToolNames();
      assert(registeredToolNames.includes('echo'));
      assert(registeredToolNames.includes('get_server_status'));
      assert(registeredToolNames.includes('test_sampling'));
      assert(registeredToolNames.includes('test_elicitation'));
      
      assertEquals(registeredToolNames.length, 4);
      
      // Verify logging
      assertSpyCalls(logSpy, 2); // Start + completion logs
      
      logSpy.restore();
    });
    
    it('should register echo tool with correct definition', () => {
      coreTools.registerWith(mockToolRegistry as any);
      
      const echoTool = mockToolRegistry.getRegisteredTool('echo');
      assertExists(echoTool);
      assertEquals(echoTool.definition.title, 'Echo');
      assertEquals(echoTool.definition.category, 'core');
      assert(echoTool.definition.tags.includes('testing'));
      assert(echoTool.definition.tags.includes('core'));
    });
    
    it('should register server status tool with correct definition', () => {
      coreTools.registerWith(mockToolRegistry as any);
      
      const statusTool = mockToolRegistry.getRegisteredTool('get_server_status');
      assertExists(statusTool);
      assertEquals(statusTool.definition.title, 'Get Server Status');
      assertEquals(statusTool.definition.category, 'core');
      assert(statusTool.definition.tags.includes('monitoring'));
    });
    
    it('should register sampling tool with correct definition', () => {
      coreTools.registerWith(mockToolRegistry as any);
      
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      assertExists(samplingTool);
      assertEquals(samplingTool.definition.title, 'Test Sampling');
      assertEquals(samplingTool.definition.category, 'core');
      assert(samplingTool.definition.tags.includes('mcp-api'));
      assert(samplingTool.definition.tags.includes('sampling'));
    });
    
    it('should register elicitation tool with correct definition', () => {
      coreTools.registerWith(mockToolRegistry as any);
      
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      assertExists(elicitationTool);
      assertEquals(elicitationTool.definition.title, 'Test Elicitation');
      assertEquals(elicitationTool.definition.category, 'core');
      assert(elicitationTool.definition.tags.includes('elicitation'));
    });
  });
  
  describe('Echo Tool', () => {
    beforeEach(() => {
      coreTools.registerWith(mockToolRegistry as any);
    });
    
    it('should echo provided message', async () => {
      const echoTool = mockToolRegistry.getRegisteredTool('echo');
      const handler = echoTool.handler;
      
      const result = await handler({ message: 'Hello, World!' });
      
      assertEquals(result.content.length, 1);
      assertEquals(result.content[0].type, 'text');
      assertEquals(result.content[0].text, 'Hello, World!');
    });
    
    it('should handle empty message', async () => {
      const echoTool = mockToolRegistry.getRegisteredTool('echo');
      const handler = echoTool.handler;
      
      try {
        await handler({ message: '' });
        assert(false, 'Should have thrown error for empty message');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'message is required');
      }
    });
    
    it('should handle missing message', async () => {
      const echoTool = mockToolRegistry.getRegisteredTool('echo');
      const handler = echoTool.handler;
      
      try {
        await handler({});
        assert(false, 'Should have thrown error for missing message');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'message is required');
      }
    });
    
    it('should log debug message', async () => {
      const logSpy = spy(mockLogger, 'debug');
      
      const echoTool = mockToolRegistry.getRegisteredTool('echo');
      const handler = echoTool.handler;
      
      await handler({ message: 'Test message' });
      
      assertSpyCalls(logSpy, 1);
      
      logSpy.restore();
    });
  });
  
  describe('Server Status Tool', () => {
    beforeEach(() => {
      coreTools.registerWith(mockToolRegistry as any);
    });
    
    it('should return server status information', async () => {
      const statusTool = mockToolRegistry.getRegisteredTool('get_server_status');
      const handler = statusTool.handler;
      
      const result = await handler({});
      
      assertEquals(result.content.length, 1);
      assertEquals(result.content[0].type, 'text');
      
      const statusData = JSON.parse(result.content[0].text);
      assertExists(statusData.server);
      assertExists(statusData.tools);
      assertExists(statusData.health);
      assertEquals(statusData.server.name, 'MCP Server');
      assertEquals(statusData.server.initialized, true);
      assertEquals(statusData.tools.core_tools_loaded, true);
      assertEquals(statusData.health.status, 'healthy');
    });
    
    it('should include memory information', async () => {
      const statusTool = mockToolRegistry.getRegisteredTool('get_server_status');
      const handler = statusTool.handler;
      
      const result = await handler({});
      const statusData = JSON.parse(result.content[0].text);
      
      assertExists(statusData.health.memory);
      assert(typeof statusData.health.memory.used === 'number');
      assert(typeof statusData.health.memory.total === 'number');
      assert(statusData.health.memory.used >= 0);
      assert(statusData.health.memory.total >= statusData.health.memory.used);
    });
    
    it('should include uptime information', async () => {
      const statusTool = mockToolRegistry.getRegisteredTool('get_server_status');
      const handler = statusTool.handler;
      
      const result = await handler({});
      const statusData = JSON.parse(result.content[0].text);
      
      assertExists(statusData.health.uptime);
      assert(typeof statusData.health.uptime === 'number');
      assert(statusData.health.uptime >= 0);
    });
  });
  
  describe('Test Sampling Tool', () => {
    beforeEach(() => {
      coreTools.registerWith(mockToolRegistry as any);
    });
    
    it('should execute sampling request successfully', async () => {
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      const handler = samplingTool.handler;
      
      const logSpy = spy(mockLogger, 'info');
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      
      const result = await handler({
        prompt: 'Test prompt',
        model: 'test-model',
      }, { _meta: { test: true } });
      
      assertEquals(result.content.length, 1);
      assertEquals(result.content[0].type, 'text');
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.prompt, 'Test prompt');
      assertEquals(responseData.model, 'test-model');
      assertEquals(responseData.status, 'success');
      assertExists(responseData.result);
      assertExists(responseData.timestamp);
      
      // Verify logging
      assertSpyCalls(logSpy, 2); // Request + success logs
      assertSpyCalls(auditSpy, 1); // Audit event
      
      logSpy.restore();
      auditSpy.restore();
    });
    
    it('should handle missing prompt parameter', async () => {
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      const handler = samplingTool.handler;
      
      try {
        await handler({ model: 'test-model' });
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'prompt is required');
      }
    });
    
    it('should handle missing model parameter', async () => {
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      const handler = samplingTool.handler;
      
      try {
        await handler({ prompt: 'test prompt' });
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'model is required');
      }
    });
    
    it('should handle MCP server unavailable', async () => {
      // Create CoreTools with unavailable MCP server
      const faultyMcpServer = new MockSdkMcpServer(
        { name: 'test', version: '1.0.0', description: 'test' },
        { capabilities: {}, instructions: undefined }
      );
      // Mock server methods to simulate unavailable state
      faultyMcpServer.server.createMessage = async () => {
        throw new Error('MCP server not available for sampling');
      };
      const faultyDependencies = {
        ...dependencies,
        sdkMcpServer: faultyMcpServer as any,
      };
      const faultyCoreTools = new CoreTools(faultyDependencies);
      faultyCoreTools.registerWith(mockToolRegistry as any);
      
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      const handler = samplingTool.handler;
      
      const result = await handler({ prompt: 'test', model: 'test' });
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.status, 'failed');
      assert(responseData.error.includes('MCP server not available'));
    });
    
    it('should handle sampling failure gracefully', async () => {
      // Create MockSdkMcpServer that throws error
      const errorMcpServer = new MockSdkMcpServer(
        { name: 'error-server', version: '1.0.0', description: 'Error server' },
        { capabilities: {}, instructions: undefined }
      );
      errorMcpServer.server.createMessage = async () => {
        throw new Error('Sampling failed');
      };
      
      const faultyDependencies = {
        ...dependencies,
        sdkMcpServer: errorMcpServer as any,
      };
      const faultyCoreTools = new CoreTools(faultyDependencies);
      faultyCoreTools.registerWith(mockToolRegistry as any);
      
      const logSpy = spy(mockLogger, 'error');
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      const handler = samplingTool.handler;
      
      const result = await handler({ prompt: 'test', model: 'test' });
      
      assertEquals(result.content.length, 1);
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.status, 'failed');
      assertEquals(responseData.error, 'Sampling failed');
      
      // Verify error logging
      assertSpyCalls(logSpy, 1);
      assertSpyCalls(auditSpy, 1);
      
      logSpy.restore();
      auditSpy.restore();
    });
    
    it('should pass metadata to MCP server', async () => {
      const createMessageSpy = spy(mockMcpServer.server, 'createMessage');
      
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      const handler = samplingTool.handler;
      
      await handler(
        { prompt: 'Test with meta', model: 'test-model' },
        { _meta: { sessionId: 'test-session', userId: 'test-user' } }
      );
      
      assertSpyCalls(createMessageSpy, 1);
      const call = createMessageSpy.calls[0];
      assertExists(call);
      const callArgs = call.args[0];
      assertExists(callArgs._meta);
      assertEquals(callArgs._meta.sessionId, 'test-session');
      assertEquals(callArgs._meta.userId, 'test-user');
      
      createMessageSpy.restore();
    });
  });
  
  describe('Test Elicitation Tool', () => {
    beforeEach(() => {
      coreTools.registerWith(mockToolRegistry as any);
    });
    
    it('should execute elicitation request successfully', async () => {
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      const logSpy = spy(mockLogger, 'info');
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      
      const requestedSchema = JSON.stringify({
        type: 'object',
        properties: {
          response: { type: 'string' },
        },
      });
      
      const result = await handler({
        message: 'Please provide input',
        requestedSchema,
      });
      
      assertEquals(result.content.length, 1);
      assertEquals(result.content[0].type, 'text');
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.message, 'Please provide input');
      assertExists(responseData.requestedSchema);
      assertExists(responseData.result);
      assertExists(responseData.timestamp);
      
      // Verify logging
      assertSpyCalls(logSpy, 2); // Request + success logs
      assertSpyCalls(auditSpy, 1); // Audit event
      
      logSpy.restore();
      auditSpy.restore();
    });
    
    it('should handle missing message parameter', async () => {
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      try {
        await handler({ requestedSchema: '{}' });
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'message is required');
      }
    });
    
    it('should handle missing requestedSchema parameter', async () => {
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      try {
        await handler({ message: 'test message' });
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'requestedSchema is required');
      }
    });
    
    it('should handle invalid JSON schema', async () => {
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      try {
        await handler({
          message: 'test message',
          requestedSchema: 'invalid json',
        });
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'requestedSchema must be valid JSON');
      }
    });
    
    it('should handle MCP server unavailable', async () => {
      // Create CoreTools with unavailable MCP server
      const faultyMcpServer = new MockSdkMcpServer(
        { name: 'test', version: '1.0.0', description: 'test' },
        { capabilities: {}, instructions: undefined }
      );
      // Mock server methods to simulate unavailable state
      faultyMcpServer.server.elicitInput = async () => {
        throw new Error('MCP server not available for elicitation');
      };
      const faultyDependencies = {
        ...dependencies,
        sdkMcpServer: faultyMcpServer as any,
      };
      const faultyCoreTools = new CoreTools(faultyDependencies);
      faultyCoreTools.registerWith(mockToolRegistry as any);
      
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      const result = await handler({
        message: 'test',
        requestedSchema: JSON.stringify({ type: 'object', properties: { response: { type: 'string' } } }),
      });
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.status, 'failed');
      assert(responseData.error.includes('MCP server not available'));
    });
    
    it('should handle elicitation failure gracefully', async () => {
      // Create MockSdkMcpServer that throws error
      const errorMcpServer = new MockSdkMcpServer(
        { name: 'error-server', version: '1.0.0', description: 'Error server' },
        { capabilities: {}, instructions: undefined }
      );
      errorMcpServer.server.elicitInput = async () => {
        throw new Error('Elicitation failed');
      };
      
      const faultyDependencies = {
        ...dependencies,
        sdkMcpServer: errorMcpServer as any,
      };
      const faultyCoreTools = new CoreTools(faultyDependencies);
      faultyCoreTools.registerWith(mockToolRegistry as any);
      
      const logSpy = spy(mockLogger, 'error');
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      const result = await handler({
        message: 'test',
        requestedSchema: JSON.stringify({ type: 'object', properties: { response: { type: 'string' } } }),
      });
      
      assertEquals(result.content.length, 1);
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.status, 'failed');
      assertEquals(responseData.error, 'Elicitation failed');
      
      // Verify error logging
      assertSpyCalls(logSpy, 1);
      assertSpyCalls(auditSpy, 1);
      
      logSpy.restore();
      auditSpy.restore();
    });
    
    it('should handle different elicitation responses', async () => {
      // Test accept response
      const acceptMcpServer = new MockSdkMcpServer(
        { name: 'accept-server', version: '1.0.0', description: 'Accept server' },
        { capabilities: {}, instructions: undefined }
      );
      acceptMcpServer.server.elicitInput = async () => ({
        action: 'accept',
        content: { mockResponse: true, message: 'accepted' },
      });
      
      const acceptDependencies = {
        ...dependencies,
        sdkMcpServer: acceptMcpServer as any,
      };
      const acceptCoreTools = new CoreTools(acceptDependencies);
      acceptCoreTools.registerWith(mockToolRegistry as any);
      
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      const handler = elicitationTool.handler;
      
      const result = await handler({
        message: 'test message',
        requestedSchema: JSON.stringify({ type: 'object', properties: { response: { type: 'string' } } }),
      });
      
      const responseData = JSON.parse(result.content[0].text);
      assertEquals(responseData.status, 'accepted');
      assertEquals(responseData.result.action, 'accept');
      assertEquals(responseData.result.content.userResponse, 'accepted');
    });
  });
  
  describe('Error Handling and Logging', () => {
    beforeEach(() => {
      coreTools.registerWith(mockToolRegistry as any);
    });
    
    it('should log all tool executions for audit', async () => {
      const auditSpy = spy(mockAuditLogger, 'logSystemEvent');
      
      // Execute each tool
      const echoTool = mockToolRegistry.getRegisteredTool('echo');
      await echoTool.handler({ message: 'test' });
      
      const samplingTool = mockToolRegistry.getRegisteredTool('test_sampling');
      await samplingTool.handler({ prompt: 'test', model: 'test' });
      
      const elicitationTool = mockToolRegistry.getRegisteredTool('test_elicitation');
      await elicitationTool.handler({ message: 'test', requestedSchema: JSON.stringify({ type: 'object', properties: { response: { type: 'string' } } }) });
      
      // Echo tool doesn't log audit events, but sampling and elicitation do
      assertSpyCalls(auditSpy, 2);
      
      auditSpy.restore();
    });
    
    it('should handle constructor with missing dependencies gracefully', () => {
      // Missing logger - should throw a clear error
      try {
        new CoreTools({ sdkMcpServer: mockMcpServer as any, auditLogger: mockAuditLogger } as any);
        assert(false, 'Should have thrown error for missing logger');
      } catch (error) {
        // Should throw a clear error about missing dependencies
        assert(error instanceof Error);
      }
    });
  });
});

// Integration test with real-like MCP server
describe('CoreTools Integration', () => {
  it('should work with comprehensive MCP server mock', async () => {
    const comprehensiveMcpServer = {
      server: {
        createMessage: async (request: any) => {
          // Simulate different responses based on model
          if (request.model === 'error-model') {
            throw new Error('Model not available');
          }
          
          return {
            content: [{
              type: 'text',
              text: `AI Response: ${request.messages[0].content.text}`,
            }],
            model: request.model,
            stopReason: 'end_turn',
            usage: {
              inputTokens: request.messages[0].content.text.length,
              outputTokens: 50,
            },
          };
        },
        elicitInput: async (request: any) => {
          // Simulate user interaction
          if (request.message.includes('reject')) {
            return { action: 'reject' };
          }
          
          return {
            action: 'accept',
            content: {
              userChoice: 'approved',
              timestamp: new Date().toISOString(),
            },
          };
        },
      },
    };
    
    const mockLogger = createMockLogger();
    const mockAuditLogger = createMockAuditLogger();
    const mockToolRegistry = new MockToolRegistry();
    
    const dependencies: CoreToolsDependencies = {
      logger: mockLogger,
      sdkMcpServer: comprehensiveMcpServer as any,
      auditLogger: mockAuditLogger,
    };
    
    const coreTools = new CoreTools(dependencies);
    coreTools.registerWith(mockToolRegistry as any);
    
    // Test all tools in sequence
    const echoResult = await mockToolRegistry.getRegisteredTool('echo').handler({
      message: 'Integration test message',
    });
    assertEquals(echoResult.content[0].text, 'Integration test message');
    
    const statusResult = await mockToolRegistry.getRegisteredTool('get_server_status').handler({});
    const statusData = JSON.parse(statusResult.content[0].text);
    assertEquals(statusData.server.name, 'MCP Server');
    
    const samplingResult = await mockToolRegistry.getRegisteredTool('test_sampling').handler({
      prompt: 'What is the weather?',
      model: 'gpt-4',
    });
    const samplingData = JSON.parse(samplingResult.content[0].text);
    assertEquals(samplingData.status, 'success');
    assert(samplingData.result.content[0].text.includes('AI Response'));
    
    const elicitationResult = await mockToolRegistry.getRegisteredTool('test_elicitation').handler({
      message: 'Do you approve this action?',
      requestedSchema: JSON.stringify({ type: 'object', properties: { approved: { type: 'boolean' } } }),
    });
    const elicitationData = JSON.parse(elicitationResult.content[0].text);
    assertEquals(elicitationData.result.action, 'accept');
  });
});