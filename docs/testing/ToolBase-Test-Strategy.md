# ToolBase Comprehensive Test Strategy

## Overview

ToolBase is an abstract class providing common functionality for tool implementations in the bb-mcp-server library. This strategy outlines comprehensive testing approaches for both the abstract base class and concrete implementations.

## Test Structure

### Directory Organization
```
tests/
├── unit/tools/
│   ├── ToolBase.test.ts           # Core ToolBase functionality
│   ├── ToolBase.integration.test.ts # Integration with ToolRegistry
│   └── mocks/
│       ├── MockTool.ts            # Concrete test implementation
│       └── MockToolRegistry.ts    # Enhanced tool registry mock
├── utils/
│   └── tool-test-helpers.ts       # Shared test utilities
```

## Test Implementation Classes

### 1. MockTool (Concrete ToolBase Implementation)
```typescript
export class MockTool extends ToolBase {
  readonly name = 'mock_tool'
  readonly version = '1.0.0'
  readonly description = 'Mock tool for testing ToolBase functionality'
  readonly category = 'utility' as const
  readonly tags = ['test', 'mock']
  readonly estimatedDuration = 5
  override readonly requiresAuth = true

  getTools(): ToolRegistration[] {
    return [{
      name: 'mock_echo',
      definition: {
        title: 'Mock Echo Tool',
        description: 'Echo input for testing',
        inputSchema: { message: z.string() },
        category: 'testing',
        tags: ['mock', 'echo']
      },
      handler: this.handleEcho.bind(this),
    }]
  }

  registerWith(toolRegistry: ToolRegistry): void {
    const tools = this.getTools()
    tools.forEach(tool => {
      toolRegistry.registerTool(tool.name, tool.definition, tool.handler)
    })
  }

  getOverview(): string {
    return 'Mock tool providing echo functionality for testing ToolBase'
  }

  // Public test methods to access protected functionality
  public async testExecuteWithContext<T>(
    toolName: string,
    args: Record<string, unknown>,
    execution: (args: Record<string, unknown>, context: ToolContext) => Promise<T>,
    context?: Partial<ToolContext>
  ) {
    return this.executeWithContext(toolName, args, execution, context)
  }

  public async testValidateParameters<T>(schema: ZodSchema<T>, params: unknown) {
    return this.validateParameters(schema, params)
  }

  public testCreateSuccessResponse(data: unknown, metadata?: Record<string, unknown>) {
    return this.createSuccessResponse(data, metadata)
  }

  public testCreateErrorResponse(error: Error | string, toolName?: string) {
    return this.createErrorResponse(error, toolName)
  }

  public testExtractUserContext(args: Record<string, unknown>, extra?: Record<string, unknown>) {
    return this.extractUserContext(args, extra)
  }

  public testSanitizeArgsForLogging(args: Record<string, unknown>) {
    return this.sanitizeArgsForLogging(args)
  }

  private async handleEcho(args: { message: string }): Promise<CallToolResult> {
    return {
      content: [{ type: 'text', text: args.message }]
    }
  }
}
```

### 2. FailingMockTool (Error Testing)
```typescript
export class FailingMockTool extends ToolBase {
  readonly name = 'failing_tool'
  readonly version = '1.0.0'
  readonly description = 'Tool that fails for error testing'
  readonly category = 'utility' as const
  readonly tags = ['test', 'error']
  override readonly requiresAuth = false

  getTools(): ToolRegistration[] {
    return [{
      name: 'failing_operation',
      definition: {
        title: 'Failing Operation',
        description: 'Always fails for testing',
        inputSchema: { shouldFail: z.boolean().default(true) },
      },
      handler: this.handleFailure.bind(this),
    }]
  }

  registerWith(toolRegistry: ToolRegistry): void {
    // Intentionally empty for some tests
  }

  getOverview(): string {
    return 'Tool designed to fail for error handling tests'
  }

  private async handleFailure(): Promise<never> {
    throw new Error('Intentional failure for testing')
  }
}
```

## Core Test Categories

