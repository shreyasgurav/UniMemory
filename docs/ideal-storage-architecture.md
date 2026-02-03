# UniMemory: Ideal Brain-Like Storage Architecture

## Research Summary

### Open Source Projects Analyzed

| Project | Key Insight | Storage Model |
|---------|-------------|---------------|
| **OpenMemory** | 5-sector memory (episodic, semantic, procedural, emotional, reflective) + temporal reasoning + decay engine | SQLite/Postgres + Waypoints |
| **Zep/Graphiti** | Bi-temporal knowledge graph, entity-fact extraction, valid_from/valid_to | Neo4j + pgvector |
| **Mem0** | Multi-level memory (user, session, agent) + knowledge graph conflict detection | Vector DB + Graph DB |
| **Letta (MemGPT)** | Tiered memory (core/archival/recall) + self-improving agents | Postgres + Vector |

---

## Key Insights from Research

### 1. Bi-Temporal Model (from Zep)
**Critical missing feature in UniMemory**

Two timelines:
- **T (Event Time)**: When the fact was true in the real world
- **T' (Transaction Time)**: When the fact was recorded in the system

```
Example:
- User says "I started my new job two weeks ago" on Jan 15
- T = Jan 1 (when event happened)
- T' = Jan 15 (when recorded)

This enables:
- "What was true on date X?" queries
- Tracking knowledge evolution over time
- Detecting when facts become invalid
```

### 2. Entity-Fact Separation (from Graphiti)
**Current UniMemory treats everything as "memories"**

Better structure:
```
ENTITIES: Named things (people, places, concepts)
  - "John Smith"
  - "Python programming"
  - "New York"

FACTS: Relationships between entities with temporal validity
  - "John Smith" → "works_at" → "OpenAI" (valid_from: 2023-01-01, valid_to: NULL)
  - "John Smith" → "lives_in" → "New York" (valid_from: 2022-06-01, valid_to: NULL)

EPISODES: Raw source data (conversations, documents)
  - Chat transcript where facts were extracted from
```

### 3. Multi-Level Memory (from Mem0)
**Different scopes for different use cases**

```
USER MEMORY: Persists across all sessions
  - Preferences, facts about the user
  - "Prefers Python over JavaScript"

SESSION MEMORY: Within a single conversation
  - Short-term context
  - "Currently debugging auth issue"

AGENT MEMORY: Specific to an AI agent
  - Agent-specific knowledge
  - "Cursor knows about this codebase"
```

### 4. Tiered Memory (from Letta/MemGPT)
**Different storage for different access patterns**

```
CORE MEMORY: Always in context (small, high-priority)
  - User's name, current project, key preferences
  - ~2KB limit

ARCHIVAL MEMORY: Long-term storage (large, searchable)
  - All extracted facts and knowledge
  - Vector search for retrieval

RECALL MEMORY: Recent conversation history
  - Last N messages for context
  - Rolling window
```

### 5. Knowledge Graph Conflict Detection (from Mem0)
**Handle contradictory information**

```
Scenario:
- Old fact: "User's favorite color is blue"
- New fact: "User's favorite color is green"

Resolution:
1. Detect conflict (same subject + predicate)
2. Mark old fact as invalid (valid_to = now)
3. Add new fact (valid_from = now)
4. Maintain history for timeline queries
```

---

## Current UniMemory Structure Analysis

### What We Have ✅

```
┌─────────────────┐     ┌─────────────────┐
│     SOURCES     │     │    MEMORIES     │
├─────────────────┤     ├─────────────────┤
│ • raw_content   │ N:N │ • content       │
│ • summary       │◄───►│ • embedding     │
│ • summary_embed │     │ • sector        │
│ • type          │     │ • salience      │
│ • source_app    │     │ • decay_lambda  │
│ • owner_id      │     │ • simhash       │
│ • end_user_id   │     │ • tags          │
└─────────────────┘     └─────────────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
            ┌─────────────────┐
            │    WAYPOINTS    │
            ├─────────────────┤
            │ • src_id        │
            │ • dst_id        │
            │ • weight        │
            └─────────────────┘
```

### What's Good
- ✅ Source-Memory separation (preserves raw context for RAG)
- ✅ 5-sector classification (brain-like categorization)
- ✅ SimHash deduplication
- ✅ Salience scoring
- ✅ Waypoint graph (memory links)
- ✅ Multi-tenancy (owner_id + end_user_id)
- ✅ Activity logging

