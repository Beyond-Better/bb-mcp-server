/**
 * Workflow Plugin - Multi-Step Workflow Demonstrations
 *
 * This plugin demonstrates the CORRECT patterns for MCP workflow development:
 * - Populate workflows[] array directly (no manual registration)
 * - Let PluginManager handle all registration automatically
 * - Multi-step workflows with proper state tracking
 * - Error handling and recovery patterns
 * - Resource tracking and performance monitoring
 *
 * PLUGIN ARCHITECTURE:
 * ===================
 *
 * WorkflowPlugin
 * ├── tools[] array with basic utility tools
 * ├── workflows[] array with 3 comprehensive workflows:
 * │   ├── DataProcessingWorkflow (validate → transform → analyze → export)
 * │   ├── FileManagementWorkflow (create → validate → process → archive)
 * │   └── ContentGenerationWorkflow (plan → generate → review → publish)
 * └── PluginManager automatically registers everything
 *
 * LEARNING FOCUS:
 * ===============
 *
 * This plugin teaches:
 * 1. Multi-step workflow implementation with state tracking
 * 2. Workflow parameter validation with comprehensive Zod schemas
 * 3. Error handling and recovery in workflow contexts
 * 4. Resource tracking and performance monitoring
 * 5. Proper workflow vs. tool usage patterns
 * 6. State management across workflow steps
 */

import { z } from 'zod';
import type {
  AppPlugin,
  ToolRegistration,
  WorkflowRegistration,
} from '@beyondbetter/bb-mcp-server';
import { WorkflowBase } from '@beyondbetter/bb-mcp-server';
import type { WorkflowContext, WorkflowResult } from '@beyondbetter/bb-mcp-server';

/**
 * Data Processing Pipeline Workflow
 *
 * Multi-step pipeline: validate → transform → analyze → export
 * Demonstrates complex data processing with state tracking
 */
class DataProcessingWorkflow extends WorkflowBase {
  readonly name = 'data_processing_pipeline';
  readonly version = '1.0.0';
  readonly description =
    'Multi-step data processing pipeline with validation, transformation, analysis, and export';
  readonly category = 'data' as const;
  readonly tags = ['data', 'pipeline', 'processing', 'validation'];
  override readonly estimatedDuration = 30; // seconds
  override readonly requiresAuth = false; // For demo purposes

