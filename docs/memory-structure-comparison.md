# Memory Structure Comparison: OpenMemory vs UniMemory

## Executive Summary

After analyzing both systems, **OpenMemory has a more brain-like architecture** with superior temporal reasoning and memory lifecycle management. However, **UniMemory has better multi-tenancy and source tracking**. The ideal solution is to **adopt OpenMemory's core memory concepts while keeping UniMemory's source-memory separation**.

---

## 1. Core Architecture Comparison

### OpenMemory (CaviraOSS)
```
Hierarchical Memory Decomposition + Temporal Knowledge Graph

┌─────────────────────────────────────────────────┐
│           INPUT / QUERY                          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         SECTOR CLASSIFIER (LLM)                  │
│  Categorizes into 5 memory types                │
└─────────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓           ↓           ↓
    Episodic    Semantic    Procedural
    (events)    (facts)     (how-to)
        ↓           ↓           ↓
    Emotional   Reflective
    (feelings)  (insights)
                    ↓
┌─────────────────────────────────────────────────┐
│         EMBEDDING ENGINE                         │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  STORAGE: SQLite/Postgres                       │
│  • Memories (with vectors)                      │
│  • Waypoints (graph edges)                      │
│  • Temporal Facts (valid_from/valid_to)         │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         RECALL ENGINE                            │
│  • Vector Search                                 │
│  • Waypoint Graph Traversal                     │
│  • Composite Scoring (salience + recency +      │
│    coactivation)                                 │
│  • Decay Engine (adaptive forgetting)           │
│  • Temporal Timeline Queries                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  CONSOLIDATION + REFLECTION                     │
│  • Reinforces waypoints                         │
│  • Updates salience                             │
└─────────────────────────────────────────────────┘
```

### UniMemory (Current)
```
Two-Layer Storage: Sources (Raw) + Memories (Distilled)

┌─────────────────────────────────────────────────┐
│           INPUT (Chat/Text/Document)             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         INGESTION PIPELINE                       │
│  1. Worthiness Check (LLM)                      │
│  2. Title Generation (LLM)                      │
│  3. Summary Generation (LLM)                    │
│  4. Memory Extraction (LLM)                     │
└─────────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│   SOURCES    │      │   MEMORIES   │
│  (Raw Truth) │      │  (Distilled) │
│              │      │              │
│ • raw_content│      │ • content    │
│ • summary    │      │ • embedding  │
│ • embedding  │      │ • simhash    │
│ • metadata   │      │ • sector     │
└──────────────┘      │ • salience   │
                      │ • decay_λ    │
                      └──────────────┘
                            ↓
                ┌───────────┴───────────┐
                ↓                       ↓
        ┌──────────────┐      ┌──────────────┐
        │ MEMORY_SOURCES│      │  WAYPOINTS   │
        │  (N:N Links)  │      │  (Graph)     │
        └──────────────┘      └──────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         SEARCH ENGINE                            │
│  • Hybrid Search (vector + keyword)             │
│  • Salience Weighting                           │
│  • Recency Boost                                │
│  • Sector Filtering                             │
└─────────────────────────────────────────────────┘
```

---

## 2. Detailed Feature Comparison

