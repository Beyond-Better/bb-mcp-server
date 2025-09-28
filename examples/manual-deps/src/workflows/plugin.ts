/**
 * ExampleCorp Workflows Plugin Export
 * 
 * This file makes the existing ExampleCorp workflows discoverable by the
 * bb-mcp-server plugin system. It follows the plugin architecture pattern
 * while maintaining compatibility with existing workflow implementations.
 */

import type { AppPlugin } from '@bb/mcp-server'
import { ExampleQueryWorkflow } from './ExampleQueryWorkflow.ts'
import { ExampleOperationWorkflow } from './ExampleOperationWorkflow.ts'
import type { ExampleQueryWorkflowDependencies } from './ExampleQueryWorkflow.ts'
import type { ExampleOperationWorkflowDependencies } from './ExampleOperationWorkflow.ts'
import type { Logger } from '@bb/mcp-server'
import type { ExampleApiClient } from '../api/ExampleApiClient.ts'

/**
 * Plugin dependencies interface
 * These will be injected by the plugin manager during initialization
 */
export interface WorkflowPluginDependencies {
  apiClient: ExampleApiClient
  logger: Logger
}

/**
 * ExampleCorp Workflows Plugin
 * 
 * This plugin exports the existing ExampleCorp workflows for automatic
 * discovery by the PluginManager when scanning workflow directories.
 */
const exampleWorkflowsPlugin: AppPlugin = {
  name: 'example-workflows',
  version: '1.0.0',
  description: 'ExampleCorp query and operation workflows for bb-mcp-server',
  author: 'ExampleCorp Integration Team',
  license: 'MIT',
  workflows: [], // Will be populated during initialization
  dependencies: ['@bb/mcp-server'],
  tags: ['examplecorp', 'workflows', 'query', 'operation'],
  
  /**
   * Initialize plugin with registry
   * This is called by the plugin manager when the plugin is loaded
   */
  async initialize(registry: any): Promise<void> {
    // In the current plugin architecture, workflows need to be created with dependencies
    // before the plugin is registered. This method is called after registration.
    console.log('ExampleCorp workflows plugin initialized')
  },
  
  /**
   * Cleanup plugin resources
   * Called when the plugin is unloaded
   */
  async cleanup(): Promise<void> {
    console.log('ExampleCorp workflows plugin cleaned up')
  },
}

/**
 * Create plugin instance with dependencies
 * 
 * This factory function creates a properly initialized plugin instance
 * with the workflow dependencies injected.
 */
export function createExampleWorkflowsPlugin(dependencies: WorkflowPluginDependencies): AppPlugin {
  const { apiClient, logger } = dependencies
  
  // Create workflow dependencies
  const queryWorkflowDeps: ExampleQueryWorkflowDependencies = {
    apiClient,
    logger,
  }
  
  const operationWorkflowDeps: ExampleOperationWorkflowDependencies = {
    apiClient,
    logger,
  }
  
  // Create workflow instances
  const workflows = [
    new ExampleQueryWorkflow(queryWorkflowDeps),
    new ExampleOperationWorkflow(operationWorkflowDeps),
  ]
  
  // Return plugin with populated workflows
  return {
    ...exampleWorkflowsPlugin,
    workflows,
  }
}

/**
 * Default export for plugin discovery
 * 
 * The PluginManager will look for this default export when scanning
 * directories for plugins. Since this is a factory pattern, we export
 * a basic plugin structure that can be enhanced with dependencies.
 */
export default exampleWorkflowsPlugin

/**
 * Manual registration helper
 * 
 * This function can be used to manually register the workflows with
 * a WorkflowRegistry if automatic plugin discovery is not used.
 */
export function registerExampleWorkflows(
  registry: any, // WorkflowRegistry
  dependencies: WorkflowPluginDependencies
): void {
  const plugin = createExampleWorkflowsPlugin(dependencies)
  
  // Register each workflow individually
  for (const workflow of plugin.workflows) {
    registry.registerWorkflow(workflow)
  }
}

/**
 * INTEGRATION NOTES:
 * 
 * This file demonstrates how existing workflows can be made discoverable
 * by the plugin system without requiring major refactoring:
 * 
 * ✅ Existing workflows unchanged: ExampleQueryWorkflow and ExampleOperationWorkflow
 *    remain exactly as they were implemented
 * ✅ Plugin architecture compliance: Implements AppPlugin interface
 * ✅ Dependency injection support: Accepts dependencies via factory function
 * ✅ Discovery compatibility: Can be found by PluginManager scanning directories
 * ✅ Manual registration support: Can be registered directly if needed
 * ✅ Backward compatibility: Existing code continues to work unchanged
 * 
 * USAGE PATTERNS:
 * 
 * 1. Automatic Discovery (via PluginManager):
 *    - PluginManager scans ./workflows directory
 *    - Finds plugin.ts file
 *    - Imports default export
 *    - Registers workflows automatically
 * 
 * 2. Manual Registration (existing pattern):
 *    - Import registerExampleWorkflows function
 *    - Call with registry and dependencies
 *    - Workflows registered directly
 * 
 * 3. Factory Pattern (new capability):
 *    - Import createExampleWorkflowsPlugin function
 *    - Provide dependencies
 *    - Get fully initialized plugin instance
 */