  readonly parameterSchema = z.object({
    userId: z.string(),
    requestId: z.string().optional(),
    dryRun: z.boolean().default(false),
    data: z.array(z.record(z.unknown())).describe('Array of data objects to process'),
    transformations: z.array(z.enum(['normalize', 'filter_empty', 'sort', 'deduplicate'])).describe(
      'Transformations to apply',
    ),
    outputFormat: z.enum(['json', 'csv']).default('json').describe(
      'Output format for processed data',
    ),
    analysisType: z.enum(['summary', 'detailed', 'statistical']).default('summary').describe(
      'Type of analysis to perform',
    ),
  });

  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'Data Processing Pipeline',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration,
      tags: this.tags,
      author: 'Beyond MCP Server Examples',
      license: 'MIT',
      parameterSchema: this.parameterSchema,
    };
  }

  getOverview(): string {
    return `Multi-step data processing pipeline that:
1. Validates input data structure and content
2. Applies specified transformations (normalize, filter, sort, deduplicate)
3. Performs analysis on processed data (summary/detailed/statistical)
4. Exports results in requested format (JSON/CSV)

Perfect for demonstrating complex multi-step workflows with state management.`;
  }

  protected async executeWorkflow(params: any, context: WorkflowContext): Promise<WorkflowResult> {
    const steps: any[] = [];
    const failed: any[] = [];
    let processedData = [...params.data];

    try {
      this.logInfo('Starting data processing pipeline', {
        dataCount: params.data.length,
        transformations: params.transformations,
        outputFormat: params.outputFormat,
      });

      // Step 1: Validate Data
      const validationStep = await this.safeExecute('validate_data', async () => {
        this.logInfo('Validating input data structure');

        if (!Array.isArray(params.data) || params.data.length === 0) {
          throw new Error('Data must be a non-empty array');
        }

        const validItems = params.data.filter((item: any) =>
          typeof item === 'object' && item !== null
        );

        if (validItems.length === 0) {
          throw new Error('No valid objects found in data array');
        }

        return {
          total_items: params.data.length,
          valid_items: validItems.length,
          invalid_items: params.data.length - validItems.length,
        };
      });

      if (validationStep.success) {
        steps.push(this.createStepResult('validate_data', true, validationStep.data));
        processedData = params.data.filter((item: any) =>
          typeof item === 'object' && item !== null
        );
      } else {
        failed.push(validationStep.error!);
        return this.createFailureResult(steps, failed, 'Data validation failed');
      }

      // Step 2: Apply Transformations
      for (const transformation of params.transformations) {
        const transformStep = await this.safeExecute(`transform_${transformation}`, async () => {
          this.logInfo(`Applying transformation: ${transformation}`);

          switch (transformation) {
            case 'normalize':
              return processedData.map((item) => {
                const normalized: any = {};
                for (const [key, value] of Object.entries(item)) {
                  normalized[key] = typeof value === 'string' ? value.toLowerCase() : value;
                }
                return normalized;
              });

            case 'filter_empty':
              return processedData.filter((item) =>
                Object.values(item).some((value) =>
                  value !== null && value !== undefined && value !== ''
                )
              );

            case 'sort':
              return [...processedData].sort((a, b) => {
                const keyA = Object.keys(a).find((key) => typeof a[key] === 'string');
                const keyB = Object.keys(b).find((key) => typeof b[key] === 'string');

                if (!keyA || !keyB) return 0;
                return String(a[keyA]).localeCompare(String(b[keyB]));
              });

            case 'deduplicate':
              const seen = new Set();
              return processedData.filter((item) => {
                const str = JSON.stringify(item);
                if (seen.has(str)) {
                  return false;
                }
                seen.add(str);
                return true;
              });

            default:
              throw new Error(`Unknown transformation: ${transformation}`);
          }
        });

        if (transformStep.success) {
          processedData = transformStep.data || [];
          steps.push(this.createStepResult(`transform_${transformation}`, true, {
            transformation,
            items_after: processedData.length,
          }));
        } else {
          failed.push(transformStep.error!);
        }
      }

      // Step 3: Analyze Data
      const analysisStep = await this.safeExecute('analyze_data', async () => {
        this.logInfo(`Performing ${params.analysisType} analysis`);

        const analysis: any = {
          type: params.analysisType,
          total_items: processedData.length,
          timestamp: new Date().toISOString(),
        };

        switch (params.analysisType) {
          case 'summary':
            analysis.summary = {
              item_count: processedData.length,
              unique_keys: [...new Set(processedData.flatMap(Object.keys))],
              data_types: this.analyzeDataTypes(processedData),
            };
            break;

          case 'detailed':
            analysis.detailed = {
              items: processedData.map((item, index) => ({
                index,
                keys: Object.keys(item),
                values_count: Object.keys(item).length,
                sample_data: Object.fromEntries(
                  Object.entries(item).slice(0, 3),
                ),
              })),
            };
            break;

          case 'statistical':
            analysis.statistical = this.calculateStatistics(processedData);
            break;
        }

        return analysis;
      });

      if (analysisStep.success) {
        steps.push(this.createStepResult('analyze_data', true, analysisStep.data));
      } else {
        failed.push(analysisStep.error!);
      }

      // Step 4: Export Results
      const exportStep = await this.safeExecute('export_results', async () => {
        this.logInfo(`Exporting results in ${params.outputFormat} format`);

        const exportData = {
          metadata: {
            processed_at: new Date().toISOString(),
            original_count: params.data.length,
            processed_count: processedData.length,
            transformations_applied: params.transformations,
            analysis_type: params.analysisType,
            output_format: params.outputFormat,
          },
          analysis: analysisStep.data,
          data: processedData,
        };

        let formattedOutput: string;

        switch (params.outputFormat) {
          case 'json':
            formattedOutput = JSON.stringify(exportData, null, 2);
            break;

          case 'csv':
            if (processedData.length === 0) {
              formattedOutput = 'No data to export';
            } else {
              const headers = [...new Set(processedData.flatMap(Object.keys))];
              const csvRows = [
                headers.join(','),
                ...processedData.map((item) =>
                  headers.map((header) => {
                    const value = item[header];
                    return typeof value === 'string' && value.includes(',')
                      ? `"${value}"`
                      : String(value || '');
                  }).join(',')
                ),
              ];
              formattedOutput = csvRows.join('\n');
            }
            break;

          default:
            throw new Error(`Unsupported output format: ${params.outputFormat}`);
        }

        return {
          format: params.outputFormat,
          size_bytes: formattedOutput.length,
          output: formattedOutput,
        };
      });

      if (exportStep.success) {
        steps.push(this.createStepResult('export_results', true, {
          format: params.outputFormat,
          size_bytes: exportStep.data?.size_bytes || 0,
        }));
      } else {
        failed.push(exportStep.error!);
      }

      // Return final result
      const success = failed.length === 0;
      return {
        success,
        completed_steps: steps,
        failed_steps: failed,
        data: success
          ? {
            processed_data: processedData,
            analysis: analysisStep.data,
            exported_output: exportStep.data?.output,
          }
          : undefined,
        metadata: {
          pipeline: 'data_processing',
          original_items: params.data.length,
          processed_items: processedData.length,
          transformations_applied: params.transformations,
          analysis_performed: params.analysisType,
          output_format: params.outputFormat,
        },
      };
    } catch (error) {
      this.logError('Pipeline execution failed', error as Error);
      return this.createFailureResult(steps, failed, (error as Error).message);
    }
  }

  private analyzeDataTypes(data: any[]): Record<string, string[]> {
    const typeMap: Record<string, Set<string>> = {};

    for (const item of data) {
      for (const [key, value] of Object.entries(item)) {
        if (!typeMap[key]) {
          typeMap[key] = new Set();
        }
        typeMap[key].add(typeof value);
      }
    }

    const result: Record<string, string[]> = {};
    for (const [key, types] of Object.entries(typeMap)) {
      result[key] = Array.from(types);
    }

    return result;
  }

  private calculateStatistics(data: any[]): any {
    if (data.length === 0) return null;

    const numericFields: Record<string, number[]> = {};

    for (const item of data) {
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'number' && !isNaN(value)) {
          if (!numericFields[key]) {
            numericFields[key] = [];
          }
          numericFields[key].push(value);
        }
      }
    }

    const statistics: Record<string, any> = {};

    for (const [field, values] of Object.entries(numericFields)) {
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        statistics[field] = {
          count: values.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          median: sorted[Math.floor(sorted.length / 2)],
        };
      }
    }

    return statistics;
  }

  private createFailureResult(steps: any[], failed: any[], message: string): WorkflowResult {
    return {
      success: false,
      error: {
        type: 'system_error',
        message,
        details: 'Pipeline execution was interrupted',
        code: undefined,
        stack: undefined,
        recoverable: true,
      },
      completed_steps: steps,
      failed_steps: failed,
      metadata: {
        pipeline: 'data_processing',
        failure_reason: message,
      },
    };
  }
}

