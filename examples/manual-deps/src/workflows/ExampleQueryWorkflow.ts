/**
 * ExampleCorp Query Workflow
 * 
 * Demonstrates how to create custom workflows using the bb-mcp-server library:
 * - Extends library WorkflowBase class
 * - Uses library validation and error handling
 * - Integrates with third-party API authentication
 * - Shows structured input/output patterns
 */

// 🎯 Library imports - workflow infrastructure
import {
  WorkflowBase,
  Logger,
} from '@bb/mcp-server'
import type {
  WorkflowResult,
  WorkflowContext,
} from '@bb/mcp-server'
import { z } from 'zod' // Library provides Zod integration

// 🎯 Consumer-specific imports
import { ExampleApiClient } from '../api/ExampleApiClient.ts'

export interface ExampleQueryWorkflowDependencies {
  apiClient: ExampleApiClient
  logger: Logger
}

/**
 * ExampleCorp Query Workflow
 * 
 * 🎯 EXTENDS library WorkflowBase for business-specific operations
 * 🎯 Library handles: validation, error handling, execution context
 * 🎯 Consumer handles: business logic, API integration, data processing
 */
export class ExampleQueryWorkflow extends WorkflowBase {
  // 🎯 Required workflow metadata (library enforces these)
  readonly name = 'example_query'
  readonly version = '1.0.0'
  readonly description = '🔍 Query ExampleCorp data with advanced filtering and pagination'
  readonly category = 'query' as const
  override readonly tags = ['query', 'search', 'examplecorp', 'data']
  
