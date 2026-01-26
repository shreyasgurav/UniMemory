-- Performance Optimization Indexes
-- Run this migration on Supabase to improve query performance
-- Date: 2026-01-26

-- ============================================
-- Memory Sources Table Indexes
-- ============================================

-- Index for efficient source lookup from memory
CREATE INDEX IF NOT EXISTS idx_memory_sources_source_id 
ON memory_sources(source_id);

-- Index for efficient memory lookup from source
CREATE INDEX IF NOT EXISTS idx_memory_sources_memory_id 
ON memory_sources(memory_id);

-- Composite index for join operations
CREATE INDEX IF NOT EXISTS idx_memory_sources_both 
ON memory_sources(source_id, memory_id);


-- ============================================
-- Sources Table Additional Indexes
-- ============================================

-- Index for faster owner + created_at DESC queries (dashboard listing)
CREATE INDEX IF NOT EXISTS idx_sources_owner_created_desc 
ON sources(owner_id, created_at DESC);

-- Index for sources with embeddings (used in semantic search)
CREATE INDEX IF NOT EXISTS idx_sources_owner_has_embedding 
ON sources(owner_id) 
WHERE summary_embedding IS NOT NULL;


-- ============================================
-- Memories Table Additional Indexes
-- ============================================

-- Composite index for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_memories_owner_active_salience 
ON memories(owner_id, is_active, salience DESC);

-- Index for sector-based queries
CREATE INDEX IF NOT EXISTS idx_memories_owner_sector_active 
ON memories(owner_id, sector, is_active);


-- ============================================
-- Waypoints Table Indexes
-- ============================================

-- Index for graph traversal from source memory
CREATE INDEX IF NOT EXISTS idx_waypoints_src_id 
ON waypoints(src_id);

-- Index for graph traversal to target memory
CREATE INDEX IF NOT EXISTS idx_waypoints_dst_id 
ON waypoints(dst_id);


-- ============================================
-- Activity Logs Table Indexes
-- ============================================

-- Index for user activity timeline (ActivityLog uses user_id, not owner_id)
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_action_created 
ON activity_logs(user_id, action, created_at DESC);


-- ============================================
-- Processing Logs Table Indexes
-- ============================================

-- Index for processing log queries by hash (for deduplication)
CREATE INDEX IF NOT EXISTS idx_processing_logs_hash_processed 
ON processing_logs(raw_content_hash, processed_at DESC);


-- ============================================
-- Analyze Tables (Update Statistics)
-- ============================================

ANALYZE sources;
ANALYZE memories;
ANALYZE memory_sources;
ANALYZE waypoints;
ANALYZE activity_logs;
ANALYZE processing_logs;
