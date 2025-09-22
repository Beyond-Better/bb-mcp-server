/**
 * Enhanced WorkflowBase class for bb-mcp-server
 * 
 * Extracted and enhanced from ActionStep MCP Server with:
 * - Zod schema validation
 * - Better Phase 1 integration (Logger, AuditLogger, ErrorHandler)
 * - Plugin compatibility foundation
 * - Performance monitoring
 */

import { z, type ZodSchema } from 'zod'
import type { Logger } from '../utils/Logger.ts'
import type { AuditLogger } from '../utils/AuditLogger.ts'
import type { ErrorHandler } from '../utils/ErrorHandler.ts'
import type {
  BaseWorkflowParameters,
  WorkflowResult,
  WorkflowContext,
  ValidationResult,
  WorkflowRegistration,
  WorkflowStep,
  FailedStep,
  WorkflowError,
  WorkflowCategory,
  RateLimitConfig,
  WorkflowResource,
  ValidationError,
} from './WorkflowTypes.ts'

/**
 * Abstract base class for all workflows
 * 
 * Enhanced with Zod validation, better error handling, and Phase 1 integration
 */
export abstract class WorkflowBase {
  protected context?: WorkflowContext
  protected startTime?: number
  protected resources: WorkflowResource[] = []
  
  // Required workflow metadata
  abstract readonly name: string
  abstract readonly version: string
  abstract readonly description: string
  abstract readonly category: WorkflowCategory
  
  // Enhanced metadata
  abstract readonly tags: string[]
  readonly estimatedDuration?: number // seconds
  readonly requiresAuth: boolean = true
  readonly rateLimit?: RateLimitConfig
  
  // Zod schema for parameter validation
  abstract readonly parameterSchema: ZodSchema<any>
  
  /**
   * Get workflow registration information
   */
  abstract getRegistration(): WorkflowRegistration
  
  /**
   * Get workflow overview for tool descriptions
   */
  abstract getOverview(): string
  
  /**
   * Execute the workflow implementation
   */
  protected abstract executeWorkflow(params: any, context: WorkflowContext): Promise<WorkflowResult>
  
