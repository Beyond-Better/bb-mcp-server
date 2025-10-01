/**
 * Chunked Storage Demo - MCP Server with Large Message Support
 *
 * This example demonstrates how to use the TransportEventStoreChunked
 * to handle large messages that exceed Deno KV's 64KB limit.
 *
 * Features demonstrated:
 * - Automatic chunking of large messages
 * - Compression for efficient storage
 * - Monitoring and statistics
 * - Error handling for oversized messages
 */

import {
  BeyondMcpServer,
  TransportEventStoreChunked,
  ConfigManager,
  KVManager,
  Logger,
  AuditLogger,
  ErrorHandler,
  getToolRegistry,
  getWorkflowRegistry,
} from '@beyondbetter/bb-mcp-server';

/**
 * Demo tool that generates large messages to test chunked storage
 */
class LargeMessageTool {
  static definition = {
    name: 'generate_large_message',
    title: 'Generate Large Message',
    description: 'Generate a large message to test chunked storage capabilities',
    inputSchema: {
      type: 'object',
      properties: {
        size: {
          type: 'number',
          description: 'Size of message to generate in KB (default: 100KB)',
          minimum: 1,
          maximum: 5000,
        },
        content: {
          type: 'string',
          description: 'Type of content to generate',
          enum: ['json', 'text', 'mixed'],
          default: 'json',
        },
      },
    },
  };

  static async handler(args: { size?: number; content?: string }) {
    const sizeKB = args.size || 100;
    const contentType = args.content || 'json';
    const sizeBytes = sizeKB * 1024;

    let message: any;

    switch (contentType) {
      case 'json': {
        // Generate large JSON object
        const data = [];
        const itemSize = 200; // Approximate size per item
        const itemCount = Math.floor(sizeBytes / itemSize);
        
        for (let i = 0; i < itemCount; i++) {
          data.push({
            id: i,
            timestamp: new Date().toISOString(),
            data: `This is item ${i} with some content to make it larger. `.repeat(3),
            metadata: {
              index: i,
              category: `category_${i % 10}`,
              tags: [`tag_${i % 5}`, `tag_${(i + 1) % 5}`],
            },
          });
        }
        
        message = {
          type: 'large_json_response',
          size: `${sizeKB}KB`,
          itemCount,
          data,
          generatedAt: new Date().toISOString(),
        };
        break;
      }
      
      case 'text': {
        // Generate large text content
        const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ';
        const repeatCount = Math.floor(sizeBytes / paragraph.length);
        
        message = {
          type: 'large_text_response',
          size: `${sizeKB}KB`,
          content: paragraph.repeat(repeatCount),
          generatedAt: new Date().toISOString(),
        };
        break;
      }
      
      case 'mixed': {
        // Generate mixed content
        const baseContent = 'Mixed content with various data types. ';
        const repeatCount = Math.floor(sizeBytes / (baseContent.length + 100));
        
        const mixedData = [];
        for (let i = 0; i < repeatCount; i++) {
          mixedData.push({
            text: baseContent + i,
            number: Math.random() * 1000,
            boolean: i % 2 === 0,
            array: new Array(10).fill(i).map(n => n + Math.random()),
            nested: {
              level1: {
                level2: {
                  level3: `Deep nested content ${i}`,
                },
              },
            },
          });
        }
        
        message = {
          type: 'large_mixed_response',
          size: `${sizeKB}KB`,
          itemCount: repeatCount,
          data: mixedData,
          generatedAt: new Date().toISOString(),
        };
        break;
      }
    }

    // Calculate actual size
    const actualSize = new TextEncoder().encode(JSON.stringify(message)).length;
    message.actualSizeBytes = actualSize;
    message.actualSizeKB = Math.round(actualSize / 1024);

    return {
      content: [{
        type: 'text' as const,
        text: `Generated ${contentType} message of ${Math.round(actualSize / 1024)}KB (requested: ${sizeKB}KB)`,
      }],
      result: message,
    } as any;
  }
}

/**
 * Demo tool to get chunked storage statistics
 */
class StorageStatsTool {
  static definition = {
    name: 'get_storage_stats',
    title: 'Get Storage Statistics',
    description: 'Get statistics about chunked storage usage',
    inputSchema: {
      type: 'object',
      properties: {
        streamId: {
          type: 'string',
          description: 'Optional stream ID to get stats for specific stream',
        },
      },
    },
  };

  static eventStore: TransportEventStoreChunked;

  static async handler(args: { streamId?: string }) {
    if (!StorageStatsTool.eventStore) {
      return {
        content: [{
          type: 'text' as const,
          text: 'Chunked event store not available',
        }],
      } as any;
    }

    const stats = await StorageStatsTool.eventStore.getChunkStatistics(args.streamId);
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(stats, null, 2),
      }],
      result: stats,
    } as any;
  }
}

