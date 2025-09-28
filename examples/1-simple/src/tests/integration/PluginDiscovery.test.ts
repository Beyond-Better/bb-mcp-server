/**
 * Plugin Discovery Integration Tests
 * 
 * This test file demonstrates integration testing patterns for the NEW MCP plugin system:
 * - Plugin array structure validation
 * - Tool definition verification
 * - End-to-end plugin functionality
 * - Multi-tool coordination
 * - Plugin metadata validation
 * 
 * LEARNING FOCUS:
 * ===============
 * 
 * Shows users how to:
 * 1. Test the new plugin array structure (no initialize() method)
 * 2. Verify complete plugin definition structure
 * 3. Test tool interactions and coordination
 * 4. Validate plugin metadata and structure
 * 5. Test realistic usage scenarios
 * 6. Verify plugin completeness and correctness
 * 
 * INTEGRATION TESTING PATTERNS:
 * =============================
 * 
 * - Plugin structure validation
 * - Complete tool suite verification
 * - Cross-tool interaction testing
 * - Performance and reliability testing
 * - Error propagation and handling
 * - Plugin array pattern validation
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// Import the plugin and test utilities
import SimplePlugin from '../../plugins/SimplePlugin.ts';
import {
  assertValidMcpResponse,
  assertValidJsonResponse,
  measureExecutionTime,
  generateDateTimeTestParams,
  generateSystemInfoTestParams,
  generateJsonValidationTestParams,
} from '../utils/test-helpers.ts';

/**
 * Plugin Discovery Integration Tests
 * 
 * These tests verify that the plugin structure works correctly
 * and that plugins integrate properly with the MCP server using
 * the new array-based pattern.
 */
