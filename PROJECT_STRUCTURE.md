# UniMemory - Project Structure

## Root Directory

```
unimemory/
├── api/                    # FastAPI backend server
├── apps/                   # Frontend applications
│   └── consumer/          # Consumer dashboard (Next.js)
├── extensions/            # Browser extensions
│   └── browser/          # Chrome/Firefox extension
├── mcp/                   # Model Context Protocol servers
├── packages/              # Shared packages
├── scripts/               # Utility scripts
├── .windsurf/            # IDE configuration
├── ARCHITECTURE.md        # Detailed technical architecture
├── ARCHITECTURE_PPT.md    # Simplified architecture for presentations
├── CONTRIBUTING.md        # Contribution guidelines
├── Dockerfile            # Docker configuration
├── LICENSE               # MIT License
├── MARKET_RESEARCH_BRIEF.md  # Business & market analysis
├── README.md             # Main project documentation
├── WORKFLOW_DIAGRAMS.md  # Consumer & Developer workflows
├── openmemory.md         # Memory system guide
└── railway.json          # Railway deployment config
```

---

## Core Directories

### `/api` - Backend Server
FastAPI application providing REST APIs for memory ingestion, storage, and retrieval.

**Key Components:**
- `app/api/` - API endpoints (ingest, consumer, memories, search)
- `app/core/` - Core logic (embeddings, extraction, deduplication, waypoints)
- `app/db/` - Database models and connections
- `app/migrations/` - Database migrations
- `requirements.txt` - Python dependencies

### `/apps/consumer` - Consumer Dashboard
Next.js application for end users to view and manage their memories.

**Key Features:**
- Timeline view of memories
- Memory graph visualization
- Semantic search interface
- Project management
- Authentication (Firebase)

### `/extensions/browser` - Browser Extension
Chrome/Firefox extension for automatic conversation capture.

**Key Components:**
- `src/background/` - Background service worker
- `src/content/` - Content scripts for AI tool pages
- `src/popup/` - Extension popup UI
- `manifest.json` - Extension configuration

### `/mcp` - Model Context Protocol
MCP servers for AI tool integration (Cursor, Windsurf, Claude Desktop).

**Servers:**
- Memory retrieval server
- Context injection server

### `/packages` - Shared Code
Reusable packages across the monorepo.

---

## Documentation Files

### Core Documentation
- **README.md** - Project overview, setup instructions, quick start
- **ARCHITECTURE.md** - Detailed technical architecture, data flow, algorithms
- **CONTRIBUTING.md** - How to contribute, code standards, PR process

### Presentation Materials
- **ARCHITECTURE_PPT.md** - Simplified architecture diagrams for presentations
- **WORKFLOW_DIAGRAMS.md** - Consumer and Developer workflow diagrams
- **MARKET_RESEARCH_BRIEF.md** - Market analysis, business model, competitive landscape

### Configuration
- **openmemory.md** - Memory system guide and user rules
- **Dockerfile** - Container configuration
- **railway.json** - Railway deployment settings

---

## Technology Stack

### Backend
- **Framework:** FastAPI (Python)
- **Database:** PostgreSQL + pgvector
- **LLM:** OpenAI API (GPT-4, text-embedding-3-small)
- **Authentication:** Firebase Admin SDK

### Frontend
- **Framework:** Next.js 14 (React)
- **Styling:** TailwindCSS
- **UI Components:** shadcn/ui
- **State Management:** React hooks
- **Authentication:** Firebase

### Browser Extension
- **Runtime:** Chrome Extension Manifest V3
- **Build:** Webpack
- **UI:** React (popup)

### Infrastructure
- **Hosting:** Railway (backend), Vercel (frontend)
- **Version Control:** Git
- **Package Manager:** npm (frontend), pip (backend)

---

## Development Workflow

### Setup
```bash
# Backend
cd api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd apps/consumer
npm install

# Extension
cd extensions/browser
npm install
```

### Running Locally
```bash
# Backend (port 8000)
cd api
uvicorn app.main:app --reload

# Frontend (port 3000)
cd apps/consumer
npm run dev

# Extension
cd extensions/browser
npm run build
# Load unpacked extension in Chrome
```

---

## Key Features by Component

### API Backend
- ✅ Multi-stage memory processing pipeline
- ✅ LLM-powered extraction and summarization
- ✅ SimHash + semantic deduplication
- ✅ Vector similarity search (pgvector)
- ✅ Semantic graph construction (waypoints)
- ✅ Multi-tenancy (users, projects, API keys)

### Consumer Dashboard
- ✅ Timeline view with filtering
- ✅ Memory graph visualization (force-directed)
- ✅ Semantic search
- ✅ Project management
- ✅ Source viewer with raw content

### Browser Extension
- ✅ Universal conversation capture (ChatGPT, Claude, Gemini)
- ✅ Automatic memory ingestion
- ✅ Project selection
- ✅ Toast notifications
- ✅ Quick access popup

### MCP Servers
- ✅ Memory retrieval for AI tools
- ✅ Context injection
- ✅ Semantic search integration

---

## Clean Structure Principles

### What We Keep
✅ Essential documentation (README, ARCHITECTURE, CONTRIBUTING)  
✅ Presentation materials (PPT, WORKFLOW, MARKET_RESEARCH)  
✅ Configuration files (Dockerfile, railway.json, .gitignore)  
✅ Source code directories (api, apps, extensions, mcp, packages)  
✅ User guides (openmemory.md)

### What We Remove
❌ Debug files (debug_*.md, debug_*.sql)  
❌ Test scripts (test_*.sh)  
❌ Python cache (__pycache__, *.pyc)  
❌ OS files (.DS_Store)  
❌ Redundant documentation (old planning docs)  
❌ Duplicate architecture files

### Gitignore Coverage
The `.gitignore` file prevents:
- Python cache and build artifacts
- Node modules and build outputs
- Environment files (.env)
- IDE configurations
- Database files
- Logs
- OS-specific files
- Debug and test files

---

## Deployment

### Backend (Railway)
- Automatic deployment from `main` branch
- PostgreSQL database with pgvector extension
- Environment variables managed in Railway dashboard

### Frontend (Vercel)
- Automatic deployment from `main` branch
- Environment variables for API URL and Firebase config

### Extension
- Manual build and upload to Chrome Web Store
- Version management in manifest.json

---

This structure maintains a clean, professional codebase suitable for:
- ✅ Open source collaboration
- ✅ Faculty/panel presentations
- ✅ Investor demos
- ✅ Production deployment
- ✅ Team development