  /**
   * Enhanced main execution with validation, logging, and error handling
   */
  async executeWithValidation(params: unknown, context: WorkflowContext): Promise<WorkflowResult> {
    this.context = context
    this.startTime = Date.now()
    this.resources = []
    
    try {
      // Log workflow start
      this.logInfo('Workflow starting', {
        workflow: this.name,
        version: this.version,
        userId: context.userId,
        requestId: context.requestId,
        dryRun: (params as any)?.dryRun,
      })
      
      // Validate parameters
      const validation = await this.validateParameters(params)
      if (!validation.valid) {
        return this.createValidationErrorResult(validation.errors)
      }
      
      // Log validation warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        this.logWarn('Parameter validation warnings', {
          warnings: validation.warnings,
        })
      }
      
      // Before execution hook
      await this.onBeforeExecute?.(validation.data!, context)
      
      // Execute workflow
      const result = await this.executeWorkflow(validation.data!, context)
      
      // After execution hook
      await this.onAfterExecute?.(result, context)
      
      // Enhanced logging with performance data
      const duration = Date.now() - this.startTime
      this.logInfo('Workflow completed', {
        workflow: this.name,
        success: result.success,
        duration_ms: duration,
        completed_steps: result.completed_steps.length,
        failed_steps: result.failed_steps.length,
        resources_used: this.resources.length,
      })
      
      // Add performance data to result
      return {
        ...result,
        duration,
        resources: this.resources,
      }
      
    } catch (error) {
      await this.onError?.(error as Error, context)
      return this.createExecutionErrorResult(error as Error)
    } finally {
      // Audit log workflow execution
      await this.logWorkflowExecution(context)
    }
  }
  
  /**
   * Enhanced parameter validation with Zod
   */
  async validateParameters(params: unknown): Promise<ValidationResult<any>> {
    try {
      const validatedParams = await this.parameterSchema.parseAsync(params)
      return {
        valid: true,
        data: validatedParams,
        errors: [],
      }
    } catch (error) {
      const errors: ValidationError[] = []
      
      if (error instanceof z.ZodError) {
        for (const issue of error.errors) {
          errors.push({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
            expected: 'expected' in issue ? String(issue.expected) : undefined,
            received: 'received' in issue ? String(issue.received) : undefined,
          })
        }
      } else {
        errors.push({
          path: '',
          message: 'Validation failed',
          code: 'unknown',
          expected: undefined,
          received: undefined,
        })
      }
      
      return {
        valid: false,
        errors,
      }
    }
  }
  
  /**
   * Lifecycle hooks (optional overrides)
   */
  protected onBeforeExecute?(params: any, context: WorkflowContext): Promise<void>
  protected onAfterExecute?(result: WorkflowResult, context: WorkflowContext): Promise<void>
  protected onError?(error: Error, context: WorkflowContext): Promise<void>
  
  /**
   * Create validation error result
   */
  protected createValidationErrorResult(errors: ValidationError[]): WorkflowResult {
    const errorMessages = errors.map(e => `${e.path}: ${e.message}`).join(', ')
    
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
      failed_steps: errors.map(e => {
        const failedStep: FailedStep = {
          operation: 'parameter_validation',
          error_type: 'validation' as const,
          message: e.message,
          details: e.path || 'Unknown field',
          timestamp: new Date().toISOString(),
        }
        return failedStep
      }),
      metadata: {
        validation_errors: errors,
      },
      duration: this.startTime ? Date.now() - this.startTime : 0,
      resources: this.resources,
    }
  }
  
  /**
   * Create execution error result
   */
  protected createExecutionErrorResult(error: Error): WorkflowResult {
    const duration = this.startTime ? Date.now() - this.startTime : 0
    
    const workflowError: WorkflowError = {
      type: this.classifyError(error),
      message: error.message,
      details: error.stack,
      code: undefined,
      stack: error.stack,
      recoverable: this.isRecoverableError(error),
    }
    
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
    }
  }
  
  /**
   * Create a standardized step result
   */
  protected createStepResult(
    operation: string,
    success: boolean,
    data?: unknown,
    startTime?: number
  ): WorkflowStep {
    return {
      operation,
      success,
      data,
      duration_ms: startTime ? Date.now() - startTime : 0,
      timestamp: new Date().toISOString(),
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
    metadata?: Record<string, unknown>
  ): void {
    this.resources.push({
      type,
      name,
      duration_ms: Date.now() - startTime,
      status,
      metadata,
    })
  }
  
  /**
   * Safe execution wrapper with resource tracking
   */
  protected async safeExecute<T>(
    operationName: string,
    operation: () => Promise<T>,
    resourceType: WorkflowResource['type'] = 'api_call'
  ): Promise<{ success: boolean; data?: T; error?: FailedStep }> {
    const startTime = Date.now()
    
    try {
      const data = await operation()
      
      // Track successful resource usage
      this.trackResource(resourceType, operationName, startTime, 'success')
      
      return {
        success: true,
        data,
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Track failed resource usage
      this.trackResource(resourceType, operationName, startTime, 'failure', {
        error: errorMessage,
      })
      
      const failedStep: FailedStep = {
        operation: operationName,
        error_type: this.classifyError(error),
        message: errorMessage,
        details: (error instanceof Error ? error.stack : undefined) || 'No details available',
        timestamp: new Date().toISOString(),
      }
      
      return {
        success: false,
        error: failedStep,
      }
    }
  }
  
  /**
   * Classify errors for better error handling
   */
  protected classifyError(error: unknown): WorkflowError['type'] {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      
      if (message.includes('validation') || message.includes('invalid')) {
        return 'validation'
      }
      
      if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
        return 'authentication'
      }
      
      if (message.includes('timeout')) {
        return 'timeout'
      }
      
      if (message.includes('api') || message.includes('request') || message.includes('response') ||
          message.includes('http') || message.includes('failed to create')) {
        return 'api_error'
      }
    }
    
    return 'system_error'
  }
  
  /**
   * Determine if error is recoverable
   */
  protected isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      
      // Network/timeout errors are usually recoverable
      if (message.includes('timeout') || message.includes('network') || message.includes('connection')) {
        return true
      }
      
      // Rate limit errors are recoverable
      if (message.includes('rate limit') || message.includes('429')) {
        return true
      }
      
      // Server errors might be recoverable
      if (message.includes('500') || message.includes('502') || message.includes('503')) {
        return true
      }
    }
    
    return false
  }
  
  /**
   * Enhanced logging helpers with Phase 1 integration
   */
  protected logInfo(message: string, data?: Record<string, unknown>): void {
    this.context?.logger?.info(`[${this.name}] ${message}`, {
      workflow: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }
  
  protected logWarn(message: string, data?: Record<string, unknown>): void {
    this.context?.logger?.warn(`[${this.name}] ${message}`, {
      workflow: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }
  
  protected logError(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.context?.logger?.error(`[${this.name}] ${message}`, error, {
      workflow: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }
  
  protected logDebug(message: string, data?: Record<string, unknown>): void {
    this.context?.logger?.debug(`[${this.name}] ${message}`, {
      workflow: this.name,
      userId: this.context.userId,
      requestId: this.context.requestId,
      ...data,
    })
  }
  
  /**
   * Audit logging with Phase 1 AuditLogger integration
   */
  protected async logWorkflowExecution(context: WorkflowContext): Promise<void> {
    if (!context.auditLogger) {
      return
    }
    
    try {
      const duration = this.startTime ? Date.now() - this.startTime : 0
      
      await context.auditLogger.logWorkflowOperation({
        timestamp: new Date().toISOString(),
        userId: context.userId,
        workflow: this.name,
        requestId: context.requestId,
        action: 'workflow_execution',
        details: {
          version: this.version,
          category: this.category,
          duration_ms: duration,
          resources_used: this.resources.length,
        },
        result: this.determineAuditResult(),
        durationMs: duration,
        resources: this.resources,
      })
    } catch (error) {
      this.logWarn('Failed to log workflow execution to audit log', { error })
    }
  }
  
  /**
   * Determine audit result based on execution state
   */
  private determineAuditResult(): 'success' | 'failure' | 'partial' {
    // This will be determined by the actual execution result
    // For now, return success if no errors were thrown
    return 'success'
  }
  
  /**
   * Utility methods for workflow implementations
   */
  protected getEstimatedDuration(): number | undefined {
    return this.estimatedDuration
  }
  
  protected getCategory(): WorkflowCategory {
    return this.category
  }
  
  protected supportsDryRun(): boolean {
    return true // Default implementation supports dry run
  }
  
  protected checkRateLimit(): boolean {
    // TODO: Implement rate limiting check
    // This would integrate with RateLimitManager from Phase 4/5
    return true
  }
}