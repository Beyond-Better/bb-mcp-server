/**
 * Enhanced WorkflowRegistry for bb-mcp-server
 *
 * - Plugin support foundation
 * - Category-based organization
 * - Tag-based searching
 * - Performance monitoring
 */

import type { Logger } from '../utils/Logger.ts';
import type { ErrorHandler } from '../utils/ErrorHandler.ts';
import type {
  WorkflowBase,
  WorkflowMetrics,
  WorkflowRegistration,
  WorkflowRegistryConfig,
} from '../types/WorkflowTypes.ts';
import type { PluginCategory } from '../types/PluginTypes.ts';

import { DEFAULT_PLUGIN_CATEGORIES } from '../types/PluginTypes.ts';

/**
 * Enhanced registry for managing workflow instances, metadata, and plugins
 */
export class WorkflowRegistry {
  private static instance: WorkflowRegistry | undefined;

  private workflows = new Map<string, WorkflowBase>();
  private registrations = new Map<string, WorkflowRegistration>();
  private categories = new Map<PluginCategory, string[]>();
  private tags = new Map<string, string[]>();
  private metrics = new Map<string, WorkflowMetrics>();
  private logger: Logger | undefined;
  private config: WorkflowRegistryConfig;
  private validCategories: Set<string>;
  private errorHandler: ErrorHandler;

  private constructor(
    dependencies: { logger: Logger; config?: WorkflowRegistryConfig; errorHandler: ErrorHandler },
  ) {
    this.logger = dependencies.logger;
    this.errorHandler = dependencies.errorHandler;
    this.config = dependencies.config || {};
    this.validCategories = this.initializeValidCategories();
    this.initializeCategories();
  }

