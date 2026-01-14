#!/usr/bin/env node
/**
 * UniMemory MCP Server
 * Model Context Protocol server for AI agent integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { UniMemoryClient } from './client/unimemory.js';
import {
  searchMemoryTool,
  executeSearchMemory,
  SearchMemoryInput,
} from './tools/searchMemory.js';
import {
  getMemoryContextTool,
  executeGetMemoryContext,
  GetMemoryContextInput,
} from './tools/getMemoryContext.js';
import {
  getSourceTool,
  executeGetSource,
  GetSourceInput,
} from './tools/getSource.js';

// Configuration from environment
const API_URL = process.env.UNIMEMORY_API_URL || 'https://unimemory.up.railway.app';
const MCP_TOKEN = process.env.UNIMEMORY_MCP_TOKEN || '';
const API_KEY = process.env.UNIMEMORY_API_KEY || '';

// Support both consumer MCP tokens and developer API keys
const token = MCP_TOKEN || API_KEY;
const authType = MCP_TOKEN ? 'bearer' : 'apikey';

if (!token) {
  console.error('Error: UNIMEMORY_MCP_TOKEN or UNIMEMORY_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize client
const client = new UniMemoryClient(API_URL, token, authType as 'bearer' | 'apikey');

// Create MCP server
const server = new Server(
  {
    name: 'unimemory',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [searchMemoryTool, getMemoryContextTool, getSourceTool],
  };
});

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_memory': {
        const input = args as unknown as SearchMemoryInput;
        const result = await executeSearchMemory(client, input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_memory_context': {
        const input = args as unknown as GetMemoryContextInput;
        const result = await executeGetMemoryContext(client, input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_source': {
        const input = args as unknown as GetSourceInput;
        const result = await executeGetSource(client, input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('UniMemory MCP server running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
