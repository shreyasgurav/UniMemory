# UniMemory Performance Analysis & Fixes

## 🚨 CRITICAL PERFORMANCE BOTTLENECKS FOUND

### Current Stack
- **Database:** Supabase (PostgreSQL + pgvector)
- **API:** Railway deployment
- **Connection Pool:** 10 base + 20 overflow = 30 max connections
- **Embedding Model:** OpenAI text-embedding-3-small (1536 dimensions)

---

## 🔴 CRITICAL ISSUE #1: N+1 Embedding Calls in Source Search

**Location:** `api/app/api/consumer.py:305-430` - `/consumer/session/sources` endpoint

**Problem:**
When searching sources with a query, the code:
1. Fetches ALL sources from database (line 365-370)
2. For EACH source, makes a separate OpenAI API call to get embedding (line 388)
3. If you have 50 sources, that's **50 sequential OpenAI API calls**

**Code:**
```python
# Line 364-370: Fetch ALL sources
result = await session.execute(
    select(Source, memory_count_subq.c.memory_count)
    .outerjoin(memory_count_subq, Source.id == memory_count_subq.c.source_id)
    .where(Source.owner_id == str(user.id))
)
sources_with_counts = result.all()

# Line 376-388: For EACH source, make OpenAI call
for source, count in sources_with_counts:
    title = source.title or ""
    summary = source.summary or ""
    combined_text = f"{title} {summary}"
    
    # 🚨 BLOCKING OpenAI API CALL FOR EACH SOURCE
    text_embedding = await embedding_service.get_embedding(combined_text)
```

**Impact:**
- 50 sources × 100ms per embedding = **5+ seconds just for embeddings**
- Plus network latency to Railway → OpenAI → Railway
- **This is why search is EXTREMELY slow**

**Fix:** Use pgvector's built-in similarity search instead of fetching all and computing in Python

---

## 🔴 CRITICAL ISSUE #2: Missing Database Indexes

**Location:** `api/app/db/models.py`

**Problem:**
Sources table has indexes but they're not optimized for common queries:

**Current indexes:**
```python
Index("idx_sources_owner_type", "owner_id", "type"),
Index("idx_sources_owner_app", "owner_id", "source_app"),
Index("idx_sources_owner_created", "owner_id", "created_at"),
Index("idx_sources_summary_embedding", "summary_embedding", postgresql_using="ivfflat", postgresql_with={"lists": 100}),
```

**Missing:**
- No index on `Memory.owner_id` (used in every query)
- No index on `Memory.is_active` (filtered in every query)
- No composite index on `(owner_id, is_active, created_at)` for common queries
- IVFFlat index with `lists: 100` is too small for production (should be ~sqrt(rows))

---

## 🔴 CRITICAL ISSUE #3: Synchronous LLM Calls in Ingestion

**Location:** `api/app/api/ingest.py:284-419`

**Problem:**
Ingestion flow is **completely synchronous**:
1. Check worthiness (LLM call) - blocks
2. Generate summary (LLM call) - blocks
3. Extract memories (LLM call) - blocks
4. Generate embeddings for each memory - blocks

**Code:**
```python
# Line 315: BLOCKING
worthiness = await extractor.check_worthiness(content)

# Line 350: BLOCKING
summary, summary_embedding, summary_tokens = await summarizer.summarize_and_embed(content, "text")

# Line 373: BLOCKING
extraction = await extractor.extract_memories(content)
```

**Impact:**
- Extension "Save Chat" takes 5-10 seconds
- User waits for entire LLM pipeline to complete
- No feedback during processing

**Fix:** Move to background tasks, return immediately with job ID

---

## 🔴 CRITICAL ISSUE #4: No Response Caching

**Problem:**
- No Redis configured (`REDIS_URL: Optional[str] = None`)
- Every request hits database
- Repeated queries (like dashboard stats) recalculate every time
- No caching of embeddings for common queries

**Impact:**
- Dashboard loads slowly
- Same data fetched multiple times
- No query result caching

---

## 🔴 CRITICAL ISSUE #5: Large JSONB Columns Fetched Always

**Problem:**
`Source.raw_content` is a JSONB column that can be **huge** (entire chat conversations)

