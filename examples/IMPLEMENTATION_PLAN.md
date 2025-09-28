# Beyond MCP Server Examples - Implementation Plan

This document provides detailed specifications for implementing the comprehensive example suite. It's designed to be continuable across multiple conversations with clear deliverables and success criteria.

## 🎯 Overall Project Goals

### Primary Objectives
1. **Learning Progression**: Create clear path from simple to complex implementations
2. **Self-Contained Examples**: Each example works independently with all necessary components
3. **Testing Demonstrations**: Show users how to test their tools and workflows
4. **Production Readiness**: Examples serve as templates for real implementations
5. **Documentation Excellence**: Comprehensive guides with troubleshooting and best practices

### Success Criteria
- ✅ All 4 examples run successfully out of the box
- ✅ Clear progression in complexity and features
- ✅ Comprehensive documentation for each example
- ✅ Working demonstration tests for all components
- ✅ Consistent code style and architecture patterns
- ✅ Migration guides between complexity levels

---

## 📋 Phase Breakdown

### Phase 1: Foundation & Planning ✅ CURRENT
**Estimated Time**: 1 conversation  
**Status**: In Progress

#### Deliverables
- [x] **examples/README.md**: Overview and learning progression guide
- [x] **examples/IMPLEMENTATION_PLAN.md**: This detailed implementation plan
- [ ] **Architecture diagrams**: Visual representation of each example's architecture
- [ ] **Migration matrix**: Clear paths between examples

#### Current Status
- ✅ Main README created with learning progression
- ✅ Implementation plan in progress
- 🔄 Need to complete architecture documentation

### Phase 2: Simple Example Implementation
**Estimated Time**: 1-2 conversations  
**Dependencies**: Phase 1 complete