/**
 * File Management Workflow
 *
 * Multi-step pipeline: create → validate → process → archive
 * Demonstrates file lifecycle management patterns
 */
class FileManagementWorkflow extends WorkflowBase {
  readonly name = 'file_management_lifecycle';
  readonly version = '1.0.0';
  readonly description =
    'Complete file lifecycle management: create, validate, process, and archive';
  readonly category = 'utility' as const;
  readonly tags = ['files', 'lifecycle', 'management', 'validation'];
  override readonly estimatedDuration = 20;
  override readonly requiresAuth = false;

  readonly parameterSchema = z.object({
    userId: z.string(),
    requestId: z.string().optional(),
    dryRun: z.boolean().default(false),
    fileName: z.string().min(1).describe('Name of the file to manage'),
    content: z.string().describe('Initial content of the file'),
    validationRules: z.array(z.enum(['not_empty', 'valid_json', 'max_size', 'no_scripts']))
      .describe('Validation rules to apply'),
    processingOptions: z.object({
      format: z.enum(['pretty', 'minify', 'normalize']).default('pretty'),
      addMetadata: z.boolean().default(true),
      sanitize: z.boolean().default(true),
    }).default({
      format: 'pretty',
      addMetadata: true,
      sanitize: true,
    }).describe('Processing options'),
  });

  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'File Management Lifecycle',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration,
      tags: this.tags,
      author: 'Beyond MCP Server Examples',
      license: 'MIT',
      parameterSchema: this.parameterSchema,
    };
  }

  getOverview(): string {
    return `Complete file lifecycle management workflow that:
1. Creates a file with specified content
2. Validates content against configurable rules
3. Processes content with formatting and sanitization options
4. Archives the final result with metadata

Demonstrates state management and error recovery in file operations.`;
  }

  protected async executeWorkflow(params: any, context: WorkflowContext): Promise<WorkflowResult> {
    const steps: any[] = [];
    const failed: any[] = [];
    let fileContent = params.content;
    let fileMetadata: any = {};

    try {
      this.logInfo('Starting file management lifecycle', {
        fileName: params.fileName,
        contentLength: params.content.length,
        validationRules: params.validationRules,
      });

      // Step 1: Create File
      const createStep = await this.safeExecute('create_file', async () => {
        this.logInfo('Creating file with initial content');

        if (!params.fileName || params.fileName.trim().length === 0) {
          throw new Error('File name cannot be empty');
        }

        const fileInfo = {
          name: params.fileName.trim(),
          size: params.content.length,
          created_at: new Date().toISOString(),
          type: this.detectFileType(params.fileName),
          path: `/tmp/${params.fileName.trim()}`,
        };

        fileMetadata = {
          ...fileInfo,
          workflow_id: context.requestId,
          created_by: context.userId,
        };

        return fileInfo;
      });

      if (createStep.success) {
        steps.push(this.createStepResult('create_file', true, createStep.data));
      } else {
        failed.push(createStep.error!);
        return this.createFailureResult(steps, failed, 'File creation failed');
      }

      // Step 2: Validate Content
      for (const rule of params.validationRules) {
        const validationStep = await this.safeExecute(`validate_${rule}`, async () => {
          this.logInfo(`Applying validation rule: ${rule}`);

          switch (rule) {
            case 'not_empty':
              if (!fileContent || fileContent.trim().length === 0) {
                throw new Error('File content cannot be empty');
              }
              return { rule, result: 'passed', content_length: fileContent.length };

            case 'valid_json':
              try {
                JSON.parse(fileContent);
                return { rule, result: 'passed', message: 'Valid JSON structure' };
              } catch {
                throw new Error('Content is not valid JSON');
              }

            case 'max_size':
              const maxSize = 1024 * 1024; // 1MB limit
              if (fileContent.length > maxSize) {
                throw new Error(`File size (${fileContent.length}) exceeds maximum (${maxSize})`);
              }
              return { rule, result: 'passed', size: fileContent.length, max_size: maxSize };

            case 'no_scripts':
              const scriptPattern = /<script|javascript:|on\w+\s*=/i;
              if (scriptPattern.test(fileContent)) {
                throw new Error('Content contains potentially unsafe scripts');
              }
              return { rule, result: 'passed', message: 'No unsafe scripts detected' };

            default:
              throw new Error(`Unknown validation rule: ${rule}`);
          }
        });

        if (validationStep.success) {
          steps.push(this.createStepResult(`validate_${rule}`, true, validationStep.data));
        } else {
          // Add failed validation as both a step and a failed step for complete tracking
          steps.push(this.createStepResult(`validate_${rule}`, false, {
            rule,
            result: 'failed',
            error: validationStep.error?.message || 'Validation failed',
          }));
          failed.push(validationStep.error!);
        }
      }

      // Step 3: Process Content
      const processStep = await this.safeExecute('process_content', async () => {
        this.logInfo('Processing file content', { options: params.processingOptions });

        let processedContent = fileContent;

        // Apply formatting
        switch (params.processingOptions.format) {
          case 'pretty':
            try {
              const parsed = JSON.parse(processedContent);
              processedContent = JSON.stringify(parsed, null, 2);
            } catch {
              processedContent = processedContent
                .split('\n')
                .map((line: any) => line.trim())
                .filter((line: any) => line.length > 0)
                .join('\n');
            }
            break;

          case 'minify':
            try {
              const parsed = JSON.parse(processedContent);
              processedContent = JSON.stringify(parsed);
            } catch {
              processedContent = processedContent.replace(/\s+/g, ' ').trim();
            }
            break;

          case 'normalize':
            processedContent = processedContent
              .replace(/\r\n/g, '\n')
              .replace(/\t/g, '  ')
              .trim();
            break;
        }

        // Add metadata if requested
        if (params.processingOptions.addMetadata) {
          const metadata = {
            processed_at: new Date().toISOString(),
            original_size: fileContent.length,
            processed_size: processedContent.length,
            format_applied: params.processingOptions.format,
            sanitized: params.processingOptions.sanitize,
          };

          try {
            const parsed = JSON.parse(processedContent);
            parsed._metadata = metadata;
            processedContent = JSON.stringify(parsed, null, 2);
          } catch {
            processedContent = `// File Metadata: ${
              JSON.stringify(metadata)
            }\n\n${processedContent}`;
          }
        }

        // Sanitize if requested
        if (params.processingOptions.sanitize) {
          processedContent = processedContent
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        }

        return {
          original_size: fileContent.length,
          processed_size: processedContent.length,
          format_applied: params.processingOptions.format,
          metadata_added: params.processingOptions.addMetadata,
          sanitized: params.processingOptions.sanitize,
          processed_content: processedContent,
        };
      });

      if (processStep.success) {
        steps.push(this.createStepResult('process_content', true, {
          original_size: processStep.data?.original_size || 0,
          processed_size: processStep.data?.processed_size || 0,
          format_applied: processStep.data?.format_applied || 'none',
        }));
        fileContent = processStep.data?.processed_content || fileContent;
      } else {
        failed.push(processStep.error!);
      }

      // Step 4: Archive Results
      const archiveStep = await this.safeExecute('archive_file', async () => {
        this.logInfo('Archiving processed file');

        const archiveInfo = {
          original_file: {
            name: params.fileName,
            size: params.content.length,
            ...fileMetadata,
          },
          processed_file: {
            name: `${params.fileName}.processed`,
            size: fileContent.length,
            processed_at: new Date().toISOString(),
            processing_options: params.processingOptions,
          },
          validation_results: steps
            .filter((step) => step.operation.startsWith('validate_'))
            .map((step) => ({
              rule: step.operation.replace('validate_', ''),
              success: step.success,
              data: step.data,
            })),
          archive_location: `/archives/${Date.now()}-${params.fileName}`,
          archive_created_at: new Date().toISOString(),
        };

        return archiveInfo;
      });

      if (archiveStep.success) {
        steps.push(this.createStepResult('archive_file', true, archiveStep.data));
      } else {
        failed.push(archiveStep.error!);
      }

      // Return final result
      const success = failed.length === 0;
      return {
        success,
        completed_steps: steps,
        failed_steps: failed,
        data: success
          ? {
            file_info: fileMetadata,
            final_content: fileContent,
            validation_results: steps
              .filter((s) => s.operation.startsWith('validate_'))
              .map((s) => ({
                rule: s.operation.replace('validate_', ''),
                success: s.success,
                ...s.data,
              })),
            processing_applied: processStep.data,
            archive_info: archiveStep.data,
          }
          : undefined,
        metadata: {
          workflow: 'file_management',
          file_name: params.fileName,
          validations_passed: steps.filter((s) =>
            s.operation.startsWith('validate_') && s.success
          ).length,
          validations_failed: failed.filter((f) => f.operation.startsWith('validate_')).length,
          processing_completed: processStep.success,
          archived: archiveStep.success,
        },
      };
    } catch (error) {
      this.logError('File management workflow failed', error as Error);
      return this.createFailureResult(steps, failed, (error as Error).message);
    }
  }

  private detectFileType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      'json': 'application/json',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'html': 'text/html',
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'css': 'text/css',
    };
    return typeMap[extension || ''] || 'application/octet-stream';
  }

  private createFailureResult(steps: any[], failed: any[], message: string): WorkflowResult {
    return {
      success: false,
      error: {
        type: 'system_error',
        message,
        details: 'File management workflow was interrupted',
        code: undefined,
        stack: undefined,
        recoverable: true,
      },
      completed_steps: steps,
      failed_steps: failed,
      metadata: {
        workflow: 'file_management',
        failure_reason: message,
      },
    };
  }
}