| Feature | OpenMemory | UniMemory | Winner |
|---------|-----------|-----------|--------|
| **Memory Sectors** | ✅ 5 sectors (episodic, semantic, procedural, emotional, reflective) | ✅ 5 sectors (same) | 🟰 Tie |
| **Sector Classification** | ✅ Automatic via LLM | ✅ Automatic via LLM | 🟰 Tie |
| **Deduplication** | ✅ SimHash | ✅ SimHash | 🟰 Tie |
| **Salience/Importance** | ✅ Adaptive scoring | ✅ Static scoring | 🏆 OpenMemory |
| **Decay Engine** | ✅ Sector-specific adaptive decay | ✅ Static decay_lambda per memory | 🏆 OpenMemory |
| **Temporal Reasoning** | ✅ **valid_from/valid_to** (truth windows) | ❌ Only created_at/updated_at | 🏆 **OpenMemory** |
| **Point-in-Time Queries** | ✅ "What was true on date X?" | ❌ Not supported | 🏆 **OpenMemory** |
| **Timeline Reconstruction** | ✅ Entity history over time | ❌ Not supported | 🏆 **OpenMemory** |
| **Auto-Evolution** | ✅ New facts close old ones | ❌ Manual updates only | 🏆 **OpenMemory** |
| **Confidence Decay** | ✅ Old facts fade gracefully | ⚠️ Hard expiry via expires_at | 🏆 OpenMemory |
| **Waypoint Graph** | ✅ Associative links | ✅ Associative links | 🟰 Tie |
| **Coactivation** | ✅ Reinforcement on recall | ❌ Not implemented | 🏆 OpenMemory |
| **Composite Scoring** | ✅ Salience + recency + coactivation | ⚠️ Similarity + salience + recency | 🏆 OpenMemory |
| **Explainable Traces** | ✅ Shows which nodes were recalled | ❌ Not implemented | 🏆 OpenMemory |
| **Source Tracking** | ❌ No separate source layer | ✅ **Full raw content preservation** | 🏆 **UniMemory** |
| **Source-Memory Linking** | ❌ Not supported | ✅ **N:N via memory_sources** | 🏆 **UniMemory** |
| **Multi-Tenancy** | ⚠️ Basic user_id | ✅ **owner_id + end_user_id + api_key_id** | 🏆 **UniMemory** |
| **B2B API Support** | ❌ Not designed for it | ✅ API keys, rate limiting, usage tracking | 🏆 **UniMemory** |
| **Activity Logging** | ❌ Not mentioned | ✅ Comprehensive activity_logs | 🏆 **UniMemory** |
| **MCP Integration** | ✅ Native MCP server | ✅ Native MCP server | 🟰 Tie |
| **Vector Search** | ✅ pgvector/SQLite | ✅ pgvector | 🟰 Tie |

---

## 3. Key Differences (Brain-Like Perspective)

### What Makes OpenMemory More Brain-Like

#### 1. **Temporal Reasoning (Critical Missing Feature in UniMemory)**
```python
# OpenMemory: Facts have validity windows
POST /api/temporal/fact {
  "subject": "CompanyX",
  "predicate": "has_CEO",
  "object": "Alice",
  "valid_from": "2021-01-01"
}

# Later, new fact automatically closes the old one
POST /api/temporal/fact {
  "subject": "CompanyX",
  "predicate": "has_CEO",
  "object": "Bob",
  "valid_from": "2024-04-10"
}

# Query: "Who was CEO in 2022?" → Alice
# Query: "Who is CEO now?" → Bob
```

**Human Brain Equivalent**: Episodic memory with temporal context. You remember "Alice was CEO when I joined" vs "Bob is CEO now".

**UniMemory Current**: No temporal reasoning. If you update a fact, the old one is lost or you have duplicates.

#### 2. **Adaptive Decay (vs Static Decay)**
```python
# OpenMemory: Sector-specific decay rates
- Episodic: Fast decay (events fade)
- Semantic: Slow decay (facts persist)
- Procedural: Very slow decay (skills stick)
- Emotional: Medium decay (feelings fade but slower than events)
- Reflective: Slow decay (insights are valuable)

# Plus: Coactivation reinforcement
# Memories recalled frequently get stronger (like real neurons)
```

**Human Brain Equivalent**: You forget what you ate last Tuesday (episodic) but remember how to ride a bike (procedural).

**UniMemory Current**: Static `decay_lambda = 0.02` for all memories. No reinforcement on recall.

#### 3. **Coactivation & Reinforcement**
```python
# OpenMemory: When a memory is recalled
1. Its salience increases (reinforcement)
2. Waypoints to related memories strengthen
3. Frequently co-activated memories form stronger links

# Like Hebbian learning: "Neurons that fire together, wire together"
```

