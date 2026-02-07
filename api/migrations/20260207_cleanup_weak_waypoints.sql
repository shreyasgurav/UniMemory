-- Cleanup Weak Waypoints Migration
-- Based on research: text-embedding-3-small requires 0.50+ threshold for meaningful connections
-- Run this AFTER deploying the new code to clean up existing weak connections

-- ============================================================================
-- 1. DELETE waypoints with weight below new threshold (0.50)
-- ============================================================================

-- First, see how many will be affected (run this query first to preview)
-- SELECT COUNT(*) as weak_waypoints FROM waypoints WHERE weight < 0.50;

-- Delete weak waypoints (weight < 0.50)
DELETE FROM waypoints WHERE weight < 0.50;

-- ============================================================================
-- 2. KEEP only top 5 waypoints per memory (remove excess connections)
-- ============================================================================

-- Delete waypoints that exceed MAX_WAYPOINTS_PER_MEMORY = 5
-- This keeps only the 5 strongest connections per memory

WITH ranked_waypoints AS (
    SELECT 
        id,
        src_id,
        dst_id,
        weight,
        ROW_NUMBER() OVER (PARTITION BY src_id ORDER BY weight DESC) as src_rank,
        ROW_NUMBER() OVER (PARTITION BY dst_id ORDER BY weight DESC) as dst_rank
    FROM waypoints
),
excess_waypoints AS (
    SELECT id 
    FROM ranked_waypoints 
    WHERE src_rank > 5 AND dst_rank > 5
)
DELETE FROM waypoints 
WHERE id IN (SELECT id FROM excess_waypoints);

-- ============================================================================
-- 3. VERIFY cleanup results
-- ============================================================================

-- Check remaining waypoints
-- SELECT 
--     COUNT(*) as total_waypoints,
--     AVG(weight) as avg_weight,
--     MIN(weight) as min_weight,
--     MAX(weight) as max_weight
-- FROM waypoints;

-- Check waypoints per memory distribution
-- SELECT 
--     src_id,
--     COUNT(*) as connection_count
-- FROM waypoints
-- GROUP BY src_id
-- ORDER BY connection_count DESC
-- LIMIT 10;