### 1. Abstract Method Implementation Tests
```typescript
describe('ToolBase Abstract Methods', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should implement getTools() returning valid ToolRegistration array', () => {
    const tools = mockTool.getTools()
    assertEquals(tools.length, 1)
    assertEquals(tools[0].name, 'mock_echo')
    assert(typeof tools[0].handler === 'function')
    assertExists(tools[0].definition)
  })

  it('should implement registerWith() for ToolRegistry integration', () => {
    const mockRegistry = createMockToolRegistry()
    const registerSpy = spy(mockRegistry, 'registerTool')
    
    mockTool.registerWith(mockRegistry)
    
    assertSpyCalls(registerSpy, 1)
    assertEquals(registerSpy.calls[0].args[0], 'mock_echo')
  })

  it('should implement getOverview() returning descriptive string', () => {
    const overview = mockTool.getOverview()
    assert(typeof overview === 'string')
    assert(overview.length > 0)
  })
})
```

### 2. Context Management Tests
```typescript
describe('ToolBase Context Management', () => {
  let mockTool: MockTool
  let mockLogger: Logger
  let mockAuditLogger: AuditLogger

  beforeEach(() => {
    mockTool = new MockTool()
    mockLogger = createMockLogger()
    mockAuditLogger = createMockAuditLogger()
  })

  it('should create ToolContext with all provided properties', async () => {
    const partialContext: Partial<ToolContext> = {
      userId: 'test-user',
      requestId: 'test-request',
      clientId: 'test-client',
      logger: mockLogger,
      auditLogger: mockAuditLogger
    }

    let capturedContext: ToolContext | undefined

    await mockTool.testExecuteWithContext(
      'test-tool',
      {},
      async (args, context) => {
        capturedContext = context
        return 'success'
      },
      partialContext
    )

    assertExists(capturedContext)
    assertEquals(capturedContext.userId, 'test-user')
    assertEquals(capturedContext.requestId, 'test-request')
    assertEquals(capturedContext.clientId, 'test-client')
    assertEquals(capturedContext.logger, mockLogger)
    assertEquals(capturedContext.auditLogger, mockAuditLogger)
    assertExists(capturedContext.startTime)
  })

  it('should generate requestId when not provided', async () => {
    let capturedContext: ToolContext | undefined

    await mockTool.testExecuteWithContext(
      'test-tool',
      {},
      async (args, context) => {
        capturedContext = context
        return 'success'
      }
    )

    assertExists(capturedContext)
    assertExists(capturedContext.requestId)
    assert(capturedContext.requestId.length > 0)
  })

  it('should use fallback logger when none provided', async () => {
    let capturedContext: ToolContext | undefined

    await mockTool.testExecuteWithContext(
      'test-tool',
      {},
      async (args, context) => {
        capturedContext = context
        return 'success'
      }
    )

    assertExists(capturedContext)
    assertExists(capturedContext.logger)
    assert(typeof capturedContext.logger.info === 'function')
  })
})
```

### 3. Parameter Validation Tests
```typescript
describe('ToolBase Parameter Validation', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should validate correct parameters successfully', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().int().positive(),
      email: z.string().email().optional()
    })

    const params = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    }

    const result = await mockTool.testValidateParameters(schema, params)
    
    assertEquals(result.success, true)
    if (result.success) {
      assertEquals(result.data.name, 'John Doe')
      assertEquals(result.data.age, 30)
      assertEquals(result.data.email, 'john@example.com')
    }
  })

  it('should return detailed error for invalid parameters', async () => {
    const schema = z.object({
      name: z.string().min(2),
      age: z.number().int().positive()
    })

    const params = {
      name: 'A', // Too short
      age: -5,   // Negative
      extra: 'ignored' // Extra property
    }

    const result = await mockTool.testValidateParameters(schema, params)
    
    assertEquals(result.success, false)
    if (!result.success) {
      assert(result.error.includes('name'))
      assert(result.error.includes('age'))
    }
  })

  it('should handle default values in schema', async () => {
    const schema = z.object({
      message: z.string(),
      priority: z.enum(['low', 'medium', 'high']).default('medium')
    })

    const params = { message: 'test' }

    const result = await mockTool.testValidateParameters(schema, params)
    
    assertEquals(result.success, true)
    if (result.success) {
      assertEquals(result.data.priority, 'medium')
    }
  })
})
```