**Human Brain Equivalent**: When you think about "Python", you also recall "programming", "Django", "data science" because they're frequently co-activated.

**UniMemory Current**: No reinforcement. Memories don't get stronger with use.

#### 4. **Consolidation & Reflection**
```python
# OpenMemory: Post-recall processing
- Consolidates related memories
- Reflects on patterns
- Updates waypoint weights
- Adjusts salience based on usage
```

**Human Brain Equivalent**: Sleep consolidation. Your brain strengthens important memories and prunes weak ones.

**UniMemory Current**: No consolidation. Memories are static after creation.

### What Makes UniMemory Better

#### 1. **Source Preservation (Critical for RAG)**
```python
# UniMemory: Two-layer model
sources:
  - raw_content: Full chat transcript (JSONB)
  - summary: LLM-generated summary
  - summary_embedding: For semantic search

memories:
  - content: Extracted atomic facts
  - embedding: For semantic search

memory_sources:
  - Links memories back to their source
```

**Why This Matters**: When an LLM needs context, it can:
1. Search memories (fast, semantic)
2. Follow links to sources
3. Pull full raw content for accurate context

**OpenMemory**: No source layer. Once extracted, raw context is lost.

#### 2. **Multi-Tenancy Architecture**
```python
# UniMemory: Proper isolation
owner_id: The UniMemory account (developer/consumer)
end_user_id: The end-user of the developer's app
api_key_id: Which API key was used

# Enables:
- B2B API (developers can serve their users)
- Consumer app (direct end-users)
- Usage tracking per API key
- Proper data isolation
```

**OpenMemory**: Basic `user_id` only. Not designed for multi-tenant B2B.

#### 3. **Activity Tracking**
```python
# UniMemory: Comprehensive logging
activity_logs:
  - action: memory_created, source_created, memory_searched, etc.
  - source: extension, mcp, dashboard, api
  - agent: cursor, windsurf, claude, etc.
  - details: Full context

# Enables:
- Activity feed in dashboard
- Audit trail
- Usage analytics
- Debugging
```

**OpenMemory**: No activity tracking mentioned.

---

## 4. The Ideal Hybrid Structure

### Recommended Architecture for UniMemory

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT LAYER                               │
│  (Chat, Text, Document from Extension/MCP/API)             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              INGESTION PIPELINE                              │
│  1. Worthiness Check                                        │
│  2. Source Creation (preserve raw content)                  │
│  3. Title + Summary Generation                              │
│  4. Memory Extraction                                       │
│  5. Sector Classification (per memory)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
                ┌───────────┴───────────┐
                ↓                       ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│      SOURCES TABLE       │  │     MEMORIES TABLE       │
│   (Raw Truth Layer)      │  │  (Distilled Knowledge)   │
├──────────────────────────┤  ├──────────────────────────┤
│ • id                     │  │ • id                     │
│ • raw_content (JSONB)    │  │ • content                │
│ • summary                │  │ • embedding (vector)     │
│ • summary_embedding      │  │ • simhash                │
│ • source_metadata        │  │ • sector                 │
│ • created_at             │  │ • salience               │
│ • owner_id               │  │ • decay_lambda (sector)  │
│ • end_user_id            │  │ • coactivation_count ⭐  │
│                          │  │ • last_recalled_at ⭐    │
│                          │  │ • created_at             │
│                          │  │ • updated_at             │
│                          │  │ • owner_id               │
│                          │  │ • end_user_id            │
│                          │  │ • api_key_id             │
└──────────────────────────┘  └──────────────────────────┘
                                        ↓
                        ┌───────────────┴───────────────┐
                        ↓                               ↓
            ┌──────────────────────┐      ┌──────────────────────┐
            │  MEMORY_SOURCES      │      │    WAYPOINTS         │
            │  (N:N Linking)       │      │  (Memory Graph)      │
            ├──────────────────────┤      ├──────────────────────┤
            │ • memory_id          │      │ • src_id             │
            │ • source_id          │      │ • dst_id             │
            │ • created_at         │      │ • weight             │
            └──────────────────────┘      │ • coactivation ⭐    │
                                          │ • last_used_at ⭐    │
                                          └──────────────────────┘
                                                    ↓
            ┌────────────────────────────────────────────────────┐
            │         TEMPORAL_FACTS TABLE ⭐ NEW                │
            ├────────────────────────────────────────────────────┤
            │ • id                                               │
            │ • subject (entity)                                 │
            │ • predicate (relationship)                         │
            │ • object (value)                                   │
            │ • valid_from (timestamp)                           │
            │ • valid_to (timestamp, nullable)                   │
            │ • confidence (0.0-1.0)                             │
            │ • source_id (FK to sources)                        │
            │ • owner_id                                         │
            │ • created_at                                       │
            └────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────┐
