/**
 * File Management Workflow Test Suite
 *
 * Tests the complete file management lifecycle workflow including:
 * - Parameter validation for file operations
 * - Multi-step execution (create → validate → process → archive)
 * - File type detection and validation rules
 * - Content processing and sanitization
 * - Metadata tracking and archival processes
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { type Spy, spy } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import WorkflowPlugin from '../../src/plugins/WorkflowPlugin.ts';
import { createMockLogger, createTestContext } from '../utils/test-helpers.ts';
import type { WorkflowContext } from '@beyondbetter/bb-mcp-server';

// Extract the FileManagementWorkflow class for direct testing
const fileManagementWorkflow = WorkflowPlugin.workflows?.find(
  (workflow) => workflow.name === 'file_management_lifecycle',
);

describe('FileManagementWorkflow', () => {
  let workflow: any;
  let context: WorkflowContext;
  let logSpy: Spy;
  let mockLogger: any;

  beforeEach(() => {
    assertExists(fileManagementWorkflow, 'FileManagementWorkflow should be found in plugin');
    workflow = fileManagementWorkflow;

    mockLogger = createMockLogger();
    logSpy = spy(mockLogger, 'info');

    context = createTestContext({
      logger: mockLogger,
    });
  });

  afterEach(() => {
    logSpy.restore();
  });

  describe('Workflow Registration', () => {
    it('should have correct workflow metadata', () => {
      assertEquals(workflow.name, 'file_management_lifecycle');
      assertEquals(workflow.version, '1.0.0');
      assertEquals(workflow.category, 'utility');
      assertEquals(workflow.requiresAuth, false);
      assertEquals(workflow.estimatedDuration, 20);
      assert(Array.isArray(workflow.tags));
      assert(workflow.tags.includes('files'));
      assert(workflow.tags.includes('lifecycle'));
      assert(workflow.tags.includes('management'));
    });

    it('should return proper registration info', () => {
      const registration = workflow.getRegistration();

      assertEquals(registration.name, 'file_management_lifecycle');
      assertEquals(registration.displayName, 'File Management Lifecycle');
      assertEquals(registration.version, '1.0.0');
      assertEquals(registration.category, 'utility');
      assertEquals(registration.author, 'Beyond MCP Server Examples');
      assertEquals(registration.license, 'MIT');
      assertExists(registration.parameterSchema);
    });

    it('should provide comprehensive workflow overview', () => {
      const overview = workflow.getOverview();

      assert(overview.includes('Complete file lifecycle management'));
      assert(overview.includes('1. Creates a file'));
      assert(overview.includes('2. Validates content'));
      assert(overview.includes('3. Processes content'));
      assert(overview.includes('4. Archives the final result'));
      assert(overview.includes('Demonstrates state management'));
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters successfully', async () => {
      const validParams = {
        userId: 'test-user',
        fileName: 'test.json',
        content: '{"test": true}',
        validationRules: ['not_empty', 'valid_json'],
        processingOptions: {
          format: 'pretty',
          addMetadata: true,
          sanitize: false,
        },
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      assertExists(result.data);
      assertEquals(result.data.userId, 'test-user');
      assertEquals(result.data.fileName, 'test.json');
    });

    it('should fail validation with missing required fields', async () => {
      const invalidParams = {
        userId: 'test-user',
        // Missing fileName and content
        validationRules: ['not_empty'],
        processingOptions: { format: 'pretty' },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(Array.isArray(result.errors));
      assert(result.errors.length > 0);
      assert(result.errors.some((err: any) => err.path.includes('fileName')));
      assert(result.errors.some((err: any) => err.path.includes('content')));
    });

    it('should validate validation rules enum values', async () => {
      const invalidParams = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'test content',
        validationRules: ['invalid_rule'], // Invalid enum value
        processingOptions: { format: 'pretty' },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('validationRules')));
    });

    it('should validate processing options', async () => {
      const invalidParams = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'test content',
        validationRules: ['not_empty'],
        processingOptions: {
          format: 'invalid_format', // Invalid enum value
          addMetadata: 'not_boolean', // Invalid type
        },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('processingOptions')));
    });

    it('should apply default values correctly', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'test content',
        validationRules: ['not_empty'],
        // Missing processingOptions - should use defaults
      };

      const result = await workflow.validateParameters(params);
      assertEquals(result.valid, true);
      assertEquals(result.data.processingOptions.format, 'pretty');
      assertEquals(result.data.processingOptions.addMetadata, true);
      assertEquals(result.data.processingOptions.sanitize, true);
      assertEquals(result.data.dryRun, false);
    });
  });

  describe('File Type Detection', () => {
    it('should execute complete lifecycle successfully', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'config.json',
        content: '{"debug": true, "port": 3000}',
        validationRules: ['not_empty', 'valid_json'],
        processingOptions: {
          format: 'pretty',
          addMetadata: true,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.failed_steps.length, 0);
      assertExists(result.data);
      assertExists(result.data.file_info);
      assertExists(result.data.final_content);
      assertExists(result.data.archive_info);

      // Check file type detection
      assertEquals(result.data.file_info.type, 'application/json');

      // Check that JSON was prettified
      assert(result.data.final_content.includes('\n  '));
    });

    it('should detect various file types correctly', async () => {
      const testCases = [
        { fileName: 'test.json', expectedType: 'application/json' },
        { fileName: 'test.txt', expectedType: 'text/plain' },
        { fileName: 'test.md', expectedType: 'text/markdown' },
        { fileName: 'test.html', expectedType: 'text/html' },
        { fileName: 'test.js', expectedType: 'application/javascript' },
        { fileName: 'test.ts', expectedType: 'application/typescript' },
        { fileName: 'test.css', expectedType: 'text/css' },
        { fileName: 'test.unknown', expectedType: 'application/octet-stream' },
      ];

      for (const testCase of testCases) {
        const params = {
          userId: 'test-user',
          fileName: testCase.fileName,
          content: 'test content',
          validationRules: ['not_empty'],
          processingOptions: { format: 'normalize' },
        };

        const result = await workflow.executeWithValidation(params, context);
        assertEquals(result.success, true);
        assertEquals(result.data.file_info.type, testCase.expectedType);
      }
    });
  });

  describe('Validation Rules', () => {
    it('should pass not_empty validation with valid content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'valid content',
        validationRules: ['not_empty'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const validationResults = result.data.validation_results;
      const notEmptyResult = validationResults.find((r: any) => r.rule === 'not_empty');
      assertExists(notEmptyResult);
      assertEquals(notEmptyResult.success, true);
    });

    it('should fail not_empty validation with empty content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: '', // Empty content
        validationRules: ['not_empty'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);

      // Workflow continues even with validation failures
      assert(result.failed_steps.some((step: any) =>
        step.operation === 'validate_not_empty' &&
        step.message.includes('cannot be empty')
      ));
    });

    it('should pass valid_json validation with valid JSON', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.json',
        content: '{"valid": "json", "number": 42}',
        validationRules: ['valid_json'],
        processingOptions: { format: 'pretty' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const validationResults = result.data.validation_results;
      const jsonResult = validationResults.find((r: any) => r.rule === 'valid_json');
      assertExists(jsonResult);
      assertEquals(jsonResult.success, true);
    });

    it('should fail valid_json validation with invalid JSON', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.json',
        content: '{invalid json}', // Invalid JSON
        validationRules: ['valid_json'],
        processingOptions: { format: 'pretty' },
      };

      const result = await workflow.executeWithValidation(params, context);

      assert(result.failed_steps.some((step: any) =>
        step.operation === 'validate_valid_json' &&
        step.message.includes('not valid JSON')
      ));
    });

    it('should pass max_size validation with small content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'small content',
        validationRules: ['max_size'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const validationResults = result.data.validation_results;
      const sizeResult = validationResults.find((r: any) => r.rule === 'max_size');
      assertExists(sizeResult);
      assertEquals(sizeResult.success, true);
    });

    it('should pass no_scripts validation with safe content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.html',
        content: '<div>Safe HTML content</div>',
        validationRules: ['no_scripts'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const validationResults = result.data.validation_results;
      const scriptResult = validationResults.find((r: any) => r.rule === 'no_scripts');
      assertExists(scriptResult);
      assertEquals(scriptResult.success, true);
    });

    it('should fail no_scripts validation with unsafe content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.html',
        content: '<script>alert("xss")</script>', // Unsafe script
        validationRules: ['no_scripts'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);

      assert(result.failed_steps.some((step: any) =>
        step.operation === 'validate_no_scripts' &&
        step.message.includes('unsafe scripts')
      ));
    });

    it('should handle multiple validation rules', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'config.json',
        content: '{"config": "value"}',
        validationRules: ['not_empty', 'valid_json', 'max_size', 'no_scripts'],
        processingOptions: { format: 'pretty' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      // Should have validation results for all rules
      const validationResults = result.data.validation_results;
      assertEquals(validationResults.length, 4);

      const rules = validationResults.map((r: any) => r.rule);
      assert(rules.includes('not_empty'));
      assert(rules.includes('valid_json'));
      assert(rules.includes('max_size'));
      assert(rules.includes('no_scripts'));
    });
  });

  describe('Content Processing', () => {
    it('should prettify JSON content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'config.json',
        content: '{"compact":true,"value":42}',
        validationRules: ['valid_json'],
        processingOptions: {
          format: 'pretty',
          addMetadata: false,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.final_content;
      assert(finalContent.includes('\n'));
      assert(finalContent.includes('  "compact": true'));
      assert(finalContent.includes('  "value": 42'));
    });

    it('should minify JSON content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'config.json',
        content: '{\n  "formatted": true,\n  "value": 42\n}',
        validationRules: ['valid_json'],
        processingOptions: {
          format: 'minify',
          addMetadata: false,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.final_content;
      assertEquals(finalContent, '{"formatted":true,"value":42}');
    });

    it('should normalize text content', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'line1\r\nline2\tindented\nline3',
        validationRules: ['not_empty'],
        processingOptions: {
          format: 'normalize',
          addMetadata: false,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.final_content;
      assertEquals(finalContent, 'line1\nline2  indented\nline3');
    });

    it('should add metadata when requested', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.json',
        content: '{"data": true}',
        validationRules: ['valid_json'],
        processingOptions: {
          format: 'pretty',
          addMetadata: true,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.final_content;
      assert(finalContent.includes('_metadata'));
      assert(finalContent.includes('processed_at'));
      assert(finalContent.includes('original_size'));
      assert(finalContent.includes('format_applied'));
    });

    it('should sanitize content when requested', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.html',
        content: '<div>Test & "quotes" \'single\' content</div>',
        validationRules: ['not_empty'],
        processingOptions: {
          format: 'normalize',
          addMetadata: false,
          sanitize: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.final_content;
      assert(finalContent.includes('&lt;div&gt;'));
      assert(finalContent.includes('&quot;quotes&quot;'));
      assert(finalContent.includes('&#x27;single&#x27;'));
    });
  });

  describe('Archive and Metadata', () => {
    it('should create comprehensive archive information', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'important.json',
        content: '{"important": "data"}',
        validationRules: ['not_empty', 'valid_json'],
        processingOptions: {
          format: 'pretty',
          addMetadata: true,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const archiveInfo = result.data.archive_info;
      assertExists(archiveInfo);
      assertExists(archiveInfo.original_file);
      assertExists(archiveInfo.processed_file);
      assertExists(archiveInfo.validation_results);
      assertExists(archiveInfo.archive_location);
      assertExists(archiveInfo.archive_created_at);

      // Check original file info
      assertEquals(archiveInfo.original_file.name, 'important.json');
      assertEquals(archiveInfo.original_file.created_by, 'test-user');

      // Check processed file info
      assertEquals(archiveInfo.processed_file.name, 'important.json.processed');
      assertExists(archiveInfo.processed_file.processed_at);

      // Check validation results are included
      assertEquals(archiveInfo.validation_results.length, 2);
    });

    it('should track workflow metadata correctly', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'test content',
        validationRules: ['not_empty', 'max_size'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      assertExists(result.metadata);
      assertEquals(result.metadata.workflow, 'file_management');
      assertEquals(result.metadata.file_name, 'test.txt');
      assertEquals(result.metadata.validations_passed, 2);
      assertEquals(result.metadata.validations_failed, 0);
      assertEquals(result.metadata.processing_completed, true);
      assertEquals(result.metadata.archived, true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle empty filename error', async () => {
      const params = {
        userId: 'test-user',
        fileName: '', // Empty filename
        content: 'test content',
        validationRules: ['not_empty'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, false);

      assert(result.failed_steps.some((step: any) =>
        step.operation === 'parameter_validation' &&
        step.message.includes('String must contain at least 1 character(s)')
      ));
    });

    it('should continue processing despite validation failures', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.json',
        content: '{invalid json}', // Will fail JSON validation
        validationRules: ['valid_json', 'not_empty'], // not_empty should still pass
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);

      // Should have some failed steps but continue processing
      assert(result.failed_steps.length > 0);
      assert(result.completed_steps.length > 0);

      // Should still have file creation and processing steps
      assert(result.completed_steps.some((step: any) => step.operation === 'create_file'));
      assert(result.completed_steps.some((step: any) => step.operation === 'process_content'));
      assert(result.completed_steps.some((step: any) => step.operation === 'archive_file'));
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track execution timing', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'test content',
        validationRules: ['not_empty'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      assert(typeof result.duration === 'number');
      assert(result.duration > 0);

      // Each step should have timing information
      result.completed_steps.forEach((step: any) => {
        assert(typeof step.duration_ms === 'number');
        assert(step.duration_ms >= 0);
        assertExists(step.timestamp);
      });
    });

    it('should log workflow progress', async () => {
      const params = {
        userId: 'test-user',
        fileName: 'test.txt',
        content: 'test content',
        validationRules: ['not_empty'],
        processingOptions: { format: 'normalize' },
      };

      await workflow.executeWithValidation(params, context);

      const logCalls = logSpy.calls;
      assert(logCalls.length > 0);

      // Should log lifecycle start
      assert(logCalls.some((call) => call.args[0].includes('Starting file management lifecycle')));

      // Should log individual steps
      assert(logCalls.some((call) => call.args[0].includes('Creating file with initial content')));
    });
  });
});
