/**
 * Enhanced WorkflowBase class for bb-mcp-server
 *
 * - Zod schema validation
 * - Plugin compatibility foundation
 * - Performance monitoring
 */

import { z, type ZodSchema } from 'zod';
import type { ConfigManager } from '../config/ConfigManager.ts';
import type { Logger } from '../utils/Logger.ts';
//import type { AuditLogger } from '../utils/AuditLogger.ts';
import type { KVManager } from '../storage/KVManager.ts';
//import type { ErrorHandler } from '../utils/ErrorHandler.ts';
import type {
  //BaseWorkflowParameters,
  FailedStep,
  WorkflowContext,
  WorkflowError,
  WorkflowRegistration,
  WorkflowResource,
  WorkflowResult,
  WorkflowStep,
  WorkflowValidationError,
  WorkflowValidationResult,
} from '../types/WorkflowTypes.ts';
import {
  type CreateMessageRequest,
  type CreateMessageResult,
  type ElicitInputRequest,
  type ElicitInputResult,
  type SendNotificationProgressRequest,
  type SendNotificationRequest,
} from '../types/BeyondMcpTypes.ts';
import { BeyondMcpServer } from '../server/BeyondMcpServer.ts';
import { getConfigManager, getKvManager, getLogger } from '../server/DependencyHelpers.ts';

import type { PluginCategory, RateLimitConfig } from '../types/PluginTypes.ts';

export interface WorkflowDependencies {
  logger: Logger;
  configManager: ConfigManager;
  kvManager: KVManager;
}

/**
 * Abstract base class for all workflows
 *
 * Enhanced with Zod validation, better error handling, and integration
 */
export abstract class WorkflowBase {
  protected startTime?: number;
  protected resources: WorkflowResource[] = [];

  // Required workflow metadata
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;
  abstract readonly category: PluginCategory;

  // Enhanced metadata
  abstract readonly tags: string[];
  readonly estimatedDuration?: number; // seconds
  readonly requiresAuth: boolean = true;
  readonly rateLimit?: RateLimitConfig;

  // Zod schema for parameter validation
  abstract readonly parameterSchema: ZodSchema<any>;

  protected logger!: Logger;
  protected configManager!: ConfigManager;
  protected kvManager!: KVManager;
  public readonly initialized: Promise<void>;

  constructor(dependencies?: WorkflowDependencies) {
    if (dependencies?.configManager && dependencies?.kvManager) {
      this.configManager = dependencies.configManager;
      this.logger = dependencies?.logger ?? getLogger(this.configManager);
      this.kvManager = dependencies.kvManager;
      this.logger.info('WorkflowBase: Initialized');
      this.initialized = Promise.resolve();
    } else {
      this.initialized = (async () => {
        try {
          this.configManager = dependencies?.configManager ?? await getConfigManager();
          this.logger = dependencies?.logger ?? getLogger(this.configManager);
          this.kvManager = dependencies?.kvManager ??
            await getKvManager(this.configManager, this.logger);
          this.logger.info('WorkflowBase: Initialized');
        } catch (error) {
          // Handle initialization errors appropriately
          console.error('Failed to initialize workflow dependencies:', error);
          throw error;
        }
      })();
    }

    //this.configManager = dependencies?.configManager ?? await getConfigManager();
    //this.logger = dependencies?.logger ?? getLogger(this.configManager);
    //this.kvManager = dependencies?.kvManager ?? getKvManager(this.configManager, this.logger);
    //this.logger.info('WorkflowBase: Initialized');
  }
  private async ensureInitialized() {
    await this.initialized;
  }

  /**
   * Get workflow registration information
   */
  abstract getRegistration(): WorkflowRegistration;

  /**
   * Get workflow overview for tool descriptions
   */
  abstract getOverview(): string;

  // used by tests to set spyLogger
  public setLogger(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Execute the workflow implementation
   */
  protected abstract executeWorkflow(
    params: any,
    context: WorkflowContext,
  ): Promise<WorkflowResult>;

  /**
   * Enhanced main execution with validation, logging, and error handling
   */
  async executeWithValidation(params: unknown, context: WorkflowContext): Promise<WorkflowResult> {
    this.startTime = performance.now();
    this.resources = [];
    await this.ensureInitialized();

    try {
      // Log workflow start
      this.logInfo('Workflow starting', {
        workflow: this.name,
        version: this.version,
        userId: context.userId,
        requestId: context.requestId,
        dryRun: (params as any)?.dryRun,
      }, context);

      // Validate parameters
      const validation = await this.validateParameters(params);
      if (!validation.valid) {
        return this.createValidationErrorResult(validation.errors);
      }

      // Log validation warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        this.logWarn('Parameter validation warnings', {
          warnings: validation.warnings,
        }, context);
      }

