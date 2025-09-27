/**
 * Tests for enhanced WorkflowRegistry class
 */

import { assertEquals, assertExists, assert, assertThrows } from "@std/assert"
import { z } from "zod"

import { WorkflowRegistry } from "../../../src/lib/workflows/WorkflowRegistry.ts"
import { WorkflowBase } from "../../../src/lib/workflows/WorkflowBase.ts"
import type {
  WorkflowContext,
  WorkflowRegistration,
  WorkflowResult,
} from "../../../src/lib/types/WorkflowTypes.ts"
import type {
  AppPlugin,
} from "../../../src/lib/types/PluginTypes.ts"
import { Logger } from "../../../src/lib/utils/Logger.ts"

// Test workflows for registry testing
class TestWorkflowA extends WorkflowBase {
  readonly name = 'test_workflow_a'
  readonly version = '1.0.0'
  readonly description = 'First test workflow'
  readonly category = 'utility' as const
  override readonly tags = ['test', 'alpha']
  override readonly requiresAuth = true
  
  readonly parameterSchema = z.object({
    userId: z.string(),
  })
  
  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'Test Workflow A',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      tags: this.tags,
    }
  }
  
  getOverview(): string {
    return 'First test workflow for registry testing'
  }
  
  protected async executeWorkflow(): Promise<WorkflowResult> {
    return {
      success: true,
      completed_steps: [],
      failed_steps: [],
      metadata: {},
    }
  }
}

class TestWorkflowB extends WorkflowBase {
  readonly name = 'test_workflow_b'
  readonly version = '2.0.0'
  readonly description = 'Second test workflow'
  readonly category = 'automation' as const
  override readonly tags = ['test', 'beta']
  override readonly requiresAuth = false
  override readonly estimatedDuration = 60
  
  readonly parameterSchema = z.object({
    userId: z.string(),
    data: z.object({}),
  })
  
  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'Test Workflow B',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration,
      tags: this.tags,
    }
  }
  
  getOverview(): string {
    return 'Second test workflow for registry testing'
  }
  
  protected async executeWorkflow(): Promise<WorkflowResult> {
    return {
      success: true,
      completed_steps: [],
      failed_steps: [],
      metadata: {},
    }
  }
}

// Invalid workflow for testing validation
class InvalidWorkflow extends WorkflowBase {
  readonly name = '' // Invalid: empty name
  readonly version = '1.0.0'
  readonly description = 'Invalid workflow'
  readonly category = 'utility' as const
  override readonly tags = ['test', 'invalid']
  override readonly requiresAuth = true
  
  readonly parameterSchema = z.object({})
  
  getRegistration(): WorkflowRegistration {
    return {
      name: this.name, // Empty name should cause validation error
      displayName: '', // Empty display name should cause validation error
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
    }
  }
  
  getOverview(): string {
    return 'Invalid workflow for testing'
  }
  
  protected async executeWorkflow(): Promise<WorkflowResult> {
    return { success: true, completed_steps: [], failed_steps: [], metadata: {} }
  }
}

// Test plugin
const createTestPlugin = (): AppPlugin => ({
  name: 'test_plugin',
  version: '1.0.0',
  description: 'Test plugin for registry testing',
  author: 'Test Author',
  workflows: [new TestWorkflowA(), new TestWorkflowB()],
  tags: ['test', 'plugin'],
})

Deno.test("WorkflowRegistry - singleton instance", () => {
  const registry1 = WorkflowRegistry.getInstance()
  const registry2 = WorkflowRegistry.getInstance()
  
  assertEquals(registry1, registry2) // Same instance
})

Deno.test("WorkflowRegistry - workflow registration", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear() // Start fresh
  
  const workflow = new TestWorkflowA()
  
  // Register workflow
  registry.registerWorkflow(workflow)
  
  // Check registration
  assertEquals(registry.hasWorkflow('test_workflow_a'), true)
  assertEquals(registry.getWorkflowNames().length, 1)
  assertEquals(registry.getWorkflowNames()[0], 'test_workflow_a')
  
  // Get workflow back
  const retrieved = registry.getWorkflow('test_workflow_a')
  assertExists(retrieved)
  assertEquals(retrieved.name, 'test_workflow_a')
  
  // Get registration
  const registration = registry.getRegistration('test_workflow_a')
  assertExists(registration)
  assertEquals(registration.name, 'test_workflow_a')
  assertEquals(registration.version, '1.0.0')
  assertEquals(registration.category, 'utility')
})

