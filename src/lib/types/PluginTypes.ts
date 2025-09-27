/**
 * Enhanced workflow types for bb-mcp-server
 * 
 * Comprehensive type definitions with Phase 1 integration and plugin support
 */

//import { z, type ZodSchema } from 'zod'
//import type { Logger } from '../utils/Logger.ts'
import type { ToolBase } from './ToolTypes.ts'
import type { WorkflowBase } from './WorkflowTypes.ts'
import type { ToolRegistry } from '../workflows/ToolRegistry.ts'
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts'


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
export interface AppPlugin {
  name: string
  version: string
  description: string
  author?: string
  license?: string
  workflows: WorkflowBase[]
  tools: ToolBase[]
  dependencies?: string[]
  initialize?(toolRegistry: ToolRegistry, workflowRegistry: WorkflowRegistry): Promise<void>
  cleanup?(): Promise<void>
  tags?: string[]
}

/**
 * Loaded plugin information
 */
export interface LoadedPlugin {
  plugin: AppPlugin
  loadedAt: Date
  active: boolean
  error?: string
  registeredItems?: {
    workflows: string[]
    tools: string[]
  }
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
