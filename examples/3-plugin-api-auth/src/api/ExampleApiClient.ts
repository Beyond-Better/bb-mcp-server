/**
 * ExampleCorp API Client
 *
 * Demonstrates third-party API integration patterns for MCP server consumers:
 * - HTTP client for RESTful API integration
 * - OAuth authentication using library OAuthConsumer
 * - Error handling and retry logic
 * - Type-safe API methods with proper TypeScript interfaces
 */

// 🎯 Library imports - API client base class, logging, and types
import { BaseApiClient, type BaseApiClientConfig } from '@beyondbetter/bb-mcp-server';
import { Logger } from '@beyondbetter/bb-mcp-server';
import type { ThirdPartyApiHealthStatus, ThirdPartyApiInfo } from '@beyondbetter/bb-mcp-server';

// 🎯 Consumer-specific imports
import { ExampleOAuthConsumer } from '../auth/ExampleOAuthConsumer.ts';

/**
 * Configuration for ExampleCorp API client
 */
export interface ExampleApiClientConfig extends BaseApiClientConfig {
  // Add any ExampleCorp-specific configuration here
  // All base configuration is inherited from BaseApiClientConfig
}

/**
 * ExampleCorp API response types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    requestId?: string;
    timestamp?: string;
    rateLimitRemaining?: number;
  };
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  customerType: 'individual' | 'business';
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shippingMethod: 'standard' | 'expedited' | 'overnight';
  trackingNumber?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  inStock: boolean;
  inventory: number;
}

/**
 * ExampleCorp API Client
 *
 * 🎯 Demonstrates third-party API integration patterns
 * 🎯 Shows OAuth integration using library OAuth consumer
 * 🎯 Consumer-specific - each MCP server will have different API clients
 * 🎯 Extends BaseApiClient for standardized health check and API info contract
 */
export class ExampleApiClient extends BaseApiClient {
  private oauthConsumer: ExampleOAuthConsumer;

  constructor(
    config: ExampleApiClientConfig,
    oauthConsumer: ExampleOAuthConsumer,
    logger: Logger,
  ) {
    super(config, logger);
    this.oauthConsumer = oauthConsumer;
  }

  // =============================================================================
  // HEALTH AND STATUS METHODS
  // =============================================================================

