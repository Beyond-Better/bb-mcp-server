/**
 * MockTool - Concrete ToolBase implementation for testing
 *
 * Provides a full implementation of ToolBase for comprehensive testing
 * of the abstract base class functionality.
 */

import { z, type ZodSchema } from 'zod';
import type { CallToolResult } from 'mcp/types.js';

import { ToolBase, type ToolContext } from '../../../../src/lib/tools/ToolBase.ts';
import type { ToolDefinition, ToolRegistration } from '../../../../src/lib/types/BeyondMcpTypes.ts';
import type { PluginCategory } from '../../../../src/lib/types/PluginTypes.ts';
import type { ToolRegistry } from '../../../../src/lib/tools/ToolRegistry.ts';

export class MockTool extends ToolBase {
  readonly name = 'mock_tool';
  readonly version = '1.0.0';
  readonly description = 'Mock tool for testing ToolBase functionality';
  readonly category: PluginCategory = 'utility';
  readonly tags = ['test', 'mock'];
  override readonly estimatedDuration = 5;
  override readonly requiresAuth = true;

  getTools(): ToolRegistration[] {
    return [
      {
        name: 'mock_echo',
        definition: {
          title: 'Mock Echo Tool',
          description: 'Echo input for testing',
          category: 'testing',
          tags: ['mock', 'echo'],
          inputSchema: {
            message: z.string().describe('Message to echo'),
          },
        } as ToolDefinition<{ message: z.ZodString }>,
        handler: this.handleEcho.bind(this),
      },
      {
        name: 'mock_process',
        definition: {
          title: 'Mock Process Tool',
          description: 'Process data for testing',
          category: 'testing',
          tags: ['mock', 'process'],
          inputSchema: {
            data: z.any().describe('Data to process'),
            operation: z.enum(['upper', 'lower', 'reverse']).describe('Operation to perform'),
          },
        } as ToolDefinition<
          { data: z.ZodAny; operation: z.ZodEnum<['upper', 'lower', 'reverse']> }
        >,
        handler: this.handleProcess.bind(this),
      },
    ];
  }

  registerWith(toolRegistry: ToolRegistry): void {
    const tools = this.getTools();
    tools.forEach((tool) => {
      toolRegistry.registerTool(tool.name, tool.definition, tool.handler);
    });
  }

  getOverview(): string {
    return 'Mock tool providing echo and processing functionality for testing ToolBase abstract class';
  }

  // Public test methods to access protected functionality
  public async testExecuteWithContext<T>(
    toolName: string,
    args: Record<string, unknown>,
    execution: (args: Record<string, unknown>, context: ToolContext) => Promise<T>,
    context?: Partial<ToolContext>,
  ) {
    return this.executeWithContext(toolName, args, execution, context);
  }

  public async testValidateParameters<T>(schema: ZodSchema<T>, params: unknown) {
    return this.validateParameters(schema, params);
  }

  public testCreateSuccessResponse(data: unknown, metadata?: Record<string, unknown>) {
    return this.createSuccessResponse(data, metadata);
  }

  public testCreateErrorResponse(error: Error | string, toolName?: string) {
    return this.createErrorResponse(error, toolName);
  }

  public testExtractUserContext(args: Record<string, unknown>, extra?: Record<string, unknown>) {
    return this.extractUserContext(args, extra);
  }

  public testSanitizeArgsForLogging(args: Record<string, unknown>) {
    return this.sanitizeArgsForLogging(args);
  }

  // Expose protected logging methods for testing
  public testLogInfo(message: string, data?: Record<string, unknown>) {
    this.logInfo(message, data);
  }

  public testLogWarn(message: string, data?: Record<string, unknown>) {
    this.logWarn(message, data);
  }

  public testLogError(message: string, error?: Error, data?: Record<string, unknown>) {
    this.logError(message, error, data);
  }

  public testLogDebug(message: string, data?: Record<string, unknown>) {
    this.logDebug(message, data);
  }

  // Access context for testing
  public getTestContext(): ToolContext | undefined {
    return this.context;
  }

  // Access start time for testing
  public getTestStartTime(): number | undefined {
    return this.startTime;
  }

  // Public methods to access protected utility methods
  public testGetToolCount(): number {
    return this.getToolCount();
  }

  public testGetToolNames(): string[] {
    return this.getToolNames();
  }

  public testGetCategory() {
    return this.getCategory();
  }

  public testSupportsAuth(): boolean {
    return this.supportsAuth();
  }

  public testGetEstimatedDuration(): number | undefined {
    return this.getEstimatedDuration();
  }

  // Tool handler implementations
  private async handleEcho(args: any): Promise<CallToolResult> {
    // Extract user context from arguments
    const userContext = this.extractUserContext(args);

    // Use executeWithContext for consistent behavior
    return this.executeWithContext(
      'mock_echo',
      args,
      async (validatedArgs) => {
        return { echo: validatedArgs.message };
      },
      userContext,
    );
  }

  private async handleProcess(args: any): Promise<CallToolResult> {
    // Extract user context from arguments
    const userContext = this.extractUserContext(args);

    return this.executeWithContext(
      'mock_process',
      args,
      async (validatedArgs) => {
        const { data, operation } = validatedArgs as {
          data: any;
          operation: 'upper' | 'lower' | 'reverse';
        };
        const stringData = String(data);

        let result: string;
        switch (operation) {
          case 'upper':
            result = stringData.toUpperCase();
            break;
          case 'lower':
            result = stringData.toLowerCase();
            break;
          case 'reverse':
            result = stringData.split('').reverse().join('');
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return { original: stringData, operation, result };
      },
      userContext,
    );
  }
}
