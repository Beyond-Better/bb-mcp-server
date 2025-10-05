#!/usr/bin/env -S deno run --allow-all --unstable-kv

/**
 * @module examples/1-simple
 * 
 * # Simple MCP Server - Minimal Setup with Basic Plugin Tools
 *
 * This demonstrates the simplest approach for bb-mcp-server:
 * - Zero custom dependencies (uses library defaults)
 * - Plugin discovery with basic utility tools
 * - Minimal configuration and setup
 * - Perfect starting point for learning MCP server development
 *
 * LEARNING FOCUS: "How to get started with minimal setup"
 *
 * FEATURES DEMONSTRATED:
 * ========================
 *
 * ✅ Plugin Discovery System:
 *    - Automatic plugin loading from src/plugins/
 *    - Self-contained plugin with utility tools
 *    - No manual registration required
 *
 * ✅ Basic Tool Development:
 *    - current_datetime: Basic data retrieval patterns
 *    - get_system_info: System integration examples
 *    - validate_json: Data validation and formatting
 *
 * ✅ Environment Configuration:
 *    - Simple .env file setup
 *    - Transport detection (STDIO vs HTTP)
 *    - Minimal required configuration
 *
 * ✅ AppServer Defaults:
 *    - Library handles all infrastructure automatically
 *    - Logger, TransportManager, WorkflowRegistry created automatically
 *    - Zero boilerplate dependency injection code
 *
 * ARCHITECTURE:
 * =============
 *
 * AppServer.create(minimal config)
 * ├── Plugin Discovery System (automatic)
 * ├── SimplePlugin
 * │   ├── current_datetime tool
 * │   ├── get_system_info tool
 * │   └── validate_json tool
 * └── Default Dependencies
 *     ├── Logger (library default)
 *     ├── TransportManager (library default)
 *     ├── WorkflowRegistry (library default)
 *     └── ConfigManager (library default)
 *
 * USAGE:
 * ======
 *
 * # STDIO transport (default):
 * deno run --allow-all --unstable-kv main.ts
 *
 * # HTTP transport:
 * MCP_TRANSPORT=http deno run --allow-all --unstable-kv main.ts
 * # Then access: http://localhost:3000
 *
 * NEXT STEPS:
 * ===========
 *
 * After mastering this simple example:
 * 1. Try 2-plugin-workflows to learn about multi-step processes
 * 2. Explore 3-plugin-api-auth for external API integration
 * 3. Study 4-manual-deps for complete infrastructure control
 * 
 * @example Run this example directly from JSR
 * ```bash
 * # Run with STDIO transport (default)
 * deno run --allow-all --unstable-kv jsr:@beyondbetter/bb-mcp-server/examples/1-simple
 * 
 * # Run with HTTP transport
 * MCP_TRANSPORT=http deno run --allow-all --unstable-kv jsr:@beyondbetter/bb-mcp-server/examples/1-simple
 * ```
 * 
 * @example Basic server setup
 * ```typescript
 * import { AppServer } from 'jsr:@beyondbetter/bb-mcp-server';
 * 
 * const appServer = await AppServer.create({
 *   serverConfig: {
 *     name: 'my-mcp-server',
 *     version: '1.0.0',
 *     title: 'My MCP Server',
 *     description: 'My custom MCP server',
 *   },
 * });
 * 
 * await appServer.start();
 * ```
 * 
 * @see {@link https://github.com/beyond-better/bb-mcp-server/tree/main/examples/1-simple | Full example documentation}
 * @see {@link https://github.com/beyond-better/bb-mcp-server/tree/main/examples | All examples}
 */

// Import the bb-mcp-server library - handles ALL infrastructure
import { AppServer } from '@beyondbetter/bb-mcp-server';

/**
 * Simple main function - library handles all complexity
 *
 * This is the minimal setup pattern:
 * 1. Create AppServer with basic configuration
 * 2. Start the server
 * 3. Library handles everything else automatically
 */
async function main(): Promise<void> {
  try {
    // 📝 Create AppServer with minimal configuration
    // Library automatically:
    // - Loads environment variables
    // - Creates default dependencies (logger, transport, etc.)
    // - Discovers plugins in src/plugins/
    // - Registers all discovered tools
    // - Configures transport (STDIO or HTTP based on MCP_TRANSPORT)
    const appServer = await AppServer.create({
      // 🎯 Only required: basic server identification
      serverConfig: {
        name: 'simple-mcp-server',
        version: '1.0.0',
        title: 'Simple MCP Server Example',
        description:
          'Demonstrates basic plugin tools with minimal setup using bb-mcp-server library',
      },
    });

    // 🚀 Start the complete application stack
    // This single call handles:
    // - MCP server initialization
    // - HTTP server startup (if transport=http)
    // - Plugin loading and tool registration
    // - Complete application lifecycle management
    await appServer.start();

    console.log('🎉 Simple MCP Server started successfully!');
    console.log(
      '📝 Available tools: current_datetime, get_system_info, validate_json',
    );
    console.log('🔄 Transport:', process.env.MCP_TRANSPORT || 'stdio');
  } catch (error) {
    console.error('❌ Failed to start Simple MCP Server:', error);
    Deno.exit(1);
  }
}

// 🎯 Clean, simple entry point - library handles ALL complexity
if (import.meta.main) {
  main();
}

/**
 * ✨ SUCCESS METRICS - Simple Example Implementation:
 *
 * 📊 CODE SIMPLICITY:
 * - Total setup: ~15 lines of meaningful code
 * - Zero dependency injection boilerplate
 * - Zero infrastructure configuration
 * - Maximum focus on business logic (the tools)
 *
 * 🎯 LEARNING BENEFITS:
 * ✅ Zero Infrastructure Code: All moved to AppServer library class
 * ✅ Plugin Discovery: Automatic loading and registration
 * ✅ Environment Driven: Complete configuration via .env variables
 * ✅ Transport Agnostic: Automatic HTTP vs STDIO detection
 * ✅ Production Ready: Complete error handling and monitoring
 * ✅ Easy to Debug: Clear logging and error messages
 *
 * 🗺️ LIBRARY HANDLES AUTOMATICALLY:
 * - Configuration loading from environment variables
 * - Plugin discovery in src/plugins/ directory
 * - Tool registration and MCP protocol compliance
 * - Transport management (STDIO vs HTTP)
 * - Signal handling and graceful shutdown
 * - Error handling and application monitoring
 * - Complete infrastructure orchestration
 *
 * 🎨 USER RESPONSIBILITIES (Minimal):
 * - Create tools in plugin (business logic only)
 * - Configure environment variables as needed
 * - Run server with appropriate permissions
 * - Focus on solving user problems, not infrastructure
 *
 * 🛣️ PROGRESSION PATH:
 *
 * From this simple example, users can:
 * 1. Add more tools to SimplePlugin
 * 2. Create additional plugins for organization
 * 3. Move to 2-plugin-workflows to learn about multi-step processes
 * 4. Progress to 3-plugin-api-auth for external integrations
 * 5. Master 4-manual-deps for complete infrastructure control
 *
 * The beauty of this approach: users learn MCP concepts without
 * being overwhelmed by infrastructure complexity!
 */
