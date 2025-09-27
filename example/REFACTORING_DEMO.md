# 🎯 **Tool Registration Refactoring Demo**

This document demonstrates the new flexible tool registration system that has been implemented according to the refactoring plan.

## ✅ **Completed Changes**

### **1. Tool Handler Registration Options**

#### **New Handler Modes**
```typescript
export enum ToolHandlerMode {
  MANAGED = 'managed',    // Current complex validation/error handling (default)
  NATIVE = 'native'       // Direct registration, tool handles own validation
}
```

#### **Enhanced Registration**
```typescript
// Before: Only managed mode
toolRegistry.registerTool('my_tool', definition, handler);

// After: Choose handler mode
toolRegistry.registerTool('my_tool', definition, handler, {
  handlerMode: ToolHandlerMode.NATIVE  // Direct registration
});

// Or use default managed mode
toolRegistry.registerTool('my_tool', definition, handler); // Still works
```

### **2. Workflow Tool Naming System**

#### **Three Naming Modes**
```typescript
export enum WorkflowToolNaming {
  SIMPLE = 'simple',           // execute_workflow, get_schema_for_workflow
  NAMESPACED = 'namespaced',   // execute_workflow_$name, get_schema_for_workflow_$name
  CUSTOM = 'custom'            // Completely custom tool names
}
```

#### **Configuration Example**
```typescript
const toolRegistrationConfig = {
  workflowTools: {
    enabled: true,
    naming: WorkflowToolNaming.NAMESPACED, // Creates execute_workflow_examplecorp-mcp-server
    customNames: {  // Only used if naming === CUSTOM
      executeWorkflow: 'run_business_workflow',
      getSchemaWorkflow: 'describe_workflow_schema',
    },
    executeWorkflow: { enabled: true },
    getSchemaWorkflow: { enabled: true },
  },
  defaultHandlerMode: ToolHandlerMode.MANAGED,
};
```

### **3. Core Workflow Tools Moved to Library**

#### **Before (Client Implementation)**
```typescript
// In ExampleTools.ts
class ExampleTools {
  registerWith(toolRegistry: ToolRegistry): void {
    this.registerExecuteWorkflowTool(toolRegistry)  // ❌ Manual implementation
    // ... other tools
  }
  
  private registerExecuteWorkflowTool(registry: ToolRegistry): void {
    // ❌ Complex manual workflow tool registration
    // ❌ Duplicate code across all client applications
  }
  
  private async executeWorkflow(args: any): Promise<CallToolResult> {
    // ❌ Manual workflow execution logic
  }
}
```

#### **After (Library Handles Automatically)**
```typescript
// In ExampleTools.ts - SIMPLIFIED!
class ExampleTools {
  registerWith(toolRegistry: ToolRegistry): void {
    // ✅ Only custom business tools - workflow tools handled by library
    this.registerQueryCustomersTool(toolRegistry)
    this.registerCreateOrderTool(toolRegistry)
    this.registerGetOrderStatusTool(toolRegistry)
    this.registerGetApiInfoTool(toolRegistry)
  }
  // ✅ No more workflow execution code needed!
}

// In BeyondMcpServer - AUTOMATIC REGISTRATION!
protected async registerCoreTools(): Promise<void> {
  this.coreTools.registerWith(this.toolRegistry);
  
  // ✅ Automatically registers workflow tools if workflows exist
  await this.registerWorkflowTools();
}
```

### **4. Enhanced WorkflowRegistry Integration**

#### **New Methods for Tool Integration**
```typescript
// In WorkflowRegistry
buildWorkflowOverviews(): string {
  // ✅ Dynamic workflow descriptions for tool descriptions
  // ✅ Includes tags, categories, duration estimates
}

getWorkflowToolData(): {
  names: string[];
  overviews: string;
  count: number;
  hasWorkflows: boolean;
  registrations: WorkflowRegistration[];
} {
  // ✅ Structured data for workflow tools
}
```

### **5. Tool Validation Helper Utilities**

#### **Consistent Error Handling**
```typescript
// Helper for standard responses
ToolValidationHelper.createStandardErrorResponse(error, 'tool_name');
ToolValidationHelper.createValidationErrorResponse('validation failed', 'tool_name', args);
ToolValidationHelper.createSuccessResponse(data, metadata);

// Helper for consistent logging
const { result, executionTimeMs } = await ToolValidationHelper.executeWithTiming(
  logger,
  'my_tool',
  args,
  async () => {
    // Tool execution logic
  },
  userId,
  requestId
);
```

## 🚀 **Usage Examples**

