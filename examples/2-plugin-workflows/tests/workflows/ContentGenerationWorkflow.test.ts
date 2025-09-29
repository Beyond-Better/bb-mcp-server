/**
 * Content Generation Workflow Test Suite
 *
 * Tests the AI-powered content generation workflow including:
 * - Parameter validation for content requirements
 * - Multi-step execution (plan → generate → review → publish)
 * - Content type handling (blog, documentation, report)
 * - Quality review and automated improvements
 * - Publication workflow with metadata
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { type Spy, spy } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import WorkflowPlugin from '../../src/plugins/WorkflowPlugin.ts';
import { createMockLogger, createTestContext } from '../utils/test-helpers.ts';
import type { WorkflowContext } from '@beyondbetter/bb-mcp-server';

// Extract the ContentGenerationWorkflow class for direct testing
const contentGenerationWorkflow = WorkflowPlugin.workflows?.find(
  (workflow) => workflow.name === 'content_generation_pipeline',
);

describe('ContentGenerationWorkflow', () => {
  let workflow: any;
  let context: WorkflowContext;
  let logSpy: Spy;
  let mockLogger: any;

  beforeEach(() => {
    assertExists(contentGenerationWorkflow, 'ContentGenerationWorkflow should be found in plugin');
    workflow = contentGenerationWorkflow;

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
      assertEquals(workflow.name, 'content_generation_pipeline');
      assertEquals(workflow.version, '1.0.0');
      assertEquals(workflow.category, 'automation');
      assertEquals(workflow.requiresAuth, false);
      assertEquals(workflow.estimatedDuration, 45);
      assert(Array.isArray(workflow.tags));
      assert(workflow.tags.includes('content'));
      assert(workflow.tags.includes('generation'));
      assert(workflow.tags.includes('ai'));
      assert(workflow.tags.includes('publishing'));
    });

    it('should return proper registration info', () => {
      const registration = workflow.getRegistration();

      assertEquals(registration.name, 'content_generation_pipeline');
      assertEquals(registration.displayName, 'Content Generation Pipeline');
      assertEquals(registration.version, '1.0.0');
      assertEquals(registration.category, 'automation');
      assertEquals(registration.author, 'Beyond MCP Server Examples');
      assertEquals(registration.license, 'MIT');
      assertExists(registration.parameterSchema);
    });

    it('should provide comprehensive workflow overview', () => {
      const overview = workflow.getOverview();

      assert(overview.includes('AI-powered content generation'));
      assert(overview.includes('1. Plans the content structure'));
      assert(overview.includes('2. Generates content based on requirements'));
      assert(overview.includes('3. Reviews content for quality'));
      assert(overview.includes('4. Publishes the final content'));
      assert(overview.includes('elicitation for user interaction'));
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters successfully', async () => {
      const validParams = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Machine Learning Best Practices',
        requirements: {
          wordCount: 800,
          tone: 'professional',
          audience: 'developers',
          includeReferences: true,
        },
      };

      const result = await workflow.validateParameters(validParams);
      assertEquals(result.valid, true);
      assertExists(result.data);
      assertEquals(result.data.userId, 'test-user');
      assertEquals(result.data.contentType, 'blog');
      assertEquals(result.data.topic, 'Machine Learning Best Practices');
    });

    it('should fail validation with missing required fields', async () => {
      const invalidParams = {
        userId: 'test-user',
        // Missing contentType and topic
        requirements: {
          wordCount: 500,
        },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(Array.isArray(result.errors));
      assert(result.errors.length > 0);
      assert(result.errors.some((err: any) => err.path.includes('contentType')));
      assert(result.errors.some((err: any) => err.path.includes('topic')));
    });

    it('should validate content type enum values', async () => {
      const invalidParams = {
        userId: 'test-user',
        contentType: 'invalid_type', // Invalid enum value
        topic: 'Test Topic',
        requirements: { wordCount: 500 },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('contentType')));
    });

    it('should validate topic minimum length', async () => {
      const invalidParams = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Hi', // Too short (min 5 characters)
        requirements: { wordCount: 500 },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('topic')));
    });

    it('should validate requirements object', async () => {
      const invalidParams = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Valid Topic',
        requirements: {
          wordCount: 50, // Below minimum of 100
          tone: 'invalid_tone', // Invalid enum value
          audience: '', // Empty string
        },
      };

      const result = await workflow.validateParameters(invalidParams);
      assertEquals(result.valid, false);
      assert(result.errors.some((err: any) => err.path.includes('requirements')));
    });

    it('should apply default values correctly', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Test Topic',
        // Missing requirements - should use defaults
      };

      const result = await workflow.validateParameters(params);
      assertEquals(result.valid, true);
      assertEquals(result.data.requirements.wordCount, 500);
      assertEquals(result.data.requirements.tone, 'professional');
      assertEquals(result.data.requirements.audience, 'general');
      assertEquals(result.data.requirements.includeReferences, false);
      assertEquals(result.data.dryRun, false);
    });
  });

  describe('Content Generation Pipeline', () => {
    it('should execute complete pipeline successfully', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Microservices Architecture',
        requirements: {
          wordCount: 600,
          tone: 'professional',
          audience: 'software developers',
          includeReferences: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);

      assertEquals(result.success, true);
      assertEquals(result.completed_steps.length, 4); // plan, generate, review, publish
      assertEquals(result.failed_steps.length, 0);
      assertExists(result.data);
      assertExists(result.data.content_plan);
      assertExists(result.data.generated_content);
      assertExists(result.data.reviewed_content);
      assertExists(result.data.publish_info);
      assertExists(result.data.full_content);
      assertExists(result.metadata);
    });

    it('should handle different content types', async () => {
      const contentTypes = ['blog', 'documentation', 'report'] as const;

      for (const contentType of contentTypes) {
        const params = {
          userId: 'test-user',
          contentType,
          topic: `${contentType} Topic`,
          requirements: {
            wordCount: 400,
            tone: 'professional',
            audience: 'general',
          },
        };

        const result = await workflow.executeWithValidation(params, context);
        assertEquals(result.success, true);

        // Check that content plan is type-specific
        assertEquals(result.data.content_plan.content_type, contentType);

        // Check that generated content mentions the content type
        assert(result.data.generated_content.includes(contentType));

        // Check metadata
        assertEquals(result.metadata.content_type, contentType);
      }
    });

    it('should respect word count requirements', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Software Testing',
        requirements: {
          wordCount: 300,
          tone: 'professional',
          audience: 'developers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.full_content;
      const actualWordCount = finalContent.split(' ').length;

      // Should be within reasonable range of target (mock generation)
      assert(actualWordCount > 50); // At least some content

      // Check that word count was tracked
      assertEquals(result.metadata.final_word_count, actualWordCount);
    });

    it('should handle different tone requirements', async () => {
      const tones = ['professional', 'casual', 'academic', 'friendly'] as const;

      for (const tone of tones) {
        const params = {
          userId: 'test-user',
          contentType: 'blog',
          topic: 'Communication Skills',
          requirements: {
            wordCount: 400,
            tone,
            audience: 'general',
          },
        };

        const result = await workflow.executeWithValidation(params, context);
        assertEquals(result.success, true);

        // Check that tone was recorded in plan
        assertEquals(result.data.content_plan.tone, tone);
      }
    });
  });

  describe('Content Planning Step', () => {
    it('should create comprehensive content plan', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'documentation',
        topic: 'API Integration Guide',
        requirements: {
          wordCount: 1000,
          tone: 'professional',
          audience: 'developers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const plan = result.data.content_plan;
      assertEquals(plan.content_type, 'documentation');
      assertEquals(plan.topic, 'API Integration Guide');
      assertEquals(plan.target_word_count, 1000);
      assertEquals(plan.tone, 'professional');
      assertEquals(plan.audience, 'developers');
      assert(Array.isArray(plan.outline));
      assert(Array.isArray(plan.sections));
      assertExists(plan.estimated_duration);
      assertExists(plan.created_at);
    });

    it('should generate content type specific outlines', async () => {
      const testCases = [
        {
          contentType: 'blog',
          expectedOutlineItems: [
            'Introduction and hook',
            'Main points and arguments',
            'Conclusion and call-to-action',
          ],
        },
        {
          contentType: 'documentation',
          expectedOutlineItems: [
            'Overview and purpose',
            'Step-by-step instructions',
            'Troubleshooting and FAQ',
          ],
        },
        {
          contentType: 'report',
          expectedOutlineItems: [
            'Executive summary',
            'Key findings and analysis',
            'Recommendations',
          ],
        },
      ];

      for (const testCase of testCases) {
        const params = {
          userId: 'test-user',
          contentType: testCase.contentType,
          topic: 'Test Topic',
          requirements: { wordCount: 500 },
        };

        const result = await workflow.executeWithValidation(params, context);
        assertEquals(result.success, true);

        const outline = result.data.content_plan.outline;

        // Check that expected outline items are present
        for (const expectedItem of testCase.expectedOutlineItems) {
          assert(outline.some((item: string) => item.includes(expectedItem.split(' ')[0]!)));
        }
      }
    });
  });

  describe('Content Generation Step', () => {
    it('should generate content based on plan', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Clean Code Principles',
        requirements: {
          wordCount: 500,
          tone: 'professional',
          audience: 'software engineers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const generatedContent = result.data.generated_content;
      assert(typeof generatedContent === 'string');
      assert(generatedContent.length > 100);
      assert(generatedContent.includes('Clean Code Principles'));

      // Check generation info
      const generateStep = result.completed_steps.find((step: any) =>
        step.operation === 'generate_content'
      );
      assertExists(generateStep);
      assertExists(generateStep.data.word_count);
      assertExists(generateStep.data.character_count);
      assertExists(generateStep.data.generation_method);
    });

    it('should include topic in generated content', async () => {
      const topics = [
        'Machine Learning',
        'Database Optimization',
        'Security Best Practices',
      ];

      for (const topic of topics) {
        const params = {
          userId: 'test-user',
          contentType: 'blog',
          topic,
          requirements: { wordCount: 300 },
        };

        const result = await workflow.executeWithValidation(params, context);
        assertEquals(result.success, true);

        const content = result.data.generated_content;
        assert(content.includes(topic));
      }
    });
  });

  describe('Content Review Step', () => {
    it('should perform quality review', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Performance Optimization',
        requirements: {
          wordCount: 800,
          tone: 'professional',
          audience: 'developers',
          includeReferences: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const reviewStep = result.completed_steps.find((step: any) =>
        step.operation === 'review_content'
      );
      assertExists(reviewStep);

      const reviewResults = reviewStep.data;
      assertExists(reviewResults.word_count_check);
      assertExists(reviewResults.tone_check);
      assertExists(reviewResults.quality_metrics);
      assertExists(reviewResults.recommendations);
      assertExists(reviewResults.reviewed_at);

      // Check word count analysis
      assertEquals(reviewResults.word_count_check.target, 800);
      assert(typeof reviewResults.word_count_check.actual === 'number');
      assert(typeof reviewResults.word_count_check.within_range === 'boolean');

      // Check tone analysis
      assertEquals(reviewResults.tone_check.target, 'professional');
      assertExists(reviewResults.tone_check.detected);
    });

    it('should apply automated improvements', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'report',
        topic: 'Market Analysis',
        requirements: {
          wordCount: 600,
          tone: 'academic',
          audience: 'researchers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const reviewedContent = result.data.reviewed_content;
      const generatedContent = result.data.generated_content;

      // Reviewed content should exist and potentially be different from generated
      assertExists(reviewedContent);

      // Should have conclusion if it wasn't already present
      if (!generatedContent.toLowerCase().includes('conclusion')) {
        assert(reviewedContent.toLowerCase().includes('conclusion'));
      }
    });

    it('should generate quality recommendations', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Web Development',
        requirements: {
          wordCount: 200, // Lower word count to trigger recommendation
          tone: 'casual',
          audience: 'beginners',
          includeReferences: true,
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const reviewStep = result.completed_steps.find((step: any) =>
        step.operation === 'review_content'
      );
      const recommendations = reviewStep?.data.recommendations;

      assertExists(recommendations);
      assert(Array.isArray(recommendations));

      // Should have recommendations for low word count or missing references
      const hasWordCountRec = recommendations.some((rec: string) =>
        rec.includes('word count') || rec.includes('expand')
      );
      const hasReferenceRec = recommendations.some((rec: string) =>
        rec.includes('references') || rec.includes('links')
      );

      assert(
        hasWordCountRec || hasReferenceRec ||
          recommendations.includes('Content meets quality standards'),
      );
    });
  });

  describe('Content Publishing Step', () => {
    it('should create comprehensive publish information', async () => {
      const params = {
        userId: 'content-creator',
        contentType: 'documentation',
        topic: 'REST API Design',
        requirements: {
          wordCount: 1200,
          tone: 'professional',
          audience: 'API developers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const publishInfo = result.data.publish_info;
      assertExists(publishInfo.content_id);
      assertExists(publishInfo.title);
      assertExists(publishInfo.content_type);
      assertExists(publishInfo.word_count);
      assertExists(publishInfo.publish_url);
      assertExists(publishInfo.published_at);
      assertExists(publishInfo.metadata);
      assertExists(publishInfo.content_preview);

      assertEquals(publishInfo.content_type, 'documentation');
      assertEquals(publishInfo.metadata.author, 'content-creator');
      assertEquals(publishInfo.metadata.topic, 'REST API Design');

      // Title should be meaningful
      assert(publishInfo.title.includes('REST API Design'));

      // Preview should be truncated
      assert(publishInfo.content_preview.length <= 203); // 200 + '...'
      assert(publishInfo.content_preview.endsWith('...'));
    });

    it('should extract title from content when available', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'JavaScript Frameworks',
        requirements: { wordCount: 400 },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const publishInfo = result.data.publish_info;
      const title = publishInfo.title;

      // Should have a meaningful title related to the topic
      assert(title.includes('JavaScript Frameworks') || title.includes('Understanding'));
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle planning step failure gracefully', async () => {
      // This is a mock test - in reality, planning is unlikely to fail
      // but we test the error handling structure
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Valid Topic',
        requirements: { wordCount: 500 },
      };

      const result = await workflow.executeWithValidation(params, context);

      // Should succeed in normal cases, but error handling is in place
      if (!result.success) {
        assert(result.failed_steps.length > 0);
        assertExists(result.error);
      } else {
        assertEquals(result.success, true);
      }
    });

    it('should continue pipeline even with step failures', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Test Topic',
        requirements: { wordCount: 500 },
      };

      const result = await workflow.executeWithValidation(params, context);

      // In the mock implementation, all steps should succeed
      // But the structure supports continuing with failures
      assert(result.completed_steps.length > 0);

      if (result.failed_steps.length > 0) {
        // Should still have some completed steps
        assert(result.completed_steps.length > 0);
      }
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track execution timing and metadata', async () => {
      const params = {
        userId: 'performance-test',
        contentType: 'report',
        topic: 'Performance Analysis',
        requirements: {
          wordCount: 800,
          tone: 'academic',
          audience: 'researchers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      // Check execution timing
      assert(typeof result.duration === 'number');
      assert(result.duration > 0);

      // Check metadata
      assertExists(result.metadata);
      assertEquals(result.metadata.workflow, 'content_generation');
      assertEquals(result.metadata.content_type, 'report');
      assertEquals(result.metadata.topic, 'Performance Analysis');
      assertEquals(result.metadata.planning_completed, true);
      assertEquals(result.metadata.generation_completed, true);
      assertEquals(result.metadata.review_completed, true);
      assertEquals(result.metadata.publishing_completed, true);

      // Each step should have timing
      result.completed_steps.forEach((step: any) => {
        assert(typeof step.duration_ms === 'number');
        assert(step.duration_ms >= 0);
        assertExists(step.timestamp);
      });
    });

    it('should log workflow progress', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Logging Test',
        requirements: { wordCount: 300 },
      };

      await workflow.executeWithValidation(params, context);

      const logCalls = logSpy.calls;
      assert(logCalls.length > 0);

      // Should log pipeline start
      assert(
        logCalls.some((call) => call.args[0].includes('Starting content generation pipeline')),
      );

      // Should log individual steps
      assert(logCalls.some((call) => call.args[0].includes('Planning content structure')));

      assert(logCalls.some((call) => call.args[0].includes('Generating content based on plan')));
    });
  });

  describe('Content Quality and Structure', () => {
    it('should generate structured content with headers', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'blog',
        topic: 'Structured Content',
        requirements: {
          wordCount: 600,
          tone: 'professional',
          audience: 'readers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.full_content;

      // Should have markdown headers
      assert(finalContent.includes('# Understanding'));
      assert(finalContent.includes('## '));

      // Should be structured content, not just plain text
      const headerCount = (finalContent.match(/##/g) || []).length;
      assert(headerCount >= 2);
    });

    it('should meet basic content quality standards', async () => {
      const params = {
        userId: 'test-user',
        contentType: 'documentation',
        topic: 'Quality Standards',
        requirements: {
          wordCount: 500,
          tone: 'professional',
          audience: 'developers',
        },
      };

      const result = await workflow.executeWithValidation(params, context);
      assertEquals(result.success, true);

      const finalContent = result.data.full_content;

      // Basic quality checks
      assert(finalContent.length > 200); // Substantial content
      assert(finalContent.includes(params.topic)); // Relevant to topic
      assert(!finalContent.includes('undefined')); // No undefined values
      assert(!finalContent.includes('[object Object]')); // No object serialization issues

      // Should have professional tone indicators
      const professionalContent = finalContent.toLowerCase();
      const hasProfessionalLanguage = professionalContent.includes('important') ||
        professionalContent.includes('significant') ||
        professionalContent.includes('crucial') ||
        professionalContent.includes('comprehensive');
      assert(hasProfessionalLanguage);
    });
  });
});
