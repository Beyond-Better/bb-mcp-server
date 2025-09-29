/**
 * Instructions Loading Example
 * 
 * Demonstrates the new flexible instructions loading system in bb-mcp-server.
 * Shows all the different ways instructions can be loaded and their priority.
 */

import { loadInstructions, validateInstructions, getInstructionsLoadingSummary, type InstructionsLoadingSummary } from '../src/lib/utils/InstructionsLoader.ts';
import { Logger } from '../src/lib/utils/Logger.ts';

// Create a logger for the example
const logger = new Logger({ level: 'debug', format: 'text' });

/**
 * Demonstrate instructions loading with different configurations
 */
async function demonstrateInstructionsLoading() {
  console.log('=== Instructions Loading System Demo ===\n');

  // Strategy 1: Direct configuration string (highest priority)
  console.log('1. Testing direct configuration string:');
  const directConfig = await loadInstructions({
    logger,
    instructionsConfig: 'Direct instructions from MCP_SERVER_INSTRUCTIONS environment variable.',
  });
  console.log(`   Result: ${directConfig.substring(0, 50)}...`);
  console.log(`   Valid: ${validateInstructions(directConfig, logger)}\n`);

  // Strategy 2: File path loading
  console.log('2. Testing file path loading:');
  try {
    // Create a temporary instructions file
    await Deno.writeTextFile('./temp_instructions.md', '# Temporary Instructions\n\nThis is a test file for the MCP_INSTRUCTIONS_FILE option.');
    
    const fileInstructions = await loadInstructions({
      logger,
      instructionsFilePath: './temp_instructions.md',
    });
    console.log(`   Result: ${fileInstructions.substring(0, 50)}...`);
    console.log(`   Valid: ${validateInstructions(fileInstructions, logger)}`);
    
    // Clean up
    await Deno.remove('./temp_instructions.md');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();

  // Strategy 3: Default file loading
  console.log('3. Testing default file loading:');
  try {
    // Create a default instructions file
    await Deno.writeTextFile('./mcp_server_instructions.md', '# Default MCP Server Instructions\n\nThese instructions are loaded from the default file path.');
    
    const defaultFileInstructions = await loadInstructions({
      logger,
      // No config or file path provided - should find default file
    });
    console.log(`   Result: ${defaultFileInstructions.substring(0, 50)}...`);
    console.log(`   Valid: ${validateInstructions(defaultFileInstructions, logger)}`);
    
    // Clean up
    await Deno.remove('./mcp_server_instructions.md');
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();

  // Strategy 4: Fallback to embedded instructions
  console.log('4. Testing embedded fallback instructions:');
  const fallbackInstructions = await loadInstructions({
    logger,
    // No config, file path, or default file - should use embedded fallback
  });
  console.log(`   Result: ${fallbackInstructions.substring(0, 50)}...`);
  console.log(`   Valid: ${validateInstructions(fallbackInstructions, logger)}`);
  console.log(`   Length: ${fallbackInstructions.length} characters\n`);

  // Show loading strategy summary
  console.log('5. Loading strategy summary:');
  const summary: InstructionsLoadingSummary = getInstructionsLoadingSummary({
    logger,
    instructionsConfig: 'Test config',
    instructionsFilePath: './custom/path.md',
    defaultFileName: 'mcp_server_instructions.md',
  });
  console.log('   Configuration:');
  console.log(`   - Has config string: ${summary.hasConfigString}`);
  console.log(`   - Has file path: ${summary.hasFilePath}`);
  console.log(`   - Default file name: ${summary.defaultFileName}`);
  console.log(`   - Base path: ${summary.basePath}`);
  console.log(`   - Has embedded fallback: ${summary.hasEmbeddedFallback}`);
  console.log(`   - Available strategies: ${summary.strategies.join(', ')}\n`);

  console.log('=== Instructions Loading Demo Complete ===\n');

  // Environment variable guidance
  console.log('Environment Variables:');
  console.log('- MCP_SERVER_INSTRUCTIONS: Direct instructions content (highest priority)');
  console.log('- MCP_INSTRUCTIONS_FILE: Path to instructions file (second priority)');
  console.log('- Default file: mcp_server_instructions.md in project root (third priority)');
  console.log('- Embedded fallback: Built-in generic instructions (final fallback)');
}

/**
 * Demonstrate validation edge cases
 */
async function demonstrateValidation() {
  console.log('\n=== Instructions Validation Demo ===\n');

  const testCases = [
    { name: 'Valid workflow instructions', content: 'MCP Server with workflow capabilities. This is a comprehensive set of instructions.' },
    { name: 'Too short', content: 'Short' },
    { name: 'No MCP or workflow content', content: 'This is a long text that does not mention the key terms we are looking for. It has enough length but lacks the required content indicators that make it valid.' },
    { name: 'Has MCP Server', content: 'This MCP Server provides comprehensive functionality with detailed instructions and examples for users.' },
    { name: 'Has workflow', content: 'This system provides workflow automation capabilities with comprehensive instructions and validation.' },
  ];

  for (const testCase of testCases) {
    const isValid = validateInstructions(testCase.content, logger);
    console.log(`${testCase.name}: ${isValid ? '✅ Valid' : '❌ Invalid'} (${testCase.content.length} chars)`);
  }

  console.log('\n=== Validation Demo Complete ===');
}

// Run the demonstrations
if (import.meta.main) {
  try {
    await demonstrateInstructionsLoading();
    await demonstrateValidation();
  } catch (error) {
    console.error('Demo failed:', error);
    Deno.exit(1);
  }
}