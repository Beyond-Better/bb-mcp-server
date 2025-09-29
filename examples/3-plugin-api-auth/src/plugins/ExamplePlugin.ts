/**
 * ExampleCorp Plugin for bb-mcp-server
 *
 * Demonstrates plugin architecture for bundling workflows and tools
 * according to the bb-mcp-server plugin strategy.
 */

import type {
  AppPlugin,
  AppServerDependencies,
  Logger,
  ToolRegistration,
  ToolRegistry,
  WorkflowBase,
  WorkflowRegistry,
} from '@beyondbetter/bb-mcp-server';
import { ExampleQueryWorkflow } from '../plugins/workflows/ExampleQueryWorkflow.ts';
import { ExampleOperationWorkflow } from '../plugins/workflows/ExampleOperationWorkflow.ts';
import type { ExampleQueryWorkflowDependencies } from '../plugins/workflows/ExampleQueryWorkflow.ts';
import type { ExampleOperationWorkflowDependencies } from '../plugins/workflows/ExampleOperationWorkflow.ts';
import type { ExampleApiClient } from '../api/ExampleApiClient.ts';
import { ExampleTools } from '../plugins/tools/ExampleTools.ts';
import type { ExampleToolsDependencies } from '../plugins/tools/ExampleTools.ts';
import type { ExampleOAuthConsumer } from '../auth/ExampleOAuthConsumer.ts';

/**
 * Plugin dependencies interface
 * Note: The actual AppPlugin interface expects initialize(registry: WorkflowRegistry)
 * Dependencies need to be handled differently in the plugin system
 */
export interface ExamplePluginDependencies {
  thirdpartyApiClient: ExampleApiClient;
  oAuthConsumer: ExampleOAuthConsumer;
  logger: Logger;
}

/**
 * ExampleCorp Plugin Implementation
 *
 * This plugin bundles ExampleCorp workflows and tools for automatic discovery
 * and registration by the bb-mcp-server plugin system.
 */
class ExampleCorpPlugin implements AppPlugin {
  name = 'example-corp-plugin';
  version = '1.0.0';
  description = 'ExampleCorp business workflows and tools plugin for bb-mcp-server';
  author = 'ExampleCorp Integration Team';
  license = 'MIT';
  tags = ['examplecorp', 'business', 'query', 'operation', 'api'];

  workflows: WorkflowBase[] = [];
  tools: ToolRegistration[] = [];
  dependencies = ['@beyondbetter/bb-mcp-server'];

