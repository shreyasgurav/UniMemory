# UniMemory Enhanced Search Service Plan

## Current State Analysis

### Existing Search (`/consumer/search`)
- **Type**: Hybrid semantic + keyword search
- **Input**: Simple query string
- **Output**: List of memories only
- **Limitations**:
  - No query understanding/interpretation
  - Only returns memories, not sources
  - No context-aware retrieval
  - No intelligent decision on what to return (full doc vs memories)

### Current Flow
```
User Query → Embedding → Vector Search → Memories → Return
```

## Proposed Enhanced Search Service

### Architecture: "Fast Context" AI-Powered Search

Inspired by Cursor/Windsurf's fast context feature, but for personal memory retrieval.

### Key Components

#### 1. **Query Understanding Layer** (NEW)
```
Natural Language Query → LLM Analysis → Structured Search Intent
```

**LLM analyzes query to extract:**
- **Intent**: What is the user trying to do?
  - `retrieve_context`: Get background for continuing work
  - `find_specific`: Find specific information/conversation
  - `explore_topic`: Browse related content
  - `reference_check`: Quick fact lookup

- **Entities**: What are they looking for?
  - Projects (e.g., "UniMemory", "authentication system")
  - Technologies (e.g., "FastAPI", "React", "Claude")
  - Timeframes (e.g., "last week", "yesterday", "recent")
  - People/Sources (e.g., "Claude chats", "ChatGPT conversations")

- **Context Requirements**: What do they need?
  - `full_documents`: Need complete raw content
  - `summaries_only`: Just need overview
  - `memories_only`: Specific facts/insights
  - `mixed`: Combination based on relevance

**Example Query Analysis:**
```
Query: "I was working on authentication with Claude, find those chats"

LLM Output:
{
  "intent": "retrieve_context",
  "entities": {
    "project": "authentication",
    "source": "Claude",
    "type": "chat"
  },
  "context_requirement": "full_documents",
  "timeframe": "recent",
  "search_terms": ["authentication", "auth", "login", "session"]
}
```

#### 2. **Multi-Stage Retrieval** (ENHANCED)
```
Stage 1: Broad Semantic Search (memories + sources)
Stage 2: Entity Filtering (project, source, timeframe)
Stage 3: Relevance Ranking (LLM-assisted)
Stage 4: Context Assembly (smart selection)
```

**Stage 1: Broad Search**
- Semantic search on both memories AND sources
- Use expanded search terms from query analysis
- Cast wide net initially

**Stage 2: Entity Filtering**
- Filter by source type (chat, document, etc.)
- Filter by platform (Claude, ChatGPT, etc.)
- Filter by timeframe
- Filter by project/topic tags

**Stage 3: Relevance Ranking**
- Use LLM to re-rank results based on query intent
- Consider:
  - Semantic similarity
  - Recency (if timeframe specified)
  - Source quality (memory count, summary quality)
  - User's likely need

**Stage 4: Context Assembly**
- Based on `context_requirement`:
  - **full_documents**: Return complete source raw_content
  - **summaries_only**: Return source summaries
  - **memories_only**: Return extracted memories
  - **mixed**: Return combination (e.g., summary + key memories)

#### 3. **Response Format** (NEW)

```json
{
  "query": "original query",
  "understood_intent": {
    "intent": "retrieve_context",
    "entities": {...},
    "context_requirement": "full_documents"
  },
  "results": [
    {
      "type": "source",
      "id": "...",
      "title": "Authentication discussion with Claude",
      "relevance_score": 0.95,
      "relevance_reason": "Exact match: Claude chat about authentication",
      "content": {
        "raw_content": {...},  // Full chat if needed
        "summary": "...",
        "key_memories": [...]
      },
      "metadata": {
        "source_app": "Claude",
        "created_at": "...",
        "memory_count": 5
      }
    }
  ],
  "total": 3,
  "search_strategy": "full_documents_with_summaries"
}
```

## Implementation Plan

### Phase 1: Query Understanding Service

**File**: `api/app/core/query_analyzer.py`

```python
class QueryAnalyzer:
    async def analyze_query(self, query: str) -> QueryIntent:
        """
        Use LLM to understand user's search intent
        """
        # LLM prompt to extract intent, entities, context requirements
        # Return structured QueryIntent object
        
class QueryIntent:
    intent: str  # retrieve_context, find_specific, etc.
    entities: dict  # project, source, timeframe, etc.
    context_requirement: str  # full_documents, summaries_only, etc.
    search_terms: list[str]  # Expanded search terms
    timeframe: Optional[str]
```

### Phase 2: Enhanced Search Endpoint

**File**: `api/app/api/consumer.py`

