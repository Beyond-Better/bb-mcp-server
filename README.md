# Beyond MCP Server

A comprehensive library for building Deno-based MCP (Model Context Protocol) servers with OAuth and workflow capabilities.

## 🚀 Quick Start for Users

Get started building your own MCP server in minutes with our example applications!

### Installation

```bash
# Install from JSR registry
deno add jsr:@beyondbetter/bb-mcp-server
```

### 📚 Example Applications (Recommended Learning Path)

We provide **4 progressive examples** that teach you everything from basic tools to advanced OAuth integration:

| Example | Complexity | Focus | What You'll Learn |
|---------|------------|-------|------------------|
| **[1-simple](examples/1-simple/)** | ⭐ Beginner | Basic tools & plugins | Get started with minimal setup |
| **[2-plugin-workflows](examples/2-plugin-workflows/)** | ⭐⭐ Intermediate | Multi-step workflows | When to use workflows vs tools |
| **[3-plugin-api-auth](examples/3-plugin-api-auth/)** | ⭐⭐⭐ Advanced | OAuth & API integration | Third-party API authentication |
| **[4-manual-deps](examples/4-manual-deps/)** | ⭐⭐⭐⭐ Expert | Full customization | Complete infrastructure control |

### 🎯 Start with Example 1 - Simple MCP Server

```bash
# Clone and run the simplest example
git clone https://github.com/beyond-better/bb-mcp-server.git
cd bb-mcp-server/examples/1-simple

# Copy environment template and configure
cp .env.example .env

# Run the MCP server
deno run --allow-all main.ts
```

**✨ What you get out of the box:**
- ✅ Working MCP server with plugin discovery
- ✅ Basic utility tools (datetime, system info, JSON validation)
- ✅ Both STDIO and HTTP transport support
- ✅ Environment-based configuration
- ✅ Comprehensive logging and error handling

### 📖 Complete Getting Started Guide

👉 **For detailed setup instructions, architecture explanations, and step-by-step tutorials, see [examples/README.md](examples/README.md)**

The examples directory contains everything you need to:
- 🏃‍♂️ **Get running quickly** with working code
- 📚 **Learn progressively** from simple to advanced concepts
- 🧪 **See testing patterns** for validation and debugging
- 🛠️ **Use as templates** for your own MCP server implementations

### Library Usage (Without Examples)

If you prefer to start from scratch:

```typescript
import { BeyondMcpServer } from 'jsr:@beyondbetter/bb-mcp-server';

// Create and start server with minimal configuration
const server = await BeyondMcpServer.create({
  transport: { type: 'stdio' },
  plugins: { discoveryPaths: ['./src/plugins'] },
});

await server.start();
```

## ✨ Key Features

- **🎯 Plugin System**: Automatic discovery and loading of workflows and tools
- **🔐 OAuth Ready**: Built-in OAuth provider and configurable consumer for third-party APIs
- **⚡ Dual Transport**: STDIO and HTTP transport with session management
- **💾 Persistent Storage**: Deno KV-based storage with automatic cleanup
- **📊 Comprehensive Logging**: Audit trails and structured logging throughout
- **🔧 Type-Safe**: Full TypeScript support with strict checking and validation
- **🧪 Testing Support**: Extensive test utilities and demonstration patterns
- **📦 Ready for JSR**: Published on JSR registry for easy installation

## ⚙️ Configuration Overview

The library supports comprehensive configuration via environment variables. Here are the key settings:

### **Essential Configuration**
```bash
# Transport type
MCP_TRANSPORT=stdio|http       # Default: stdio
HTTP_PORT=3000                 # Default: 3001

# Plugin discovery
PLUGINS_DISCOVERY_PATHS=./src/plugins
PLUGINS_AUTOLOAD=true

# Storage
DENO_KV_PATH=./data/app.db

# Logging
LOG_LEVEL=info                 # debug|info|warn|error

# MCP Server Instructions (for LLM context)
MCP_SERVER_INSTRUCTIONS="Custom instructions for LLM..."
MCP_INSTRUCTIONS_FILE=./path/to/instructions.md
```

### **OAuth Integration**
```bash
# OAuth Provider (when MCP server acts as OAuth provider)
OAUTH_PROVIDER_CLIENT_ID=your-client-id
OAUTH_PROVIDER_CLIENT_SECRET=your-client-secret

# OAuth Consumer (for third-party API integration)
OAUTH_CONSUMER_PROVIDER=example
OAUTH_CONSUMER_CLIENT_ID=third-party-client-id
OAUTH_CONSUMER_CLIENT_SECRET=third-party-secret
```

