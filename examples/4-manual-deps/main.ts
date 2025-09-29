#!/usr/bin/env -S deno run --allow-all

/**
 * Manual-Deps MCP Server - Complete Infrastructure Control
 *
 * This demonstrates expert-level capabilities with bb-mcp-server:
 * - Complete control over dependency creation and configuration
 * - Manual tool and workflow registration within dependency injection
 * - Advanced configuration patterns and custom overrides
 * - Expert patterns for maximum flexibility and customization
 * - Production-ready manual registration and lifecycle management
 *
 * LEARNING FOCUS: "How to manually control all aspects of MCP server setup"
 *
 * FEATURES DEMONSTRATED:
 * ========================
 *
 * ✅ Manual Dependency Control:
 *    - Complete control over all dependency creation
 *    - Custom service implementations and overrides
 *    - Advanced dependency injection patterns
 *
 * ✅ Custom Registration Logic:
 *    - Manual tool and workflow registration within dependencies
 *    - Conditional loading based on environment or configuration
 *    - Direct control over registration order and behavior
 *
 * ✅ Advanced Configuration:
 *    - Custom configuration loading and validation
 *    - Environment-specific dependency creation
 *    - Override any library component as needed
 *
 * ✅ Production Patterns:
 *    - Enterprise integration patterns
 *    - Advanced error handling and recovery
 *    - Custom logging and monitoring integration
 *
 * ARCHITECTURE:
 * =============
 *
 * AppServer.create(custom dependency function)
 * ├── Custom Dependency Function (complete control)
 * │   ├── Manual tool registration within dependencies
 * │   ├── Manual workflow registration within dependencies
 * │   └── Complete infrastructure customization
 * └── Library Components (used as needed)
 *     └── (Logger, KV, Transport, etc. - all controllable)
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
 * EXPERT PATTERNS:
 * ================
 *
 * This example shows expert-level control patterns:
 * - Complete dependency injection control
 * - Manual registration within library lifecycle
 * - Advanced configuration and environment handling
 * - Integration with existing enterprise infrastructure
 */

// Import the bb-mcp-server library
import { AppServer } from '@beyondbetter/bb-mcp-server';

// Manual imports - we control the dependency creation
import { createManualDependencies } from './src/config/ExampleDependencies.ts';

/**
 * Expert-level main function with complete infrastructure control
 *
 * This demonstrates the most advanced setup pattern available:
 * - Custom dependency function with complete control
 * - Manual registration within dependency creation lifecycle
 * - Override any library component as needed
 */
async function main(): Promise<void> {
  try {
    // 📝 Create AppServer with custom dependency function
    // This pattern gives us complete control over:
    // - All dependency creation and initialization
    // - Manual tool and workflow registration
    // - Custom service implementations and overrides
    // - Advanced configuration and environment handling
    const appServer = await AppServer.create(createManualDependencies);

    // 🚀 Start the complete application stack
    // Even with manual control, the library handles:
    // - MCP server initialization and lifecycle
    // - HTTP server startup (if configured)
    // - Transport routing and endpoint setup
    // - Signal handling and graceful shutdown
    await appServer.start();

    console.log('🎉 Manual-Deps MCP Server started successfully!');
    console.log('🔧 Expert mode: Complete infrastructure control enabled');
    console.log('🛠️ Manual dependency creation with custom registration logic');
    console.log('📋 Advanced patterns: Environment-based conditional loading');
    console.log('🔄 Transport:', process.env.MCP_TRANSPORT || 'stdio');
    console.log('⚙️ Infrastructure: All components manually controlled and configured');
  } catch (error) {
    console.error('❌ Failed to start Manual-Deps MCP Server:', error);
    Deno.exit(1);
  }
}

// 🎯 Expert-level entry point - maximum control and flexibility
if (import.meta.main) {
  main();
}

/**
 * ✨ MANUAL DEPENDENCY CONTROL SUCCESS METRICS:
 *
 * 📊 INFRASTRUCTURE MASTERY:
 * - Complete control over all dependency creation and lifecycle
 * - Manual registration within library-managed registries
 * - Custom service implementations and advanced overrides
 * - Expert-level configuration and environment management
 * - Production-ready integration patterns
 *
 * 🎯 LEARNING BENEFITS:
 * ✅ Dependency Mastery: Complete control over all service creation
 * ✅ Registration Control: Manual tool/workflow registration within lifecycle
 * ✅ Advanced Patterns: Expert-level dependency injection and customization
 * ✅ Environment Integration: Conditional loading and environment-specific behavior
 * ✅ Production Readiness: Enterprise integration and advanced error handling
 * ✅ Maximum Flexibility: Override any library component as needed
 *
 * 🗺️ MANUAL CONTROL CAPABILITIES:
 * - Conditional tool/workflow loading based on complex business logic
 * - Integration with existing enterprise service discovery systems
 * - Custom authentication, authorization, and audit logging
 * - Advanced caching, rate limiting, and performance optimization
 * - Custom transport protocols and specialized communication patterns
 * - Fine-grained lifecycle management and resource optimization
 *
 * 🎨 EXPERT RESPONSIBILITIES:
 * - Implement complete dependency creation and injection logic
 * - Handle all aspects of tool and workflow registration manually
 * - Provide custom error handling, recovery, and resilience patterns
 * - Integrate with enterprise infrastructure and monitoring systems
 * - Optimize performance and resource utilization for specific requirements
 * - Maintain compatibility with library evolution and updates
 *
 * 🛣️ EXPERT INTEGRATION PROGRESSION:
 *
 * This expert example demonstrates:
 * 1. When standard dependency injection isn't sufficient
 * 2. How to implement complete infrastructure control
 * 3. Advanced enterprise integration patterns
 * 4. Custom library component implementations
 * 5. Production-ready manual lifecycle management
 * 6. Expert-level performance and customization patterns
 *
 * 💡 WHEN TO USE MANUAL DEPENDENCY CONTROL:
 *
 * Use Manual Control When:
 * - Integrating with complex enterprise infrastructure
 * - Need conditional component loading based on business logic
 * - Implementing custom authentication or authorization patterns
 * - Building highly specialized or performance-critical implementations
 * - Require fine-grained control over component lifecycle and behavior
 * - Working with legacy systems that require specific integration patterns
 *
 * This example demonstrates the ultimate flexibility and control available
 * when you need to go beyond all standard patterns and implement
 * completely custom MCP server infrastructure!
 */
