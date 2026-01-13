# UniMemory Project Structure

This document explains the multi-app architecture of UniMemory.

## Overview

UniMemory is structured as a **monorepo** with clear separation between:
- **Backend API** - Single source of truth
- **Frontend Apps** - Console (B2B) and Consumer (B2C)
- **SDKs** - JavaScript and Python client libraries
- **Extensions** - Browser and VS Code integrations
- **MCP** - AI agent integration layer

## Directory Structure

```
unimemory/
├── api/                      # Backend API (FastAPI)
├── apps/                     # Frontend applications
│   ├── console/             # Developer dashboard
│   └── consumer/            # End-user app
├── packages/                 # Shared libraries
│   ├── sdk-js/              # JavaScript SDK
│   ├── sdk-python/          # Python SDK
│   └── shared-ui/           # Shared UI components
├── extensions/               # Client-side capture
│   ├── browser/             # Browser extension
│   └── vscode/              # VS Code extension
└── mcp/                      # MCP servers
    └── unimemory-mcp/       # AI agent integration
```

## Products

### 1. Console Dashboard (`apps/console/`)
**URL:** `console.unimemory.app`  
**Purpose:** Developer/Enterprise control plane

**Features:**
- API key management
- Memory inspection
- Usage statistics
- Processing logs
- End-user management
- Settings & configuration

**Auth:** Firebase (Google OAuth)  
**API Access:** Internal stats endpoints + memory APIs

### 2. Consumer App (`apps/consumer/`)
**URL:** `app.unimemory.app`  
**Purpose:** End-user memory interface

**Features:**
- Personal memory timeline
- Source viewer (chat/doc/code)
- Semantic search
- Agent connections
- Privacy controls

**Auth:** Firebase (Google OAuth)  
**API Access:** Same memory APIs, scoped by user

### 3. Browser Extension (`extensions/browser/`)
**Platforms:** Chrome, Arc, Brave, Edge

**Features:**
- Auto-capture browsing context
- Manual memory creation
- Quick search
- Privacy controls

**Integration:** Calls `/api/v1/ingest/*` endpoints

### 4. VS Code Extension (`extensions/vscode/`)
**Platform:** Visual Studio Code

**Features:**
- Capture code selections
- Auto-capture git commits
- Search memories from command palette
- Sync with UniMemory API

**Integration:** Calls `/api/v1/ingest/text` and `/api/v1/search`

### 5. MCP Server (`mcp/unimemory-mcp/`)
**Purpose:** AI agent integration (Cursor, Claude Desktop, etc.)

**Features:**
- Memory search tool
- Memory recall tool
- Context retrieval

**Integration:** Uses API keys, calls memory APIs

## Shared Packages

### JavaScript SDK (`packages/sdk-js/`)
**Package:** `@unimemory/sdk`  
**Registry:** npm

Official JavaScript/TypeScript SDK for UniMemory API.

### Python SDK (`packages/sdk-python/`)
**Package:** `unimemory`  
**Registry:** PyPI

Official Python SDK for UniMemory API.

### Shared UI (`packages/shared-ui/`)
**Status:** Future  
**Purpose:** Shared React components between Console and Consumer

## Development

### Running Locally

**API:**
```bash
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload
# Runs on http://localhost:8000
```

**Console:**
```bash
cd apps/console
npm install
npm run dev
# Runs on http://localhost:3000
```

**Consumer:**
```bash
cd apps/consumer
npm install
npm run dev
# Runs on http://localhost:3001
```

### Deployment

| Component | Platform | URL |
|-----------|----------|-----|
| API | Railway | `unimemory.up.railway.app` |
| Console | Vercel | `console.unimemory.app` |
| Consumer | Vercel | `app.unimemory.app` |
| Browser Extension | Chrome Web Store | TBD |
| VS Code Extension | VS Marketplace | TBD |
| MCP Server | npm | TBD |

## Architecture Principles

### 1. Single Backend, Multiple Frontends
- One FastAPI backend serves all products
- One PostgreSQL + pgvector database
- Consistent API across all clients

### 2. Clear Separation of Concerns
- **Console** = Developer tools (API keys, stats, logs)
- **Consumer** = End-user experience (timeline, search)
- **Extensions** = Capture-only (no direct DB access)
- **MCP** = Agent integration (API key auth)

### 3. Auth & Multi-tenancy
- `users.id` = Owner account (developer)
- `api_keys.user_id` = Owner's API keys
- `memories.user_id` = End-user identifier (string)
- `sources.end_user_id` = End-user identifier (string)
- All scoped by `owner_id`

### 4. API Stability
- **Core API** (`/v1/memories`, `/v1/search`) = Stable, public
- **Ingest API** (`/v1/ingest/*`) = Evolvable, LLM-based
- **Stats API** (`/v1/stats/*`) = Internal, console-only

### 5. Data Model
- **Memories** = Distilled facts (semantic, deduplicated)
- **Sources** = Raw content (JSONB, optional summary)
- **Links** = N:N relationship via `memory_sources`

## Future Roadmap

- [ ] Shared UI component library
- [ ] Browser extension (Chrome Web Store)
- [ ] VS Code extension (Marketplace)
- [ ] MCP server (npm package)
- [ ] Mobile apps (iOS/Android)
- [ ] Desktop app (Electron)
- [ ] Teams & workspaces
- [ ] Enterprise SSO
- [ ] Compliance (SOC2, GDPR)

## Contributing

When adding new features:
1. **Backend** - Add to `api/app/api/`
2. **Console UI** - Add to `apps/console/`
3. **Consumer UI** - Add to `apps/consumer/`
4. **SDK** - Update both `packages/sdk-js/` and `packages/sdk-python/`
5. **Docs** - Update relevant READMEs

## Questions?

See individual README files in each directory for specific setup and development instructions.