/**
 * Content Generation Workflow
 *
 * Multi-step pipeline: plan → generate → review → publish
 * Demonstrates content creation with user interaction (elicitation)
 */
class ContentGenerationWorkflow extends WorkflowBase {
  readonly name = 'content_generation_pipeline';
  readonly version = '1.0.0';
  readonly description =
    'AI-powered content generation with planning, creation, review, and publishing steps';
  readonly category = 'automation' as const;
  readonly tags = ['content', 'generation', 'ai', 'review', 'publishing'];
  override readonly estimatedDuration = 45;
  override readonly requiresAuth = false;

  readonly parameterSchema = z.object({
    userId: z.string(),
    requestId: z.string().optional(),
    dryRun: z.boolean().default(false),
    contentType: z.enum(['blog', 'documentation', 'report']).describe(
      'Type of content to generate',
    ),
    topic: z.string().min(5).describe('Main topic or subject for the content'),
    requirements: z.object({
      wordCount: z.number().min(100).max(5000).default(500),
      tone: z.enum(['professional', 'casual', 'academic', 'friendly']).default('professional'),
      audience: z.string().default('general'),
      includeReferences: z.boolean().default(false),
    }).default({
      wordCount: 500,
      tone: 'professional',
      audience: 'general',
      includeReferences: false,
    }).describe('Content requirements and specifications'),
  });

