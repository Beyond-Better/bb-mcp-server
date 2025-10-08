# Documentation Endpoint Guide

The bb-mcp-server library provides a built-in documentation endpoint system that allows you to serve documentation files via HTTP. This is particularly useful for:

- Providing documentation to LLMs without filesystem access
- Creating user-friendly documentation portals
- Serving workflow guides and API references
- Supporting both human and machine-readable formats

## Features

✨ **Content Negotiation**: Serve markdown as-is or convert to styled HTML
📦 **In-Memory Content**: Perfect for compiled applications
🎨 **Modern Styling**: GitHub-style markdown rendering with syntax highlighting
🔍 **Frontmatter Support**: Extract metadata for titles and descriptions
⚡ **Caching**: Optional HTML caching for performance
🔒 **Security**: Built-in path traversal prevention

## Quick Start

### 1. Create Documentation Content Module

Create a module that exports your documentation content:

```typescript
// src/docs/content.ts
const QUERY_GUIDE = `---
title: Query Workflow Guide
description: Complete guide to using the query workflow
---
# Query Workflow Guide

This guide explains how to use the query workflow...

## Basic Usage

\`\`\`typescript
const result = await workflow.execute({
  entity: 'matters',
  operation: 'list'
});
\`\`\`
`;

const API_REFERENCE = `---
title: API Reference
description: Complete API documentation
---
# API Reference

## Available Endpoints

### GET /api/v1/workflows

Returns list of available workflows...
`;

const docsMap: Record<string, string> = {
  'query-guide': QUERY_GUIDE,
  'api-reference': API_REFERENCE,
};

export function get(fileName: string): string | undefined {
  return docsMap[fileName];
}

export function list(): string[] {
  return Object.keys(docsMap);
}
```

### 2. Configure in AppServer

```typescript
import { AppServer } from '@beyondbetter/bb-mcp-server';
import * as docsContent from './docs/content.ts';

const server = await AppServer.create(async ({ configManager, logger }) => {
  return {
    docsEndpointConfig: {
      enabled: true,
      path: '/docs',
      contentModule: docsContent,
      allowListing: true,
      enableCache: true,
    },
  };
});

await server.start();
```

### 3. Access Documentation

**Browser/HTTP Clients:**
- `http://localhost:3000/docs` - List all available docs
- `http://localhost:3000/docs/query-guide` - View as HTML
- `http://localhost:3000/docs/query-guide.md` - Download as markdown
- `http://localhost:3000/docs/query-guide.html` - Explicit HTML request

**From LLM/Code:**
```typescript
// Fetch documentation programmatically
const response = await fetch('http://localhost:3000/docs/query-guide.md');
const guide = await response.text();
```

## Configuration Options

### DocsEndpointConfig

```typescript
interface DocsEndpointConfig {
  /** Enable the docs endpoint */
  enabled: boolean;
  
  /** URL path (default: '/docs') */
  path: string;
  
  /** Content module (recommended for compiled apps) */
  contentModule?: DocsContentModule;
  
  /** Direct content map (alternative to contentModule) */
  content?: Map<string, string> | Record<string, string>;
  
  /** Allow directory listing at /docs */
  allowListing: boolean;
  
  /** Cache converted HTML in memory */
  enableCache: boolean;
}
```

### Environment Variables

```bash
# Enable docs endpoint
DOCS_ENDPOINT_ENABLED=true

# Custom path
DOCS_ENDPOINT_PATH=/documentation

# Allow listing
DOCS_ENDPOINT_ALLOW_LISTING=true

# Enable caching
DOCS_ENDPOINT_ENABLE_CACHE=true
```

## Content Module Interface

Implement this interface for custom content sources:

```typescript
interface DocsContentModule {
  /**
   * Get documentation content by file name (without extension)
   */
  get(fileName: string): string | undefined;
  
  /**
   * List all available document identifiers
   */
  list(): string[];
}
```

## Frontmatter Support

Add YAML frontmatter to your markdown for better HTML rendering:

