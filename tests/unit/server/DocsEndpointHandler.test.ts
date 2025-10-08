/**
 * DocsEndpointHandler Test - Documentation Endpoint Tests
 *
 * Tests the documentation endpoint functionality including content loading,
 * format negotiation, frontmatter parsing, HTML conversion, and security.
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { DocsEndpointHandler } from '../../../src/lib/server/DocsEndpointHandler.ts';
import type {
  DocsContentModule,
  DocsEndpointConfig,
} from '../../../src/lib/types/DocsTypes.ts';
import { createMockLogger } from '../../utils/test-helpers.ts';

// Mock content module for testing
function createMockContentModule(): DocsContentModule {
  const docs: Record<string, string> = {
    'getting-started': `---
title: Getting Started
description: Quick start guide
---
# Getting Started

Welcome to the documentation.

## Installation

\`\`\`bash
npm install example
\`\`\`
`,
    'api-reference': `---
title: API Reference
description: Complete API documentation
---
# API Reference

## Endpoints

### GET /api/status

Returns server status.
`,
    'no-frontmatter': `# Simple Document

This document has no frontmatter.
`,
  };

  return {
    get: (fileName: string) => docs[fileName],
    list: () => Object.keys(docs),
  };
}

Deno.test('DocsEndpointHandler - Initialization', async (t) => {
  const logger = createMockLogger();

  await t.step('should initialize with content module', () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);

    assertExists(handler);
    assertEquals(handler.path, '/docs');
  });

  await t.step('should initialize with direct content map', () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/documentation',
      content: new Map([['doc', '# Document']]),
      allowListing: true,
      enableCache: false,
    };

    const handler = new DocsEndpointHandler(config, logger);

    assertExists(handler);
    assertEquals(handler.path, '/documentation');
  });

  await t.step('should initialize with empty content', () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      content: new Map(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);

    assertExists(handler);
  });
});

Deno.test('DocsEndpointHandler - Listing', async (t) => {
  const logger = createMockLogger();

  await t.step('should return HTML listing when enabled', async () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('content-type'), 'text/html; charset=utf-8');

    const html = await response.text();
    assertStringIncludes(html, 'Documentation');
    assertStringIncludes(html, 'getting-started');
    assertStringIncludes(html, 'Getting Started');
    assertStringIncludes(html, 'Quick start guide');
  });

  await t.step('should return 403 when listing disabled', async () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: false,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs');
    const response = await handler.handle(request);

    assertEquals(response.status, 403);
  });

  await t.step('should handle empty docs gracefully', async () => {
    const emptyModule: DocsContentModule = {
      get: () => undefined,
      list: () => [],
    };

    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: emptyModule,
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'No documentation available');
  });
});

Deno.test('DocsEndpointHandler - Markdown Format', async (t) => {
  const logger = createMockLogger();
  const config: DocsEndpointConfig = {
    enabled: true,
    path: '/docs',
    contentModule: createMockContentModule(),
    allowListing: true,
    enableCache: true,
  };

  await t.step('should serve markdown with .md extension', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/getting-started.md');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('content-type'), 'text/markdown; charset=utf-8');

    const markdown = await response.text();
    assertStringIncludes(markdown, '---');
    assertStringIncludes(markdown, 'title: Getting Started');
    assertStringIncludes(markdown, '# Getting Started');
  });

  await t.step('should return 404 for non-existent document', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/non-existent.md');
    const response = await handler.handle(request);

    assertEquals(response.status, 404);
  });
});

Deno.test('DocsEndpointHandler - HTML Format', async (t) => {
  const logger = createMockLogger();
  const config: DocsEndpointConfig = {
    enabled: true,
    path: '/docs',
    contentModule: createMockContentModule(),
    allowListing: true,
    enableCache: true,
  };

  await t.step('should serve HTML with .html extension', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/getting-started.html');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('content-type'), 'text/html; charset=utf-8');

    const html = await response.text();
    assertStringIncludes(html, '<!DOCTYPE html>');
    assertStringIncludes(html, '<title>Getting Started</title>');
    assertStringIncludes(html, '<meta name="description" content="Quick start guide">');
    assertStringIncludes(html, '<h1');
    assertStringIncludes(html, 'Getting Started');
  });

  await t.step('should serve HTML without extension (default)', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/getting-started');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('content-type'), 'text/html; charset=utf-8');

    const html = await response.text();
    assertStringIncludes(html, '<!DOCTYPE html>');
    assertStringIncludes(html, '<title>Getting Started</title>');
  });

  await t.step('should handle document without frontmatter', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/no-frontmatter.html');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);

    const html = await response.text();
    assertStringIncludes(html, '<!DOCTYPE html>');
    assertStringIncludes(html, '<title>no-frontmatter</title>'); // Uses filename as title
    assertStringIncludes(html, 'Simple Document');
  });

  await t.step('should include syntax highlighting styles', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/getting-started.html');
    const response = await handler.handle(request);

    const html = await response.text();
    assertStringIncludes(html, 'highlight.js');
    assertStringIncludes(html, 'github-dark');
  });

  await t.step('should render code blocks with highlighting', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/getting-started.html');
    const response = await handler.handle(request);

    const html = await response.text();
    assertStringIncludes(html, '<code');
    assertStringIncludes(html, 'npm install');
  });
});

Deno.test('DocsEndpointHandler - Security', async (t) => {
  const logger = createMockLogger();
  const config: DocsEndpointConfig = {
    enabled: true,
    path: '/docs',
    contentModule: createMockContentModule(),
    allowListing: true,
    enableCache: true,
  };

  await t.step('should prevent path traversal with ..', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    // Path after /docs is "../secrets.md" which contains ..
    const request = new Request('http://localhost:3000/docs/..%2Fsecrets.md');
    const response = await handler.handle(request);

    assertEquals(response.status, 400);
    const html = await response.text();
    assertStringIncludes(html, 'Invalid path');
  });

  await t.step('should block path with multiple traversal attempts', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    // Test another path traversal variant
    const request = new Request('http://localhost:3000/docs/..%2F..%2Fsecrets');
    const response = await handler.handle(request);

    // Should detect the .. and return 400
    assertEquals(response.status, 400);
  });

  await t.step('should reject unsupported file extensions', async () => {
    // Create a document that exists but request with unsupported extension
    const testModule: DocsContentModule = {
      get: (fileName: string) => fileName === 'script' ? '# Script' : undefined,
      list: () => ['script'],
    };
    const testConfig: DocsEndpointConfig = {
      ...config,
      contentModule: testModule,
    };
    const testHandler = new DocsEndpointHandler(testConfig, logger);
    const request = new Request('http://localhost:3000/docs/script.js');
    const response = await testHandler.handle(request);

    assertEquals(response.status, 400);
    const html = await response.text();
    assertStringIncludes(html, 'Unsupported file extension');
  });

  await t.step('should reject POST requests', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/getting-started', {
      method: 'POST',
    });
    const response = await handler.handle(request);

    assertEquals(response.status, 405);
    const html = await response.text();
    assertStringIncludes(html, 'Method not allowed');
  });
});

Deno.test('DocsEndpointHandler - Caching', async (t) => {
  const logger = createMockLogger();

  await t.step('should cache HTML when enabled', async () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);

    // First request - should cache
    const request1 = new Request('http://localhost:3000/docs/getting-started');
    const response1 = await handler.handle(request1);
    assertEquals(response1.status, 200);
    await response1.text();

    // Check cache stats
    const stats = handler.getCacheStats();
    assertEquals(stats.size, 1);
    assertEquals(stats.entries.includes('getting-started'), true);

    // Second request - should use cache
    const request2 = new Request('http://localhost:3000/docs/getting-started');
    const response2 = await handler.handle(request2);
    assertEquals(response2.status, 200);
    await response2.text();

    // Cache size should remain the same
    const stats2 = handler.getCacheStats();
    assertEquals(stats2.size, 1);
  });

  await t.step('should not cache when disabled', async () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: false,
    };

    const handler = new DocsEndpointHandler(config, logger);

    const request = new Request('http://localhost:3000/docs/getting-started');
    const response = await handler.handle(request);
    assertEquals(response.status, 200);
    await response.text();

    const stats = handler.getCacheStats();
    assertEquals(stats.size, 0);
  });

  await t.step('should not cache markdown requests', async () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);

    const request = new Request('http://localhost:3000/docs/getting-started.md');
    const response = await handler.handle(request);
    assertEquals(response.status, 200);
    await response.text();

    const stats = handler.getCacheStats();
    assertEquals(stats.size, 0);
  });

  await t.step('should clear cache', async () => {
    const config: DocsEndpointConfig = {
      enabled: true,
      path: '/docs',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(config, logger);

    // Add to cache
    const request = new Request('http://localhost:3000/docs/getting-started');
    const response = await handler.handle(request);
    await response.text();

    let stats = handler.getCacheStats();
    assertEquals(stats.size, 1);

    // Clear cache
    handler.clearCache();

    stats = handler.getCacheStats();
    assertEquals(stats.size, 0);
  });
});

Deno.test('DocsEndpointHandler - Path Handling', async (t) => {
  const logger = createMockLogger();
  const config: DocsEndpointConfig = {
    enabled: true,
    path: '/docs',
    contentModule: createMockContentModule(),
    allowListing: true,
    enableCache: true,
  };

  await t.step('should handle path with trailing slash', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Documentation');
  });

  await t.step('should handle custom base path', async () => {
    const customConfig: DocsEndpointConfig = {
      enabled: true,
      path: '/documentation',
      contentModule: createMockContentModule(),
      allowListing: true,
      enableCache: true,
    };

    const handler = new DocsEndpointHandler(customConfig, logger);
    assertEquals(handler.path, '/documentation');

    const request = new Request('http://localhost:3000/documentation/getting-started');
    const response = await handler.handle(request);

    assertEquals(response.status, 200);
  });
});

Deno.test('DocsEndpointHandler - Error Responses', async (t) => {
  const logger = createMockLogger();
  const config: DocsEndpointConfig = {
    enabled: true,
    path: '/docs',
    contentModule: createMockContentModule(),
    allowListing: true,
    enableCache: true,
  };

  await t.step('should return HTML error page for 404', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/non-existent');
    const response = await handler.handle(request);

    assertEquals(response.status, 404);
    assertEquals(response.headers.get('content-type'), 'text/html; charset=utf-8');

    const html = await response.text();
    assertStringIncludes(html, '<!DOCTYPE html>');
    assertStringIncludes(html, 'Error 404');
    assertStringIncludes(html, 'not found');
  });

  await t.step('should return HTML error page for 400', async () => {
    const handler = new DocsEndpointHandler(config, logger);
    const request = new Request('http://localhost:3000/docs/..%2Fsecrets');
    const response = await handler.handle(request);

    assertEquals(response.status, 400);

    const html = await response.text();
    assertStringIncludes(html, 'Error 400');
    assertStringIncludes(html, 'Invalid path');
  });
});
