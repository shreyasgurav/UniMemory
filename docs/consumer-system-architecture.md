# UniMemory Consumer System Architecture

## System Overview

UniMemory Consumer is a personal memory management platform that captures, processes, and retrieves information from various AI tools and web sources. The system uses a layered architecture with clear separation of concerns.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER LAYER                                   │
│  (End users interacting with AI tools and web browsers)             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AI TOOLS & SOURCES LAYER                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   ChatGPT    │  │    Claude    │  │   Websites   │              │
│  │  Conversations│  │     Chats    │  │  Web Pages   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │    Cursor    │  │   Windsurf   │  │    Cline     │              │
│  │  (AI Editor) │  │  (AI Editor) │  │  (AI Agent)  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     CONNECTORS LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Chrome Extension                               │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • Content Script (universal.js)                           │    │
│  │  • Background Service Worker                               │    │
│  │  • Cmd+] Popup (Sources Search)                           │    │
│  │  • Extension Popup (Save/Settings)                         │    │
│  │  • Session Token Authentication                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              MCP (Model Context Protocol)                   │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • MCP Servers (Cursor, Windsurf, Claude, etc.)           │    │
│  │  • Bearer Token Authentication                             │    │
│  │  • 5 Tools: search_memory, get_memory_context,            │    │
│  │    get_source, add_source, add_memory                      │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CONSUMER DASHBOARD                                │
│                  (Next.js Frontend - app.unimemory.app)             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Memories   │  │   Activity   │  │  Connectors  │              │
│  │     Page     │  │     Feed     │  │     Page     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Authentication Layer                           │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • Firebase Auth (Google Sign-In)                          │    │
│  │  • Firebase ID Token → Backend Verification                │    │
│  │  • Protected Routes                                         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND API LAYER                                 │
│              (FastAPI - unimemory.up.railway.app)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Authentication Services                        │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • Firebase Token Verification                             │    │
│  │  • Consumer Session Token Generation (JWT)                 │    │
│  │  • MCP Token Management                                    │    │
│  │  • User Cache (5min TTL)                                   │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Consumer API Endpoints                         │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • GET  /consumer/sources                                  │    │
│  │  • GET  /consumer/sources/{id}                             │    │
│  │  • GET  /consumer/memories                                 │    │
│  │  • GET  /consumer/search (Hybrid Semantic Search)          │    │
│  │  • GET  /consumer/activity (Activity Feed)                 │    │
│  │  • POST /consumer/mcp/tokens (MCP Setup)                   │    │
│  │  • GET  /consumer/session/sources (Extension)              │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              MCP API Endpoints                              │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • POST /mcp (JSON-RPC 2.0)                                │    │
│  │    - tools/list                                            │    │
│  │    - tools/call (search_memory, get_source, etc.)          │    │
│  │  • GET  /mcp/oauth/authorize                               │    │
│  │  • POST /mcp/oauth/token                                   │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Ingestion Pipeline                             │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • POST /v1/ingest/chat                                    │    │
│  │  • POST /v1/ingest/text                                    │    │
│  │  • POST /v1/ingest/document                                │    │
│  │                                                             │    │
│  │  Processing Steps:                                          │    │
│  │  1. Worthiness Check (LLM)                                 │    │
│  │  2. Title Generation (LLM)                                 │    │
│  │  3. Summary Generation (LLM)                               │    │
│  │  4. Memory Extraction (LLM)                                │    │
│  │  5. Source Storage                                          │    │
│  │  6. Memory Storage with Deduplication                      │    │
│  │  7. Memory-Source Linking                                  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Core Services                                  │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │  • Embedding Service (OpenAI text-embedding-3-small)       │    │
│  │  • Summarizer (GPT-4o-mini)                                │    │
│  │  • Memory Extractor (GPT-4o-mini)                          │    │
│  │  • SimHash (Deduplication)                                 │    │
│  │  • Sector Classifier (5 sectors)                           │    │
│  │  • Salience Calculator                                     │    │
│  │  • Waypoint Generator (Memory Graph)                       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STORAGE LAYER                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              PostgreSQL + pgvector                          │    │
│  ├────────────────────────────────────────────────────────────┤    │
│  │                                                             │    │
│  │  Core Tables:                                               │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  users                                            │     │    │
│  │  │  • id, firebase_uid, email, display_name         │     │    │
│  │  │  • account_type, plan, is_active                 │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  sources (Raw Truth Layer)                       │     │    │
│  │  │  • id, owner_id, end_user_id                     │     │    │
│  │  │  • type, source_app, title                       │     │    │
│  │  │  • raw_content (JSONB)                           │     │    │
│  │  │  • summary, summary_embedding (Vector 1536)      │     │    │
│  │  │  • source_metadata (JSONB)                       │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  memories (Distilled Knowledge Layer)            │     │    │
│  │  │  • id, owner_id, end_user_id                     │     │    │
│  │  │  • content                                        │     │    │
│  │  │  • embedding (Vector 1536)                       │     │    │
│  │  │  • simhash (deduplication)                       │     │    │
│  │  │  • sector, salience, decay_lambda                │     │    │
│  │  │  • tags (JSONB), extra_metadata (JSONB)          │     │    │
│  │  │  • is_active, created_at, last_seen_at           │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  memory_sources (N:N Linking)                    │     │    │
│  │  │  • id, memory_id, source_id                      │     │    │
│  │  │  • Links memories to their original sources      │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  waypoints (Memory Graph)                        │     │    │
│  │  │  • id, src_id, dst_id, weight                    │     │    │
│  │  │  • Links related memories                        │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  Authentication & Activity:                                │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  mcp_tokens                                       │     │    │
│  │  │  • id, user_id, name, client_type                │     │    │
│  │  │  • token_hash, token_value                       │     │    │
│  │  │  • is_active, usage_count                        │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  mcp_activity                                     │     │    │
│  │  │  • id, user_id, mcp_token_id                     │     │    │
│  │  │  • tool_name, client_type                        │     │    │
│  │  │  • tool_args (JSONB), result_count               │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  activity_logs                                    │     │    │
│  │  │  • id, user_id, action, source, agent            │     │    │
│  │  │  • memory_id, source_id, details (JSONB)         │     │    │
│  │  └──────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  Vector Indexes:                                            │    │
│  │  • idx_memories_embedding (IVFFlat, lists=100)             │    │
│  │  • idx_sources_summary_embedding (IVFFlat, lists=100)      │    │
│  │                                                             │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Patterns

