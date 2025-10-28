/**
 * Workflow Tools - Core workflow integration tools for bb-mcp-server
 *
 * Provides execute_workflow and get_schema_for_workflow tools that integrate
 * with the WorkflowRegistry to enable workflow execution via MCP.
 *
 * These tools are automatically registered by BeyondMcpServer when workflows exist.
 */

import { z } from 'zod';
import type { CallToolResult } from 'mcp/types.js';

// Import library components
import type { Logger } from '../utils/Logger.ts';
import type { AuditLogger } from '../utils/AuditLogger.ts';
import type { ToolRegistry } from './ToolRegistry.ts';
import type { WorkflowRegistry } from '../workflows/WorkflowRegistry.ts';
import { BeyondMcpServer } from '../server/BeyondMcpServer.ts';
import { ToolRegistry as ToolRegistryClass } from './ToolRegistry.ts';
import {
  ToolHandlerMode,
  type ToolRegistrationConfig,
  WorkflowToolNaming,
} from '../types/BeyondMcpTypes.ts';

// Import helper utilities
import { ToolValidationHelper } from '../utils/ToolValidationHelper.ts';
//import { ZodToJsonSchema } from '../utils/ZodToJsonSchema.ts'
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface WorkflowToolsDependencies {
  workflowRegistry: WorkflowRegistry;
  logger: Logger;
  auditLogger?: AuditLogger;
}

/**
 * Core workflow tools that integrate WorkflowRegistry with MCP
 */
export class WorkflowTools {
  private workflowRegistry: WorkflowRegistry;
  private logger: Logger;
  private auditLogger?: AuditLogger;

  constructor(dependencies: WorkflowToolsDependencies) {
    this.workflowRegistry = dependencies.workflowRegistry;
    this.logger = dependencies.logger;
    if (dependencies.auditLogger) {
      this.auditLogger = dependencies.auditLogger;
    }
  }

  /**
   * Register workflow tools with the ToolRegistry
   * Only registers if workflows exist
   */
  registerWith(
    toolRegistry: ToolRegistry,
    config: ToolRegistrationConfig,
    appName?: string,
  ): void {
    const toolData = this.workflowRegistry.getWorkflowToolData();

    if (!toolData.hasWorkflows) {
      this.logger.debug('WorkflowTools: No workflows registered, skipping workflow tools');
      return;
    }

    if (config.workflowTools.executeWorkflow.enabled) {
      this.registerExecuteWorkflowTool(toolRegistry, config, appName);
    }

    if (config.workflowTools.getSchemaWorkflow.enabled) {
      this.registerGetSchemaWorkflowTool(toolRegistry, config, appName);
    }

    this.logger.info('WorkflowTools: Workflow tools registered', {
      workflowCount: toolData.count,
      executeWorkflow: config.workflowTools.executeWorkflow.enabled,
      getSchemaWorkflow: config.workflowTools.getSchemaWorkflow.enabled,
      namingMode: config.workflowTools.naming,
    });
  }

  /**
   * Register execute_workflow tool
   */
  private registerExecuteWorkflowTool(
    registry: ToolRegistry,
    config: ToolRegistrationConfig,
    appName?: string,
  ): void {
    const toolData = this.workflowRegistry.getWorkflowToolData();
    const toolName = this.getExecuteWorkflowToolName(config, appName);

    registry.registerTool(
      toolName,
      {
        title: '🎯 Execute Workflow',
        description: this.buildExecuteWorkflowDescription(toolData),
        category: 'Workflows',
        tags: ['workflow', 'execution', 'business-logic'],
        inputSchema: {
          workflow_name: ToolRegistryClass.createDynamicEnum(toolData.names),
          parameters: z.object({
            userId: z.string().optional().describe(
              'User ID for authentication (ONLY for admin/system delegation - DO NOT make up userIds - omit to use authenticated session user)',
            ),
            requestId: z.string().optional().describe('Optional request ID for tracking'),
            dryRun: z.boolean().optional().default(false).describe(
              'Dry run mode - validate but do not execute',
            ),
          }).passthrough().describe('Workflow parameters'),
        },
      },
      async (args, extra) => await this.executeWorkflow(args, extra as Record<string, unknown>),
      { handlerMode: ToolHandlerMode.MANAGED }, // Use managed mode for workflows
    );
  }