### 4. Execution Wrapper Tests
```typescript
describe('ToolBase Execution Wrapper', () => {
  let mockTool: MockTool
  let mockLogger: SpyLogger
  let mockAuditLogger: SpyAuditLogger

  beforeEach(() => {
    mockTool = new MockTool()
    mockLogger = new SpyLogger()
    mockAuditLogger = new SpyAuditLogger()
  })

  it('should execute successfully and return formatted result', async () => {
    const result = await mockTool.testExecuteWithContext(
      'test-operation',
      { input: 'test' },
      async (args) => ({ output: 'processed', input: args.input }),
      { logger: mockLogger, auditLogger: mockAuditLogger }
    )

    assertEquals(result.content.length, 1)
    assertEquals(result.content[0].type, 'text')
    assert(result.content[0].text.includes('"output":"processed"'))
    assertExists(result.executionTime)
    assertExists(result.metadata)
    assertEquals(result.metadata.tool, 'test-operation')
  })

  it('should log execution start and completion', async () => {
    await mockTool.testExecuteWithContext(
      'logged-operation',
      { param: 'value' },
      async () => 'result',
      { logger: mockLogger }
    )

    assert(mockLogger.infoCalls.some(call => 
      call[0].includes('Tool execution started: logged-operation')
    ))
    assert(mockLogger.infoCalls.some(call => 
      call[0].includes('Tool execution completed: logged-operation')
    ))
  })

  it('should create audit log entries for successful execution', async () => {
    await mockTool.testExecuteWithContext(
      'audited-operation',
      {},
      async () => 'success',
      { logger: mockLogger, auditLogger: mockAuditLogger }
    )

    assertEquals(mockAuditLogger.systemEvents.length, 1)
    const auditEvent = mockAuditLogger.systemEvents[0]
    assertEquals(auditEvent.event, 'tool_execution')
    assertEquals(auditEvent.severity, 'info')
    assertEquals(auditEvent.details.tool, 'audited-operation')
    assertEquals(auditEvent.details.result, 'success')
  })

  it('should handle execution errors gracefully', async () => {
    const result = await mockTool.testExecuteWithContext(
      'failing-operation',
      {},
      async () => {
        throw new Error('Test execution failure')
      },
      { logger: mockLogger, auditLogger: mockAuditLogger }
    )

    assertEquals(result.isError, true)
    assert(result.content[0].text.includes('Test execution failure'))
    assertExists(result.executionTime)
    
    // Should log error
    assert(mockLogger.errorCalls.some(call => 
      call[0].includes('Tool execution failed: failing-operation')
    ))
    
    // Should create failure audit entry
    assertEquals(mockAuditLogger.systemEvents.length, 1)
    assertEquals(mockAuditLogger.systemEvents[0].details.result, 'failure')
  })

  it('should handle non-Error exceptions', async () => {
    const result = await mockTool.testExecuteWithContext(
      'string-error-operation',
      {},
      async () => {
        throw 'String error message'
      },
      { logger: mockLogger }
    )

    assertEquals(result.isError, true)
    assert(result.content[0].text.includes('String error message'))
  })
})
```

