# UniMemory MCP Server

Model Context Protocol server for AI agent integration.

## Features
- Memory search tool
- Memory recall tool
- Context retrieval
- API key authentication

## Usage
Used by:
- Cursor
- Claude Desktop
- Other MCP-compatible agents

## Configuration
Add to your MCP settings:
```json
{
  "mcpServers": {
    "unimemory": {
      "command": "node",
      "args": ["/path/to/unimemory-mcp/dist/server.js"],
      "env": {
        "UNIMEMORY_API_KEY": "your-api-key"
      }
    }
  }
}
```

## API Integration
- Uses API keys for authentication
- Calls `/api/v1/search` and `/api/v1/memories`
- Returns memory context only (no raw DB access)
