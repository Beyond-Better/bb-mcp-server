/**
 * Enhanced workflow types for bb-mcp-server
 *
 * Comprehensive type definitions with Phase 1 integration and plugin support
 */

//import { z, type ZodSchema } from 'zod'
//import type { Logger } from '../utils/Logger.ts'
import type { AppServerDependencies } from './AppServerTypes.ts';
import type { ToolRegistration } from './BeyondMcpTypes.ts';
import type { WorkflowBase } from './WorkflowTypes.ts';
import type { ToolRegistry } from '../tools/ToolRegistry.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';

/**
 * Plugin information
 */
export interface PluginInfo {
  name: string;
  version: string;
  author: string;
  description?: string;
}

// Enhanced workflow categories
export type PluginCategory =
  | 'integration' // Third-party API integrations
  | 'data' // Data processing
  | 'automation' // Automated tasks
  | 'analysis' // Analysis and reporting
  | 'management' // Resource management
  | 'utility' // Utility workflows
  | 'custom' // Custom workflows
  | 'query' // Query operations
  | 'operation' // Business operations
  | 'business'; // Business operations
/**
 * Default workflow categories - extracted from PluginCategory type
 */
export const DEFAULT_PLUGIN_CATEGORIES: readonly PluginCategory[] = [
  'integration',
  'data',
  'automation',
  'analysis',
  'management',
  'utility',
  'custom',
  'query',
  'operation',
  'business',
] as const;

/**
 * Workflow plugin interface
 */
export interface AppPlugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  workflows: WorkflowBase[];
  tools: ToolRegistration[];
  dependencies?: string[];
  initialize?(
    dependencies: AppServerDependencies,
    toolRegistry: ToolRegistry,
    workflowRegistry: WorkflowRegistry,
  ): Promise<void>;
  cleanup?(): Promise<void>;
  tags?: string[];
}

/**
 * Loaded plugin information
 */
export interface LoadedPlugin {
  plugin: AppPlugin;
  loadedAt: Date;
  active: boolean;
  error?: string;
  registeredItems?: {
    workflows: string[];
    tools: string[];
  };
}

/**
 * Plugin discovery options
 */
export interface PluginDiscoveryOptions {
  paths: string[];
  autoload: boolean;
  watchForChanges: boolean;
  allowedPlugins?: string[];
  blockedPlugins?: string[];
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  requests: number;
  window: number; // seconds
  burst?: number;
}