**📚 For complete configuration details, see the [examples](examples/) - each shows different configuration patterns.**

### **MCP Server Instructions**

MCP Server Instructions provide essential context for LLMs to understand your server's capabilities, tools, and workflows. These instructions are automatically loaded by the server and made available to MCP clients.

#### **Configuration Options** (in priority order):
1. **Direct Configuration**: `MCP_SERVER_INSTRUCTIONS="Your instructions here..."`
2. **File Path**: `MCP_INSTRUCTIONS_FILE="./path/to/instructions.md"`
3. **Default File**: Place `mcp_server_instructions.md` in your project root
4. **Automatic Fallback**: Library provides generic workflow-focused instructions

#### **Why Instructions Matter**:
- **LLM Context**: Help AI models understand your server's specific capabilities
- **Tool Usage**: Provide guidance on when and how to use different tools
- **Workflow Patterns**: Explain complex multi-step processes and error handling
- **Authentication**: Document OAuth requirements and security considerations
- **Best Practices**: Share optimal usage patterns and troubleshooting tips

Each [example application](examples/) includes tailored instructions showing different complexity levels and use cases.

## 🏗️ Architecture Overview

Beyond MCP Server provides a layered architecture that separates concerns:

### **Core Components**
- **🚀 BeyondMcpServer**: Main server orchestrating all components
- **🔄 Transport Layer**: STDIO/HTTP transport with session management  
- **🔌 Plugin System**: Auto-discovery and loading of tools/workflows
- **🔐 OAuth Services**: Provider and consumer for authentication flows
- **💾 Storage Layer**: Deno KV-based persistence with automatic cleanup
- **📊 Logging System**: Structured logging with audit trails

### **Plugin Architecture**
- **Tools**: Simple, single-purpose functions for direct operations
- **Workflows**: Multi-step, stateful processes for complex business logic
- **Plugins**: Bundled collections of tools and workflows for distribution

**🎯 Design Goal**: You focus on business logic, the library handles infrastructure.

## 📚 Documentation & Support

- **🚀 [Getting Started Guide](examples/README.md)** - Complete learning progression with examples
- **🔧 [API Documentation](docs/)** - Detailed API reference and guides
- **🐛 [Issues & Bug Reports](https://github.com/beyond-better/bb-mcp-server/issues)** - Community support and bug tracking
- **💬 [Discussions](https://github.com/beyond-better/bb-mcp-server/discussions)** - Community Q&A and feature requests

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Related Projects

- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) - Official MCP TypeScript SDK
- [Beyond Better](https://github.com/beyond-better) - AI-powered development tools

---

# 🛠️ For Contributors & Maintainers

*The following sections are for those contributing to or maintaining the bb-mcp-server library itself.*

## 🚀 Development Setup

```bash
# Clone the repository
git clone https://github.com/beyond-better/bb-mcp-server.git
cd bb-mcp-server

# Run all tests (library + examples)
deno task test:all

# Run library tests only  
deno task test

# Run specific test file
deno task test tests/unit/storage/KVManager.test.ts

# Run with coverage
deno task tool:test
```

## 🧪 Testing

- **Unit Tests**: All library components with >90% coverage
- **Integration Tests**: End-to-end workflow execution, OAuth flows
- **Example Tests**: Demonstration tests in each example app
- **Mock Services**: Comprehensive mocking for isolated testing

## 📋 Requirements

- **Deno**: Version 2.5.0 or later
- **Permissions**: `--allow-all --unstable-kv` (for Deno KV operations)
- **Standards Compliance**: TypeScript strict mode, ESLint rules

## 🤝 Contributing

This library is being actively developed and extracted from production MCP servers. Contributions welcome!

### Contribution Guidelines
1. Follow the established patterns for new components
2. Ensure tests have >90% coverage for new functionality
3. Maintain backward compatibility with extracted components
4. Update documentation and examples when adding features
5. Use TypeScript strict mode and follow existing code style

### Development Workflow
1. **Fork & Clone**: Fork the repo and clone your fork
2. **Branch**: Create feature branch from `main`
3. **Develop**: Make changes following established patterns
4. **Test**: Run `deno task test:all` to verify all tests pass
5. **Document**: Update relevant documentation and examples
6. **PR**: Submit pull request with clear description

