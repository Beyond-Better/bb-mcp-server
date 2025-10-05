/**
 * Simple Plugin - Self-Contained Utility Tools
 *
 * This plugin demonstrates the CORRECT patterns for MCP plugin development:
 * - Populate tools/workflows arrays directly (no manual registration)
 * - Let PluginManager handle all registration automatically
 * - Keep plugins simple and focused on business logic
 * - No initialize() method needed for simple cases
 *
 * PLUGIN ARCHITECTURE:
 * ===================
 *
 * SimplePlugin
 * ├── tools[] array populated with tool definitions
 * ├── workflows[] array (empty for this simple example)
 * └── PluginManager automatically registers everything
 *
 * Each tool demonstrates key concepts:
 * - Parameter validation with Zod schemas
 * - Error handling and user-friendly responses
 * - Proper logging and response formatting
 * - MCP protocol compliance
 *
 * LEARNING FOCUS:
 * ===============
 *
 * This plugin teaches:
 * 1. How to create self-contained plugins correctly
 * 2. Simple tool implementation patterns
 * 3. Parameter validation and error handling
 * 4. Response formatting for different data types
 * 5. Integration with system APIs and data sources
 * 6. CORRECT plugin registration patterns (no manual registration!)
 */

import { z } from 'zod';
import type { AppPlugin } from '@beyondbetter/bb-mcp-server';

/**
 * Simple Plugin Implementation
 *
 * This plugin demonstrates the CORRECT pattern:
 * - Populate tools array with tool definitions
 * - PluginManager handles all registration automatically
 * - No initialize() method needed for simple cases
 * - Clean, minimal plugin structure
 */
