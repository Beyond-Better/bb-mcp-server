/**
 * Tool Validation Helper - Utilities for consistent tool validation and error handling
 *
 * Provides helper functions for:
 * - Common validation patterns
 * - Standardized error responses
 * - Consistent logging patterns
 * - Workflow parameter schemas
 */

import { z, type ZodObject, type ZodSchema } from 'zod';
import type { CallToolResult } from 'mcp/types.js';
import type { WorkflowRegistration } from '../types/WorkflowTypes.ts';
import type { Logger } from './Logger.ts';

/**
 * Helper utilities for tool validation and error handling
 */
export class ToolValidationHelper {
  /**
   * Create workflow parameter schema with standard fields
   */
  static createWorkflowParameterSchema(workflows: WorkflowRegistration[]): ZodObject<any> {
    if (workflows.length === 0) {
      throw new Error('Cannot create workflow parameter schema with no workflows');
    }

    return z.object({
      workflow_name: z.enum(workflows.map((w) => w.name) as [string, ...string[]]).describe(
        'Workflow to execute',
      ),
      parameters: z.object({
        userId: z.string().describe(
          'User ID for authentication and audit logging (required for all workflows)',
        ),
        requestId: z.string().optional().describe('Optional request ID for tracking'),
        dryRun: z.boolean().optional().default(false).describe(
          'Dry run mode - validate but do not execute',
        ),
      }).passthrough().describe('Workflow-specific parameters'),
    });
  }

  /**
   * Create standard error response for tools
   */
  static createStandardErrorResponse(error: Error, toolName: string): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: `Tool execution error in ${toolName}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Create validation error response
   */
  static createValidationErrorResponse(
    validationError: string,
    toolName: string,
    args?: Record<string, unknown>,
  ): CallToolResult {
    const errorDetails = args ? `\n\nProvided arguments: ${JSON.stringify(args, null, 2)}` : '';

    return {
      content: [
        {
          type: 'text',
          text: `Validation error in ${toolName}: ${validationError}${errorDetails}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Create success response with structured data
   */
  static createSuccessResponse(
    data: unknown,
    metadata?: Record<string, unknown>,
  ): CallToolResult {
    const result = {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      ...(metadata || {}),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Validate required parameters exist
   */
  static validateRequiredParameters(
    args: Record<string, unknown>,
    requiredParams: string[],
  ): { isValid: boolean; missingParams: string[] } {
    const missingParams = requiredParams.filter((param) => {
      const value = args[param];
      return value === undefined || value === null || value === '';
    });

    return {
      isValid: missingParams.length === 0,
      missingParams,
    };
  }

  /**
   * Log tool execution start with consistent format
   */
  static logToolExecutionStart(
    logger: Logger,
    toolName: string,
    args: Record<string, unknown>,
    userId?: string,
    requestId?: string,
  ): void {
    logger.info(`Tool execution started: ${toolName}`, {
      tool: toolName,
      userId,
      requestId,
      argumentKeys: Object.keys(args),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log tool execution success with consistent format
   */
  static logToolExecutionSuccess(
    logger: Logger,
    toolName: string,
    executionTimeMs: number,
    userId?: string,
    requestId?: string,
    metadata?: Record<string, unknown>,
  ): void {
    logger.info(`Tool execution completed: ${toolName}`, {
      tool: toolName,
      userId,
      requestId,
      status: 'success',
      executionTimeMs,
      timestamp: new Date().toISOString(),
      ...(metadata || {}),
    });
  }

  /**
   * Log tool execution error with consistent format
   */
  static logToolExecutionError(
    logger: Logger,
    toolName: string,
    error: Error,
    executionTimeMs: number,
    userId?: string,
    requestId?: string,
  ): void {
    logger.error(`Tool execution failed: ${toolName}`, error, {
      tool: toolName,
      userId,
      requestId,
      status: 'failed',
      executionTimeMs,
      errorType: error.constructor.name,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Create a timed tool execution wrapper
   * Provides consistent timing, logging, and error handling
   */
  static async executeWithTiming<T>(
    logger: Logger,
    toolName: string,
    args: Record<string, unknown>,
    execution: () => Promise<T>,
    userId?: string,
    requestId?: string,
  ): Promise<{ result: T; executionTimeMs: number }> {
    const startTime = performance.now();

    try {
      ToolValidationHelper.logToolExecutionStart(logger, toolName, args, userId, requestId);

      const result = await execution();
      const executionTimeMs = performance.now() - startTime;

      ToolValidationHelper.logToolExecutionSuccess(
        logger,
        toolName,
        executionTimeMs,
        userId,
        requestId,
      );

      return { result, executionTimeMs };
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      const toolError = error instanceof Error ? error : new Error(String(error));

      ToolValidationHelper.logToolExecutionError(
        logger,
        toolName,
        toolError,
        executionTimeMs,
        userId,
        requestId,
      );

      throw toolError;
    }
  }

  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  static sanitizeArgsForLogging(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...args };
    const sensitiveKeys = [
      'password',
      'token',
      'apiKey',
      'secret',
      'key',
      'credential',
      'auth',
      'authorization',
    ];

    Object.keys(sanitized).forEach((key) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Extract user context from tool arguments and extra parameters
   */
  static extractUserContext(
    args: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): { userId?: string; requestId?: string; clientId?: string } {
    const userId = (args.userId || args.user_id || extra?.userId) as string | undefined;
    const requestId = (
      args.requestId ||
      args.request_id ||
      extra?.requestId ||
      extra?.request_id
    ) as string | undefined;
    const clientId = (args.clientId || extra?.clientId) as string | undefined;

    const result: { userId?: string; requestId?: string; clientId?: string } = {};
    if (userId) result.userId = userId;
    if (requestId) result.requestId = requestId;
    if (clientId) result.clientId = clientId;

    return result;
  }

  /**
   * Validate workflow-specific parameters
   */
  static validateWorkflowParameters(parameters: Record<string, unknown>): {
    isValid: boolean;
    errors: string[];
    userId?: string;
    requestId?: string;
    dryRun?: boolean;
  } {
    const errors: string[] = [];

    // Check required userId
    const userId = parameters.userId as string | undefined;
    if (!userId || typeof userId !== 'string') {
      errors.push('parameters.userId is required and must be a string');
    }

    // Validate optional requestId
    const requestId = parameters.requestId as string | undefined;
    if (requestId !== undefined && typeof requestId !== 'string') {
      errors.push('parameters.requestId must be a string if provided');
    }

    // Validate optional dryRun
    const dryRun = parameters.dryRun as boolean | undefined;
    if (dryRun !== undefined && typeof dryRun !== 'boolean') {
      errors.push('parameters.dryRun must be a boolean if provided');
    }

    const result: {
      isValid: boolean;
      errors: string[];
      userId?: string;
      requestId?: string;
      dryRun?: boolean;
    } = {
      isValid: errors.length === 0,
      errors,
      dryRun: dryRun || false,
    };

    if (userId) result.userId = userId;
    if (requestId) result.requestId = requestId;

    return result;
  }

  /**
   * Create workflow not found error response
   */
  static createWorkflowNotFoundResponse(
    workflowName: string,
    availableWorkflows: string[],
  ): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Workflow not found',
              requestedWorkflow: workflowName,
              availableWorkflows: availableWorkflows.sort(),
              suggestion: availableWorkflows.length > 0
                ? `Did you mean: ${availableWorkflows[0]}?`
                : 'No workflows are currently registered',
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
