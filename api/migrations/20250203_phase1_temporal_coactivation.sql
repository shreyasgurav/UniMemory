-- Phase 1: Add Temporal and Coactivation Fields to Existing Tables
-- Run this migration on Railway PostgreSQL

-- 1. SOURCES TABLE: Add bi-temporal timestamps
ALTER TABLE sources
ADD COLUMN IF NOT EXISTS event_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill event_at with created_at for existing records
UPDATE sources SET event_at = created_at WHERE event_at IS NULL;

-- 2. MEMORIES TABLE: Add temporal, coactivation, and priority fields
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recall_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS coactivation_score FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'archival',
ADD COLUMN IF NOT EXISTS memory_type VARCHAR(50);

-- Backfill valid_from with created_at for existing records
UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_memories_valid ON memories(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_memories_recall_count ON memories(recall_count DESC);
CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority);
CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories(memory_type);

-- 3. WAYPOINTS TABLE: Add coactivation tracking
ALTER TABLE waypoints
ADD COLUMN IF NOT EXISTS coactivation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_coactivated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS relationship_type VARCHAR(50) DEFAULT 'similar';

-- Add index for coactivation
CREATE INDEX IF NOT EXISTS idx_waypoints_coactivation ON waypoints(coactivation_count DESC);
CREATE INDEX IF NOT EXISTS idx_waypoints_relationship_type ON waypoints(relationship_type);

-- 4. Update sector-specific decay rates for existing memories
UPDATE memories SET decay_lambda = 0.05 WHERE sector = 'episodic';
UPDATE memories SET decay_lambda = 0.01 WHERE sector = 'semantic';
UPDATE memories SET decay_lambda = 0.005 WHERE sector = 'procedural';
UPDATE memories SET decay_lambda = 0.03 WHERE sector = 'emotional';
UPDATE memories SET decay_lambda = 0.01 WHERE sector = 'reflective';

-- 5. Classify memory_type based on content patterns (basic heuristic)
UPDATE memories SET memory_type = 
    CASE 
        WHEN content ILIKE '%prefer%' OR content ILIKE '%like%' OR content ILIKE '%favorite%' THEN 'preference'
        WHEN content ILIKE '%how to%' OR content ILIKE '%steps%' OR content ILIKE '%process%' THEN 'skill'
        WHEN content ILIKE '%happened%' OR content ILIKE '%did%' OR content ILIKE '%went%' THEN 'event'
        WHEN content ILIKE '%realize%' OR content ILIKE '%understand%' OR content ILIKE '%think%' THEN 'insight'
        ELSE 'fact'
    END
WHERE memory_type IS NULL;

-- 6. Set priority for high-salience preferences as 'core'
UPDATE memories 
SET priority = 'core' 
WHERE memory_type = 'preference' 
  AND salience >= 0.8 
  AND priority = 'archival';
