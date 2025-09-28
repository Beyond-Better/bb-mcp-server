# Simplified Plugin System Guide

## Overview

The plugin system has been redesigned to be more flexible and less error-prone. Here's what you need to know:

### 🏗️ **How Registration Works (Updated)**

**Plugin Registration Flow:**
1. **PluginManager** discovers and loads plugins
2. **PluginManager** unpacks each plugin and calls:
   - `toolRegistry.registerTool()` for each tool in `plugin.tools`
   - `workflowRegistry.registerWorkflow()` for each workflow in `plugin.workflows`
3. **Registries** handle the actual tool/workflow management
4. **PluginManager** tracks which items came from which plugins for cleanup

**Key Points:**
- ✅ **Registries are plugin-agnostic**: They only know about individual tools/workflows
- ✅ **PluginManager orchestrates**: Handles the packaging/organizational concerns
- ✅ **Consistent behavior**: Manual and plugin registration use the same core logic

## 🎯 **Key Simplifications**

### 1. **Smart File Detection**
The system now only looks for actual plugin files, not individual workflow classes:

✅ **Will be loaded as plugins:**
- `plugin.ts` or `plugin.js`
- `*Plugin.ts` (e.g., `ExamplePlugin.ts`)
- `*.plugin.ts` (e.g., `example.plugin.ts`)

❌ **Will NOT be loaded as plugins:**
- `ExampleQueryWorkflow.ts` (individual workflow classes)
- `ExampleOperationWorkflow.ts` (individual workflow classes) 
- `*.test.ts` or `*.spec.ts` (test files)
- Random TypeScript files

### 2. **Flexible Plugin Exports**

Plugins can export in multiple ways:

```typescript
// Option 1: Default export
export default {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My plugin',
  workflows: [/* workflows */]
}

// Option 2: Named export
export const plugin = {
  name: 'my-plugin', 
  // ...
}

// Option 3: Factory function (detected but requires manual use)
export function createMyPlugin(deps) {
  return { /* plugin */ }
}
```

### 3. **Dependency Injection Support**

Plugins can have empty workflows initially:

```typescript
// This is now VALID ✅
export default {
  name: 'my-plugin',
  version: '1.0.0', 
  description: 'Plugin with dependency injection',
  workflows: [], // Empty initially
  
  async initialize(registry) {
    // Having this method allows empty workflows
    console.log('Plugin initialized')
  }
}
```

## 🔧 **Configuration**

### Environment Variables
```bash
# Plugin discovery paths - only scans these locations
PLUGINS_DISCOVERY_PATHS=./src/plugins,./src/workflows

# Auto-load discovered plugins
PLUGINS_AUTOLOAD=true

# Optional: Only load specific plugins
PLUGINS_ALLOWED_LIST=my-plugin,other-plugin

# Optional: Block specific plugins
PLUGINS_BLOCKED_LIST=old-plugin,broken-plugin
```

### Discovery Process
1. **Scan paths** for files matching plugin naming patterns
2. **Import files** using absolute paths (no more import errors!)
3. **Detect exports** - tries default, named, and factory patterns
4. **Validate structure** - flexible validation allowing dependency injection
5. **Register plugins** - only registers valid plugin objects

## 📁 **Recommended Project Structure**

```
my-project/
├── src/
│   ├── plugins/
│   │   ├── MyPlugin.ts           # ✅ Structured plugin
│   │   └── other.plugin.ts       # ✅ Alternative naming
│   ├── workflows/
│   │   ├── plugin.ts             # ✅ Plugin wrapper for workflows
│   │   ├── QueryWorkflow.ts      # ❌ Won't be loaded as plugin
│   │   └── OperationWorkflow.ts  # ❌ Won't be loaded as plugin
│   └── tools/
│       └── MyTools.ts            # ❌ Won't be loaded as plugin
└── plugins/
    └── external-plugin.ts        # ✅ External plugin location
```

## 🚀 **Usage Patterns**

### Pattern 1: Structured Plugin (Recommended)
```typescript
// src/plugins/MyPlugin.ts
import { AppPlugin } from '@beyondbetter/bb-mcp-server'

export default: AppPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My structured plugin',
  workflows: [
    new MyQueryWorkflow({ /* deps */ }),
    new MyOperationWorkflow({ /* deps */ })
  ],
  
  async initialize() {
    console.log('Plugin initialized')
  }
}
```

### Pattern 2: Workflow Wrapper Plugin
```typescript
// src/workflows/plugin.ts
export default {
  name: 'my-workflows',
  version: '1.0.0', 
  description: 'Existing workflows as plugin',
  workflows: [], // Empty - uses dependency injection
  
  async initialize() {
    // Plugin manager allows this pattern
  }
}

export function createWorkflowsPlugin(deps) {
  return {
    name: 'my-workflows',
    workflows: [
      new QueryWorkflow(deps),
      new OperationWorkflow(deps)
    ]
  }
}
```

### Pattern 3: Manual Registration (No Discovery)
```typescript
// Manual approach - bypass plugin discovery entirely
const registry = new WorkflowRegistry()
registry.register(new MyWorkflow())
registry.register(new AnotherWorkflow())
```

## 🛡️ **Error Handling**

The system now provides better error messages:

```bash
# Clear file detection
✅ "Checking plugin file: MyPlugin.ts"
❌ "Skipping non-plugin file: MyWorkflow.ts"

# Export detection  
✅ "Found plugin export: default"
❌ "Plugin exports factory functions but no plugin object"

# Validation messages
✅ "Plugin has empty workflows but has initialize method - OK"
❌ "Plugin must provide at least one workflow or initialize method"
```

## 💡 **Best Practices**

### 1. **Keep It Simple**
- Use clear plugin file names (`*Plugin.ts`, `plugin.ts`)
- Don't try to load individual workflow classes as plugins
- Use dependency injection patterns for flexibility

### 2. **Organize Clearly**
- Put structured plugins in `src/plugins/`
- Use `plugin.ts` files to wrap existing workflows
- Keep individual workflows separate (they won't be auto-loaded)

### 3. **Handle Dependencies**
- Use factory functions for complex dependency injection
- Use `initialize()` method for simple initialization
- Consider manual registration for complex setups

### 4. **Debug Effectively**
- Check logs for file detection: "Checking plugin file: ..."
- Look for validation messages about empty workflows
- Use `PLUGINS_ALLOWED_LIST` to test specific plugins

## 🎯 **Migration Guide**

If you have existing code that's not working:

1. **Individual Workflows Not Loading?**
   ```typescript
   // Create a plugin wrapper:
   // src/workflows/plugin.ts
   export function createWorkflowsPlugin(deps) {
     return {
       name: 'my-workflows',
       workflows: [new ExistingWorkflow(deps)]
     }
   }
   ```

2. **Empty Plugin Validation Errors?**
   ```typescript
   // Add initialize method:
   export default {
     workflows: [],
     async initialize() {} // This allows empty workflows
   }
   ```

3. **Import Path Errors?** 
   ✅ Fixed automatically - now uses absolute paths

4. **Too Many False Positives?**
   Use `PLUGINS_ALLOWED_LIST` to be more selective

## ✨ **Summary**

The plugin system is now:
- **Smarter** - only loads actual plugin files
- **Flexible** - supports multiple export and initialization patterns  
- **Robust** - better error handling and path resolution
- **Simpler** - clearer file naming conventions
- **Documented** - this guide explains everything!

The complexity has been moved into the plugin system itself, so your plugin code can be simpler and more focused on business logic.