Deno.test("WorkflowRegistry - invalid workflow registration", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const invalidWorkflow = new InvalidWorkflow()
  
  // Should throw error for invalid registration
  assertThrows(
    () => registry.register(invalidWorkflow),
    Error,
    'Workflow registration has errors'
  )
  
  // Should not be registered
  assertEquals(registry.hasWorkflow(''), false)
  assertEquals(registry.getWorkflowNames().length, 0)
})

Deno.test("WorkflowRegistry - workflow overwriting", () => {
  const logger = new Logger({ level: 'debug', format: 'text' })
  const registry = WorkflowRegistry.getInstance({ logger })
  registry.clear()
  
  const workflow1 = new TestWorkflowA()
  const workflow2 = new TestWorkflowA() // Same name, should overwrite
  
  // Register first workflow
  registry.register(workflow1)
  assertEquals(registry.getWorkflowNames().length, 1)
  
  // Register second workflow with same name (should overwrite)
  registry.register(workflow2)
  assertEquals(registry.getWorkflowNames().length, 1) // Still only 1
  
  // Should be the second workflow
  const retrieved = registry.getWorkflow('test_workflow_a')
  assertEquals(retrieved, workflow2)
})

Deno.test("WorkflowRegistry - category-based retrieval", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflowA = new TestWorkflowA() // category: 'utility'
  const workflowB = new TestWorkflowB() // category: 'automation'
  
  registry.register(workflowA)
  registry.register(workflowB)
  
  // Get workflows by category
  const utilityWorkflows = registry.getWorkflowsByCategory('utility')
  assertEquals(utilityWorkflows.length, 1)
  assertEquals(utilityWorkflows[0]!.name, 'test_workflow_a')
  
  const automationWorkflows = registry.getWorkflowsByCategory('automation')
  assertEquals(automationWorkflows.length, 1)
  assertEquals(automationWorkflows[0]!.name, 'test_workflow_b')
  
  const dataWorkflows = registry.getWorkflowsByCategory('data')
  assertEquals(dataWorkflows.length, 0) // No workflows in this category
})

Deno.test("WorkflowRegistry - tag-based retrieval", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflowA = new TestWorkflowA() // tags: ['test', 'alpha']
  const workflowB = new TestWorkflowB() // tags: ['test', 'beta']
  
  registry.register(workflowA)
  registry.register(workflowB)
  
  // Get workflows by tag
  const testWorkflows = registry.getWorkflowsByTag('test')
  assertEquals(testWorkflows.length, 2) // Both have 'test' tag
  
  const alphaWorkflows = registry.getWorkflowsByTag('alpha')
  assertEquals(alphaWorkflows.length, 1)
  assertEquals(alphaWorkflows[0]!.name, 'test_workflow_a')
  
  const betaWorkflows = registry.getWorkflowsByTag('beta')
  assertEquals(betaWorkflows.length, 1)
  assertEquals(betaWorkflows[0]!.name, 'test_workflow_b')
  
  const nonExistentWorkflows = registry.getWorkflowsByTag('nonexistent')
  assertEquals(nonExistentWorkflows.length, 0)
})

