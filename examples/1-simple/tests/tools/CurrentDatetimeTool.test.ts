/**
 * Demonstration Tests for CurrentDatetimeTool
 * 
 * This test file demonstrates key testing patterns for MCP tools:
 * - Plugin structure testing: Verify tools are properly defined in plugin arrays
 * - Parameter validation: Test input validation and error handling  
 * - Execution testing: Test tool logic and response formatting
 * - Context testing: Test user context extraction and logging
 * - Error handling: Test various error scenarios
 * 
 * LEARNING FOCUS:
 * ===============
 * 
 * This test shows users how to:
 * 1. Test the new plugin array pattern (no initialize() method)
 * 2. Mock dependencies and services
 * 3. Test tool definitions and handlers
 * 4. Validate parameter schemas
 * 5. Test successful execution paths
 * 6. Handle and test error conditions
 * 7. Verify response formatting
 * 8. Test metadata and context handling
 * 
 * PATTERNS DEMONSTRATED:
 * =====================
 * 
 * Based on library's CoreTools.test.ts and ToolBase.test.ts:
 * - Plugin array structure testing
 * - Tool definition validation
 * - Parameter validation testing
 * - Error condition simulation
 * - Response structure validation
 * - Metadata verification
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// Import the plugin that contains our tools
import SimplePlugin from '../../src/plugins/SimplePlugin.ts';

// Import test utilities
import { 
  assertValidMcpResponse,
  assertValidJsonResponse,
  generateDateTimeTestParams,
} from '../utils/test-helpers.ts';

/**
 * Current DateTime Tool Tests
 * 
 * These tests demonstrate comprehensive tool testing patterns
 * for the new plugin array structure (no initialize() method).
 */
