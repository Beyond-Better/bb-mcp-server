/**
 * Plugin Manager for bb-mcp-server
 * 
 * Basic plugin discovery and management system for future extensibility
 */

import type { Logger } from '../../utils/Logger.ts'
import type {
  WorkflowPlugin,
  LoadedPlugin,
  PluginDiscoveryOptions,
} from '../WorkflowTypes.ts'
import type { WorkflowRegistry } from '../WorkflowRegistry.ts'

/**
 * Manager for plugin discovery, loading, and lifecycle management
 */
export class PluginManager {
  private registry: WorkflowRegistry
  private logger: Logger | undefined
  private discoveryOptions: PluginDiscoveryOptions
  private watchedPaths: string[] = []
  
  constructor(
    registry: WorkflowRegistry,
    options: Partial<PluginDiscoveryOptions> = {},
    logger?: Logger
  ) {
    this.registry = registry
    this.logger = logger
    this.discoveryOptions = {
      paths: ['./plugins'],
      autoload: false,
      watchForChanges: false,
      ...options,
    }
  }
  
  /**
   * Load a plugin from a file path
   */
  async loadPlugin(pluginPath: string): Promise<WorkflowPlugin> {
    this.logger?.debug('Loading plugin', { path: pluginPath })
    
    try {
      // Dynamic import of the plugin module
      const pluginModule = await import(pluginPath)
      
      // Plugin should export either default or a named export
      const plugin = pluginModule.default || pluginModule.plugin
      
      if (!plugin) {
        throw new Error(`Plugin at ${pluginPath} does not export a plugin object`)
      }
      
      // Validate plugin structure
      this.validatePlugin(plugin, pluginPath)
      
      // Register plugin with registry
      this.registry.registerPlugin(plugin)
      
      this.logger?.info('Loaded plugin', {
        name: plugin.name,
        version: plugin.version,
        workflows: plugin.workflows.length,
        path: pluginPath,
      })
      
      return plugin
      
    } catch (error) {
      const errorMessage = `Failed to load plugin from ${pluginPath}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
      
      this.logger?.error('Plugin load failed', new Error(errorMessage), {
        path: pluginPath,
      })
      
      throw new Error(errorMessage)
    }
  }
  
  /**
   * Unload a plugin by name
   */
  async unloadPlugin(name: string): Promise<void> {
    this.logger?.debug('Unloading plugin', { plugin: name })
    
    const success = this.registry.unregisterPlugin(name)
    
    if (success) {
      this.logger?.info('Unloaded plugin', { plugin: name })
    } else {
      this.logger?.warn('Plugin not found for unloading', { plugin: name })
    }
  }
  
  /**
   * Discover and load plugins from configured paths
   */
  async discoverPlugins(): Promise<WorkflowPlugin[]> {
    this.logger?.info('Discovering plugins', {
      paths: this.discoveryOptions.paths,
      autoload: this.discoveryOptions.autoload,
    })
    
    const discoveredPlugins: WorkflowPlugin[] = []
    
    for (const path of this.discoveryOptions.paths) {
      try {
        const plugins = await this.discoverPluginsInPath(path)
        discoveredPlugins.push(...plugins)
      } catch (error) {
        this.logger?.warn('Failed to discover plugins in path', {
          path,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
    
    this.logger?.info('Plugin discovery completed', {
      discovered: discoveredPlugins.length,
    })
    
    return discoveredPlugins
  }
  
  /**
   * Discover plugins in a specific path
   */
  private async discoverPluginsInPath(basePath: string): Promise<WorkflowPlugin[]> {
    const plugins: WorkflowPlugin[] = []
    
    try {
      // Check if path exists
      const stat = await Deno.stat(basePath)
      if (!stat.isDirectory) {
        this.logger?.warn('Plugin path is not a directory', { path: basePath })
        return plugins
      }
      
      // Read directory entries
      for await (const entry of Deno.readDir(basePath)) {
        if (entry.isFile && this.isPluginFile(entry.name)) {
          const pluginPath = `${basePath}/${entry.name}`
          
          try {
            if (this.shouldLoadPlugin(entry.name)) {
              const plugin = await this.loadPlugin(pluginPath)
              plugins.push(plugin)
            } else {
              this.logger?.debug('Skipping blocked plugin', {
                file: entry.name,
                path: pluginPath,
              })
            }
          } catch (error) {
            this.logger?.error('Failed to load discovered plugin', error as Error, {
              file: entry.name,
              path: pluginPath,
            })
          }
        } else if (entry.isDirectory) {
          // Recursively search subdirectories
          const subPlugins = await this.discoverPluginsInPath(`${basePath}/${entry.name}`)
          plugins.push(...subPlugins)
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        this.logger?.debug('Plugin path not found', { path: basePath })
      } else {
        throw error
      }
    }
    
    return plugins
  }
  
  /**
   * Check if a file is a potential plugin file
   */
  private isPluginFile(filename: string): boolean {
    // Look for TypeScript/JavaScript files that might be plugins
    return (
      (filename.endsWith('.ts') || filename.endsWith('.js')) &&
      (filename.includes('plugin') || filename.includes('workflow')) &&
      !filename.includes('.test.') &&
      !filename.includes('.spec.')
    )
  }
  
  /**
   * Check if a plugin should be loaded based on allow/block lists
   */
  private shouldLoadPlugin(filename: string): boolean {
    const pluginName = this.extractPluginName(filename)
    
    // Check blocked plugins
    if (this.discoveryOptions.blockedPlugins?.includes(pluginName)) {
      return false
    }
    
    // Check allowed plugins (if specified)
    if (this.discoveryOptions.allowedPlugins) {
      return this.discoveryOptions.allowedPlugins.includes(pluginName)
    }
    
    return true
  }
  
  /**
   * Extract plugin name from filename
   */
  private extractPluginName(filename: string): string {
    return filename
      .replace(/\.(ts|js)$/, '')
      .replace(/[._-]plugin$/, '')
      .replace(/[._-]workflow$/, '')
  }
  
  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: any, path: string): void {
    const requiredFields = ['name', 'version', 'description', 'workflows']
    
    for (const field of requiredFields) {
      if (!(field in plugin)) {
        throw new Error(`Plugin at ${path} is missing required field: ${field}`)
      }
    }
    
    if (!Array.isArray(plugin.workflows)) {
      throw new Error(`Plugin at ${path} workflows field must be an array`)
    }
    
    if (plugin.workflows.length === 0) {
      throw new Error(`Plugin at ${path} must provide at least one workflow`)
    }
    
    // Validate each workflow has required methods
    for (let i = 0; i < plugin.workflows.length; i++) {
      const workflow = plugin.workflows[i]
      const requiredMethods = ['getRegistration', 'getOverview', 'executeWithValidation']
      
      for (const method of requiredMethods) {
        if (typeof workflow[method] !== 'function') {
          throw new Error(
            `Plugin at ${path} workflow ${i} is missing required method: ${method}`
          )
        }
      }
    }
  }
  
  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return this.registry.getLoadedPlugins()
  }
  
  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(name: string): boolean {
    return this.registry.hasPlugin(name)
  }
  
  /**
   * Get plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.getLoadedPlugins().find(p => p.plugin.name === name)
  }
  
  /**
   * Reload a plugin (unload and load again)
   */
  async reloadPlugin(name: string, path?: string): Promise<WorkflowPlugin> {
    this.logger?.info('Reloading plugin', { plugin: name })
    
    // Find existing plugin if path not provided
    if (!path) {
      const existing = this.getPlugin(name)
      if (!existing) {
        throw new Error(`Plugin ${name} not found for reload`)
      }
      // Note: We can't determine the original path from the loaded plugin
      // This is a limitation of the basic implementation
      throw new Error('Plugin reload requires the original path parameter')
    }
    
    // Unload existing plugin
    await this.unloadPlugin(name)
    
    // Load plugin again
    return await this.loadPlugin(path)
  }
  
  /**
   * Enable file watching for plugin changes (future feature)
   */
  async startWatching(): Promise<void> {
    if (!this.discoveryOptions.watchForChanges) {
      this.logger?.debug('Plugin watching disabled')
      return
    }
    
    this.logger?.info('Starting plugin file watching', {
      paths: this.discoveryOptions.paths,
    })
    
    // TODO: Implement file watching using Deno's file system watcher
    // This would watch for changes in plugin files and auto-reload them
    this.logger?.warn('Plugin file watching not implemented yet')
  }
  
  /**
   * Stop file watching
   */
  async stopWatching(): Promise<void> {
    this.logger?.info('Stopping plugin file watching')
    // TODO: Implement cleanup of file watchers
  }
  
  /**
   * Get plugin manager statistics
   */
  getStats(): {
    totalPlugins: number
    activePlugins: number
    inactivePlugins: number
    totalWorkflows: number
    discoveryPaths: string[]
  } {
    const loadedPlugins = this.getLoadedPlugins()
    const activePlugins = loadedPlugins.filter(p => p.active)
    const totalWorkflows = loadedPlugins.reduce(
      (sum, p) => sum + p.plugin.workflows.length,
      0
    )
    
    return {
      totalPlugins: loadedPlugins.length,
      activePlugins: activePlugins.length,
      inactivePlugins: loadedPlugins.length - activePlugins.length,
      totalWorkflows,
      discoveryPaths: this.discoveryOptions.paths,
    }
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
      author?: string
      license?: string
      tags?: string[]
      dependencies?: string[]
    } = {}
  ): WorkflowPlugin {
    const plugin: WorkflowPlugin = {
      name,
      version,
      description,
      workflows,
    }
    
    if (options.author) plugin.author = options.author
    if (options.license) plugin.license = options.license
    if (options.tags) plugin.tags = options.tags
    if (options.dependencies) plugin.dependencies = options.dependencies
    
    return plugin
  }
}