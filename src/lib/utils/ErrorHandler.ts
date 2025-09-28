/**
 * Error Handler - Standardized error handling for bb-mcp-server library
 *
 * Provides error classification, formatting, recovery suggestions, and
 * structured error responses for consistent error handling across MCP servers.
 */

import type { Logger } from './Logger.ts';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  EXTERNAL_API = 'external_api',
  STORAGE = 'storage',
  TRANSPORT = 'transport',
  WORKFLOW = 'workflow',
  CONFIGURATION = 'configuration',
  INTERNAL = 'internal',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
}

/**
 * Recovery action suggestions
 */
export enum RecoveryAction {
  RETRY = 'retry',
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  REFRESH_TOKEN = 'refresh_token',
  RECONFIGURE = 'reconfigure',
  CONTACT_SUPPORT = 'contact_support',
  IGNORE = 'ignore',
  USER_ACTION_REQUIRED = 'user_action_required',
  FALLBACK = 'fallback',
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryAction: RecoveryAction;
  details?: Record<string, unknown>;
  timestamp: number;
  context?: {
    userId?: string;
    requestId?: string;
    workflowName?: string;
    component?: string;
    [key: string]: unknown;
  };
}

/**
 * Base error class with structured information
 */
export class MCPError extends Error {
  readonly info: ErrorInfo;
  override readonly cause?: Error;