  getRegistration(): WorkflowRegistration {
    return {
      name: this.name,
      displayName: 'Content Generation Pipeline',
      description: this.description,
      version: this.version,
      category: this.category,
      requiresAuth: this.requiresAuth,
      estimatedDuration: this.estimatedDuration,
      tags: this.tags,
      author: 'Beyond MCP Server Examples',
      license: 'MIT',
      parameterSchema: this.parameterSchema,
    };
  }

  getOverview(): string {
    return `AI-powered content generation workflow that:
1. Plans the content structure and outline
2. Generates content based on requirements and topic
3. Reviews content for quality and compliance (with user interaction)
4. Publishes the final content with metadata

Demonstrates elicitation for user interaction and complex multi-step content workflows.`;
  }

  protected async executeWorkflow(params: any, context: WorkflowContext): Promise<WorkflowResult> {
    const steps: any[] = [];
    const failed: any[] = [];
    let contentPlan: any = {};
    let generatedContent = '';
    let reviewedContent = '';

    try {
      this.logInfo('Starting content generation pipeline', {
        contentType: params.contentType,
        topic: params.topic,
        requirements: params.requirements,
      });

      // Step 1: Plan Content
      const planStep = await this.safeExecute('plan_content', async () => {
        this.logInfo('Planning content structure and outline');

        const plan = {
          content_type: params.contentType,
          topic: params.topic,
          target_word_count: params.requirements.wordCount,
          tone: params.requirements.tone,
          audience: params.requirements.audience,
          outline: this.generateOutline(params.contentType, params.topic),
          sections: this.generateSections(params.contentType),
          estimated_duration: Math.ceil(params.requirements.wordCount / 100) * 2,
          created_at: new Date().toISOString(),
        };

        contentPlan = plan;
        return plan;
      });

      if (planStep.success) {
        steps.push(this.createStepResult('plan_content', true, planStep.data));
      } else {
        failed.push(planStep.error!);
        return this.createFailureResult(steps, failed, 'Content planning failed');
      }

      // Step 2: Generate Content
      const generateStep = await this.safeExecute('generate_content', async () => {
        this.logInfo('Generating content based on plan');

        const content = this.generateMockContent(
          params.contentType,
          params.topic,
          params.requirements,
          contentPlan.outline,
        );

        const generationInfo = {
          word_count: content.split(' ').length,
          character_count: content.length,
          sections_generated: contentPlan.sections.length,
          generation_method: 'mock_ai',
          generated_at: new Date().toISOString(),
        };

        generatedContent = content;
        return generationInfo;
      });

      if (generateStep.success) {
        steps.push(this.createStepResult('generate_content', true, generateStep.data));
      } else {
        failed.push(generateStep.error!);
      }

      // Step 3: Review Content
      const reviewStep = await this.safeExecute('review_content', async () => {
        this.logInfo('Reviewing generated content');

        const reviewResults = {
          word_count_check: {
            target: params.requirements.wordCount,
            actual: generatedContent.split(' ').length,
            within_range: this.isWithinRange(
              generatedContent.split(' ').length,
              params.requirements.wordCount,
              0.2,
            ),
          },
          tone_check: {
            target: params.requirements.tone,
            detected: this.detectTone(generatedContent),
            matches: true,
          },
          quality_metrics: {
            readability_score: 75,
            grammar_issues: 0,
            spelling_issues: 0,
            structure_score: 85,
          },
          recommendations: this.generateRecommendations(generatedContent, params.requirements),
          reviewed_at: new Date().toISOString(),
        };

        reviewedContent = this.applyAutomatedImprovements(generatedContent, reviewResults);

        return reviewResults;
      });

      if (reviewStep.success) {
        steps.push(this.createStepResult('review_content', true, reviewStep.data));
      } else {
        failed.push(reviewStep.error!);
      }

      // Step 4: Publish Content
      const publishStep = await this.safeExecute('publish_content', async () => {
        this.logInfo('Publishing final content');

        const finalContent = reviewedContent || generatedContent;
        const publishInfo = {
          content_id: `content_${Date.now()}`,
          title: this.extractTitle(finalContent, params.topic),
          content_type: params.contentType,
          word_count: finalContent.split(' ').length,
          publish_url: `/published/content_${Date.now()}`,
          published_at: new Date().toISOString(),
          metadata: {
            author: params.userId,
            topic: params.topic,
            audience: params.requirements.audience,
            tone: params.requirements.tone,
            wordCount: params.requirements.wordCount,
            includeReferences: params.requirements.includeReferences,
            requirements: params.requirements,
            generation_workflow: this.name,
            version: this.version,
          },
          content_preview: finalContent.substring(0, 200) + '...',
        };

        return publishInfo;
      });

      if (publishStep.success) {
        steps.push(this.createStepResult('publish_content', true, publishStep.data));
      } else {
        failed.push(publishStep.error!);
      }

      // Return final result
      const success = failed.length === 0;
      return {
        success,
        completed_steps: steps,
        failed_steps: failed,
        data: success
          ? {
            content_plan: contentPlan,
            generated_content: generatedContent,
            reviewed_content: reviewedContent,
            publish_info: publishStep.data,
            full_content: reviewedContent || generatedContent,
          }
          : undefined,
        metadata: {
          workflow: 'content_generation',
          content_type: params.contentType,
          topic: params.topic,
          planning_completed: planStep.success,
          generation_completed: generateStep.success,
          review_completed: reviewStep.success,
          publishing_completed: publishStep.success,
          final_word_count: (reviewedContent || generatedContent).split(' ').length,
        },
      };
    } catch (error) {
      this.logError('Content generation workflow failed', error as Error);
      return this.createFailureResult(steps, failed, (error as Error).message);
    }
  }

