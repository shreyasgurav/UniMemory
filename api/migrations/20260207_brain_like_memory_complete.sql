-- Complete Brain-Like Memory System Migration
-- Run this on Railway PostgreSQL to ensure all brain-like features are enabled
-- This migration is idempotent (safe to run multiple times)

-- ============================================================================
-- 1. MEMORIES TABLE: Ensure all coactivation and temporal fields exist
-- ============================================================================

-- Coactivation fields (Hebbian learning)
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS recall_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS coactivation_score FLOAT DEFAULT 0.0;

-- Temporal validity fields
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE;

-- Memory classification fields
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS memory_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'archival';

-- Backfill valid_from with created_at for existing records
UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;

-- ============================================================================
-- 2. WAYPOINTS TABLE: Ensure coactivation tracking fields exist
-- ============================================================================

ALTER TABLE waypoints
ADD COLUMN IF NOT EXISTS coactivation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_coactivated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS relationship_type VARCHAR(50) DEFAULT 'similar';

-- ============================================================================
-- 3. INDEXES for brain-like queries
-- ============================================================================

-- Coactivation-based queries
CREATE INDEX IF NOT EXISTS idx_memories_recall_count ON memories(recall_count DESC);
CREATE INDEX IF NOT EXISTS idx_memories_coactivation_score ON memories(coactivation_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_recalled_at ON memories(last_recalled_at DESC);

-- Temporal queries
CREATE INDEX IF NOT EXISTS idx_memories_valid ON memories(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_memories_valid_to ON memories(valid_to) WHERE valid_to IS NOT NULL;

-- Priority/type queries
CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority);
CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories(memory_type);

-- Core memory queries (composite)
CREATE INDEX IF NOT EXISTS idx_memories_core ON memories(owner_id, priority, salience DESC)
WHERE priority = 'core' AND is_active = true;

-- Waypoint coactivation
CREATE INDEX IF NOT EXISTS idx_waypoints_coactivation ON waypoints(coactivation_count DESC);
CREATE INDEX IF NOT EXISTS idx_waypoints_relationship_type ON waypoints(relationship_type);

-- ============================================================================
-- 4. UPDATE sector-specific decay rates for existing memories
-- ============================================================================

UPDATE memories SET decay_lambda = 0.05 WHERE sector = 'episodic' AND decay_lambda = 0.02;
UPDATE memories SET decay_lambda = 0.01 WHERE sector = 'semantic' AND decay_lambda = 0.02;
UPDATE memories SET decay_lambda = 0.005 WHERE sector = 'procedural' AND decay_lambda = 0.02;
UPDATE memories SET decay_lambda = 0.03 WHERE sector = 'emotional' AND decay_lambda = 0.02;
UPDATE memories SET decay_lambda = 0.01 WHERE sector = 'reflective' AND decay_lambda = 0.02;

-- ============================================================================
-- 5. CLASSIFY memory_type based on content patterns (heuristic backfill)
-- ============================================================================

UPDATE memories SET memory_type = 
    CASE 
        WHEN content ILIKE '%prefer%' OR content ILIKE '%like%' OR content ILIKE '%favorite%' OR content ILIKE '%want%' THEN 'preference'
        WHEN content ILIKE '%how to%' OR content ILIKE '%steps%' OR content ILIKE '%process%' OR content ILIKE '%method%' THEN 'skill'
        WHEN content ILIKE '%happened%' OR content ILIKE '%did%' OR content ILIKE '%went%' OR content ILIKE '%met%' THEN 'event'
        WHEN content ILIKE '%realize%' OR content ILIKE '%understand%' OR content ILIKE '%think%' OR content ILIKE '%believe%' THEN 'insight'
        ELSE 'fact'
    END
WHERE memory_type IS NULL;

-- ============================================================================
-- 6. PROMOTE high-salience preferences to core memories
-- ============================================================================

UPDATE memories 
SET priority = 'core' 
WHERE memory_type = 'preference' 
  AND salience >= 0.8 
  AND priority = 'archival';

-- Promote frequently recalled memories to core
UPDATE memories
SET priority = 'core'
WHERE recall_count >= 20
  AND salience >= 0.7
  AND priority = 'archival';

-- ============================================================================
-- 7. VERIFY migration completed
-- ============================================================================

-- Check columns exist (will error if migration failed)
DO $$ 
BEGIN
    PERFORM recall_count, last_recalled_at, coactivation_score, 
            valid_from, valid_to, memory_type, priority
    FROM memories LIMIT 1;
    
    PERFORM coactivation_count, last_coactivated_at, relationship_type
    FROM waypoints LIMIT 1;
    
    RAISE NOTICE 'Brain-like memory migration completed successfully!';
END $$;
