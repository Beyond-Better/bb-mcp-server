/**
 * Base API Client - Abstract base class for third-party API integrations
 * 
 * Provides a standardized contract for API clients used in MCP server workflows.
 * All API clients should extend this class to ensure consistent health checking
 * and API information retrieval capabilities.
 */

import type { Logger } from '../utils/Logger.ts';
import type { ThirdPartyApiHealthStatus, ThirdPartyApiInfo } from '../types/AppServerTypes.ts';

/**
 * Configuration interface for API clients
 */
export interface BaseApiClientConfig {
  /** Base URL for the API */
  baseUrl: string;
  /** API version */
  apiVersion: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Number of retry attempts for failed requests */
  retryAttempts: number;
  /** Delay between retry attempts in milliseconds */
  retryDelayMs: number;
  /** User agent string for requests */
  userAgent?: string;
}

/**
 * Abstract base class for API clients
 * 
 * Enforces the contract that all API clients must implement healthCheck and getApiInfo methods.
 * Provides common functionality and configuration management for third-party API integrations.
 */
export abstract class BaseApiClient {
  protected config: BaseApiClientConfig;
  protected logger: Logger;
  
  constructor(config: BaseApiClientConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }
  
  /**
   * Check the health status of the third-party API
   * 
   * @returns Promise resolving to detailed health status information
   */
  abstract healthCheck(): Promise<ThirdPartyApiHealthStatus>;
  
  /**
   * Get API information and capabilities
   * 
   * @returns Promise resolving to API information and feature details
   */
  abstract getApiInfo(): Promise<ThirdPartyApiInfo>;
  
  /**
   * Disconnect from the API and clean up resources
   * 
   * @returns Promise that resolves when cleanup is complete
   */
  abstract disconnect(): Promise<void>;
  
  /**
   * Get the base configuration for this API client
   */
  protected getConfig(): Readonly<BaseApiClientConfig> {
    return Object.freeze({ ...this.config });
  }
  
  /**
   * Get the logger instance
   */
  protected getLogger(): Logger {
    return this.logger;
  }
  
  /**
   * Helper method to create standard API response wrapper
   */
  protected createApiResponse<T>(data?: T, success = true, error?: string): {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
      requestId?: string;
      timestamp?: string;
      rateLimitRemaining?: number;
    };
  } {
    const response: {
      success: boolean;
      data?: T;
      error?: string;
      metadata?: {
        requestId?: string;
        timestamp?: string;
        rateLimitRemaining?: number;
      };
    } = {
      success,
    };
    
    if (data !== undefined) {
      response.data = data;
    }
    
    if (error !== undefined) {
      response.error = error;
    }
    
    response.metadata = {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    
    return response;
  }
  
  /**
   * Helper method for exponential backoff delay
   */
  protected async delay(attempt: number): Promise<void> {
    const delayMs = this.config.retryDelayMs * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  /**
   * Helper method to determine if an error should trigger a retry
   */
  protected shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.config.retryAttempts) {
      return false;
    }
    
    // Retry on network errors, timeouts, or 5xx server errors
    return (
      error.name === 'TimeoutError' ||
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('5') // 5xx server errors
    );
  }
}