### What's Missing ❌
- ❌ **Temporal reasoning** (no valid_from/valid_to)
- ❌ **Entity extraction** (no named entities, just memories)
- ❌ **Fact relationships** (no subject-predicate-object triples)
- ❌ **Multi-level memory** (no user/session/agent distinction)
- ❌ **Tiered memory** (no core/archival split)
- ❌ **Coactivation tracking** (no reinforcement on recall)
- ❌ **Conflict detection** (contradictory facts not handled)
- ❌ **Communities** (no clustering of related entities)

---

## Ideal Brain-Like Storage Architecture

### Design Principles

1. **Non-Lossy**: Never delete raw data, only mark as invalid
2. **Bi-Temporal**: Track both event time and ingestion time
3. **Hierarchical**: Multiple levels of abstraction (raw → summary → facts → entities)
4. **Reinforcement**: Memories strengthen with use (Hebbian learning)
5. **Decay**: Memories fade without reinforcement (sector-specific rates)
6. **Conflict-Aware**: Handle contradictory information gracefully

### New Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EPISODE LAYER (Raw Data)                        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         sources                                  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  id, owner_id, end_user_id                                      │   │
│  │  type: chat | document | web | code | file                      │   │
│  │  source_app: chatgpt | claude | cursor | chrome | slack         │   │
│  │  raw_content: JSONB (full transcript, document, etc.)           │   │
│  │  summary: Text (LLM-generated)                                  │   │
│  │  summary_embedding: Vector(1536)                                │   │
│  │  source_metadata: JSONB                                         │   │
│  │  event_at: Timestamp (when event occurred)  ⭐ NEW              │   │
│  │  ingested_at: Timestamp (when recorded)  ⭐ NEW                 │   │
│  │  external_ref: chat_id, file_path, url                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTITY LAYER (Named Things)  ⭐ NEW              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         entities                                 │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  id, owner_id, end_user_id                                      │   │
│  │  name: "John Smith", "Python", "OpenAI"                         │   │
│  │  entity_type: person | organization | concept | place | thing   │   │
│  │  summary: Text (entity description)                             │   │
│  │  embedding: Vector(1536) (for entity search)                    │   │
│  │  aliases: JSONB ["John", "JS", "Mr. Smith"]                     │   │
│  │  first_seen_at, last_seen_at                                    │   │
│  │  mention_count: Integer (coactivation)                          │   │
│  │  is_active: Boolean                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      entity_sources                              │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  entity_id, source_id (N:N linking)                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       communities  ⭐ NEW                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  id, owner_id                                                   │   │
│  │  name: "Work Projects", "Family", "Hobbies"                     │   │
│  │  summary: Text (LLM-generated cluster summary)                  │   │
│  │  embedding: Vector(1536)                                        │   │
│  │  entity_ids: JSONB [entity UUIDs in this community]             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          FACT LAYER (Relationships)  ⭐ NEW              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                          facts                                   │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  id, owner_id, end_user_id                                      │   │
│  │                                                                  │   │
│  │  # Triple (Subject-Predicate-Object)                            │   │
│  │  subject_entity_id: UUID FK → entities                          │   │
│  │  predicate: "works_at", "prefers", "lives_in", "knows"          │   │
│  │  object_entity_id: UUID FK → entities (nullable)                │   │
│  │  object_value: Text (for non-entity objects)                    │   │
│  │                                                                  │   │
│  │  # Human-readable fact                                          │   │
│  │  fact_text: "John works at OpenAI"                              │   │
│  │  embedding: Vector(1536)                                        │   │
│  │                                                                  │   │
│  │  # Bi-temporal (THE KEY INNOVATION)                             │   │
│  │  valid_from: Timestamp (when fact became true)                  │   │
│  │  valid_to: Timestamp (when fact stopped being true, NULL=current)│   │
│  │  created_at: Timestamp (when recorded in system)                │   │
│  │  invalidated_at: Timestamp (when marked invalid)                │   │
│  │                                                                  │   │
│  │  # Confidence & Source                                          │   │
│  │  confidence: Float (0.0-1.0)                                    │   │
│  │  source_id: UUID FK → sources                                   │   │
│  │                                                                  │   │
│  │  # Status                                                       │   │
│  │  is_valid: Boolean (current truth status)                       │   │
│  │  invalidation_reason: Text ("superseded", "contradicted", etc.) │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        MEMORY LAYER (Distilled Knowledge)                │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         memories                                 │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  id, owner_id, end_user_id, api_key_id                          │   │
│  │                                                                  │   │
│  │  # Content                                                      │   │
│  │  content: Text (atomic memory statement)                        │   │
│  │  embedding: Vector(1536)                                        │   │
│  │                                                                  │   │
│  │  # Memory Classification (OpenMemory-style)                     │   │
│  │  sector: semantic | episodic | procedural | emotional | reflective │
│  │  memory_type: preference | fact | event | skill | insight       │   │
│  │                                                                  │   │
│  │  # Importance & Decay                                           │   │
│  │  salience: Float (0.0-1.0)                                      │   │
│  │  decay_lambda: Float (sector-specific)                          │   │
│  │  priority: core | archival (tiered memory)  ⭐ NEW              │   │
│  │                                                                  │   │
│  │  # Coactivation (Hebbian learning)  ⭐ NEW                      │   │
│  │  recall_count: Integer (times retrieved)                        │   │
│  │  last_recalled_at: Timestamp                                    │   │
│  │  coactivation_score: Float (reinforcement strength)             │   │
│  │                                                                  │   │
│  │  # Deduplication                                                │   │
│  │  simhash: String(16)                                            │   │
│  │                                                                  │   │
│  │  # Metadata                                                     │   │
│  │  tags: JSONB                                                    │   │
│  │  extra_metadata: JSONB                                          │   │
│  │  source_app: String                                             │   │
│  │                                                                  │   │
│  │  # Temporal  ⭐ NEW                                             │   │
│  │  valid_from: Timestamp                                          │   │
│  │  valid_to: Timestamp (NULL = still valid)                       │   │
│  │                                                                  │   │
│  │  # Status                                                       │   │
│  │  is_active: Boolean                                             │   │
│  │  expires_at: Timestamp                                          │   │
│  │                                                                  │   │
│  │  # Timestamps                                                   │   │
│  │  created_at, updated_at, last_seen_at                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      memory_sources (N:N)                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  memory_id, source_id                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      memory_entities (N:N)  ⭐ NEW               │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  memory_id, entity_id                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      memory_facts (N:N)  ⭐ NEW                  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  memory_id, fact_id                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          GRAPH LAYER (Connections)                       │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         waypoints                                │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  src_id, dst_id (memory-to-memory links)                        │   │
│  │  weight: Float (similarity strength)                            │   │
│  │  coactivation_count: Integer  ⭐ NEW                            │   │
│  │  last_coactivated_at: Timestamp  ⭐ NEW                         │   │
│  │  relationship_type: similar | sequential | causal | hierarchical│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      entity_links  ⭐ NEW                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  src_entity_id, dst_entity_id                                   │   │
│  │  relationship_type: knows | related_to | part_of | owns        │   │
│  │  weight: Float                                                  │   │
│  │  fact_count: Integer (how many facts connect them)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Data Model

