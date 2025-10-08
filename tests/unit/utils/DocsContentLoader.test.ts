/**
 * Tests for DocsContentLoader utility
 */

import { assertEquals, assertExists } from 'jsr:@std/assert';
import {
  getDocsContentSummary,
  loadDocsContent,
  validateDocsContent,
} from '../../../src/lib/utils/DocsContentLoader.ts';
import type { DocsContentModule } from '../../../src/lib/types/DocsTypes.ts';
import { createMockLogger } from '../../utils/test-helpers.ts';

Deno.test('DocsContentLoader', async (t) => {
  const logger = createMockLogger();

  await t.step('should load content from content module (highest priority)', () => {
    const mockModule: DocsContentModule = {
      get: (fileName: string) => {
        const docs: Record<string, string> = {
          'guide': '# Guide\n\nContent here',
          'api': '# API\n\nAPI docs',
        };
        return docs[fileName];
      },
      list: () => ['guide', 'api'],
    };

    const result = loadDocsContent({
      logger,
      contentModule: mockModule,
      content: new Map([['fallback', 'Should not use this']]), // Should be ignored
    });

    assertEquals(result.strategy, 'contentModule');
    assertEquals(result.list(), ['guide', 'api']);
    assertEquals(result.get('guide'), '# Guide\n\nContent here');
    assertEquals(result.get('api'), '# API\n\nAPI docs');
  });

  await t.step('should load content from Map when no module', () => {
    const contentMap = new Map([
      ['doc1', '# Document 1'],
      ['doc2', '# Document 2'],
    ]);

    const result = loadDocsContent({
      logger,
      content: contentMap,
    });

    assertEquals(result.strategy, 'contentMap');
    assertEquals(result.list(), ['doc1', 'doc2']);
    assertEquals(result.get('doc1'), '# Document 1');
    assertEquals(result.get('doc2'), '# Document 2');
  });

  await t.step('should load content from Record when no module', () => {
    const contentRecord = {
      'doc1': '# Document 1',
      'doc2': '# Document 2',
    };

    const result = loadDocsContent({
      logger,
      content: contentRecord,
    });

    assertEquals(result.strategy, 'contentMap');
    assertEquals(result.list().sort(), ['doc1', 'doc2'].sort());
    assertEquals(result.get('doc1'), '# Document 1');
  });

  await t.step('should return empty result when no content source', () => {
    const result = loadDocsContent({
      logger,
      // No content module or content provided
    });

    assertEquals(result.strategy, 'none');
    assertEquals(result.list(), []);
    assertEquals(result.get('anything'), undefined);
  });

  await t.step('should handle empty content module', () => {
    const emptyModule: DocsContentModule = {
      get: () => undefined,
      list: () => [],
    };

    const result = loadDocsContent({
      logger,
      contentModule: emptyModule,
    });

    assertEquals(result.strategy, 'contentModule');
    assertEquals(result.list(), []);
    assertEquals(result.get('anything'), undefined);
  });

  await t.step('should handle module with undefined returns', () => {
    const sparseModule: DocsContentModule = {
      get: (fileName: string) => {
        if (fileName === 'exists') return '# Exists';
        return undefined;
      },
      list: () => ['exists'],
    };

    const result = loadDocsContent({
      logger,
      contentModule: sparseModule,
    });

    assertEquals(result.get('exists'), '# Exists');
    assertEquals(result.get('not-exists'), undefined);
  });
});

Deno.test('validateDocsContent', async (t) => {
  const logger = createMockLogger();

  await t.step('should validate content with documents', () => {
    const mockModule: DocsContentModule = {
      get: (fileName: string) => `# ${fileName}`,
      list: () => ['doc1', 'doc2', 'doc3'],
    };

    const result = loadDocsContent({
      logger,
      contentModule: mockModule,
    });

    const isValid = validateDocsContent(result, logger);
    assertEquals(isValid, true);
  });

  await t.step('should reject empty content', () => {
    const emptyModule: DocsContentModule = {
      get: () => undefined,
      list: () => [],
    };

    const result = loadDocsContent({
      logger,
      contentModule: emptyModule,
    });

    const isValid = validateDocsContent(result, logger);
    assertEquals(isValid, false);
  });

  await t.step('should reject no content source', () => {
    const result = loadDocsContent({
      logger,
    });

    const isValid = validateDocsContent(result, logger);
    assertEquals(isValid, false);
  });

  await t.step('should validate with contentMap strategy', () => {
    const result = loadDocsContent({
      logger,
      content: new Map([['doc', '# Content']]),
    });

    const isValid = validateDocsContent(result, logger);
    assertEquals(isValid, true);
  });
});

Deno.test('getDocsContentSummary', async (t) => {
  const logger = createMockLogger();

  await t.step('should return summary with content module', () => {
    const mockModule: DocsContentModule = {
      get: () => '# Doc',
      list: () => ['doc'],
    };

    const summary = getDocsContentSummary({
      logger,
      contentModule: mockModule,
    });

    assertEquals(summary.hasContentModule, true);
    assertEquals(summary.hasContentMap, false);
    assertExists(summary.strategies);
    assertEquals(Array.isArray(summary.strategies), true);
  });

  await t.step('should return summary with content map', () => {
    const summary = getDocsContentSummary({
      logger,
      content: new Map([['doc', '# Content']]),
    });

    assertEquals(summary.hasContentModule, false);
    assertEquals(summary.hasContentMap, true);
  });

  await t.step('should return summary with both sources', () => {
    const mockModule: DocsContentModule = {
      get: () => '# Doc',
      list: () => ['doc'],
    };

    const summary = getDocsContentSummary({
      logger,
      contentModule: mockModule,
      content: new Map([['fallback', '# Fallback']]),
    });

    assertEquals(summary.hasContentModule, true);
    assertEquals(summary.hasContentMap, true);
  });

  await t.step('should return summary with no sources', () => {
    const summary = getDocsContentSummary({
      logger,
    });

    assertEquals(summary.hasContentModule, false);
    assertEquals(summary.hasContentMap, false);
  });
});