**Code:**
```python
# Line 332-338: Fetches ENTIRE raw_content for every source
result = await session.execute(
    select(Source, memory_count_subq.c.memory_count)
    .outerjoin(memory_count_subq, Source.id == memory_count_subq.c.source_id)
    .where(Source.owner_id == str(user.id))
    .order_by(Source.created_at.desc())
    .limit(limit)
)
```

**Impact:**
- Fetching 50 sources with large `raw_content` = massive data transfer
- Supabase → Railway network transfer is slow
- Most queries don't need raw_content (only summary/title)

**Fix:** Use deferred loading or exclude raw_content from list queries

---

## 🔴 CRITICAL ISSUE #6: No Connection Pooling to Supabase

**Problem:**
Railway → Supabase connection has:
- Pool size: 10 connections
- Max overflow: 20 connections
- But Supabase has connection limits

**Current config:**
```python
DB_POOL_SIZE: int = 10
DB_MAX_OVERFLOW: int = 20
DB_POOL_TIMEOUT: int = 20
DB_POOL_RECYCLE: int = 900
```

**Issue:**
- Supabase free tier: 60 connection limit
- If you have multiple Railway instances, they compete for connections
- Connection recycling every 15 min can cause spikes

---

## 🔴 CRITICAL ISSUE #7: No Query Timeout Protection

**Problem:**
Query timeout is set to 60 seconds:
```python
"command_timeout": 60,  # Query timeout
```

**Impact:**
- Slow queries can block for 60 seconds
- No circuit breaker for runaway queries
- User sees loading spinner for a full minute

---

## 🟡 MODERATE ISSUE #8: Suboptimal Embedding Index

**Problem:**
IVFFlat index configuration:
```python
Index("idx_sources_summary_embedding", "summary_embedding", 
      postgresql_using="ivfflat", 
      postgresql_with={"lists": 100})
```

**Issue:**
- `lists: 100` is too small for production
- Should be `sqrt(total_rows)` for optimal performance
- For 10,000 sources, should be ~100 lists ✓
- For 100,000 sources, should be ~316 lists
- Static configuration doesn't scale

---

## 🟡 MODERATE ISSUE #9: No Request Batching

**Problem:**
Extension makes individual API calls for each operation:
- Fetch sources (1 call)
- Click source → Fetch full source (1 call per click)
- No batching or prefetching

**Impact:**
- Multiple round trips Railway ↔ Extension
- Each round trip adds latency

---

## 🟡 MODERATE ISSUE #10: OpenAI Timeout Too Low

**Config:**
```python
OPENAI_TIMEOUT: int = 15  # Reduced timeout for faster failure
OPENAI_MAX_RETRIES: int = 2  # Reduced retries to fail faster
```

**Problem:**
- 15 seconds might be too aggressive for complex extractions
- Retries add to total time (15s × 2 = 30s potential wait)
- "Fail faster" doesn't help if it just fails

---

## 📋 PERFORMANCE FIXES PRIORITY

### 🔥 IMMEDIATE (Critical - Do Now)

#### 1. Fix Source Search N+1 Problem
**Change:** Use pgvector similarity search instead of Python loop

**Before:**
```python
# Fetch all sources, then compute embeddings for each
for source, count in sources_with_counts:
    text_embedding = await embedding_service.get_embedding(combined_text)
    # Calculate similarity...
```

**After:**
```python
# Use database-level vector similarity search
query_embedding = await embedding_service.get_embedding(query.strip())

result = await session.execute(
    select(
        Source,
        memory_count_subq.c.memory_count,
        Source.summary_embedding.cosine_distance(query_embedding).label('distance')
    )
    .outerjoin(memory_count_subq, Source.id == memory_count_subq.c.source_id)
    .where(Source.owner_id == str(user.id))
    .where(Source.summary_embedding.cosine_distance(query_embedding) < 0.7)  # similarity > 0.3
    .order_by('distance')
    .limit(limit)
)
```

**Impact:** 5+ seconds → <500ms

#### 2. Exclude raw_content from List Queries
**Change:** Use `defer()` to lazy-load large columns