### 5. Response Formatting Tests
```typescript
describe('ToolBase Response Formatting', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should create success response for string data', () => {
    const result = mockTool.testCreateSuccessResponse('Simple string response')
    
    assertEquals(result.content.length, 1)
    assertEquals(result.content[0].type, 'text')
    assertEquals(result.content[0].text, 'Simple string response')
  })

  it('should create success response for object data', () => {
    const data = { status: 'ok', count: 42 }
    const result = mockTool.testCreateSuccessResponse(data)
    
    assertEquals(result.content[0].type, 'text')
    assert(result.content[0].text.includes('"status": "ok"'))
    assert(result.content[0].text.includes('"count": 42'))
  })

  it('should include metadata in success response', () => {
    const metadata = { timestamp: '2024-01-01', version: '1.0' }
    const result = mockTool.testCreateSuccessResponse('data', metadata)
    
    assertEquals(result._meta, metadata)
  })

  it('should create error response from Error object', () => {
    const error = new Error('Something went wrong')
    const result = mockTool.testCreateErrorResponse(error, 'test-tool')
    
    assertEquals(result.isError, true)
    assert(result.content[0].text.includes('Tool execution error in test-tool'))
    assert(result.content[0].text.includes('Something went wrong'))
  })

  it('should create error response from string', () => {
    const result = mockTool.testCreateErrorResponse('String error message')
    
    assertEquals(result.isError, true)
    assert(result.content[0].text.includes('Tool error: String error message'))
  })
})
```

### 6. User Context Extraction Tests
```typescript
describe('ToolBase User Context Extraction', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should extract user context from args with standard keys', () => {
    const args = {
      userId: 'user-123',
      requestId: 'req-456',
      clientId: 'client-789',
      otherData: 'value'
    }

    const context = mockTool.testExtractUserContext(args)
    
    assertEquals(context.userId, 'user-123')
    assertEquals(context.requestId, 'req-456')
    assertEquals(context.clientId, 'client-789')
  })

  it('should extract user context from args with snake_case keys', () => {
    const args = {
      user_id: 'user-123',
      request_id: 'req-456'
    }

    const context = mockTool.testExtractUserContext(args)
    
    assertEquals(context.userId, 'user-123')
    assertEquals(context.requestId, 'req-456')
  })

  it('should extract user context from extra parameter', () => {
    const args = {}
    const extra = {
      userId: 'extra-user',
      requestId: 'extra-req'
    }

    const context = mockTool.testExtractUserContext(args, extra)
    
    assertEquals(context.userId, 'extra-user')
    assertEquals(context.requestId, 'extra-req')
  })

  it('should prioritize args over extra', () => {
    const args = { userId: 'args-user' }
    const extra = { userId: 'extra-user' }

    const context = mockTool.testExtractUserContext(args, extra)
    
    assertEquals(context.userId, 'args-user')
  })

  it('should return empty object when no context available', () => {
    const context = mockTool.testExtractUserContext({})
    
    assertEquals(Object.keys(context).length, 0)
  })
})
```

### 7. Security and Sanitization Tests
```typescript
describe('ToolBase Security and Sanitization', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should sanitize password fields', () => {
    const args = {
      username: 'john',
      password: 'secret123',
      data: 'public'
    }

    const sanitized = mockTool.testSanitizeArgsForLogging(args)
    
    assertEquals(sanitized.username, 'john')
    assertEquals(sanitized.password, '[REDACTED]')
    assertEquals(sanitized.data, 'public')
  })

  it('should sanitize various sensitive field names', () => {
    const args = {
      apiKey: 'key123',
      auth_token: 'token456',
      secretValue: 'secret789',
      authorizationHeader: 'Bearer xyz',
      credential: 'cred123'
    }

    const sanitized = mockTool.testSanitizeArgsForLogging(args)
    
    assertEquals(sanitized.apiKey, '[REDACTED]')
    assertEquals(sanitized.auth_token, '[REDACTED]')
    assertEquals(sanitized.secretValue, '[REDACTED]')
    assertEquals(sanitized.authorizationHeader, '[REDACTED]')
    assertEquals(sanitized.credential, '[REDACTED]')
  })

  it('should preserve non-sensitive data', () => {
    const args = {
      name: 'John',
      email: 'john@example.com',
      publicData: { visible: true }
    }

    const sanitized = mockTool.testSanitizeArgsForLogging(args)
    
    assertEquals(sanitized.name, 'John')
    assertEquals(sanitized.email, 'john@example.com')
    assertEquals(sanitized.publicData, { visible: true })
  })
})
```

