# UniMemory Architecture - PPT Version

## Simplified Architecture for Presentation

```mermaid
graph TB
    subgraph "Input Sources"
        EXT[Browser Extension]
        API[API Clients]
        WEB[Web Dashboard]
    end

    subgraph "Processing Pipeline"
        INGEST[Ingestion APIs<br/>text/chat/document]
        
        PROCESS[Multi-Stage Processing<br/>━━━━━━━━━━━━━━━<br/>1. Store Raw + Summarize<br/>2. Extract Memories + Entities<br/>3. Deduplicate SimHash + Semantic<br/>4. Generate Embeddings 768-dim<br/>5. Build Memory Graph]
    end

    subgraph "Storage - Dual Architecture"
        SOURCES[(Raw Sources<br/>JSONB + Summaries)]
        MEMORIES[(Distilled Memories<br/>Embeddings + Links)]
        GRAPH[(Semantic Graph<br/>Waypoints)]
    end

    subgraph "Retrieval"
        SEARCH[Vector Search<br/>pgvector + LLM Rerank]
    end

    subgraph "Applications"
        CONSUMER[Consumer App<br/>Timeline + Graph]
        CONSOLE[Developer Console<br/>API Keys + Analytics]
    end

    %% Flow
    EXT --> INGEST
    API --> INGEST
    WEB --> INGEST
    
    INGEST --> PROCESS
    
    PROCESS --> SOURCES
    PROCESS --> MEMORIES
    PROCESS --> GRAPH
    
    MEMORIES --> SEARCH
    GRAPH --> SEARCH
    SEARCH --> SOURCES
    
    SEARCH --> CONSUMER
    MEMORIES --> CONSUMER
    GRAPH --> CONSUMER
    
    MEMORIES --> CONSOLE
    
    %% Styling
    classDef input fill:#e3f2fd,stroke:#1565c0,stroke-width:3px
    classDef process fill:#fff3e0,stroke:#e65100,stroke-width:3px
    classDef storage fill:#f3e5f5,stroke:#6a1b9a,stroke-width:3px
    classDef retrieval fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px
    classDef app fill:#fce4ec,stroke:#c2185b,stroke-width:3px
    
    class EXT,API,WEB input
    class INGEST,PROCESS process
    class SOURCES,MEMORIES,GRAPH storage
    class SEARCH retrieval
    class CONSUMER,CONSOLE app
```

---

## Alternative: Horizontal Flow (Better for Wide Slides)

```mermaid
graph LR
    subgraph "1. INPUT"
        EXT[Extension]
        API[API]
        WEB[Web]
    end

    subgraph "2. INGEST"
        INGEST[Ingestion<br/>APIs]
    end

    subgraph "3. PROCESS"
        PROCESS[5-Stage Pipeline<br/>━━━━━━━━━━<br/>Store → Extract<br/>Dedupe → Embed<br/>Graph Build]
    end

    subgraph "4. STORE"
        SOURCES[(Raw<br/>Sources)]
        MEMORIES[(Distilled<br/>Memories)]
        GRAPH[(Semantic<br/>Graph)]
    end

    subgraph "5. RETRIEVE"
        SEARCH[Vector<br/>Search +<br/>Rerank]
    end

    subgraph "6. APPS"
        CONSUMER[Consumer<br/>App]
        CONSOLE[Developer<br/>Console]
    end

    EXT --> INGEST
    API --> INGEST
    WEB --> INGEST
    
    INGEST --> PROCESS
    
    PROCESS --> SOURCES
    PROCESS --> MEMORIES
    PROCESS --> GRAPH
    
    MEMORIES --> SEARCH
    GRAPH --> SEARCH
    SEARCH -.Context.-> SOURCES
    
    SEARCH --> CONSUMER
    SEARCH --> CONSOLE
    
    %% Styling
    classDef input fill:#e3f2fd,stroke:#1565c0,stroke-width:3px
    classDef process fill:#fff3e0,stroke:#e65100,stroke-width:3px
    classDef storage fill:#f3e5f5,stroke:#6a1b9a,stroke-width:3px
    classDef retrieval fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px
    classDef app fill:#fce4ec,stroke:#c2185b,stroke-width:3px
    
    class EXT,API,WEB input
    class INGEST,PROCESS process
    class SOURCES,MEMORIES,GRAPH storage
    class SEARCH retrieval
    class CONSUMER,CONSOLE app
```

---

## Key Points to Mention During Presentation

### 1. **Not Just a Database**
- 5-stage intelligent processing pipeline
- LLM-powered extraction and summarization
- Dual architecture: Raw truth + Distilled insights

### 2. **Advanced Deduplication**
- SimHash algorithm for fast duplicate detection
- Semantic similarity using vector embeddings
- Prevents redundant memories

### 3. **Semantic Infrastructure**
- 768-dimensional embeddings (text-embedding-3-small)
- PostgreSQL + pgvector for native vector operations
- Graph-based memory connections (Waypoints)

### 4. **Intelligent Retrieval**
- Vector similarity search
- LLM reranking for context-aware results
- RAG-ready: Combines memories + raw sources

### 5. **Dual Product Architecture**
- Consumer app: Timeline, graph visualization
- Developer console: API keys, analytics, usage tracking
- Single backend engine serving both

---

## Talking Points for Each Stage

**Input Layer:**
- "Multiple ingestion points - browser extension for automatic capture, API for B2B integration, web dashboard for manual uploads"

**Processing Pipeline:**
- "5-stage intelligent pipeline - not just storing data, but understanding it"
- "LLM extracts nuclear memories, entities, and facts"
- "Deduplication using SimHash + semantic similarity prevents redundancy"
- "768-dimensional embeddings enable semantic search"
- "Background jobs build semantic graph connecting related memories"

**Storage Layer:**
- "Dual architecture - raw sources preserve original context, distilled memories store extracted insights"
- "Semantic graph (Waypoints) connects related memories across conversations"
- "Multi-tenancy with project isolation"

**Retrieval Engine:**
- "Vector search using pgvector - native PostgreSQL extension"
- "LLM reranking for context-aware relevance"
- "Assembles full context by linking memories back to raw sources"

**Applications:**
- "Two products from one engine - consumer app for end users, developer console for B2B clients"
- "Timeline view, graph visualization, semantic exploration"

---

## One-Liner Summary

**"UniMemory is a multi-layered memory infrastructure that transforms raw conversations into semantically-linked, searchable knowledge graphs using LLM-powered extraction, vector embeddings, and intelligent deduplication."**
