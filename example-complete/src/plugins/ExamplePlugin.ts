/**
 * ExampleCorp Plugin for bb-mcp-server
 * 
 * Demonstrates plugin architecture for bundling workflows and tools
 * according to the bb-mcp-server plugin strategy.
 */

import type { AppPlugin } from '@bb/mcp-server'
import { ExampleQueryWorkflow } from '../workflows/ExampleQueryWorkflow.ts'
import { ExampleOperationWorkflow } from '../workflows/ExampleOperationWorkflow.ts'
import type { ExampleQueryWorkflowDependencies } from '../workflows/ExampleQueryWorkflow.ts'
import type { ExampleOperationWorkflowDependencies } from '../workflows/ExampleOperationWorkflow.ts'
import type { Logger } from '@bb/mcp-server'
import type { ExampleApiClient } from '../api/ExampleApiClient.ts'

/**
 * Plugin dependencies interface
 * Note: The actual AppPlugin interface expects initialize(registry: WorkflowRegistry)
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
class ExampleCorpPlugin implements AppPlugin {
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
export function createExamplePlugin(dependencies: ExamplePluginDependencies): AppPlugin {
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
 * This plugin demonstrates the BROKEN PATTERN - don't use this approach.
 * The initialize method creates workflows but has no way to register them.
 * 
 * Better approaches:
 * 1. Use the factory function manually: createExamplePlugin({ apiClient, logger })
 * 2. Use the workflow wrapper plugin: example/src/workflows/plugin.ts
 * 3. Use direct registration: workflowRegistry.registerWorkflow(new Workflow())
 */
const plugin: AppPlugin = {
  name: 'example-corp-plugin',
  version: '1.0.0',
  description: 'ExampleCorp business workflows and tools plugin for bb-mcp-server (BROKEN - for reference only)',
  author: 'ExampleCorp Integration Team',
  license: 'MIT',
  workflows: [], // Empty - and initialize() has no way to populate the registry!
  dependencies: ['@bb/mcp-server'],
  tags: ['examplecorp', 'business', 'query', 'operation', 'api'],
  
  async initialize(registry: any): Promise<void> {
    // PROBLEM: This method doesn't have access to apiClient and logger dependencies!
    // And even if it did, there's no clean way to register the workflows with the registry
    console.log('ExampleCorp plugin discovered - but this initialize method is broken!')
    console.log('Use createExamplePlugin() factory function instead for working functionality')
    
    // This creates a plugin but we can't access its workflows to register them:
    // const plugin = createExamplePlugin({ apiClient, logger }) // ← apiClient, logger not available!
  },
  
  async cleanup(): Promise<void> {
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
 * ✅ Plugin Export: Default export implements AppPlugin interface
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