### 8. Logging Integration Tests
```typescript
describe('ToolBase Logging Integration', () => {
  let mockTool: MockTool
  let mockLogger: SpyLogger

  beforeEach(() => {
    mockTool = new MockTool()
    mockLogger = new SpyLogger()
    
    // Set up context for logging tests
    mockTool['context'] = {
      userId: 'log-user',
      requestId: 'log-request',
      startTime: new Date(),
      logger: mockLogger
    }
  })

  it('should log info with proper context', () => {
    mockTool['logInfo']('Test info message', { extra: 'data' })
    
    assertEquals(mockLogger.infoCalls.length, 1)
    const [message, data] = mockLogger.infoCalls[0]
    assert(message.includes('[mock_tool] Test info message'))
    assertEquals(data.toolClass, 'mock_tool')
    assertEquals(data.userId, 'log-user')
    assertEquals(data.requestId, 'log-request')
    assertEquals(data.extra, 'data')
  })

  it('should log warnings with proper context', () => {
    mockTool['logWarn']('Test warning', { level: 'high' })
    
    assertEquals(mockLogger.warnCalls.length, 1)
    const [message, data] = mockLogger.warnCalls[0]
    assert(message.includes('[mock_tool] Test warning'))
    assertEquals(data.level, 'high')
  })

  it('should log errors with Error objects', () => {
    const error = new Error('Test error')
    mockTool['logError']('Error occurred', error, { context: 'test' })
    
    assertEquals(mockLogger.errorCalls.length, 1)
    const [message, errorObj, data] = mockLogger.errorCalls[0]
    assert(message.includes('[mock_tool] Error occurred'))
    assertEquals(errorObj, error)
    assertEquals(data.context, 'test')
  })

  it('should log debug messages', () => {
    mockTool['logDebug']('Debug info', { debug: true })
    
    assertEquals(mockLogger.debugCalls.length, 1)
    const [message, data] = mockLogger.debugCalls[0]
    assert(message.includes('[mock_tool] Debug info'))
    assertEquals(data.debug, true)
  })
})
```

### 9. Utility Methods Tests
```typescript
describe('ToolBase Utility Methods', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should return correct tool count', () => {
    assertEquals(mockTool.getToolCount(), 1)
  })

  it('should return tool names array', () => {
    const names = mockTool.getToolNames()
    assertEquals(names.length, 1)
    assertEquals(names[0], 'mock_echo')
  })

  it('should return tool category', () => {
    assertEquals(mockTool.getCategory(), 'utility')
  })

  it('should return auth support status', () => {
    assertEquals(mockTool.supportsAuth(), true)
  })

  it('should return estimated duration', () => {
    assertEquals(mockTool.getEstimatedDuration(), 5)
  })

  it('should handle tools without estimated duration', () => {
    class NoEstimationTool extends MockTool {
      override readonly estimatedDuration = undefined
    }
    
    const tool = new NoEstimationTool()
    assertEquals(tool.getEstimatedDuration(), undefined)
  })
})
```

### 10. Integration Tests with ToolRegistry
```typescript
describe('ToolBase Integration with ToolRegistry', () => {
  let mockTool: MockTool
  let toolRegistry: MockToolRegistry
  let logger: SpyLogger

  beforeEach(() => {
    mockTool = new MockTool()
    logger = new SpyLogger()
    toolRegistry = new MockToolRegistry()
  })

  it('should register tools successfully with registry', () => {
    mockTool.registerWith(toolRegistry as any)
    
    assert(toolRegistry.hasTools())
    assertEquals(toolRegistry.getToolNames().length, 1)
    assertEquals(toolRegistry.getToolNames()[0], 'mock_echo')
  })

  it('should execute registered tools through registry', async () => {
    mockTool.registerWith(toolRegistry as any)
    
    const registeredTool = toolRegistry.getRegisteredTool('mock_echo')
    assertExists(registeredTool)
    
    const result = await registeredTool.handler({ message: 'test' })
    assertEquals(result.content[0].text, 'test')
  })
})
```

## Edge Cases and Error Scenarios

