/**
 * Documentation Endpoint Types
 *
 * Type definitions for the documentation serving system.
 * Supports in-memory content modules for compiled applications
 * with future extensibility for directory-based content.
 */

import type { Logger } from '../utils/Logger.ts';

/**
 * Content module interface for documentation
 *
 * Consuming applications implement this interface to provide
 * documentation content. This pattern works well for compiled
 * applications where docs are embedded.
 *
 * @example
 * ```typescript
 * // docs/content.ts
 * const GUIDE = `# Guide\n...`;
 * const API_REF = `# API\n...`;
 *
 * const docsMap: Record<string, string> = {
 *   'guide': GUIDE,
 *   'api-reference': API_REF,
 * };
 *
 * export function get(fileName: string): string | undefined {
 *   return docsMap[fileName];
 * }
 *
 * export function list(): string[] {
 *   return Object.keys(docsMap);
 * }
 * ```
 */
export interface DocsContentModule {
  /**
   * Get documentation content by file name (without extension)
   * @param fileName - Document identifier (e.g., 'guide', 'api-reference')
   * @returns Markdown content or undefined if not found
   */
  get(fileName: string): string | undefined;

  /**
   * List all available document identifiers
   * @returns Array of document file names
   */
  list(): string[];
}

/**
 * Documentation endpoint configuration
 */
export interface DocsEndpointConfig {
  /**
   * Whether the docs endpoint is enabled
   * @default false
   */
  enabled: boolean;

  /**
   * URL path for the docs endpoint
   * @default '/docs'
   */
  path: string;

  /**
   * Content module providing documentation (Priority 1)
   * Recommended for compiled applications
   */
  contentModule?: DocsContentModule;

  /**
   * Direct content map (Priority 2)
   * Fallback if contentModule is not provided
   */
  content?: Map<string, string> | Record<string, string>;

  // TODO: Future - Directory-based content loading
  // /**
  //  * Directory path containing markdown files
  //  * @future Priority 3
  //  */
  // directory?: string;
  //
  // /**
  //  * Default directory to check for docs
  //  * @future Priority 4
  //  */
  // defaultDirectory?: string;

  /**
   * Allow directory listing at root docs path
   * @default true
   */
  allowListing: boolean;

  /**
   * Cache converted HTML in memory
   * Recommended for production with static docs
   * @default true
   */
  enableCache: boolean;

  // TODO: Future - Authentication
  // /**
  //  * Require authentication to access docs
  //  * @future
  //  */
  // requireAuth?: boolean;
}

/**
 * Frontmatter metadata extracted from markdown
 */
export interface DocsFrontmatter {
  /**
   * Document title (for HTML <title> and <h1>)
   */
  title?: string;

  /**
   * Document description (for HTML <meta>)
   */
  description?: string;

  /**
   * Additional metadata
   */
  [key: string]: unknown;
}

/**
 * Parsed document with content and metadata
 */
export interface ParsedDocument {
  /**
   * Original markdown content (without frontmatter)
   */
  markdown: string;

  /**
   * Extracted frontmatter metadata
   */
  frontmatter: DocsFrontmatter;

  /**
   * Document identifier
   */
  fileName: string;
}

/**
 * Content loading options for DocsContentLoader
 */
export interface DocsContentLoaderOptions {
  /**
   * Logger instance
   */
  logger: Logger;

  /**
   * Content module (Priority 1)
   */
  contentModule?: DocsContentModule;

  /**
   * Direct content (Priority 2)
   */
  content?: Map<string, string> | Record<string, string>;

  // TODO: Future
  // directory?: string;
  // defaultDirectory?: string;
}

/**
 * Content loading result
 */
export interface DocsContentLoaderResult {
  /**
   * Function to get document content
   */
  get(fileName: string): string | undefined;

  /**
   * Function to list all available documents
   */
  list(): string[];

  /**
   * Loading strategy used
   */
  strategy: 'contentModule' | 'contentMap' | 'none';
}
