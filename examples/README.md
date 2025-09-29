# Beyond MCP Server Examples

This directory contains a comprehensive set of example applications that demonstrate the progressive complexity of dependency management and plugin workflows in Beyond MCP Server. Each example builds upon the previous one, providing a clear learning path for users.

## 📚 Learning Progression

The examples are designed to be studied in order, with each demonstrating increasingly sophisticated features:

### 1️⃣ [1-simple](./1-simple/) - **Zero Custom Dependencies + Basic Plugin Tools**

**Complexity**: ⭐ Beginner\
**Features**: Basic plugin system, simple tools, minimal configuration\
**Learning Focus**: "How to get started with minimal setup"

- ✅ Zero custom dependencies (uses library defaults)
- ✅ Plugin discovery with basic utility tools
- ✅ Environment configuration fundamentals
- ✅ STDIO and HTTP transport support

**Tools Demonstrated**:

- `current_datetime` - Shows basic data retrieval
- `get_system_info` - Shows system integration
- `validate_json` - Shows data validation

**Key Learning Points**:

- Plugin creation and discovery
- Basic tool development patterns
- Environment variable configuration
- AppServer.create() with minimal setup

---

### 2️⃣ [2-plugin-workflows](./2-plugin-workflows/) - **Zero Custom Dependencies + Plugin Workflows**

**Complexity**: ⭐⭐ Intermediate\
**Features**: Workflows vs tools, multi-step processes, state management\
**Learning Focus**: "When and how to use workflows vs simple tools"

- ✅ Same infrastructure approach as simple example
- ✅ Plugin containing both tools AND workflows
- ✅ Multi-step business process orchestration
- ✅ Workflow state management and error recovery

**Workflows Demonstrated**:

- **Data Processing Pipeline**: Multi-step data transformation
- **File Management Workflow**: Create → Validate → Process → Archive
- **Content Generation Workflow**: Plan → Generate → Review → Publish

**Key Learning Points**:

- When to use workflows vs simple tools
- Multi-step process orchestration
- State management and error handling
- Workflow step tracking and audit trails

---

### 3️⃣ [3-plugin-api-auth](./3-plugin-api-auth/) - **Custom API Client + OAuth Consumer**

**Complexity**: ⭐⭐⭐ Advanced\
**Features**: Third-party API integration, OAuth authentication, custom dependencies\
**Learning Focus**: "How to integrate with external APIs requiring authentication"

- ✅ Custom dependency creation for API integration
- ✅ OAuth consumer for third-party authentication
- ✅ Integration between library and business components
- ✅ Real-world API integration patterns

**Integration Components**:

- `ExampleOAuthConsumer` - Custom OAuth consumer implementation
- `ExampleApiClient` - Third-party API client with authentication
- `ExampleDependencies` - Dependency injection and configuration

**Key Learning Points**:

- Custom dependency creation patterns
- OAuth consumer implementation
- API client architecture
- Library + business component integration

---

### 4️⃣ [4-manual-deps](./4-manual-deps/) - **Full Custom Dependency Override**

**Complexity**: ⭐⭐⭐⭐ Expert\
**Features**: Complete infrastructure control, advanced customization\
**Learning Focus**: "Advanced customization and infrastructure control"

- ✅ Override all default library dependencies
- ✅ Complete control over infrastructure components
- ✅ Advanced configuration and customization patterns
- ✅ Manual tool and workflow registration (no plugin discovery)

**Advanced Features**:

- Custom transport configuration
- Advanced KV storage setup
- Manual tool/workflow registration
- Complete dependency injection control

**Key Learning Points**:

- Full infrastructure customization
- Advanced dependency injection patterns
- Manual registration vs plugin discovery
- Expert-level configuration control

---

## 🎯 Example Structure Standards

Each example follows a consistent structure to aid learning:

```
{N}-example-name/
├── README.md                    # Example-specific documentation
├── main.ts                      # Entry point with AppServer setup
├── .env.example                 # Environment configuration template
├── .env                         # Local environment (gitignored)
├── deno.jsonc                   # Deno configuration
├── instructions.md              # Step-by-step setup instructions (for humans)
├── mcp_server_instructions.md   # LLM context instructions (for AI models)
│── src/
│   ├── plugins/          # Self-contained plugin implementations
│   │   ├── {Plugin}.ts   # Plugin definition and exports
│   │   ├── tools/        # Tool implementations (when applicable)
│   │   ├── workflows/    # Workflow implementations (when applicable)
│   │   └── types/        # Plugin-specific types
│   ├── config/           # Configuration and dependencies (3+ only)
│   ├── auth/             # Authentication components (3+ only)
│   └── api/              # API clients (3+ only)
└── tests/                # Example-specific demonstration tests
	├── tools/            # Tool testing demonstrations
	└── workflows/        # Workflow testing demonstrations
```

## 🤖 MCP Server Instructions (LLM Context)

Each example includes `mcp_server_instructions.md` that provides essential context for AI models using the MCP server. These instructions are automatically loaded by the server and help LLMs understand:

### **Purpose & Importance**