```markdown
---
title: My Document Title
description: Brief description for meta tags
author: Your Name
date: 2024-10-08
---

# My Document Title

Content goes here...
```

**Supported Fields:**
- `title` - Used for HTML `<title>` and heading
- `description` - Used for HTML `<meta name="description">`
- Any other fields are parsed but not currently used

## Content Negotiation

The endpoint supports three formats:

### 1. Raw Markdown (`.md`)
```bash
curl http://localhost:3000/docs/guide.md
# Returns: Raw markdown content
# Content-Type: text/markdown
```

### 2. HTML (`.html` or no extension)
```bash
curl http://localhost:3000/docs/guide.html
curl http://localhost:3000/docs/guide
# Returns: Styled HTML page
# Content-Type: text/html
```

### 3. Listing (root path)
```bash
curl http://localhost:3000/docs
# Returns: HTML listing of all documents
```

## Advanced Usage

### Custom DocsEndpointHandler

For advanced customization, provide your own handler:

```typescript
import { DocsEndpointHandler } from '@beyondbetter/bb-mcp-server';

class MyCustomDocsHandler extends DocsEndpointHandler {
  // Override methods for custom behavior
  async handle(request: Request): Promise<Response> {
    // Custom authentication logic
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Call parent handler
    return await super.handle(request);
  }
}

const server = await AppServer.create(async ({ configManager, logger }) => {
  return {
    docsEndpointHandler: new MyCustomDocsHandler({
      enabled: true,
      path: '/docs',
      contentModule: docsContent,
      allowListing: true,
      enableCache: true,
    }, logger),
  };
});
```

### Direct Content Map

Alternative to content module:

```typescript
const server = await AppServer.create(async () => {
  return {
    docsEndpointConfig: {
      enabled: true,
      path: '/docs',
      content: new Map([
        ['guide', '# Guide\n\nContent here...'],
        ['api', '# API\n\nAPI docs here...'],
      ]),
      allowListing: true,
      enableCache: true,
    },
  };
});
```

### Cache Management

Access cache management methods:

```typescript
import { getDocsEndpointHandler } from '@beyondbetter/bb-mcp-server';

const handler = getDocsEndpointHandler(configManager, logger, config);

// Get cache statistics
const stats = handler.getCacheStats();
console.log(`Cache size: ${stats.size}`);
console.log(`Cached entries: ${stats.entries.join(', ')}`);

// Clear cache
handler.clearCache();
```

## Integration with Workflows

Reference docs in workflow overviews:

```typescript
class MyWorkflow extends WorkflowBase {
  getOverview(): string {
    const serverUrl = this.config?.publicUrl || 'http://localhost:3000';
    
    return `
🔍 **My Workflow**

Complete documentation: ${serverUrl}/docs/workflow-guide

## Quick Reference
- Operation guide: ${serverUrl}/docs/operations
- Examples: ${serverUrl}/docs/examples
    `.trim();
  }
}
```

## Security Considerations

### Built-in Security Features

1. **Path Traversal Prevention**
   - Blocks `..` in paths
   - Rejects absolute paths
   - Validates file extensions

2. **Content Source Control**
   - Only serves from configured content
   - No filesystem access (when using contentModule)

3. **Extension Validation**
   - Only serves `.md` and `.html` (converted)
   - Rejects other file types

### Future Authentication (Not Yet Implemented)

```typescript
// Future feature - design placeholder
interface DocsEndpointConfig {
  // ... existing fields ...
  
  // Future: Authentication support
  // requireAuth?: boolean;
  // allowedRoles?: string[];
  // authProvider?: (request: Request) => Promise<boolean>;
}
```

## Styling and Customization

The default HTML rendering includes:

- **GitHub-style markdown** - Familiar formatting
- **Syntax highlighting** - Via highlight.js (github-dark theme)
- **Responsive design** - Works on mobile and desktop
- **Dark mode support** - Respects `prefers-color-scheme`
- **Clean typography** - System fonts for fast loading

### Custom Styling (Future)

