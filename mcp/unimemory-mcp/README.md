# UniMemory MCP Server

Model Context Protocol server for AI agent integration with UniMemory.

## Tools

### `search_memory`
Search your memory for relevant information about any topic, person, preference, or past conversation.

```json
{
  "query": "user preferences about dark mode",
  "limit": 10
}
```

### `get_memory_context`
Get detailed context for a specific memory, including source summary and raw content preview.

```json
{
  "memory_id": "uuid-here"
}
```

### `get_source`
Get the full source document or conversation that a memory came from.

```json
{
  "source_id": "uuid-here"
}
```

## Installation

```bash
cd mcp/unimemory-mcp
npm install
npm run build
```

## Configuration

### Cursor
Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "unimemory": {
      "command": "node",
      "args": ["/path/to/unimemory/mcp/unimemory-mcp/dist/index.js"],
      "env": {
        "UNIMEMORY_API_KEY": "your-api-key",
        "UNIMEMORY_API_URL": "https://unimemory.up.railway.app"
      }
    }
  }
}
```

### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "unimemory": {
      "command": "node",
      "args": ["/path/to/unimemory/mcp/unimemory-mcp/dist/index.js"],
      "env": {
        "UNIMEMORY_API_KEY": "your-api-key",
        "UNIMEMORY_API_URL": "https://unimemory.up.railway.app"
      }
    }
  }
}
```

### VS Code / Windsurf
Add to your MCP settings file with the same configuration pattern.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNIMEMORY_API_KEY` | Yes | - | Your UniMemory API key |
| `UNIMEMORY_API_URL` | No | `https://unimemory.up.railway.app` | API base URL |

## Get Your API Key

1. Go to UniMemory Console (console.unimemory.app)
2. Create a new API key
3. Copy the key and add it to your MCP configuration

## How It Works

```
Agent (Cursor/Claude) 
    ↓ MCP Protocol
UniMemory MCP Server
    ↓ HTTPS + API Key
UniMemory API
    ↓
Your Memories + Sources
```

The MCP server acts as a thin bridge between AI agents and your UniMemory data. It never stores data locally - all operations go through the UniMemory API.