### **Example 1: Simple Mode (Default)**
```typescript
const serverConfig = {
  server: { name: 'my-app', version: '1.0.0' },
  toolRegistration: {
    workflowTools: {
      enabled: true,
      naming: WorkflowToolNaming.SIMPLE, // Creates: execute_workflow, get_schema_for_workflow
      executeWorkflow: { enabled: true },
      getSchemaWorkflow: { enabled: true },
    },
    defaultHandlerMode: ToolHandlerMode.MANAGED,
  },
};
```

### **Example 2: Namespaced Mode**
```typescript
const serverConfig = {
  server: { name: 'examplecorp-mcp-server', version: '1.0.0' },
  toolRegistration: {
    workflowTools: {
      enabled: true,
      naming: WorkflowToolNaming.NAMESPACED, // Creates: execute_workflow_examplecorp-mcp-server
      executeWorkflow: { enabled: true },
      getSchemaWorkflow: { enabled: true },
    },
  },
};
```

### **Example 3: Custom Names**
```typescript
const serverConfig = {
  server: { name: 'my-app', version: '1.0.0' },
  toolRegistration: {
    workflowTools: {
      enabled: true,
      naming: WorkflowToolNaming.CUSTOM,
      customNames: {
        executeWorkflow: 'run_business_process',
        getSchemaWorkflow: 'describe_process_schema',
      },
      executeWorkflow: { enabled: true },
      getSchemaWorkflow: { enabled: true },
    },
  },
};
```

### **Example 4: Native Tool Handlers**
```typescript
// Register a tool that handles its own validation
toolRegistry.registerTool(
  'custom_native_tool',
  {
    title: 'Custom Native Tool',
    description: 'Handles its own validation and errors',
    category: 'Custom',
    inputSchema: {
      message: z.string().describe('Message to process'),
    },
  },
  async (args: any, extra: any) => {
    // This handler receives raw args and must handle validation/errors itself
    try {
      const validation = validateArgs(args); // Custom validation
      if (!validation.success) {
        return { content: [{ type: 'text', text: `Error: ${validation.error}` }], isError: true };
      }
      
      const result = await processMessage(validation.data.message);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Tool error: ${error.message}` }], isError: true };
    }
  },
  { handlerMode: ToolHandlerMode.NATIVE } // ✅ Direct registration, no wrapper
);
```

## 🏆 **Benefits Achieved**

### **1. Reduced Client Application Complexity**
- ✅ No more manual workflow tool implementation
- ✅ Client apps focus only on business-specific tools
- ✅ Automatic workflow tool registration when workflows exist
- ✅ Zero breaking changes for existing consumers

### **2. Flexible Tool Registration**
- ✅ Choose between managed (default) and native handler modes
- ✅ Three naming modes for workflow tools
- ✅ Consistent helper utilities for validation and error handling
- ✅ Optional workflow tools (disabled if no workflows)

### **3. Enhanced Library Capabilities**
- ✅ Dynamic tool descriptions based on registered workflows
- ✅ Centralized workflow tool management
- ✅ Consistent error handling and logging patterns
- ✅ Helper utilities for common validation scenarios

### **4. Better Developer Experience**
- ✅ Clear separation of concerns (library vs application tools)
- ✅ Flexible configuration options
- ✅ Comprehensive validation helpers
- ✅ Automatic tool registration based on workflow presence

## 📝 **Migration Guide**

### **For Existing Applications**

1. **Remove workflow tools from client code**:
   ```typescript
   // Remove from ExampleTools.ts:
   // - registerExecuteWorkflowTool()
   // - executeWorkflow() method
   // - WorkflowRegistry dependency
   ```

2. **Add tool registration config** (optional):
   ```typescript
   // In dependencies/config:
   toolRegistrationConfig: {
     workflowTools: {
       enabled: true,
       naming: WorkflowToolNaming.SIMPLE, // or NAMESPACED/CUSTOM
       executeWorkflow: { enabled: true },
       getSchemaWorkflow: { enabled: true },
     },
   }
   ```

3. **Update imports**:
   ```typescript
   import {
     // ... existing imports
     ToolHandlerMode,
     WorkflowToolNaming,
     ToolValidationHelper,
   } from '@bb/mcp-server';
   ```

4. **That's it!** The library automatically handles the rest.

## 🎉 **Summary**

This refactoring successfully addresses all the original issues:

- ✅ **Tool Handler Registration Options**: Choose managed or native modes
- ✅ **Core Workflow Tools Centralized**: Moved to library, automatic registration
- ✅ **Flexible Naming System**: Simple, namespaced, or custom tool names
- ✅ **Enhanced WorkflowRegistry**: Provides data for dynamic tool descriptions
- ✅ **Helper Utilities**: Consistent validation, error handling, and logging
- ✅ **Client Simplification**: Focus on business tools, not infrastructure
- ✅ **Zero Breaking Changes**: Existing code continues to work

The system now provides maximum flexibility while reducing complexity for consumers!
