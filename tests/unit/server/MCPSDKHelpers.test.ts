/**
 * Unit Tests for MCPSDKHelpers
 * Tests MCP SDK integration utilities extracted from ActionStepMCPServer
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy, stub } from '@std/testing/mock';

// Import components
import { BeyondMcpSDKHelpers } from '../../../src/lib/server/MCPSDKHelpers.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';

// Import types
import type {
  CreateMessageRequest,
  ElicitInputRequest,
  RegisteredTool,
} from '../../../src/lib/types/BeyondMcpTypes.ts';

// Test helpers
import { createMockLogger } from '../../utils/test-helpers.ts';

// Mock MCP Server
class MockSdkMcpServer {
  public server = {
    createMessage: async (request: CreateMessageRequest) => {
      if (request.model === 'error-model') {
        throw new Error('Model not supported');
      }

      const firstMessage = request.messages[0];
      if (!firstMessage || !firstMessage.content) {
        throw new Error('Invalid message format');
      }
      return {
        content: [{ type: 'text', text: `Response to: ${firstMessage.content.text}` }],
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 15 },
      };
    },
    elicitInput: async (request: ElicitInputRequest) => {
      if (request.message.includes('error')) {
        throw new Error('Elicitation failed');
      }

      return {
        action: 'accept' as const,
        content: { response: 'User approved' },
      };
    },
  };
}

describe('MCPSDKHelpers', () => {
  let mcpSDKHelpers: BeyondMcpSDKHelpers;
  let mockSdkMcpServer: MockSdkMcpServer;
  let mockLogger: Logger;

  beforeEach(() => {
    mockSdkMcpServer = new MockSdkMcpServer();
    mockLogger = createMockLogger();
    mcpSDKHelpers = new BeyondMcpSDKHelpers(mockSdkMcpServer as any, mockLogger);
  });

  afterEach(() => {
    // Cleanup
  });

  describe('MCP Sampling API Integration', () => {
    it('should create message successfully', async () => {
      const logSpy = spy(mockLogger, 'debug');

      const request: CreateMessageRequest = {
        model: 'test-model',
        messages: [{
          role: 'user',
          content: { type: 'text', text: 'Hello, AI!' },
        }],
        maxTokens: 100,
        temperature: 0.7,
      };

      const result = await mcpSDKHelpers.createMessage(request);

      assertExists(result);
      assertEquals(result.model, 'test-model');
      assertExists(result.content);
      const firstContent = result.content[0];
      assertExists(firstContent);
      assertEquals(firstContent.text, 'Response to: Hello, AI!');
      assertExists(result.usage);

      // Verify logging
      assertSpyCalls(logSpy, 2); // Request + success logs

      logSpy.restore();
    });

    it('should handle sampling errors', async () => {
      const logSpy = spy(mockLogger, 'error');

      const request: CreateMessageRequest = {
        model: 'error-model',
        messages: [{
          role: 'user',
          content: { type: 'text', text: 'This will fail' },
        }],
      };

      try {
        await mcpSDKHelpers.createMessage(request);
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('MCP sampling failed'));
        assert(error.message.includes('Model not supported'));
      }

      assertSpyCalls(logSpy, 1);

      logSpy.restore();
    });

    it('should log request details', async () => {
      const logSpy = spy(mockLogger, 'debug');

      const request: CreateMessageRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: { type: 'text', text: 'Message 1' } },
          { role: 'assistant', content: { type: 'text', text: 'Response 1' } },
          { role: 'user', content: { type: 'text', text: 'Message 2' } },
        ],
        maxTokens: 500,
        temperature: 0.3,
      };

      await mcpSDKHelpers.createMessage(request);

      const debugCalls = logSpy.calls;
      const firstCall = debugCalls[0];
      assertExists(firstCall);
      const requestLog = firstCall.args;

      assert(requestLog[0].includes('Creating message'));
      const logData = requestLog[1] as any;
      assertEquals(logData.model, 'gpt-4');
      assertEquals(logData.messageCount, 3);
      assertEquals(logData.maxTokens, 500);
      assertEquals(logData.temperature, 0.3);

      logSpy.restore();
    });
  });

  describe('MCP Elicitation API Integration', () => {
    it('should elicit input successfully', async () => {
      const logSpy = spy(mockLogger, 'debug');

      const request: ElicitInputRequest = {
        message: 'Do you want to proceed?',
        requestedSchema: {
          type: 'object',
          properties: {
            proceed: { type: 'boolean' },
            reason: { type: 'string' },
          },
        },
      };

      const result = await mcpSDKHelpers.elicitInput(request);

      assertExists(result);
      assertEquals(result.action, 'accept');
      assertExists(result.content);
      assertEquals((result.content as any).response, 'User approved');

      // Verify logging
      assertSpyCalls(logSpy, 2); // Request + success logs

      logSpy.restore();
    });

    it('should handle elicitation errors', async () => {
      const logSpy = spy(mockLogger, 'error');

      const request: ElicitInputRequest = {
        message: 'This will cause an error',
        requestedSchema: { type: 'object' },
      };

      try {
        await mcpSDKHelpers.elicitInput(request);
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('MCP elicitation failed'));
        assert(error.message.includes('Elicitation failed'));
      }

      assertSpyCalls(logSpy, 1);

      logSpy.restore();
    });

    it('should log elicitation details', async () => {
      const logSpy = spy(mockLogger, 'debug');

      const request: ElicitInputRequest = {
        message: 'Please provide your input for this complex decision.',
        requestedSchema: {
          type: 'object',
          properties: { decision: { type: 'string' } },
        },
      };

      await mcpSDKHelpers.elicitInput(request);

      const debugCalls = logSpy.calls;
      const firstCall = debugCalls[0];
      assertExists(firstCall);
      const requestLog = firstCall.args;

      assert(requestLog[0].includes('Eliciting input'));
      const logData = requestLog[1] as any;
      assertEquals(logData.messageLength, request.message.length);
      assertEquals(logData.hasSchema, true);

      logSpy.restore();
    });
  });

  describe('Tool Overview Generation', () => {
    it('should generate overview for multiple tools', () => {
      const tools: RegisteredTool[] = [
        {
          name: 'echo',
          definition: {
            title: 'Echo Tool',
            description: 'Echoes back the input message',
            category: 'core',
            tags: ['testing', 'core'],
            version: '1.0.0',
            inputSchema: {},
          },
          handler: async () => ({ content: [] }),
          validator: {} as any,
          registeredAt: new Date(),
        },
        {
          name: 'complex_tool',
          definition: {
            title: 'Complex Analysis Tool',
            description: 'Performs complex data analysis with multiple parameters',
            category: 'analysis',
            tags: ['data', 'analysis', 'complex'],
            inputSchema: {},
          },
          handler: async () => ({ content: [] }),
          validator: {} as any,
          registeredAt: new Date(),
        },
        {
          name: 'simple_tool',
          definition: {
            title: 'Simple Tool',
            description: 'A simple utility tool',
            inputSchema: {},
          },
          handler: async () => ({ content: [] }),
          validator: {} as any,
          registeredAt: new Date(),
        },
      ];

      const overview = mcpSDKHelpers.generateToolOverview(tools);

      // Should contain all tools with proper formatting
      assert(
        overview.includes(
          '1. **echo**: Echoes back the input message (core) [testing, core] v1.0.0',
        ),
      );
      assert(
        overview.includes(
          '2. **complex_tool**: Performs complex data analysis with multiple parameters (analysis) [data, analysis, complex]',
        ),
      );
      assert(overview.includes('3. **simple_tool**: A simple utility tool'));

      // Should be well-formatted with double line breaks
      const sections = overview.split('\n\n');
      assertEquals(sections.length, 3);
    });

    it('should handle empty tools list', () => {
      const overview = mcpSDKHelpers.generateToolOverview([]);
      assertEquals(overview, 'No tools available');
    });

    it('should handle tools without optional fields', () => {
      const tools: RegisteredTool[] = [
        {
          name: 'minimal_tool',
          definition: {
            title: 'Minimal Tool',
            description: 'Minimal tool definition',
            inputSchema: {},
          },
          handler: async () => ({ content: [] }),
          validator: {} as any,
          registeredAt: new Date(),
        },
      ];

      const overview = mcpSDKHelpers.generateToolOverview(tools);
      assertEquals(overview, '1. **minimal_tool**: Minimal tool definition');
    });
  });

  describe('Tool Schema Documentation', () => {
    it('should generate comprehensive schema documentation', () => {
      const tool: RegisteredTool = {
        name: 'documented_tool',
        definition: {
          title: 'Well Documented Tool',
          description: 'This tool has complete documentation and examples',
          category: 'documentation',
          tags: ['example', 'documentation'],
          version: '2.1.0',
          inputSchema: {
            name: { type: 'string', minLength: 1 },
            age: { type: 'number', minimum: 0 },
            active: { type: 'boolean', default: true },
          },
        },
        handler: async () => ({ content: [] }),
        validator: {} as any,
        registeredAt: new Date(),
      };

      const documentation = mcpSDKHelpers.generateToolSchemaDoc(tool);

      // Should include all sections
      assert(documentation.includes('# Well Documented Tool'));
      assert(documentation.includes('**Name:** `documented_tool`'));
      assert(documentation.includes('**Description:** This tool has complete documentation'));
      assert(documentation.includes('**Category:** documentation'));
      assert(documentation.includes('**Tags:** example, documentation'));
      assert(documentation.includes('**Version:** 2.1.0'));
      assert(documentation.includes('## Input Schema'));
      assert(documentation.includes('```json'));

      // Schema should be properly formatted JSON
      const schemaMatch = documentation.match(/```json\n([\s\S]*?)\n```/);
      assertExists(schemaMatch);
      assertExists(schemaMatch[1]);
      const schemaJson = JSON.parse(schemaMatch[1]);
      assertEquals(schemaJson.name.type, 'string');
      assertEquals(schemaJson.age.minimum, 0);
    });

    it('should handle tool with minimal information', () => {
      const tool: RegisteredTool = {
        name: 'minimal_tool',
        definition: {
          title: 'Minimal',
          description: 'Basic tool',
          inputSchema: {},
        },
        handler: async () => ({ content: [] }),
        validator: {} as any,
        registeredAt: new Date(),
      };

      const documentation = mcpSDKHelpers.generateToolSchemaDoc(tool);

      assert(documentation.includes('# Minimal'));
      assert(documentation.includes('**Name:** `minimal_tool`'));
      assert(documentation.includes('**Description:** Basic tool'));
      assert(!documentation.includes('**Category:**'));
      assert(!documentation.includes('**Tags:**'));
      assert(!documentation.includes('**Version:**'));
    });
  });

  describe('Utility Functions', () => {
    it('should validate MCP server availability', () => {
      // Should not throw with valid server
      mcpSDKHelpers.validateSdkMcpServer();

      // Test with null server
      const helpersWithNullServer = new BeyondMcpSDKHelpers(null as any, mockLogger);

      try {
        helpersWithNullServer.validateSdkMcpServer();
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('MCP server not available'));
      }
    });

    it('should create standardized tool response', () => {
      const data = { message: 'Success', count: 42 };
      const meta = { requestId: 'test-123' };

      const response = mcpSDKHelpers.createToolResponse(data, meta);

      assertEquals(response.content.length, 1);
      const responseContent = response.content[0];
      assertExists(responseContent);
      assertEquals(responseContent.type, 'text');
      assertEquals(response._meta, meta);

      const parsedData = JSON.parse(responseContent.text as string);
      assertEquals(parsedData.message, 'Success');
      assertEquals(parsedData.count, 42);
    });

    it('should handle string data in tool response', () => {
      const stringData = 'Simple string response';

      const response = mcpSDKHelpers.createToolResponse(stringData);

      const responseContent = response.content[0];
      assertExists(responseContent);
      assertEquals(responseContent.text, 'Simple string response');
    });

    it('should create error tool response', () => {
      const error = new Error('Something went wrong');
      const meta = { errorCode: 'TEST_ERROR' };

      const response = mcpSDKHelpers.createErrorResponse(error, meta);

      assertEquals(response.isError, true);
      assertEquals(response._meta, meta);

      const errorContent = response.content[0];
      assertExists(errorContent);
      const errorData = JSON.parse(errorContent.text as string);
      assertEquals(errorData.error, 'Something went wrong');
      assertEquals(errorData.status, 'error');
      assertExists(errorData.timestamp);
    });

    it('should handle string errors', () => {
      const response = mcpSDKHelpers.createErrorResponse('String error message');

      const errorContent = response.content[0];
      assertExists(errorContent);
      const errorData = JSON.parse(errorContent.text as string);
      assertEquals(errorData.error, 'String error message');
    });

    it('should merge tool metadata', () => {
      const existing = { requestId: 'req-123', userId: 'user-456' };
      const additional = { sessionId: 'session-789', userId: 'user-updated' };

      const merged = mcpSDKHelpers.mergeToolMetadata(existing, additional);

      assertEquals(merged.requestId, 'req-123');
      assertEquals(merged.userId, 'user-updated'); // Additional should override
      assertEquals(merged.sessionId, 'session-789');
    });

    it('should handle empty metadata merge', () => {
      const result1 = mcpSDKHelpers.mergeToolMetadata(undefined, { test: true });
      assertEquals(result1.test, true);

      const result2 = mcpSDKHelpers.mergeToolMetadata({ test: true }, undefined);
      assertEquals(result2.test, true);

      const result3 = mcpSDKHelpers.mergeToolMetadata(undefined, undefined);
      assertEquals(Object.keys(result3).length, 0);
    });
  });

  describe('Request Creation Helpers', () => {
    it('should create sampling request with defaults', () => {
      const request = mcpSDKHelpers.createSamplingRequest('Hello, AI!', 'gpt-4');

      assertEquals(request.model, 'gpt-4');
      assertEquals(request.messages.length, 1);
      const firstMessage = request.messages[0];
      assertExists(firstMessage);
      assertEquals(firstMessage.role, 'user');
      assertEquals(firstMessage.content.text, 'Hello, AI!');
      assertEquals(request.maxTokens, 2000);
      assertEquals(request.temperature, 0.3);
    });

    it('should create sampling request with custom options', () => {
      const options = {
        maxTokens: 500,
        temperature: 0.8,
        topP: 0.9,
        _meta: { sessionId: 'test-session' },
      };

      const request = mcpSDKHelpers.createSamplingRequest('Custom prompt', 'claude-3', options);

      assertEquals(request.model, 'claude-3');
      assertEquals(request.maxTokens, 500);
      assertEquals(request.temperature, 0.8);
      assertEquals(request.topP, 0.9);
      assertEquals(request._meta?.sessionId, 'test-session');
    });

    it('should create elicitation request with validation', () => {
      const schema = {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['approved'],
      };

      const request = mcpSDKHelpers.createElicitationRequest('Approve this action?', schema);

      assertEquals(request.message, 'Approve this action?');
      assertEquals(request.requestedSchema, schema);
    });

    it('should validate schema in elicitation request', () => {
      try {
        mcpSDKHelpers.createElicitationRequest('Test', null);
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'requestedSchema must be a valid object');
      }

      try {
        mcpSDKHelpers.createElicitationRequest('Test', 'not an object');
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'requestedSchema must be a valid object');
      }
    });
  });

  describe('JSON Schema Parsing', () => {
    it('should parse valid JSON schema', () => {
      const schemaString = JSON.stringify({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      });

      const parsed = mcpSDKHelpers.parseJsonSchema(schemaString);

      assertEquals((parsed as any).type, 'object');
      assertExists((parsed as any).properties);
    });

    it('should handle invalid JSON', () => {
      try {
        mcpSDKHelpers.parseJsonSchema('invalid json');
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('Invalid JSON schema'));
      }
    });

    it('should validate schema is an object', () => {
      try {
        mcpSDKHelpers.parseJsonSchema('"string schema"');
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('Schema must be a valid object'));
      }

      try {
        mcpSDKHelpers.parseJsonSchema('null');
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('Schema must be a valid object'));
      }
    });
  });

  describe('MCP Capabilities', () => {
    it('should report available capabilities', () => {
      const capabilities = mcpSDKHelpers.getSdkMcpCapabilities();

      assertEquals(capabilities.serverAvailable, true);
      assertEquals(capabilities.supportsSampling, true);
      assertEquals(capabilities.supportsElicitation, true);
    });

    it('should handle missing server', () => {
      const helpersWithoutServer = new BeyondMcpSDKHelpers(null as any, mockLogger);

      const capabilities = helpersWithoutServer.getSdkMcpCapabilities();

      assertEquals(capabilities.serverAvailable, false);
      assertEquals(capabilities.supportsSampling, false);
      assertEquals(capabilities.supportsElicitation, false);
    });

    it('should handle partial server implementation', () => {
      const partialServer = {
        server: {
          createMessage: async () => ({ content: [] }),
          // Missing elicitInput
        },
      };

      const helpersWithPartialServer = new BeyondMcpSDKHelpers(partialServer as any, mockLogger);

      const capabilities = helpersWithPartialServer.getSdkMcpCapabilities();

      assertEquals(capabilities.serverAvailable, true);
      assertEquals(capabilities.supportsSampling, true);
      assertEquals(capabilities.supportsElicitation, false);
    });
  });

  describe('Tool Execution Context', () => {
    it('should create tool execution context', () => {
      const context = mcpSDKHelpers.createToolContext(
        'test_tool',
        { param1: 'value1', param2: 42 },
        { _meta: { sessionId: 'test-session' } },
      );

      assertEquals(context.toolName, 'test_tool');
      assertEquals(context.args.param1, 'value1');
      assertEquals(context.args.param2, 42);
      assertEquals((context.extra as any)?._meta?.sessionId, 'test-session');
      assertExists(context.requestId);
      assert(typeof context.startTime === 'number');
      assert(context.startTime <= Date.now());
    });

    it('should calculate execution time', () => {
      const startTime = Date.now() - 100; // 100ms ago

      const executionTime = mcpSDKHelpers.calculateExecutionTime(startTime);

      assert(executionTime >= 100);
      assert(executionTime < 200); // Should be reasonable
    });
  });

  describe('Logging and Debugging', () => {
    it('should log MCP operations', () => {
      const logSpy = spy(mockLogger, 'debug');

      mcpSDKHelpers.logMCPOperation('sampling', {
        model: 'test-model',
        promptLength: 50,
      });

      assertSpyCalls(logSpy, 1);

      const firstCall = logSpy.calls[0];
      assertExists(firstCall);
      const logArgs = firstCall.args;
      assert(logArgs[0].includes('sampling operation'));
      const logData = logArgs[1] as any;
      assertEquals(logData.operation, 'sampling');
      assertEquals(logData.model, 'test-model');
      assertEquals(logData.promptLength, 50);
      assertExists(logData.timestamp);

      logSpy.restore();
    });
  });
});
