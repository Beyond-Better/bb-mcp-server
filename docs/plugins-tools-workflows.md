# Plugins, Tools, and Workflows Guide

This guide explains the bb-mcp-server plugin architecture and the differences between tools, workflows, and plugins. Understanding these concepts is essential for building maintainable and scalable MCP servers.

## 🏗️ **Architecture Overview (Updated)**

**Important**: The plugin system has been refactored for cleaner separation of concerns:

### **Core Registries (Single Responsibility)**
- **`ToolRegistry`**: Manages individual tools via `registerTool()`
- **`WorkflowRegistry`**: Manages individual workflows via `registerWorkflow()`
- **No plugin methods**: Registries focus only on individual item management

### **Plugin Management (Orchestration)**
- **`PluginManager`**: Handles plugin loading, discovery, and orchestration
- **Unpacks plugins**: Calls registry methods for each tool/workflow in the plugin
- **Tracks relationships**: Maintains which items came from which plugins for cleanup

### **Two Registration Paths**
```typescript
// Path 1: Direct Registration (Manual)
toolRegistry.registerTool('my_tool', definition, handler)
workflowRegistry.registerWorkflow(new MyWorkflow())

// Path 2: Plugin Registration (Dynamic Loading)
pluginManager.registerPlugin(plugin)
// ↳ Internally calls toolRegistry.registerTool() and workflowRegistry.registerWorkflow()
```

**Key Benefits**:
- ✅ **Consistent behavior**: Both paths use same core registration logic
- ✅ **Clean separation**: Registries don't know about plugins
- ✅ **Flexible**: Use manual registration OR plugin discovery as needed
- ✅ **Maintainable**: Single source of truth for tool/workflow management

## Table of Contents