      // Before execution hook
      await this.onBeforeExecute?.(validation.data!, context);

      // Execute workflow within AsyncLocalStorage context for concurrent execution safety
      const result = await BeyondMcpServer.executeWithWorkflowContext(
        context,
        () => this.executeWorkflow(validation.data!, context),
      );

      // Execute workflow
      //const result = await this.executeWorkflow(validation.data!, context);

      // After execution hook
      await this.onAfterExecute?.(result, context);

      // Enhanced logging with performance data
      const duration = performance.now() - this.startTime;

      this.logInfo('Workflow completed', {
        workflow: this.name,
        success: result.success,
        duration_ms: duration,
        completed_steps: result.completed_steps.length,
        failed_steps: result.failed_steps.length,
        resources_used: this.resources.length,
      }, context);

      // Add performance data to result
      return {
        ...result,
        duration,
        resources: this.resources,
      };
    } catch (error) {
      await this.onError?.(error as Error, context);
      return this.createExecutionErrorResult(error as Error);
    } finally {
      // Audit log workflow execution
      await this.logWorkflowExecution(context);
    }
  }

  /**
   * Enhanced parameter validation with Zod
   */
  async validateParameters(params: unknown): Promise<WorkflowValidationResult<any>> {
    try {
      const validatedParams = await this.parameterSchema.parseAsync(params);
      return {
        valid: true,
        data: validatedParams,
        errors: [],
      };
    } catch (error) {
      const errors: WorkflowValidationError[] = [];

      if (error instanceof z.ZodError) {
        for (const issue of error.errors) {
          errors.push({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
            expected: 'expected' in issue ? String(issue.expected) : undefined,
            received: 'received' in issue ? String(issue.received) : undefined,
          });
        }
      } else {
        errors.push({
          path: '',
          message: 'Validation failed',
          code: 'unknown',
          expected: undefined,
          received: undefined,
        });
      }

      return {
        valid: false,
        errors,
      };
    }
  }

  /**
   * Track resource usage
   */
  protected trackResource(
    type: WorkflowResource['type'],
    name: string,
    startTime: number,
    status: WorkflowResource['status'],
    metadata?: Record<string, unknown>,
  ): void {
    this.resources.push({
      type,
      name,
      duration_ms: performance.now() - startTime,
      status,
      metadata,
    });
  }

  /**
   * Safe execution wrapper with resource tracking
   */
  protected async safeExecute<T>(
    operationName: string,
    operation: () => Promise<T>,
    resourceType: WorkflowResource['type'] = 'api_call',
  ): Promise<{ success: boolean; data?: T; error?: FailedStep }> {
    const startTime = performance.now();
    await this.ensureInitialized();

    try {
      const data = await operation();

      // Track successful resource usage
      this.trackResource(resourceType, operationName, startTime, 'success');

      return {
        success: true,
        data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Track failed resource usage
      this.trackResource(resourceType, operationName, startTime, 'failure', {
        error: errorMessage,
      });

      const failedStep: FailedStep = {
        operation: operationName,
        error_type: this.classifyError(error),
        message: errorMessage,
        details: (error instanceof Error ? error.stack : undefined) || 'No details available',
        timestamp: new Date().toISOString(),
      };

      return {
        success: false,
        error: failedStep,
      };
    }
  }

  protected async createMessage(
    request: CreateMessageRequest,
    sessionId?: string,
  ): Promise<CreateMessageResult> {
    const beyondMcpServer = BeyondMcpServer.getInstance();
    if (!beyondMcpServer) {
      this.logError('Cannot request sampling - no beyondMcpServer');
      return {};
    }

    try {
      const result = await beyondMcpServer.createMessage(
        request,
        sessionId,
      );

      this.logDebug('Sampling request sent', {
        request,
        sessionId,
      });
      return result;
    } catch (error) {
      this.logWarn('Failed to send Sampling request', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  /**
   * Send elicitation input request to client
   *
   * @param request - { message: string; requestedSchema: unknown }
   * @param message - Optional message describing current progress
   * @param sessionId - Optional sessionId
   */

  protected async elicitInput(
    request: ElicitInputRequest,
    sessionId?: string,
  ): Promise<ElicitInputResult> {
    const beyondMcpServer = BeyondMcpServer.getInstance();
    if (!beyondMcpServer) {
      this.logError('Cannot elicit input - no beyondMcpServer');
      throw new Error('Cannot elicit input - BeyondMcpServer not initialized');
    }

    try {
      const result = await beyondMcpServer.elicitInput(
        request,
        sessionId,
      );

      this.logDebug('Elicitation request sent', {
        request,
        sessionId,
      });
      return result;
    } catch (error) {
      this.logError('Failed to send elicitation input request', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Re-throw to force consumers to handle the error explicitly
      throw new Error(
        `Elicitation request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  protected async sendNotification(
    request: SendNotificationRequest,
    sessionId?: string,
  ): Promise<void> {
    const beyondMcpServer = BeyondMcpServer.getInstance();
    if (!beyondMcpServer) {
      this.logError('Cannot send notification - no beyondMcpServer');
      return;
    }

    try {
      await beyondMcpServer.sendNotification(
        request,
        sessionId,
      );

      this.logDebug('Notification sent', {
        request,
        sessionId,
      });
    } catch (error) {
      this.logWarn('Failed to send notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send progress notification to client (prevents timeout with resetTimeoutOnProgress)
   * Call this periodically during long-running operations
   *
   * @param progress - Progress value (0-100)
   * @param message - Optional message describing current progress
   * @param details - Optional additional details
   * @param sessionId - Optional sessionId
   */
  protected async sendNotificationProgress(
    request: SendNotificationProgressRequest,
    sessionId?: string,
  ): Promise<void> {
    const beyondMcpServer = BeyondMcpServer.getInstance();
    if (!beyondMcpServer) {
      this.logError('Cannot send progress - no beyondMcpServer');
      return;
    }

    // Automatically extract progressToken from AsyncLocalStorage if not provided
    // This is concurrency-safe - each workflow execution has its own context
    if (!request.progressToken) {
      const progressToken = BeyondMcpServer.getCurrentProgressToken();
      if (progressToken) {
        request = { ...request, progressToken };
        this.logDebug('Auto-extracted progressToken from AsyncLocalStorage', { progressToken });
      } else {
        this.logWarn(
          'No progressToken found in request or AsyncLocalStorage - progress may not be tracked by client',
        );
      }
    }
    this.logInfo('Sending Progress notification', {
      request,
      sessionId,
    });

    try {
      await beyondMcpServer.sendNotificationProgress(
        request,
        sessionId,
      );

      this.logDebug('Progress notification sent', {
        request,
        sessionId,
      });
    } catch (error) {
      this.logWarn('Failed to send progress notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Lifecycle hooks (optional overrides)
   */
  protected onBeforeExecute?(params: any, context: WorkflowContext): Promise<void>;
  protected onAfterExecute?(result: WorkflowResult, context: WorkflowContext): Promise<void>;
  protected onError?(error: Error, context: WorkflowContext): Promise<void>;

  /**
   * Create validation error result
   */
  protected createValidationErrorResult(errors: WorkflowValidationError[]): WorkflowResult {
    const errorMessages = errors.map((e) => `${e.path}: ${e.message}`).join(', ');

    return {
      success: false,
      error: {
        type: 'validation',
        message: `Parameter validation failed: ${errorMessages}`,
        details: JSON.stringify(errors, null, 2),
        code: undefined,
        stack: undefined,
        recoverable: true,
      },
      completed_steps: [],
      failed_steps: errors.map((e) => {
        const failedStep: FailedStep = {
          operation: 'parameter_validation',
          error_type: 'validation' as const,
          message: e.message,
          details: e.path || 'Unknown field',
          timestamp: new Date().toISOString(),
        };
        return failedStep;
      }),
      metadata: {
        validation_errors: errors,
      },
      duration: this.startTime ? performance.now() - this.startTime : 0,
      resources: this.resources,
    };
  }

  /**
   * Create execution error result
   */
  protected createExecutionErrorResult(error: Error): WorkflowResult {
    const duration = this.startTime ? performance.now() - this.startTime : 0;

    const workflowError: WorkflowError = {
      type: this.classifyError(error),
      message: error.message,
      details: error.stack,
      code: undefined,
      stack: error.stack,
      recoverable: this.isRecoverableError(error),
    };

    return {
      success: false,
      error: workflowError,
      completed_steps: [],
      failed_steps: [{
        operation: this.name,
        error_type: workflowError.type,
        message: error.message,
        details: error.stack || 'No stack trace available',
        timestamp: new Date().toISOString(),
      }],
      metadata: {
        execution_error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
      duration,
      resources: this.resources,
    };
  }

  /**
   * Create a standardized step result
   */
  protected createStepResult(
    operation: string,
    success: boolean,
    data?: unknown,
    startTime?: number,
  ): WorkflowStep {
    return {
      operation,
      success,
      data,
      duration_ms: startTime ? performance.now() - startTime : 0,
      timestamp: new Date().toISOString(),
    };
  }
  /**
   * Classify errors for better error handling
   */
  protected classifyError(error: unknown): WorkflowError['type'] {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('validation') || message.includes('invalid')) {
        return 'validation';
      }

      if (
        message.includes('auth') || message.includes('unauthorized') ||
        message.includes('forbidden')
      ) {
        return 'authentication';
      }

      if (message.includes('timeout')) {
        return 'timeout';
      }

      if (
        message.includes('api') || message.includes('request') || message.includes('response') ||
        message.includes('http') || message.includes('failed to create')
      ) {
        return 'api_error';
      }
    }

    return 'system_error';
  }

  /**
   * Determine if error is recoverable
   */
  protected isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network/timeout errors are usually recoverable
      if (
        message.includes('timeout') || message.includes('network') || message.includes('connection')
      ) {
        return true;
      }

      // Rate limit errors are recoverable
      if (message.includes('rate limit') || message.includes('429')) {
        return true;
      }

      // Server errors might be recoverable
      if (message.includes('500') || message.includes('502') || message.includes('503')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enhanced logging helpers with integration
   * Uses AsyncLocalStorage as fallback for concurrent execution safety
   */
  protected logInfo(
    message: string,
    data?: Record<string, unknown>,
    contextParam?: WorkflowContext,
  ): void {
    // Try this.context first (synchronous path), fall back to AsyncLocalStorage
    const context = contextParam ?? BeyondMcpServer.getCurrentWorkflowContext();
    this.logger.info(`WorkflowBase: [${this.name}] ${message}`, {
      workflow: this.name,
      userId: context?.userId,
      requestId: context?.requestId,
      ...data,
    });
  }

  protected logWarn(
    message: string,
    data?: Record<string, unknown>,
    contextParam?: WorkflowContext,
  ): void {
    const context = contextParam ?? BeyondMcpServer.getCurrentWorkflowContext();
    this.logger.warn(`WorkflowBase: [${this.name}] ${message}`, {
      workflow: this.name,
      userId: context?.userId,
      requestId: context?.requestId,
      ...data,
    });
  }

  protected logError(
    message: string,
    error?: Error,
    data?: Record<string, unknown>,
    contextParam?: WorkflowContext,
  ): void {
    const context = contextParam ?? BeyondMcpServer.getCurrentWorkflowContext();
    this.logger.error(`WorkflowBase: [${this.name}] ${message}`, error, {
      workflow: this.name,
      userId: context?.userId,
      requestId: context?.requestId,
      ...data,
    });
  }

  protected logDebug(
    message: string,
    data?: Record<string, unknown>,
    contextParam?: WorkflowContext,
  ): void {
    const context = contextParam ?? BeyondMcpServer.getCurrentWorkflowContext();
    this.logger.debug(`WorkflowBase: [${this.name}] ${message}`, {
      workflow: this.name,
      userId: context?.userId,
      requestId: context?.requestId,
      ...data,
    });
  }

  /**
   * Audit logging with AuditLogger integration
   * This logs the overall workflow execution (top-level run)
   */
  protected async logWorkflowExecution(context: WorkflowContext): Promise<void> {
    if (!context.auditLogger) {
      return;
    }

    try {
      const duration = this.startTime ? performance.now() - this.startTime : 0;

      await context.auditLogger.logWorkflowExecution({
        workflowName: this.name,
        operation: 'workflow_execution',
        success: this.determineAuditResult() === 'success',
        durationMs: duration,
        userId: context.userId,
        requestId: context.requestId,
        inputParams: {
          version: this.version,
          category: this.category,
          resources_used: this.resources.length,
        },
      });
    } catch (error) {
      this.logWarn('Failed to log workflow execution to audit log', { error });
    }
  }

  /**
   * Log individual workflow operation (step within a workflow)
   * Use this method to log specific operations during workflow execution
   */
  protected async logOperation(
    operationName: string,
    success: boolean,
    durationMs: number,
    context: WorkflowContext,
    details?: { inputParams?: unknown; outputResult?: unknown; error?: string },
  ): Promise<void> {
    if (!context.auditLogger) {
      return;
    }

    try {
      await context.auditLogger.logWorkflowOperation({
        workflowName: this.name,
        operation: operationName,
        success,
        durationMs,
        userId: context.userId,
        requestId: context.requestId,
        ...details,
      });
    } catch (error) {
      this.logWarn('Failed to log workflow operation to audit log', { error, operationName });
    }
  }

  /**
   * Determine audit result based on execution state
   */
  private determineAuditResult(): 'success' | 'failure' | 'partial' {
    // This will be determined by the actual execution result
    // For now, return success if no errors were thrown
    return 'success';
  }

  /**
   * Utility methods for workflow implementations
   */
  protected getEstimatedDuration(): number | undefined {
    return this.estimatedDuration;
  }

  protected getCategory(): PluginCategory {
    return this.category;
  }

  protected supportsDryRun(): boolean {
    return true; // Default implementation supports dry run
  }

  protected checkRateLimit(): boolean {
    // TODO: Implement rate limiting check
    // This would integrate with RateLimitManager
    return true;
  }
}
