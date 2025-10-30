/**
 * Test Helpers for Plugin-API-Auth MCP Server Example
 *
 * This file provides OAuth-aware test utilities and mock objects
 * that demonstrate testing patterns for authenticated MCP servers.
 *
 * LEARNING FOCUS:
 * ===============
 *
 * Shows users how to:
 * 1. Mock OAuth authentication flows
 * 2. Create authenticated API client mocks
 * 3. Test OAuth failure scenarios
 * 4. Mock external API responses
 * 5. Test complex workflow authentication
 * 6. Handle authentication state in tests
 *
 * AUTHENTICATION TESTING PATTERNS:
 * ===============================
 *
 * Based on patterns from library's test-helpers.ts but extended for OAuth:
 * - Mock OAuth consumer with token management
 * - Mock API client with authentication headers
 * - Mock external API responses and failures
 * - Helper functions for authenticated test scenarios
 * - Authentication failure simulation
 */

import { assertEquals, assertExists } from '@std/assert';
import {
  createMockAuditLogger,
  createMockConfigManager,
  createMockKVManager,
  createMockLogger,
} from '@beyondbetter/bb-mcp-server/testing';
export { createMockAuditLogger, createMockConfigManager, createMockKVManager, createMockLogger };

/**
 * Mock OAuth Consumer Implementation
 *
 * Provides OAuth token management for testing without real authentication.
 * Implements the complete ExampleOAuthConsumer interface to work in tests.
 */
export class MockOAuthConsumer {
  private tokens = new Map<string, any>();
  private authFailures = new Set<string>();

  // Properties to match ExampleOAuthConsumer interface
  exampleConfig: any = {};
  readonly provider = 'mock-provider';
  readonly authUrl = 'http://mock-auth-url';
  readonly tokenUrl = 'http://mock-token-url';
  readonly clientId = 'mock-client-id';
  readonly clientSecret = 'mock-client-secret';
  readonly redirectUri = 'http://mock-redirect';
  readonly scopes = ['read', 'write'];

  // Additional properties to match base OAuthConsumer interface
  protected config: any = {
    providerId: 'mock-provider',
    authUrl: 'http://mock-auth-url',
    tokenUrl: 'http://mock-token-url',
    clientId: 'mock-client-id',
    clientSecret: 'mock-client-secret',
    redirectUri: 'http://mock-redirect',
    scopes: ['read', 'write'],
    tokenRefreshBufferMinutes: 5,
    maxTokenRefreshRetries: 3,
  };
  protected kvManager: any = null;
  protected logger: any = null;

  constructor() {
    // Set up default test tokens for multiple test users
    const defaultToken = {
      access_token: 'mock_access_token_12345',
      refresh_token: 'mock_refresh_token_67890',
      expires_at: Date.now() + 3600000, // 1 hour from now
      token_type: 'Bearer',
    };

    // Set up tokens for all common test user IDs
    this.tokens.set('test-user', defaultToken);
    this.tokens.set('integration-test-user', {
      ...defaultToken,
      access_token: 'integration_token_123',
    });
    this.tokens.set('refresh-test-user', {
      ...defaultToken,
      access_token: 'refresh_token_123',
    });
    this.tokens.set('cross-component-user', {
      ...defaultToken,
      access_token: 'cross_component_123',
    });
    this.tokens.set('business-process-user', {
      ...defaultToken,
      access_token: 'business_process_123',
    });
    this.tokens.set('failing-auth-user', {
      ...defaultToken,
      access_token: 'failing_auth_123',
    });
    this.tokens.set('consistent-error-user', {
      ...defaultToken,
      access_token: 'consistent_error_123',
    });
  }

  async getAccessToken(userId: string): Promise<string> {
    if (this.authFailures.has(userId)) {
      throw new Error(
        'OAuth authentication failed: Invalid or expired credentials',
      );
    }

    const token = this.tokens.get(userId);
    if (!token) {
      throw new Error(`No OAuth token found for user: ${userId}`);
    }

    // Check if token is expired and refresh if needed
    if (token.expires_at <= Date.now()) {
      if (!token.refresh_token) {
        throw new Error('OAuth token expired and no refresh token available');
      }

      // Directly refresh the token without calling the async method to avoid circular calls
      const newToken = {
        ...token,
        access_token: `refreshed_token_${Date.now()}`,
        expires_at: Date.now() + 3600000,
      };

      this.tokens.set(userId, newToken);
      return newToken.access_token;
    }

    return token.access_token;
  }