const SimplePlugin: AppPlugin = {
  name: 'simple-plugin',
  version: '1.0.0',
  description: 'Basic utility tools for learning MCP server development',
  author: 'Beyond MCP Server Examples',
  license: 'MIT',

  // 📝 Plugin metadata for discovery and documentation
  tags: ['utility', 'beginner', 'examples'],

  // 🔧 Workflows array - empty for this simple plugin (tools only)
  workflows: [],

  // 🛠️ Tools array - populated with tool definitions
  // PluginManager will automatically register these tools
  tools: [
    // Current DateTime Tool
    {
      name: 'current_datetime',
      definition: {
        title: 'Current DateTime',
        description: 'Get current date and time in various formats and timezones',
        category: 'utility',
        tags: ['datetime', 'utility', 'formatting'],
        inputSchema: {
          timezone: z.string().optional().describe('Timezone (e.g., "UTC", "America/New_York")'),
          format: z.enum(['iso', 'human', 'unix', 'custom']).default('iso').describe(
            'Output format',
          ),
          customFormat: z.string().optional().describe('Custom format string (when format=custom)'),
        },
      },
      handler: async (args: any) => {
        try {
          const params = z.object({
            timezone: z.string().optional(),
            format: z.enum(['iso', 'human', 'unix', 'custom']).default('iso'),
            customFormat: z.string().optional(),
          }).parse(args);

          // Get current date - handle timezone if specified
          let currentDate: Date;
          if (params.timezone) {
            // Note: This is a simplified timezone handling for educational purposes
            // Production code would use a proper timezone library
            currentDate = new Date(
              new Date().toLocaleString('en-US', { timeZone: params.timezone }),
            );
          } else {
            currentDate = new Date();
          }

          // Format based on requested format
          let formattedDate: string;
          switch (params.format) {
            case 'iso':
              formattedDate = currentDate.toISOString();
              break;
            case 'human':
              formattedDate = currentDate.toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              });
              break;
            case 'unix':
              formattedDate = Math.floor(currentDate.getTime() / 1000).toString();
              break;
            case 'custom':
              // For educational purposes - in production, use a proper date formatting library
              formattedDate = params.customFormat
                ? currentDate.toString() // Simplified custom formatting
                : currentDate.toISOString();
              break;
            default:
              formattedDate = currentDate.toISOString();
          }

          // Return structured response with metadata
          const result = {
            datetime: formattedDate,
            format: params.format,
            timezone: params.timezone || 'local',
            unix_timestamp: Math.floor(currentDate.getTime() / 1000),
            iso_string: currentDate.toISOString(),
            metadata: {
              generated_at: new Date().toISOString(),
              tool: 'current_datetime',
            },
          };

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
            metadata: {
              tool: 'current_datetime',
              format: params.format,
              timezone: params.timezone || 'local',
            },
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error in current_datetime tool: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            }],
            isError: true,
            metadata: {
              tool: 'current_datetime',
              error: true,
            },
          };
        }
      },
    },

    // System Information Tool
    {
      name: 'get_system_info',
      definition: {
        title: 'Get System Information',
        description: 'Retrieve system information including OS, runtime, and resource usage',
        category: 'utility',
        tags: ['system', 'monitoring', 'diagnostics'],
        inputSchema: {
          detail: z.enum(['basic', 'detailed']).default('basic').describe(
            'Level of detail to include',
          ),
          includeMemory: z.boolean().default(true).describe('Include memory usage information'),
          includeEnvironment: z.boolean().default(false).describe(
            'Include environment variables (filtered)',
          ),
        },
      },
      handler: async (args) => {
        try {
          const params = z.object({
            detail: z.enum(['basic', 'detailed']).default('basic'),
            includeMemory: z.boolean().default(true),
            includeEnvironment: z.boolean().default(false),
          }).parse(args);

          // Basic system information
          const basicInfo = {
            runtime: {
              name: 'Deno',
              version: Deno.version.deno,
              v8_version: Deno.version.v8,
              typescript_version: Deno.version.typescript,
            },
            system: {
              os: Deno.build.os,
              arch: Deno.build.arch,
              target: Deno.build.target,
            },
            process: {
              pid: Deno.pid,
              ppid: Deno.ppid,
            },
            timestamp: new Date().toISOString(),
          };

          // Add memory information if requested
          if (params.includeMemory) {
            try {
              const memoryUsage = Deno.memoryUsage();
              (basicInfo as any).memory = {
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
                heap_total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
                heap_used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
                external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
              };
            } catch (error) {
              (basicInfo as any).memory = { error: 'Memory information not available' };
            }
          }

          // Add detailed information if requested
          if (params.detail === 'detailed') {
            try {
              (basicInfo as any).detailed = {
                cwd: Deno.cwd(),
                executable_path: Deno.execPath(),
                permissions: {
                  net: 'Runtime check required',
                  read: 'Runtime check required',
                  write: 'Runtime check required',
                  env: 'Runtime check required',
                },
              };
            } catch (error) {
              (basicInfo as any).detailed = { error: 'Detailed information not available' };
            }
          }

          // Add filtered environment information if requested
          if (params.includeEnvironment) {
            try {
              // Only include safe, non-sensitive environment variables
              const safeEnvVars = [
                'DENO_DIR',
                'HOME',
                'PATH',
                'PWD',
                'SHELL',
                'USER',
                'MCP_TRANSPORT',
              ];
              const environment: Record<string, string> = {};

              for (const key of safeEnvVars) {
                const value = Deno.env.get(key);
                if (value) {
                  environment[key] = key === 'PATH' ? '[PATH_SET]' : value; // Shorten PATH for readability
                }
              }

              (basicInfo as any).environment = environment;
            } catch (error) {
              (basicInfo as any).environment = { error: 'Environment information not available' };
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(basicInfo, null, 2),
            }],
            metadata: {
              tool: 'get_system_info',
              detail_level: params.detail,
              include_memory: params.includeMemory,
              include_environment: params.includeEnvironment,
            },
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error in get_system_info tool: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            }],
            isError: true,
            metadata: {
              tool: 'get_system_info',
              error: true,
            },
          };
        }
      },
    },

    // JSON Validation Tool
    {
      name: 'validate_json',
      definition: {
        title: 'Validate JSON',
        description: 'Validate and format JSON strings, providing detailed error information',
        category: 'utility',
        tags: ['validation', 'json', 'formatting'],
        inputSchema: {
          json_string: z.string().describe('JSON string to validate and format'),
          format: z.boolean().default(true).describe('Whether to format (prettify) the JSON'),
          validate_only: z.boolean().default(false).describe(
            'Only validate, do not return formatted JSON',
          ),
          indent: z.number().int().min(0).max(8).default(2).describe(
            'Number of spaces for indentation',
          ),
        },
      },
      handler: async (args) => {
        try {
          const params = z.object({
            json_string: z.string(),
            format: z.boolean().default(true),
            validate_only: z.boolean().default(false),
            indent: z.number().int().min(0).max(8).default(2),
          }).parse(args);

          let parsedJson: unknown;
          let validationResult = {
            valid: false,
            error: null as string | null,
            formatted_json: null as string | null,
            statistics: {
              original_length: params.json_string.length,
              formatted_length: 0,
              object_keys: 0,
              nested_levels: 0,
            },
            metadata: {
              tool: 'validate_json',
              timestamp: new Date().toISOString(),
            },
          };

          // Attempt to parse JSON
          try {
            parsedJson = JSON.parse(params.json_string);
            validationResult.valid = true;

            // Calculate statistics
            if (typeof parsedJson === 'object' && parsedJson !== null) {
              validationResult.statistics.object_keys = Object.keys(parsedJson).length;
              validationResult.statistics.nested_levels = calculateNestingDepth(parsedJson);
            }

            // Format JSON if requested and validation passed
            if (params.format && !params.validate_only) {
              validationResult.formatted_json = JSON.stringify(parsedJson, null, params.indent);
              validationResult.statistics.formatted_length = validationResult.formatted_json.length;
            }
          } catch (parseError) {
            validationResult.valid = false;
            validationResult.error = parseError instanceof Error
              ? `JSON parsing failed: ${parseError.message}`
              : 'Unknown JSON parsing error';
          }

          // Prepare response based on validation result
          if (validationResult.valid) {
            const responseText = params.validate_only
              ? `✅ JSON is valid\n\nStatistics: ${
                JSON.stringify(validationResult.statistics, null, 2)
              }`
              : (validationResult.formatted_json ||
                `✅ JSON is valid (original): ${params.json_string}`);

            return {
              content: [{
                type: 'text',
                text: responseText,
              }],
              metadata: {
                tool: 'validate_json',
                valid: true,
                statistics: validationResult.statistics,
              },
            };
          } else {
            return {
              content: [{
                type: 'text',
                text:
                  `❌ JSON validation failed\n\nError: ${validationResult.error}\n\nOriginal: ${params.json_string}`,
              }],
              metadata: {
                tool: 'validate_json',
                valid: false,
                error: validationResult.error,
              },
            };
          }
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error in validate_json tool: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            }],
            isError: true,
            metadata: {
              tool: 'validate_json',
              error: true,
            },
          };
        }
      },
    },
  ],
};