  private generateOutline(contentType: string, topic: string): string[] {
    const outlines: Record<string, string[]> = {
      blog: [
        'Introduction and hook',
        'Main points and arguments',
        'Supporting examples and evidence',
        'Practical applications',
        'Conclusion and call-to-action',
      ],
      documentation: [
        'Overview and purpose',
        'Prerequisites and requirements',
        'Step-by-step instructions',
        'Examples and use cases',
        'Troubleshooting and FAQ',
      ],
      report: [
        'Executive summary',
        'Background and methodology',
        'Key findings and analysis',
        'Recommendations',
        'Conclusion and next steps',
      ],
    };

    return outlines[contentType] || outlines.blog!;
  }

  private generateSections(contentType: string): string[] {
    const sections: Record<string, string[]> = {
      blog: ['header', 'introduction', 'main_content', 'conclusion', 'footer'],
      documentation: ['overview', 'installation', 'usage', 'examples', 'api_reference'],
      report: ['summary', 'introduction', 'analysis', 'recommendations', 'appendix'],
    };

    return sections[contentType] || sections.blog!;
  }

  private generateMockContent(
    contentType: string,
    topic: string,
    requirements: any,
    outline: string[],
  ): string {
    const paragraphs = [
      `This ${contentType} explores the topic of "${topic}" in detail, providing valuable insights and practical information for ${requirements.audience} audiences.`,
      `Understanding ${topic} is crucial for anyone working in this field, as it impacts various aspects of modern practices and industry standards.`,
      `The research and analysis presented here demonstrate the importance of ${topic} in current technology trends and business applications.`,
      `Key considerations include the technical aspects, practical applications, and potential challenges that organizations face when implementing solutions.`,
      `By examining real-world examples and case studies, we can better appreciate the significance of ${topic} and its transformative potential.`,
      `Future developments in this area promise to bring new opportunities and innovative solutions that will reshape how we approach these challenges.`,
      `In conclusion, ${topic} represents a vital area of focus that deserves continued attention and strategic investment from industry leaders.`,
    ];

    const targetParagraphs = Math.max(3, Math.ceil(requirements.wordCount / 100));
    let content = `# ${this.extractTitle('', topic)}\n\n`;

    for (let i = 0; i < Math.min(targetParagraphs, outline.length); i++) {
      const paragraph = paragraphs[i % paragraphs.length];
      content += `## ${outline[i]}\n\n${paragraph}\n\n`;
    }

    return content.trim();
  }