  // 🎯 Library-enforced parameter validation schema
  readonly parameterSchema = z.object({
    // Required for all workflows
    userId: z.string().describe('User ID for authentication and audit logging'),
    requestId: z.string().optional().describe('Optional request ID for tracking'),
    dryRun: z.boolean().optional().default(false).describe('Dry run mode'),
    // Query parameters
    queryType: z.enum(['customers', 'orders', 'products', 'analytics']).describe('Type of data to query'),
    searchTerm: z.string().optional().describe('Search term for filtering results'),
    
    // Filtering options
    filters: z.object({
      dateRange: z.object({
        startDate: z.string().optional().describe('Start date (ISO 8601)'),
        endDate: z.string().optional().describe('End date (ISO 8601)'),
      }).optional(),
      status: z.string().optional().describe('Status filter'),
      category: z.string().optional().describe('Category filter'),
      region: z.string().optional().describe('Regional filter'),
    }).optional().describe('Advanced filtering options'),
    
    // Pagination and sorting
    pagination: z.object({
      page: z.number().int().min(1).optional().default(1).describe('Page number'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Items per page'),
      sortBy: z.string().optional().describe('Field to sort by'),
      sortOrder: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort order'),
    }).optional().describe('Pagination and sorting options'),
    
    // Output options
    outputFormat: z.enum(['summary', 'detailed', 'raw']).optional().default('summary').describe('Output detail level'),
    includeMetadata: z.boolean().optional().default(false).describe('Include query metadata in results'),
    
    // Note: userId, requestId, dryRun already defined above
  })
  
  private apiClient: ExampleApiClient
  private logger: Logger
  
  constructor(dependencies: ExampleQueryWorkflowDependencies) {
    super() // 🎯 Initialize library base class
    
    this.apiClient = dependencies.apiClient
    this.logger = dependencies.logger
  }

  /**
   * Get workflow registration information (required by WorkflowBase)
   */
  getRegistration() {
    return {
      name: this.name,
      displayName: 'ExampleCorp Query Workflow',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration || 30,
      tags: this.tags,
      author: 'ExampleCorp Integration Team',
    }
  }

  /**
   * Get workflow overview for tool descriptions (required by WorkflowBase)
   */
  getOverview(): string {
    return `${this.description}\n\nSupported Query Types:\n- customers: Query customer records with advanced filtering\n- orders: Query order history with status and date filters\n- products: Query product catalog with category filters\n- analytics: Query business analytics with date range filtering\n\nFeatures:\n- Advanced filtering and search\n- Pagination support\n- Multiple output formats\n- Dry run validation`
  }

  /**
   * Protected workflow execution method (required by WorkflowBase)
   */
  protected async executeWorkflow(params: any, context: WorkflowContext): Promise<WorkflowResult> {
    return await this.execute(params)
  }
  
  /**
   * 🎯 Main workflow execution
   * Library handles: input validation, error catching, result formatting
   */
  async execute(params: z.infer<typeof this.parameterSchema>): Promise<WorkflowResult> {
    const startTime = Date.now()
    
    try {
      // 🎯 Library validates params against inputSchema before this method is called
      this.logger.info('ExampleCorp query workflow started', {
        workflowName: this.name,
        queryType: params.queryType,
        userId: params.userId,
        requestId: params.requestId,
        dryRun: params.dryRun,
      })
      
      // 🎯 Dry run mode - validate and return without execution
      if (params.dryRun) {
        return await this.performDryRun(params)
      }
      
      // 🎯 Execute query based on type
      let queryResults: any
      
      switch (params.queryType) {
        case 'customers':
          queryResults = await this.queryCustomers(params)
          break
        case 'orders':
          queryResults = await this.queryOrders(params)
          break
        case 'products':
          queryResults = await this.queryProducts(params)
          break
        case 'analytics':
          queryResults = await this.queryAnalytics(params)
          break
        default:
          throw new Error(`Unsupported query type: ${params.queryType}`)
      }
      
      // 🎯 Format results based on requested output format
      const formattedResults = await this.formatResults(
        queryResults,
        params.outputFormat || 'summary',
        params.includeMetadata || false
      )
      
      const executionTime = Date.now() - startTime
      
      this.logger.info('ExampleCorp query workflow completed', {
        workflowName: this.name,
        queryType: params.queryType,
        resultCount: queryResults.items?.length || 0,
        executionTime,
        userId: params.userId,
      })
      
      // 🎯 Return structured workflow result (library enforces this format)
      return {
        success: true,
        data: formattedResults,
        completed_steps: [{
          operation: `query_${params.queryType}`,
          success: true,
          data: { resultCount: queryResults.items?.length || 0 },
          duration_ms: executionTime,
          timestamp: new Date().toISOString(),
        }],
        failed_steps: [],
        metadata: {
          workflowName: this.name,
          executionTime,
          queryType: params.queryType,
          resultCount: queryResults.items?.length || 0,
          timestamp: new Date().toISOString(),
        },
      }
      
    } catch (error) {
      const executionTime = Date.now() - startTime
      
      this.logger.error('ExampleCorp query workflow failed', error instanceof Error ? error : new Error(String(error)), {
        workflowName: this.name,
        executionTime,
        userId: params.userId,
      })
      
      // 🎯 Return structured error result (library handles error formatting)
      return {
        success: false,
        error: {
          type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          code: undefined,
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true,
        },
        completed_steps: [],
        failed_steps: [{
          operation: `query_${params.queryType}`,
          error_type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          ...(error instanceof Error && error.stack ? { details: error.stack } : {}),
          timestamp: new Date().toISOString(),
        }],
        metadata: {
          workflowName: this.name,
          executionTime,
          timestamp: new Date().toISOString(),
        },
      }
    }
  }
  
  // =============================================================================
  // PRIVATE QUERY METHODS
  // =============================================================================
  
  /**
   * Perform dry run validation
   */
  private async performDryRun(params: z.infer<typeof this.parameterSchema>): Promise<WorkflowResult> {
    // Validate API connectivity
    const apiStatus = await this.apiClient.healthCheck()
    if (!apiStatus.healthy) {
      throw new Error('ExampleCorp API is not accessible')
    }
    
    // Validate query parameters
    const validationResults = await this.validateQueryParameters(params)
    
    return {
      success: true,
      data: {
        dryRun: true,
        validation: validationResults,
        estimatedResults: this.estimateResultCount(params),
        queryPlan: this.buildQueryPlan(params),
      },
      completed_steps: [{
        operation: 'dry_run_validation',
        success: true,
        data: { validation: validationResults },
        duration_ms: 100,
        timestamp: new Date().toISOString(),
      }],
      failed_steps: [],
      metadata: {
        workflowName: this.name,
        mode: 'dry_run',
        timestamp: new Date().toISOString(),
      },
    }
  }
  
  /**
   * Query customers from ExampleCorp API
   */
  private async queryCustomers(params: z.infer<typeof this.parameterSchema>): Promise<any> {
    const queryParams: any = {
      search: params.searchTerm,
      filters: {} as any,
      pagination: {
        page: params.pagination?.page || 1,
        limit: params.pagination?.limit || 20,
        sortBy: params.pagination?.sortBy || 'name',
        sortOrder: params.pagination?.sortOrder || 'asc',
      },
      // OAuth handling is automatic via ExampleOAuthConsumer
      userId: params.userId,
    };
    
    // Only set filter properties if they have values
    if (params.filters?.status) {
      queryParams.filters.status = params.filters.status;
    }
    if (params.filters?.region) {
      queryParams.filters.region = params.filters.region;
    }
    if (params.filters?.category) {
      queryParams.filters.customerType = params.filters.category;
    }
    
    return await this.apiClient.queryCustomers(queryParams)
  }
  
  /**
   * Query orders from ExampleCorp API
   */
  private async queryOrders(params: z.infer<typeof this.parameterSchema>): Promise<any> {
    const queryParams: any = {
      search: params.searchTerm,
      filters: {} as any,
      pagination: {
        page: params.pagination?.page || 1,
        limit: params.pagination?.limit || 20,
        sortBy: params.pagination?.sortBy || 'createdDate',
        sortOrder: params.pagination?.sortOrder || 'desc',
      },
      userId: params.userId,
    };
    
    // Only set filter properties if they have values
    if (params.filters?.status) {
      queryParams.filters.status = params.filters.status;
    }
    if (params.filters?.dateRange?.startDate || params.filters?.dateRange?.endDate) {
      queryParams.filters.dateRange = {
        startDate: params.filters.dateRange.startDate || '',
        endDate: params.filters.dateRange.endDate || '',
      };
    }
    
    return await this.apiClient.queryOrders(queryParams)
  }
  
  /**
   * Query products from ExampleCorp API
   */
  private async queryProducts(params: z.infer<typeof this.parameterSchema>): Promise<any> {
    const queryParams: any = {
      search: params.searchTerm,
      filters: {} as any,
      pagination: {
        page: params.pagination?.page || 1,
        limit: params.pagination?.limit || 20,
        sortBy: params.pagination?.sortBy || 'name',
        sortOrder: params.pagination?.sortOrder || 'asc',
      },
      userId: params.userId,
    };
    
    // Only set filter properties if they have values
    if (params.filters?.category) {
      queryParams.filters.category = params.filters.category;
    }
    
    return await this.apiClient.queryProducts(queryParams)
  }
  
  /**
   * Query analytics from ExampleCorp API
   */
  private async queryAnalytics(params: z.infer<typeof this.parameterSchema>): Promise<any> {
    return await this.apiClient.queryAnalytics({
      filters: {
        dateRange: params.filters?.dateRange ? {
          startDate: params.filters.dateRange.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: params.filters.dateRange.endDate || new Date().toISOString(),
        } : {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        },
      },
      userId: params.userId,
    })
  }
  
  // =============================================================================
  // RESULT FORMATTING METHODS
  // =============================================================================
  
  /**
   * Format results based on requested output format
   */
  private async formatResults(
    results: any,
    format: 'summary' | 'detailed' | 'raw',
    includeMetadata: boolean
  ): Promise<any> {
    switch (format) {
      case 'raw':
        return results
        
      case 'summary':
        return {
          totalCount: results.totalCount || 0,
          itemCount: results.items?.length || 0,
          summary: this.generateSummary(results),
          ...(includeMetadata && { metadata: results.metadata }),
        }
        
      case 'detailed':
        return {
          query: results.query,
          totalCount: results.totalCount || 0,
          items: results.items || [],
          pagination: results.pagination,
          summary: this.generateSummary(results),
          ...(includeMetadata && { metadata: results.metadata }),
        }
        
      default:
        return results
    }
  }
  
  /**
   * Generate summary of query results
   */
  private generateSummary(results: any): Record<string, any> {
    const items = results.items || []
    
    return {
      totalItems: results.totalCount || 0,
      returnedItems: items.length,
      hasMore: (results.totalCount || 0) > items.length,
      // Generate type-specific summaries
      ...this.generateTypeSummary(items, results.queryType),
    }
  }
  
  /**
   * Generate type-specific summaries
   */
  private generateTypeSummary(items: any[], queryType?: string): Record<string, any> {
    switch (queryType) {
      case 'customers':
        return {
          customerTypes: this.countByField(items, 'type'),
          regions: this.countByField(items, 'region'),
          statuses: this.countByField(items, 'status'),
        }
        
      case 'orders':
        return {
          orderStatuses: this.countByField(items, 'status'),
          totalValue: items.reduce((sum, item) => sum + (item.totalAmount || 0), 0),
          averageValue: items.length > 0 ? items.reduce((sum, item) => sum + (item.totalAmount || 0), 0) / items.length : 0,
        }
        
      case 'products':
        return {
          categories: this.countByField(items, 'category'),
          averagePrice: items.length > 0 ? items.reduce((sum, item) => sum + (item.price || 0), 0) / items.length : 0,
          inStockCount: items.filter(item => item.inStock).length,
        }
        
      default:
        return {}
    }
  }
  
  // =============================================================================
  // VALIDATION AND UTILITY METHODS
  // =============================================================================
  
  /**
   * Validate query parameters
   */
  private async validateQueryParameters(params: z.infer<typeof this.parameterSchema>): Promise<any> {
    const validation: any = { valid: true, issues: [] }
    
    // Validate date range
    if (params.filters?.dateRange) {
      const { startDate, endDate } = params.filters.dateRange
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        validation.issues.push('Start date must be before end date')
        validation.valid = false
      }
    }
    
    // Validate pagination limits
    if (params.pagination?.limit && params.pagination.limit > 100) {
      validation.issues.push('Limit cannot exceed 100 items')
      validation.valid = false
    }
    
    return validation
  }
  
