#!/usr/bin/env -S deno run --allow-all --unstable-kv

/**
 * @module examples/2-plugin-workflows
 *
 * # Plugin-Workflows MCP Server - Multi-Step Workflow Demonstrations
 *
 * This demonstrates advanced workflow capabilities with bb-mcp-server:
 * - Multi-step workflow implementations with state management
 * - Error handling and recovery patterns across workflow steps
 * - Resource tracking and performance monitoring
 * - Complex business process automation
 * - Integration of both tools and workflows in a single plugin
 *
 * LEARNING FOCUS: "How to build sophisticated multi-step workflows"
 *
 * FEATURES DEMONSTRATED:
 * ========================
 *
 * ✅ Advanced Workflow System:
 *    - DataProcessingWorkflow: validate → transform → analyze → export
 *    - FileManagementWorkflow: create → validate → process → archive
 *    - ContentGenerationWorkflow: plan → generate → review → publish
 *
 * ✅ State Management:
 *    - Data flows between workflow steps
 *    - State preservation and transformation
 *    - Resource tracking throughout execution
 *
 * ✅ Error Handling & Recovery:
 *    - safeExecute() wrapper for consistent error handling
 *    - Failed step tracking with detailed information
 *    - Graceful degradation and continuation patterns
 *
 * ✅ Performance Monitoring:
 *    - Execution timing for each step
 *    - Resource usage tracking
 *    - Comprehensive metadata collection
 *
 * ✅ Plugin Integration:
 *    - Both workflows and tools in one plugin
 *    - Automatic discovery and registration
 *    - Clean separation of concerns
 *
 * ARCHITECTURE:
 * =============
 *
 * AppServer.create(minimal config)
 * ├── Plugin Discovery System (automatic)
 * ├── WorkflowPlugin
 * │   ├── 🔧 Workflows (3 comprehensive implementations):
 * │   │   ├── data_processing_pipeline
 * │   │   ├── file_management_lifecycle
 * │   │   └── content_generation_pipeline
 * │   └── 🛠️ Tools (2 basic utilities):
 * │       ├── current_datetime
 * │       └── validate_json
 * └── Default Dependencies
 *     ├── Logger (library default)
 *     ├── TransportManager (library default)
 *     ├── WorkflowRegistry (library default with workflow support)
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
 * # Test workflows:
 * deno test --allow-all --unstable-kv src/tests/
 *
 * WORKFLOW EXAMPLES:
 * ==================
 *
 * Data Processing:
 * {
 *   "userId": "user123",
 *   "data": [{"name": "Alice", "score": 95}],
 *   "transformations": ["normalize", "sort"],
 *   "outputFormat": "json",
 *   "analysisType": "summary"
 * }
 *
 * File Management:
 * {
 *   "userId": "user123",
 *   "fileName": "config.json",
 *   "content": "{\"setting\": \"value\"}",
 *   "validationRules": ["valid_json", "max_size"],
 *   "processingOptions": {"format": "pretty"}
 * }
 *
 * Content Generation:
 * {
 *   "userId": "user123",
 *   "contentType": "blog",
 *   "topic": "Machine Learning",
 *   "requirements": {"wordCount": 800, "tone": "professional"}
 * }
 *
 * NEXT STEPS:
 * ===========
 *
 * After mastering workflows:
 * 1. Try 3-plugin-api-auth to learn OAuth and external API integration
 * 2. Explore 4-manual-deps for complete infrastructure control
 * 3. Build your own workflows for specific business processes
 *
 * @example Run this example directly from JSR
 * ```bash
 * # Run with STDIO transport (default)
 * deno run --allow-all --unstable-kv jsr:@beyondbetter/bb-mcp-server/examples/2-plugin-workflows
 *
 * # Run with HTTP transport
 * MCP_TRANSPORT=http deno run --allow-all --unstable-kv jsr:@beyondbetter/bb-mcp-server/examples/2-plugin-workflows
 * ```
 *
 * @example Execute a workflow
 * ```typescript
 * // Data processing workflow example
 * const result = await workflow.execute({
 *   userId: 'user123',
 *   data: [{name: 'Alice', score: 95}],
 *   transformations: ['normalize', 'sort'],
 *   outputFormat: 'json',
 *   analysisType: 'summary'
 * });
 * ```
 *
 * @see {@link https://github.com/beyond-better/bb-mcp-server/tree/main/examples/2-plugin-workflows | Full example documentation}
 * @see {@link https://github.com/beyond-better/bb-mcp-server/tree/main/examples/1-simple | Previous example: Simple MCP Server}
 */

// Import the bb-mcp-server library - handles ALL infrastructure
import { AppServer } from '@beyondbetter/bb-mcp-server';

