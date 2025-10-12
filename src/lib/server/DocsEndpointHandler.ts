/**
 * Documentation Endpoint Handler
 *
 * Serves documentation from in-memory content modules with:
 * - Content negotiation (markdown vs HTML)
 * - Frontmatter parsing for metadata
 * - Syntax highlighting
 * - Modern, responsive styling
 * - Security (path traversal prevention)
 * - Optional caching
 */

import { marked } from 'npm:marked@^12.0.0';
import { markedHighlight } from 'npm:marked-highlight@^2.1.0';
import hljs from 'npm:highlight.js@^11.9.0';
import matter from 'npm:gray-matter@^4.0.3';

import type { Logger } from '../utils/Logger.ts';
import type {
  DocsContentLoaderOptions,
  DocsContentLoaderResult,
  DocsEndpointConfig,
  DocsFrontmatter,
  ParsedDocument,
} from '../types/DocsTypes.ts';
import { loadDocsContent, validateDocsContent } from '../utils/DocsContentLoader.ts';

/**
 * HTML cache entry
 */
interface CacheEntry {
  html: string;
  timestamp: number;
}

/**
 * Documentation endpoint handler
 */
export class DocsEndpointHandler {
  private config: DocsEndpointConfig;
  private logger: Logger;
  private contentLoader: DocsContentLoaderResult;
  private htmlCache: Map<string, CacheEntry>;