Deno.test("WorkflowRegistry - search workflows", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflowA = new TestWorkflowA() // name: 'test_workflow_a', description: 'First test workflow'
  const workflowB = new TestWorkflowB() // name: 'test_workflow_b', description: 'Second test workflow'
  
  registry.register(workflowA)
  registry.register(workflowB)
  
  // Search by name fragment
  const aResults = registry.searchWorkflows('workflow_a')
  assertEquals(aResults.length, 1)
  assertEquals(aResults[0]!.name, 'test_workflow_a')
  
  // Search by description
  const firstResults = registry.searchWorkflows('first')
  assertEquals(firstResults.length, 1)
  assertEquals(firstResults[0]!.name, 'test_workflow_a')
  
  // Search by tag
  const alphaResults = registry.searchWorkflows('alpha')
  assertEquals(alphaResults.length, 1)
  assertEquals(alphaResults[0]!.name, 'test_workflow_a')
  
  // Search for common term
  const testResults = registry.searchWorkflows('test')
  assertEquals(testResults.length, 2) // Both contain 'test'
  
  // Case insensitive search
  const caseResults = registry.searchWorkflows('FIRST')
  assertEquals(caseResults.length, 1)
})

// Plugin registration test removed - plugins are now managed by PluginManager

// Plugin unregistration test removed - plugins are now managed by PluginManager

Deno.test("WorkflowRegistry - workflow unregistration", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflow = new TestWorkflowA()
  
  // Register workflow
  registry.register(workflow)
  assertEquals(registry.hasWorkflow('test_workflow_a'), true)
  
  // Unregister workflow
  const success = registry.unregister('test_workflow_a')
  assertEquals(success, true)
  
  // Check removal
  assertEquals(registry.hasWorkflow('test_workflow_a'), false)
  assertEquals(registry.getWorkflowNames().length, 0)
  
  // Try to unregister non-existent workflow
  const failSuccess = registry.unregister('nonexistent')
  assertEquals(failSuccess, false)
})

Deno.test("WorkflowRegistry - clear registry", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflowA = new TestWorkflowA()
  const workflowB = new TestWorkflowB()
  const plugin = createTestPlugin()
  
  // Register workflows
  registry.registerWorkflow(workflowA)
  registry.registerWorkflow(workflowB)
  
  // Should have workflows
  assert(registry.getWorkflowNames().length > 0)
  
  // Clear registry
  registry.clear()
  
  // Should be empty
  assertEquals(registry.getWorkflowNames().length, 0)
  assertEquals(registry.getAllRegistrations().length, 0)
})

Deno.test("WorkflowRegistry - metrics tracking", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflow = new TestWorkflowA()
  registry.register(workflow)
  
  // Initial metrics should be zero
  const initialMetrics = registry.getMetrics('test_workflow_a')
  assertExists(initialMetrics)
  assertEquals(initialMetrics.totalExecutions, 0)
  assertEquals(initialMetrics.successfulExecutions, 0)
  assertEquals(initialMetrics.failedExecutions, 0)
  
  // Update metrics
  registry.updateMetrics('test_workflow_a', true, 100) // Success, 100ms
  registry.updateMetrics('test_workflow_a', false, 200) // Failure, 200ms
  registry.updateMetrics('test_workflow_a', true, 150) // Success, 150ms
  
  const updatedMetrics = registry.getMetrics('test_workflow_a')
  assertExists(updatedMetrics)
  assertEquals(updatedMetrics.totalExecutions, 3)
  assertEquals(updatedMetrics.successfulExecutions, 2)
  assertEquals(updatedMetrics.failedExecutions, 1)
  assertEquals(updatedMetrics.averageDuration, 150) // (100 + 200 + 150) / 3
  assertEquals(updatedMetrics.errorRate, 1/3) // 1 failure out of 3 total
  assertExists(updatedMetrics.lastExecuted)
})

Deno.test("WorkflowRegistry - statistics", () => {
  const registry = WorkflowRegistry.getInstance()
  registry.clear()
  
  const workflowA = new TestWorkflowA() // requiresAuth: true
  const workflowB = new TestWorkflowB() // requiresAuth: false, estimatedDuration: 60
  
  registry.register(workflowA)
  registry.register(workflowB)
  
  const stats = registry.getStats()
  
  assertEquals(stats.totalWorkflows, 2)
  assertEquals(stats.authRequired, 1) // Only workflowA requires auth
  assertEquals(stats.averageEstimatedDuration, 60) // Only workflowB has duration
  assertEquals(stats.categories.utility, 1)
  assertEquals(stats.categories.automation, 1)
})

// Plugin validation test removed - plugins are now managed by PluginManager