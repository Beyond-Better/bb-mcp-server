/**
 * Tests for InstructionsLoader utility
 */

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import {
  getInstructionsLoadingSummary,
  loadInstructions,
  validateInstructions,
} from '../../../src/lib/utils/InstructionsLoader.ts';
import { createMockLogger } from '../../utils/test-helpers.ts';

Deno.test('InstructionsLoader', async (t) => {
  const logger = createMockLogger();

  await t.step('should load instructions from config string (highest priority)', async () => {
    const configInstructions = 'MCP Server instructions from configuration';

    const result = await loadInstructions({
      logger,
      instructionsContent: configInstructions,
      instructionsFilePath: './non-existent-file.md', // Should be ignored
    });

    assertEquals(result, configInstructions);
  });

  await t.step('should load instructions from file path when no config', async () => {
    // Create temporary test file
    const testContent =
      '# Test Instructions\n\nThis is a test MCP Server with workflow capabilities.';
    const testFile = './test-instructions-temp.md';

    try {
      await Deno.writeTextFile(testFile, testContent);

      const result = await loadInstructions({
        logger,
        instructionsFilePath: testFile,
      });

      assertEquals(result, testContent);
    } finally {
      // Clean up
      try {
        await Deno.remove(testFile);
      } catch {
        // File might not exist, ignore
      }
    }
  });

  await t.step(
    'should load instructions from default file when no config or file path',
    async () => {
      const testContent = '# Default Instructions\n\nThis MCP Server provides workflow automation.';
      const defaultFile = './mcp_server_instructions.md';

      try {
        await Deno.writeTextFile(defaultFile, testContent);

        const result = await loadInstructions({
          logger,
          // No config or file path provided
        });

        assertEquals(result, testContent);
      } finally {
        // Clean up
        try {
          await Deno.remove(defaultFile);
        } catch {
          // File might not exist, ignore
        }
      }
    },
  );

  await t.step('should use embedded fallback when no other sources available', async () => {
    const result = await loadInstructions({
      logger,
      // No config, file path, or default file
    });

    // Should use embedded fallback instructions
    assertStringIncludes(result, 'MCP Server');
    assertStringIncludes(result, 'workflow');
    assertEquals(result.length > 1000, true, 'Embedded instructions should be substantial');
  });

  await t.step('should handle file read errors gracefully', async () => {
    const result = await loadInstructions({
      logger,
      instructionsFilePath: './non-existent-file.md',
    });

    // Should fall back to embedded instructions
    assertStringIncludes(result, 'MCP Server');
  });

  await t.step('should trim whitespace from loaded content', async () => {
    const configWithWhitespace = '\n\n  MCP Server instructions  \n\n';

    const result = await loadInstructions({
      logger,
      instructionsContent: configWithWhitespace,
    });

    assertEquals(result, 'MCP Server instructions');
  });

  await t.step('should handle empty config gracefully', async () => {
    const result = await loadInstructions({
      logger,
      instructionsContent: '   ', // Only whitespace
    });

    // Should fall back to embedded instructions
    assertStringIncludes(result, 'MCP Server');
  });
});

Deno.test('validateInstructions', async (t) => {
  const logger = createMockLogger();

  await t.step('should validate valid workflow instructions', () => {
    const validInstructions =
      'This MCP Server provides comprehensive LLM tool and workflow automation capabilities with detailed instructions.';

    const result = validateInstructions(validInstructions, logger);
    assertEquals(result, true);
  });

  await t.step('should validate valid MCP Server instructions', () => {
    const validInstructions =
      'Welcome to this MCP Server that provides various tools and capabilities for integration with custom solutions.';

    const result = validateInstructions(validInstructions, logger);
    assertEquals(result, true);
  });

  await t.step('should reject too short instructions', () => {
    const shortInstructions = 'Short';

    const result = validateInstructions(shortInstructions, logger);
    assertEquals(result, false);
  });

  await t.step('should reject instructions without key content', () => {
    const invalidInstructions =
      'This is a long text that does not mention the required terms. It has sufficient length but lacks the necessary content indicators that would make it valid for our purposes.';

    const result = validateInstructions(invalidInstructions, logger);
    assertEquals(result, false);
  });

  await t.step('should work without logger', () => {
    const validInstructions =
      'This MCP Server provides workflow capabilities and comprehensive instructions for custom client solutions.';

    const result = validateInstructions(validInstructions);
    assertEquals(result, true);
  });
});

Deno.test('getInstructionsLoadingSummary', async (t) => {
  const logger = createMockLogger();

  await t.step('should return correct summary information', () => {
    const summary = getInstructionsLoadingSummary({
      logger,
      instructionsContent: 'Test config',
      instructionsFilePath: './custom/path.md',
      defaultFileName: 'custom_instructions.md',
      basePath: '/custom/base',
    });

    assertEquals(summary.hasConfigString, true);
    assertEquals(summary.hasFilePath, true);
    assertEquals(summary.defaultFileName, 'custom_instructions.md');
    assertEquals(summary.basePath, '/custom/base');
    assertEquals(summary.hasEmbeddedFallback, true);
    assertEquals(Array.isArray(summary.strategies), true);
    assertEquals(summary.strategies.length > 0, true);
  });

  await t.step('should handle empty options', () => {
    const summary = getInstructionsLoadingSummary({
      logger,
    });

    assertEquals(summary.hasConfigString, false);
    assertEquals(summary.hasFilePath, false);
    assertEquals(summary.defaultFileName, 'mcp_server_instructions.md');
    assertEquals(typeof summary.basePath, 'string');
    assertEquals(summary.hasEmbeddedFallback, true);
    assertEquals(Array.isArray(summary.strategies), true);
  });

  await t.step('should handle whitespace-only config', () => {
    const summary = getInstructionsLoadingSummary({
      logger,
      instructionsContent: '   ', // Only whitespace
    });

    assertEquals(summary.hasConfigString, false);
  });
});
