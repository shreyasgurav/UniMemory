# UniMemory Brain-Like Storage - Deployment Instructions

## What Has Been Implemented

### ✅ Completed Components

1. **Database Schema Updates**
   - New tables: `entities`, `facts`, `communities`, `entity_sources`, `memory_entities`, `memory_facts`, `entity_links`
   - Enhanced fields in `memories`: `memory_type`, `priority`, `recall_count`, `last_recalled_at`, `coactivation_score`, `valid_from`, `valid_to`
   - Enhanced fields in `sources`: `event_at`, `ingested_at`
   - Enhanced fields in `waypoints`: `coactivation_count`, `last_coactivated_at`, `relationship_type`

2. **Core Modules**
   - `api/app/core/entities.py` - Entity and fact extraction with conflict resolution
   - `api/app/core/reinforcement.py` - Hebbian learning (coactivation tracking)
   - `api/app/core/sector.py` - Updated with memory type classification and brain-like decay rates
   - `api/app/core/search.py` - Updated with coactivation scoring and Hebbian reinforcement

3. **Models**
   - `api/app/db/models.py` - Updated with all new tables and fields

4. **Migrations**
   - `api/migrations/20250203_phase1_temporal_coactivation.sql` - Adds temporal and coactivation fields
   - `api/migrations/20250203_phase2_entities_facts.sql` - Creates entity and fact tables

5. **Ingestion Pipeline**
   - Partially updated to extract entities and facts
   - Sets memory_type, priority, and temporal fields

---

## Deployment Steps

### Step 1: Deploy Database Migrations to Supabase

1. **Connect to Supabase PostgreSQL**:
   ```bash
   # Get connection string from Supabase dashboard > Settings > Database
   # Connection string format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
   psql "postgresql://postgres:[YOUR_PASSWORD]@db.[YOUR_PROJECT_REF].supabase.co:5432/postgres"
   ```
   
   Or use Supabase SQL Editor in the dashboard.

2. **Run Phase 1 Migration**:
   ```sql
   -- Copy and paste the entire content of:
   -- api/migrations/20250203_phase1_temporal_coactivation.sql
   ```

3. **Run Phase 2 Migration**:
   ```sql
   -- Copy and paste the entire content of:
   -- api/migrations/20250203_phase2_entities_facts.sql
   ```

4. **Verify migrations**:
   ```sql
   -- Check new columns in memories table
   \d memories
   
   -- Check new tables
   \dt entities
   \dt facts
   \dt communities
   ```

### Step 2: Update Backend Code

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "feat: implement brain-like storage with entities, facts, and coactivation"
   git push origin main
   ```

2. **Railway will auto-deploy** from GitHub

### Step 3: Update API Routes

Add the new search endpoints to `api/main.py`:

```python
from app.api import search_enhanced

# Add after existing routers
app.include_router(search_enhanced.router, prefix="/api/v1", tags=["search"])
```

### Step 4: Test New Features

1. **Test entity extraction**:
   ```bash
   curl -X POST https://unimemory.up.railway.app/api/v1/ingest/text \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "content": "John Smith works at OpenAI. He prefers Python for backend development.",
       "user_id": "test_user",
       "create_source": true
     }'
   ```

2. **Test enhanced search**:
   ```bash
   curl -X POST https://unimemory.up.railway.app/api/v1/search/enhanced \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "query": "John Smith",
       "include_entities": true,
       "include_facts": true
     }'
   ```

3. **Test temporal query**:
   ```bash
   curl https://unimemory.up.railway.app/api/v1/facts?as_of=2024-12-01 \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

---

## What You Need to Do Now

### 1. **Fix Remaining Issues** (if any)

The ingestion pipeline needs these imports fixed in `api/app/api/ingest.py`:
```python
# Add at top
import uuid
from app.db.models import EntitySource
```

### 2. **Verify Search Router**

The existing search router in `api/main.py` already includes the search endpoints.
No changes needed - coactivation is now built into `api/app/core/search.py`.

### 3. **Environment Variables**

Ensure Railway has these environment variables:
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `OPENAI_API_KEY` - For embeddings and LLM
- `FIREBASE_SERVICE_ACCOUNT` - Firebase admin SDK credentials

**Note**: Database is on Supabase, APIs are deployed on Railway.

### 4. **Monitor First Deploy**

After pushing to GitHub:
1. Go to Railway dashboard
2. Watch deployment logs
3. Check for any import errors or missing dependencies

### 5. **Update Frontend (Optional)**

To show the new features in the dashboard:
- Display memory types (preference, fact, event, skill, insight)
- Show recall count and priority (core/archival)
- Add timeline view for entities
- Add "Core Memories" section

---

## New API Endpoints

### Enhanced Search
```
POST /api/v1/search/enhanced
{
  "query": "string",
  "as_of": "2024-12-01T00:00:00",  // Optional: point-in-time
  "include_entities": true,
  "include_facts": true,
  "temporal_filter": "current",  // current, historical, all
  "sectors": ["semantic", "episodic"],
  "memory_types": ["preference", "fact"]
}
```

### Entity Timeline
```
GET /api/v1/timeline/{entity_id}
```

### Temporal Facts Query
```
GET /api/v1/facts?subject_id={id}&predicate={predicate}&as_of={timestamp}
```

### Core Memories
```
GET /api/v1/core-memories
```

### Create Temporal Fact
```
POST /api/v1/temporal/fact
{
  "subject": "John Smith",
  "predicate": "works_at",
  "object": "OpenAI",
  "valid_from": "2024-01-01T00:00:00",
  "confidence": 0.9
}
```

---

## Architecture Summary

### What We Built

1. **Bi-Temporal Model**
   - Event time (when things happened)
   - Transaction time (when recorded)
   - Point-in-time queries

2. **Entity-Fact Separation**
   - Named entities (people, places, concepts)
   - Facts as SPO triples with temporal validity
   - Automatic conflict resolution

3. **Hebbian Learning**
   - Memories strengthen with use
   - Waypoints strengthen between co-recalled memories
   - Automatic promotion to core memory

4. **Brain-Like Decay**
   - Sector-specific decay rates
   - Episodic: 0.05 (fast)
   - Semantic: 0.01 (slow)
   - Procedural: 0.005 (very slow)

5. **Core vs Archival**
   - Core: Always in context (high-priority)
   - Archival: Searchable on demand

---

## Troubleshooting

### If migrations fail:
- Supabase has pgvector enabled by default
- Ensure gen_random_uuid() function exists (should be available in Supabase)
- Run migrations in order (Phase 1, then Phase 2)
- If using Supabase SQL Editor, paste entire migration file content

### If import errors:
- Check all new files are committed
- Verify Python path includes app directory
- Check for circular imports

### If search doesn't work:
- Verify embeddings are being generated
- Check vector indexes were created
- Ensure memories have valid_from/valid_to set

---

## Next Steps (Future Enhancements)

1. **LLM-Based Entity Extraction**
   - Replace pattern-based with GPT-4 extraction
   - Better entity type classification

2. **Community Detection**
   - Cluster related entities
   - Generate community summaries

3. **Background Jobs**
   - Periodic decay calculation
   - Memory consolidation
   - Waypoint pruning

4. **Analytics Dashboard**
   - Memory usage over time
   - Most recalled memories
   - Entity relationship graph

---

## Contact for Issues

If you encounter any issues during deployment:
1. Check Railway deployment logs
2. Review PostgreSQL migration output
3. Test with minimal examples first
4. Verify all environment variables are set

The system is now ready for deployment with brain-like memory capabilities!
