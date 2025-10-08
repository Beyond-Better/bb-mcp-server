/**
 * Documentation Content Loader
 *
 * Provides flexible loading of documentation content with fallback strategies.
 * Similar to InstructionsLoader but designed for multiple documents.
 *
 * Loading Priority:
 * 1. Content module (recommended for compiled apps)
 * 2. Direct content map/record
 * 3. TODO: Directory-based loading (future)
 * 4. TODO: Default directory (future)
 */

import type { DocsContentLoaderOptions, DocsContentLoaderResult } from '../types/DocsTypes.ts';
import type { Logger } from '../utils/Logger.ts';

/**
 * Load documentation content using configurable strategy with fallbacks
 */
export function loadDocsContent(
  options: DocsContentLoaderOptions,
): DocsContentLoaderResult {
  const { logger, contentModule, content } = options;

  // Strategy 1: Use content module (highest priority)
  if (contentModule) {
    logger.debug('DocsContentLoader: Using content module');
    return {
      get: (fileName: string) => contentModule.get(fileName),
      list: () => contentModule.list(),
      strategy: 'contentModule',
    };
  }

  // Strategy 2: Use direct content map/record
  if (content) {
    logger.debug('DocsContentLoader: Using direct content map');
    const contentMap = content instanceof Map ? content : new Map(Object.entries(content));

    return {
      get: (fileName: string) => contentMap.get(fileName),
      list: () => Array.from(contentMap.keys()),
      strategy: 'contentMap',
    };
  }

  // TODO: Strategy 3: Load from configured directory
  // if (directory) {
  //   logger.debug(`DocsContentLoader: Loading from directory: ${directory}`);
  //   // Implementation for directory-based loading
  // }

  // TODO: Strategy 4: Load from default directory
  // if (defaultDirectory) {
  //   logger.debug(`DocsContentLoader: Loading from default directory: ${defaultDirectory}`);
  //   // Implementation for default directory loading
  // }

  // No content source available
  logger.warn('DocsContentLoader: No content source configured');
  return {
    get: () => undefined,
    list: () => [],
    strategy: 'none',
  };
}

/**
 * Validate that documentation content was loaded successfully
 */
export function validateDocsContent(
  result: DocsContentLoaderResult,
  logger: Logger,
): boolean {
  const docs = result.list();
  const isValid = docs.length > 0;

  if (isValid) {
    logger.info('DocsContentLoader: Content loaded successfully', {
      strategy: result.strategy,
      documentCount: docs.length,
      documents: docs,
    });
  } else {
    logger.warn('DocsContentLoader: No documents available', {
      strategy: result.strategy,
    });
  }

  return isValid;
}

/**
 * Get a summary of content loading for debugging
 */
export function getDocsContentSummary(
  options: DocsContentLoaderOptions,
): {
  hasContentModule: boolean;
  hasContentMap: boolean;
  strategies: string[];
} {
  return {
    hasContentModule: !!options.contentModule,
    hasContentMap: !!options.content,
    strategies: [
      'contentModule',
      'contentMap',
      // TODO: Future strategies
      // 'directory',
      // 'defaultDirectory',
    ],
  };
}