- [Quick Reference](#quick-reference)
- [Tools vs Workflows](#tools-vs-workflows)
- [Plugin Architecture](#plugin-architecture)
- [Creating Simple Tools](#creating-simple-tools)
- [Creating Workflows](#creating-workflows)
- [Creating Plugins](#creating-plugins)
- [Plugin Discovery](#plugin-discovery)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Quick Reference

| Component | Purpose | When to Use | Complexity |
|-----------|---------|-------------|-----------|
| **Simple Tools** | Direct API operations | Single API calls, data queries, simple operations | Low |
| **Workflows** | Multi-step business processes | Complex operations, state management, error handling | Medium |
| **Plugins** | Bundled functionality | Distributable packages, multiple workflows/tools | High |

## Tools vs Workflows

### Simple Tools

**Definition**: Direct, single-purpose functions that perform specific operations.

**Characteristics**:
- ✅ Single responsibility
- ✅ Direct API integration
- ✅ Minimal state management
- ✅ Fast execution
- ✅ Simple error handling

**Example Use Cases**:
- Query customer by ID
- Get order status
- Send notification
- Validate data format
- Execute simple API call

**Implementation Pattern**:
```typescript
// Simple tool example
registry.registerTool('get_customer', {
  title: 'Get Customer',
  description: 'Retrieve customer information by ID',
  inputSchema: {
    customerId: z.string().describe('Customer ID')
  }
}, async (args) => {
  const customer = await apiClient.getCustomer(args.customerId)
  return { content: [{ type: 'text', text: JSON.stringify(customer) }] }
})
```

### Workflows

**Definition**: Multi-step, stateful processes that orchestrate complex business operations.

**Characteristics**:
- ✅ Multiple execution steps
- ✅ State management
- ✅ Error recovery and rollback
- ✅ Audit logging
- ✅ Complex validation
- ✅ Business logic orchestration

**Example Use Cases**:
- Process customer order (create customer → validate payment → create order → send confirmation)
- Data migration (extract → validate → transform → load)
- Complex analysis workflows
- Multi-system integrations
- Business process automation

**Implementation Pattern**:
```typescript
// Workflow example
export class ProcessOrderWorkflow extends WorkflowBase {
  readonly name = 'process_order'
  readonly description = 'Complete order processing workflow'
  
  async execute(params: OrderParams): Promise<WorkflowResult> {
    const steps = []
    
    // Step 1: Validate customer
    const customer = await this.validateCustomer(params.customerId)
    steps.push({ step: 'validate_customer', success: true })
    
    // Step 2: Process payment
    const payment = await this.processPayment(params.paymentInfo)
    steps.push({ step: 'process_payment', success: true })
    
    // Step 3: Create order
    const order = await this.createOrder(customer, payment)
    steps.push({ step: 'create_order', success: true })
    
    return { success: true, data: order, completed_steps: steps }
  }
}
```

## Plugin Architecture

### What are Plugins?

**Definition**: Bundled collections of tools and workflows that provide cohesive functionality for specific domains or integrations.

**Benefits**:
- 🎯 **Organization**: Group related functionality
- 🔄 **Reusability**: Share across projects
- 📦 **Distribution**: Package and distribute functionality
- 🔍 **Discovery**: Automatic loading and registration
- 🏗️ **Architecture**: Clean separation of concerns

### Plugin Structure

```
your-plugin/
├── plugin.json          # Plugin manifest
├── main.ts            # Main plugin export
├── workflows/          # Workflow implementations
│   ├── QueryWorkflow.ts
│   └── OperationWorkflow.ts
├── tools/             # Tool implementations
│   └── UtilityTools.ts
├── types/             # Type definitions
│   └── plugin.types.ts
└── README.md          # Plugin documentation
```

### Plugin Manifest (plugin.json)

```json
{
  "name": "my-business-plugin",
  "version": "1.0.0",
  "description": "Business workflows and tools for MyCompany",
  "main": "main.ts",
  "author": "MyCompany Team",
  "license": "MIT",
  "mcpServer": {
    "minVersion": "1.0.0",
    "maxVersion": "2.0.0"
  },
  "workflows": [
    {
      "name": "my_query_workflow",
      "description": "Query business data",
      "category": "query"
    },
    {
      "name": "my_operation_workflow",
      "description": "Execute business operations",
      "category": "operation"
    }
  ],
  "tools": [
    "get_business_data",
    "create_business_record",
    "update_business_record"
  ],
  "tags": ["business", "mycompany", "integration"]
}
```

## Creating Simple Tools

### Basic Tool Implementation

```typescript
// tools/MyTools.ts
import { ToolRegistry, z } from '@beyondbetter/bb-mcp-server'

export class MyTools {
  constructor(private apiClient: MyApiClient, private logger: Logger) {}
  
  registerWith(toolRegistry: ToolRegistry): void {
    this.registerGetDataTool(toolRegistry)
    this.registerCreateRecordTool(toolRegistry)
  }
  
  private registerGetDataTool(registry: ToolRegistry): void {
    registry.registerTool('get_my_data', {
      title: 'Get My Data',
      description: 'Retrieve data from MyAPI',
      category: 'MyCompany',
      inputSchema: {
        query: z.string().describe('Search query'),
        limit: z.number().optional().default(10).describe('Results limit')
      }
    }, async (args) => {
      try {
        const data = await this.apiClient.getData(args.query, args.limit)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text', 
            text: `Error: ${error.message}`
          }],
          isError: true
        }
      }
    })
  }
}
```

### Tool Registration Pattern

**Important**: Tools are registered with `ToolRegistry` using `registerTool()`, not via plugins:

```typescript
// Direct tool registration (recommended)
toolRegistry.registerTool('get_my_data', definition, handler)

// Plugin-based tool registration (managed by PluginManager)
pluginManager.registerPlugin(plugin) // → calls toolRegistry.registerTool() internally
```

### Tool Best Practices

1. **Single Responsibility**: Each tool should do one thing well
2. **Clear Naming**: Use descriptive, action-oriented names
3. **Input Validation**: Use Zod schemas for type safety
4. **Error Handling**: Provide clear error messages
5. **Documentation**: Include helpful descriptions and examples
6. **Logging**: Log important operations for debugging

## Creating Workflows

### Workflow Implementation

```typescript
// workflows/MyWorkflow.ts
import { WorkflowBase } from '@beyondbetter/bb-mcp-server'
import { z } from 'zod'

export class MyBusinessWorkflow extends WorkflowBase {
  readonly name = 'my_business_workflow'
  readonly version = '1.0.0'
  readonly description = 'Execute complex business process'
  readonly category = 'operation' as const
  
  readonly parameterSchema = z.object({
    userId: z.string().describe('User ID for authentication'),
    businessData: z.object({
      type: z.enum(['create', 'update', 'delete']),
      payload: z.record(z.unknown())
    }).describe('Business operation data'),
    options: z.object({
      validateOnly: z.boolean().default(false),
      notifyUsers: z.boolean().default(true)
    }).optional()
  })
  
  constructor(
    private apiClient: MyApiClient,
    private logger: Logger
  ) {
    super()
  }
  
  async execute(params: z.infer<typeof this.parameterSchema>): Promise<WorkflowResult> {
    const startTime = performance.now()
    const steps = []
    const failedSteps = []
    
    try {
      // Step 1: Validate business data
      this.logger.info('Validating business data', { userId: params.userId })
      const validation = await this.validateBusinessData(params.businessData)
      steps.push({
        operation: 'validate_data',
        success: true,
        duration_ms: performance.now() - startTime,
        timestamp: new Date().toISOString()
      })
      
      if (params.options?.validateOnly) {
        return {
          success: true,
          data: { validation, mode: 'validate-only' },
          completed_steps: steps,
          failed_steps: [],
          metadata: { executionTime: performance.now() - startTime }
        }
      }
      
      // Step 2: Execute business operation
      this.logger.info('Executing business operation', {
        type: params.businessData.type,
        userId: params.userId
      })
      
      const result = await this.executeBusinessOperation(
        params.businessData,
        params.userId
      )
      
      steps.push({
        operation: 'execute_operation',
        success: true,
        data: { operationType: params.businessData.type },
        duration_ms: performance.now() - startTime,
        timestamp: new Date().toISOString()
      })
      
      // Step 3: Send notifications (if enabled)
      if (params.options?.notifyUsers) {
        await this.sendNotifications(result, params.userId)
        steps.push({
          operation: 'send_notifications',
          success: true,
          duration_ms: performance.now() - startTime,
          timestamp: new Date().toISOString()
        })
      }
      
      return {
        success: true,
        data: result,
        completed_steps: steps,
        failed_steps: [],
        metadata: {
          executionTime: performance.now() - startTime,
          operationType: params.businessData.type
        }
      }
      
    } catch (error) {
      const failedStep = {
        operation: 'workflow_execution',
        error_type: 'system_error' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
      failedSteps.push(failedStep)
      
      return {
        success: false,
        error: {
          type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Workflow failed',
          details: error instanceof Error ? error.stack : undefined,
          code: 'WORKFLOW_ERROR',
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true
        },
        completed_steps: steps,
        failed_steps: failedSteps,
        metadata: { executionTime: performance.now() - startTime }
      }
    }
  }
  
  private async validateBusinessData(data: any): Promise<any> {
    // Business validation logic
    return { valid: true, issues: [] }
  }
  
  private async executeBusinessOperation(data: any, userId: string): Promise<any> {
    // Business operation logic
    return await this.apiClient.executeOperation(data, userId)
  }
  
  private async sendNotifications(result: any, userId: string): Promise<void> {
    // Notification logic
    this.logger.info('Notifications sent', { userId, resultId: result.id })
  }
}
```

### Workflow Best Practices

1. **Step Tracking**: Record all execution steps for audit trails
2. **Error Recovery**: Implement rollback mechanisms where appropriate
3. **State Management**: Handle complex state transitions properly
4. **Validation**: Validate inputs at multiple stages
5. **Logging**: Comprehensive logging for troubleshooting
6. **Testing**: Unit test individual workflow methods
7. **Documentation**: Document workflow purpose and step details

## Creating Plugins

### Complete Plugin Implementation

```typescript
// main.ts - Main plugin export
import type { AppPlugin } from '@beyondbetter/bb-mcp-server'
import { MyBusinessWorkflow } from './workflows/MyWorkflow.ts'
import { MyTools } from './tools/MyTools.ts'

// Plugin dependencies interface
export interface MyPluginDependencies {
  apiClient: MyApiClient
  logger: Logger
}

// Plugin factory function
export function createMyPlugin(dependencies: MyPluginDependencies): AppPlugin {
  const { apiClient, logger } = dependencies
  
  // Create workflow instances
  const workflows = [
    new MyBusinessWorkflow(apiClient, logger)
  ]
  
  return {
    name: 'my-business-plugin',
    version: '1.0.0',
    description: 'Business workflows and tools for MyCompany',
    author: 'MyCompany Team',
    license: 'MIT',
    workflows,
    dependencies: ['@beyondbetter/bb-mcp-server'],
    tags: ['business', 'mycompany'],
    
    // ✅ CORRECT signature for initialize method (when needed):
    async initialize(
      dependencies: AppServerDependencies,
      toolRegistry: ToolRegistry,
      workflowRegistry: WorkflowRegistry
    ): Promise<void> {
      // PluginManager calls: plugin.initialize(pluginDependencies, toolRegistry, workflowRegistry)
      logger.info('MyBusiness plugin initialized')
    },
    
    async cleanup(): Promise<void> {
      logger.info('MyBusiness plugin cleaned up')
    }
  }
}

// Default export for plugin discovery
const plugin: AppPlugin = {
  name: 'my-business-plugin',
  version: '1.0.0',
  description: 'Business workflows and tools for MyCompany',
  workflows: [], // Populated by factory function
  
  // ✅ CORRECT signature for initialize method (when needed):
  async initialize(
    dependencies: AppServerDependencies,
    toolRegistry: ToolRegistry,
    workflowRegistry: WorkflowRegistry
  ): Promise<void> {
    // PluginManager calls: plugin.initialize(pluginDependencies, toolRegistry, workflowRegistry)
    console.log('Plugin discovered and initialized')
  }
}

export default plugin
```

## Plugin Discovery

### How Plugin Discovery Works

1. **Configuration**: Set discovery paths in environment variables
2. **Scanning**: PluginManager scans configured directories
3. **Manifest Detection**: Looks for `plugin.json` files
4. **Loading**: Dynamically imports plugin modules
5. **Registration**: Registers workflows and tools automatically

### Discovery Configuration

```bash
# .env configuration
PLUGINS_DISCOVERY_PATHS=./src/workflows,./src/plugins,./plugins
PLUGINS_AUTOLOAD=true
PLUGINS_WATCH_CHANGES=false
PLUGINS_ALLOWED_LIST=my-plugin,another-plugin
PLUGINS_BLOCKED_LIST=disabled-plugin
```

### Discovery Process

```typescript
// Plugin discovery in action
const configManager = new ConfigManager()
const pluginConfig = configManager.loadPluginsConfig()
const pluginManager = new PluginManager(registry, pluginConfig, logger)

// Discover and load plugins
if (pluginConfig.autoload) {
  const discoveredPlugins = await pluginManager.discoverPlugins()
  logger.info('Plugins discovered', { count: discoveredPlugins.length })
}
```

## Configuration

### Environment Variables

| Variable | Purpose | Default | Example |
|----------|---------|---------|----------|
| `PLUGINS_DISCOVERY_PATHS` | Directories to scan | `./plugins` | `./src/workflows,./plugins` |
| `PLUGINS_AUTOLOAD` | Auto-load discovered plugins | `true` | `true` |
| `PLUGINS_WATCH_CHANGES` | Watch for file changes | `false` | `true` (dev only) |
| `PLUGINS_ALLOWED_LIST` | Whitelist of allowed plugins | (all) | `plugin1,plugin2` |
| `PLUGINS_BLOCKED_LIST` | Blacklist of blocked plugins | (none) | `old-plugin,test-plugin` |

### Discovery Path Patterns

- **Workflow Directories**: `./src/workflows` - Looks for `plugin.ts` files
- **Plugin Directories**: `./src/plugins` - Looks for `plugin.json` + main file
- **External Plugins**: `./plugins` - Third-party plugin packages
- **Node Modules**: `./node_modules/@company/*` - NPM-installed plugins

## Best Practices

### When to Use Each Approach

#### Use Simple Tools When:
- ✅ Operation is single-step
- ✅ No complex state management needed
- ✅ Direct API mapping
- ✅ Fast response required
- ✅ Minimal business logic

#### Use Workflows When:
- ✅ Multi-step processes
- ✅ Business logic orchestration
- ✅ Error recovery needed
- ✅ Audit trail required
- ✅ Complex validation
- ✅ State management needed

#### Use Plugins When:
- ✅ Bundling related functionality
- ✅ Distributing to multiple projects
- ✅ Organizing large codebases
- ✅ Version management needed
- ✅ Dependency management required

### Development Guidelines

1. **Start Simple**: Begin with tools, evolve to workflows as complexity grows
2. **Clear Boundaries**: Separate infrastructure from business logic
3. **Type Safety**: Use TypeScript and Zod for all interfaces
4. **Error Handling**: Implement comprehensive error handling
5. **Testing**: Write tests for all components
6. **Documentation**: Document all public interfaces
7. **Versioning**: Use semantic versioning for plugins
8. **Dependencies**: Minimize external dependencies

### Performance Considerations

- **Tools**: Optimized for speed, minimal overhead
- **Workflows**: Accept longer execution times for reliability
- **Plugins**: Consider lazy loading for large plugin collections
- **Caching**: Implement caching for frequently accessed data
- **Batching**: Use batching for bulk operations

## Examples

### Example 1: E-commerce Integration

```typescript
// Simple tools for quick operations
class EcommerceTools {
  registerGetProduct(registry: ToolRegistry) {
    registry.registerTool('get_product', {
      title: 'Get Product',
      description: 'Get product by ID',
      inputSchema: { productId: z.string() }
    }, async (args) => {
      const product = await this.api.getProduct(args.productId)
      return { content: [{ type: 'text', text: JSON.stringify(product) }] }
    })
  }
}

// Workflow for complex order processing
class ProcessOrderWorkflow extends WorkflowBase {
  async execute(params: OrderParams): Promise<WorkflowResult> {
    // 1. Validate customer
    // 2. Check inventory
    // 3. Process payment
    // 4. Create order
    // 5. Send confirmation
    // 6. Update inventory
  }
}
```

### Example 2: CRM Integration

```typescript
// Plugin structure
crm-plugin/
├── plugin.json
├── main.ts
├── workflows/
│   ├── LeadNurturingWorkflow.ts
│   └── SalesProcessWorkflow.ts
├── tools/
│   ├── ContactTools.ts
│   └── OpportunityTools.ts
└── types/
    └── crm.types.ts
```

### Example 3: Development Tools Plugin

```typescript
// Development utilities
class DevTools {
  registerHealthCheck(registry: ToolRegistry) {
    registry.registerTool('health_check', {
      title: 'Health Check',
      description: 'Check system health'
    }, async () => {
      const health = await this.checkSystemHealth()
      return { content: [{ type: 'text', text: JSON.stringify(health) }] }
    })
  }
}

// Complex deployment workflow
class DeploymentWorkflow extends WorkflowBase {
  async execute(params: DeploymentParams): Promise<WorkflowResult> {
    // 1. Run tests
    // 2. Build application
    // 3. Deploy to staging
    // 4. Run integration tests
    // 5. Deploy to production
    // 6. Verify deployment
    // 7. Send notifications
  }
}
```

---

## Getting Started

1. **Choose Your Approach**: Decide between tools, workflows, or plugins based on your needs
2. **Set Up Environment**: Configure plugin discovery paths in your `.env` file
3. **Create Components**: Implement your tools, workflows, or plugins
4. **Test Integration**: Verify everything works with the plugin discovery system
5. **Document Usage**: Create clear documentation for your implementations

For more examples, see the `example/` directory in this repository, which demonstrates all three approaches in a working MCP server implementation.