describe('Plugin Discovery Integration', () => {
  let tools: Map<string, any>;
  
  beforeEach(() => {
    // Create a map of tools for easy lookup
    tools = new Map();
    SimplePlugin.tools.forEach(tool => {
      tools.set(tool.name, tool);
    });
  });
  
  /**
   * PLUGIN STRUCTURE TESTS
   * 
   * Verify that plugins are structured correctly with the new pattern.
   */
  describe('Plugin Structure Validation', () => {
    it('should have correct plugin metadata structure', () => {
      // Verify plugin implements AppPlugin interface correctly
      assertEquals(SimplePlugin.name, 'simple-plugin');
      assertEquals(SimplePlugin.version, '1.0.0');
      assertExists(SimplePlugin.description);
      assert(SimplePlugin.description.length > 0);
      assertEquals(SimplePlugin.author, 'Beyond MCP Server Examples');
      assertEquals(SimplePlugin.license, 'MIT');
      
      // Verify arrays are properly structured
      assert(Array.isArray(SimplePlugin.tools), 'Plugin should have tools array');
      assert(Array.isArray(SimplePlugin.workflows), 'Plugin should have workflows array');
      assert(Array.isArray(SimplePlugin.tags), 'Plugin should have tags array');
      
      // Verify expected content
      assertEquals(SimplePlugin.tools.length, 3, 'Should have exactly 3 tools');
      assertEquals(SimplePlugin.workflows.length, 0, 'Simple plugin should have no workflows');
      assert(SimplePlugin.tags.includes('utility'), 'Should have utility tag');
      assert(SimplePlugin.tags.includes('beginner'), 'Should have beginner tag');
    });
    
    it('should have all expected tools in tools array', () => {
      const expectedTools = ['current_datetime', 'get_system_info', 'validate_json'];
      const actualTools = SimplePlugin.tools.map(tool => tool.name);
      
      for (const toolName of expectedTools) {
        assert(actualTools.includes(toolName), 
          `Tool '${toolName}' should be in tools array`);
      }
      
      assertEquals(actualTools.length, expectedTools.length, 
        'Should have exactly the expected number of tools');
    });
    
    it('should have properly structured tool definitions', () => {
      for (const tool of SimplePlugin.tools) {
        // Verify required tool properties
        assertExists(tool.name, 'Tool should have name');
        assert(typeof tool.name === 'string', 'Tool name should be string');
        assertExists(tool.definition, 'Tool should have definition');
        assertExists(tool.handler, 'Tool should have handler');
        assert(typeof tool.handler === 'function', 'Handler should be function');
        
        // Verify definition structure
        const def = tool.definition;
        assertExists(def.title, 'Definition should have title');
        assertExists(def.description, 'Definition should have description');
        assertEquals(def.category, 'utility', 'All tools should be utility category');
        assert(Array.isArray(def.tags), 'Definition should have tags array');
        assertExists(def.inputSchema, 'Definition should have input schema');
      }
    });
    
    it('should not have initialize method (new pattern)', () => {
      // Verify the plugin doesn't use the old initialize pattern
      assertEquals(SimplePlugin.initialize, undefined, 
        'Plugin should not have initialize method (new pattern)');
    });
  });
  
  /**
   * TOOL FUNCTIONALITY TESTS
   * 
   * Test that all tools work correctly individually.
   */
  describe('Individual Tool Functionality', () => {
    it('should execute all tools successfully with default parameters', async () => {
      const defaultParams = {
        current_datetime: {},
        get_system_info: {},
        validate_json: { json_string: '{"test": true}' },
      };
      
      for (const tool of SimplePlugin.tools) {
        const params = defaultParams[tool.name as keyof typeof defaultParams] || {};
        const result = await tool.handler(params);
        
        assertValidMcpResponse(result, tool.name);
        assertEquals(result.isError, undefined, `Tool '${tool.name}' should not error`);
      }
    });
    
    it('should handle parameterized test scenarios', async () => {
      // Test current_datetime with various parameters
      const dateTimeParams = generateDateTimeTestParams();
      const dateTimeTool = tools.get('current_datetime');
      assertExists(dateTimeTool);
      
      for (const scenario of dateTimeParams) {
        const result = await dateTimeTool.handler(scenario.params);
        assertValidMcpResponse(result, 'current_datetime');
        
        const data = assertValidJsonResponse(result);
        assertEquals(data.format, scenario.expectedFormat, 
          `Scenario '${scenario.name}' should return ${scenario.expectedFormat} format`);
      }
      
      // Test system_info with various parameters
      const systemInfoParams = generateSystemInfoTestParams();
      const systemInfoTool = tools.get('get_system_info');
      assertExists(systemInfoTool);
      
      for (const scenario of systemInfoParams) {
        const result = await systemInfoTool.handler(scenario.params);
        assertValidMcpResponse(result, 'get_system_info');
        
        const data = assertValidJsonResponse(result);
        for (const expectedField of scenario.expectedFields) {
          assertExists(data[expectedField], 
            `Scenario '${scenario.name}' should include field '${expectedField}'`);
        }
      }
      
      // Test JSON validation with various parameters
      const jsonValidationParams = generateJsonValidationTestParams();
      const jsonValidationTool = tools.get('validate_json');
      assertExists(jsonValidationTool);
      
      for (const scenario of jsonValidationParams) {
        const result = await jsonValidationTool.handler(scenario.params);
        assertValidMcpResponse(result, 'validate_json');
        
        if (scenario.expectValid) {
          assertEquals(result.isError, undefined, 
            `Scenario '${scenario.name}' should succeed`);
          assertEquals(result.metadata.valid, true, 
            `Scenario '${scenario.name}' should be marked as valid`);
        } else {
          assertEquals(result.metadata.valid, false, 
            `Scenario '${scenario.name}' should be marked as invalid`);
        }
      }
    });
    
    it('should maintain consistent performance across tools', async () => {
      const testScenarios = [
        { name: 'current_datetime', params: {} },
        { name: 'get_system_info', params: { detail: 'basic' } },
        { name: 'validate_json', params: { json_string: '{"test": true}' } },
      ];
      
      const performanceResults = [];
      
      for (const scenario of testScenarios) {
        const tool = tools.get(scenario.name);
        assertExists(tool, `Tool '${scenario.name}' should exist`);
        
        const { result, duration } = await measureExecutionTime(() => 
          tool.handler(scenario.params)
        );
        
        performanceResults.push({ name: scenario.name, duration });
        
        // All tools should execute quickly (under 100ms for simple operations)
        assert(duration < 100, 
          `Tool '${scenario.name}' should execute quickly, took ${duration.toFixed(2)}ms`);
        
        assertValidMcpResponse(result, scenario.name);
      }
      
      // Log performance for educational purposes
      console.log('Tool Performance Results:', performanceResults);
    });
  });
  
  /**
   * CROSS-TOOL COORDINATION TESTS
   * 
   * Test scenarios where multiple tools work together.
   */
  describe('Cross-Tool Coordination', () => {
    it('should coordinate datetime and system info for comprehensive status', async () => {
      const dateTimeTool = tools.get('current_datetime');
      const systemInfoTool = tools.get('get_system_info');
      assertExists(dateTimeTool);
      assertExists(systemInfoTool);
      
      // Get current time and system info
      const timeResult = await dateTimeTool.handler({ format: 'iso' });
      const systemResult = await systemInfoTool.handler({ 
        detail: 'detailed', 
        includeMemory: true 
      });
      
      // Both should succeed
      assertValidMcpResponse(timeResult, 'current_datetime');
      assertValidMcpResponse(systemResult, 'get_system_info');
      
      // Parse results
      const timeData = assertValidJsonResponse(timeResult);
      const systemData = assertValidJsonResponse(systemResult);
      
      // Verify we can create a comprehensive status report
      const statusReport = {
        timestamp: timeData.datetime,
        system: {
          runtime: systemData.runtime,
          os: systemData.system,
          memory: systemData.memory,
        },
        generated_by: 'SimplePlugin Integration Test',
      };
      
      assertExists(statusReport.timestamp);
      assertExists(statusReport.system.runtime);
      assertExists(statusReport.system.os);
    });
    
    it('should validate JSON generated by other tools', async () => {
      const systemInfoTool = tools.get('get_system_info');
      const jsonValidationTool = tools.get('validate_json');
      assertExists(systemInfoTool);
      assertExists(jsonValidationTool);
      
      // Get system info
      const systemResult = await systemInfoTool.handler({});
      const systemData = assertValidJsonResponse(systemResult);
      
      // Convert system data back to JSON string for validation
      const jsonString = JSON.stringify(systemData);
      
      // Validate the JSON using the validation tool
      const validationResult = await jsonValidationTool.handler({ 
        json_string: jsonString,
        format: true 
      });
      
      assertValidMcpResponse(validationResult, 'validate_json');
      assertEquals(validationResult.metadata.valid, true, 
        'System info JSON should be valid');
    });
    
    it('should handle concurrent tool execution', async () => {
      const concurrentCalls = [
        { tool: 'current_datetime', params: { format: 'iso' } },
        { tool: 'current_datetime', params: { format: 'unix' } },
        { tool: 'get_system_info', params: { detail: 'basic' } },
        { tool: 'validate_json', params: { json_string: '{"concurrent": true}' } },
      ];
      
      // Execute all tools concurrently
      const promises = concurrentCalls.map(async (call) => {
        const tool = tools.get(call.tool);
        assertExists(tool, `Tool '${call.tool}' should exist`);
        return { name: call.tool, result: await tool.handler(call.params) };
      });
      
      const results = await Promise.all(promises);
      
      // All should succeed
      assertEquals(results.length, concurrentCalls.length);
      
      for (const { name, result } of results) {
        assertValidMcpResponse(result, name);
        assertEquals(result.isError, undefined, 
          `Concurrent execution of '${name}' should succeed`);
      }
    });
  });
  
  /**
   * ERROR HANDLING AND ROBUSTNESS TESTS
   * 
   * Verify that the plugin handles error conditions gracefully.
   */
  describe('Error Handling and Robustness', () => {
    it('should handle invalid parameters gracefully across all tools', async () => {
      const invalidScenarios = [
        {
          name: 'current_datetime',
          params: { format: 'invalid_format' },
          expectError: true,
        },
        {
          name: 'get_system_info',
          params: { detail: 'invalid_detail' },
          expectError: true,
        },
        {
          name: 'validate_json',
          params: { json_string: '{invalid json}' },
          expectError: false, // Tool handles invalid JSON gracefully
        },
      ];
      
      for (const scenario of invalidScenarios) {
        const tool = tools.get(scenario.name);
        assertExists(tool, `Tool '${scenario.name}' should exist`);
        
        const result = await tool.handler(scenario.params);
        
        assertValidMcpResponse(result, scenario.name);
        
        if (scenario.expectError) {
          assertEquals(result.isError, true, 
            `Tool '${scenario.name}' should return error for invalid params`);
        } else {
          // Even if not an error, should handle gracefully
          assertExists(result.content, 
            `Tool '${scenario.name}' should return content`);
        }
      }
    });
    
    it('should maintain plugin stability under stress', async () => {
      // Execute many operations rapidly
      const operations = [];
      const toolNames = ['current_datetime', 'get_system_info', 'validate_json'];
      const params = {
        current_datetime: {},
        get_system_info: {},
        validate_json: { json_string: '{"stress": true}' },
      };
      
      // Create 50 operations (mix of different tools)
      for (let i = 0; i < 50; i++) {
        const toolName = toolNames[i % toolNames.length];
        const tool = tools.get(toolName);
        assertExists(tool, `Tool '${toolName}' should exist`);
        operations.push(
          tool.handler(params[toolName as keyof typeof params])
        );
      }
      
      // Execute all operations
      const results = await Promise.all(operations);
      
      // All should succeed
      assertEquals(results.length, 50);
      
      let successCount = 0;
      for (const result of results) {
        if (result.isError !== true) {
          successCount++;
        }
      }
      
      // At least 95% should succeed (allowing for some variability)
      assert(successCount >= 47, 
        `At least 47/50 operations should succeed, got ${successCount}`);
    });
  });
  
  /**
   * PLUGIN COMPATIBILITY TESTS
   * 
   * Test that the plugin structure is compatible with the expected patterns.
   */
  describe('Plugin Compatibility', () => {
    it('should be compatible with PluginManager expectations', () => {
      // Verify the plugin has the structure that PluginManager expects
      
      // Required plugin properties
      assertExists(SimplePlugin.name, 'Plugin must have name');
      assertExists(SimplePlugin.version, 'Plugin must have version');
      assertExists(SimplePlugin.description, 'Plugin must have description');
      
      // Required arrays (even if empty)
      assert(Array.isArray(SimplePlugin.tools), 'Plugin must have tools array');
      assert(Array.isArray(SimplePlugin.workflows), 'Plugin must have workflows array');
      
      // Optional but recommended properties
      assertExists(SimplePlugin.author, 'Plugin should have author');
      assertExists(SimplePlugin.license, 'Plugin should have license');
      assert(Array.isArray(SimplePlugin.tags), 'Plugin should have tags array');
    });
    
    it('should have tools with PluginManager-compatible structure', () => {
      // Each tool should have the structure that PluginManager can process
      for (const tool of SimplePlugin.tools) {
        // Required tool properties
        assert(typeof tool.name === 'string', 'Tool name must be string');
        assertExists(tool.definition, 'Tool must have definition object');
        assert(typeof tool.handler === 'function', 'Tool must have handler function');
        
        // Tool definition structure
        const def = tool.definition;
        assert(typeof def.title === 'string', 'Definition title must be string');
        assert(typeof def.description === 'string', 'Definition description must be string');
        assertExists(def.inputSchema, 'Definition must have input schema');
        
        // Optional but recommended definition properties
        if (def.category) {
          assert(typeof def.category === 'string', 'Category must be string');
        }
        if (def.tags) {
          assert(Array.isArray(def.tags), 'Tags must be array');
        }
      }
    });
    
    it('should support plugin discovery patterns', () => {
      // Verify the plugin can be discovered and imported correctly
      
      // Plugin should be the default export
      assertExists(SimplePlugin, 'Plugin should be exportable');
      
      // Plugin should have stable identity
      assertEquals(typeof SimplePlugin, 'object', 'Plugin should be an object');
      
      // Plugin metadata should be accessible
      assert(SimplePlugin.name.length > 0, 'Plugin name should not be empty');
      assert(SimplePlugin.version.match(/^\d+\.\d+\.\d+$/), 'Version should be semver format');
    });
  });
});