describe('CurrentDatetimeTool', () => {
  let currentDatetimeTool: any;
  
  beforeEach(() => {
    // Find the current_datetime tool in the plugin's tools array
    currentDatetimeTool = SimplePlugin.tools.find((tool: any) => tool.name === 'current_datetime');
    assertExists(currentDatetimeTool, 'current_datetime tool should exist in plugin tools array');
  });
  
  /**
   * PLUGIN STRUCTURE TESTING
   * 
   * Tests that verify tools are properly defined in the plugin structure.
   * This is essential for the new array-based plugin pattern.
   */
  describe('Plugin Structure', () => {
    it('should have current_datetime tool defined in plugin tools array', () => {
      // Verify plugin has tools array
      assertExists(SimplePlugin.tools, 'Plugin should have tools array');
      assert(Array.isArray(SimplePlugin.tools), 'Plugin tools should be an array');
      
      // Verify current_datetime tool exists
      const tool = SimplePlugin.tools.find((t: any) => t.name === 'current_datetime');
      assertExists(tool, 'current_datetime tool should be in tools array');
    });
    
    it('should have correct tool definition structure', () => {
      // Verify tool has all required properties
      assertEquals(currentDatetimeTool.name, 'current_datetime');
      assertExists(currentDatetimeTool.definition, 'Tool should have definition');
      assertExists(currentDatetimeTool.handler, 'Tool should have handler');
      assert(typeof currentDatetimeTool.handler === 'function', 'Handler should be a function');
      
      // Verify definition structure
      const definition = currentDatetimeTool.definition;
      assertEquals(definition.title, 'Current DateTime');
      assertEquals(definition.category, 'utility');
      assert(definition.tags.includes('datetime'), 'Should have datetime tag');
      assert(definition.tags.includes('utility'), 'Should have utility tag');
      assertExists(definition.inputSchema, 'Should have input schema');
    });
    
    it('should have proper plugin metadata', () => {
      assertEquals(SimplePlugin.name, 'simple-plugin');
      assertEquals(SimplePlugin.version, '1.0.0');
      assert(SimplePlugin.description.length > 0, 'Should have description');
      assert(SimplePlugin.tags?.includes('utility'), 'Should have utility tag');
      assert(SimplePlugin.tags?.includes('beginner'), 'Should have beginner tag');
      
      // Verify arrays structure
      assert(Array.isArray(SimplePlugin.tools), 'Should have tools array');
      assert(Array.isArray(SimplePlugin.workflows), 'Should have workflows array');
      assertEquals(SimplePlugin.workflows.length, 0, 'Simple plugin should have no workflows');
      assertEquals(SimplePlugin.tools.length, 3, 'Should have 3 tools');
    });
  });
  
  /**
   * PARAMETER VALIDATION TESTING
   * 
   * Tests that verify parameter validation works correctly.
   * Essential for ensuring tools handle user input safely.
   */
  describe('Parameter Validation', () => {
    it('should accept valid parameters', async () => {
      const validParams = {
        format: 'iso',
        timezone: 'UTC'
      };
      
      const result = await currentDatetimeTool.handler(validParams);
      
      // Should not throw error and should return valid response
      assertValidMcpResponse(result, 'current_datetime');
      assertEquals(result.isError, undefined); // No error
    });
    
    it('should handle empty parameters (using defaults)', async () => {
      const result = await currentDatetimeTool.handler({});
      
      assertValidMcpResponse(result, 'current_datetime');
      assertEquals(result.isError, undefined);
      
      // Parse the response to verify it contains expected fields
      const responseData = assertValidJsonResponse(result);
      assertExists(responseData.datetime);
      assertExists(responseData.format);
      assertEquals(responseData.format, 'iso'); // Default format
    });
    
    it('should handle invalid format parameter', async () => {
      const invalidParams = {
        format: 'invalid_format' // Not in enum
      };
      
      const result = await currentDatetimeTool.handler(invalidParams);
      
      // Should return error response
      assertEquals(result.isError, true);
      assertExists(result.content);
      assert(result.content[0].text.includes('Error'));
    });
    
    it('should validate timezone parameter', async () => {
      const validTimezone = {
        timezone: 'America/New_York'
      };
      
      const result = await currentDatetimeTool.handler(validTimezone);
      
      assertValidMcpResponse(result, 'current_datetime');
      assertEquals(result.isError, undefined);
      
      // Verify timezone was applied
      const responseData = assertValidJsonResponse(result);
      assertEquals(responseData.timezone, 'America/New_York');
    });
  });
  
  /**
   * EXECUTION TESTING
   * 
   * Tests that verify the core tool functionality works correctly.
   * This includes testing different parameter combinations and output formats.
   */
  describe('Tool Execution', () => {
    it('should return ISO format by default', async () => {
      const result = await currentDatetimeTool.handler({});
      
      const responseData = assertValidJsonResponse(result);
      assertEquals(responseData.format, 'iso');
      assert(responseData.datetime.includes('T')); // ISO format contains T
      assert(responseData.datetime.includes('Z') || responseData.datetime.includes('+')); // Timezone indicator
    });
    
    it('should return human readable format', async () => {
      const result = await currentDatetimeTool.handler({ format: 'human' });
      
      const responseData = assertValidJsonResponse(result);
      assertEquals(responseData.format, 'human');
      // Human format should be more readable (contains spaces, commas, etc.)
      assert(responseData.datetime.includes(' '));
    });
    
    it('should return unix timestamp format', async () => {
      const result = await currentDatetimeTool.handler({ format: 'unix' });
      
      const responseData = assertValidJsonResponse(result);
      assertEquals(responseData.format, 'unix');
      
      // Unix timestamp should be a string of digits
      assert(/^\d+$/.test(responseData.datetime));
      
      // Should also include unix_timestamp field for comparison
      assertEquals(responseData.datetime, responseData.unix_timestamp.toString());
    });
    
    it('should include consistent metadata in response', async () => {
      const result = await currentDatetimeTool.handler({ format: 'iso' });
      
      // Verify response structure
      assertExists(result.metadata);
      assertEquals(result.metadata.tool, 'current_datetime');
      assertEquals(result.metadata.format, 'iso');
      assertEquals(result.metadata.timezone, 'local');
      
      // Verify response data structure
      const responseData = assertValidJsonResponse(result);
      assertExists(responseData.metadata);
      assertEquals(responseData.metadata.tool, 'current_datetime');
      assertExists(responseData.metadata.generated_at);
    });
    
    it('should handle timezone parameter correctly', async () => {
      const utcResult = await currentDatetimeTool.handler({ timezone: 'UTC' });
      const nyResult = await currentDatetimeTool.handler({ timezone: 'America/New_York' });
      
      const utcData = assertValidJsonResponse(utcResult);
      const nyData = assertValidJsonResponse(nyResult);
      
      assertEquals(utcData.timezone, 'UTC');
      assertEquals(nyData.timezone, 'America/New_York');
      
      // Verify metadata reflects timezone choice
      assertEquals(utcResult.metadata.timezone, 'UTC');
      assertEquals(nyResult.metadata.timezone, 'America/New_York');
    });
  });
  
  /**
   * PARAMETERIZED TESTING
   * 
   * Tests using generated test data to cover multiple scenarios.
   */
  describe('Parameterized Testing', () => {
    it('should handle all datetime format scenarios', async () => {
      const testParams = generateDateTimeTestParams();
      
      for (const scenario of testParams) {
        const result = await currentDatetimeTool.handler(scenario.params);
        
        assertValidMcpResponse(result, 'current_datetime');
        assertEquals(result.isError, undefined, `Scenario '${scenario.name}' should not error`);
        
        const data = assertValidJsonResponse(result);
        assertEquals(data.format, scenario.expectedFormat, 
          `Scenario '${scenario.name}' should return ${scenario.expectedFormat} format`);
      }
    });
  });
  
  /**
   * ERROR HANDLING TESTING
   * 
   * Tests that verify tools handle error conditions gracefully.
   * Critical for robust, production-ready tools.
   */
  describe('Error Handling', () => {
    it('should handle invalid timezone gracefully', async () => {
      // Note: The current implementation is simplified for educational purposes
      // A production implementation would validate timezones more thoroughly
      const result = await currentDatetimeTool.handler({ timezone: 'Invalid/Timezone' });
      
      // Should still return a result (simplified implementation)
      // In production, you might want to validate timezones and return errors
      assertExists(result);
    });
    
    it('should handle custom format parameter', async () => {
      const result = await currentDatetimeTool.handler({ 
        format: 'custom',
        customFormat: 'YYYY-MM-DD'
      });
      
      assertExists(result);
      assertEquals(result.isError, undefined);
      
      const responseData = assertValidJsonResponse(result);
      assertEquals(responseData.format, 'custom');
    });
    
    it('should return error response for invalid enum values', async () => {
      const result = await currentDatetimeTool.handler({ format: 'invalid' });
      
      // Should return error response
      assertEquals(result.isError, true);
      assertExists(result.content);
      assert(result.content[0].text.includes('Error'));
      assertEquals(result.metadata.error, true);
    });
  });
  
  /**
   * RESPONSE FORMATTING TESTING
   * 
   * Tests that verify response format compliance with MCP protocol.
   * Essential for compatibility with MCP clients.
   */
  describe('Response Formatting', () => {
    it('should return properly formatted MCP response', async () => {
      const result = await currentDatetimeTool.handler({});
      
      // Verify MCP response structure
      assertValidMcpResponse(result, 'current_datetime');
      
      // Verify content is valid JSON
      const responseData = assertValidJsonResponse(result);
      assertExists(responseData);
    });
    
    it('should include execution metadata', async () => {
      const result = await currentDatetimeTool.handler({ format: 'human', timezone: 'UTC' });
      
      // Verify metadata completeness
      assertEquals(result.metadata.tool, 'current_datetime');
      assertEquals(result.metadata.format, 'human');
      assertEquals(result.metadata.timezone, 'UTC');
      
      // Verify embedded metadata in response
      const responseData = assertValidJsonResponse(result);
      assertExists(responseData.metadata);
      assertEquals(responseData.metadata.tool, 'current_datetime');
      assertExists(responseData.metadata.generated_at);
    });
    
    it('should format error responses consistently', async () => {
      const result = await currentDatetimeTool.handler({ format: 'invalid' });
      
      assertEquals(result.isError, true);
      assertExists(result.content);
      assertEquals(result.content[0].type, 'text');
      assertExists(result.metadata);
      assertEquals(result.metadata.error, true);
    });
  });
  
  /**
   * CONCURRENT EXECUTION TESTING
   * 
   * Tests that verify tools work correctly under concurrent load.
   */
  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent calls', async () => {
      // Execute multiple calls with different parameters concurrently
      const calls = [
        currentDatetimeTool.handler({ format: 'iso' }),
        currentDatetimeTool.handler({ format: 'human' }),
        currentDatetimeTool.handler({ format: 'unix' }),
        currentDatetimeTool.handler({ timezone: 'UTC' }),
        currentDatetimeTool.handler({ timezone: 'America/New_York' }),
      ];
      
      const results = await Promise.all(calls);
      
      // All calls should succeed
      assertEquals(results.length, 5);
      results.forEach((result, index) => {
        assertValidMcpResponse(result, 'current_datetime');
        assertEquals(result.isError, undefined, `Call ${index} should not error`);
      });
      
      // Verify different formats were returned
      const formats = results.map(r => {
        const data = JSON.parse(r.content[0].text);
        return data.format;
      });
      
      assert(formats.includes('iso'));
      assert(formats.includes('human'));
      assert(formats.includes('unix'));
    });
  });
});

