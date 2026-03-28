-- Search Performance Optimization
-- Date: 2026-03-28
-- Fixes: Slow search, source retrieval, waypoint strengthening

-- Composite index for waypoint pair lookups (used by strengthen_coactivated_waypoints)
CREATE INDEX IF NOT EXISTS idx_waypoints_src_dst 
ON waypoints(src_id, dst_id);

-- Index for waypoint expansion (filter by weight threshold)
CREATE INDEX IF NOT EXISTS idx_waypoints_src_weight 
ON waypoints(src_id, weight DESC) 
WHERE weight > 0.1;

-- Index for memory vector search with owner filter
-- This helps pgvector narrow down candidates before cosine distance
CREATE INDEX IF NOT EXISTS idx_memories_owner_active_has_embedding 
ON memories(owner_id, is_active) 
WHERE embedding IS NOT NULL;

-- Index for memory dedup queries (simhash lookup by owner)
CREATE INDEX IF NOT EXISTS idx_memories_owner_user_simhash 
ON memories(owner_id, user_id) 
WHERE simhash IS NOT NULL AND is_active = true;

-- Partial index for sources with summary_embedding (semantic source search)
CREATE INDEX IF NOT EXISTS idx_sources_owner_summary_embed_exists 
ON sources(owner_id, created_at DESC) 
WHERE summary_embedding IS NOT NULL;

-- Index for memory_sources reverse lookup (source → memories)
CREATE INDEX IF NOT EXISTS idx_memory_sources_source_memory_active 
ON memory_sources(source_id, memory_id);

ANALYZE waypoints;
ANALYZE memories;
ANALYZE sources;
ANALYZE memory_sources;