// Make plugin discoverable as default export
export default SimplePlugin;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate the maximum nesting depth of an object
 * Helper function for JSON statistics
 */
function calculateNestingDepth(obj: unknown, currentDepth = 0): number {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth;
  }

  if (Array.isArray(obj)) {
    let maxDepth = currentDepth;
    for (const item of obj) {
      const depth = calculateNestingDepth(item, currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
    return maxDepth;
  }

  let maxDepth = currentDepth;
  for (const value of Object.values(obj)) {
    const depth = calculateNestingDepth(value, currentDepth + 1);
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * EDUCATIONAL SUMMARY - CORRECT PLUGIN PATTERNS:
 * ===============================================
 *
 * This SimplePlugin demonstrates the CORRECT way to create MCP plugins:
 *
 * 1. 🛠️ TOOLS ARRAY PATTERN (CORRECT):
 *    - Populate tools[] array with ToolRegistration objects
 *    - PluginManager automatically registers all tools
 *    - No manual registry.registerTool() calls needed
 *    - Clean, declarative plugin structure
 *
 * 2. 🔧 NO INITIALIZE METHOD NEEDED (SIMPLE CASES):
 *    - Only use initialize() for complex async setup
 *    - Most plugins can just populate arrays directly
 *    - Simpler and more maintainable
 *    - Less error-prone
 *
 * 3. 📝 PLUGIN METADATA (REQUIRED):
 *    - name, version, description for identification
 *    - tags for discovery and categorization
 *    - Clear, descriptive information
 *
 * 4. 🎯 TOOL DEFINITION STRUCTURE:
 *    - name: unique identifier
 *    - definition: MCP tool metadata
 *    - handler: async function implementing tool logic
 *    - Zod schemas for parameter validation
 *
 * 5. 🔄 AUTOMATIC REGISTRATION FLOW:
 *    - PluginManager discovers plugin files
 *    - Imports plugin and reads tools/workflows arrays
 *    - Registers each tool/workflow automatically
 *    - No plugin code needed for registration!
 *
 * WHY THIS PATTERN IS BETTER:
 * ==========================
 *
 * - 🎯 **Simpler**: No complex registration logic
 * - 🔄 **Automatic**: PluginManager handles everything
 * - 🛡️ **Safer**: Less code means fewer bugs
 * - 📖 **Clearer**: Declarative structure is easier to understand
 * - 🔧 **Maintainable**: Changes only affect tool definitions
 * - 🚀 **Scalable**: Easy to add/remove tools
 *
 * This plugin serves as the template for creating your own utility tools
 * and demonstrates the patterns that make MCP servers robust, user-friendly,
 * and correctly integrated with the Beyond MCP Server library!
 */