/**
 * EDUCATIONAL SUMMARY - UPDATED FOR NEW PLUGIN PATTERN
 * =====================================================
 * 
 * This test file demonstrates comprehensive testing patterns for the NEW
 * plugin array structure (no initialize() method):
 * 
 * 1. 🔍 PLUGIN STRUCTURE TESTING:
 *    - Verify tools are defined in plugin.tools array
 *    - Check tool definition structure and metadata
 *    - Validate plugin metadata and arrays
 *    - Test the new declarative plugin pattern
 * 
 * 2. ✅ PARAMETER VALIDATION:
 *    - Test valid parameter combinations
 *    - Test invalid parameters and error handling
 *    - Verify default value behavior
 *    - Test edge cases and boundary conditions
 * 
 * 3. ⚙️ EXECUTION TESTING:
 *    - Test core tool functionality
 *    - Verify output formats and data structures
 *    - Test different parameter combinations
 *    - Validate metadata and response structure
 * 
 * 4. 🚫 ERROR HANDLING:
 *    - Test error conditions and recovery
 *    - Verify error response formatting
 *    - Test graceful degradation
 *    - Validate error metadata
 * 
 * 5. 📜 RESPONSE FORMATTING:
 *    - Ensure MCP protocol compliance
 *    - Test response structure and content
 *    - Verify metadata completeness
 *    - Test different content types
 * 
 * 6. 🚀 CONCURRENT TESTING:
 *    - Test concurrent execution scenarios
 *    - Verify tool behavior under load
 *    - Test multiple simultaneous calls
 *    - Validate thread safety
 * 
 * KEY CHANGES FOR NEW PLUGIN PATTERN:
 * ===================================
 * 
 * - ❌ REMOVED: Tests for initialize() method
 * - ✅ ADDED: Tests for plugin.tools array structure
 * - ✅ UPDATED: Direct access to tools via array lookup
 * - ✅ SIMPLIFIED: No registry mocking needed
 * - ✅ CLEANER: Tests focus on tool functionality, not registration
 * 
 * This demonstrates how the new plugin pattern makes testing
 * simpler and more focused on actual tool behavior rather
 * than registration mechanics.
 */