/**
 * Advanced main function demonstrating workflow capabilities
 *
 * This follows the same minimal setup pattern as 1-simple,
 * but the WorkflowPlugin provides sophisticated multi-step workflows
 * instead of simple utility tools.
 */
async function main(): Promise<void> {
  try {
    // 📝 Create AppServer with minimal configuration
    // Library automatically:
    // - Loads environment variables
    // - Creates default dependencies (logger, transport, workflow registry)
    // - Discovers WorkflowPlugin in src/plugins/
    // - Registers all discovered workflows and tools
    // - Configures transport (STDIO or HTTP based on MCP_TRANSPORT)
    const appServer = await AppServer.create({
      // 🎯 Only required: basic server identification
      serverConfig: {
        name: 'plugin-workflows-mcp-server',
        version: '1.0.0',
        title: 'Plugin-Workflows MCP Server Example',
        description:
          'Demonstrates multi-step workflows with state management using bb-mcp-server library',
      },
    });

    // 🚀 Start the complete application stack
    // This single call handles:
    // - MCP server initialization with workflow support
    // - HTTP server startup (if transport=http)
    // - Plugin loading and workflow/tool registration
    // - Complete application lifecycle management
    await appServer.start();

    console.log('🎉 Plugin-Workflows MCP Server started successfully!');
    console.log('🔧 Available workflows:');
    console.log('   - data_processing_pipeline (validate → transform → analyze → export)');
    console.log('   - file_management_lifecycle (create → validate → process → archive)');
    console.log('   - content_generation_pipeline (plan → generate → review → publish)');
    console.log('🛠️ Available tools: current_datetime, validate_json');
    console.log('🔄 Transport:', process.env.MCP_TRANSPORT || 'stdio');
    console.log('🧪 Run tests: deno test --allow-all --unstable-kv src/tests/');
  } catch (error) {
    console.error('❌ Failed to start Plugin-Workflows MCP Server:', error);
    Deno.exit(1);
  }
}

// 🎯 Clean entry point - library handles ALL complexity
if (import.meta.main) {
  main();
}

/**
 * ✨ WORKFLOW SUCCESS METRICS - Plugin-Workflows Implementation:
 *
 * 📊 WORKFLOW SOPHISTICATION:
 * - 3 comprehensive multi-step workflows
 * - State management and data flow between steps
 * - Advanced error handling and recovery patterns
 * - Resource tracking and performance monitoring
 * - Business process automation examples
 *
 * 🎯 LEARNING BENEFITS:
 * ✅ Multi-Step Processing: Complex operations broken into manageable steps
 * ✅ State Management: Data transforms between workflow steps
 * ✅ Error Recovery: Continue execution after non-critical failures
 * ✅ Resource Tracking: Monitor performance and resource usage
 * ✅ Business Logic: Encapsulate complex business processes
 * ✅ Production Patterns: Real-world workflow implementation patterns
 *
 * 🗺️ WORKFLOW CAPABILITIES:
 * - Data Processing: Statistical analysis, transformations, export formats
 * - File Management: Lifecycle management with validation and archival
 * - Content Generation: AI-powered creation with quality review
 * - Error Handling: Comprehensive error classification and recovery
 * - Performance Monitoring: Step timing and resource usage tracking
 * - State Tracking: Data flow and transformation across steps
 *
 * 🎨 PLUGIN RESPONSIBILITIES:
 * - Implement WorkflowBase subclasses with business logic
 * - Define comprehensive parameter schemas with Zod
 * - Handle multi-step execution with state management
 * - Provide proper error handling and recovery patterns
 * - Track resources and performance throughout execution
 *
 * 🛣️ WORKFLOW PROGRESSION:
 *
 * From this workflow example, users learn:
 * 1. How to design multi-step business processes
 * 2. Proper state management between workflow steps
 * 3. Advanced error handling and recovery patterns
 * 4. Resource tracking and performance monitoring
 * 5. Integration patterns for tools and workflows
 * 6. Testing strategies for complex multi-step operations
 *
 * 💡 WHEN TO USE WORKFLOWS VS TOOLS:
 *
 * Use Tools When:
 * - Single operation or utility function
 * - Stateless processing
 * - Simple input/output transformation
 * - Quick validation or formatting
 *
 * Use Workflows When:
 * - Multiple related steps required
 * - State management between operations
 * - Complex business process automation
 * - Error recovery and continuation needed
 * - Performance monitoring required
 * - Audit trail and resource tracking important
 *
 * This example demonstrates the power of workflows for handling
 * sophisticated business processes that require multiple coordinated
 * steps with proper error handling and state management!
 */
