#!/usr/bin/env -S deno run --allow-all

/**
 * Plugin-API-Auth MCP Server - OAuth and External API Integration
 * 
 * This demonstrates advanced capabilities with bb-mcp-server:
 * - OAuth authentication with external APIs
 * - Custom dependency injection for API clients
 * - Plugin discovery with authenticated workflows
 * - Secure credential management and token handling
 * - Integration patterns for third-party services
 * 
 * LEARNING FOCUS: "How to integrate with external APIs using OAuth"
 * 
 * FEATURES DEMONSTRATED:
 * ========================
 * 
 * ✅ OAuth Integration:
 *    - ExampleOAuthConsumer for secure authentication
 *    - Automatic token refresh and management
 *    - Secure credential storage with Deno KV
 * 
 * ✅ External API Client:
 *    - ExampleApiClient with authentication headers
 *    - Proper error handling and retry logic
 *    - Rate limiting and response validation
 * 
 * ✅ Custom Dependencies:
 *    - Pre-built instance injection pattern
 *    - Clean dependency creation with createExampleDependencies()
 *    - Type-safe configuration management
 * 
 * ✅ Plugin Architecture:
 *    - Automatic plugin discovery in src/plugins/
 *    - Tools and workflows bundled together
 *    - Clean separation of business logic and infrastructure
 * 
 * ARCHITECTURE:
 * =============
 * 
 * AppServer.create(custom dependencies)
 * ├── Plugin Discovery System
 * ├── ExamplePlugin
 * │   ├── API integration tools
 * │   └── Authenticated workflows
 * ├── Custom Dependencies
 * │   ├── ExampleApiClient
 * │   └── ExampleOAuthConsumer
 * └── Library Dependencies
 *     └── (ConfigManager, Logger, etc.)
 * 
 * USAGE:
 * ======
 * 
 * # STDIO transport:
 * deno run --allow-all main.ts
 * 
 * # HTTP transport with OAuth endpoints:
 * MCP_TRANSPORT=http deno run --allow-all main.ts
 * # Then access: http://localhost:3000
 * 
 * NEXT STEPS:
 * ===========
 * 
 * After mastering OAuth and API integration:
 * 1. Try 4-manual-deps for complete infrastructure control
 * 2. Build your own OAuth integrations for different providers
 * 3. Implement custom authentication and API patterns
 */

// Import the bb-mcp-server library - handles ALL infrastructure
import { AppServer } from '@beyondbetter/bb-mcp-server';

// Consumer-specific imports - business logic classes
import { createExampleDependencies } from './src/config/ExampleDependencies.ts';

/**
 * Advanced main function demonstrating OAuth and API integration
 * 
 * This builds on the simple setup pattern but adds custom dependencies
 * for OAuth authentication and external API integration.
 */
async function main(): Promise<void> {
  try {
    // 📝 Create AppServer with custom dependencies
    // Library automatically:
    // - Loads environment variables
    // - Creates OAuth consumer and API client from dependencies
    // - Discovers ExamplePlugin in src/plugins/
    // - Registers all discovered workflows and tools
    // - Configures transport (STDIO or HTTP based on MCP_TRANSPORT)
    // - Sets up OAuth endpoints (if HTTP transport)
    const appServer = await AppServer.create(createExampleDependencies);
    
    // 🚀 Start the complete application stack
    // This single call handles:
    // - MCP server initialization with OAuth support
    // - HTTP server startup with OAuth endpoints (if transport=http)
    // - Plugin loading and tool/workflow registration
    // - External API client initialization
    // - Complete application lifecycle management
    await appServer.start();
    
    console.log('🎉 Plugin-API-Auth MCP Server started successfully!');
    console.log('🔐 OAuth integration enabled with ExampleCorp API');
    console.log('🛠️ Available tools: example_query, example_operation');
    console.log('🔧 Available workflows: example_query_workflow, example_operation_workflow');
    console.log('🔄 Transport:', process.env.MCP_TRANSPORT || 'stdio');
    if (process.env.MCP_TRANSPORT === 'http') {
      console.log('🌐 OAuth endpoints: http://localhost:3000/oauth/authorize, /oauth/token');
    }
    
  } catch (error) {
    console.error('❌ Failed to start Plugin-API-Auth MCP Server:', error);
    Deno.exit(1);
  }
}

// 🎯 Clean entry point with OAuth and API integration
if (import.meta.main) {
  main();
}

/**
 * ✨ OAUTH & API INTEGRATION SUCCESS METRICS:
 *
 * 📊 INTEGRATION SOPHISTICATION:
 * - OAuth 2.0 authentication flow with token management
 * - External API client with proper error handling
 * - Secure credential storage with automatic refresh
 * - Plugin-based architecture with custom dependencies
 * - Production-ready authentication patterns
 *
 * 🎯 LEARNING BENEFITS:
 * ✅ OAuth Integration: Complete authentication flow implementation
 * ✅ API Client Patterns: Proper external service integration
 * ✅ Security Best Practices: Secure token storage and management
 * ✅ Custom Dependencies: Advanced dependency injection patterns
 * ✅ Plugin Architecture: Tools and workflows in organized plugins
 * ✅ Production Ready: Error handling, logging, and monitoring
 *
 * 🗺️ OAUTH CAPABILITIES:
 * - Authorization code flow with PKCE
 * - Automatic token refresh and expiration handling
 * - Secure credential storage using Deno KV
 * - Rate limiting and error recovery
 * - Multiple OAuth provider support patterns
 * - HTTP transport OAuth endpoints
 *
 * 🎨 PLUGIN RESPONSIBILITIES:
 * - Implement authenticated tools and workflows
 * - Handle API-specific business logic
 * - Provide proper error handling for API failures
 * - Support both authenticated and unauthenticated operations
 * - Maintain clean separation between auth and business logic
 *
 * 🛣️ OAUTH INTEGRATION PROGRESSION:
 *
 * From this OAuth example, users learn:
 * 1. How to implement OAuth 2.0 authentication flows
 * 2. Proper external API client patterns
 * 3. Secure credential management and storage
 * 4. Advanced dependency injection with custom services
 * 5. Plugin architecture with authenticated capabilities
 * 6. Production-ready authentication and API integration
 *
 * 💡 WHEN TO USE OAUTH INTEGRATION:
 *
 * Use This Pattern When:
 * - Integrating with OAuth-protected APIs
 * - Need secure user authentication
 * - Building multi-tenant applications
 * - Require automated token management
 * - Working with enterprise API services
 *
 * This example demonstrates the complete OAuth integration
 * pattern for building secure, authenticated MCP servers!
 */