│                  RECALL ENGINE                               │
├─────────────────────────────────────────────────────────────┤
│  1. Vector Search (pgvector cosine similarity)              │
│  2. Waypoint Graph Traversal                                │
│  3. Composite Scoring:                                      │
│     - Vector similarity                                     │
│     - Salience (importance)                                 │
│     - Recency (time decay)                                  │
│     - Coactivation (usage frequency) ⭐                     │
│     - Sector-specific decay ⭐                              │
│  4. Temporal Filtering (valid_from/valid_to) ⭐            │
│  5. Source Link Resolution                                  │
└─────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────┐
│            POST-RECALL CONSOLIDATION ⭐ NEW                 │
├─────────────────────────────────────────────────────────────┤
│  1. Increment coactivation_count on recalled memories       │
│  2. Update last_recalled_at                                 │
│  3. Strengthen waypoints between co-recalled memories       │
│  4. Boost salience for frequently used memories             │
│  5. Log activity for audit trail                            │
└─────────────────────────────────────────────────────────────┘
```

⭐ = New features to add from OpenMemory

---

## 5. Specific Recommendations for UniMemory

### Phase 1: Add Temporal Reasoning (High Priority)

#### New Table: `temporal_facts`
```sql
CREATE TABLE temporal_facts (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,      -- Entity (e.g., "CompanyX", "user123")
    predicate VARCHAR(255) NOT NULL,    -- Relationship (e.g., "has_CEO", "lives_in")
    object TEXT NOT NULL,               -- Value (e.g., "Alice", "San Francisco")
    valid_from TIMESTAMP NOT NULL,      -- When this became true
    valid_to TIMESTAMP,                 -- When this stopped being true (NULL = still true)
    confidence FLOAT DEFAULT 1.0,       -- Confidence score (0.0-1.0)
    source_id UUID REFERENCES sources(id),  -- Link to source
    owner_id UUID NOT NULL REFERENCES users(id),
    end_user_id UUID REFERENCES end_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_temporal_subject (owner_id, subject),
    INDEX idx_temporal_predicate (predicate),
    INDEX idx_temporal_valid (valid_from, valid_to)
);
```

#### API Endpoints
```python
# Add temporal fact
POST /v1/temporal/fact
{
  "subject": "user123",
  "predicate": "prefers_language",
  "object": "Python",
  "valid_from": "2024-01-01"
}

# Query temporal facts
GET /v1/temporal/facts?subject=user123&predicate=prefers_language&as_of=2024-06-01

# Get timeline
GET /v1/temporal/timeline?subject=user123
```

### Phase 2: Add Coactivation & Reinforcement (Medium Priority)

#### Update `memories` table
```sql
ALTER TABLE memories
ADD COLUMN coactivation_count INTEGER DEFAULT 0,
ADD COLUMN last_recalled_at TIMESTAMP;