  private isWithinRange(actual: number, target: number, tolerance: number): boolean {
    const min = target * (1 - tolerance);
    const max = target * (1 + tolerance);
    return actual >= min && actual <= max;
  }

  private detectTone(content: string): string {
    if (content.includes('Furthermore') || content.includes('Therefore')) {
      return 'academic';
    }
    if (content.includes('!') || content.includes('awesome') || content.includes('great')) {
      return 'casual';
    }
    return 'professional';
  }

  private generateRecommendations(content: string, requirements: any): string[] {
    const recommendations = [];

    const wordCount = content.split(' ').length;
    if (wordCount < requirements.wordCount * 0.8) {
      recommendations.push('Consider expanding content to meet word count target');
    }
    if (wordCount > requirements.wordCount * 1.2) {
      recommendations.push('Consider condensing content to meet word count target');
    }

    if (!content.includes('\n#')) {
      recommendations.push('Add section headers to improve structure');
    }

    if (requirements.includeReferences && !content.includes('http')) {
      recommendations.push('Consider adding relevant references and links');
    }

    return recommendations.length > 0 ? recommendations : ['Content meets quality standards'];
  }

  private applyAutomatedImprovements(content: string, reviewResults: any): string {
    let improved = content;

    if (!improved.includes('conclusion') && !improved.includes('Conclusion')) {
      improved +=
        '\n\n## Conclusion\n\nThis analysis provides a comprehensive overview of the topic and its implications for future development.';
    }

    return improved;
  }