### New Tables Summary

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `entities` | Named things (people, places, concepts) | name, type, embedding, aliases |
| `entity_sources` | Link entities to source episodes | entity_id, source_id |
| `communities` | Clusters of related entities | name, summary, entity_ids |
| `facts` | Temporal relationships (SPO triples) | subject, predicate, object, valid_from/to |
| `memory_entities` | Link memories to entities | memory_id, entity_id |
| `memory_facts` | Link memories to facts | memory_id, fact_id |
| `entity_links` | Entity-to-entity graph | src_entity_id, dst_entity_id, type |

### Modified Tables

| Table | New Fields |
|-------|------------|
| `sources` | event_at, ingested_at |
| `memories` | valid_from, valid_to, recall_count, last_recalled_at, coactivation_score, priority, memory_type |
| `waypoints` | coactivation_count, last_coactivated_at, relationship_type |

---

## SQL Schema

### New Tables

```sql
-- 1. ENTITIES TABLE
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
    
    -- Entity identification
    name VARCHAR(500) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,  -- person, organization, concept, place, thing
    summary TEXT,
    embedding VECTOR(1536),
    aliases JSONB DEFAULT '[]'::jsonb,
    
    -- Coactivation
    mention_count INTEGER DEFAULT 0,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_entities_owner ON entities(owner_id);
CREATE INDEX idx_entities_name ON entities(owner_id, name);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_embedding ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 2. ENTITY_SOURCES TABLE (N:N)
CREATE TABLE entity_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(entity_id, source_id)
);

CREATE INDEX idx_entity_sources_entity ON entity_sources(entity_id);
CREATE INDEX idx_entity_sources_source ON entity_sources(source_id);

-- 3. COMMUNITIES TABLE
CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    summary TEXT,
    embedding VECTOR(1536),
    entity_ids JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_communities_owner ON communities(owner_id);
CREATE INDEX idx_communities_embedding ON communities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. FACTS TABLE (TEMPORAL KNOWLEDGE)
CREATE TABLE facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
    
    -- Triple (Subject-Predicate-Object)
    subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    predicate VARCHAR(255) NOT NULL,
    object_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    object_value TEXT,  -- For non-entity objects like "Python" or "42"
    
    -- Human-readable
    fact_text TEXT NOT NULL,
    embedding VECTOR(1536),
    
    -- BI-TEMPORAL (KEY INNOVATION)
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,  -- When fact became true
    valid_to TIMESTAMP WITH TIME ZONE,              -- When fact stopped being true (NULL = current)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  -- When recorded
    invalidated_at TIMESTAMP WITH TIME ZONE,        -- When marked invalid
    
    -- Confidence
    confidence FLOAT DEFAULT 1.0,
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    
    -- Status
    is_valid BOOLEAN DEFAULT TRUE,
    invalidation_reason VARCHAR(100)  -- superseded, contradicted, expired, manual
);

CREATE INDEX idx_facts_owner ON facts(owner_id);
CREATE INDEX idx_facts_subject ON facts(subject_entity_id);
CREATE INDEX idx_facts_object ON facts(object_entity_id);
CREATE INDEX idx_facts_predicate ON facts(predicate);
CREATE INDEX idx_facts_valid ON facts(valid_from, valid_to);
CREATE INDEX idx_facts_is_valid ON facts(is_valid);
CREATE INDEX idx_facts_embedding ON facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 5. MEMORY_ENTITIES TABLE (N:N)
CREATE TABLE memory_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(memory_id, entity_id)
);

CREATE INDEX idx_memory_entities_memory ON memory_entities(memory_id);
CREATE INDEX idx_memory_entities_entity ON memory_entities(entity_id);

-- 6. MEMORY_FACTS TABLE (N:N)
CREATE TABLE memory_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(memory_id, fact_id)
);

CREATE INDEX idx_memory_facts_memory ON memory_facts(memory_id);
CREATE INDEX idx_memory_facts_fact ON memory_facts(fact_id);

-- 7. ENTITY_LINKS TABLE (Entity Graph)
CREATE TABLE entity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    src_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    dst_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    relationship_type VARCHAR(50) NOT NULL,  -- knows, related_to, part_of, owns
    weight FLOAT DEFAULT 0.5,
    fact_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(src_entity_id, dst_entity_id)
);

CREATE INDEX idx_entity_links_src ON entity_links(src_entity_id);
CREATE INDEX idx_entity_links_dst ON entity_links(dst_entity_id);
```