- **Tool Usage**: When and how to use specific tools and workflows
- **Parameter Requirements**: Required vs optional parameters and validation rules
- **Authentication**: OAuth flows and security requirements (examples 3-4)
- **Error Handling**: Common issues and recovery strategies
- **Best Practices**: Optimal usage patterns for complex operations

### **Instructions vs Documentation**

- **`instructions.md`**: Step-by-step setup guide **for humans**
- **`mcp_server_instructions.md`**: Usage context **for LLM models**

### **Automatic Loading**

The server automatically loads instructions using this priority order:

1. `MCP_SERVER_INSTRUCTIONS` environment variable (direct content)
2. `MCP_INSTRUCTIONS_FILE` environment variable (file path)
3. `mcp_server_instructions.md` in project root (default location)
4. Built-in generic fallback instructions (always available)

### **Customization**

You can customize instructions for your specific use case:

```bash
# Option 1: Direct environment variable
MCP_SERVER_INSTRUCTIONS="Custom instructions for your server..."

# Option 2: Custom file path  
MCP_INSTRUCTIONS_FILE="./config/custom-instructions.md"

# Option 3: Default file (no configuration needed)
# Just place your instructions in: ./mcp_server_instructions.md
```

**💡 Pro Tip**: Study each example's instructions to understand how complexity evolves from simple tools to OAuth-enabled workflows.

---

## ⚠️ Critical Implementation Patterns

### inputSchema Configuration (IMPORTANT)

When defining tool `inputSchema`, use a **plain JavaScript object** with Zod schemas as values:

```typescript
// ✅ CORRECT: Plain object with Zod schema values
inputSchema: {
  json_string: z.string().describe('JSON string to validate'),
  format: z.boolean().default(true).describe('Whether to format the JSON'),
  indent: z.number().int().min(0).max(8).default(2).describe('Indentation spaces'),
}

// ❌ INCORRECT: Do NOT wrap with z.object()
inputSchema: z.object({
  json_string: z.string().describe('JSON string to validate'),
  // ... causes type and runtime errors
})
```

**Why This Matters:**

- The MCP library expects plain object structure for `inputSchema`
- Using `z.object()` wrapper causes type and runtime errors
- All examples follow the correct pattern shown above
- Always include `.describe()` calls for MCP protocol documentation

---

## 🧪 Testing Demonstration

Each example includes demonstration tests that show users how to test their tools and workflows:

### Tool Testing Patterns

- **Registration Testing**: Verify tools are properly registered
- **Parameter Validation**: Test input validation and error handling
- **Execution Testing**: Test tool logic and response formatting
- **Context Testing**: Test user context extraction and logging
- **Integration Testing**: Test with realistic scenarios

### Workflow Testing Patterns

- **Parameter Validation**: Test Zod schema validation
- **Execution Flow**: Test multi-step workflow execution
- **State Management**: Test resource tracking and context management
- **Error Handling**: Test error classification and recovery
- **Step Tracking**: Test completed/failed step management

### Testing Tools Used

- **Mock Services**: Mock API clients, databases, external services
- **Spy Functions**: Monitor function calls and verify behavior
- **Test Helpers**: Reusable test utilities and fixtures
- **Integration Tests**: End-to-end testing with realistic scenarios

## 🚀 Getting Started

1. **Start with [1-simple](./1-simple/)** to understand basic concepts
2. **Progress through each example** in numerical order
3. **Run the tests** to see testing patterns in action
4. **Modify and experiment** with each example to deepen understanding
5. **Use as templates** for your own MCP server implementations

## 📖 Documentation Features

Each example includes:

- ✅ **Step-by-step tutorials** with clear instructions
- ✅ **Architecture explanations** showing component relationships
- ✅ **Common pitfalls** and troubleshooting guidance
- ✅ **Migration paths** showing how to evolve from simpler to more complex setups
- ✅ **Best practices** and recommended patterns
- ✅ **Testing demonstrations** showing how to validate implementations

## 🛠️ Development Workflow

For each example:

```bash
# Navigate to example directory
cd examples/{N}-example-name

# Copy environment template
cp ../.env.example .env

# Edit configuration
vim .env

# Run the example
deno run --allow-all main.ts

# Run tests (demonstration purposes)
deno test --allow-all tests/
```

## 🎯 Success Metrics

These examples are successful if they:

- ✅ **Reduce Learning Curve**: Clear progression from simple to complex
- ✅ **Demonstrate Best Practices**: Show recommended patterns and architectures
- ✅ **Provide Working Code**: All examples run successfully out of the box
- ✅ **Enable Rapid Development**: Serve as templates for real implementations
- ✅ **Show Testing Patterns**: Demonstrate how to validate implementations

## 🔄 Migration Between Examples

Users can evolve their implementations by following the progression:

- **1→2**: Add workflows to existing simple tool setup
- **2→3**: Add external API integration and authentication
- **3→4**: Gain full control over infrastructure dependencies
- **Any→Production**: Use learned patterns in production applications

---

_These examples are the primary way for users to learn Beyond MCP Server. They demonstrate not just how to use the library, but when and why to use different approaches._
