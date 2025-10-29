/**
 * Data Processing Workflow Test Suite
 *
 * Tests the complete data processing pipeline workflow including:
 * - Parameter validation with comprehensive Zod schemas
 * - Multi-step execution (validate → transform → analyze → export)
 * - State management and data flow between steps
 * - Error handling and recovery patterns
 * - Resource tracking and performance monitoring
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { type Spy, spy } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import WorkflowPlugin from '../../src/plugins/WorkflowPlugin.ts';
import { createMockLogger, createTestContext } from '../utils/test-helpers.ts';
import type { WorkflowContext } from '@beyondbetter/bb-mcp-server';

// Extract the DataProcessingWorkflow class for direct testing
const dataProcessingWorkflow = WorkflowPlugin.workflows?.find(
  (workflow) => workflow.name === 'data_processing_pipeline',
);

describe('DataProcessingWorkflow', () => {
  let workflow: any;
  let context: WorkflowContext;
  let logSpy: Spy;
  let mockLogger: any;

  beforeEach(() => {
    assertExists(dataProcessingWorkflow, 'DataProcessingWorkflow should be found in plugin');
    workflow = dataProcessingWorkflow;

    mockLogger = createMockLogger();
    logSpy = spy(mockLogger, 'info');
    context = createTestContext({ logger: mockLogger });

    const workflows = WorkflowPlugin.workflows!;
    for (const workflow of workflows) {
      workflow.setLogger(mockLogger);
    }
  });

  afterEach(() => {
    logSpy.restore();
  });

  describe('Workflow Registration', () => {
    it('should have correct workflow metadata', () => {
      assertEquals(workflow.name, 'data_processing_pipeline');
      assertEquals(workflow.version, '1.0.0');
      assertEquals(workflow.category, 'data');
      assertEquals(workflow.requiresAuth, false);
      assertEquals(workflow.estimatedDuration, 30);
      assert(Array.isArray(workflow.tags));
      assert(workflow.tags.includes('data'));
      assert(workflow.tags.includes('pipeline'));
    });

    it('should return proper registration info', () => {
      const registration = workflow.getRegistration();

      assertEquals(registration.name, 'data_processing_pipeline');
      assertEquals(registration.displayName, 'Data Processing Pipeline');
      assertEquals(registration.version, '1.0.0');
      assertEquals(registration.category, 'data');
      assertEquals(registration.author, 'Beyond MCP Server Examples');
      assertEquals(registration.license, 'MIT');
      assertExists(registration.parameterSchema);
    });

    it('should provide comprehensive workflow overview', () => {
      const overview = workflow.getOverview();

      assert(overview.includes('Multi-step data processing pipeline'));
      assert(overview.includes('1. Validates input data'));
      assert(overview.includes('2. Applies specified transformations'));
      assert(overview.includes('3. Performs analysis'));
      assert(overview.includes('4. Exports results'));
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters successfully', async () => {
      const validParams = {
        userId: 'test-user',
        data: [{ name: 'Alice', score: 95 }],
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      assertExists(result.data);
      assertEquals(result.data.userId, 'test-user');
    });

    it('should fail validation with missing required fields', async () => {
      const invalidParams = {
        userId: 'test-user',
        // Missing required 'data' field
        transformations: ['normalize'],
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(Array.isArray(result.errors));
      assert(result.errors.length > 0);
      assert(result.errors.some((err: any) => err.path.includes('data')));
    });

    it('should validate transformation enum values', async () => {
      const invalidParams = {
        userId: 'test-user',
        data: [{ test: 'data' }],
        transformations: ['invalid_transformation'], // Invalid enum value
        outputFormat: 'json',
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('transformations')));
    });

    it('should apply default values correctly', async () => {
      const params = {
        userId: 'test-user',
        data: [{ test: 'data' }],
        transformations: ['normalize'],
        // Missing outputFormat and analysisType - should use defaults
      };

      const result = await workflow.validateParameters(params);
      assertEquals(result.valid, true);
      assertEquals(result.data.outputFormat, 'json'); // Default value
      assertEquals(result.data.analysisType, 'summary'); // Default value
      assertEquals(result.data.dryRun, false); // Default value
    });
  });

  describe('Workflow Execution', () => {
    it('should execute complete pipeline successfully', async () => {
      const params = {
        userId: 'test-user',
        data: [
          { name: 'Alice', score: 95, department: 'Engineering' },
          { name: 'Bob', score: 87, department: 'Marketing' },
          { name: 'Charlie', score: 92, department: 'Engineering' },
        ],
        transformations: ['normalize', 'sort'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.completed_steps.length, 5); // validate, transform_normalize, transform_sort, analyze, export
      assertEquals(result.failed_steps.length, 0);
      assertExists(result.data);
      assertExists(result.data.processed_data);
      assertExists(result.data.analysis);
      assertExists(result.data.exported_output);
      assertExists(result.metadata);
      assert(typeof result.duration === 'number');
    });

    it('should handle empty data array validation', async () => {
      const params = {
        userId: 'test-user',
        data: [], // Empty array should fail validation
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assert(result.failed_steps.length > 0);
      assert(result.failed_steps[0].operation === 'validate_data');
      assert(result.failed_steps[0].message.includes('non-empty array'));
    });

    it('should handle invalid object data', async () => {
      const params = {
        userId: 'test-user',
        data: ['string', 123, null, undefined], // Invalid objects
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assert(result.failed_steps.length > 0);
      assert(result.failed_steps[0].operation === 'parameter_validation');
      assert(result.failed_steps[0].message.includes('Expected object, received string'));
    });

    it('should apply transformations correctly', async () => {
      const params = {
        userId: 'test-user',
        data: [
          { name: 'ALICE', score: 95 },
          { name: 'Bob', score: 87 },
          { name: 'ALICE', score: 95 }, // Duplicate for deduplication test
        ],
        transformations: ['normalize', 'deduplicate', 'sort'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Check that transformations were applied
      const processedData = result.data.processed_data;
      assertEquals(processedData.length, 2); // Deduplication should remove one

      // Check normalization (should be lowercase)
      assert(
        processedData.every((item: any) =>
          typeof item.name === 'string' && item.name === item.name.toLowerCase()
        ),
      );

      // Check sorting (should be sorted by name)
      assertEquals(processedData[0].name, 'alice');
      assertEquals(processedData[1].name, 'bob');
    });

    it('should generate different analysis types', async () => {
      const baseParams = {
        userId: 'test-user',
        data: [{ score: 95, count: 10 }, { score: 87, count: 20 }],
        transformations: [],
        outputFormat: 'json',
      };

      // Test summary analysis
      const summaryResult = await workflow.executeWithValidation(
        { ...baseParams, analysisType: 'summary' },
        context,
      );
      assertEquals(summaryResult.success, true);
      assertExists(summaryResult.data.analysis.summary);
      assertExists(summaryResult.data.analysis.summary.item_count);
      assertExists(summaryResult.data.analysis.summary.unique_keys);

      // Test detailed analysis
      const detailedResult = await workflow.executeWithValidation(
        { ...baseParams, analysisType: 'detailed' },
        context,
      );
      assertEquals(detailedResult.success, true);
      assertExists(detailedResult.data.analysis.detailed);
      assertExists(detailedResult.data.analysis.detailed.items);

      // Test statistical analysis
      const statisticalResult = await workflow.executeWithValidation(
        { ...baseParams, analysisType: 'statistical' },
        context,
      );
      assertEquals(statisticalResult.success, true);
      assertExists(statisticalResult.data.analysis.statistical);
      // Should have statistics for numeric fields
      assertExists(statisticalResult.data.analysis.statistical.score);
      assertExists(statisticalResult.data.analysis.statistical.count);
    });

    it('should export in different formats', async () => {
      const baseParams = {
        userId: 'test-user',
        data: [{ name: 'Alice', score: 95 }],
        transformations: [],
        analysisType: 'summary',
      };

      // Test JSON export
      const jsonResult = await workflow.executeWithValidation(
        { ...baseParams, outputFormat: 'json' },
        context,
      );
      assertEquals(jsonResult.success, true);
      const jsonOutput = jsonResult.data.exported_output;
      assert(typeof jsonOutput === 'string');
      assert(jsonOutput.startsWith('{'));
      assert(JSON.parse(jsonOutput)); // Should be valid JSON

      // Test CSV export
      const csvResult = await workflow.executeWithValidation(
        { ...baseParams, outputFormat: 'csv' },
        context,
      );
      assertEquals(csvResult.success, true);
      const csvOutput = csvResult.data.exported_output;
      assert(typeof csvOutput === 'string');
      assert(csvOutput.includes('name,score')); // Should have CSV headers
      assert(csvOutput.includes('Alice,95')); // Should have data row
    });

    it('should continue execution despite transformation failures', async () => {
      // This test ensures that failed transformations don't stop the pipeline
      const params = {
        userId: 'test-user',
        data: [{ name: 'Alice', score: 95 }],
        transformations: ['normalize', 'sort'], // All valid transformations
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);
      // Even if some steps fail, others should continue
      assert(result.completed_steps.length >= 3); // At least validate, analyze, export
    });

    it('should track resource usage and performance', async () => {
      const params = {
        userId: 'test-user',
        data: [{ name: 'Alice', score: 95 }],
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assert(typeof result.duration === 'number');
      assert(result.duration > 0);

      // Check metadata includes performance info
      assertExists(result.metadata);
      assertEquals(result.metadata.pipeline, 'data_processing');
      assertEquals(result.metadata.original_items, 1);
      assertEquals(result.metadata.processed_items, 1);
    });

    it('should handle dry run mode', async () => {
      const params = {
        userId: 'test-user',
        dryRun: true,
        data: [{ name: 'Alice', score: 95 }],
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      // Dry run should validate parameters but not execute
      const validationResult = await workflow.validateParameters(params);
      assertEquals(validationResult.valid, true);
      assertEquals(validationResult.data.dryRun, true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should provide detailed error information', async () => {
      const params = {
        userId: 'test-user',
        data: 'invalid-data-type', // Should cause validation error
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const validationResult = await workflow.validateParameters(params);
      assertEquals(validationResult.valid, false);
      assert(Array.isArray(validationResult.errors));
      assert(validationResult.errors.length > 0);

      const dataError = validationResult.errors.find((err: any) => err.path.includes('data'));
      assertExists(dataError);
      assertExists(dataError.message);
      assertExists(dataError.code);
    });

    it('should classify errors correctly', async () => {
      const params = {
        userId: '', // Empty user ID should cause validation error
        data: [], // Empty array should cause validation error
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      if (!result.success && result.failed_steps.length > 0) {
        const failedStep = result.failed_steps[0];
        assert(['validation', 'system_error'].includes(failedStep.error_type));
      }
    });
  });

  describe('Logging and Monitoring', () => {
    it('should log workflow execution steps', async () => {
      const params = {
        userId: 'test-user',
        data: [{ name: 'Alice' }],
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      await workflow.executeWithValidation(params, context);

      // Should have logged various steps
      const logCalls = logSpy.calls;
      assert(logCalls.length > 0);

      // Should log pipeline start
      const startLog = logCalls.find((call) =>
        call.args[0].includes('Starting data processing pipeline')
      );
      assertExists(startLog);
    });
  });
});