### 1. Memory Capture Flow (Extension)
```
User on ChatGPT
    ↓
Chrome Extension detects conversation
    ↓
Extension → POST /v1/ingest/chat (with session token)
    ↓
Backend: Worthiness Check → Title → Summary → Extract Memories
    ↓
Store Source → Store Memories → Link via memory_sources
    ↓
Activity Log created
```

### 2. Memory Capture Flow (MCP)
```
User in Cursor/Windsurf
    ↓
AI Agent calls add_source tool
    ↓
MCP Server → POST /mcp (tools/call with Bearer token)
    ↓
Backend: Same ingestion pipeline
    ↓
Store Source → Store Memories → Link
    ↓
MCP Activity Log created
```

### 3. Memory Retrieval Flow (Dashboard)
```
User opens Memories page
    ↓
Frontend → GET /consumer/sources (with Firebase token)
    ↓
Backend verifies token → Query PostgreSQL
    ↓
Return sources with memory_count
    ↓
User clicks source → GET /consumer/sources/{id}
    ↓
Return source + linked memories
```

### 4. Semantic Search Flow
```
User searches in Extension (Cmd+])
    ↓
Extension → POST /consumer/search (with session token)
    ↓
Backend: Generate query embedding
    ↓
pgvector cosine similarity search on memories.embedding
    ↓
Rank by: similarity + salience + recency + sector
    ↓
Return top results with source links
```

### 5. MCP Search Flow
```
AI Agent needs context
    ↓
Agent calls search_memory tool
    ↓
MCP Server → POST /mcp (tools/call)
    ↓
Backend: Hybrid semantic search
    ↓
Return memories with source_id
    ↓
Agent calls get_source tool for full context
    ↓
Backend returns raw_content + summary
```

---

## Key Architecture Principles

### 1. Two-Layer Storage Model
- **Sources**: Raw truth (full conversations, documents)
- **Memories**: Distilled knowledge (atomic facts, extracted insights)
- **Linking**: N:N relationship via memory_sources table

### 2. Authentication Strategy
- **Dashboard**: Firebase Auth → Firebase ID Token → Backend verification
- **Extension**: Firebase Token → Consumer Session Token (JWT, 1hr TTL)
- **MCP**: MCP Token (Bearer token) → User-specific, client-specific

