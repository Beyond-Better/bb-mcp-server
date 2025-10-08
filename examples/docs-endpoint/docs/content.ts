/**
 * Example Documentation Content Module
 *
 * Demonstrates how to structure documentation for the DocsEndpointHandler.
 * This pattern works well for compiled applications where docs are embedded.
 */

const GETTING_STARTED = `---
title: Getting Started
description: Quick start guide for using this MCP server
author: Example Team
date: 2024-10-08
---

# Getting Started

Welcome! This guide will help you get started with our MCP server.

## Installation

\`\`\`bash
npm install @example/mcp-server
\`\`\`

## Basic Usage

Create a simple server:

\`\`\`typescript
import { AppServer } from '@example/mcp-server';

const server = await AppServer.create();
await server.start();
\`\`\`

## Configuration

Configure via environment variables:

\`\`\`bash
MCP_TRANSPORT=http
HTTP_PORT=3000
LOG_LEVEL=info
\`\`\`

## Next Steps

- Read the [API Reference](api-reference) for detailed documentation
- Check out [Examples](examples) for common use cases
- Learn about [Workflows](workflows) to extend functionality
`;

const API_REFERENCE = `---
title: API Reference
description: Complete API documentation
---

# API Reference

Complete reference for all available APIs and endpoints.

## Endpoints

### GET /api/v1/status

Returns server status information.

**Response:**
\`\`\`json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12345
}
\`\`\`

### GET /api/v1/workflows

Returns list of available workflows.

**Response:**
\`\`\`json
{
  "total": 2,
  "workflows": [
    {
      "name": "example_workflow",
      "version": "1.0.0",
      "description": "Example workflow"
    }
  ]
}
\`\`\`

## Authentication

All API requests require OAuth 2.0 authentication.

### Get Access Token

\`\`\`bash
curl -X POST http://localhost:3000/token \\
  -d "grant_type=authorization_code" \\
  -d "code=YOUR_AUTH_CODE" \\
  -d "client_id=YOUR_CLIENT_ID"
\`\`\`

### Use Access Token

\`\`\`bash
curl http://localhost:3000/api/v1/status \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
\`\`\`
`;

const WORKFLOWS = `---
title: Workflows Guide
description: Guide to creating and using workflows
---

# Workflows Guide

Workflows are the primary way to extend server functionality.

## Available Workflows

### Example Workflow

Performs example operations.

**Usage:**
\`\`\`typescript
const result = await executeWorkflow('example_workflow', {
  operation: 'process',
  data: { foo: 'bar' }
});
\`\`\`

## Creating Custom Workflows

Extend the `WorkflowBase` class:

\`\`\`typescript
import { WorkflowBase } from '@example/mcp-server';

export class MyWorkflow extends WorkflowBase {
  name = 'my_workflow';
  version = '1.0.0';
  description = 'My custom workflow';
  
  async execute(params: any): Promise<WorkflowResult> {
    // Your workflow logic here
    return {
      success: true,
      data: { message: 'Workflow executed' }
    };
  }
}
\`\`\`

## Registration

Register workflows during server setup:

\`\`\`typescript
const server = await AppServer.create(async () => {
  return {
    customWorkflows: [
      new MyWorkflow()
    ]
  };
});
\`\`\`
`;

const EXAMPLES = `---
title: Examples
description: Common usage examples
---

# Examples

Collection of common usage patterns and examples.

## Example 1: Basic HTTP Server

\`\`\`typescript
import { AppServer } from '@example/mcp-server';

const server = await AppServer.create(async ({ configManager }) => {
  return {
    serverConfig: {
      name: 'my-server',
      version: '1.0.0',
      description: 'My MCP server'
    }
  };
});

await server.start();
\`\`\`

## Example 2: With OAuth Provider

\`\`\`typescript
const server = await AppServer.create(async () => {
  return {
    serverConfig: {
      name: 'secure-server',
      version: '1.0.0',
      description: 'Server with OAuth'
    }
  };
});

await server.start();
// OAuth provider configured via environment variables
\`\`\`

## Example 3: Custom Workflow

\`\`\`typescript
import { WorkflowBase } from '@example/mcp-server';

class DataProcessingWorkflow extends WorkflowBase {
  name = 'data_processing';
  version = '1.0.0';
  description = 'Processes data';
  
  async execute(params: { input: string }): Promise<WorkflowResult> {
    const processed = params.input.toUpperCase();
    return {
      success: true,
      data: { output: processed }
    };
  }
}

const server = await AppServer.create(async () => {
  return {
    customWorkflows: [new DataProcessingWorkflow()]
  };
});
\`\`\`

## Example 4: Documentation Endpoint

\`\`\`typescript
import * as docsContent from './docs/content.ts';

const server = await AppServer.create(async () => {
  return {
    docsEndpointConfig: {
      enabled: true,
      path: '/docs',
      contentModule: docsContent,
      allowListing: true,
      enableCache: true
    }
  };
});
\`\`\`
`;

// Documentation map
const docsMap: Record<string, string> = {
  'getting-started': GETTING_STARTED,
  'api-reference': API_REFERENCE,
  'workflows': WORKFLOWS,
  'examples': EXAMPLES,
};

/**
 * Get documentation content by file name
 */
export function get(fileName: string): string | undefined {
  return docsMap[fileName];
}

/**
 * List all available documentation files
 */
export function list(): string[] {
  return Object.keys(docsMap);
}