For now, the styling is built-in. Future versions will support:
- Custom CSS injection
- Theme selection
- Layout templates

## Troubleshooting

### Docs endpoint not working

**Check configuration:**
```typescript
// Ensure enabled is true
docsEndpointConfig: {
  enabled: true,  // ← Must be true
  // ...
}
```

**Check HTTP transport:**
```bash
# Docs endpoint only works with HTTP transport
MCP_TRANSPORT=http
```

**Check logs:**
```bash
LOG_LEVEL=debug
# Look for: "DocsEndpointHandler: Initialized"
```

### Content not found

**Verify content module:**
```typescript
// Test your content module
import * as docsContent from './docs/content.ts';

console.log(docsContent.list());
console.log(docsContent.get('query-guide'));
```

**Check file names:**
- Use kebab-case: `query-guide` not `queryGuide`
- No extensions in module: `'guide'` not `'guide.md'`

### HTML not rendering

**Check markdown syntax:**
- Ensure valid markdown
- Test with simple content first

**Check frontmatter:**
```yaml
---
title: Test
---
# Content
```
- Must have `---` delimiters
- Must be valid YAML
- Must be at start of file

## Examples

### Complete Example Server

```typescript
// main.ts
import { AppServer } from '@beyondbetter/bb-mcp-server';
import * as docsContent from './docs/content.ts';

const server = await AppServer.create(async ({ configManager, logger }) => {
  return {
    serverConfig: {
      name: 'my-mcp-server',
      version: '1.0.0',
      title: 'My MCP Server',
      description: 'Server with documentation',
    },
    docsEndpointConfig: {
      enabled: true,
      path: '/docs',
      contentModule: docsContent,
      allowListing: true,
      enableCache: true,
    },
  };
});

await server.start();
console.log('Server running on http://localhost:3000');
console.log('Documentation at http://localhost:3000/docs');
```

### Multiple Documentation Sets

```typescript
// docs/workflow-docs.ts
export function get(fileName: string): string | undefined {
  // Workflow documentation
}
export function list(): string[] { /* ... */ }

// docs/api-docs.ts
export function get(fileName: string): string | undefined {
  // API documentation
}
export function list(): string[] { /* ... */ }

// Combine them:
const allDocs: Record<string, string> = {
  ...Object.fromEntries(workflowDocs.list().map(name => [
    `workflow-${name}`,
    workflowDocs.get(name)!
  ])),
  ...Object.fromEntries(apiDocs.list().map(name => [
    `api-${name}`,
    apiDocs.get(name)!
  ])),
};

export function get(fileName: string) {
  return allDocs[fileName];
}

export function list() {
  return Object.keys(allDocs);
}
```

## Future Enhancements

Planned features for future versions:

### Generic Endpoint System
```typescript
// TODO: Future - Generic custom endpoints
interface EndpointHandler {
  path: string;
  handle(request: Request): Promise<Response>;
}

const server = await AppServer.create(async () => {
  return {
    customEndpoints: [
      new WebhookHandler('/webhook'),
      new CustomApiHandler('/custom-api'),
    ],
  };
});
```

### Directory-Based Content
```typescript
// TODO: Future - Load from filesystem directory
docsEndpointConfig: {
  enabled: true,
  path: '/docs',
  directory: './docs', // Load from filesystem
  watchForChanges: true, // Hot reload in dev
}
```

### Authentication
```typescript
// TODO: Future - Built-in auth support
docsEndpointConfig: {
  enabled: true,
  path: '/docs',
  contentModule: docsContent,
  requireAuth: true,
  allowedRoles: ['admin', 'user'],
}
```

## See Also

- [InstructionsLoader Guide](./INSTRUCTIONS-LOADER-GUIDE.md) - Similar pattern for MCP instructions
- [HTTP Server Guide](./HTTP-SERVER-GUIDE.md) - HTTP transport configuration
- [Workflow Development Guide](./WORKFLOW-DEVELOPMENT-GUIDE.md) - Creating workflows