New endpoint: `/consumer/search/enhanced` or upgrade existing `/consumer/search`

```python
@router.post("/consumer/search/enhanced")
async def enhanced_search(
    request: EnhancedSearchRequest,
    user: User = Depends(verify_consumer_session_token),
    session: AsyncSession = Depends(get_db)
):
    # 1. Analyze query with LLM
    query_intent = await query_analyzer.analyze_query(request.query)
    
    # 2. Multi-stage retrieval
    # Stage 1: Broad semantic search
    memories = await search_memories(query_intent.search_terms)
    sources = await search_sources(query_intent.search_terms)
    
    # Stage 2: Entity filtering
    filtered = filter_by_entities(memories, sources, query_intent.entities)
    
    # Stage 3: LLM re-ranking
    ranked = await rerank_results(filtered, query_intent)
    
    # Stage 4: Context assembly
    results = assemble_context(ranked, query_intent.context_requirement)
    
    return EnhancedSearchResponse(...)
```

### Phase 3: Context Assembly Logic

**File**: `api/app/core/context_assembler.py`

```python
class ContextAssembler:
    def assemble(self, results, context_requirement):
        """
        Decide what to return based on context_requirement
        """
        if context_requirement == "full_documents":
            # Return complete raw_content for sources
            return self._assemble_full_docs(results)
        
        elif context_requirement == "summaries_only":
            # Return just summaries
            return self._assemble_summaries(results)
        
        elif context_requirement == "memories_only":
            # Return extracted memories
            return self._assemble_memories(results)
        
        elif context_requirement == "mixed":
            # Smart combination
            return self._assemble_mixed(results)
```

### Phase 4: Frontend Integration

**Extension Popup Updates:**
- Show search strategy used
- Display relevance reasons
- Better formatting for different content types
- Show "Why this result?" explanations

## Example Use Cases

### Use Case 1: Continue Previous Work
```
Query: "I was working on authentication with Claude, find those chats"

Flow:
1. LLM understands: retrieve_context, source=Claude, topic=authentication
2. Search finds 3 Claude chats about auth
3. Returns FULL raw content of those chats
4. User clicks → entire chat inserted into current session
```

### Use Case 2: Quick Reference
```
Query: "What was that FastAPI middleware pattern I used?"

Flow:
1. LLM understands: reference_check, technology=FastAPI, topic=middleware
2. Search finds relevant memories
3. Returns MEMORIES ONLY (specific code patterns)
4. User clicks → code snippet inserted
```

### Use Case 3: Topic Exploration
```
Query: "Show me everything about React hooks from last week"

Flow:
1. LLM understands: explore_topic, technology=React hooks, timeframe=last_week
2. Search finds sources + memories
3. Returns MIXED (summaries + key memories)
4. User browses → can expand to full docs if needed
```

## Performance Considerations

### Caching Strategy
- Cache LLM query analysis (same query = same intent)
- Cache search results per intent
- TTL: 5 minutes for query analysis, 2 minutes for results

### Cost Optimization
- Use cheaper model for query analysis (GPT-4o-mini)
- Batch re-ranking when possible
- Only use LLM for complex queries (>5 words)

### Speed Targets
- Query analysis: <500ms
- Search + ranking: <1s
- Total response: <1.5s

## Migration Path

### Option A: New Endpoint (Recommended)
- Create `/consumer/search/enhanced`
- Keep existing `/consumer/search` for backward compatibility
- Gradually migrate extension to use enhanced version

### Option B: Upgrade Existing
- Add `enhanced=true` parameter to `/consumer/search`
- Default to simple search, opt-in to enhanced
- Eventually make enhanced the default

## Success Metrics

- **Relevance**: User clicks on first result >80% of time
- **Speed**: <1.5s average response time
- **Coverage**: Finds relevant content >90% of queries
- **User Satisfaction**: Reduces search iterations (fewer searches per task)

## Next Steps

1. ✅ Create this plan document
2. ⏳ Implement QueryAnalyzer with LLM
3. ⏳ Enhance search to include sources
4. ⏳ Add entity filtering logic
5. ⏳ Implement context assembly
6. ⏳ Create new enhanced search endpoint
7. ⏳ Update extension to use enhanced search
8. ⏳ Test with real queries
9. ⏳ Deploy and monitor

## Technical Decisions

### LLM Model Choice
- **Query Analysis**: GPT-4o-mini (fast, cheap, good enough)
- **Re-ranking**: GPT-4o-mini (can handle relevance scoring)

### Database Queries
- Use pgvector for semantic search
- Add indexes on source_app, created_at for filtering
- Consider materialized view for common filters

### Response Size
- Limit full documents to 3 per response
- Limit memories to 10 per response
- Provide pagination for more results