  async refreshAccessToken(userId: string): Promise<any> {
    if (this.authFailures.has(userId)) {
      throw new Error(
        'OAuth authentication failed: Invalid or expired credentials',
      );
    }

    const token = this.tokens.get(userId);
    if (!token?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const newToken = {
      ...token,
      access_token: `refreshed_token_${Date.now()}`,
      expires_at: Date.now() + 3600000,
    };

    this.tokens.set(userId, newToken);
    return newToken;
  }

  async initialize(): Promise<void> {
    // Mock initialization - nothing needed for tests
  }

  // Additional methods to match base OAuthConsumer interface
  protected buildAuthUrl(state: string, codeChallenge?: string): string {
    return `${this.authUrl}?state=${state}&code_challenge=${codeChallenge || 'mock_challenge'}`;
  }

  protected async exchangeCodeForTokens(
    code: string,
    codeVerifier?: string,
  ): Promise<any> {
    return {
      success: true,
      tokens: {
        accessToken: `mock_access_token_${Date.now()}`,
        refreshToken: `mock_refresh_token_${Date.now()}`,
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000,
        scopes: this.scopes,
      },
    };
  }

  protected async refreshTokens(refreshToken: string): Promise<any> {
    return {
      success: true,
      tokens: {
        accessToken: `refreshed_token_${Date.now()}`,
        refreshToken: refreshToken,
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000,
        scopes: this.scopes,
      },
    };
  }

  async cleanup(): Promise<void> {
    // Mock cleanup - nothing needed for tests
  }

  async startAuthorizationFlow(
    userId: string,
    scopes?: string[],
  ): Promise<any> {
    return {
      authorizationUrl: `${this.authUrl}?mock_flow=true&user=${userId}`,
      state: 'mock_state_' + Date.now(),
    };
  }

  async handleAuthorizationCallback(code: string, state: string): Promise<any> {
    return {
      success: true,
      userId: 'test-user',
    };
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    return this.getAccessToken(userId);
  }

  async isUserAuthenticated(userId: string): Promise<boolean> {
    return this.tokens.has(userId) && !this.authFailures.has(userId);
  }

  async getUserCredentials(userId: string): Promise<any> {
    const token = this.tokens.get(userId);
    return token
      ? {
        userId,
        tokens: token,
        createdAt: 0,
        lastUsed: Date.now(),
        refreshCount: 0,
      }
      : null;
  }

  async storeUserCredentials(userId: string, credentials: any): Promise<void> {
    this.tokens.set(userId, credentials);
  }

  async updateUserCredentials(
    userId: string,
    credentials: any,
  ): Promise<boolean> {
    this.tokens.set(userId, credentials);
    return true;
  }

  async revokeUserCredentials(userId: string): Promise<boolean> {
    this.tokens.delete(userId);
    return true;
  }

  async getAuthenticatedUsers(): Promise<string[]> {
    return Array.from(this.tokens.keys());
  }

  protected buildAuthorizationUrl(state: string, scopes?: string[]): string {
    return this.buildAuthUrl(state);
  }

  // Test helper methods
  setAuthFailure(userId: string, shouldFail: boolean = true): void {
    if (shouldFail) {
      this.authFailures.add(userId);
    } else {
      this.authFailures.delete(userId);
    }
  }

  setTokenForUser(userId: string, token: any): void {
    this.tokens.set(userId, token);
  }

  clearTokens(): void {
    this.tokens.clear();
    this.authFailures.clear();
  }

  hasValidToken(userId: string): boolean {
    const token = this.tokens.get(userId);
    return token && token.expires_at > Date.now();
  }

  getTokenInfo(userId: string): any | undefined {
    return this.tokens.get(userId);
  }
}

/**
 * Mock API Client Implementation
 *
 * Provides external API simulation with authentication and various response scenarios.
 */
export class MockApiClient {
  private responses = new Map<string, any>();
  private failures = new Set<string>();
  private callLog: Array<
    { method: string; params: any; userId: string; timestamp: Date }
  > = [];

  // Properties to match ExampleApiClient interface
  private oauthConsumer: MockOAuthConsumer | null = null;

  // Properties to match BaseApiClient interface
  protected config: any = {
    baseUrl: 'https://mock-api.test',
    apiVersion: 'v1',
    timeout: 30000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    userAgent: 'MockApiClient/1.0',
  };
  protected logger: any = null;

  constructor() {
    this.setupDefaultResponses();
  }

