/**
 * FailingMockTool - Tool that fails for error testing
 * 
 * Provides various failure scenarios to test error handling
 * in ToolBase abstract class.
 */

import { z } from 'zod';
import type { CallToolResult } from 'mcp/types.js';

import { ToolBase } from '../../../../src/lib/tools/ToolBase.ts';
import type { 
  ToolDefinition,
  ToolRegistration
} from '../../../../src/lib/types/BeyondMcpTypes.ts';
import type { PluginCategory } from '../../../../src/lib/types/PluginTypes.ts';
import type { ToolRegistry } from '../../../../src/lib/tools/ToolRegistry.ts';

export class FailingMockTool extends ToolBase {
  readonly name = 'failing_tool';
  readonly version = '1.0.0';
  readonly description = 'Tool that fails for error testing';
  readonly category: PluginCategory = 'utility';
  readonly tags = ['test', 'error'];
  override readonly requiresAuth = false;

  // Configuration for different failure modes
  public failOnGetTools = false;
  public failOnRegisterWith = false;
  public failOnGetOverview = false;
  public failOnExecution = true; // Default to failing on execution

  getTools(): ToolRegistration[] {
    if (this.failOnGetTools) {
      throw new Error('Intentional failure in getTools()');
    }

    return [
      {
        name: 'failing_operation',
        definition: {
          title: 'Failing Operation',
          description: 'Always fails for testing',
          category: 'testing',
          tags: ['test', 'error'],
          inputSchema: {
            shouldFail: z.boolean().default(true).describe('Whether to fail'),
            errorType: z.enum(['Error', 'string', 'object']).default('Error').describe('Type of error to throw'),
            errorMessage: z.string().default('Intentional failure for testing').describe('Error message'),
          },
        } as ToolDefinition<{ 
          shouldFail: z.ZodDefault<z.ZodBoolean>;
          errorType: z.ZodDefault<z.ZodEnum<['Error', 'string', 'object']>>;
          errorMessage: z.ZodDefault<z.ZodString>;
        }>,
        handler: this.handleFailure.bind(this),
      },
      {
        name: 'slow_failing_operation',
        definition: {
          title: 'Slow Failing Operation',
          description: 'Fails after a delay for testing timeouts',
          category: 'testing',
          tags: ['test', 'error', 'timeout'],
          inputSchema: {
            delay: z.number().default(100).describe('Delay in milliseconds before failing'),
          },
        } as ToolDefinition<{ delay: z.ZodDefault<z.ZodNumber> }>,
        handler: this.handleSlowFailure.bind(this),
      },
    ];
  }

  registerWith(toolRegistry: ToolRegistry): void {
    if (this.failOnRegisterWith) {
      throw new Error('Intentional failure in registerWith()');
    }

    // Intentionally empty for some tests - should be handled gracefully
    // This tests scenarios where tools don't properly register
  }

  getOverview(): string {
    if (this.failOnGetOverview) {
      throw new Error('Intentional failure in getOverview()');
    }
    
    return 'Tool designed to fail for error handling tests';
  }

  // Tool handler implementations that fail in various ways
  private async handleFailure(args: { shouldFail?: boolean; errorType?: 'Error' | 'string' | 'object'; errorMessage?: string }): Promise<CallToolResult> {
    // Use executeWithContext to ensure proper error handling
    return this.executeWithContext(
      'failing_operation',
      args,
      async (validatedArgs) => {
        const { shouldFail = true, errorType = 'Error', errorMessage = 'Intentional failure for testing' } = validatedArgs as typeof args;

        if (!shouldFail) {
          return { success: true, message: 'Tool did not fail as requested' };
        }

        // Throw different types of errors for testing
        switch (errorType) {
          case 'Error':
            throw new Error(errorMessage);
          case 'string':
            throw errorMessage;
          case 'object':
            throw { message: errorMessage, type: 'custom_error' };
          default:
            throw new Error('Unknown error type');
        }
      }
    );
  }

  private async handleSlowFailure(args: { delay?: number }): Promise<CallToolResult> {
    // Use executeWithContext to ensure proper error handling
    return this.executeWithContext(
      'slow_failing_operation',
      args,
      async (validatedArgs) => {
        const { delay = 100 } = validatedArgs as typeof args;
        
        // Wait for the specified delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        throw new Error(`Slow failure after ${delay}ms delay`);
      }
    );
  }

  // Public methods for controlling failure modes in tests
  public setFailOnGetTools(fail: boolean): void {
    this.failOnGetTools = fail;
  }

  public setFailOnRegisterWith(fail: boolean): void {
    this.failOnRegisterWith = fail;
  }

  public setFailOnGetOverview(fail: boolean): void {
    this.failOnGetOverview = fail;
  }

  public setFailOnExecution(fail: boolean): void {
    this.failOnExecution = fail;
  }

  // Access to test protected methods like MockTool
  public async testExecuteWithContext<T>(
    toolName: string,
    args: Record<string, unknown>,
    execution: (args: Record<string, unknown>, context: any) => Promise<T>,
    context?: any
  ) {
    return this.executeWithContext(toolName, args, execution, context);
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
}