#### Deliverables
- [ ] **1-simple/** directory structure
- [ ] **main.ts**: Minimal AppServer.create() setup
- [ ] **src/plugins/SimplePlugin.ts**: Self-contained plugin with utility tools
- [ ] **src/plugins/tools/**: Tool implementations (current_datetime, get_system_info, validate_json)
- [ ] **src/tests/**: Demonstration tests for tools
- [ ] **.env.example**: Environment configuration template
- [ ] **README.md**: Simple example documentation
- [ ] **instructions.md**: Step-by-step setup guide

#### Technical Specifications
```typescript
// main.ts structure
import { AppServer } from '@bb/mcp-server';

async function main(): Promise<void> {
  const appServer = await AppServer.create({
    // Minimal configuration using defaults
    serverConfig: {
      name: 'simple-mcp-server',
      version: '1.0.0',
    },
  });
  await appServer.start();
}
```

#### Tools to Implement
1. **current_datetime**
   - Returns current date/time in various formats
   - Demonstrates basic data retrieval
   - Input: optional timezone, format
   - Output: formatted datetime string

2. **get_system_info**
   - Returns system information (OS, Deno version, memory)
   - Demonstrates system integration
   - Input: optional detail level
   - Output: system information object

3. **validate_json**
   - Validates JSON strings and formats them
   - Demonstrates data validation patterns
   - Input: json_string, optional format options
   - Output: validation result and formatted JSON

### Phase 3: Plugin-Workflows Example Implementation
**Estimated Time**: 1-2 conversations  
**Dependencies**: Phase 2 complete

#### Deliverables
- [ ] **2-plugin-workflows/** directory structure
- [ ] **main.ts**: Same minimal setup as simple example
- [ ] **src/plugins/WorkflowPlugin.ts**: Plugin with tools AND workflows
- [ ] **src/plugins/tools/**: Basic utility tools
- [ ] **src/plugins/workflows/**: Multi-step workflow implementations
- [ ] **src/tests/**: Tests for both tools and workflows
- [ ] **Complete documentation suite**

#### Workflows to Implement
1. **Data Processing Pipeline**
   ```typescript
   // Steps: validate → transform → analyze → export
   class DataProcessingWorkflow extends WorkflowBase {
     async execute(params: {
       data: unknown[],
       transformations: string[],
       outputFormat: 'json' | 'csv'
     }) {
       // Multi-step processing with state tracking
     }
   }
   ```

2. **File Management Workflow**
   ```typescript
   // Steps: create → validate → process → archive
   class FileManagementWorkflow extends WorkflowBase {
     async execute(params: {
       fileName: string,
       content: string,
       validationRules: string[],
       processingOptions: object
     }) {
       // File lifecycle management
     }
   }
   ```

3. **Content Generation Workflow** 
   ```typescript
   // Steps: plan → generate → review → publish
   class ContentGenerationWorkflow extends WorkflowBase {
     async execute(params: {
       contentType: 'blog' | 'documentation' | 'report',
       topic: string,
       requirements: object
     }) {
       // Content creation pipeline (using elicitation for review)
     }
   }
   ```

### Phase 4: Clean Up Existing Examples
**Estimated Time**: 1 conversation  
**Dependencies**: Phase 2-3 complete

#### Tasks
1. **Rename Existing Examples**
   - `plugin-api-auth` → `3-plugin-api-auth`
   - `manual-deps` → `4-manual-deps`

2. **Restructure plugin-api-auth**
   - Move tools and workflows into `src/plugins/` structure
   - Update imports and dependencies
   - Clean up code comments for consistency
   - Ensure ExampleDependencies.ts follows current patterns

3. **Restructure manual-deps**
   - Remove `src/plugins/` directory entirely
   - Move tool/workflow registration to dependency creation
   - Update to use manual registration patterns
   - Review and update for latest library patterns

#### Code Consistency Review
- [ ] Consistent error handling patterns
- [ ] Uniform logging approaches
- [ ] Standardized configuration management
- [ ] Common documentation formats
- [ ] Aligned coding styles and conventions

### Phase 5: Testing Implementation
**Estimated Time**: 1 conversation  
**Dependencies**: All examples restructured

#### Testing Strategy
Based on analysis of existing library tests, implement demonstration tests that show users:

1. **Tool Testing Patterns** (inspired by CoreTools.test.ts and ToolBase.test.ts)
   ```typescript
   // src/tests/tools/{ToolName}.test.ts
   describe('CurrentDatetimeTool', () => {
     let tool: CurrentDatetimeTool;
     let mockToolRegistry: MockToolRegistry;
     
     beforeEach(() => {
       tool = new CurrentDatetimeTool();
       mockToolRegistry = new MockToolRegistry();
     });
     
     it('should register tool with correct definition', () => {
       tool.registerWith(mockToolRegistry);
       const registeredTool = mockToolRegistry.getRegisteredTool('current_datetime');
       assertExists(registeredTool);
       assertEquals(registeredTool.definition.title, 'Current DateTime');
     });
     
     it('should return current datetime in default format', async () => {
       const result = await tool.execute({});
       // Test implementation
     });
     
     it('should handle timezone parameter', async () => {
       const result = await tool.execute({ timezone: 'UTC' });
       // Test timezone handling
     });
   });
   ```

2. **Workflow Testing Patterns** (inspired by WorkflowBase.test.ts)
   ```typescript
   // src/tests/workflows/{WorkflowName}.test.ts
   describe('DataProcessingWorkflow', () => {
     let workflow: DataProcessingWorkflow;
     let context: WorkflowContext;
     
     beforeEach(() => {
       workflow = new DataProcessingWorkflow();
       context = createTestContext();
     });
     
     it('should validate parameters with Zod schema', async () => {
       const validParams = { data: [], transformations: [], outputFormat: 'json' };
       const result = await workflow.validateParameters(validParams);
       assertEquals(result.valid, true);
     });
     
     it('should execute multi-step processing successfully', async () => {
       const params = { /* valid params */ };
       const result = await workflow.executeWithValidation(params, context);
       assertEquals(result.success, true);
       assertEquals(result.completed_steps.length, 4); // validate → transform → analyze → export
     });
   });
   ```

3. **Integration Testing**
   ```typescript
   // src/tests/integration/PluginIntegration.test.ts
   describe('Plugin Integration', () => {
     it('should load all tools and workflows from plugin', async () => {
       // Test complete plugin loading and registration
     });
     
     it('should handle plugin discovery correctly', async () => {
       // Test plugin discovery system
     });
   });
   ```

### Phase 6: Documentation & Polish
**Estimated Time**: 1 conversation  
**Dependencies**: All implementation phases complete

#### Documentation Deliverables
1. **Individual Example READMEs**
   - Architecture overview
   - Setup instructions
   - Usage examples
   - Troubleshooting guides

2. **Migration Guides**
   - Step-by-step evolution between examples
   - Code diff explanations
   - When to choose each approach

3. **Best Practices Guide**
   - Recommended patterns from examples
   - Common pitfalls and solutions
   - Performance considerations

4. **Troubleshooting Documentation**
   - Common errors and solutions
   - Environment setup issues
   - Plugin discovery problems

---

## 🏗️ Technical Architecture Specifications

### 1-simple Architecture
```
AppServer.create(minimal config)
├── Plugin Discovery System
├── SimplePlugin
│   ├── current_datetime tool
│   ├── get_system_info tool
│   └── validate_json tool
└── Default Dependencies
    ├── Logger (library default)
    ├── TransportManager (library default)
    ├── WorkflowRegistry (library default)
    └── ConfigManager (library default)