### Migrations for Existing Tables

```sql
-- SOURCES TABLE MIGRATION
ALTER TABLE sources
ADD COLUMN event_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill: set event_at = created_at for existing records
UPDATE sources SET event_at = created_at WHERE event_at IS NULL;

-- MEMORIES TABLE MIGRATION
ALTER TABLE memories
ADD COLUMN valid_from TIMESTAMP WITH TIME ZONE,
ADD COLUMN valid_to TIMESTAMP WITH TIME ZONE,
ADD COLUMN recall_count INTEGER DEFAULT 0,
ADD COLUMN last_recalled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN coactivation_score FLOAT DEFAULT 0.0,
ADD COLUMN priority VARCHAR(20) DEFAULT 'archival',  -- core, archival
ADD COLUMN memory_type VARCHAR(50);  -- preference, fact, event, skill, insight

-- Backfill
UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;
UPDATE memories SET priority = 'archival' WHERE priority IS NULL;

CREATE INDEX idx_memories_valid ON memories(valid_from, valid_to);
CREATE INDEX idx_memories_recall_count ON memories(recall_count DESC);
CREATE INDEX idx_memories_priority ON memories(priority);

-- WAYPOINTS TABLE MIGRATION
ALTER TABLE waypoints
ADD COLUMN coactivation_count INTEGER DEFAULT 0,
ADD COLUMN last_coactivated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN relationship_type VARCHAR(50) DEFAULT 'similar';  -- similar, sequential, causal, hierarchical

CREATE INDEX idx_waypoints_coactivation ON waypoints(coactivation_count DESC);
```