  // Method to inject OAuth consumer for authentication simulation
  setOAuthConsumer(oauthConsumer: MockOAuthConsumer): void {
    this.oauthConsumer = oauthConsumer;
  }

  // Check OAuth authentication before making API calls
  private async checkAuthentication(userId: string): Promise<void> {
    if (this.oauthConsumer) {
      // This will throw an error if authentication fails
      await this.oauthConsumer.getAccessToken(userId);
    }
  }

  private setupDefaultResponses(): void {
    // Default customer query response
    this.responses.set('queryCustomers', {
      items: [
        {
          id: 'cust_001',
          name: 'Acme Corporation',
          email: 'contact@acme.com',
          type: 'business',
          status: 'active',
          region: 'US-West',
        },
        {
          id: 'cust_002',
          name: 'John Doe',
          email: 'john@example.com',
          type: 'individual',
          status: 'active',
          region: 'US-East',
        },
      ],
      totalCount: 2,
      page: 1,
      limit: 20,
    });

    // Default order creation response
    this.responses.set('createOrder', {
      id: 'order_12345',
      status: 'pending',
      customerId: 'cust_001',
      totalAmount: 299.99,
      items: [{ productId: 'prod_001', quantity: 1, unitPrice: 299.99 }],
      trackingNumber: 'TRK123456789',
      estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString(),
      createdAt: new Date().toISOString(),
    });

    // Default order status response
    this.responses.set('getOrderStatus', {
      orderId: 'order_12345',
      status: 'shipped',
      trackingNumber: 'TRK123456789',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        .toISOString(),
      history: [
        {
          status: 'pending',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
            .toISOString(),
        },
        {
          status: 'processing',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
            .toISOString(),
        },
        { status: 'shipped', timestamp: new Date().toISOString() },
      ],
    });

    // Default API info response
    this.responses.set('getApiInfo', {
      name: 'ExampleCorp API',
      version: '2.1.0',
      status: 'operational',
      uptime: '99.9%',
      endpoints: ['customers', 'orders', 'products', 'analytics'],
      rateLimit: {
        limit: 1000,
        remaining: 856,
        resetTime: Date.now() + 3600000,
      },
    });
  }

  async queryCustomers(accessToken: string, params: any): Promise<any> {
    this.logCall('queryCustomers', params, params.userId);

    // Check OAuth authentication first
    if (params.userId) {
      await this.checkAuthentication(params.userId);
    }

    if (this.failures.has('queryCustomers')) {
      throw new Error(
        'API call failed: Customer service temporarily unavailable',
      );
    }

    const response = { ...this.responses.get('queryCustomers') };

    // Apply search filtering if provided
    if (params.search) {
      response.items = response.items.filter((customer: any) =>
        customer.name.toLowerCase().includes(params.search.toLowerCase()) ||
        customer.email.toLowerCase().includes(params.search.toLowerCase())
      );
      response.totalCount = response.items.length;
    }

    // Apply filters if provided
    if (params.filters) {
      if (params.filters.status) {
        response.items = response.items.filter((customer: any) =>
          customer.status === params.filters.status
        );
      }
      if (params.filters.region) {
        response.items = response.items.filter((customer: any) =>
          customer.region === params.filters.region
        );
      }
      response.totalCount = response.items.length;
    }

    // Apply pagination
    if (params.pagination) {
      const { page = 1, limit = 20 } = params.pagination;
      const startIndex = (page - 1) * limit;
      response.items = response.items.slice(startIndex, startIndex + limit);
      response.page = page;
      response.limit = limit;
    }

    return response;
  }

  async createOrder(accessToken: string, orderData: any, userId: string): Promise<any> {
    this.logCall('createOrder', orderData, userId);

    // Check OAuth authentication first
    await this.checkAuthentication(userId);

    if (this.failures.has('createOrder')) {
      throw new Error('API call failed: Order creation service unavailable');
    }

    const response = { ...this.responses.get('createOrder') };
    response.customerId = orderData.customerId;
    response.items = orderData.items || response.items;
    response.totalAmount = orderData.items?.reduce(
      (total: number, item: any) => total + (item.quantity * item.unitPrice),
      0,
    ) || response.totalAmount;

    return response;
  }