CREATE INDEX idx_memories_coactivation ON memories(coactivation_count DESC);
```

#### Update `waypoints` table
```sql
ALTER TABLE waypoints
ADD COLUMN coactivation_count INTEGER DEFAULT 0,
ADD COLUMN last_used_at TIMESTAMP;
```

#### Post-Recall Hook
```python
async def reinforce_memories(recalled_memory_ids: List[str], session: AsyncSession):
    """
    Called after memories are recalled and used.
    Implements Hebbian learning: strengthen what's used.
    """
    # 1. Increment coactivation_count
    await session.execute(
        update(Memory)
        .where(Memory.id.in_(recalled_memory_ids))
        .values(
            coactivation_count=Memory.coactivation_count + 1,
            last_recalled_at=datetime.utcnow()
        )
    )
    
    # 2. Boost salience for frequently recalled memories
    await session.execute(
        update(Memory)
        .where(Memory.id.in_(recalled_memory_ids))
        .where(Memory.coactivation_count > 10)  # Threshold
        .values(salience=func.least(Memory.salience + 0.05, 1.0))
    )
    
    # 3. Strengthen waypoints between co-recalled memories
    for i, mem1 in enumerate(recalled_memory_ids):
        for mem2 in recalled_memory_ids[i+1:]:
            # Find or create waypoint
            waypoint = await session.execute(
                select(Waypoint)
                .where(Waypoint.src_id == mem1, Waypoint.dst_id == mem2)
            )
            wp = waypoint.scalar_one_or_none()
            
            if wp:
                # Strengthen existing waypoint
                wp.coactivation_count += 1
                wp.weight = min(wp.weight + 0.05, 1.0)
                wp.last_used_at = datetime.utcnow()
            else:
                # Create new waypoint
                new_wp = Waypoint(
                    src_id=mem1,
                    dst_id=mem2,
                    weight=0.3,
                    coactivation_count=1,
                    last_used_at=datetime.utcnow()
                )
                session.add(new_wp)
    
    await session.commit()
```

### Phase 3: Sector-Specific Decay (Medium Priority)

#### Update decay calculation
```python
# Current: Static decay_lambda
decay_lambda = 0.02

# New: Sector-specific decay rates
SECTOR_DECAY_RATES = {
    "episodic": 0.05,      # Events fade quickly
    "semantic": 0.01,      # Facts persist
    "procedural": 0.005,   # Skills stick
    "emotional": 0.03,     # Feelings fade medium
    "reflective": 0.01,    # Insights are valuable
}

def get_sector_decay_lambda(sector: str) -> float:
    return SECTOR_DECAY_RATES.get(sector, 0.02)

# Apply during memory creation
memory.decay_lambda = get_sector_decay_lambda(memory.sector)
```

### Phase 4: Composite Scoring with Coactivation (High Priority)

#### Update search scoring
```python
# Current scoring
score = (
    similarity * 0.5 +
    salience * 0.3 +
    recency_boost * 0.2
)

# New scoring with coactivation
score = (
    similarity * 0.4 +
    salience * 0.25 +
    recency_boost * 0.15 +
    coactivation_boost * 0.2  # NEW: Frequently used memories rank higher
)

# Coactivation boost calculation
def calculate_coactivation_boost(memory: Memory) -> float:
    """
    Boost score for frequently recalled memories.
    Uses logarithmic scale to avoid over-boosting.
    """
    if memory.coactivation_count == 0:
        return 0.0
    
    # Log scale: 1 recall = 0.1, 10 recalls = 0.2, 100 recalls = 0.3
    return min(math.log10(memory.coactivation_count + 1) * 0.1, 0.5)
```

### Phase 5: Explainable Traces (Low Priority)

#### Add trace logging
```python
class RecallTrace(BaseModel):
    """Explains why memories were recalled"""
    memory_id: str
    content: str
    scores: Dict[str, float]  # similarity, salience, recency, coactivation
    final_score: float
    waypoints_traversed: List[str]  # Which waypoints led here
    reason: str  # Human-readable explanation