  /**
   * Check API health status (using JSONPlaceholder /posts/1 as health check)
   */
  async healthCheck(): Promise<ThirdPartyApiHealthStatus> {
    try {
      // Use JSONPlaceholder /posts/1 as a simple health check
      const response = await fetch(`${this.config.baseUrl}/posts/1`);

      if (response.ok) {
        const post = await response.json();
        return {
          healthy: true,
          version: 'jsonplaceholder-v1',
          uptime: Date.now(), // Mock uptime
          services: {
            api: 'healthy',
            posts: 'healthy',
            users: 'healthy',
            todos: 'healthy',
          },
        };
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      this.getLogger().warn('ExampleCorp health check failed', {});
      return {
        healthy: false,
        version: 'unknown',
        uptime: 0,
        services: { api: 'down' },
      };
    }
  }

  /**
   * Get API information and capabilities
   */
  async getApiInfo(): Promise<ThirdPartyApiInfo> {
    try {
      // For JSONPlaceholder demo, return static API info
      // In a real implementation, this would query the API's info endpoint
      return {
        name: 'ExampleCorp API',
        version: 'v1.0',
        description: 'Demonstration API using JSONPlaceholder for MCP server integration patterns',
        capabilities: [
          'customer-management',
          'order-processing',
          'product-catalog',
          'inventory-tracking',
          'analytics-reporting',
          'refund-processing',
          'data-migration',
        ],
        documentationUrl: 'https://jsonplaceholder.typicode.com/',
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 3600,
          requestsPerDay: 86400,
        },
        statusPageUrl: 'https://jsonplaceholder.typicode.com/',
        metadata: {
          provider: 'JSONPlaceholder',
          baseUrl: this.getConfig().baseUrl,
          apiVersion: this.getConfig().apiVersion,
          timeout: this.getConfig().timeout,
          retryAttempts: this.getConfig().retryAttempts,
        },
      };
    } catch (error) {
      this.getLogger().error(
        'Failed to get API info',
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error('Failed to retrieve API information');
    }
  }

  // =============================================================================
  // CUSTOMER MANAGEMENT METHODS
  // =============================================================================

  /**
   * Query customers with filtering and pagination (using JSONPlaceholder /users)
   */
  async queryCustomers(params: {
    search?: string;
    filters?: {
      status?: string;
      region?: string;
      customerType?: string;
    };
    pagination?: {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    };
    userId: string;
  }): Promise<{ items: Customer[]; totalCount: number; pagination: any }> {
    try {
      // Use JSONPlaceholder /users endpoint
      const response = await fetch(`${this.config.baseUrl}/users`);
      const users = await response.json();

      // Transform JSONPlaceholder users to Customer format
      const customers: Customer[] = users.map((user: any) => ({
        id: user.id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: {
          street: user.address.street,
          city: user.address.city,
          state: user.address.zipcode, // Mock state with zipcode
          zipCode: user.address.zipcode,
          country: 'US', // Mock country
        },
        customerType: 'individual' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // Apply search filter if provided
      const filteredCustomers = params.search
        ? customers.filter((c) =>
          c.name.toLowerCase().includes(params.search!.toLowerCase()) ||
          c.email.toLowerCase().includes(params.search!.toLowerCase())
        )
        : customers;

      // Apply pagination
      const startIndex = ((params.pagination?.page || 1) - 1) * (params.pagination?.limit || 10);
      const endIndex = startIndex + (params.pagination?.limit || 10);
      const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

      return {
        items: paginatedCustomers,
        totalCount: filteredCustomers.length,
        pagination: {
          page: params.pagination?.page || 1,
          limit: params.pagination?.limit || 10,
          totalPages: Math.ceil(filteredCustomers.length / (params.pagination?.limit || 10)),
        },
      };
    } catch (error) {
      this.getLogger().error(
        'Failed to query customers',
        error instanceof Error ? error : new Error(String(error)),
      );
      return { items: [], totalCount: 0, pagination: {} };
    }
  }

  /**
   * Create a new customer (using JSONPlaceholder /users)
   */
  async createCustomer(
    customerData: Omit<Customer, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
    userId: string,
  ): Promise<Customer> {
    try {
      // Use JSONPlaceholder POST /users endpoint
      const response = await fetch(`${this.config.baseUrl}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: customerData.name,
          email: customerData.email,
          phone: customerData.phone,
          address: {
            street: customerData.address.street,
            city: customerData.address.city,
            zipcode: customerData.address.zipCode,
          },
        }),
      });

      const createdUser = await response.json();

      // Transform JSONPlaceholder response to Customer format
      const customer: Customer = {
        id: createdUser.id?.toString() || '101', // JSONPlaceholder returns id: 11 for new posts
        name: customerData.name,
        email: customerData.email,
        phone: customerData.phone || '',
        address: customerData.address,
        customerType: customerData.customerType,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.getLogger().info('Customer created successfully', {
        customerId: customer.id,
        name: customer.name,
      });
      return customer;
    } catch (error) {
      this.getLogger().error(
        'Failed to create customer',
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error('Failed to create customer');
    }
  }

  /**
   * Delete a customer (for rollback operations)
   */
  async deleteCustomer(customerId: string): Promise<void> {
    await this.makeRequest(
      'DELETE',
      `/customers/${customerId}`,
      { requireAuth: true },
    );
  }

  // =============================================================================
  // ORDER MANAGEMENT METHODS
  // =============================================================================

  /**
   * Query orders with filtering and pagination (using JSONPlaceholder /posts)
   */
  async queryOrders(params: {
    search?: string;
    filters?: {
      status?: string;
      dateRange?: {
        startDate?: string;
        endDate?: string;
      };
    };
    pagination?: {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    };
    userId: string;
  }): Promise<{ items: Order[]; totalCount: number; pagination: any }> {
    try {
      // Use JSONPlaceholder /posts endpoint (posts = orders)
      const response = await fetch(`${this.config.baseUrl}/posts`);
      const posts = await response.json();

      // Transform JSONPlaceholder posts to Order format
      const orders: Order[] = posts.map((post: any) => ({
        id: post.id.toString(),
        customerId: post.userId.toString(),
        items: [
          {
            id: `item-${post.id}-1`,
            productId: `product-${post.id % 10 + 1}`,
            quantity: Math.floor(Math.random() * 5) + 1,
            unitPrice: Math.floor(Math.random() * 100) + 10,
            totalPrice: Math.floor(Math.random() * 500) + 50,
          },
        ],
        totalAmount: Math.floor(Math.random() * 500) + 50,
        status: ['pending', 'processing', 'shipped', 'delivered'][post.id % 4] as Order['status'],
        shippingMethod: [
          'standard',
          'expedited',
          'overnight',
        ][post.id % 3] as Order['shippingMethod'],
        trackingNumber: `TRACK-${post.id.toString().padStart(6, '0')}`,
        estimatedDelivery: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000)
          .toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // Apply search filter if provided
      const filteredOrders = params.search
        ? orders.filter((o) =>
          o.id.includes(params.search!) ||
          o.trackingNumber?.includes(params.search!)
        )
        : orders;

      // Apply pagination
      const startIndex = ((params.pagination?.page || 1) - 1) * (params.pagination?.limit || 10);
      const endIndex = startIndex + (params.pagination?.limit || 10);
      const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

      return {
        items: paginatedOrders,
        totalCount: filteredOrders.length,
        pagination: {
          page: params.pagination?.page || 1,
          limit: params.pagination?.limit || 10,
          totalPages: Math.ceil(filteredOrders.length / (params.pagination?.limit || 10)),
        },
      };
    } catch (error) {
      this.getLogger().error(
        'Failed to query orders',
        error instanceof Error ? error : new Error(String(error)),
      );
      return { items: [], totalCount: 0, pagination: {} };
    }
  }

  /**
   * Create a new order
   */
  async createOrder(
    orderData: {
      customerId: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
      }>;
      shippingMethod?: 'standard' | 'expedited' | 'overnight';
      notes?: string;
    },
    userId: string,
  ): Promise<Order> {
    const response = await this.makeRequest<Order>(
      'POST',
      '/orders',
      {
        body: orderData,
        userId,
      },
    );

    if (!response.data) {
      throw new Error('Failed to create order: No data returned');
    }

    return response.data;
  }

  /**
   * Get order status and details
   */
  async getOrderStatus(params: {
    orderId: string;
    includeHistory?: boolean;
    userId: string;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params.includeHistory) queryParams.set('includeHistory', 'true');

    const response = await this.makeRequest(
      'GET',
      `/orders/${params.orderId}/status?${queryParams.toString()}`,
      { userId: params.userId },
    );

    return response.data;
  }

  /**
   * Cancel an order (for rollback operations)
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.makeRequest(
      'POST',
      `/orders/${orderId}/cancel`,
      { requireAuth: true },
    );
  }

  // =============================================================================
  // PRODUCT AND INVENTORY METHODS
  // =============================================================================

  /**
   * Query products
   */
  async queryProducts(params: {
    search?: string;
    filters?: {
      category?: string;
    };
    pagination?: {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    };
    userId: string;
  }): Promise<{ items: Product[]; totalCount: number; pagination: any }> {
    const queryParams = new URLSearchParams();

    if (params.search) queryParams.set('search', params.search);
    if (params.filters?.category) queryParams.set('category', params.filters.category);
    if (params.pagination?.page) queryParams.set('page', params.pagination.page.toString());
    if (params.pagination?.limit) queryParams.set('limit', params.pagination.limit.toString());
    if (params.pagination?.sortBy) queryParams.set('sortBy', params.pagination.sortBy);
    if (params.pagination?.sortOrder) queryParams.set('sortOrder', params.pagination.sortOrder);

    const response = await this.makeRequest<
      { items: Product[]; totalCount: number; pagination: any }
    >(
      'GET',
      `/products?${queryParams.toString()}`,
      { userId: params.userId },
    );

    return response.data || { items: [], totalCount: 0, pagination: {} };
  }

  /**
   * Get inventory levels for products
   */
  async getInventoryLevels(productIds: string[], userId: string): Promise<Record<string, number>> {
    const response = await this.makeRequest<Record<string, number>>(
      'POST',
      '/inventory/levels',
      {
        body: { productIds },
        userId,
      },
    );

    return response.data || {};
  }

  /**
   * Bulk update inventory levels
   */
  async bulkUpdateInventory(
    updateData: {
      updates: Array<{
        productId: string;
        quantity: number;
        operation: 'set' | 'add' | 'subtract';
      }>;
      reason: string;
    },
    userId: string,
  ): Promise<any> {
    const response = await this.makeRequest(
      'POST',
      '/inventory/bulk-update',
      {
        body: updateData,
        userId,
      },
    );

    return response.data;
  }

  /**
   * Restore inventory levels (for rollback operations)
   */
  async restoreInventoryLevels(inventory: Record<string, number>): Promise<void> {
    await this.makeRequest(
      'POST',
      '/inventory/restore',
      {
        body: { inventory },
        requireAuth: true,
      },
    );
  }

  // =============================================================================
  // ANALYTICS METHODS
  // =============================================================================

  /**
   * Query analytics data
   */
  async queryAnalytics(params: {
    filters?: {
      dateRange?: {
        startDate: string;
        endDate: string;
      };
    };
    userId: string;
  }): Promise<any> {
    const queryParams = new URLSearchParams();

    if (params.filters?.dateRange?.startDate) {
      queryParams.set('startDate', params.filters.dateRange.startDate);
    }
    if (params.filters?.dateRange?.endDate) {
      queryParams.set('endDate', params.filters.dateRange.endDate);
    }

    const response = await this.makeRequest(
      'GET',
      `/analytics?${queryParams.toString()}`,
      { userId: params.userId },
    );

    return response.data;
  }

  // =============================================================================
  // REFUND AND FINANCIAL OPERATIONS
  // =============================================================================

  /**
   * Process a refund
   */
  async processRefund(
    refundData: {
      orderId: string;
      refundAmount?: number;
      refundItems?: Array<{
        orderItemId: string;
        quantity: number;
        reason: string;
      }>;
      reason: string;
    },
    userId: string,
  ): Promise<any> {
    const response = await this.makeRequest(
      'POST',
      '/refunds',
      {
        body: refundData,
        userId,
      },
    );

    return response.data;
  }

  // =============================================================================
  // DATA MIGRATION OPERATIONS
  // =============================================================================

  /**
   * Validate data migration
   */
  async validateDataMigration(
    migrationData: {
      sourceSystem: string;
      targetSystem: string;
      dataTypes: string[];
      batchSize: number;
    },
    userId: string,
  ): Promise<any> {
    const response = await this.makeRequest(
      'POST',
      '/migration/validate',
      {
        body: migrationData,
        userId,
      },
    );

    return response.data;
  }

  /**
   * Execute data migration
   */
  async executeDataMigration(
    migrationData: {
      sourceSystem: string;
      targetSystem: string;
      dataTypes: string[];
      batchSize: number;
    },
    userId: string,
  ): Promise<any> {
    const response = await this.makeRequest(
      'POST',
      '/migration/execute',
      {
        body: migrationData,
        userId,
      },
    );

    return response.data;
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * Disconnect from ExampleCorp API
   */
  async disconnect(): Promise<void> {
    this.getLogger().info('ExampleCorp API client disconnected');
  }

  // =============================================================================
  // PRIVATE HTTP CLIENT METHODS
  // =============================================================================

  /**
   * Make authenticated HTTP request to ExampleCorp API
   */
  private async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    options: {
      body?: any;
      headers?: Record<string, string>;
      userId?: string;
      requireAuth?: boolean;
      timeout?: number;
    } = {},
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const requestId = crypto.randomUUID();

    try {
      // 🎯 Get OAuth access token if authentication required
      let accessToken: string | undefined;
      if (options.requireAuth !== false && options.userId) {
        const token = await this.oauthConsumer.getAccessToken(options.userId);
        accessToken = token ?? undefined;
      }

      // Build request headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': this.config.userAgent || 'ExampleCorp-MCP-Client/1.0',
        'X-API-Version': this.config.apiVersion,
        'X-Request-ID': requestId,
        ...options.headers,
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // Make HTTP request with retry logic
      const response = await this.makeHttpRequestWithRetry(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : null,
        signal: AbortSignal.timeout(options.timeout || this.config.timeout),
      });

      // Parse response
      const responseData = await response.json() as ApiResponse<T>;

      this.getLogger().debug('ExampleCorp API request completed', {
        method,
        endpoint,
        status: response.status,
        requestId,
        duration: performance.now(), // Would need to track start time
      });

      return responseData;
    } catch (error) {
      this.getLogger().error(
        'ExampleCorp API request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          method,
          endpoint,
          requestId,
        },
      );

      throw error;
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeHttpRequestWithRetry(
    url: string,
    options: RequestInit,
    attempt = 1,
  ): Promise<Response> {
    try {
      const response = await fetch(url, options);

      // Check for successful response
      if (response.ok) {
        return response;
      }

      // Handle specific error statuses
      if (response.status === 401) {
        throw new Error('Authentication failed - invalid or expired token');
      }
      if (response.status === 403) {
        throw new Error('Forbidden - insufficient permissions');
      }
      if (response.status === 404) {
        throw new Error('Resource not found');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded - please retry later');
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      // Retry on network errors or 5xx server errors
      const shouldRetry = attempt < this.config.retryAttempts &&
        (error instanceof Error && (
          error.name === 'TimeoutError' ||
          error.message.includes('network') ||
          error.message.includes('5')
        ));

      if (shouldRetry) {
        this.getLogger().warn('ExampleCorp API request failed, retrying', {
          url,
          attempt,
          maxAttempts: this.config.retryAttempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Exponential backoff delay
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryDelayMs * Math.pow(2, attempt - 1))
        );

        return this.makeHttpRequestWithRetry(url, options, attempt + 1);
      }

      throw error;
    }
  }
}

/**
 * LIBRARY VALIDATION:
 *
 * This file demonstrates third-party API integration patterns:
 *
 * ✅ Base Class Contract: Extends BaseApiClient for standardized health check and API info methods
 * ✅ Type Safety: Uses ThirdPartyApiHealthStatus and ThirdPartyApiInfo types from library
 * ✅ OAuth Integration: Uses library OAuthConsumer for authentication (~2 lines)
 * ✅ Error Handling: Comprehensive HTTP error handling and retry logic (~50 lines)
 * ✅ Logging: Uses library Logger through BaseApiClient protected methods
 * ✅ HTTP Client: Custom implementation for ExampleCorp-specific patterns
 * ✅ Business Methods: ~20 API methods covering full business operations (~400 lines)
 * ✅ Rollback Support: Methods for operation rollback (delete, cancel, restore)
 *
 * ARCHITECTURE BENEFITS:
 * - Standardized Contract: All API clients implement healthCheck() and getApiInfo() methods
 * - Third-Party Integration: Clean separation of API client from MCP infrastructure
 * - OAuth Abstraction: Library handles token management, client handles API calls
 * - Error Recovery: Comprehensive retry logic and error classification
 * - Type Safety: Full API type definitions for reliable integration
 * - Testing: API client easily mockable for workflow and tool testing
 */