  /**
   * Initialize the plugin with registry
   * Called by the plugin manager during plugin loading
   * Note: Dependencies need to be injected separately in the current plugin architecture
   */
  async initialize(
    dependencies: AppServerDependencies,
    toolRegistry: ToolRegistry,
    workflowRegistry: WorkflowRegistry,
  ): Promise<void> {
    dependencies.logger.info(`${this.name} plugin initialized`, {
      workflows: this.workflows.length,
      tools: this.tools.length,
      note: 'Tools and workflows registered by PluginManager',
    });
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
export default function createPlugin(dependencies: AppServerDependencies): AppPlugin {
  const plugin = new ExampleCorpPlugin();

  // Initialize the plugin synchronously for simple use cases
  // Note: For async initialization, use the initialize() method
  const { thirdpartyApiClient, oAuthConsumer, logger, auditLogger } = dependencies;

  // Validate required dependencies
  if (!thirdpartyApiClient || !oAuthConsumer) {
    logger.warn('ExamplePlugin: Missing required dependencies', {
      hasApiClient: !!thirdpartyApiClient,
      hasOAuthConsumer: !!oAuthConsumer,
      impact: 'Some tools and workflows may not function correctly',
    });
  }

  // Create workflows
  const queryWorkflowDeps: ExampleQueryWorkflowDependencies = {
    apiClient: thirdpartyApiClient,
    logger,
  };

  const operationWorkflowDeps: ExampleOperationWorkflowDependencies = {
    apiClient: thirdpartyApiClient,
    logger,
  };

  plugin.workflows = [
    new ExampleQueryWorkflow(queryWorkflowDeps),
    new ExampleOperationWorkflow(operationWorkflowDeps),
  ];

  // Create tools - PluginManager will register these
  if (thirdpartyApiClient && oAuthConsumer) {
    const exampleToolsDependencies: ExampleToolsDependencies = {
      apiClient: thirdpartyApiClient,
      oauthConsumer: oAuthConsumer,
      logger,
      auditLogger,
    };

    plugin.tools = createExampleTools(exampleToolsDependencies);
  } else {
    logger.warn('ExamplePlugin: Skipping tool creation due to missing dependencies');
    plugin.tools = [];
  }

  return plugin;
}

/**
 * Create ExampleCorp tools for plugin registration
 * Returns tool objects that PluginManager can register
 * Now works with the ToolBase class and ToolRegistration interface
 */
function createExampleTools(dependencies: ExampleToolsDependencies): ToolRegistration[] {
  const exampleTools = new ExampleTools(dependencies);

  // Get tool registrations from the ToolBase class
  const toolRegistrations = exampleTools.getTools();

  // ToolRegistrations are already in the correct format for PluginManager
  return toolRegistrations;
}

/**
 * UPDATED PLUGIN ARCHITECTURE:
 *
 * This plugin now demonstrates the CORRECT PATTERN for tool and workflow registration:
 *
 * ✅ **Plugin populates tools array**: PluginManager registers tools automatically
 * ✅ **Plugin populates workflows array**: PluginManager registers workflows automatically
 * ✅ **No manual registration**: Plugin doesn't call registerWith() directly
 * ✅ **Dependency injection**: Factory function handles proper dependency setup
 * ✅ **Dual tool support**: ExampleTools supports both plugin and direct registration patterns
 *
 * USAGE APPROACHES:
 * 1. **Automatic Discovery** (Recommended): PluginManager finds and registers everything
 * 2. **Factory Function**: Manual plugin creation with createExamplePlugin()
 * 3. **Direct Registration**: Still supported via ExampleTools.registerWith()
 */
// const plugin: AppPlugin = {
//   name: 'example-corp-plugin',
//   version: '1.0.0',
//   description: 'ExampleCorp business workflows and tools plugin for bb-mcp-server (BROKEN - for reference only)',
//   author: 'ExampleCorp Integration Team',
//   license: 'MIT',
//   workflows: [], // Empty - and initialize() has no way to populate the registry!
//   dependencies: ['@beyondbetter/bb-mcp-server'],
//   tags: ['examplecorp', 'business', 'query', 'operation', 'api'],
//
//   async initialize(registry: WorkflowRegistry, pluginDependencies: AppServerDependencies): Promise<void> {
//     // PROBLEM: This method doesn't have access to apiClient and logger dependencies!
//     // And even if it did, there's no clean way to register the workflows with the registry
//     pluginDependencies.logger.info('ExampleCorp plugin discovered - but this initialize method is broken!')
//     pluginDependencies.logger.info('Use createExamplePlugin() factory function instead for working functionality')
//
//     // This creates a plugin but we can't access its workflows to register them:
//     // const plugin = createExamplePlugin({ thirdpartyApiClient, logger }) // ← thirdpartyApiClient, logger not available!
//   },
//
//   async cleanup(): Promise<void> {
//     console.log('ExampleCorp plugin cleanup called')
//   },
// }
//
//export default plugin

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
 *    - Provide dependencies (thirdpartyApiClient, logger, etc.)
 *    - Register plugin with WorkflowRegistry manually
 *
 * 3. Dependency Injection:
 *    - Plugin receives dependencies from application context
 *    - Workflows get properly initialized instances
 *    - Clean separation between plugin and business logic
 */