  /**
   * Register get_schema_for_workflow tool
   */
  private registerGetSchemaWorkflowTool(
    registry: ToolRegistry,
    config: ToolRegistrationConfig,
    appName?: string,
  ): void {
    const toolData = this.workflowRegistry.getWorkflowToolData();
    const toolName = this.getSchemaWorkflowToolName(config, appName);

    registry.registerTool(
      toolName,
      {
        title: '📋 Get Workflow Schema',
        description: this.buildGetSchemaDescription(toolData),
        category: 'Workflows',
        tags: ['workflow', 'schema', 'validation', 'discovery'],
        inputSchema: {
          workflow_name: ToolRegistryClass.createDynamicEnum(toolData.names).describe(
            'Name of the workflow to get schema for',
          ),
        },
      },
      async (args, extra) =>
        await this.getSchemaForWorkflow(args, extra as Record<string, unknown>),
      { handlerMode: ToolHandlerMode.MANAGED }, // Use managed mode for workflows
    );
  }

  /**
   * Get tool name for execute_workflow based on naming configuration
   */
  private getExecuteWorkflowToolName(
    config: ToolRegistrationConfig,
    appName?: string,
  ): string {
    switch (config.workflowTools.naming) {
      case WorkflowToolNaming.SIMPLE:
        return 'execute_workflow';
      case WorkflowToolNaming.NAMESPACED:
        return appName ? `execute_workflow_${appName}` : 'execute_workflow';
      case WorkflowToolNaming.CUSTOM:
        return config.workflowTools.customNames?.executeWorkflow || 'execute_workflow';
      default:
        return 'execute_workflow';
    }
  }

  /**
   * Get tool name for get_schema_for_workflow based on naming configuration
   */
  private getSchemaWorkflowToolName(
    config: ToolRegistrationConfig,
    appName?: string,
  ): string {
    switch (config.workflowTools.naming) {
      case WorkflowToolNaming.SIMPLE:
        return 'get_schema_for_workflow';
      case WorkflowToolNaming.NAMESPACED:
        return appName ? `get_schema_for_workflow_${appName}` : 'get_schema_for_workflow';
      case WorkflowToolNaming.CUSTOM:
        return config.workflowTools.customNames?.getSchemaWorkflow || 'get_schema_for_workflow';
      default:
        return 'get_schema_for_workflow';
    }
  }

  /**
   * Build dynamic description for execute_workflow tool
   */
  private buildExecuteWorkflowDescription(toolData: {
    overviews: string;
    count: number;
  }): string {
    return `🎯 **PRIMARY WORKFLOW INTEGRATION TOOL** - Execute specialized workflows with comprehensive parameter validation and structured results.

**⚡ Workflows should be your FIRST CHOICE** for complex operations before considering other tools.

**✨ AVAILABLE WORKFLOWS:**
${toolData.overviews}

**📋 WORKFLOW SELECTION GUIDANCE:**
• Always get the workflow schema first using get_schema_for_workflow tool
• Use workflows for complex, multi-step business operations
• Each workflow includes comprehensive validation and detailed error reporting
• Check workflow category and tags for appropriate use cases`;
  }

  /**
   * Build dynamic description for get_schema_for_workflow tool
   */
  private buildGetSchemaDescription(toolData: {
    names: string[];
    count: number;
  }): string {
    return `📋 **GET WORKFLOW SCHEMA** - Essential tool for discovering workflow parameters and requirements.

**⚡ CRITICAL: Always get the schema BEFORE executing any workflow** to understand parameter requirements, validation rules, and available options.

**Available workflows:** ${toolData.names.join(', ')}

**🛠️ USAGE PATTERN:**
1️⃣ Use this tool to get detailed workflow schema
2️⃣ Review parameter requirements and validation rules
3️⃣ Use execute_workflow with proper parameters

**📊 ENHANCED FEATURES:**
• Includes workflow overview with tags for quick understanding
• Comprehensive parameter validation schemas
• Usage examples and best practices`;
  }