  constructor(config: DocsEndpointConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.htmlCache = new Map();

    // Load content
    const loaderOptions: DocsContentLoaderOptions = { logger };
    if (config.contentModule !== undefined) {
      loaderOptions.contentModule = config.contentModule;
    }
    if (config.content !== undefined) {
      loaderOptions.content = config.content;
    }
    this.contentLoader = loadDocsContent(loaderOptions);

    // Validate content loaded
    validateDocsContent(this.contentLoader, logger);

    // Configure marked with syntax highlighting
    marked.use(
      markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code: string, lang: string) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        },
      }),
    );

    this.logger.info('DocsEndpointHandler: Initialized', {
      path: this.config.path,
      strategy: this.contentLoader.strategy,
      documentCount: this.contentLoader.list().length,
      cachingEnabled: this.config.enableCache,
    });
  }

  /**
   * Get the configured path for this handler
   */
  get path(): string {
    return this.config.path;
  }

  /**
   * Handle documentation requests
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // Remove base path
    if (pathname.startsWith(this.config.path)) {
      pathname = pathname.slice(this.config.path.length);
    }

    // Remove leading slash
    pathname = pathname.startsWith('/') ? pathname.slice(1) : pathname;

    this.logger.debug('DocsEndpointHandler: Handling request', {
      originalPath: url.pathname,
      cleanPath: pathname,
      method: request.method,
    });

    // Only handle GET requests
    if (request.method !== 'GET') {
      return this.errorResponse('Method not allowed', 405);
    }

    try {
      // Root path - list available docs
      if (!pathname || pathname === '' || pathname === '/') {
        if (!this.config.allowListing) {
          return this.errorResponse('Directory listing disabled', 403);
        }
        return await this.handleListing(request);
      }

      // Specific document requested
      return await this.handleDocument(pathname);
    } catch (error) {
      this.logger.error(
        'DocsEndpointHandler: Error handling request',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.errorResponse(
        'Internal server error',
        500,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Handle document listing
   */
  private async handleListing(request: Request): Promise<Response> {
    const docs = this.contentLoader.list();

    if (docs.length === 0) {
      return this.htmlResponse(
        this.generateEmptyListingHtml(),
        200,
      );
    }

    // Parse frontmatter for all docs to get titles
    const docInfos: Array<{ fileName: string; title: string; description?: string }> = docs.map(
      (fileName) => {
        const content = this.contentLoader.get(fileName);
        if (!content) return { fileName, title: fileName };

        const parsed = this.parseDocument(fileName, content);
        const info: { fileName: string; title: string; description?: string } = {
          fileName,
          title: parsed.frontmatter.title || fileName,
        };
        if (parsed.frontmatter.description !== undefined) {
          info.description = parsed.frontmatter.description;
        }
        return info;
      },
    );

    const html = this.generateListingHtml(docInfos);
    return this.htmlResponse(html, 200);
  }

  /**
   * Handle specific document request
   */
  private async handleDocument(pathname: string): Promise<Response> {
    // Security: Prevent path traversal
    if (this.isPathTraversal(pathname)) {
      this.logger.warn('DocsEndpointHandler: Path traversal attempt', { pathname });
      return this.errorResponse('Invalid path', 400);
    }

    // Parse file name and extension
    const { fileName, extension } = this.parsePathname(pathname);

    // Get content
    const content = this.contentLoader.get(fileName);
    if (!content) {
      return this.errorResponse(`Document '${fileName}' not found`, 404);
    }

    // Return based on extension
    switch (extension) {
      case 'md':
        return this.serveMarkdown(fileName, content);

      case 'html':
      case '':
        // Extensionless defaults to HTML
        return await this.serveHtml(fileName, content);

      default:
        return this.errorResponse(`Unsupported file extension: .${extension}`, 400);
    }
  }

  /**
   * Serve raw markdown
   */
  private serveMarkdown(fileName: string, content: string): Response {
    this.logger.debug('DocsEndpointHandler: Serving markdown', { fileName });

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  /**
   * Serve HTML (converted from markdown)
   */
  private async serveHtml(fileName: string, content: string): Promise<Response> {
    this.logger.debug('DocsEndpointHandler: Serving HTML', { fileName });

    // Check cache
    if (this.config.enableCache) {
      const cached = this.htmlCache.get(fileName);
      if (cached) {
        this.logger.debug('DocsEndpointHandler: Serving from cache', { fileName });
        return this.htmlResponse(cached.html, 200);
      }
    }

    // Parse and convert
    const parsed = this.parseDocument(fileName, content);
    const html = await this.convertToHtml(parsed);

    // Cache result
    if (this.config.enableCache) {
      this.htmlCache.set(fileName, {
        html,
        timestamp: Date.now(),
      });
    }

    return this.htmlResponse(html, 200);
  }

  /**
   * Parse document with frontmatter
   */
  private parseDocument(fileName: string, content: string): ParsedDocument {
    try {
      const parsed = matter(content);
      return {
        fileName,
        markdown: parsed.content,
        frontmatter: parsed.data as DocsFrontmatter,
      };
    } catch (error) {
      this.logger.warn('DocsEndpointHandler: Failed to parse frontmatter', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        fileName,
        markdown: content,
        frontmatter: {},
      };
    }
  }

  /**
   * Convert markdown to HTML with template
   */
  private async convertToHtml(doc: ParsedDocument): Promise<string> {
    const markdownHtml = await marked(doc.markdown);
    const title = doc.frontmatter.title || doc.fileName;
    const description = doc.frontmatter.description || '';

    return this.generateDocumentHtml(title, description, markdownHtml);
  }

  /**
   * Parse pathname into fileName and extension
   */
  private parsePathname(pathname: string): { fileName: string; extension: string } {
    const lastDot = pathname.lastIndexOf('.');

    if (lastDot === -1) {
      // No extension
      return { fileName: pathname, extension: '' };
    }

    const fileName = pathname.slice(0, lastDot);
    const extension = pathname.slice(lastDot + 1);

    return { fileName, extension };
  }

  /**
   * Check for path traversal attempts
   */
  private isPathTraversal(pathname: string): boolean {
    return pathname.includes('..') || pathname.startsWith('/') || pathname.includes('\\');
  }

  /**
   * Generate HTML for document listing
   */
  private generateListingHtml(
    docs: Array<{ fileName: string; title: string; description?: string }>,
  ): string {
    const docsList = docs
      .map(
        (doc) => `
        <li class="doc-item">
          <a href="${this.config.path}/${doc.fileName}" class="doc-link">
            <span class="doc-title">${this.escapeHtml(doc.title)}</span>
            ${
          doc.description
            ? `<span class="doc-description">${this.escapeHtml(doc.description)}</span>`
            : ''
        }
          </a>
        </li>
      `,
      )
      .join('\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation</title>
  ${this.getCommonStyles()}
  <style>
    .doc-list {
      list-style: none;
      padding: 0;
    }
    .doc-item {
      margin-bottom: 1.5rem;
      padding: 1rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      transition: border-color 0.2s;
    }
    .doc-item:hover {
      border-color: var(--link-color);
    }
    .doc-link {
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .doc-title {
      display: block;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--link-color);
      margin-bottom: 0.5rem;
    }
    .doc-description {
      display: block;
      color: var(--text-secondary);
      font-size: 0.95rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Documentation</h1>
    <p class="subtitle">Available documentation files</p>
    <ul class="doc-list">
      ${docsList}
    </ul>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML for empty listing
   */
  private generateEmptyListingHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation</title>
  ${this.getCommonStyles()}
</head>
<body>
  <div class="container">
    <h1>Documentation</h1>
    <p class="subtitle">No documentation available</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML for a document
   */
  private generateDocumentHtml(
    title: string,
    description: string,
    markdownHtml: string,
  ): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${this.escapeHtml(description)}">` : ''}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css">
  ${this.getCommonStyles()}
  ${this.getMarkdownStyles()}
</head>
<body>
  <div class="container">
    <article class="markdown-body">
      ${markdownHtml}
    </article>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get common styles for all pages
   */
  private getCommonStyles(): string {
    return `
  <style>
    :root {
      --bg-color: #ffffff;
      --text-color: #24292f;
      --text-secondary: #57606a;
      --border-color: #d0d7de;
      --link-color: #0969da;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --text-secondary: #8b949e;
        --border-color: #30363d;
        --link-color: #58a6ff;
      }
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background: var(--bg-color);
      color: var(--text-color);
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    @media (min-width: 768px) {
      .container {
        padding: 3rem 2rem;
      }
    }
    h1 {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
  </style>
    `.trim();
  }

  /**
   * Get markdown-specific styles
   */
  private getMarkdownStyles(): string {
    return `
  <style>
    .markdown-body {
      font-size: 16px;
    }
    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4,
    .markdown-body h5,
    .markdown-body h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    .markdown-body h1 {
      font-size: 2em;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.3em;
    }
    .markdown-body h2 {
      font-size: 1.5em;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.3em;
    }
    .markdown-body h3 {
      font-size: 1.25em;
    }
    .markdown-body p {
      margin-top: 0;
      margin-bottom: 16px;
    }
    .markdown-body a {
      color: var(--link-color);
      text-decoration: none;
    }
    .markdown-body a:hover {
      text-decoration: underline;
    }
    .markdown-body code {
      padding: 0.2em 0.4em;
      margin: 0;
      font-size: 85%;
      background-color: rgba(175, 184, 193, 0.2);
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    }
    .markdown-body pre {
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      background-color: #161b22;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .markdown-body pre code {
      display: inline;
      padding: 0;
      margin: 0;
      overflow: visible;
      line-height: inherit;
      background-color: transparent;
      border: 0;
    }
    .markdown-body blockquote {
      padding: 0 1em;
      color: var(--text-secondary);
      border-left: 0.25em solid var(--border-color);
      margin: 0 0 16px 0;
    }
    .markdown-body ul,
    .markdown-body ol {
      padding-left: 2em;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .markdown-body li {
      margin-bottom: 0.25em;
    }
    .markdown-body table {
      border-spacing: 0;
      border-collapse: collapse;
      margin-bottom: 16px;
      width: 100%;
    }
    .markdown-body table th,
    .markdown-body table td {
      padding: 6px 13px;
      border: 1px solid var(--border-color);
    }
    .markdown-body table th {
      font-weight: 600;
      background-color: rgba(175, 184, 193, 0.1);
    }
    .markdown-body table tr:nth-child(2n) {
      background-color: rgba(175, 184, 193, 0.05);
    }
    .markdown-body img {
      max-width: 100%;
      height: auto;
    }
    .markdown-body hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: var(--border-color);
      border: 0;
    }
  </style>
    `.trim();
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
  }

  /**
   * Create HTML response
   */
  private htmlResponse(html: string, status: number): Response {
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; script-src 'self'; img-src 'self' data:; font-src 'self' data:;",
      },
    });
  }

  /**
   * Create error response
   */
  private errorResponse(message: string, status: number, details?: string): Response {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error ${status}</title>
  ${this.getCommonStyles()}
</head>
<body>
  <div class="container">
    <h1>Error ${status}</h1>
    <p>${this.escapeHtml(message)}</p>
    ${details ? `<p class="subtitle">${this.escapeHtml(details)}</p>` : ''}
  </div>
</body>
</html>
    `.trim();

    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; script-src 'self'; img-src 'self' data:; font-src 'self' data:;",
      },
    });
  }

  /**
   * Clear HTML cache
   */
  clearCache(): void {
    this.htmlCache.clear();
    this.logger.info('DocsEndpointHandler: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.htmlCache.size,
      entries: Array.from(this.htmlCache.keys()),
    };
  }
}