### 3. Deduplication Strategy
- **SimHash**: 64-bit hash of memory content
- **Hamming Distance**: ≤3 bits = duplicate
- **Salience Boost**: Duplicate memories boost existing memory salience

### 4. Memory Sectors (OpenMemory Framework)
- **Semantic**: Facts, knowledge, concepts
- **Episodic**: Events, experiences, conversations
- **Procedural**: How-to, processes, workflows
- **Emotional**: Feelings, reactions, sentiments
- **Reflective**: Insights, learnings, meta-thoughts

### 5. Search Strategy (Hybrid)
- **Vector Similarity**: pgvector cosine distance on embeddings
- **Keyword Matching**: Boost for exact term matches
- **Salience Weighting**: Higher salience = higher rank
- **Recency Boost**: Recent memories ranked higher
- **Sector Filtering**: Optional filtering by memory type

---

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Auth**: Firebase Auth (Google Sign-In)
- **UI**: React, TailwindCSS, Lucide Icons
- **State**: React Hooks (useState, useEffect)

### Backend
- **Framework**: FastAPI (Python)
- **Auth**: Firebase Admin SDK, JWT
- **LLM**: OpenAI GPT-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small (1536 dims)

### Database
- **RDBMS**: PostgreSQL
- **Vector Search**: pgvector extension
- **Indexes**: IVFFlat for vector similarity

### Connectors
- **Extension**: Chrome Extension (Manifest V3)
- **MCP**: Model Context Protocol (JSON-RPC 2.0)

### Deployment
- **Backend**: Railway
- **Frontend**: Vercel
- **Database**: Railway PostgreSQL

---

## Security & Privacy

### Authentication
- Firebase tokens verified on every request
- Session tokens cached (5min TTL) to reduce DB load
- MCP tokens hashed (bcrypt) and stored securely

### Data Isolation
- All queries scoped by `owner_id`
- End-user separation via `end_user_id`
- No cross-user data leakage

### Rate Limiting
- Extension: Session token rate limiting
- MCP: Per-token usage tracking
- Activity logging for audit trail

---

## Performance Optimizations

### Database
- Vector indexes (IVFFlat) for fast similarity search
- Compound indexes for common query patterns
- Exclude large columns (raw_content, embeddings) from list queries

### Caching
- User cache (5min TTL) for token verification
- Avoids DB lookup on every request
- Max 200 entries with LRU eviction

### Async Processing
- Background tasks for waypoint generation
- Non-blocking memory extraction
- Parallel embedding generation

---

## Scalability Considerations

### Current Architecture
- Single PostgreSQL instance
- Vertical scaling (Railway)
- pgvector for vector search

### Future Enhancements
- Read replicas for search queries
- Dedicated vector database (Pinecone, Weaviate)
- Redis cache layer
- Message queue for ingestion (Celery, RabbitMQ)

---

## Monitoring & Observability

### Activity Tracking
- `activity_logs`: All user actions
- `mcp_activity`: MCP tool calls
- `processing_logs`: Ingestion pipeline logs

### Metrics
- Memory count per user
- Source count per user
- MCP token usage
- Search query performance

---

## Comparison: System Diagram vs Workflow Diagram

### System Diagram (This Document)
**Purpose**: Show what components exist in the system
**Focus**: Architecture, structure, relationships
**Questions Answered**:
- What are the layers?
- What components exist?
- How are they connected?
- What technologies are used?

### Workflow Diagram (Separate)
**Purpose**: Show what happens step by step
**Focus**: Process, sequence, data flow
**Questions Answered**:
- What happens when user saves a conversation?
- How does search work?
- What's the order of operations?
- Where does data flow?

---

## Summary

UniMemory Consumer is a **layered architecture** with:
- **5 Layers**: User → AI Tools → Connectors → Dashboard → Backend → Storage
- **2 Connectors**: Chrome Extension + MCP
- **2 Storage Layers**: Sources (raw) + Memories (distilled)
- **3 Auth Methods**: Firebase + Session Token + MCP Token
- **1 Search Strategy**: Hybrid semantic + keyword
- **5 Memory Sectors**: Semantic, Episodic, Procedural, Emotional, Reflective

The architecture prioritizes **simplicity**, **security**, and **performance** while maintaining **flexibility** for future enhancements.
