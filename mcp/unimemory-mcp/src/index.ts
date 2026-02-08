#!/usr/bin/env node
/**
 * UniMemory MCP Server
 * Model Context Protocol server for AI agent integration
 * 
 * Supports two transports:
 * - SSE (default): For hosted deployment, accessed via HTTPS
 * - stdio: For local development, run with MCP_TRANSPORT=stdio
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import cors from 'cors';

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
import {
  addSourceTool,
  executeAddSource,
  AddSourceInput,
} from './tools/addSource.js';
import {
  addMemoryTool,
  executeAddMemory,
  AddMemoryInput,
} from './tools/addMemory.js';
import {
  getProjectsTool,
  executeGetProjects,
} from './tools/getProjects.js';
import {
  getProjectStatusTool,
  executeGetProjectStatus,
  GetProjectStatusInput,
} from './tools/getProjectStatus.js';
import {
  updateProjectStatusTool,
  executeUpdateProjectStatus,
  UpdateProjectStatusInput,
} from './tools/updateProjectStatus.js';

// Configuration from environment
const API_URL = process.env.UNIMEMORY_API_URL || 'https://unimemory.up.railway.app';
const PORT = parseInt(process.env.PORT || '3000', 10);
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'sse';

// Store active transports for cleanup
const activeTransports = new Map<string, SSEServerTransport>();

/**
 * Create an MCP server instance with tool handlers
 */
function createMCPServer(client: UniMemoryClient): Server {
  const server = new Server(
    {
      name: 'unimemory',
      version: '0.3.0',
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
      tools: [
        searchMemoryTool,
        getMemoryContextTool,
        getSourceTool,
        addSourceTool,
        addMemoryTool,
        getProjectsTool,
        getProjectStatusTool,
        updateProjectStatusTool,
      ],
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

        case 'add_source': {
          const input = args as unknown as AddSourceInput;
          const result = await executeAddSource(client, input);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'add_memory': {
          const input = args as unknown as AddMemoryInput;
          const result = await executeAddMemory(client, input);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'get_projects': {
          const result = await executeGetProjects({} as Record<string, never>, client);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'get_project_status': {
          const input = args as unknown as GetProjectStatusInput;
          const result = await executeGetProjectStatus(input, client);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'update_project_status': {
          const input = args as unknown as UpdateProjectStatusInput;
          const result = await executeUpdateProjectStatus(input, client);
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

  return server;
}

/**
 * Start SSE transport (hosted mode)
 */
async function startSSEServer() {
  const app = express();
  
  // CORS for cross-origin requests from MCP clients
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-unimemory-token'],
  }));
  
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.3.0', transport: 'sse' });
  });

  // SSE endpoint for MCP connections
  app.get('/sse', async (req: Request, res: Response) => {
    // Extract token from Authorization header or query param
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;
    
    let token: string | undefined;
    let authType: 'bearer' | 'apikey' = 'bearer';
    
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        authType = 'bearer';
      } else if (authHeader.startsWith('ApiKey ')) {
        token = authHeader.substring(7);
        authType = 'apikey';
      } else {
        token = authHeader;
      }
    } else if (queryToken) {
      token = queryToken;
    }
    
    if (!token) {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing Authorization header or token query parameter',
        hint: 'Use Authorization: Bearer <your_mcp_token>'
      });
      return;
    }
    
    // Create client with user's token
    const client = new UniMemoryClient(API_URL, token, authType);
    
    // Verify token by making a health check to the API
    try {
      const isValid = await client.healthCheck();
      if (!isValid) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      res.status(401).json({ error: 'Token verification failed' });
      return;
    }
    
    // Create MCP server for this connection
    const server = createMCPServer(client);
    
    // Generate session ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create SSE transport
    const transport = new SSEServerTransport('/messages', res);
    activeTransports.set(sessionId, transport);
    
    // Cleanup on close
    res.on('close', () => {
      activeTransports.delete(sessionId);
      console.log(`SSE connection closed: ${sessionId}`);
    });
    
    console.log(`SSE connection established: ${sessionId}`);
    
    // Connect server to transport
    await server.connect(transport);
  });

  // POST endpoint for client messages
  app.post('/messages', async (req: Request, res: Response) => {
    // Find the transport for this session
    const sessionId = req.query.sessionId as string;
    const transport = activeTransports.get(sessionId);
    
    if (!transport) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    // Handle the message
    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error('Error handling message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`UniMemory MCP server running on http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

/**
 * Start stdio transport (local mode)
 */
async function startStdioServer() {
  // For stdio, we need the token from environment
  const MCP_TOKEN = process.env.UNIMEMORY_MCP_TOKEN || '';
  const API_KEY = process.env.UNIMEMORY_API_KEY || '';
  
  const token = MCP_TOKEN || API_KEY;
  const authType = MCP_TOKEN ? 'bearer' : 'apikey';
  
  if (!token) {
    console.error('Error: UNIMEMORY_MCP_TOKEN or UNIMEMORY_API_KEY environment variable is required for stdio mode');
    process.exit(1);
  }
  
  const client = new UniMemoryClient(API_URL, token, authType as 'bearer' | 'apikey');
  const server = createMCPServer(client);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('UniMemory MCP server running (stdio mode)');
}

// Main entry point
async function main() {
  if (MCP_TRANSPORT === 'stdio') {
    await startStdioServer();
  } else {
    await startSSEServer();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