```python
from sqlalchemy.orm import defer

result = await session.execute(
    select(Source, memory_count_subq.c.memory_count)
    .options(defer(Source.raw_content))  # Don't load raw_content
    .outerjoin(memory_count_subq, Source.id == memory_count_subq.c.source_id)
    .where(Source.owner_id == str(user.id))
    .order_by(Source.created_at.desc())
    .limit(limit)
)
```

**Impact:** 50-80% reduction in data transfer

#### 3. Add Missing Database Indexes

```sql
-- Memory table indexes
CREATE INDEX idx_memories_owner_id ON memories(owner_id);
CREATE INDEX idx_memories_is_active ON memories(is_active);
CREATE INDEX idx_memories_owner_active_created ON memories(owner_id, is_active, created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_sources_owner_created_desc ON sources(owner_id, created_at DESC);
CREATE INDEX idx_memory_sources_source_id ON memory_sources(source_id);
CREATE INDEX idx_memory_sources_memory_id ON memory_sources(memory_id);
```

**Impact:** 2-5x faster queries

#### 4. Make Ingestion Async with Background Tasks

```python
@router.post("/ingest/chat", response_model=IngestJobResponse)
async def ingest_chat(
    request: IngestChatRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(get_ingest_auth),
    session: AsyncSession = Depends(get_db)
):
    job_id = str(uuid.uuid4())
    
    # Return immediately
    background_tasks.add_task(
        process_chat_ingestion,
        job_id=job_id,
        request=request,
        user_info=user_info
    )
    
    return IngestJobResponse(
        job_id=job_id,
        status="processing",
        message="Chat ingestion started"
    )
```

**Impact:** Instant response, processing in background

---

### 🟡 HIGH PRIORITY (Do This Week)

#### 5. Add Redis Caching
- Cache dashboard stats (5 min TTL)
- Cache user settings (10 min TTL)
- Cache source counts (1 min TTL)

#### 6. Optimize Connection Pool
```python
DB_POOL_SIZE: int = 5  # Reduce base pool
DB_MAX_OVERFLOW: int = 10  # Reduce overflow
DB_POOL_TIMEOUT: int = 10  # Faster timeout
DB_POOL_RECYCLE: int = 300  # Recycle every 5 min
```

#### 7. Add Query Timeouts
```python
"command_timeout": 30,  # 30 second max query time
"statement_timeout": 25000,  # 25 second statement timeout
```

---

### 🟢 MEDIUM PRIORITY (Do This Month)

#### 8. Implement Request Batching in Extension
- Prefetch next 10 sources when scrolling
- Batch multiple source fetches into one API call

#### 9. Add Response Compression
```python
# In main.py
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

#### 10. Optimize IVFFlat Index
```python
# Dynamic lists based on row count
lists = max(100, int(sqrt(source_count)))
```

---

## 📊 Expected Performance Improvements

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Source search (with query) | 5-8s | 300-500ms | **10-16x faster** |
| Source list (no query) | 2-3s | 200-400ms | **6-10x faster** |
| Chat ingestion | 8-12s | <500ms (async) | **Instant response** |
| Dashboard load | 3-5s | 500ms-1s | **5-6x faster** |
| Memory fetch | 1-2s | 200-400ms | **3-5x faster** |

---

## 🎯 Implementation Order

1. **Fix source search N+1** (1 hour) - Biggest impact
2. **Defer raw_content loading** (30 min) - Easy win
3. **Add database indexes** (1 hour) - Run migration
4. **Make ingestion async** (2 hours) - Better UX
5. **Add Redis caching** (3 hours) - Infrastructure setup
6. **Optimize connection pool** (30 min) - Config change
7. **Add response compression** (15 min) - One line
8. **Implement request batching** (4 hours) - Extension changes

**Total time to fix critical issues: ~4-5 hours**
**Expected overall performance improvement: 5-10x faster**

---

## 🚀 Quick Wins (Do First)

These can be done in <2 hours total:

1. Fix source search N+1 (1 hour)
2. Defer raw_content (30 min)
3. Add response compression (15 min)
4. Optimize connection pool config (15 min)

**Impact:** 5-8x performance improvement with minimal effort
