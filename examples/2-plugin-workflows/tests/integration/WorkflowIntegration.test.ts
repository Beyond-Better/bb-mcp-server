/**
 * Workflow Integration Test Suite
 *
 * Tests the complete integration of workflows within the plugin system including:
 * - Plugin discovery and registration of workflows
 * - Workflow registry integration
 * - End-to-end workflow execution through the plugin system
 * - Integration between tools and workflows in the same plugin
 * - Error handling at the integration level
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { type Spy, spy } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import WorkflowPlugin from '../../src/plugins/WorkflowPlugin.ts';
import { createMockLogger, createTestContext } from '../utils/test-helpers.ts';
import type { WorkflowContext } from '@beyondbetter/bb-mcp-server';

describe('Workflow Integration Tests', () => {
  let mockLogger: any;
  let logSpy: Spy;
  let context: WorkflowContext;

  beforeEach(() => {
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
    // const workflows = WorkflowPlugin.workflows!;
    // for (const workflow of workflows) {
    //   await workflow.clearKVManager();
    // }
  });

  describe('Plugin Discovery and Registration', () => {
    it('should discover WorkflowPlugin correctly', () => {
      // Test plugin metadata
      assertEquals(WorkflowPlugin.name, 'workflow-plugin');
      assertEquals(WorkflowPlugin.version, '1.0.0');
      assertEquals(
        WorkflowPlugin.description,
        'Comprehensive workflow demonstrations with multi-step processing and state management',
      );
      assertEquals(WorkflowPlugin.author, 'Beyond MCP Server Examples');
      assertEquals(WorkflowPlugin.license, 'MIT');

      // Test plugin tags
      assert(Array.isArray(WorkflowPlugin.tags));
      assert(WorkflowPlugin.tags.includes('workflows'));
      assert(WorkflowPlugin.tags.includes('multi-step'));
      assert(WorkflowPlugin.tags.includes('state-management'));
    });

    it('should register all expected workflows', () => {
      assertExists(WorkflowPlugin.workflows);
      assert(Array.isArray(WorkflowPlugin.workflows));
      assertEquals(WorkflowPlugin.workflows.length, 3);

      const workflowNames = WorkflowPlugin.workflows.map((w) => w.name);
      assert(workflowNames.includes('data_processing_pipeline'));
      assert(workflowNames.includes('file_management_lifecycle'));
      assert(workflowNames.includes('content_generation_pipeline'));
    });

    it('should register utility tools alongside workflows', () => {
      assertExists(WorkflowPlugin.tools);
      assert(Array.isArray(WorkflowPlugin.tools));
      assertEquals(WorkflowPlugin.tools.length, 2);

      const toolNames = WorkflowPlugin.tools.map((t) => t.name);
      assert(toolNames.includes('current_datetime'));
      assert(toolNames.includes('validate_json'));
    });

    it('should have workflows with proper registration info', () => {
      for (const workflow of WorkflowPlugin.workflows!) {
        const registration = workflow.getRegistration();

        // Test required registration fields
        assertExists(registration.name);
        assertExists(registration.displayName);
        assertExists(registration.description);
        assertExists(registration.version);
        assertExists(registration.category);
        assertExists(registration.parameterSchema);
        assertEquals(registration.requiresAuth, false); // All demo workflows don't require auth

        // Test metadata consistency
        assertEquals(registration.author, 'Beyond MCP Server Examples');
        assertEquals(registration.license, 'MIT');
        assert(Array.isArray(registration.tags));
        assert(registration.tags.length > 0);
      }
    });
  });

  describe('Workflow Categories and Organization', () => {
    it('should have workflows in appropriate categories', () => {
      const workflows = WorkflowPlugin.workflows!;

      const dataProcessingWorkflow = workflows.find((w) => w.name === 'data_processing_pipeline');
      const fileManagementWorkflow = workflows.find((w) => w.name === 'file_management_lifecycle');
      const contentGenerationWorkflow = workflows.find((w) =>
        w.name === 'content_generation_pipeline'
      );

      assertEquals(dataProcessingWorkflow?.category, 'data');
      assertEquals(fileManagementWorkflow?.category, 'utility');
      assertEquals(contentGenerationWorkflow?.category, 'automation');
    });

    it('should have meaningful tags for workflow discovery', () => {
      const workflows = WorkflowPlugin.workflows!;

      // Data processing should have data-related tags
      const dataWorkflow = workflows.find((w) => w.name === 'data_processing_pipeline');
      assert(dataWorkflow?.tags.includes('data'));
      assert(dataWorkflow?.tags.includes('pipeline'));

      // File management should have file-related tags
      const fileWorkflow = workflows.find((w) => w.name === 'file_management_lifecycle');
      assert(fileWorkflow?.tags.includes('files'));
      assert(fileWorkflow?.tags.includes('lifecycle'));

      // Content generation should have content-related tags
      const contentWorkflow = workflows.find((w) => w.name === 'content_generation_pipeline');
      assert(contentWorkflow?.tags.includes('content'));
      assert(contentWorkflow?.tags.includes('generation'));
    });

    it('should have realistic estimated durations', () => {
      const workflows = WorkflowPlugin.workflows!;

      for (const workflow of workflows) {
        assertExists(workflow.estimatedDuration);
        assert(workflow.estimatedDuration > 0);
        assert(workflow.estimatedDuration <= 60); // Should be reasonable (under 1 minute)
      }

      // Content generation should be the longest (most complex)
      const contentWorkflow = workflows.find((w) => w.name === 'content_generation_pipeline');
      assertEquals(contentWorkflow?.estimatedDuration, 45);
    });
  });

  describe('End-to-End Workflow Execution', () => {
    it('should execute data processing workflow end-to-end', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) => w.name === 'data_processing_pipeline');
      assertExists(workflow);

      const params = {
        userId: 'integration-test',
        data: [
          { product: 'Widget A', sales: 100, region: 'North' },
          { product: 'Widget B', sales: 150, region: 'South' },
          { product: 'Widget A', sales: 100, region: 'North' }, // Duplicate
        ],
        transformations: ['deduplicate', 'sort'],
        outputFormat: 'json',
        analysisType: 'statistical',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.completed_steps.length, 5);
      assertEquals(result.failed_steps.length, 0);

      // Test data flow through the pipeline
      assertExists(result.data);
      const resultData = result.data as any;
      assertExists(resultData.processed_data);
      assertEquals(resultData.processed_data.length, 2); // Deduplication worked
      assertExists(resultData.analysis);
      assertExists(resultData.exported_output);

      // Test that JSON output is valid
      const exportedData = JSON.parse(resultData.exported_output);
      assertExists(exportedData.metadata);
      assertExists(exportedData.analysis);
      assertExists(exportedData.data);
    });

    it('should execute file management workflow end-to-end', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) =>
        w.name === 'file_management_lifecycle'
      );
      assertExists(workflow);

      const params = {
        userId: 'integration-test',
        fileName: 'integration-test.json',
        content: '{"integration": "test", "valid": true}',
        validationRules: ['not_empty', 'valid_json', 'max_size'],
        processingOptions: {
          format: 'pretty',
          addMetadata: true,
          sanitize: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assert(result.completed_steps.length >= 4); // create, validate steps, process, archive

      // Test file lifecycle completion
      assertExists(result.data);
      const resultData = result.data as any;
      assertExists(resultData.file_info);
      assertExists(resultData.final_content);
      assertExists(resultData.archive_info);

      // Test that JSON was prettified
      assert(resultData.final_content.includes('\n'));
      assert(resultData.final_content.includes('_metadata')); // Metadata was added

      // Test archive information
      assertEquals(
        resultData.archive_info.original_file.name,
        'integration-test.json',
      );
      assertEquals(
        resultData.archive_info.processed_file.name,
        'integration-test.json.processed',
      );
    });

    it('should execute content generation workflow end-to-end', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) =>
        w.name === 'content_generation_pipeline'
      );
      assertExists(workflow);

      const params = {
        userId: 'integration-test',
        contentType: 'blog',
        topic: 'Integration Testing Best Practices',
        requirements: {
          wordCount: 500,
          tone: 'professional',
          audience: 'software developers',
          includeReferences: false,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.completed_steps.length, 4); // plan, generate, review, publish

      // Test content generation pipeline completion
      assertExists(result.data);
      const resultData = result.data as any;
      assertExists(resultData.content_plan);
      assertExists(resultData.generated_content);
      assertExists(resultData.publish_info);

      // Test content quality
      const finalContent = resultData.full_content;
      assert(finalContent.includes('Integration Testing Best Practices'));
      assert(finalContent.includes('# Understanding')); // Should have title
      assert(finalContent.includes('##')); // Should have section headers

      // Test publication info
      assertEquals(resultData.publish_info.content_type, 'blog');
      assertEquals(resultData.publish_info.metadata.author, 'integration-test');
    });
  });

  describe('Tools and Workflows Integration', () => {
    it('should have both tools and workflows available', () => {
      // Tools should be simple utility functions
      assert(WorkflowPlugin.tools!.length > 0);

      // Workflows should be complex multi-step processes
      assert(WorkflowPlugin.workflows!.length > 0);

      // Should have more workflows than tools (workflow-focused plugin)
      assert(WorkflowPlugin.workflows!.length >= WorkflowPlugin.tools!.length);
    });

    it('should execute utility tools successfully', async () => {
      const datetimeTool = WorkflowPlugin.tools?.find((t) => t.name === 'current_datetime');
      assertExists(datetimeTool);

      const result = await datetimeTool.handler({ timezone: 'UTC' });

      assertExists(result.content);
      assert(Array.isArray(result.content));
      assertEquals(result.content[0]!.type, 'text');

      const data = JSON.parse((result.content[0] as any).text);
      assertExists(data.datetime);
      assertEquals(data.timezone, 'UTC');
      assertExists(data.unix_timestamp);
    });

    it('should demonstrate tool vs workflow usage patterns', async () => {
      // Tool: Quick, single operation
      const jsonTool = WorkflowPlugin.tools?.find((t) => t.name === 'validate_json');
      assertExists(jsonTool);

      const toolResult = await jsonTool.handler({
        json_string: '{"valid": true}',
      });
      assertEquals(toolResult.content[0]!.text, '✅ JSON is valid');

      // Workflow: Complex, multi-step operation with the same JSON
      const fileWorkflow = WorkflowPlugin.workflows?.find((w) =>
        w.name === 'file_management_lifecycle'
      );
      assertExists(fileWorkflow);

      const workflowParams = {
        userId: 'comparison-test',
        fileName: 'test.json',
        content: '{"valid": true}',
        validationRules: ['valid_json'],
        processingOptions: { format: 'pretty' },
      };

      const workflowResult = await fileWorkflow.executeWithValidation(
        workflowParams,
        context,
      );

      // Tool gives simple validation result
      assert((toolResult.content[0] as any).text.includes('valid'));

      // Workflow provides comprehensive file lifecycle management
      assertEquals(workflowResult.success, true);
      assert(workflowResult.completed_steps.length > 1);
      const workflowData = workflowResult.data as any;
      assertExists(workflowData.file_info);
      assertExists(workflowData.archive_info);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle workflow parameter validation errors gracefully', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) => w.name === 'data_processing_pipeline');
      assertExists(workflow);

      const invalidParams = {
        userId: 'test-user',
        // Missing required 'data' field
        transformations: ['normalize'],
        outputFormat: 'json',
      };

      const result = await workflow.executeWithValidation(
        invalidParams,
        context,
      );

      assertEquals(result.success, false);
      assertExists(result.error);
      assertEquals(result.error.type, 'validation');
      assert(result.error.message.includes('Parameter validation failed'));

      // Should have failed steps with validation errors
      assert(result.failed_steps.length > 0);
      assertEquals(result.failed_steps[0]!.operation, 'parameter_validation');
      assertEquals(result.failed_steps[0]!.error_type, 'validation');
    });

    it('should handle workflow execution errors with proper recovery', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) => w.name === 'data_processing_pipeline');
      assertExists(workflow);

      const params = {
        userId: 'test-user',
        data: [], // Empty array should cause validation failure
        transformations: ['normalize'],
        outputFormat: 'json',
        analysisType: 'summary',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);
      assert(result.failed_steps.length > 0);

      // Should fail at data validation step
      const dataValidationFailure = result.failed_steps.find(
        (step) => step.operation === 'validate_data',
      );
      assertExists(dataValidationFailure);
      assert(dataValidationFailure.message.includes('non-empty array'));
    });

    it('should provide detailed error information for debugging', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) =>
        w.name === 'file_management_lifecycle'
      );
      assertExists(workflow);

      const params = {
        userId: 'test-user',
        fileName: '', // Empty filename should cause creation failure
        content: 'test content',
        validationRules: ['not_empty'],
        processingOptions: { format: 'normalize' },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, false);

      // Should have detailed error in failed steps
      const creationFailure = result.failed_steps.find(
        (step) => step.operation === 'parameter_validation',
      );
      assertExists(creationFailure);
      assertEquals(creationFailure.error_type, 'validation');
      assert(
        creationFailure.message.includes(
          'String must contain at least 1 character(s)',
        ),
      );
      assertExists(creationFailure.timestamp);
    });
  });

  describe('Performance and Monitoring Integration', () => {
    it('should track performance metrics across all workflows', async () => {
      const workflows = WorkflowPlugin.workflows!;

      for (const workflow of workflows) {
        // Get basic parameters for each workflow type
        let params: any;
        switch (workflow.name) {
          case 'data_processing_pipeline':
            params = {
              userId: 'perf-test',
              data: [{ test: 'data' }],
              transformations: ['normalize'],
              outputFormat: 'json',
            };
            break;
          case 'file_management_lifecycle':
            params = {
              userId: 'perf-test',
              fileName: 'perf-test.json',
              content: '{"test": true}',
              validationRules: ['valid_json'],
              processingOptions: { format: 'pretty' },
            };
            break;
          case 'content_generation_pipeline':
            params = {
              userId: 'perf-test',
              contentType: 'blog',
              topic: 'Performance Testing',
              requirements: { wordCount: 300 },
            };
            break;
        }

        const result = await workflow.executeWithValidation(params, context);

        assertEquals(result.success, true);

        // Check performance tracking
        assert(typeof result.duration === 'number');
        assert(result.duration > 0);

        // Each step should have timing
        result.completed_steps.forEach((step) => {
          assert(typeof step.duration_ms === 'number');
          assert(step.duration_ms >= 0);
          assertExists(step.timestamp);
        });

        // Should have workflow-specific metadata
        assertExists(result.metadata);
        assertExists(result.metadata[Object.keys(result.metadata)[0]!]); // Some workflow-specific key
      }
    });

    it('should provide consistent logging across workflows', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) => w.name === 'data_processing_pipeline');
      assertExists(workflow);

      const params = {
        userId: 'logging-test',
        data: [{ test: 'logging' }],
        transformations: ['normalize'],
        outputFormat: 'json',
      };

      await workflow.executeWithValidation(params, context);

      const logCalls = logSpy.calls;
      assert(logCalls.length > 0);

      // Should have consistent log format with workflow name and step info
      const workflowLogs = logCalls.filter((call) =>
        call.args[0].includes('[data_processing_pipeline]') ||
        call.args[0].includes('Starting data processing pipeline') ||
        call.args[0].includes('Validating input data')
      );

      assert(workflowLogs.length > 0);
    });
  });

  describe('Plugin Architecture Validation', () => {
    it('should follow correct plugin patterns', () => {
      // Plugin should be exportable as default
      assertExists(WorkflowPlugin);

      // Should have populated arrays (no manual registration)
      assertExists(WorkflowPlugin.workflows);
      assertExists(WorkflowPlugin.tools);

      // Workflows should be instantiated objects, not classes
      WorkflowPlugin.workflows.forEach((workflow) => {
        assert(typeof workflow === 'object');
        assertExists(workflow.name);
        assertExists(workflow.version);
        assertExists(workflow.executeWithValidation);
        assert(typeof workflow.executeWithValidation === 'function');
      });

      // Tools should have proper structure
      WorkflowPlugin.tools?.forEach((tool) => {
        assertExists(tool.name);
        assertExists(tool.definition);
        assertExists(tool.handler);
        assert(typeof tool.handler === 'function');
      });
    });

    it('should be compatible with plugin manager expectations', () => {
      // Test plugin manager interface compatibility
      const plugin = WorkflowPlugin;

      // Required plugin properties
      assert(typeof plugin.name === 'string');
      assert(typeof plugin.version === 'string');
      assert(typeof plugin.description === 'string');

      // Optional but expected properties
      assert(typeof plugin.author === 'string');
      assert(typeof plugin.license === 'string');
      assert(Array.isArray(plugin.tags));

      // Plugin should have at least one type of registration
      assert(plugin.workflows || plugin.tools);

      // Workflows should have valid registration methods
      if (plugin.workflows) {
        plugin.workflows.forEach((workflow) => {
          const registration = workflow.getRegistration();
          assertExists(registration);
          assertExists(registration.name);
          assertExists(registration.parameterSchema);
        });
      }
    });
  });

  describe('Real-World Usage Scenarios', () => {
    it('should handle typical data processing scenario', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) => w.name === 'data_processing_pipeline');
      assertExists(workflow);

      // Simulate real customer data processing
      const customerData = [
        {
          name: 'Alice Johnson',
          email: 'ALICE@EXAMPLE.COM',
          orders: 5,
          region: 'North',
        },
        {
          name: 'Bob Smith',
          email: 'bob@example.com',
          orders: 3,
          region: 'South',
        },
        { name: '', email: '', orders: 0, region: '' }, // Empty record
        {
          name: 'Alice Johnson',
          email: 'ALICE@EXAMPLE.COM',
          orders: 5,
          region: 'North',
        }, // Duplicate
      ];

      const params = {
        userId: 'data-analyst',
        data: customerData,
        transformations: ['normalize', 'filter_empty', 'deduplicate', 'sort'],
        outputFormat: 'csv',
        analysisType: 'statistical',
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Should have cleaned and processed data
      const processedData = (result.data as any).processed_data;
      assertEquals(processedData.length, 3); // After filtering and deduplication (empty record kept because orders: 0 is valid)

      // Should have statistical analysis for numeric fields
      const analysis = (result.data as any).analysis;
      assertExists(analysis.statistical.orders);

      // CSV output should be properly formatted
      const csvOutput = (result.data as any).exported_output;
      assert(csvOutput.includes('name,email,orders,region'));
      assert(csvOutput.includes('alice@example.com'));
    });

    it('should handle typical content creation scenario', async () => {
      const workflow = WorkflowPlugin.workflows?.find((w) =>
        w.name === 'content_generation_pipeline'
      );
      assertExists(workflow);

      // Simulate real blog post creation
      const params = {
        userId: 'content-manager',
        contentType: 'blog',
        topic: 'Remote Work Productivity Tips',
        requirements: {
          wordCount: 800,
          tone: 'friendly',
          audience: 'remote workers',
          includeReferences: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);

      // Content should meet requirements
      const finalContent = (result.data as any).full_content;
      assert(finalContent.includes('Remote Work Productivity Tips'));

      // Should have proper structure
      assert(finalContent.includes('# Understanding'));
      assert(finalContent.includes('##'));

      // Review should identify content characteristics
      const reviewStep = result.completed_steps.find((s: any) => s.operation === 'review_content');
      assertExists(reviewStep);
      assertExists((reviewStep as any).data.word_count_check);

      // Publication should be ready
      const publishInfo = (result.data as any).publish_info;
      assertEquals(publishInfo.metadata.audience, 'remote workers');
      assert(publishInfo.content_preview.length <= 203);
    });
  });
});
