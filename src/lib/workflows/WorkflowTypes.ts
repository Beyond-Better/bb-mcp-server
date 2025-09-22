/**
 * Enhanced workflow types for bb-mcp-server
 * 
 * Comprehensive type definitions with Phase 1 integration and plugin support
 */

import { z, type ZodSchema } from 'zod'
import type { Logger } from '../utils/Logger.ts'
import type { AuditLogger } from '../utils/AuditLogger.ts'
import type { KVManager } from '../storage/KVManager.ts'

// Enhanced workflow categories
export type WorkflowCategory = 
  | 'integration'      // Third-party API integrations
  | 'data'            // Data processing
  | 'automation'      // Automated tasks
  | 'analysis'        // Analysis and reporting
  | 'management'      // Resource management
  | 'utility'         // Utility workflows
  | 'custom'          // Custom workflows
  | 'query'           // Query operations
  | 'operation'       // Business operations

/**
 * Default workflow categories - extracted from WorkflowCategory type
 */
export const DEFAULT_WORKFLOW_CATEGORIES: readonly WorkflowCategory[] = [
  'integration',
  'data', 
  'automation',
  'analysis',
  'management',
  'utility',
  'custom',
  'query',
  'operation'
] as const

/**
 * Configuration for workflow registry
 */
export interface WorkflowRegistryConfig {
  /** Valid workflow categories (defaults to DEFAULT_WORKFLOW_CATEGORIES) */
  validCategories?: readonly WorkflowCategory[]
  /** Allow dynamic category registration */
  allowDynamicCategories?: boolean
  /** Custom categories beyond the predefined ones */
  customCategories?: readonly string[]
}

/**
 * Base workflow parameters that all workflows should accept
 */
export interface BaseWorkflowParameters {
  /** User ID for authentication and audit logging */
  userId: string
  /** Optional request ID for tracking */
  requestId?: string
  /** Dry run mode - validate but don't execute */
  dryRun?: boolean
}

/**
 * Enhanced workflow context with Phase 1 integrations
 */
export interface WorkflowContext {
  userId: string
  requestId: string
  workflowName: string
  startTime: Date
  
  // Services (from Phase 1)
  auditLogger: AuditLogger
  logger: Logger | undefined
  kvManager: KVManager | undefined
  
  // Third-party integration (generic)
  thirdPartyClient: any | undefined
  
  // Request metadata
  parameterUserId: string | undefined
  _meta: Record<string, unknown>
  
  // Authentication context
  authenticatedUserId: string | undefined
  clientId: string | undefined
  scopes: string[] | undefined
}

/**
 * Enhanced workflow result with performance data
 */
export interface WorkflowResult {
  success: boolean
  data?: unknown
  error?: WorkflowError
  completed_steps: WorkflowStep[]
  failed_steps: FailedStep[]
  metadata: Record<string, unknown>
  duration?: number // NEW: execution time in ms
  resources?: WorkflowResource[] // NEW: resource tracking
}

/**
 * Individual workflow step result
 */
export interface WorkflowStep {
  operation: string
  success: boolean
  data?: unknown
  duration_ms: number
  timestamp: string
}

/**
 * Failed step with enhanced error information
 */
export interface FailedStep {
  operation: string
  error_type: 'validation' | 'authentication' | 'api_error' | 'system_error' | 'timeout'
  message: string
  details?: string
  code?: string
  retry_after?: number
  timestamp: string
}

/**
 * Enhanced workflow error
 */
export interface WorkflowError {
  type: 'validation' | 'authentication' | 'api_error' | 'system_error' | 'timeout'
  message: string
  details: string | undefined
  code: string | undefined
  stack: string | undefined
  recoverable: boolean
}

/**
 * Workflow resource tracking
 */
export interface WorkflowResource {
  type: 'api_call' | 'storage_operation' | 'file_access' | 'external_service'
  name: string
  duration_ms: number
  status: 'success' | 'failure' | 'timeout'
  metadata: Record<string, unknown> | undefined
}

/**
 * Enhanced workflow registration with plugin support
 */
export interface WorkflowRegistration {
  /** Unique workflow name */
  name: string
  /** Human-readable display name */
  displayName: string
  /** Workflow description */
  description: string
  /** Workflow version */
  version: string
  /** Workflow category */
  category: WorkflowCategory
  /** Whether workflow requires authentication */
  requiresAuth: boolean
  /** Estimated execution time in seconds */
  estimatedDuration?: number
  /** Tags for workflow discovery */
  tags?: string[]
  /** Author information */
  author?: string
  /** License information */
  license?: string
  /** Plugin information (if from plugin) */
  plugin?: PluginInfo
}

/**
 * Plugin information
 */
export interface PluginInfo {
  name: string
  version: string
  author: string
  description?: string
}

/**
 * Workflow plugin interface
 */
export interface WorkflowPlugin {
  name: string
  version: string
  description: string
  author?: string
  license?: string
  workflows: WorkflowBase[]
  dependencies?: string[]
  initialize?(registry: WorkflowRegistry): Promise<void>
  cleanup?(): Promise<void>
  tags?: string[]
}

/**
 * Loaded plugin information
 */
export interface LoadedPlugin {
  plugin: WorkflowPlugin
  loadedAt: Date
  active: boolean
  error?: string
}

/**
 * Workflow validation result with Zod integration
 */
export interface ValidationResult<T = any> {
  valid: boolean
  data?: T
  errors: ValidationError[]
  warnings?: string[]
}

/**
 * Enhanced validation error
 */
export interface ValidationError {
  path: string
  message: string
  code: string
  expected: string | undefined
  received: string | undefined
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  requests: number
  window: number // seconds
  burst?: number
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  timeout?: number // milliseconds
  retries?: number
  priority?: 'low' | 'normal' | 'high'
  metadata?: Record<string, unknown>
}

/**
 * Forward declarations to avoid circular dependencies
 */
export interface WorkflowBase {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly category: WorkflowCategory
  readonly tags: string[]
  readonly estimatedDuration?: number
  readonly requiresAuth: boolean
  readonly rateLimit?: RateLimitConfig
  readonly parameterSchema: ZodSchema<any>
  
  executeWithValidation(params: unknown, context: WorkflowContext): Promise<WorkflowResult>
  validateParameters(params: unknown): Promise<ValidationResult<any>>
  getRegistration(): WorkflowRegistration
  getOverview(): string
}

export interface WorkflowRegistry {
  register(workflow: WorkflowBase): void
  registerPlugin(plugin: WorkflowPlugin): void
  getWorkflow(name: string): WorkflowBase | undefined
  getWorkflowsByCategory(category: WorkflowCategory): WorkflowBase[]
  getWorkflowsByTag(tag: string): WorkflowBase[]
  searchWorkflows(query: string): WorkflowBase[]
  getRegistration(name: string): WorkflowRegistration | undefined
  hasWorkflow(name: string): boolean
  unregister(name: string): boolean
  clear(): void
}

/**
 * Plugin discovery options
 */
export interface PluginDiscoveryOptions {
  paths: string[]
  autoload: boolean
  watchForChanges: boolean
  allowedPlugins?: string[]
  blockedPlugins?: string[]
}

/**
 * Workflow execution metrics
 */
export interface WorkflowMetrics {
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  averageDuration: number
  lastExecuted?: Date
  errorRate: number
}

/**
 * Workflow audit entry
 */
export interface WorkflowAuditEntry {
  timestamp: string
  userId: string
  workflow: string
  requestId: string
  action: string
  details: Record<string, unknown>
  result: 'success' | 'failure' | 'partial'
  durationMs?: number
  resources?: WorkflowResource[]
}