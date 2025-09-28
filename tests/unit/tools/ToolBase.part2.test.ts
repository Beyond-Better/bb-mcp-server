/**
 * Unit Tests for ToolBase - Part 2
 * Continuation of comprehensive ToolBase testing
 * Response formatting, context extraction, security, logging, utilities, and integration tests
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy } from '@std/testing/mock';
import { z } from 'zod';

// Import components
import { ToolBase, type ToolContext } from '../../../src/lib/tools/ToolBase.ts';
import { ToolRegistry } from '../../../src/lib/tools/ToolRegistry.ts';
import type { Logger } from '../../../src/lib/utils/Logger.ts';

// Import test helpers and mocks
import {
  createMockLogger,
  createMockToolRegistry,
  SpyLogger,
  SpyAuditLogger,
} from '../../utils/test-helpers.ts';

// Import test implementations
import { MockTool } from './mocks/MockTool.ts';
import { FailingMockTool } from './mocks/FailingMockTool.ts';

describe('ToolBase Response Formatting', () => {
  let mockTool: MockTool;

  beforeEach(() => {
    mockTool = new MockTool();
  });

  it('should create success response for string data', () => {
    const result = mockTool.testCreateSuccessResponse('Simple string response');
    
    assertEquals(result.content.length, 1);
    assertEquals(result.content[0].type, 'text');
    assertEquals(result.content[0].text, 'Simple string response');
    assertEquals(result.isError, undefined);
  });

  it('should create success response for object data', () => {
    const data = { status: 'ok', count: 42, nested: { value: 'test' } };
    const result = mockTool.testCreateSuccessResponse(data);
    
    assertEquals(result.content[0].type, 'text');
    assert(result.content[0].text.includes('"status": "ok"'));
    assert(result.content[0].text.includes('"count": 42'));
    assert(result.content[0].text.includes('"nested"'));
    // Should be properly formatted JSON
    assert(result.content[0].text.includes('\n'));
  });

  it('should include metadata in success response', () => {
    const metadata = { timestamp: '2024-01-01', version: '1.0', source: 'test' };
    const result = mockTool.testCreateSuccessResponse('data', metadata);
    
    assertEquals(result._meta, metadata);
    assertEquals(result._meta.timestamp, '2024-01-01');
    assertEquals(result._meta.version, '1.0');
  });

  it('should create error response from Error object', () => {
    const error = new Error('Something went wrong');
    const result = mockTool.testCreateErrorResponse(error, 'test-tool');
    
    assertEquals(result.isError, true);
    assert(result.content[0].text.includes('Tool execution error in test-tool'));
    assert(result.content[0].text.includes('Something went wrong'));
  });

  it('should create error response from string', () => {
    const result = mockTool.testCreateErrorResponse('String error message');
    
    assertEquals(result.isError, true);
    assert(result.content[0].text.includes('Tool error: String error message'));
  });

  it('should handle complex objects with circular references gracefully', () => {
    const circular: any = { name: 'test', value: 42 };
    circular.self = circular;
    
    // Should not throw, should handle gracefully
    const result = mockTool.testCreateSuccessResponse(circular);
    assertExists(result.content[0].text);
    assert(result.content[0].text.length > 0);
  });

  it('should handle null and undefined data', () => {
    const nullResult = mockTool.testCreateSuccessResponse(null);
    assertEquals(nullResult.content[0].text, 'null');
    
    const undefinedResult = mockTool.testCreateSuccessResponse(undefined);
    assertEquals(undefinedResult.content[0].text, 'undefined');
  });

  it('should handle arrays and nested data structures', () => {
    const complexData = {
      items: [1, 2, 3],
      metadata: { count: 3 },
      flags: [true, false, true]
    };
    
    const result = mockTool.testCreateSuccessResponse(complexData);
    assert(result.content[0].text.includes('"items"'));
    assert(result.content[0].text.includes('[1, 2, 3]'));
  });
});

describe('ToolBase User Context Extraction', () => {
  let mockTool: MockTool;

  beforeEach(() => {
    mockTool = new MockTool();
  });

  it('should extract user context from args with standard keys', () => {
    const args = {
      userId: 'user-123',
      requestId: 'req-456',
      clientId: 'client-789',
      otherData: 'value'
    };

    const context = mockTool.testExtractUserContext(args);
    
    assertEquals(context.userId, 'user-123');
    assertEquals(context.requestId, 'req-456');
    assertEquals(context.clientId, 'client-789');
  });

  it('should extract user context from args with snake_case keys', () => {
    const args = {
      user_id: 'user-123',
      request_id: 'req-456'
    };

    const context = mockTool.testExtractUserContext(args);
    
    assertEquals(context.userId, 'user-123');
    assertEquals(context.requestId, 'req-456');
  });

  it('should extract user context from extra parameter', () => {
    const args = {};
    const extra = {
      userId: 'extra-user',
      requestId: 'extra-req',
      clientId: 'extra-client'
    };

    const context = mockTool.testExtractUserContext(args, extra);
    
    assertEquals(context.userId, 'extra-user');
    assertEquals(context.requestId, 'extra-req');
    assertEquals(context.clientId, 'extra-client');
  });

  it('should prioritize args over extra', () => {
    const args = { userId: 'args-user', requestId: 'args-req' };
    const extra = { userId: 'extra-user', requestId: 'extra-req', clientId: 'extra-client' };

    const context = mockTool.testExtractUserContext(args, extra);
    
    assertEquals(context.userId, 'args-user');
    assertEquals(context.requestId, 'args-req');
    assertEquals(context.clientId, 'extra-client'); // Only from extra
  });

  it('should return empty object when no context available', () => {
    const context = mockTool.testExtractUserContext({});
    
    assertEquals(Object.keys(context).length, 0);
  });

  it('should handle mixed key formats', () => {
    const args = {
      userId: 'user-camel',
      request_id: 'req-snake'
    };

    const context = mockTool.testExtractUserContext(args);
    
    assertEquals(context.userId, 'user-camel');
    assertEquals(context.requestId, 'req-snake');
  });

  it('should ignore non-string context values', () => {
    const args = {
      userId: 123, // Number instead of string
      requestId: null, // Null value
      clientId: undefined // Undefined value
    };

    const context = mockTool.testExtractUserContext(args);
    
    // Should only return defined string values
    assertEquals(Object.keys(context).length, 0);
  });
});

describe('ToolBase Security and Sanitization', () => {
  let mockTool: MockTool;

  beforeEach(() => {
    mockTool = new MockTool();
  });

  it('should sanitize password fields', () => {
    const args = {
      username: 'john',
      password: 'secret123',
      data: 'public'
    };

    const sanitized = mockTool.testSanitizeArgsForLogging(args);
    
    assertEquals(sanitized.username, 'john');
    assertEquals(sanitized.password, '[REDACTED]');
    assertEquals(sanitized.data, 'public');
  });

  it('should sanitize various sensitive field names', () => {
    const args = {
      apiKey: 'key123',
      auth_token: 'token456',
      secretValue: 'secret789',
      authorizationHeader: 'Bearer xyz',
      credential: 'cred123',
      ACCESS_TOKEN: 'access123'
    };

    const sanitized = mockTool.testSanitizeArgsForLogging(args);
    
    assertEquals(sanitized.apiKey, '[REDACTED]');
    assertEquals(sanitized.auth_token, '[REDACTED]');
    assertEquals(sanitized.secretValue, '[REDACTED]');
    assertEquals(sanitized.authorizationHeader, '[REDACTED]');
    assertEquals(sanitized.credential, '[REDACTED]');
    assertEquals(sanitized.ACCESS_TOKEN, '[REDACTED]');
  });

  it('should preserve non-sensitive data', () => {
    const args = {
      name: 'John',
      email: 'john@example.com',
      publicData: { visible: true },
      settings: { theme: 'dark' }
    };

    const sanitized = mockTool.testSanitizeArgsForLogging(args);
    
    assertEquals(sanitized.name, 'John');
    assertEquals(sanitized.email, 'john@example.com');
    assertEquals(sanitized.publicData, { visible: true });
    assertEquals(sanitized.settings, { theme: 'dark' });
  });

  it('should handle nested objects (shallow sanitization)', () => {
    const args = {
      config: {
        apiKey: 'nested-secret', // This won't be sanitized (only top-level)
        setting: 'value'
      },
      password: 'top-level-secret' // This will be sanitized
    };

    const sanitized = mockTool.testSanitizeArgsForLogging(args);
    
    assertEquals(sanitized.password, '[REDACTED]');
    assertEquals(sanitized.config.apiKey, 'nested-secret'); // Not sanitized
    assertEquals(sanitized.config.setting, 'value');
  });

  it('should handle case-insensitive sensitive key matching', () => {
    const args = {
      PASSWORD: 'upper123',
      Token: 'mixed123',
      secret: 'lower123'
    };

    const sanitized = mockTool.testSanitizeArgsForLogging(args);
    
    assertEquals(sanitized.PASSWORD, '[REDACTED]');
    assertEquals(sanitized.Token, '[REDACTED]');
    assertEquals(sanitized.secret, '[REDACTED]');
  });

  it('should preserve original object structure', () => {
    const originalArgs = {
      username: 'test',
      password: 'secret'
    };

    const sanitized = mockTool.testSanitizeArgsForLogging(originalArgs);
    
    // Original should not be modified
    assertEquals(originalArgs.password, 'secret');
    // Sanitized should be modified
    assertEquals(sanitized.password, '[REDACTED]');
  });
});

describe('ToolBase Logging Integration', () => {
  let mockTool: MockTool;
  let mockLogger: SpyLogger;

  beforeEach(() => {
    mockTool = new MockTool();
    mockLogger = new SpyLogger();
    
    // Set up context for logging tests
    mockTool['context'] = {
      userId: 'log-user',
      requestId: 'log-request',
      startTime: new Date(),
      logger: mockLogger
    };
  });

  it('should log info with proper context', () => {
    mockTool.testLogInfo('Test info message', { extra: 'data' });
    
    assertEquals(mockLogger.infoCalls.length, 1);
    const [message, data] = mockLogger.infoCalls[0];
    assert(message.includes('[mock_tool] Test info message'));
    assertEquals(data.toolClass, 'mock_tool');
    assertEquals(data.userId, 'log-user');
    assertEquals(data.requestId, 'log-request');
    assertEquals(data.extra, 'data');
  });

  it('should log warnings with proper context', () => {
    mockTool.testLogWarn('Test warning', { level: 'high' });
    
    assertEquals(mockLogger.warnCalls.length, 1);
    const [message, data] = mockLogger.warnCalls[0];
    assert(message.includes('[mock_tool] Test warning'));
    assertEquals(data.level, 'high');
    assertEquals(data.toolClass, 'mock_tool');
  });

  it('should log errors with Error objects', () => {
    const error = new Error('Test error');
    mockTool.testLogError('Error occurred', error, { context: 'test' });
    
    assertEquals(mockLogger.errorCalls.length, 1);
    const [message, errorObj, data] = mockLogger.errorCalls[0];
    assert(message.includes('[mock_tool] Error occurred'));
    assertEquals(errorObj, error);
    assertEquals(data.context, 'test');
    assertEquals(data.toolClass, 'mock_tool');
  });

  it('should log debug messages', () => {
    mockTool.testLogDebug('Debug info', { debug: true });
    
    assertEquals(mockLogger.debugCalls.length, 1);
    const [message, data] = mockLogger.debugCalls[0];
    assert(message.includes('[mock_tool] Debug info'));
    assertEquals(data.debug, true);
    assertEquals(data.toolClass, 'mock_tool');
  });

  it('should handle logging without context gracefully', () => {
    // Clear context
    mockTool['context'] = undefined;
    
    // Should not throw
    mockTool.testLogInfo('No context message');
    
    // Logger should not be called if no context
    assertEquals(mockLogger.infoCalls.length, 0);
  });

  it('should include consistent tool identification in all logs', () => {
    mockTool.testLogInfo('Info message');
    mockTool.testLogWarn('Warn message');
    mockTool.testLogError('Error message');
    mockTool.testLogDebug('Debug message');
    
    // All log calls should include [mock_tool] prefix
    assert(mockLogger.infoCalls[0][0].includes('[mock_tool]'));
    assert(mockLogger.warnCalls[0][0].includes('[mock_tool]'));
    assert(mockLogger.errorCalls[0][0].includes('[mock_tool]'));
    assert(mockLogger.debugCalls[0][0].includes('[mock_tool]'));
  });
});

describe('ToolBase Utility Methods', () => {
  let mockTool: MockTool;
  let failingTool: FailingMockTool;

  beforeEach(() => {
    mockTool = new MockTool();
    failingTool = new FailingMockTool();
  });

  it('should return correct tool count', () => {
    assertEquals(mockTool.getToolCount(), 2); // mock_echo + mock_process
    assertEquals(failingTool.getToolCount(), 2); // failing_operation + slow_failing_operation
  });

  it('should return tool names array', () => {
    const names = mockTool.getToolNames();
    assertEquals(names.length, 2);
    assert(names.includes('mock_echo'));
    assert(names.includes('mock_process'));
  });

  it('should return tool category', () => {
    assertEquals(mockTool.getCategory(), 'utility');
    assertEquals(failingTool.getCategory(), 'utility');
  });

  it('should return auth support status', () => {
    assertEquals(mockTool.supportsAuth(), true);
    assertEquals(failingTool.supportsAuth(), false);
  });

  it('should return estimated duration', () => {
    assertEquals(mockTool.getEstimatedDuration(), 5);
    assertEquals(failingTool.getEstimatedDuration(), undefined);
  });

  it('should handle tools without estimated duration', () => {
    class NoEstimationTool extends MockTool {
      override readonly estimatedDuration = undefined;
    }
    
    const tool = new NoEstimationTool();
    assertEquals(tool.getEstimatedDuration(), undefined);
  });

  it('should provide consistent metadata access', () => {
    // Test that utility methods return consistent data with class properties
    assertEquals(mockTool.name, 'mock_tool');
    assertEquals(mockTool.version, '1.0.0');
    assertEquals(mockTool.description.length > 0, true);
    assertEquals(Array.isArray(mockTool.tags), true);
    assert(mockTool.tags.length > 0);
  });
});

// Continue in next part for integration tests and performance tests...