/**
 * Main function to set up and run the chunked storage demo
 */
async function main() {
  console.log('🚀 Starting Chunked Storage Demo MCP Server...');

  // Load configuration
  const configManager = new ConfigManager();
  await configManager.loadConfig();

  // Set up logging
  const logger = new Logger({
    level: configManager.get('LOG_LEVEL', 'info'),
    format: configManager.get('LOG_FORMAT', 'json'),
  });

  // Set up KV storage
  const kvManager = new KVManager({
    kvPath: configManager.get('DENO_KV_PATH', './data/chunked-demo.db'),
  }, logger);
  await kvManager.initialize();

  // Create required dependencies
  const auditLogger = new AuditLogger({ enabled: false, logAllApiCalls: false }, logger);
  const errorHandler = new ErrorHandler();
  const toolRegistry = await getToolRegistry(logger, errorHandler);
  const workflowRegistry = await getWorkflowRegistry(logger, errorHandler);

  // Create chunked event store
  const eventStore = new TransportEventStoreChunked(
    kvManager.getKV(),
    ['demo_events'],
    logger,
    {
      maxChunkSize: parseInt(configManager.get('TRANSPORT_MAX_CHUNK_SIZE', '61440'), 10),
      enableCompression: configManager.get('TRANSPORT_ENABLE_COMPRESSION', 'true') === 'true',
      compressionThreshold: parseInt(configManager.get('TRANSPORT_COMPRESSION_THRESHOLD', '1024'), 10),
      maxMessageSize: parseInt(configManager.get('TRANSPORT_MAX_MESSAGE_SIZE', '10485760'), 10),
    }
  );

  // Make event store available to tools
  StorageStatsTool.eventStore = eventStore;

  // Create MCP server
  const server = new BeyondMcpServer({
    server: {
      name: 'chunked-storage-demo',
      version: '1.0.0',
      title: 'Chunked Storage Demo Server',
      description: 'Demonstrates chunked storage capabilities for large messages',
    },
    capabilities: {
      tools: {},
      logging: {},
    },
    mcpServerInstructions: `
# Chunked Storage Demo Server

This server demonstrates the chunked storage capabilities of the bb-mcp-server library.

## Available Tools:

1. **generate_large_message**: Generate messages of various sizes to test chunked storage
   - Supports JSON, text, and mixed content types
   - Can generate messages from 1KB to 5MB
   - Automatically handled by chunked storage system

2. **get_storage_stats**: Get statistics about chunked storage usage
   - Shows total events, chunks, compression ratios
   - Can filter by specific stream ID
   - Useful for monitoring storage efficiency

## Example Usage:

\`\`\`
# Generate a 500KB JSON message
generate_large_message({"size": 500, "content": "json"})

# Check storage statistics
get_storage_stats({})

# Generate very large message (2MB)
generate_large_message({"size": 2048, "content": "mixed"})
\`\`\`

## Features Demonstrated:

- Automatic message chunking for messages > 60KB
- Compression for messages > 1KB
- Integrity verification with checksums
- Storage statistics and monitoring
- Error handling for oversized messages
    `,
    transport: {
      type: configManager.get('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http',
    },
  }, {
    configManager,
    logger,
    auditLogger,
    kvManager,
    credentialStore: null as any,
    errorHandler,
    workflowRegistry,
    toolRegistry,
    oauthProvider: undefined,
    transportManager: null as any,
  } as any);

  // Register demo tools
  server.registerTool(
    LargeMessageTool.definition.name,
    LargeMessageTool.definition as any,
    LargeMessageTool.handler
  );

  server.registerTool(
    StorageStatsTool.definition.name,
    StorageStatsTool.definition as any,
    StorageStatsTool.handler
  );

  logger.info('Chunked Storage Demo Server configured with:', {
    maxChunkSize: configManager.get('TRANSPORT_MAX_CHUNK_SIZE', '61440'),
    enableCompression: configManager.get('TRANSPORT_ENABLE_COMPRESSION', 'true'),
    compressionThreshold: configManager.get('TRANSPORT_COMPRESSION_THRESHOLD', '1024'),
    maxMessageSize: configManager.get('TRANSPORT_MAX_MESSAGE_SIZE', '10485760'),
    transport: configManager.get('MCP_TRANSPORT', 'stdio'),
  });

  // Initialize and start server
  await server.initialize();
  await server.start();
}

// Handle graceful shutdown
Deno.addSignalListener('SIGINT', () => {
  console.log('\n👋 Shutting down Chunked Storage Demo Server...');
  Deno.exit(0);
});

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ Failed to start server:', error);
    Deno.exit(1);
  });
}