---

## Processing Pipeline

### Ingestion Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          1. RAW INPUT                                    │
│  (Chat transcript, document, web page, code file)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       2. WORTHINESS CHECK                                │
│  LLM determines if content is worth remembering                         │
│  → Skip: "OK", "Thanks", trivial messages                              │
│  → Keep: Facts, preferences, events, knowledge                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    3. SOURCE CREATION                                    │
│  Store raw content with timestamps                                      │
│  - event_at: Extract from content or use message timestamp             │
│  - ingested_at: NOW()                                                   │
│  - Generate title + summary                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    4. ENTITY EXTRACTION  ⭐ NEW                         │
│  LLM extracts named entities from content                               │
│  - People: "John Smith", "my manager"                                  │
│  - Organizations: "OpenAI", "my company"                               │
│  - Concepts: "Python", "machine learning"                              │
│  - Places: "New York", "the office"                                    │
│                                                                          │
│  For each entity:                                                        │
│  1. Generate embedding for entity name                                  │
│  2. Search for existing similar entities (dedup)                        │
│  3. If duplicate: merge, update aliases, increment mention_count       │
│  4. If new: create entity, link to source                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    5. FACT EXTRACTION  ⭐ NEW                           │
│  LLM extracts relationships as SPO triples                              │
│                                                                          │
│  Example input: "I started working at OpenAI last month"               │
│  Extracted facts:                                                        │
│  - Subject: "User" (entity)                                             │
│  - Predicate: "works_at"                                                │
│  - Object: "OpenAI" (entity)                                            │
│  - valid_from: 2025-12-01 (relative date resolved)                     │
│  - valid_to: NULL (still current)                                       │
│                                                                          │
│  For each fact:                                                          │
│  1. Generate embedding                                                   │
│  2. Check for conflicts (same subject + predicate)                      │
│  3. If conflict: invalidate old fact (valid_to = NOW)                  │
│  4. Create new fact with temporal data                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    6. MEMORY EXTRACTION                                  │
│  LLM extracts atomic memory statements                                  │
│                                                                          │
│  - Classify sector: semantic, episodic, procedural, emotional, reflective│
│  - Classify type: preference, fact, event, skill, insight              │
│  - Calculate salience (importance 0-1)                                  │
│  - Set decay_lambda based on sector                                     │
│  - Set priority (core for high-salience preferences, archival otherwise)│
│  - Set valid_from (from fact temporal data or source event_at)         │
│                                                                          │
│  Deduplication:                                                          │
│  1. Calculate SimHash                                                    │
│  2. Check Hamming distance against existing memories                    │
│  3. If duplicate: boost salience of existing, skip new                 │
│  4. If new: create memory with all fields                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    7. LINKING & GRAPH BUILDING                           │
│                                                                          │
│  - Link memories to sources (memory_sources)                            │
│  - Link memories to entities (memory_entities)                          │
│  - Link memories to facts (memory_facts)                                │
│  - Generate waypoints (memory-to-memory graph)                          │
│  - Update entity_links based on shared facts                            │
│  - Update communities (cluster entities periodically)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Retrieval Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          1. QUERY INPUT                                  │
│  "What projects is John working on?"                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    2. MULTI-PATH SEARCH                                  │
│                                                                          │
│  Parallel searches:                                                      │
│  a) Vector search on memories.embedding                                 │
│  b) Vector search on entities.embedding                                 │
│  c) Vector search on facts.embedding                                    │
│  d) Keyword search (BM25) on memory content                             │
│  e) Graph traversal from matched entities                               │
│                                                                          │
│  Temporal filter: WHERE valid_to IS NULL OR valid_to > NOW()           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    3. COMPOSITE SCORING                                  │
│                                                                          │
│  Score = (                                                               │
│    vector_similarity * 0.30 +                                           │
│    salience * 0.20 +                                                    │
│    recency_boost * 0.15 +                                               │
│    coactivation_boost * 0.15 +  ⭐ NEW                                 │
│    entity_match_boost * 0.10 +  ⭐ NEW                                 │
│    fact_relevance * 0.10  ⭐ NEW                                       │
│  )                                                                       │
│                                                                          │
│  Sector-specific decay applied:                                          │
│  - episodic: fast decay                                                 │
│  - semantic: slow decay                                                 │
│  - procedural: very slow decay                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    4. CONTEXT ASSEMBLY                                   │
│                                                                          │
│  For top-ranked results:                                                 │
│  1. Include memory content                                               │
│  2. Include related entities with summaries                             │
│  3. Include relevant facts with temporal context                        │
│  4. Optionally: include source summary for full context                 │
│                                                                          │
│  Format for LLM consumption:                                             │
│  "Memory: User prefers Python for backend work                          │
│   Related: User works at OpenAI (since Dec 2024)                        │
│   Context: From chat on Jan 15, 2025"                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    5. POST-RETRIEVAL REINFORCEMENT  ⭐ NEW              │
│                                                                          │
│  For each retrieved memory:                                              │
│  1. Increment recall_count                                               │
│  2. Update last_recalled_at                                             │
│  3. Boost coactivation_score                                            │
│                                                                          │
│  For co-retrieved memories:                                              │
│  1. Strengthen waypoints between them                                   │
│  2. Increment waypoint coactivation_count                               │
│                                                                          │
│  (Hebbian learning: neurons that fire together wire together)           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Sector-Specific Decay Rates