```

### 2-plugin-workflows Architecture
```
AppServer.create(minimal config)
├── Plugin Discovery System
├── WorkflowPlugin
│   ├── Basic utility tools
│   ├── DataProcessingWorkflow
│   ├── FileManagementWorkflow
│   └── ContentGenerationWorkflow
└── Default Dependencies (same as 1-simple)
```

### 3-plugin-api-auth Architecture
```
AppServer.create(custom dependencies)
├── Plugin Discovery System
├── ExamplePlugin
│   ├── API integration tools
│   └── Authenticated workflows
├── Custom Dependencies
│   ├── ExampleApiClient
│   └── ExampleOAuthConsumer
└── Library Dependencies
    └── (ConfigManager, Logger, etc.)
```

### 4-manual-deps Architecture
```
AppServer.create(full custom setup)
├── Manual Registration (NO plugin discovery)
├── Custom Tools (registered manually)
├── Custom Workflows (registered manually)
└── All Custom Dependencies
    ├── Custom transport config
    ├── Custom KV setup
    ├── Custom OAuth setup
    └── Complete infrastructure control
```

---

## 🧪 Testing Strategy Details

### Test Organization
```
src/tests/
├── tools/
│   ├── CurrentDatetimeTool.test.ts
│   ├── GetSystemInfoTool.test.ts
│   └── ValidateJsonTool.test.ts
├── workflows/
│   ├── DataProcessingWorkflow.test.ts
│   ├── FileManagementWorkflow.test.ts
│   └── ContentGenerationWorkflow.test.ts
├── integration/
│   ├── PluginDiscovery.test.ts
│   └── EndToEnd.test.ts
└── utils/
    ├── test-helpers.ts
    └── mock-services.ts