  constructor(info: Omit<ErrorInfo, 'timestamp'>, cause?: Error) {
    super(info.message);
    this.name = 'MCPError';
    this.info = {
      ...info,
      timestamp: Date.now(),
    };
    if (cause) {
      this.cause = cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError);
    }
  }

  /**
   * Get error as JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      info: this.info,
      stack: this.stack,
      cause: this.cause
        ? {
          name: this.cause.name,
          message: this.cause.message,
          stack: this.cause.stack,
        }
        : undefined,
    };
  }

  /**
   * Check if this error should be retried
   */
  shouldRetry(): boolean {
    return [
      RecoveryAction.RETRY,
      RecoveryAction.RETRY_WITH_BACKOFF,
      RecoveryAction.REFRESH_TOKEN,
    ].includes(this.info.recoveryAction);
  }

  /**
   * Check if this is a user error (vs system error)
   */
  isUserError(): boolean {
    return [
      ErrorCategory.VALIDATION,
      ErrorCategory.AUTHENTICATION,
      ErrorCategory.AUTHORIZATION,
      ErrorCategory.NOT_FOUND,
      ErrorCategory.CONFLICT,
    ].includes(this.info.category);
  }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
  private static logger?: Logger;
  private static contextExtractors: Array<(error: Error) => Record<string, unknown>> = [];

  /**
   * Set logger for error reporting
   */
  static setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Add context extractor function
   */
  static addContextExtractor(extractor: (error: Error) => Record<string, unknown>): void {
    this.contextExtractors.push(extractor);
  }

  /**
   * Handle and classify an error
   */
  static handleError(
    error: Error | MCPError,
    context?: Record<string, unknown>,
  ): MCPError {
    // If it's already an MCPError, just add context and log
    if (error instanceof MCPError) {
      if (context) {
        error.info.context = { ...error.info.context, ...context };
      }
      this.logError(error);
      return error;
    }

    // Classify the error
    const errorInfo = this.classifyError(error);

    // Add context
    if (context) {
      errorInfo.context = { ...errorInfo.context, ...context };
    }

    // Extract additional context from error
    for (const extractor of this.contextExtractors) {
      try {
        const additionalContext = extractor(error);
        errorInfo.context = { ...errorInfo.context, ...additionalContext };
      } catch {
        // Ignore context extraction errors
      }
    }

    const mcpError = new MCPError(errorInfo, error);
    this.logError(mcpError);
    return mcpError;
  }

  /**
   * Classify an error into category and severity
   */
  static classifyError(error: Error): Omit<ErrorInfo, 'timestamp'> {
    const message = error.message.toLowerCase();
    const errorType = error.constructor.name;

    // Network errors
    if (this.isNetworkError(error)) {
      return {
        code: 'NETWORK_ERROR',
        message: error.message,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        recoveryAction: RecoveryAction.RETRY_WITH_BACKOFF,
      };
    }

    // Timeout errors
    if (message.includes('timeout') || errorType === 'TimeoutError') {
      return {
        code: 'TIMEOUT',
        message: error.message,
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        recoveryAction: RecoveryAction.RETRY_WITH_BACKOFF,
      };
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return {
        code: 'AUTHENTICATION_ERROR',
        message: error.message,
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        recoveryAction: RecoveryAction.REFRESH_TOKEN,
      };
    }

    // Authorization errors
    if (message.includes('forbidden') || message.includes('permission')) {
      return {
        code: 'AUTHORIZATION_ERROR',
        message: error.message,
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        recoveryAction: RecoveryAction.USER_ACTION_REQUIRED,
      };
    }

    // Not found errors
    if (message.includes('not found') || message.includes('404')) {
      return {
        code: 'NOT_FOUND',
        message: error.message,
        category: ErrorCategory.NOT_FOUND,
        severity: ErrorSeverity.LOW,
        recoveryAction: RecoveryAction.IGNORE,
      };
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        message: error.message,
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        recoveryAction: RecoveryAction.RETRY_WITH_BACKOFF,
      };
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid')) {
      return {
        code: 'VALIDATION_ERROR',
        message: error.message,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        recoveryAction: RecoveryAction.USER_ACTION_REQUIRED,
      };
    }

    // Storage errors
    if (message.includes('storage') || message.includes('database') || errorType.includes('KV')) {
      return {
        code: 'STORAGE_ERROR',
        message: error.message,
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.HIGH,
        recoveryAction: RecoveryAction.RETRY,
      };
    }

    // Configuration errors
    if (message.includes('config') || message.includes('environment')) {
      return {
        code: 'CONFIGURATION_ERROR',
        message: error.message,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.CRITICAL,
        recoveryAction: RecoveryAction.RECONFIGURE,
      };
    }

    // Default to internal error
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.HIGH,
      recoveryAction: RecoveryAction.CONTACT_SUPPORT,
    };
  }

  /**
   * Check if error is a network-related error
   */
  private static isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const networkKeywords = [
      'network',
      'connection',
      'enotfound',
      'econnrefused',
      'econnreset',
      'etimedout',
      'socket',
      'dns',
    ];

    return networkKeywords.some((keyword) => message.includes(keyword));
  }

  /**
   * Get recovery suggestions for an error
   */
  static getRecoverySuggestions(error: MCPError): string[] {
    const suggestions: string[] = [];

    switch (error.info.recoveryAction) {
      case RecoveryAction.RETRY:
        suggestions.push('Try the operation again immediately.');
        break;

      case RecoveryAction.RETRY_WITH_BACKOFF:
        suggestions.push('Wait a few seconds and try again.');
        suggestions.push('If the problem persists, wait longer between retries.');
        break;

      case RecoveryAction.REFRESH_TOKEN:
        suggestions.push('Refresh your authentication token.');
        suggestions.push('Re-authenticate if token refresh fails.');
        break;

      case RecoveryAction.RECONFIGURE:
        suggestions.push('Check your configuration settings.');
        suggestions.push('Verify environment variables are set correctly.');
        break;

      case RecoveryAction.CONTACT_SUPPORT:
        suggestions.push('Contact technical support for assistance.');
        suggestions.push('Include error details and context in your request.');
        break;

      case RecoveryAction.USER_ACTION_REQUIRED:
        suggestions.push('Review the error message and fix any issues.');
        suggestions.push('Ensure all required fields are provided and valid.');
        break;

      case RecoveryAction.FALLBACK:
        suggestions.push('Try using an alternative approach if available.');
        break;

      case RecoveryAction.IGNORE:
        suggestions.push('This error can usually be safely ignored.');
        break;
    }

    // Add category-specific suggestions
    switch (error.info.category) {
      case ErrorCategory.NETWORK:
        suggestions.push('Check your internet connection.');
        suggestions.push('Verify the service endpoint is accessible.');
        break;

      case ErrorCategory.RATE_LIMIT:
        suggestions.push('Reduce the frequency of requests.');
        suggestions.push('Implement exponential backoff in your retry logic.');
        break;

      case ErrorCategory.STORAGE:
        suggestions.push('Check storage system availability.');
        suggestions.push('Verify database connection settings.');
        break;

      case ErrorCategory.WORKFLOW:
        suggestions.push('Review workflow parameters and dependencies.');
        suggestions.push('Check if required services are running.');
        break;
    }

    return suggestions;
  }

  /**
   * Create a user-friendly error message
   */
  static formatUserMessage(error: MCPError): string {
    const categoryLabels = {
      [ErrorCategory.VALIDATION]: 'Input Error',
      [ErrorCategory.AUTHENTICATION]: 'Authentication Error',
      [ErrorCategory.AUTHORIZATION]: 'Permission Error',
      [ErrorCategory.NOT_FOUND]: 'Not Found',
      [ErrorCategory.CONFLICT]: 'Conflict',
      [ErrorCategory.RATE_LIMIT]: 'Rate Limit',
      [ErrorCategory.EXTERNAL_API]: 'External Service Error',
      [ErrorCategory.STORAGE]: 'Storage Error',
      [ErrorCategory.TRANSPORT]: 'Connection Error',
      [ErrorCategory.WORKFLOW]: 'Workflow Error',
      [ErrorCategory.CONFIGURATION]: 'Configuration Error',
      [ErrorCategory.INTERNAL]: 'Internal Error',
      [ErrorCategory.NETWORK]: 'Network Error',
      [ErrorCategory.TIMEOUT]: 'Timeout Error',
    };

    const label = categoryLabels[error.info.category] || 'Error';
    return `${label}: ${error.message}`;
  }

  /**
   * Log error with appropriate level based on severity
   */
  private static logError(error: MCPError): void {
    if (!this.logger) {
      return;
    }

    const logData = {
      code: error.info.code,
      category: error.info.category,
      severity: error.info.severity,
      context: error.info.context,
      recoveryAction: error.info.recoveryAction,
    };

    switch (error.info.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(`CRITICAL: ${error.message}`, error.cause, logData);
        break;

      case ErrorSeverity.HIGH:
        this.logger.error(`HIGH: ${error.message}`, error.cause, logData);
        break;

      case ErrorSeverity.MEDIUM:
        this.logger.warn(`MEDIUM: ${error.message}`, logData);
        break;

      case ErrorSeverity.LOW:
        this.logger.info(`LOW: ${error.message}`, logData);
        break;
    }
  }

  /**
   * Wrap an unknown error with structured error information
   * This method is used by components that expect a wrapError API
   */
  static wrapError(
    error: unknown,
    code: string,
    context?: Record<string, unknown>,
  ): MCPError {
    // Convert unknown error to Error using the toError utility
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Create error info based on the code
    const errorInfo: Omit<ErrorInfo, 'timestamp'> = {
      code,
      message: errorObj.message,
      category: this.getCategoryFromCode(code),
      severity: this.getSeverityFromCode(code),
      recoveryAction: this.getRecoveryActionFromCode(code),
    };

    if (context) {
      errorInfo.context = context;
    }

    return new MCPError(errorInfo, errorObj);
  }

  /**
   * Get error category from error code
   */
  private static getCategoryFromCode(code: string): ErrorCategory {
    if (code.includes('VALIDATION')) return ErrorCategory.VALIDATION;
    if (code.includes('AUTH')) return ErrorCategory.AUTHENTICATION;
    if (code.includes('PERMISSION') || code.includes('FORBIDDEN')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (code.includes('NOT_FOUND')) return ErrorCategory.NOT_FOUND;
    if (code.includes('CONFLICT')) return ErrorCategory.CONFLICT;
    if (code.includes('RATE_LIMIT')) return ErrorCategory.RATE_LIMIT;
    if (code.includes('EXTERNAL') || code.includes('API')) return ErrorCategory.EXTERNAL_API;
    if (code.includes('STORAGE') || code.includes('KV') || code.includes('DATABASE')) {
      return ErrorCategory.STORAGE;
    }
    if (code.includes('TRANSPORT') || code.includes('CONNECTION')) return ErrorCategory.TRANSPORT;
    if (code.includes('WORKFLOW')) return ErrorCategory.WORKFLOW;
    if (code.includes('CONFIG')) return ErrorCategory.CONFIGURATION;
    if (code.includes('NETWORK')) return ErrorCategory.NETWORK;
    if (code.includes('TIMEOUT')) return ErrorCategory.TIMEOUT;
    return ErrorCategory.INTERNAL;
  }

  /**
   * Get error severity from error code
   */
  private static getSeverityFromCode(code: string): ErrorSeverity {
    if (code.includes('CRITICAL') || code.includes('CONFIG')) return ErrorSeverity.CRITICAL;
    if (code.includes('FAILED') || code.includes('ERROR')) return ErrorSeverity.HIGH;
    if (code.includes('WARNING') || code.includes('TIMEOUT')) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.MEDIUM;
  }

  /**
   * Get recovery action from error code
   */
  private static getRecoveryActionFromCode(code: string): RecoveryAction {
    if (code.includes('AUTH')) return RecoveryAction.REFRESH_TOKEN;
    if (code.includes('CONFIG')) return RecoveryAction.RECONFIGURE;
    if (code.includes('NOT_FOUND')) return RecoveryAction.IGNORE;
    if (code.includes('VALIDATION')) return RecoveryAction.USER_ACTION_REQUIRED;
    if (code.includes('RATE_LIMIT')) return RecoveryAction.RETRY_WITH_BACKOFF;
    if (code.includes('NETWORK') || code.includes('TIMEOUT')) {
      return RecoveryAction.RETRY_WITH_BACKOFF;
    }
    if (code.includes('FAILED')) return RecoveryAction.RETRY;
    return RecoveryAction.CONTACT_SUPPORT;
  }

  /**
   * Create specific error types
   */
  static createValidationError(message: string, field?: string): MCPError {
    const errorInfo: Omit<ErrorInfo, 'timestamp'> = {
      code: 'VALIDATION_ERROR',
      message,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      recoveryAction: RecoveryAction.USER_ACTION_REQUIRED,
    };

    if (field) {
      errorInfo.details = { field };
    }

    return new MCPError(errorInfo);
  }

  static createAuthenticationError(message: string): MCPError {
    return new MCPError({
      code: 'AUTHENTICATION_ERROR',
      message,
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      recoveryAction: RecoveryAction.REFRESH_TOKEN,
    });
  }

  static createNotFoundError(resource: string): MCPError {
    return new MCPError({
      code: 'NOT_FOUND',
      message: `${resource} not found`,
      category: ErrorCategory.NOT_FOUND,
      severity: ErrorSeverity.LOW,
      recoveryAction: RecoveryAction.IGNORE,
      details: { resource },
    });
  }

  static createConfigurationError(message: string): MCPError {
    return new MCPError({
      code: 'CONFIGURATION_ERROR',
      message,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.CRITICAL,
      recoveryAction: RecoveryAction.RECONFIGURE,
    });
  }

  static createWorkflowError(workflowName: string, message: string): MCPError {
    return new MCPError({
      code: 'WORKFLOW_ERROR',
      message,
      category: ErrorCategory.WORKFLOW,
      severity: ErrorSeverity.MEDIUM,
      recoveryAction: RecoveryAction.RETRY,
      context: { workflowName },
    });
  }
}
