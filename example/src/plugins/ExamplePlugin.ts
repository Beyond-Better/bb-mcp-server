/**
 * ExampleCorp Plugin for bb-mcp-server
 * 
 * Demonstrates plugin architecture for bundling workflows and tools
 * according to the bb-mcp-server plugin strategy.
 */

import type { WorkflowPlugin } from '@bb/mcp-server'
import { ExampleQueryWorkflow } from '../workflows/ExampleQueryWorkflow.ts'
import { ExampleOperationWorkflow } from '../workflows/ExampleOperationWorkflow.ts'
import type { ExampleQueryWorkflowDependencies } from '../workflows/ExampleQueryWorkflow.ts'
import type { ExampleOperationWorkflowDependencies } from '../workflows/ExampleOperationWorkflow.ts'
import type { Logger } from '@bb/mcp-server'
import type { ExampleApiClient } from '../api/ExampleApiClient.ts'

/**
 * Plugin dependencies interface
 * Note: The actual WorkflowPlugin interface expects initialize(registry: WorkflowRegistry)
 * Dependencies need to be handled differently in the plugin system
 */
export interface ExamplePluginDependencies {
  apiClient: ExampleApiClient
  logger: Logger
}

/**
 * ExampleCorp Plugin Implementation
 * 
 * This plugin bundles ExampleCorp workflows and tools for automatic discovery
 * and registration by the bb-mcp-server plugin system.
 */
class ExampleCorpPlugin implements WorkflowPlugin {
  name = 'example-corp-plugin'
  version = '1.0.0'
  description = 'ExampleCorp business workflows and tools plugin for bb-mcp-server'
  author = 'ExampleCorp Integration Team'
  license = 'MIT'
  tags = ['examplecorp', 'business', 'query', 'operation', 'api']
  
  workflows: any[] = []
  dependencies = ['@bb/mcp-server']
  
  /**
   * Initialize the plugin with registry
   * Called by the plugin manager during plugin loading
   * Note: Dependencies need to be injected separately in the current plugin architecture
   */
  async initialize(registry: any): Promise<void> {
    // In the current plugin architecture, workflows need to be created with dependencies
    // before the plugin is registered. This method is called after registration.
    console.log(`${this.name} plugin initialized with registry`)
  }
  
  /**
   * Cleanup plugin resources
   * Called by the plugin manager during plugin unloading
   */
  async cleanup(): Promise<void> {
    // Cleanup any plugin-specific resources here
    // For this example, workflows don't need explicit cleanup
  }
}

/**
 * Factory function to create plugin instance
 * This pattern allows for dependency injection during plugin creation
 */
export function createExamplePlugin(dependencies: ExamplePluginDependencies): WorkflowPlugin {
  const plugin = new ExampleCorpPlugin()
  
  // Initialize the plugin synchronously for simple use cases
  // Note: For async initialization, use the initialize() method
  const { apiClient, logger } = dependencies
  
  const queryWorkflowDeps: ExampleQueryWorkflowDependencies = {
    apiClient,
    logger,
  }
  
  const operationWorkflowDeps: ExampleOperationWorkflowDependencies = {
    apiClient,
    logger,
  }
  
  plugin.workflows = [
    new ExampleQueryWorkflow(queryWorkflowDeps),
    new ExampleOperationWorkflow(operationWorkflowDeps),
  ]
  
  return plugin
}

/**
 * Default export for plugin discovery
 * 
 * This will be discovered by the PluginManager when scanning plugin directories.
 * The plugin manager expects a default export that implements WorkflowPlugin.
 * 
 * Note: This is a basic plugin structure for discovery. The actual workflow
 * instances need to be created with proper dependencies using the factory function.
 */
const plugin: WorkflowPlugin = {
  name: 'example-corp-plugin',
  version: '1.0.0',
  description: 'ExampleCorp business workflows and tools plugin for bb-mcp-server',
  author: 'ExampleCorp Integration Team',
  license: 'MIT',
  workflows: [], // Will be populated during initialization with dependencies
  dependencies: ['@bb/mcp-server'],
  tags: ['examplecorp', 'business', 'query', 'operation', 'api'],
  
  async initialize(registry: any): Promise<void> {
    // This would be called by the plugin manager after registration
    // The workflows need to be created with dependencies before this point
    console.log('ExampleCorp plugin base initialization called')
  },
  
  async cleanup(): Promise<void> {
    // Plugin cleanup logic
    console.log('ExampleCorp plugin cleanup called')
  },
}

export default plugin

/**
 * PLUGIN ARCHITECTURE NOTES:
 * 
 * This plugin demonstrates the bb-mcp-server plugin architecture:
 * 
 * ✅ Plugin Manifest: plugin.json defines plugin metadata
 * ✅ Plugin Export: Default export implements WorkflowPlugin interface
 * ✅ Workflow Integration: Existing workflows are wrapped in plugin structure
 * ✅ Dependency Injection: Plugin accepts dependencies for workflow creation
 * ✅ Factory Pattern: createExamplePlugin() allows flexible instantiation
 * ✅ Lifecycle Management: initialize() and cleanup() hooks for plugin lifecycle
 * ✅ Discovery Ready: Plugin can be discovered by PluginManager
 * ✅ Zero Breaking Changes: Existing workflow code remains unchanged
 * 
 * USAGE PATTERNS:
 * 
 * 1. Automatic Discovery:
 *    - PluginManager scans ./plugins directories
 *    - Finds plugin.json manifest
 *    - Loads ExamplePlugin.ts via dynamic import
 *    - Registers workflows automatically
 * 
 * 2. Manual Registration:
 *    - Import createExamplePlugin factory
 *    - Provide dependencies (apiClient, logger, etc.)
 *    - Register plugin with WorkflowRegistry manually
 * 
 * 3. Dependency Injection:
 *    - Plugin receives dependencies from application context
 *    - Workflows get properly initialized instances
 *    - Clean separation between plugin and business logic
 */