```

### Key Testing Patterns to Demonstrate

1. **Mock Services Pattern**
   ```typescript
   class MockApiClient {
     async get(endpoint: string) {
       return { data: 'mock-data', endpoint };
     }
   }
   ```

2. **Spy Functions Pattern**
   ```typescript
   const logSpy = spy(mockLogger, 'info');
   await tool.execute({});
   assertSpyCalls(logSpy, 1);
   logSpy.restore();
   ```

3. **Context Testing Pattern**
   ```typescript
   function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
     return {
       userId: 'test-user',
       requestId: 'test-request',
       startTime: new Date(),
       logger: createMockLogger(),
       ...overrides,
     };
   }
   ```

4. **Parameter Validation Testing**
   ```typescript
   it('should validate required parameters', async () => {
     const result = await tool.validateParameters({});
     assertEquals(result.success, false);
     assert(result.error.includes('required'));
   });
   ```

---

## 🔄 Migration Strategy

### Existing Code Migration

#### plugin-api-auth → 3-plugin-api-auth
1. **Rename directory**
2. **Restructure plugins**: Move tools/workflows into `src/plugins/` structure
3. **Update imports**: Adjust import paths for new structure
4. **Clean comments**: Ensure consistent code documentation
5. **Test migration**: Verify all functionality still works

#### manual-deps → 4-manual-deps
1. **Rename directory**
2. **Remove plugin discovery**: Delete `src/plugins/` entirely
3. **Manual registration**: Move tool/workflow registration to dependency creation
4. **Update dependencies**: Review for latest library patterns
5. **Full testing**: Comprehensive testing due to significant changes

### Code Consistency Standards

#### Error Handling
```typescript
// Consistent error handling pattern
try {
  const result = await operation();
  return createSuccessResponse(result);
} catch (error) {
  this.logError('Operation failed', error);
  return createErrorResponse(error, 'operation_name');
}
```

#### Logging
```typescript
// Consistent logging pattern
this.logInfo('Operation started', { params: sanitizedParams });
// ... operation ...
this.logInfo('Operation completed', { result: 'success', duration });
```

#### Configuration
```typescript
// Consistent config access pattern
const setting = configManager.get('SETTING_NAME', 'default_value');
const requiredSetting = configManager.getRequired('REQUIRED_SETTING');
```

---

## ✅ Success Criteria & Validation

### Per-Example Success Criteria

#### 1-simple
- [ ] Runs with `deno run --allow-all main.ts`
- [ ] All 3 tools work correctly
- [ ] Plugin discovery loads tools automatically
- [ ] Environment configuration works
- [ ] Tests pass: `deno test --allow-all src/tests/`
- [ ] Documentation is clear and complete

#### 2-plugin-workflows
- [ ] All tools from 1-simple work
- [ ] All 3 workflows execute successfully
- [ ] State management works correctly
- [ ] Error handling demonstrates best practices
- [ ] Tests pass for both tools and workflows
- [ ] Clear distinction between tools vs workflows

#### 3-plugin-api-auth
- [ ] Custom dependencies integrate correctly
- [ ] OAuth consumer works (with mock/demo API)
- [ ] API client handles authentication
- [ ] Plugin structure maintained
- [ ] Migration from 2-plugin-workflows is clear
- [ ] All existing functionality preserved

#### 4-manual-deps
- [ ] Complete infrastructure control demonstrated
- [ ] No plugin discovery (manual registration only)
- [ ] All library components can be overridden
- [ ] Advanced patterns clearly shown
- [ ] Migration complexity justified
- [ ] Expert-level features work correctly

### Overall Project Success
- [ ] **Learning Progression Works**: Users can follow 1→2→3→4 path
- [ ] **Templates Ready**: Examples serve as production templates
- [ ] **Testing Demonstrated**: Clear testing patterns for users
- [ ] **Documentation Complete**: Comprehensive guides and troubleshooting
- [ ] **Consistency Achieved**: Uniform code style and patterns
- [ ] **Migration Paths Clear**: Users know when/how to evolve

---

## 🚀 Execution Notes

### Conversation Continuity
To continue this project across conversations:
1. Reference this **IMPLEMENTATION_PLAN.md** document
2. Check **examples/README.md** for current progress
3. Use the phase breakdown to identify current tasks
4. Each conversation should complete one logical phase or sub-phase
5. Update this plan with progress and any changes

### Development Environment
```bash
# Standard development workflow for each example
cd examples/{N}-example-name
cp .env.example .env
vim .env  # Configure environment
deno run --allow-all main.ts  # Run example
deno test --allow-all src/tests/  # Run demonstration tests
```

### Quality Assurance
- Every example must run successfully out of the box
- All tests must pass and demonstrate key concepts
- Documentation must be complete and accurate
- Code must follow established patterns and conventions
- Migration between examples must be clearly documented

---

*This implementation plan ensures consistent, high-quality examples that serve as the primary learning resource for Beyond MCP Server users.*