  /**
   * Get singleton instance of WorkflowRegistry
   */
  static getInstance(
    dependencies: { logger: Logger; config?: WorkflowRegistryConfig; errorHandler: ErrorHandler },
  ): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry(dependencies);
    }
    return WorkflowRegistry.instance;
  }

  /**
   * Clear singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    WorkflowRegistry.instance = undefined;
  }

  /**
   * Initialize valid categories from configuration
   */
  private initializeValidCategories(): Set<string> {
    const baseCategories = this.config.validCategories || DEFAULT_PLUGIN_CATEGORIES;
    const customCategories = this.config.customCategories || [];

    const allCategories = [...baseCategories, ...customCategories];
    return new Set(allCategories);
  }

  /**
   * Initialize category indexes
   */
  private initializeCategories(): void {
    // Initialize all valid categories
    for (const category of this.validCategories) {
      this.categories.set(category as PluginCategory, []);
    }
  }

  /**
   * Register a workflow instance
   */
  registerWorkflow(workflow: WorkflowBase): void {
    const registration = workflow.getRegistration();
    const name = registration.name;

    // Validate registration and workflow methods
    const validationErrors = this.validateRegistration(registration, workflow);
    if (validationErrors.length > 0) {
      const errorMessage = `Workflow registration has errors:\n${validationErrors.join('\n')}`;
      this.logger?.error('Failed to register workflow', new Error(errorMessage), {
        workflow: name,
        errors: validationErrors,
      });
      throw new Error(errorMessage);
    }

    // Check for existing workflow
    if (this.workflows.has(name)) {
      this.logger?.warn('Workflow already registered, overwriting', {
        workflow: name,
        previousVersion: this.registrations.get(name)?.version,
        newVersion: registration.version,
      });

      // Remove from indexes
      this.removeFromIndexes(name);
    }

    // Store workflow and registration
    this.workflows.set(name, workflow);
    this.registrations.set(name, registration);

    // Add to indexes
    this.addToIndexes(name, registration);

    // Initialize metrics
    this.metrics.set(name, {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDuration: 0,
      errorRate: 0,
    });

    this.logger?.info('Registered workflow', {
      workflow: name,
      version: registration.version,
      category: registration.category,
      requiresAuth: registration.requiresAuth,
      tags: registration.tags,
      plugin: registration.plugin?.name,
    });
  }

  /**
   * Get a workflow instance by name
   */
  getWorkflow(name: string): WorkflowBase | undefined {
    return this.workflows.get(name);
  }

  /**
   * Get workflow registration by name
   */
  getRegistration(name: string): WorkflowRegistration | undefined {
    return this.registrations.get(name);
  }

  /**
   * Get workflows by category
   */
  getWorkflowsByCategory(category: PluginCategory): WorkflowBase[] {
    const workflowNames = this.categories.get(category) || [];
    return workflowNames
      .map((name) => this.workflows.get(name))
      .filter((workflow): workflow is WorkflowBase => workflow !== undefined);
  }

  /**
   * Get workflows by tag
   */
  getWorkflowsByTag(tag: string): WorkflowBase[] {
    const workflowNames = this.tags.get(tag) || [];
    return workflowNames
      .map((name) => this.workflows.get(name))
      .filter((workflow): workflow is WorkflowBase => workflow !== undefined);
  }

  /**
   * Search workflows by query string
   */
  searchWorkflows(query: string): WorkflowBase[] {
    const lowercaseQuery = query.toLowerCase();
    const results: WorkflowBase[] = [];

    for (const [name, registration] of this.registrations) {
      const workflow = this.workflows.get(name);
      if (!workflow) continue;

      // Search in name, display name, description, and tags
      const searchableText = [
        registration.name,
        registration.displayName,
        registration.description,
        ...(registration.tags || []),
      ].join(' ').toLowerCase();

      if (searchableText.includes(lowercaseQuery)) {
        results.push(workflow);
      }
    }

    return results;
  }

  /**
   * Get all registered workflow names
   */
  getWorkflowNames(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Get all workflow registrations
   */
  getAllRegistrations(): WorkflowRegistration[] {
    return Array.from(this.registrations.values());
  }

  /**
   * Get all workflow registrations (alias for compatibility)
   */
  list(): WorkflowRegistration[] {
    return this.getAllRegistrations();
  }

  /**
   * Get workflow by name (alias for getWorkflow)
   */
  get(name: string): WorkflowBase | undefined {
    return this.getWorkflow(name);
  }

  /**
   * Check if a workflow exists
   */
  hasWorkflow(name: string): boolean {
    return this.workflows.has(name);
  }

  /**
   * Unregister a workflow
   */
  unregister(name: string): boolean {
    const hasWorkflow = this.workflows.has(name);

    if (hasWorkflow) {
      // Remove from indexes
      this.removeFromIndexes(name);

      // Remove from maps
      this.workflows.delete(name);
      this.registrations.delete(name);
      this.metrics.delete(name);

      this.logger?.info('Unregistered workflow', { workflow: name });
    }

    return hasWorkflow;
  }

  /**
   * Clear all registered workflows
   */
  clear(): void {
    const workflowCount = this.workflows.size;

    // Clear all maps
    this.workflows.clear();
    this.registrations.clear();
    this.metrics.clear();

    // Reinitialize category indexes
    this.initializeCategories();
    this.tags.clear();

    this.logger?.info('Cleared registry', {
      workflows: workflowCount,
    });
  }

  /**
   * Update workflow metrics
   */
  updateMetrics(workflowName: string, success: boolean, duration: number): void {
    const metrics = this.metrics.get(workflowName);
    if (!metrics) return;

    metrics.totalExecutions++;
    metrics.lastExecuted = new Date();

    if (success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    // Update average duration (moving average)
    const totalDuration = (metrics.averageDuration * (metrics.totalExecutions - 1)) + duration;
    metrics.averageDuration = totalDuration / metrics.totalExecutions;

    // Update error rate
    metrics.errorRate = metrics.failedExecutions / metrics.totalExecutions;

    this.metrics.set(workflowName, metrics);
  }

  /**
   * Get workflow metrics
   */
  getMetrics(workflowName: string): WorkflowMetrics | undefined {
    return this.metrics.get(workflowName);
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalWorkflows: number;
    categories: Record<string, number>;
    authRequired: number;
    averageEstimatedDuration?: number;
  } {
    const registrations = this.getAllRegistrations();
    const categories: Record<string, number> = {};
    let totalDuration = 0;
    let durationsCount = 0;
    let authRequired = 0;

    for (const reg of registrations) {
      // Count by category
      categories[reg.category] = (categories[reg.category] || 0) + 1;

      // Count auth requirements
      if (reg.requiresAuth) {
        authRequired++;
      }

      // Calculate average duration
      if (reg.estimatedDuration) {
        totalDuration += reg.estimatedDuration;
        durationsCount++;
      }
    }

    const result = {
      totalWorkflows: registrations.length,
      categories,
      authRequired,
    } as {
      totalWorkflows: number;
      categories: Record<string, number>;
      authRequired: number;
      averageEstimatedDuration?: number;
    };

    if (durationsCount > 0) {
      result.averageEstimatedDuration = totalDuration / durationsCount;
    }

    return result;
  }

  /**
   * Add workflow to category and tag indexes
   */
  private addToIndexes(name: string, registration: WorkflowRegistration): void {
    // Add to category index
    const categoryWorkflows = this.categories.get(registration.category) || [];
    categoryWorkflows.push(name);
    this.categories.set(registration.category, categoryWorkflows);

    // Add to tag indexes
    if (registration.tags) {
      for (const tag of registration.tags) {
        const tagWorkflows = this.tags.get(tag) || [];
        tagWorkflows.push(name);
        this.tags.set(tag, tagWorkflows);
      }
    }
  }

  /**
   * Remove workflow from category and tag indexes
   */
  private removeFromIndexes(name: string): void {
    const registration = this.registrations.get(name);
    if (!registration) return;

    // Remove from category index
    const categoryWorkflows = this.categories.get(registration.category) || [];
    const categoryIndex = categoryWorkflows.indexOf(name);
    if (categoryIndex > -1) {
      categoryWorkflows.splice(categoryIndex, 1);
      this.categories.set(registration.category, categoryWorkflows);
    }

    // Remove from tag indexes
    if (registration.tags) {
      for (const tag of registration.tags) {
        const tagWorkflows = this.tags.get(tag) || [];
        const tagIndex = tagWorkflows.indexOf(name);
        if (tagIndex > -1) {
          tagWorkflows.splice(tagIndex, 1);
          this.tags.set(tag, tagWorkflows);
        }
      }
    }
  }

  /**
   * Validate workflow registration and instance methods
   */
  private validateRegistration(
    registration: WorkflowRegistration,
    workflow: WorkflowBase,
  ): string[] {
    const errors: string[] = [];

    // Validate registration data
    if (!registration.name) {
      errors.push('Workflow name is required');
    }

    if (!registration.displayName) {
      errors.push('Workflow display name is required');
    }

    if (!registration.description) {
      errors.push('Workflow description is required');
    }

    if (!registration.version) {
      errors.push('Workflow version is required');
    }

    // Use configurable valid categories
    if (!this.validCategories.has(registration.category)) {
      const availableCategories = Array.from(this.validCategories).sort().join(', ');
      errors.push(
        `Invalid workflow category: ${registration.category}. Available categories: ${availableCategories}`,
      );
    }

    if (typeof registration.requiresAuth !== 'boolean') {
      errors.push('requiresAuth must be a boolean');
    }

    // Validate required workflow methods
    const requiredMethods = ['getRegistration', 'getOverview', 'executeWithValidation'];

    for (const method of requiredMethods) {
      if (typeof workflow[method as keyof WorkflowBase] !== 'function') {
        errors.push(`Workflow '${registration.name}' is missing required method: ${method}`);
      }
    }

    return errors;
  }

  /**
   * Add a valid category at runtime
   */
  addValidCategory(category: string): void {
    if (!this.config.allowDynamicCategories) {
      throw new Error(
        'Dynamic category registration is disabled. Set allowDynamicCategories: true in config.',
      );
    }

    if (this.validCategories.has(category)) {
      this.logger?.warn('Category already exists', { category });
      return;
    }

    this.validCategories.add(category);
    this.categories.set(category as PluginCategory, []);

    this.logger?.info('Added valid category', { category });
  }

  /**
   * Remove a valid category at runtime
   */
  removeValidCategory(category: string): boolean {
    if (!this.config.allowDynamicCategories) {
      throw new Error(
        'Dynamic category registration is disabled. Set allowDynamicCategories: true in config.',
      );
    }

    // Check if any workflows are using this category
    const workflowsInCategory = this.categories.get(category as PluginCategory) || [];
    if (workflowsInCategory.length > 0) {
      throw new Error(
        `Cannot remove category '${category}': ${workflowsInCategory.length} workflows are still using it`,
      );
    }

    const removed = this.validCategories.delete(category);
    if (removed) {
      this.categories.delete(category as PluginCategory);
      this.logger?.info('Removed valid category', { category });
    }

    return removed;
  }

  /**
   * Get all valid categories
   */
  getValidCategories(): string[] {
    return Array.from(this.validCategories).sort();
  }

  /**
   * Check if a category is valid
   */
  isValidCategory(category: string): boolean {
    return this.validCategories.has(category);
  }

  /**
   * Get registry configuration
   */
  getConfig(): Readonly<WorkflowRegistryConfig> {
    return { ...this.config };
  }

  /**
   * Build formatted workflow overviews for tool descriptions
   * Used by workflow tools to generate dynamic descriptions
   */
  buildWorkflowOverviews(): string {
    const workflows = this.getAllRegistrations();

    if (workflows.length === 0) {
      return 'No workflows available';
    }

    return workflows.map((w, index) => {
      const workflow = this.getWorkflow(w.name);
      const overview = workflow?.getOverview() || w.displayName;
      const tags = w.tags ? `\n  Tags: [${w.tags.join(', ')}]` : '';
      const category = w.category ? `\n  Category: ${w.category}` : '';
      const version = w.version ? `\n  Version: ${w.version}` : '';
      const estimatedDuration = w.estimatedDuration
        ? `\n  Estimated Workflow Duration: ${w.estimatedDuration} seconds`
        : '';

      return `${
        index + 1
      }. **${w.name}**: ${overview}${category}${tags}${estimatedDuration}${version}`;
    }).join('\n\n');
  }

  /**
   * Get workflow tool data for tool registration
   * Provides structured data needed by workflow tools
   */
  getWorkflowToolData(): {
    names: string[];
    overviews: string;
    count: number;
    hasWorkflows: boolean;
    registrations: WorkflowRegistration[];
  } {
    const workflows = this.getAllRegistrations();
    return {
      names: workflows.map((w) => w.name),
      overviews: this.buildWorkflowOverviews(),
      count: workflows.length,
      hasWorkflows: workflows.length > 0,
      registrations: workflows,
    };
  }

  /**
   * Update registry configuration (limited to some settings)
   */
  updateConfig(updates: Partial<Pick<WorkflowRegistryConfig, 'allowDynamicCategories'>>): void {
    this.config = { ...this.config, ...updates };
    this.logger?.info('Updated registry configuration', { updates });
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static reset(): void {
    WorkflowRegistry.resetInstance();
  }
}