  /**
   * Execute workflow handler
   */
  private async executeWorkflow(
    args: { workflow_name: string; parameters: Record<string, unknown> },
    extra?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      // this.logger.info('WorkflowTools: Executing workflow', {args, extra});
      const { workflow_name, parameters } = args;

      //this.logger.info('WorkflowTools: Executing workflow', { workflowNames: this.workflowRegistry.getWorkflowNames()});
      // Get workflow from registry
      const workflow = this.workflowRegistry.getWorkflow(workflow_name);
      if (!workflow) {
        const availableWorkflows = this.workflowRegistry.getWorkflowNames();
        throw new Error(
          `Workflow '${workflow_name}' not found. Available workflows: ${
            availableWorkflows.join(', ')
          }`,
        );
      }

      // Extract authentication context from AsyncLocalStorage or extra parameter
      const authContext = BeyondMcpServer.getCurrentAuthContext();
      const userId = (parameters as any)?.userId ||
        authContext?.authenticatedUserId ||
        BeyondMcpServer.getCurrentAuthenticatedUserId();

      this.logger.info('WorkflowTools: Executing workflow', {
        userId,
        authenticatedUserId: authContext?.authenticatedUserId,
        clientId: authContext?.clientId,
        workflowName: workflow_name,
        hasParameters: !!parameters,
        parameterKeys: Object.keys(parameters || {}),
        authContext,
      });

      // Build complete workflow context with authentication details
      const workflowContext: any = {
        userId: userId || '',
        requestId: (parameters as any)?.requestId || authContext?.requestId || crypto.randomUUID(),
        workflowName: workflow_name,
        startTime: new Date(),
        auditLogger: this.auditLogger,
        beyondMcpServer: BeyondMcpServer.getInstance(),
        logger: this.logger,
        requestMetadata: (extra?._meta || {}) as Record<string, unknown>,  // Map _meta to requestMetadata for WorkflowContext
        // Authentication context from AsyncLocalStorage
        authenticatedUserId: authContext?.authenticatedUserId,
        clientId: authContext?.clientId,
        scopes: authContext?.scopes,
        parameterUserId: (parameters as any)?.userId,
        // Note: kvManager and thirdPartyClient would need to be injected via dependencies
        kvManager: undefined,
        thirdPartyClient: undefined,
      };

      // Execute workflow with full authentication context
      const result = await workflow.executeWithValidation(parameters, workflowContext);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workflow: workflow_name,
                status: 'success',
                result,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      this.logger.error(
        'WorkflowTools: Workflow execution failed',
        error instanceof Error ? error : new Error(String(error)),
      );

      return ToolValidationHelper.createStandardErrorResponse(
        error instanceof Error ? error : new Error(String(error)),
        'execute_workflow',
      );
    }
  }

  /**
   * Get schema for workflow handler
   */
  private async getSchemaForWorkflow(
    args: { workflow_name: string },
    extra?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      const { workflow_name } = args;

      const registration = this.workflowRegistry.getRegistration(workflow_name);
      if (!registration) {
        const availableWorkflows = this.workflowRegistry.getWorkflowNames();
        throw new Error(
          `Workflow not found: ${workflow_name}. Available workflows: ${
            availableWorkflows.join(', ')
          }`,
        );
      }

      // Get the actual workflow instance to access getOverview()
      const workflow = this.workflowRegistry.getWorkflow(workflow_name);
      const overview = workflow?.getOverview() || registration.displayName;

      const schema = {
        name: registration.name,
        displayName: registration.displayName,
        overview: overview,
        description: registration.description,
        version: registration.version,
        category: registration.category,
        requiresAuth: registration.requiresAuth,
        estimatedDuration: registration.estimatedDuration,
        tags: registration.tags || [],
        //parameterSchema: ZodToJsonSchema.convertWithFallback(
        //  registration.parameterSchema,
        //  `Parameter schema for ${workflow_name} workflow`
        //), // Convert Zod schema to JSON Schema for tool response
        parameterSchema: zodToJsonSchema(registration.parameterSchema), // Convert Zod schema to JSON Schema for tool response
        usage: {
          instructions: [
            '1. Review the parameter schema and required fields',
            '2. Prepare parameters according to the schema validation rules',
            '3. Execute the workflow using execute_workflow tool with proper parameters',
          ],
          workflowGuidance: {
            bestPractices: [
              'Always validate parameters against the schema',
              'Check requiresAuth field - authentication needed for operations',
              'Review estimatedDuration for workflow complexity assessment',
            ],
          },
        },
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error(
        'WorkflowTools: Get schema failed',
        error instanceof Error ? error : new Error(String(error)),
      );

      return ToolValidationHelper.createStandardErrorResponse(
        error instanceof Error ? error : new Error(String(error)),
        'get_schema_for_workflow',
      );
    }
  }
}