async def search_with_trace(query: str, ...) -> Tuple[List[Memory], List[RecallTrace]]:
    """
    Returns both memories and explanation of why they were chosen.
    """
    # ... search logic ...
    
    traces = []
    for memory, scores in results:
        trace = RecallTrace(
            memory_id=memory.id,
            content=memory.content,
            scores=scores,
            final_score=scores['final'],
            waypoints_traversed=scores.get('waypoints', []),
            reason=f"High similarity ({scores['similarity']:.2f}) and "
                   f"frequently recalled ({memory.coactivation_count} times)"
        )
        traces.append(trace)
    
    return memories, traces
```

---

## 6. Migration Strategy

### Step 1: Non-Breaking Additions (Do First)
- ✅ Add `coactivation_count` and `last_recalled_at` to `memories`
- ✅ Add `coactivation_count` and `last_used_at` to `waypoints`
- ✅ Create `temporal_facts` table
- ✅ Implement sector-specific decay rates
- ✅ Add post-recall reinforcement hook

### Step 2: Update Search Logic (Backward Compatible)
- ✅ Add coactivation boost to scoring
- ✅ Keep old scoring as fallback
- ✅ A/B test new scoring

### Step 3: Add New APIs (Additive)
- ✅ `POST /v1/temporal/fact`
- ✅ `GET /v1/temporal/facts`
- ✅ `GET /v1/temporal/timeline`
- ✅ `GET /v1/search?include_trace=true`

### Step 4: Dashboard Updates
- ✅ Show coactivation counts in memory cards
- ✅ Add timeline view for temporal facts
- ✅ Add "Frequently Recalled" filter
- ✅ Show recall traces in search results

---

## 7. Final Verdict

### What to Keep from UniMemory
✅ **Source-Memory separation** (critical for RAG)  
✅ **Multi-tenancy architecture** (owner_id + end_user_id + api_key_id)  
✅ **Activity logging** (audit trail)  
✅ **MCP integration** (already working)  
✅ **Dashboard** (consumer + console)  

### What to Adopt from OpenMemory
⭐ **Temporal reasoning** (valid_from/valid_to)  
⭐ **Coactivation & reinforcement** (Hebbian learning)  
⭐ **Sector-specific decay** (brain-like forgetting)  
⭐ **Composite scoring with coactivation**  
⭐ **Post-recall consolidation**  
⭐ **Explainable traces** (optional, nice-to-have)  

### The Perfect Structure
```
UniMemory's Architecture
    +
OpenMemory's Memory Lifecycle
    =
Brain-Like Memory System with Full Context Preservation
```

---

## 8. Implementation Priority

### 🔴 Critical (Do Now)
1. **Temporal Facts Table** - Enables truth evolution over time
2. **Coactivation Tracking** - Foundation for reinforcement learning
3. **Sector-Specific Decay** - Brain-like forgetting

### 🟡 Important (Do Soon)
4. **Post-Recall Reinforcement** - Strengthen frequently used memories
5. **Composite Scoring Update** - Better search relevance
6. **Temporal Query APIs** - Point-in-time queries

### 🟢 Nice-to-Have (Do Later)
7. **Explainable Traces** - Debugging and transparency
8. **Consolidation Background Job** - Periodic memory strengthening
9. **Timeline Visualization** - Dashboard feature

---

## Conclusion

**OpenMemory is technically superior for brain-like memory** due to temporal reasoning, adaptive decay, and reinforcement learning. However, **UniMemory's source-memory architecture is better for RAG applications** where you need full context.

**The winning strategy**: Keep UniMemory's two-layer architecture (sources + memories) and add OpenMemory's temporal reasoning, coactivation, and adaptive decay. This gives you:
- ✅ Brain-like memory lifecycle
- ✅ Full context preservation for RAG
- ✅ Multi-tenant B2B support
- ✅ Temporal reasoning (what was true when)
- ✅ Reinforcement learning (memories strengthen with use)

This hybrid approach will make UniMemory the **most advanced memory system** for LLM applications.
