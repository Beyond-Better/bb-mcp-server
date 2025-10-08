# Documentation Endpoint Example

This example demonstrates how to use the `DocsEndpointHandler` to serve documentation via HTTP endpoint.

## Features Demonstrated

- ✅ In-memory documentation content module
- ✅ Markdown with frontmatter
- ✅ Content negotiation (.md vs .html)
- ✅ Directory listing
- ✅ HTML caching
- ✅ Syntax highlighting
- ✅ Responsive design

## Running the Example

```bash
# From the bb-mcp-server root directory
deno run --allow-all examples/docs-endpoint/main.ts
```

## Testing the Endpoint

### List All Documentation
```bash
curl http://localhost:3000/docs
```

### Get as HTML (default)
```bash
curl http://localhost:3000/docs/getting-started
# or explicitly
curl http://localhost:3000/docs/getting-started.html
```

### Get as Markdown
```bash
curl http://localhost:3000/docs/getting-started.md
```

### View in Browser
Open http://localhost:3000/docs in your browser to see:
- Styled documentation listing
- Clickable links to each document
- Beautiful markdown rendering with syntax highlighting

## Available Documents

1. **getting-started** - Quick start guide
2. **api-reference** - Complete API documentation
3. **workflows** - Guide to workflows
4. **examples** - Common usage patterns

## Project Structure

```
examples/docs-endpoint/
├── main.ts              # Server entry point
├── docs/
│   └── content.ts       # Documentation content module
└── README.md            # This file
```

## Content Module Pattern

The `docs/content.ts` file demonstrates the recommended pattern:

```typescript
// Define documentation constants
const GETTING_STARTED = `---
title: Getting Started
description: Quick start guide
---
# Content here...
`;

// Create documentation map
const docsMap: Record<string, string> = {
  'getting-started': GETTING_STARTED,
  // ... more docs
};

// Export required interface
export function get(fileName: string): string | undefined {
  return docsMap[fileName];
}

export function list(): string[] {
  return Object.keys(docsMap);
}
```

## Configuration

The example uses these settings:

```typescript
docsEndpointConfig: {
  enabled: true,           // Enable the endpoint
  path: '/docs',           // URL path
  contentModule: docsContent,  // Content source
  allowListing: true,      // Enable /docs listing
  enableCache: true,       // Cache HTML conversions
}
```

## Environment Variables

You can also configure via environment:

```bash
# Enable docs endpoint
DOCS_ENDPOINT_ENABLED=true

# Custom path
DOCS_ENDPOINT_PATH=/documentation

# Disable listing
DOCS_ENDPOINT_ALLOW_LISTING=false

# Disable caching
DOCS_ENDPOINT_ENABLE_CACHE=false
```

## Next Steps

1. **Customize Content**: Edit `docs/content.ts` with your own documentation
2. **Add More Docs**: Add more entries to the `docsMap`
3. **Use in Production**: See [DOCS-ENDPOINT-GUIDE.md](../../docs/DOCS-ENDPOINT-GUIDE.md) for advanced usage
4. **Integrate with Workflows**: Reference docs in your workflow overviews

## See Also

- [Documentation Endpoint Guide](../../docs/DOCS-ENDPOINT-GUIDE.md)
- [HTTP Server Example](../http-server/)
- [Basic Server Example](../basic-server/)