  /**
   * Estimate result count for dry run
   */
  private estimateResultCount(params: z.infer<typeof this.parameterSchema>): number {
    // Simple estimation logic - in real implementation, might query API for counts
    const baseCount = {
      customers: 1000,
      orders: 5000,
      products: 500,
      analytics: 1,
    }[params.queryType] || 0
    
    // Adjust for search term
    const searchMultiplier = params.searchTerm ? 0.1 : 1
    
    return Math.floor(baseCount * searchMultiplier)
  }
  
  /**
   * Build query plan for dry run
   */
  private buildQueryPlan(params: z.infer<typeof this.parameterSchema>): any {
    return {
      queryType: params.queryType,
      searchEnabled: !!params.searchTerm,
      filtersApplied: Object.keys(params.filters || {}).length,
      pagination: params.pagination || { page: 1, limit: 20 },
      estimatedApiCalls: 1,
      estimatedExecutionTime: '< 5 seconds',
    }
  }
  
  /**
   * Count items by field value
   */
  private countByField(items: any[], field: string): Record<string, number> {
    return items.reduce((counts, item) => {
      const value = item[field] || 'unknown'
      counts[value] = (counts[value] || 0) + 1
      return counts
    }, {})
  }
}

/**
 * LIBRARY VALIDATION:
 * 
 * This file demonstrates custom workflow patterns using library infrastructure:
 * 
 * ✅ Base Workflow: Library WorkflowBase handles execution framework (~0 lines)
 * ✅ Input Validation: Library Zod integration validates parameters (~0 lines)
 * ✅ Error Handling: Library handles workflow error patterns (~0 lines)
 * ✅ Result Formatting: Library enforces WorkflowResult structure (~0 lines)
 * ✅ Logging Integration: Library Logger provides structured logging (~2 lines)
 * ✅ Authentication: Library handles OAuth context automatically (~0 lines)
 * ✅ Business Logic: Custom ExampleCorp operations (~200 lines)
 * ✅ API Integration: Clean third-party API integration patterns
 * 
 * ARCHITECTURE BENEFITS:
 * - Workflow Infrastructure: Complete workflow execution framework in library
 * - Type Safety: Full TypeScript + Zod validation throughout
 * - Error Recovery: Library handles workflow error scenarios
 * - Audit Logging: Automatic workflow execution logging
 * - Testing: Business logic easily testable independently
 */