```python
SECTOR_DECAY_CONFIG = {
    "episodic": {
        "decay_lambda": 0.05,      # Fast decay - events fade
        "priority_threshold": 0.9,  # Only very high salience becomes core
        "description": "Events, experiences, conversations"
    },
    "semantic": {
        "decay_lambda": 0.01,      # Slow decay - facts persist
        "priority_threshold": 0.7,
        "description": "Facts, knowledge, concepts"
    },
    "procedural": {
        "decay_lambda": 0.005,     # Very slow - skills stick
        "priority_threshold": 0.6,
        "description": "How-to, processes, workflows"
    },
    "emotional": {
        "decay_lambda": 0.03,      # Medium decay
        "priority_threshold": 0.8,
        "description": "Feelings, reactions, sentiments"
    },
    "reflective": {
        "decay_lambda": 0.01,      # Slow - insights are valuable
        "priority_threshold": 0.7,
        "description": "Insights, learnings, meta-thoughts"
    }
}

def calculate_effective_salience(memory, current_time):
    """Apply time-based decay to salience"""
    age_hours = (current_time - memory.last_seen_at).total_seconds() / 3600
    decay_factor = math.exp(-memory.decay_lambda * age_hours)
    
    # Boost for frequently recalled memories
    coactivation_boost = min(0.3, math.log10(memory.recall_count + 1) * 0.1)
    
    effective_salience = (memory.salience * decay_factor) + coactivation_boost
    return min(1.0, effective_salience)
```

---

## Core vs Archival Memory

### Core Memory (Always in Context)
```python
# Selection criteria for core memory
def is_core_memory(memory):
    return (
        memory.priority == "core" or
        (memory.salience >= SECTOR_DECAY_CONFIG[memory.sector]["priority_threshold"] 
         and memory.memory_type == "preference") or
        (memory.recall_count >= 10 and memory.salience >= 0.8)
    )

# Core memory budget: ~2KB (fits in system prompt)
MAX_CORE_MEMORIES = 20

def get_core_memories(user_id):
    """Always include these in LLM context"""
    return db.query(Memory).filter(
        Memory.owner_id == user_id,
        Memory.is_active == True,
        or_(
            Memory.priority == "core",
            and_(Memory.salience >= 0.8, Memory.memory_type == "preference")
        )
    ).order_by(Memory.salience.desc()).limit(MAX_CORE_MEMORIES).all()
```