### 1. Malformed Input Tests
```typescript
describe('ToolBase Edge Cases', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should handle null/undefined parameters gracefully', async () => {
    const schema = z.object({ required: z.string() })
    
    const nullResult = await mockTool.testValidateParameters(schema, null)
    assertEquals(nullResult.success, false)
    
    const undefinedResult = await mockTool.testValidateParameters(schema, undefined)
    assertEquals(undefinedResult.success, false)
  })

  it('should handle circular objects in responses', () => {
    const circular: any = { name: 'test' }
    circular.self = circular
    
    // Should not throw, should handle gracefully
    const result = mockTool.testCreateSuccessResponse(circular)
    assertExists(result.content[0].text)
  })
})
```

### 2. Performance Tests
```typescript
describe('ToolBase Performance', () => {
  let mockTool: MockTool

  beforeEach(() => {
    mockTool = new MockTool()
  })

  it('should handle large parameter validation efficiently', async () => {
    const schema = z.object({
      items: z.array(z.object({
        id: z.string(),
        data: z.string()
      })).max(1000)
    })

    const largeParams = {
      items: Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        data: `data-${i}`.repeat(100)
      }))
    }

    const startTime = Date.now()
    const result = await mockTool.testValidateParameters(schema, largeParams)
    const duration = Date.now() - startTime

    assertEquals(result.success, true)
    assert(duration < 1000, `Validation took ${duration}ms, should be under 1000ms`)
  })

  it('should handle concurrent executions', async () => {
    const executions = Array.from({ length: 10 }, (_, i) => 
      mockTool.testExecuteWithContext(
        `concurrent-${i}`,
        { index: i },
        async (args) => `Result ${args.index}`,
        { userId: `user-${i}` }
      )
    )

    const results = await Promise.all(executions)
    
    assertEquals(results.length, 10)
    results.forEach((result, i) => {
      assert(result.content[0].text.includes(`Result ${i}`))
    })
  })
})
```

## Test Data and Fixtures

### Mock Data Generator
```typescript
export const TestData = {
  validToolArgs: () => ({
    userId: 'test-user-' + Math.random().toString(36).substr(2, 8),
    requestId: 'test-req-' + Math.random().toString(36).substr(2, 8),
    message: 'Test message'
  }),

  invalidToolArgs: () => ({
    // Missing required fields
    invalidField: 'should-not-exist'
  }),

  sensitiveArgs: () => ({
    username: 'testuser',
    password: 'secret123',
    apiKey: 'key-abc123',
    normalData: 'public-info'
  }),

  complexSchema: () => z.object({
    user: z.object({
      id: z.string().uuid(),
      name: z.string().min(2).max(50),
      email: z.string().email(),
      age: z.number().int().min(0).max(120).optional()
    }),
    action: z.enum(['create', 'update', 'delete']),
    metadata: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime().default(() => new Date().toISOString())
  })
}
```

## Test Execution Guidelines

### 1. Test Organization
- Group tests by functionality (validation, execution, logging, etc.)
- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Test edge cases and error conditions

### 2. Mock Management
- Create reusable mock objects for common dependencies
- Use spies to verify method calls and interactions
- Reset mocks between tests to avoid interference
- Create specialized mocks for different test scenarios

### 3. Assertion Strategy
- Use specific assertions rather than general ones
- Verify both success conditions and error states
- Check not just return values but also side effects (logging, audit trails)
- Test performance characteristics where relevant

### 4. Coverage Requirements
- Aim for 100% line coverage on ToolBase methods
- Cover all code paths including error branches
- Test all public and protected methods
- Verify proper integration with external dependencies

## Implementation Notes

1. **Abstract Testing**: Since ToolBase is abstract, all tests require concrete implementations (MockTool, FailingMockTool)

2. **Context Management**: Tests must carefully manage ToolContext to verify proper state handling

3. **Async Operations**: Many ToolBase methods are async, requiring proper Promise handling in tests

4. **Security Testing**: Sensitive data sanitization is critical and requires comprehensive testing

5. **Integration Points**: Tests should verify proper integration with ToolRegistry, Logger, and AuditLogger

6. **Performance Considerations**: Include performance tests for large data sets and concurrent operations

This comprehensive test strategy ensures robust testing of the ToolBase class while providing patterns for testing concrete tool implementations.