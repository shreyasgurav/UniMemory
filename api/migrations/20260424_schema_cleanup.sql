-- ============================================================================
-- UniMemory Schema Cleanup Migration
-- Date: 2026-04-24
-- Purpose: Remove unused tables and columns to simplify the database schema
-- ============================================================================
-- 
-- TABLES TO DROP (6 tables - completely unused):
--   - facts
--   - memory_facts
--   - entity_links
--   - communities
--   - agent_sessions
--   - agent_context_logs
--
-- COLUMNS TO DROP FROM memories (unused/unimplemented):
--   - decay_lambda
--   - segment
--   - memory_type
--   - priority
--   - recall_count
--   - last_recalled_at
--   - coactivation_score
--   - valid_from
--   - valid_to
--   - expires_at
--
-- TABLES KEPT (13 tables):
--   Core: users, api_keys, projects, memories, sources, memory_sources, end_users, waypoints
--   Logging: processing_logs, activity_logs, mcp_tokens, mcp_activity
--   Entities: entities, entity_sources, memory_entities
--
-- ============================================================================

-- Safety: Start transaction
BEGIN;

-- ============================================================================
-- STEP 1: Drop unused tables (in correct order due to FK constraints)
-- ============================================================================

-- Drop memory_facts first (references facts and memories)
DROP TABLE IF EXISTS memory_facts CASCADE;

-- Drop entity_links (references entities)
DROP TABLE IF EXISTS entity_links CASCADE;

-- Drop facts (references entities, sources, end_users)
DROP TABLE IF EXISTS facts CASCADE;

-- Drop communities (references users)
DROP TABLE IF EXISTS communities CASCADE;

-- Drop agent_context_logs first (references agent_sessions)
DROP TABLE IF EXISTS agent_context_logs CASCADE;

-- Drop agent_sessions (references users)
DROP TABLE IF EXISTS agent_sessions CASCADE;

-- ============================================================================
-- STEP 2: Drop unused columns from memories table
-- ============================================================================

-- Drop unused columns (these features were never implemented)
ALTER TABLE memories 
  DROP COLUMN IF EXISTS decay_lambda,
  DROP COLUMN IF EXISTS segment,
  DROP COLUMN IF EXISTS memory_type,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS recall_count,
  DROP COLUMN IF EXISTS last_recalled_at,
  DROP COLUMN IF EXISTS coactivation_score,
  DROP COLUMN IF EXISTS valid_from,
  DROP COLUMN IF EXISTS valid_to,
  DROP COLUMN IF EXISTS expires_at;

-- ============================================================================
-- STEP 3: Clean up orphaned indexes (if any exist)
-- ============================================================================

-- Drop indexes that referenced dropped tables
DROP INDEX IF EXISTS idx_facts_owner;
DROP INDEX IF EXISTS idx_facts_subject;
DROP INDEX IF EXISTS idx_facts_object;
DROP INDEX IF EXISTS idx_facts_predicate;
DROP INDEX IF EXISTS idx_facts_valid;
DROP INDEX IF EXISTS idx_facts_is_valid;
DROP INDEX IF EXISTS idx_facts_embedding;

DROP INDEX IF EXISTS idx_memory_facts_memory;
DROP INDEX IF EXISTS idx_memory_facts_fact;
DROP INDEX IF EXISTS idx_memory_facts_unique;

DROP INDEX IF EXISTS idx_entity_links_src;
DROP INDEX IF EXISTS idx_entity_links_dst;
DROP INDEX IF EXISTS idx_entity_links_relationship;
DROP INDEX IF EXISTS idx_entity_links_unique;

DROP INDEX IF EXISTS idx_communities_owner;
DROP INDEX IF EXISTS idx_communities_embedding;

-- ============================================================================
-- STEP 4: Verify remaining schema
-- ============================================================================

-- This query will show remaining tables (run manually to verify)
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
-- ORDER BY table_name;

-- Expected remaining tables (13):
-- 1. users
-- 2. api_keys
-- 3. projects
-- 4. memories
-- 5. sources
-- 6. memory_sources
-- 7. end_users
-- 8. waypoints
-- 9. processing_logs
-- 10. activity_logs
-- 11. mcp_tokens
-- 12. mcp_activity
-- 13. entities
-- 14. entity_sources
-- 15. memory_entities

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (if needed - run separately)
-- ============================================================================
-- 
-- NOTE: This rollback will recreate empty tables. Data cannot be recovered.
-- Only use if you need the table structures back.
--
-- BEGIN;
-- 
-- -- Recreate agent_sessions
-- CREATE TABLE IF NOT EXISTS agent_sessions (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   agent_name VARCHAR(255),
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- 
-- -- Recreate agent_context_logs
-- CREATE TABLE IF NOT EXISTS agent_context_logs (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
--   memory_ids JSONB DEFAULT '[]',
--   source_ids JSONB DEFAULT '[]',
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- 
-- -- Recreate communities
-- CREATE TABLE IF NOT EXISTS communities (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   name VARCHAR(255) NOT NULL,
--   summary TEXT,
--   embedding VECTOR(1536),
--   entity_ids JSONB DEFAULT '[]',
--   created_at TIMESTAMPTZ DEFAULT now(),
--   updated_at TIMESTAMPTZ DEFAULT now()
-- );
-- 
-- -- Recreate entity_links
-- CREATE TABLE IF NOT EXISTS entity_links (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   src_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
--   dst_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
--   relationship_type VARCHAR(50) NOT NULL,
--   weight FLOAT DEFAULT 0.5,
--   fact_count INTEGER DEFAULT 0,
--   created_at TIMESTAMPTZ DEFAULT now(),
--   updated_at TIMESTAMPTZ DEFAULT now()
-- );
-- 
-- -- Recreate facts
-- CREATE TABLE IF NOT EXISTS facts (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
--   subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
--   predicate VARCHAR(255) NOT NULL,
--   object_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
--   object_value TEXT,
--   fact_text TEXT NOT NULL,
--   embedding VECTOR(1536),
--   valid_from TIMESTAMPTZ NOT NULL,
--   valid_to TIMESTAMPTZ,
--   created_at TIMESTAMPTZ DEFAULT now(),
--   invalidated_at TIMESTAMPTZ,
--   confidence FLOAT DEFAULT 1.0,
--   source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
--   is_valid BOOLEAN DEFAULT true,
--   invalidation_reason VARCHAR(100)
-- );
-- 
-- -- Recreate memory_facts
-- CREATE TABLE IF NOT EXISTS memory_facts (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
--   fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );
-- 
-- -- Add back columns to memories
-- ALTER TABLE memories
--   ADD COLUMN IF NOT EXISTS decay_lambda FLOAT DEFAULT 0.02,
--   ADD COLUMN IF NOT EXISTS segment INTEGER DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS memory_type VARCHAR(50),
--   ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'archival',
--   ADD COLUMN IF NOT EXISTS recall_count INTEGER DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS coactivation_score FLOAT DEFAULT 0.0,
--   ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- 
-- COMMIT;
-- ============================================================================
