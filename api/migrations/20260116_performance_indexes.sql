-- Performance optimization indexes for UniMemory API
-- Run this migration on Railway PostgreSQL to improve query performance

-- Index for faster consumer search queries (owner_id + is_active + embedding)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_owner_active_embedding 
ON memories(owner_id, is_active) 
WHERE embedding IS NOT NULL AND is_active = true;

-- Index for faster source lookups by owner and type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sources_owner_created_type 
ON sources(owner_id, created_at DESC, type);

-- Index for faster memory_sources joins
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memory_sources_memory_source 
ON memory_sources(memory_id, source_id);

-- Index for faster waypoint lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waypoints_src_dst_weight 
ON waypoints(src_id, dst_id, weight DESC);

-- Partial index for active memories only (most common query pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_active_only 
ON memories(owner_id, created_at DESC) 
WHERE is_active = true;

-- Index for user lookup by firebase_uid (used in auth)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_firebase_active 
ON users(firebase_uid) 
WHERE is_active = true;

-- Analyze tables after index creation for query planner
ANALYZE memories;
ANALYZE sources;
ANALYZE memory_sources;
ANALYZE waypoints;
ANALYZE users;

-- Note: Run this migration during low-traffic period
-- CONCURRENTLY allows reads during index creation but takes longer