  private extractTitle(content: string, fallbackTopic: string): string {
    const match = content.match(/^#\s+(.+)/m);
    if (match) {
      return match[1]!;
    }

    return `Understanding ${fallbackTopic}: A Comprehensive Guide`;
  }

  private createFailureResult(steps: any[], failed: any[], message: string): WorkflowResult {
    return {
      success: false,
      error: {
        type: 'system_error',
        message,
        details: 'Content generation workflow was interrupted',
        code: undefined,
        stack: undefined,
        recoverable: true,
      },
      completed_steps: steps,
      failed_steps: failed,
      metadata: {
        workflow: 'content_generation',
        failure_reason: message,
      },
    };
  }
}

/**
 * Workflow Plugin Implementation
 *
 * This plugin demonstrates the CORRECT pattern:
 * - Populate workflows array with workflow instances
 * - Populate tools array with basic utility tools
 * - PluginManager handles all registration automatically
 * - Clean, minimal plugin structure with comprehensive workflows
 */
const WorkflowPlugin: AppPlugin = {
  name: 'workflow-plugin',
  version: '1.0.0',
  description:
    'Comprehensive workflow demonstrations with multi-step processing and state management',
  author: 'Beyond MCP Server Examples',
  license: 'MIT',

  // Plugin metadata for discovery and documentation
  tags: ['workflows', 'multi-step', 'state-management', 'examples'],

  // 🔧 Workflows array - populated with comprehensive workflow implementations
  // PluginManager will automatically register these workflows
  workflows: [
    new DataProcessingWorkflow(),
    new FileManagementWorkflow(),
    new ContentGenerationWorkflow(),
  ],

  // 🛠️ Tools array - basic utility tools (fewer than simple example)
  // Focus is on workflows, but some tools are useful for supporting operations
  tools: [
    // Quick datetime utility
    {
      name: 'current_datetime',
      definition: {
        title: 'Current DateTime',
        description: 'Get current date and time in ISO format',
        category: 'utility',
        tags: ['datetime', 'utility'],
        inputSchema: {
          timezone: z.string().optional().describe('Timezone (e.g., "UTC", "America/New_York")'),
        },
      },
      handler: async (args: any) => {
        try {
          const timezone = args.timezone || 'UTC';
          const now = new Date();
          const formatted = timezone === 'UTC'
            ? now.toISOString()
            : now.toLocaleString('en-US', { timeZone: timezone });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(
                {
                  datetime: formatted,
                  timezone,
                  unix_timestamp: Math.floor(now.getTime() / 1000),
                },
                null,
                2,
              ),
            }],
            metadata: { tool: 'current_datetime', timezone },
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }],
            isError: true,
          };
        }
      },
    },

    // Basic JSON validator
    {
      name: 'validate_json',
      definition: {
        title: 'Validate JSON',
        description: 'Validate JSON strings quickly',
        category: 'utility',
        tags: ['validation', 'json'],
        inputSchema: {
          json_string: z.string().describe('JSON string to validate'),
        },
      },
      handler: async (args: any) => {
        try {
          JSON.parse(args.json_string);
          return {
            content: [{
              type: 'text',
              text: '✅ JSON is valid',
            }],
            metadata: { tool: 'validate_json', valid: true },
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `❌ JSON validation failed: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            }],
            metadata: { tool: 'validate_json', valid: false },
          };
        }
      },
    },
  ],
};

// Make plugin discoverable as default export
export default WorkflowPlugin;
