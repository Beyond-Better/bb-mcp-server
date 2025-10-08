/**
 * Documentation Endpoint Example
 *
 * Demonstrates how to use the DocsEndpointHandler to serve documentation
 * via HTTP endpoint, making it accessible to LLMs and browsers.
 */

import { AppServer } from '../../src/mod.ts';
import * as docsContent from './docs/content.ts';

// Create and start the MCP server with documentation endpoint
const server = await AppServer.create(async ({ configManager, logger }) => {
  logger.info('Example: Setting up documentation endpoint...');

  return {
    serverConfig: {
      name: 'docs-example-server',
      version: '1.0.0',
      title: 'Documentation Example Server',
      description: 'Example MCP server with documentation endpoint',
    },

    // Configure documentation endpoint
    docsEndpointConfig: {
      enabled: true,
      path: '/docs',
      contentModule: docsContent,
      allowListing: true,
      enableCache: true,
    },
  };
});

// Start the server
await server.start();

console.log('\n✨ Documentation Example Server Started!');
console.log('\nAvailable URLs:');
console.log('  Server: http://localhost:3000');
console.log('  Docs:   http://localhost:3000/docs');
console.log('\nTry these:');
console.log('  curl http://localhost:3000/docs');
console.log('  curl http://localhost:3000/docs/getting-started');
console.log('  curl http://localhost:3000/docs/getting-started.md');
console.log('  curl http://localhost:3000/docs/api-reference.html');
console.log('\nPress Ctrl+C to stop\n');