/**
 * EDUCATIONAL SUMMARY - UPDATED FOR NEW PLUGIN PATTERN
 * =====================================================
 * 
 * This integration test file demonstrates comprehensive testing patterns
 * for the NEW MCP plugin array structure:
 * 
 * 1. 🔍 PLUGIN STRUCTURE VALIDATION:
 *    - Verify plugin metadata and arrays are correctly structured
 *    - Test that tools are properly defined in plugin.tools array
 *    - Validate plugin compatibility with PluginManager expectations
 *    - Check that plugin follows new declarative pattern
 * 
 * 2. 🔧 TOOL INTEGRATION TESTING:
 *    - Test all tools work correctly individually
 *    - Verify cross-tool coordination scenarios
 *    - Test concurrent tool execution
 *    - Validate tool metadata consistency
 * 
 * 3. ⚡ END-TO-END FUNCTIONALITY:
 *    - Test complete workflows using multiple tools
 *    - Verify realistic usage scenarios
 *    - Test parameterized scenarios comprehensively
 *    - Measure and verify performance characteristics
 * 
 * 4. 🚫 ERROR HANDLING AND ROBUSTNESS:
 *    - Test invalid parameter handling
 *    - Verify graceful error recovery
 *    - Test plugin stability under stress
 *    - Validate error propagation patterns
 * 
 * 5. 🔄 COMPATIBILITY TESTING:
 *    - Verify plugin structure meets PluginManager expectations
 *    - Test plugin discovery patterns
 *    - Validate tool structure compatibility
 *    - Check export and import patterns
 * 
 * KEY IMPROVEMENTS WITH NEW PLUGIN PATTERN:
 * =========================================
 * 
 * - ✅ **Simpler Testing**: Direct array access, no registry mocking
 * - ✅ **Clearer Structure**: Declarative plugin definition is easier to test
 * - ✅ **Better Isolation**: Tests focus on functionality, not registration
 * - ✅ **More Reliable**: Less complex setup means fewer test failures
 * - ✅ **Easier Debugging**: Clear plugin structure makes issues obvious
 * 
 * This demonstrates how the new plugin pattern not only simplifies
 * plugin development but also makes testing more straightforward
 * and reliable.
 */