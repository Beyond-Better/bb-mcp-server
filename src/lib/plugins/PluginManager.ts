/**
 * Plugin Manager for bb-mcp-server
 *
 * Basic plugin discovery and management system for future extensibility
 */

import { resolve } from '@std/path';
import type { Logger } from '../utils/Logger.ts';
import type { AppPlugin, LoadedPlugin, PluginDiscoveryOptions } from '../types/PluginTypes.ts';
import type { AppServerDependencies } from '../types/AppServerTypes.ts';
import type { ToolRegistry } from '../tools/ToolRegistry.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';

/**
 * Manager for plugin discovery, loading, and lifecycle management
 */
export class PluginManager {
  private toolRegistry: ToolRegistry;
  private workflowRegistry: WorkflowRegistry;
  private logger: Logger | undefined;
  private discoveryOptions: PluginDiscoveryOptions;
  private watchedPaths: string[] = [];
  private pluginDependencies: AppServerDependencies;
  private plugins = new Map<string, LoadedPlugin>();

  constructor(
    toolRegistry: ToolRegistry,
    workflowRegistry: WorkflowRegistry,
    options: Partial<PluginDiscoveryOptions> = {},
    pluginDependencies: AppServerDependencies,
  ) {
    this.toolRegistry = toolRegistry;
    this.workflowRegistry = workflowRegistry;
    this.logger = pluginDependencies.logger;
    this.pluginDependencies = pluginDependencies;
    this.discoveryOptions = {
      paths: ['./plugins'],
      autoload: false,
      watchForChanges: false,
      ...options,
    };
  }