### Archival Memory (Searchable)
```python
# Everything else - retrieved on demand
def search_archival_memories(user_id, query, limit=10):
    """Semantic search over archival memories"""
    query_embedding = embed(query)
    
    return db.query(Memory).filter(
        Memory.owner_id == user_id,
        Memory.is_active == True,
        Memory.valid_to == None  # Only current facts
    ).order_by(
        Memory.embedding.cosine_distance(query_embedding)
    ).limit(limit).all()
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2) 🔴 Critical

1. **Add temporal fields to memories**
   - `valid_from`, `valid_to`
   - `recall_count`, `last_recalled_at`, `coactivation_score`
   - `priority`, `memory_type`

2. **Add temporal fields to sources**
   - `event_at`, `ingested_at`

3. **Update waypoints**
   - `coactivation_count`, `last_coactivated_at`
   - `relationship_type`

4. **Implement post-retrieval reinforcement**
   - Increment recall_count on search
   - Strengthen co-activated waypoints

### Phase 2: Entities & Facts (Week 3-4) 🟡 Important

5. **Create entities table**
   - Entity extraction in ingestion pipeline
   - Entity deduplication and merging

6. **Create facts table**
   - Fact extraction with temporal data
   - Conflict detection and invalidation

7. **Create linking tables**
   - `memory_entities`
   - `memory_facts`
   - `entity_sources`

### Phase 3: Advanced Features (Week 5-6) 🟢 Enhancement

8. **Implement communities**
   - Periodic entity clustering
   - Community summaries

9. **Entity graph**
   - `entity_links` table
   - Graph-based retrieval

10. **Timeline queries**
    - "What was true on date X?"
    - Entity history reconstruction

### Phase 4: Optimization (Ongoing)

11. **Core memory selection**
    - Automatic promotion/demotion
    - Budget management

12. **Decay engine**
    - Background job for salience decay
    - Cleanup of very low salience memories

13. **Search optimization**
    - Multi-path search with scoring
    - Reranker integration

---

## API Changes

### New Endpoints

```python
# Temporal queries
GET /v1/timeline/{entity_id}
GET /v1/facts?as_of={timestamp}
GET /v1/facts?subject={entity_id}&predicate={predicate}

# Entity management
GET /v1/entities
GET /v1/entities/{id}
POST /v1/entities/merge

# Community view
GET /v1/communities
GET /v1/communities/{id}/entities

# Enhanced search
POST /v1/search
{
    "query": "...",
    "as_of": "2024-12-01",  # Point-in-time query
    "include_entities": true,
    "include_facts": true,
    "temporal_filter": "current"  # current, historical, all
}
```

### Updated Search Response

```json
{
    "memories": [
        {
            "id": "...",
            "content": "User prefers Python for backend",
            "sector": "semantic",
            "memory_type": "preference",
            "salience": 0.85,
            "recall_count": 12,
            "valid_from": "2024-06-15T00:00:00Z",
            "valid_to": null,
            "entities": [
                {"id": "...", "name": "Python", "type": "concept"}
            ],
            "facts": [
                {
                    "id": "...",
                    "fact_text": "User prefers Python",
                    "valid_from": "2024-06-15",
                    "valid_to": null
                }
            ]
        }
    ],
    "entities": [...],
    "facts": [...],
    "communities": [...]
}
```

---

## Summary

### Key Upgrades

| Category | Current | Upgraded |
|----------|---------|----------|
| **Temporal** | created_at only | valid_from/valid_to (bi-temporal) |
| **Entities** | None | Full entity extraction + graph |
| **Facts** | Implicit in memories | Explicit SPO triples with validity |
| **Reinforcement** | None | Coactivation tracking + waypoint strengthening |
| **Priority** | None | Core/archival tiered memory |
| **Decay** | Static | Sector-specific adaptive decay |
| **Search** | Vector only | Multi-path (vector + entity + fact + graph) |
| **Conflicts** | None | Automatic detection + invalidation |

### Brain-Like Features Achieved

1. ✅ **Long-term vs short-term** (core vs archival)
2. ✅ **Different memory types** (5 sectors + types)
3. ✅ **Forgetting** (sector-specific decay)
4. ✅ **Reinforcement** (coactivation on recall)
5. ✅ **Association** (waypoints + entity graph)
6. ✅ **Knowledge evolution** (temporal facts + conflict resolution)
7. ✅ **Context preservation** (sources linked to memories)

This architecture combines the best of:
- **OpenMemory**: Sector classification, decay, waypoints
- **Zep/Graphiti**: Bi-temporal model, entity-fact extraction
- **Mem0**: Multi-level memory, conflict detection
- **UniMemory**: Source preservation, multi-tenancy

The result is a **production-ready, brain-like memory system** that can scale while maintaining accurate, temporally-aware knowledge.