  async getOrderStatus(accessToken: string, params: any): Promise<any> {
    this.logCall('getOrderStatus', params, params.userId);

    // Check OAuth authentication first
    if (params.userId) {
      await this.checkAuthentication(params.userId);
    }

    if (this.failures.has('getOrderStatus')) {
      throw new Error('API call failed: Order tracking service unavailable');
    }

    const response = { ...this.responses.get('getOrderStatus') };
    response.orderId = params.orderId;

    if (!params.includeHistory) {
      delete response.history;
    }

    return response;
  }

  async getApiInfo(): Promise<any> {
    this.logCall('getApiInfo', {}, 'system');

    if (this.failures.has('getApiInfo')) {
      throw new Error('API call failed: Service status unavailable');
    }

    return this.responses.get('getApiInfo');
  }

  async healthCheck(): Promise<
    { healthy: boolean; status: string; timestamp: string }
  > {
    this.logCall('healthCheck', {}, 'system');
    const isHealthy = !this.failures.has('healthCheck');
    // console.log('🏥 HEALTH CHECK CALLED:', {
    //   count: this.getCallCount('healthCheck'),
    //   hasFailure: this.failures.has('healthCheck'),
    //   healthy: isHealthy
    // });

    if (!isHealthy) {
      console.log('😧 HEALTH CHECK FAILING!');
    }

    return {
      healthy: isHealthy,
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }

  // Workflow-specific API methods
  async queryOrders(accessToken: string, params: any): Promise<any> {
    this.logCall('queryOrders', params, params.userId);

    // Check OAuth authentication first
    if (params.userId) {
      await this.checkAuthentication(params.userId);
    }

    if (this.failures.has('queryOrders')) {
      throw new Error(
        'API call failed: Orders service temporarily unavailable',
      );
    }

    return {
      items: [
        {
          id: 'order_001',
          customerId: 'cust_001',
          status: 'completed',
          totalAmount: 199.99,
          createdDate: '2024-01-15T10:30:00Z',
        },
        {
          id: 'order_002',
          customerId: 'cust_002',
          status: 'pending',
          totalAmount: 299.99,
          createdDate: '2024-01-16T14:20:00Z',
        },
      ],
      totalCount: 2,
      ...params.pagination,
    };
  }

  async queryProducts(accessToken: string, params: any): Promise<any> {
    this.logCall('queryProducts', params, params.userId);

    return {
      items: [
        {
          id: 'prod_001',
          name: 'Widget Pro',
          category: 'electronics',
          price: 299.99,
          inStock: true,
        },
        {
          id: 'prod_002',
          name: 'Gadget Max',
          category: 'electronics',
          price: 199.99,
          inStock: false,
        },
      ],
      totalCount: 2,
      ...params.pagination,
    };
  }

  async queryAnalytics(accessToken: string, params: any): Promise<any> {
    this.logCall('queryAnalytics', params, params.userId);

    return {
      summary: {
        totalRevenue: 15000.00,
        totalOrders: 150,
        averageOrderValue: 100.00,
        topProducts: ['Widget Pro', 'Gadget Max'],
      },
      timeRange: params.filters.dateRange,
    };
  }

  // Test helper methods
  setApiFailure(method: string, shouldFail: boolean = true): void {
    if (shouldFail) {
      this.failures.add(method);
    } else {
      this.failures.delete(method);
    }
  }

  setResponse(method: string, response: any): void {
    this.responses.set(method, response);
  }

  getCallLog(): Array<
    { method: string; params: any; userId: string; timestamp: Date }
  > {
    return [...this.callLog];
  }

  clearCallLog(): void {
    this.callLog = [];
  }

  getCallCount(method?: string): number {
    if (method) {
      return this.callLog.filter((call) => call.method === method).length;
    }
    return this.callLog.length;
  }

  // Additional methods to match ExampleApiClient interface
  async createCustomer(accessToken: string, customerData: any, userId: string): Promise<any> {
    this.logCall('createCustomer', customerData, userId);

    // Check OAuth authentication first
    await this.checkAuthentication(userId);

    return {
      id: 'mock-customer-' + Date.now(),
      ...customerData,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async deleteCustomer(accessToken: string, customerId: string): Promise<void> {
    this.logCall('deleteCustomer', { customerId }, 'system');
    // Mock deletion - no return value needed
  }

  async cancelOrder(accessToken: string, orderId: string): Promise<void> {
    this.logCall('cancelOrder', { orderId }, 'system');
    // Mock cancellation - no return value needed
  }

  async getInventoryLevels(
    accessToken: string,
    productIds: string[],
    userId: string,
  ): Promise<Record<string, number>> {
    this.logCall('getInventoryLevels', { productIds }, userId);
    const result: Record<string, number> = {};
    productIds.forEach((id) => {
      result[id] = Math.floor(Math.random() * 100);
    });
    return result;
  }

  async bulkUpdateInventory(accessToken: string, updateData: any, userId: string): Promise<any> {
    this.logCall('bulkUpdateInventory', updateData, userId);
    return {
      updated: updateData.updates?.length || 0,
      success: true,
      results: updateData.updates?.map((u: any) => ({
        productId: u.productId,
        success: true,
      })) || [],
    };
  }

  async restoreInventoryLevels(
    accessToken: string,
    inventory: Record<string, number>,
  ): Promise<void> {
    this.logCall('restoreInventoryLevels', { inventory }, 'system');
    // Mock restore - no return value needed
  }

  async processRefund(accessToken: string, refundData: any, userId: string): Promise<any> {
    this.logCall('processRefund', refundData, userId);
    return {
      refundId: 'refund-' + Date.now(),
      status: 'processed',
      amount: refundData.refundAmount || 100,
      processedAt: new Date().toISOString(),
    };
  }

  async validateDataMigration(
    accessToken: string,
    migrationData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('validateDataMigration', migrationData, userId);
    return {
      valid: true,
      estimatedDuration: '2 hours',
      potentialIssues: [],
      recommendedActions: [],
    };
  }

  async executeDataMigration(
    accessToken: string,
    migrationData: any,
    userId: string,
  ): Promise<any> {
    this.logCall('executeDataMigration', migrationData, userId);
    return {
      migrationId: 'migration-' + Date.now(),
      status: 'completed',
      recordsProcessed: migrationData.batchSize || 1000,
      completedAt: new Date().toISOString(),
    };
  }

  async disconnect(): Promise<void> {
    this.logCall('disconnect', {}, 'system');
    // Mock disconnect - no return value needed
  }

  // Additional methods to match BaseApiClient interface
  protected getConfig(): any {
    return this.config;
  }

  protected getLogger(): any {
    return this.logger ||
      { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  }

  protected createApiResponse<T>(
    data?: T,
    success = true,
    error?: string,
  ): any {
    return {
      success,
      data,
      error,
      metadata: {
        requestId: 'mock-request-' + Date.now(),
        timestamp: new Date().toISOString(),
      },
    };
  }

  protected async delay(attempt: number): Promise<void> {
    // Mock delay - no actual waiting in tests
    return Promise.resolve();
  }

  protected shouldRetry(error: Error, attempt: number): boolean {
    return attempt < this.config.retryAttempts;
  }

  //   // Private methods to match ExampleApiClient interface
  //   private async makeRequest<T = any>(
  //     method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  //     endpoint: string,
  //     options: any = {},
  //   ): Promise<any> {
  //     this.logCall(
  //       'makeRequest',
  //       { method, endpoint, options },
  //       options.userId || 'system',
  //     );
  //
  //     // Mock request - return success response
  //     return this.createApiResponse({ mockData: true } as T);
  //   }
  //
  //   private async makeHttpRequestWithRetry(
  //     url: string,
  //     options: RequestInit,
  //     attempt = 1,
  //   ): Promise<Response> {
  //     // Mock HTTP request - return mock response
  //     return new Response(JSON.stringify({ mock: true }), {
  //       status: 200,
  //       statusText: 'OK',
  //       headers: { 'content-type': 'application/json' },
  //     });
  //   }

  protected logCall(method: string, params: any, userId: string): void {
    this.callLog.push({
      method,
      params: JSON.parse(JSON.stringify(params)), // Deep clone
      userId,
      timestamp: new Date(),
    });
  }
}

/**
 * DEPRECATED: Use createMockLogger() and createMockAuditLogger() instead
 * This class is kept for backward compatibility but should not be used in new tests
 */
export class MockAuthLogger {
  public infoCalls: Array<[string, any?]> = [];
  public warnCalls: Array<[string, any?]> = [];
  public errorCalls: Array<[string, Error | undefined, any?]> = [];
  public debugCalls: Array<[string, any?]> = [];
  public authEvents: Array<{ event: string; userId: string; timestamp: Date }> = [];

  // Properties to match Logger interface
  private currentLogLevel: string = 'debug';
  private config: any = {
    level: 'debug',
    format: 'text',
    includeTimestamp: true,
    includeSource: true,
    colorize: false,
  };

  // Properties to match AuditLogger interface
  //private logger: any = null;
  //private auditFile: any = null;
  // private buffer: string[] = [];
  private flushTimer?: number;

  info(message: string, data?: any): void {
    this.infoCalls.push([message, data]);
    this.logAuthEventPrivate(message, data);
  }

  warn(message: string, data?: any): void {
    this.warnCalls.push([message, data]);
    this.logAuthEventPrivate(message, data);
  }

  error(message: string, error?: Error, data?: any): void {
    this.errorCalls.push([message, error, data]);
    this.logAuthEventPrivate(message, data);
  }

  debug(message: string, data?: any): void {
    this.debugCalls.push([message, data]);
  }

  // Additional methods to match Logger interface
  dir(arg: unknown): void {
    this.debugCalls.push(['Debug object', arg]);
  }

  child(context: Record<string, unknown>): MockAuthLogger {
    const childLogger = new MockAuthLogger();
    childLogger.config = { ...this.config, ...context };
    return childLogger;
  }

  setLevel(level: string): void {
    this.currentLogLevel = level;
    this.config.level = level;
  }

  getLevel(): string {
    return this.currentLogLevel;
  }

  // Methods to match AuditLogger interface
  async initialize(): Promise<MockAuthLogger> {
    return this;
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }

  async logApiCall(entry: any): Promise<void> {
    this.info('API Call', entry);
  }

  async logWorkflowOperation(entry: any): Promise<void> {
    this.info('Workflow Operation', entry);
  }

  async logAuthEvent(entry: any): Promise<void> {
    this.info('Auth Event', entry);
  }

  async logSystemEvent(entry: any): Promise<void> {
    this.info('System Event', entry);
  }

  async logCustomEvent(type: string, entry: any): Promise<void> {
    this.info(`Custom Event: ${type}`, entry);
  }

  async searchLogs(options: any = {}): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async getAuditStats(): Promise<any> {
    return {
      totalEntries: 0,
      entriesByType: {},
      entriesByUser: {},
      recentActivity: [],
    };
  }

  async cleanupOldLogs(): Promise<number> {
    return 0;
  }

  isEnabled(): boolean {
    return true;
  }

  updateConfig(newConfig: any): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Private methods to match Logger interface
  // private shouldLog(level: string): boolean {
  //   return true; // Always log in tests
  // }
  //
  // private writeLog(level: string, message: string, data?: unknown): void {
  //   // Mock implementation - just call the appropriate public method
  //   switch (level) {
  //     case "debug":
  //       this.debug(message, data);
  //       break;
  //     case "info":
  //       this.info(message, data);
  //       break;
  //     case "warn":
  //       this.warn(message, data);
  //       break;
  //     case "error":
  //       this.error(message, data instanceof Error ? data : undefined, data);
  //       break;
  //   }
  // }

  // private formatLogEntry(
  //   level: string,
  //   message: string,
  //   data?: unknown,
  // ): string {
  //   return `${level.toUpperCase()}: ${message}${
  //     data ? " " + JSON.stringify(data) : ""
  //   }`;
  // }
  //
  // private formatJsonEntry(
  //   level: string,
  //   message: string,
  //   data?: unknown,
  // ): string {
  //   return JSON.stringify({ level, message, data });
  // }
  //
  // private formatTextEntry(
  //   level: string,
  //   message: string,
  //   data?: unknown,
  // ): string {
  //   return this.formatLogEntry(level, message, data);
  // }
  //
  // private colorMessage(message: string, level: string): string {
  //   return message; // No coloring in tests
  // }
  //
  // private getLogLevelFromEnv(): string {
  //   return "debug";
  // }

  // Additional properties to match AuditLogger interface
  // private initialized = true;

  // private async writeLogEntry(entry: Record<string, unknown>): Promise<void> {
  //   // Mock implementation
  //   this.buffer.push(JSON.stringify(entry));
  // }
  //
  // private async flushBuffer(): Promise<void> {
  //   // Mock implementation - clear buffer
  //   this.buffer = [];
  // }

  // Test helper methods
  clear(): void {
    this.infoCalls = [];
    this.warnCalls = [];
    this.errorCalls = [];
    this.debugCalls = [];
    this.authEvents = [];
  }

  private logAuthEventPrivate(message: string, data?: any): void {
    if (data?.userId || message.includes('OAuth') || message.includes('auth')) {
      this.authEvents.push({
        event: message,
        userId: data?.userId || 'unknown',
        timestamp: new Date(),
      });
    }
  }

  hasAuthEvent(event: string): boolean {
    return this.authEvents.some((e) => e.event.includes(event));
  }

  getAuthEventsForUser(
    userId: string,
  ): Array<{ event: string; userId: string; timestamp: Date }> {
    return this.authEvents.filter((e) => e.userId === userId);
  }
}

/**
 * Factory Functions for Creating Mock Objects
 */

export function createMockOAuthConsumer(): MockOAuthConsumer {
  return new MockOAuthConsumer();
}

export function createMockApiClient(): MockApiClient {
  return new MockApiClient();
}

/**
 * Create a connected set of OAuth consumer and API client
 */
export function createConnectedMocks(): {
  oauthConsumer: MockOAuthConsumer;
  apiClient: MockApiClient;
} {
  const oauthConsumer = new MockOAuthConsumer();
  const apiClient = new MockApiClient();
  apiClient.setOAuthConsumer(oauthConsumer);
  return { oauthConsumer, apiClient };
}

/**
 * DEPRECATED: Import from @beyondbetter/bb-mcp-server/testing instead
 * @deprecated Use createMockLogger() and createMockAuditLogger() from library
 */
export function createMockAuthLogger(): MockAuthLogger {
  return new MockAuthLogger();
}

/**
 * Create authenticated tool context with OAuth mocks
 */
export function createAuthenticatedToolContext(overrides: any = {}): any {
  const mockOAuth = createMockOAuthConsumer();
  const mockApiClient = createMockApiClient();
  const mockLogger = createMockLogger();
  const mockAuditLogger = createMockAuditLogger();

  return {
    userId: 'test-user',
    requestId: 'test-request-123',
    clientId: 'test-client',
    startTime: new Date(),
    logger: mockLogger,
    auditLogger: mockAuditLogger,
    oauthConsumer: mockOAuth,
    apiClient: mockApiClient,
    authenticated: true,
    ...overrides,
  };
}

/**
 * Create workflow context with authentication
 */
export function createAuthenticatedWorkflowContext(overrides: any = {}): any {
  return {
    ...createAuthenticatedToolContext(),
    sessionId: 'test-session-456',
    workflowId: 'test-workflow-789',
    ...overrides,
  };
}

/**
 * Mock Configuration for OAuth Testing
 */
export class MockOAuthConfig {
  private config = new Map<string, any>();

  constructor() {
    this.setDefaults();
  }

  private setDefaults(): void {
    const defaults = {
      'OAUTH_CONSUMER_CLIENT_ID': 'test-client-id',
      'OAUTH_CONSUMER_CLIENT_SECRET': 'test-client-secret',
      'OAUTH_CONSUMER_AUTH_URL': 'https://httpbin.org/anything/oauth/authorize',
      'OAUTH_CONSUMER_TOKEN_URL': 'https://httpbin.org/anything/oauth/token',
      'OAUTH_CONSUMER_REDIRECT_URI': 'http://localhost:3000/oauth/callback',
      'OAUTH_CONSUMER_SCOPES': 'read,write',
      'THIRDPARTY_API_BASE_URL': 'https://jsonplaceholder.typicode.com',
      'THIRDPARTY_API_VERSION': 'v1',
      'LOG_LEVEL': 'debug',
      'MCP_TRANSPORT': 'stdio',
    };

    Object.entries(defaults).forEach(([key, value]) => {
      this.config.set(key, value);
    });
  }

  get(key: string, defaultValue?: any): any {
    return this.config.get(key) ?? defaultValue;
  }

  set(key: string, value: any): void {
    this.config.set(key, value);
  }
}

export function createMockOAuthConfig(): MockOAuthConfig {
  return new MockOAuthConfig();
}

/**
 * Test Data Generators for OAuth Scenarios
 */

/**
 * Generate test parameters for OAuth-authenticated tools
 */
export function generateAuthenticatedToolTestParams(): Array<{
  name: string;
  toolName: string;
  params: any;
  expectedAuthRequired: boolean;
}> {
  return [
    {
      name: 'query customers with authentication',
      toolName: 'query_customers_example',
      params: {
        userId: 'test-user',
        search: 'Acme',
        limit: 10,
      },
      expectedAuthRequired: true,
    },
    {
      name: 'create order with authentication',
      toolName: 'create_order_example',
      params: {
        userId: 'test-user',
        customerId: 'cust_001',
        items: [{ productId: 'prod_001', quantity: 1, unitPrice: 299.99 }],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
        },
      },
      expectedAuthRequired: true,
    },
    {
      name: 'get order status with authentication',
      toolName: 'get_order_status_example',
      params: {
        userId: 'test-user',
        orderId: 'order_12345',
        includeHistory: true,
      },
      expectedAuthRequired: true,
    },
    {
      name: 'get API info (no authentication required)',
      toolName: 'get_api_info_example',
      params: {},
      expectedAuthRequired: false,
    },
  ];
}

/**
 * Generate OAuth failure scenarios for testing
 */
export function generateOAuthFailureScenarios(): Array<{
  name: string;
  userId: string;
  failureType: 'no_token' | 'expired_token' | 'invalid_token' | 'api_failure';
  expectedError: string;
}> {
  return [
    {
      name: 'missing OAuth token',
      userId: 'user-without-token',
      failureType: 'no_token',
      expectedError: 'No OAuth token found',
    },
    {
      name: 'expired OAuth token',
      userId: 'user-expired-token',
      failureType: 'expired_token',
      expectedError: 'expired credentials',
    },
    {
      name: 'invalid OAuth token',
      userId: 'user-invalid-token',
      failureType: 'invalid_token',
      expectedError: 'Invalid or expired credentials',
    },
    {
      name: 'API service failure',
      userId: 'test-user',
      failureType: 'api_failure',
      expectedError: 'API call failed',
    },
  ];
}

/**
 * Authentication-specific assertion helpers
 */

/**
 * Assert that a tool call required and used authentication
 */
export function assertAuthenticatedCall(
  response: any,
  mockOAuth: MockOAuthConsumer,
  userId: string,
): void {
  // Verify response structure
  assertExists(response, 'Response should exist');

  // Verify OAuth token was requested
  assertExists(
    mockOAuth.getTokenInfo(userId),
    `OAuth token should exist for user: ${userId}`,
  );
}

/**
 * Assert that authentication failure was handled properly
 */
export function assertAuthenticationError(
  response: any,
  expectedErrorText: string,
): void {
  assertEquals(
    response.isError,
    true,
    'Response should indicate authentication error',
  );
  assertExists(response.content);
  const responseText = response.content[0].text;
  assertEquals(
    responseText.includes(expectedErrorText),
    true,
    `Error response should contain '${expectedErrorText}', but got: ${responseText}`,
  );
}

/**
 * Assert that API client was called correctly
 */
export function assertApiClientCall(
  mockApiClient: MockApiClient,
  method: string,
  expectedCallCount: number = 1,
): void {
  const actualCallCount = mockApiClient.getCallCount(method);
  assertEquals(
    actualCallCount,
    expectedCallCount,
    `Expected ${expectedCallCount} calls to ${method}, but got ${actualCallCount}`,
  );
}

/**
 * EDUCATIONAL SUMMARY - AUTHENTICATION TESTING
 * ===========================================
 *
 * This enhanced test helpers file demonstrates OAuth and API testing patterns:
 *
 * 1. 🔐 OAUTH TESTING:
 *    - MockOAuthConsumer: Complete OAuth flow simulation
 *    - Token management and expiration testing
 *    - Authentication failure scenarios
 *    - User-specific token isolation
 *
 * 2. 🌐 API CLIENT TESTING:
 *    - MockApiClient: External API simulation
 *    - Request/response logging and verification
 *    - API failure scenario testing
 *    - Parameterized response generation
 *
 * 3. 🔍 AUTH-AWARE LOGGING:
 *    - Enhanced logging with authentication tracking
 *    - OAuth event capture and verification
 *    - User-specific audit trails
 *    - Authentication error logging
 *
 * 4. ✅ AUTHENTICATION ASSERTIONS:
 *    - OAuth token verification helpers
 *    - API call authentication checking
 *    - Error response validation
 *    - Audit trail verification
 *
 * 5. 🎭 TEST FIXTURES:
 *    - Authenticated context creation
 *    - OAuth configuration mocking
 *    - Failure scenario generation
 *    - Parameterized test data
 *
 * KEY BENEFITS FOR OAUTH TESTING:
 * ==============================
 *
 * - **Authentication Isolation**: Tests OAuth flows without real tokens
 * - **Failure Simulation**: Test all authentication failure modes
 * - **API Integration**: Mock external API responses and failures
 * - **Security Validation**: Ensure proper authentication requirements
 * - **User Context**: Test multi-user authentication scenarios
 *
 * Users can extend these patterns for their own OAuth integrations,
 * creating comprehensive test suites for authenticated MCP servers.
 */