  /**
   * Load a plugin from a file path
   */
  async loadPlugin(pluginPath: string): Promise<AppPlugin> {
    // Ensure we have an absolute path for reliable import
    const absolutePath = pluginPath.startsWith('/') || pluginPath.startsWith('file://')
      ? pluginPath
      : resolve(Deno.cwd(), pluginPath);

    // Convert to file:// URL for Deno import
    const importUrl = absolutePath.startsWith('file://') ? absolutePath : `file://${absolutePath}`;

    this.logger?.info('Loading plugin', {
      originalPath: pluginPath,
      absolutePath,
      importUrl,
    });

    try {
      // Dynamic import of the plugin module using absolute file:// URL
      const pluginModule = await import(importUrl);

      // Try multiple export patterns to find the plugin
      let plugin = null;

      if (pluginModule.default && typeof pluginModule.default === 'function') {
        // 1. Try default export as function
        plugin = pluginModule.default(this.pluginDependencies);
        await plugin.initialize(this.toolRegistry, this.workflowRegistry, this.pluginDependencies);
      } else if (pluginModule.default && typeof pluginModule.default === 'object') {
        // 1. Try default export as object
        plugin = pluginModule.default;
        await plugin.initialize(this.toolRegistry, this.workflowRegistry, this.pluginDependencies);
      } else if (pluginModule.plugin && typeof pluginModule.plugin === 'object') {
        // 2. Try named 'plugin' export
        plugin = pluginModule.plugin;
        await plugin.initialize(this.toolRegistry, this.workflowRegistry, this.pluginDependencies);
      } else {
        // 3. Try factory function exports (createXxxPlugin)
        const factoryNames = Object.keys(pluginModule).filter((key) =>
          key.toLowerCase().includes('plugin') && typeof pluginModule[key] === 'function'
        );
        if (factoryNames.length > 0) {
          this.logger?.debug(`Found plugin factory function: ${factoryNames[0]}`, {
            path: pluginPath,
            availableExports: Object.keys(pluginModule),
          });
          // Skip factory functions for now - they need dependencies
          throw new Error(
            `Plugin at ${pluginPath} exports factory functions but no plugin object. Use factory functions manually for dependency injection.`,
          );
        }
      }

      if (!plugin) {
        throw new Error(
          `Plugin at ${pluginPath} does not export a valid plugin object. Available exports: ${
            Object.keys(pluginModule).join(', ')
          }`,
        );
      }

      // Validate plugin structure
      this.validatePlugin(plugin, pluginPath);

      this.logger?.info('Registering plugin', { name: plugin.name });

      await this.registerPlugin(plugin);

      this.logger?.info('Loaded plugin', {
        name: plugin.name,
        version: plugin.version,
        workflows: plugin.workflows.length,
        path: pluginPath,
        absolutePath,
      });

      return plugin;
    } catch (error) {
      const errorMessage = `Failed to load plugin from ${pluginPath}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;

      this.logger?.error('Plugin load failed', new Error(errorMessage), {
        path: pluginPath,
        absolutePath,
        importUrl,
        error: error instanceof Error ? error.stack : undefined,
      });

      throw new Error(errorMessage);
    }
  }

  /**
   * Unload a plugin by name
   */
  async unloadPlugin(name: string): Promise<void> {
    this.logger?.debug('Unloading plugin', { plugin: name });

    const success = await this.unregisterPlugin(name);

    if (success) {
      this.logger?.info('Unloaded plugin', { plugin: name });
    } else {
      this.logger?.warn('Plugin not found for unloading', { plugin: name });
    }
  }

  async registerPlugin(plugin: AppPlugin): Promise<void> {
    const validationErrors = this.validatePlugin(plugin);
    if (validationErrors.length > 0) {
      const errorMessage = `Plugin registration has errors:\n${validationErrors.join('\n')}`;
      this.logger?.error('Failed to register plugin', new Error(errorMessage), {
        plugin: plugin.name,
        errors: validationErrors,
      });
      throw new Error(errorMessage);
    }

    try {
      // Track which items came from this plugin for cleanup
      const pluginItems = {
        workflows: [] as string[],
        tools: [] as string[],
      };

      // Register existing workflows
      for (const workflow of plugin.workflows || []) {
        this.workflowRegistry.registerWorkflow(workflow);
        const registration = workflow.getRegistration();
        pluginItems.workflows.push(registration.name);
      }

      // Register existing tools
      for (const tool of plugin.tools || []) {
        // Note: Tools need proper registration pattern - this will need updating based on tool structure
        // this.toolRegistry.registerTool(tool.name, tool.definition, tool.handler);
        // pluginItems.tools.push(tool.name);
      }

      // Call optional initialize method for async setup
      if (plugin.initialize && typeof plugin.initialize === 'function') {
        await plugin.initialize(this.toolRegistry, this.workflowRegistry);
        
        // After initialize, register any newly added workflows/tools
        // Check for new workflows added during initialize
        for (const workflow of plugin.workflows || []) {
          const registration = workflow.getRegistration();
          if (!pluginItems.workflows.includes(registration.name)) {
            this.workflowRegistry.registerWorkflow(workflow);
            pluginItems.workflows.push(registration.name);
          }
        }
        
        // Check for new tools added during initialize
        for (const tool of plugin.tools || []) {
          // Similar pattern for tools once tool structure is defined
        }
      }

      // Store loaded plugin with item tracking
      this.plugins.set(plugin.name, {
        plugin,
        loadedAt: new Date(),
        active: true,
        registeredItems: pluginItems,
      });

      this.logger?.info('Registered plugin', {
        plugin: plugin.name,
        version: plugin.version,
        workflows: pluginItems.workflows.length,
        tools: pluginItems.tools.length,
        author: plugin.author,
      });
    } catch (error) {
      this.plugins.set(plugin.name, {
        plugin,
        loadedAt: new Date(),
        active: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.logger?.error('Failed to initialize plugin', error as Error, {
        plugin: plugin.name,
      });

      throw error;
    }
  }

  async unregisterPlugin(pluginName: string): Promise<boolean> {
    const loadedPlugin = this.plugins.get(pluginName);
    if (!loadedPlugin) {
      this.logger?.warn('Plugin not found for unloading', { plugin: pluginName });
      return false;
    }

    try {
      // Cleanup plugin if it has a cleanup method
      if (loadedPlugin.plugin.cleanup && typeof loadedPlugin.plugin.cleanup === 'function') {
        await loadedPlugin.plugin.cleanup();
      }

      // Unregister workflows that came from this plugin
      if (loadedPlugin.registeredItems?.workflows) {
        for (const workflowName of loadedPlugin.registeredItems.workflows) {
          this.workflowRegistry.unregister(workflowName);
        }
      }

      // Unregister tools that came from this plugin
      if (loadedPlugin.registeredItems?.tools) {
        for (const toolName of loadedPlugin.registeredItems.tools) {
          this.toolRegistry.removeTool(toolName);
        }
      }

      // Remove plugin
      this.plugins.delete(pluginName);

      this.logger?.info('Unloaded plugin', {
        plugin: pluginName,
        workflows: loadedPlugin.registeredItems?.workflows?.length || 0,
        tools: loadedPlugin.registeredItems?.tools?.length || 0,
      });

      return true;
    } catch (error) {
      this.logger?.error('Failed to unregister plugin', error as Error, {
        plugin: pluginName,
      });
      return false;
    }
  }

  /**
   * Validate plugin registration
   * Enhanced to support dependency injection patterns
   */
  private validatePlugin(plugin: AppPlugin): string[] {
    const errors: string[] = [];

    if (!plugin.name) {
      errors.push('Plugin name is required');
    }

    if (!plugin.version) {
      errors.push('Plugin version is required');
    }

    if (!plugin.description) {
      errors.push('Plugin description is required');
    }

    if (!Array.isArray(plugin.tools)) {
      errors.push('Plugin tools must be an array');
      return errors;
    }

    if (!Array.isArray(plugin.workflows)) {
      errors.push('Plugin workflows must be an array');
      return errors;
    }

    // Allow empty workflows if plugin has initialize method (dependency injection pattern)
    const hasInitializeMethod = typeof plugin.initialize === 'function';
    if (plugin.tools.length === 0 && plugin.workflows.length === 0 && !hasInitializeMethod) {
      errors.push(
        'Plugin must provide at least one tool/workflow or an initialize method for dependency injection',
      );
    }

    // Log debug info for empty workflow plugins
    if (plugin.tools.length === 0 && plugin.workflows.length === 0 && hasInitializeMethod) {
      this.logger?.debug(
        'Plugin has empty tools/workflows array but has initialize method - assuming dependency injection pattern',
        {
          plugin: plugin.name,
          version: plugin.version,
        },
      );
    }

    return errors;
  }

  /**
   * Discover and load plugins from configured paths
   */
  async discoverPlugins(): Promise<AppPlugin[]> {
    // Resolve all discovery paths to absolute paths from current working directory
    const absolutePaths = this.discoveryOptions.paths.map((path) => resolve(Deno.cwd(), path));

    this.logger?.info('Discovering plugins', {
      paths: this.discoveryOptions.paths,
      absolutePaths,
      cwd: Deno.cwd(),
      autoload: this.discoveryOptions.autoload,
    });

    const discoveredPlugins: AppPlugin[] = [];

    for (const absolutePath of absolutePaths) {
      try {
        const plugins = await this.discoverPluginsInPath(absolutePath);
        discoveredPlugins.push(...plugins);
      } catch (error) {
        this.logger?.warn('Failed to discover plugins in path', {
          path: absolutePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger?.info('Plugin discovery completed', {
      discovered: discoveredPlugins.length,
    });

    return discoveredPlugins;
  }

  /**
   * Discover plugins in a specific path
   */
  private async discoverPluginsInPath(basePath: string): Promise<AppPlugin[]> {
    const plugins: AppPlugin[] = [];

    try {
      // Check if path exists
      const stat = await Deno.stat(basePath);
      this.logger?.info('Checking path for plugins', {
        basePath,
        stat,
      });
      if (!stat.isDirectory) {
        this.logger?.warn('Plugin path is not a directory', { path: basePath });
        return plugins;
      }

      // Read directory entries
      for await (const entry of Deno.readDir(basePath)) {
        if (entry.isFile && this.isPluginFile(entry.name)) {
          const pluginPath = resolve(basePath, entry.name);
          this.logger?.info('Checking plugin', {
            basePath,
            entry,
            pluginPath,
          });

          try {
            if (this.shouldLoadPlugin(entry.name)) {
              this.logger?.info('Should load plugin', {
                pluginName: entry.name,
              });
              const plugin = await this.loadPlugin(pluginPath);
              plugins.push(plugin);
            } else {
              this.logger?.debug('Skipping blocked plugin', {
                file: entry.name,
                path: pluginPath,
              });
            }
          } catch (error) {
            this.logger?.error('Failed to load discovered plugin', error as Error, {
              file: entry.name,
              path: pluginPath,
            });
          }
        } else if (entry.isDirectory) {
          // Recursively search subdirectories with absolute path
          const subDirPath = resolve(basePath, entry.name);
          const subPlugins = await this.discoverPluginsInPath(subDirPath);
          plugins.push(...subPlugins);
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        this.logger?.debug('Plugin path not found', { path: basePath });
      } else {
        throw error;
      }
    }
    this.logger?.info('Found plugins', {
      plugins,
    });

    return plugins;
  }

  /**
   * Check if a file is a potential plugin file
   * More specific detection to avoid loading individual workflow classes as plugins
   */
  private isPluginFile(filename: string): boolean {
    const lowercaseFilename = filename.toLowerCase();

    // Skip test files
    if (lowercaseFilename.includes('.test.') || lowercaseFilename.includes('.spec.')) {
      return false;
    }

    // Only TypeScript/JavaScript files
    if (!(lowercaseFilename.endsWith('.ts') || lowercaseFilename.endsWith('.js'))) {
      return false;
    }

    // Specific plugin file patterns:
    // 1. Files explicitly named 'plugin.ts' or 'plugin.js'
    // 2. Files ending with 'Plugin.ts' (e.g., ExamplePlugin.ts)
    // 3. Files ending with '.plugin.ts' (e.g., example.plugin.ts)
    return (
      filename === 'plugin.ts' || filename === 'plugin.js' ||
      lowercaseFilename.endsWith('plugin.ts') || lowercaseFilename.endsWith('plugin.js') ||
      lowercaseFilename.endsWith('.plugin.ts') || lowercaseFilename.endsWith('.plugin.js')
    );
  }

  /**
   * Check if a plugin should be loaded based on allow/block lists
   */
  private shouldLoadPlugin(filename: string): boolean {
    const pluginName = this.extractPluginName(filename);

    this.logger?.info('Should load plugin', {
      pluginName,
      allowedPlugins: this.discoveryOptions.allowedPlugins,
      blockedPlugins: this.discoveryOptions.blockedPlugins,
    });

    // Check blocked plugins
    if (this.discoveryOptions.blockedPlugins?.includes(pluginName)) {
      return false;
    }

    // Check allowed plugins (if specified)
    if (this.discoveryOptions.allowedPlugins && this.discoveryOptions.allowedPlugins.length > 0) {
      return this.discoveryOptions.allowedPlugins.includes(pluginName);
    }

    return true;
  }

  /**
   * Extract plugin name from filename
   */
  private extractPluginName(filename: string): string {
    return filename
      .replace(/\.(ts|js)$/, '')
      .replace(/[._-]plugin$/, '')
      .replace(/[._-]workflow$/, '');
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: any, path: string): void {
    const requiredFields = ['name', 'version', 'description', 'workflows'];

    for (const field of requiredFields) {
      if (!(field in plugin)) {
        throw new Error(`Plugin at ${path} is missing required field: ${field}`);
      }
    }

    if (!Array.isArray(plugin.workflows)) {
      throw new Error(`Plugin at ${path} workflows field must be an array`);
    }

    // Allow empty workflows array if plugin has initialize method (dependency injection pattern)
    const hasInitializeMethod = typeof plugin.initialize === 'function';
    if (plugin.workflows.length === 0 && !hasInitializeMethod) {
      throw new Error(
        `Plugin at ${path} must provide at least one workflow or an initialize method for dependency injection`,
      );
    }

    // Skip workflow validation for plugins with empty workflows (dependency injection pattern)
    if (plugin.workflows.length === 0 && hasInitializeMethod) {
      this.logger?.debug(
        'Plugin has empty workflows array but has initialize method - assuming dependency injection pattern',
        {
          plugin: plugin.name,
          path,
        },
      );
      return;
    }

    // Validate each workflow has required methods (for plugins with pre-populated workflows)
    for (let i = 0; i < plugin.workflows.length; i++) {
      const workflow = plugin.workflows[i];
      const requiredMethods = ['getRegistration', 'getOverview', 'executeWithValidation'];

      for (const method of requiredMethods) {
        if (typeof workflow[method] !== 'function') {
          throw new Error(
            `Plugin at ${path} workflow ${i} is missing required method: ${method}`,
          );
        }
      }
    }
  }



  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(name: string): boolean {
    return this.hasPlugin(name);
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.getLoadedPlugins().find((p) => p.plugin.name === name);
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if a plugin is loaded
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Reload a plugin (unload and load again)
   */
  async reloadPlugin(name: string, path?: string): Promise<AppPlugin> {
    this.logger?.info('Reloading plugin', { plugin: name });

    // Find existing plugin if path not provided
    if (!path) {
      const existing = this.getPlugin(name);
      if (!existing) {
        throw new Error(`Plugin ${name} not found for reload`);
      }
      // Note: We can't determine the original path from the loaded plugin
      // This is a limitation of the basic implementation
      throw new Error('Plugin reload requires the original path parameter');
    }

    // Unload existing plugin
    await this.unloadPlugin(name);

    // Load plugin again
    return await this.loadPlugin(path);
  }

  /**
   * Enable file watching for plugin changes (future feature)
   */
  async startWatching(): Promise<void> {
    if (!this.discoveryOptions.watchForChanges) {
      this.logger?.debug('Plugin watching disabled');
      return;
    }

    this.logger?.info('Starting plugin file watching', {
      paths: this.discoveryOptions.paths,
    });

    // TODO: Implement file watching using Deno's file system watcher
    // This would watch for changes in plugin files and auto-reload them
    this.logger?.warn('Plugin file watching not implemented yet');
  }

  /**
   * Stop file watching
   */
  async stopWatching(): Promise<void> {
    this.logger?.info('Stopping plugin file watching');
    // TODO: Implement cleanup of file watchers
  }

  /**
   * Get plugin manager statistics
   */
  getStats(): {
    totalPlugins: number;
    activePlugins: number;
    inactivePlugins: number;
    totalWorkflows: number;
    discoveryPaths: string[];
  } {
    const loadedPlugins = this.getLoadedPlugins();
    const activePlugins = loadedPlugins.filter((p) => p.active);
    const totalWorkflows = loadedPlugins.reduce(
      (sum, p) => sum + p.plugin.workflows.length,
      0,
    );

    return {
      totalPlugins: loadedPlugins.length,
      activePlugins: activePlugins.length,
      inactivePlugins: loadedPlugins.length - activePlugins.length,
      totalWorkflows,
      discoveryPaths: this.discoveryOptions.paths,
    };
  }

  /**
   * Create a simple plugin from workflow instances
   *
   * Utility method for creating plugins programmatically
   */
  static createSimplePlugin(
    name: string,
    version: string,
    description: string,
    workflows: any[],
    options: {
      author?: string;
      license?: string;
      tags?: string[];
      dependencies?: string[];
    } = {},
  ): AppPlugin {
    const plugin: AppPlugin = {
      name,
      version,
      description,
      workflows,
    };

    if (options.author) plugin.author = options.author;
    if (options.license) plugin.license = options.license;
    if (options.tags) plugin.tags = options.tags;
    if (options.dependencies) plugin.dependencies = options.dependencies;

    return plugin;
  }
}
