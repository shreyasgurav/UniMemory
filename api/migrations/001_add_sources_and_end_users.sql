-- UniMemory Database Migration: Add sources, end_users, and related schema changes
-- Version: 001
-- Date: 2026-01-13
-- Description: Adds end_users, sources, agent_sessions, agent_context_logs tables.
--              Adds memories.end_user_id FK. Refactors memory_sources to FK sources.id.

-- ============================================================================
-- STEP 1: Create end_users table (fixes user_id collision problem)
-- ============================================================================
CREATE TABLE IF NOT EXISTS end_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_user_id VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for end_users
CREATE INDEX IF NOT EXISTS idx_end_users_external_user_id ON end_users(external_user_id);
CREATE INDEX IF NOT EXISTS idx_end_users_owner_id ON end_users(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_end_users_owner_external ON end_users(owner_id, external_user_id);

-- ============================================================================
-- STEP 2: Create sources table (raw data storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL,
    
    -- Source classification
    type VARCHAR(50) NOT NULL,  -- chat, document, web, code, file
    source_app VARCHAR(100),     -- chrome, vscode, chatgpt, slack, etc.
    title VARCHAR(500),
    
    -- Raw content (NEVER embedded directly)
    raw_content JSONB NOT NULL,
    
    -- Summary (embedded for semantic search / RAG)
    summary TEXT,
    summary_embedding VECTOR(1536),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    external_ref VARCHAR(500),  -- chat_id, file_path, url, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sources
CREATE INDEX IF NOT EXISTS idx_sources_owner_id ON sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_sources_end_user_id ON sources(end_user_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_source_app ON sources(source_app);
CREATE INDEX IF NOT EXISTS idx_sources_owner_type ON sources(owner_id, type);
CREATE INDEX IF NOT EXISTS idx_sources_owner_app ON sources(owner_id, source_app);
CREATE INDEX IF NOT EXISTS idx_sources_owner_created ON sources(owner_id, created_at);

-- Vector index for summary embeddings (RAG search)
CREATE INDEX IF NOT EXISTS idx_sources_summary_embedding ON sources USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- STEP 3: Add end_user_id to memories table
-- ============================================================================
ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS end_user_id UUID REFERENCES end_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memories_end_user_id ON memories(end_user_id);

-- ============================================================================
-- STEP 4: Refactor memory_sources table
-- Drop old columns and add FK to sources.id
-- ============================================================================

-- First, backup existing data if needed (optional, uncomment if you have data to preserve)
-- CREATE TABLE IF NOT EXISTS memory_sources_backup AS SELECT * FROM memory_sources;

-- Drop old indexes
DROP INDEX IF EXISTS idx_memory_sources_source;

-- Drop old columns (source_id was VARCHAR, source_type was VARCHAR)
ALTER TABLE memory_sources DROP COLUMN IF EXISTS source_type;

-- Change source_id from VARCHAR to UUID with FK
-- This requires dropping and recreating if there's existing data
-- For safety, we'll add a new column and handle migration

-- Check if source_id is already UUID type, if not, migrate
DO $$
BEGIN
    -- Check if source_id column exists and is VARCHAR
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'memory_sources' 
        AND column_name = 'source_id' 
        AND data_type = 'character varying'
    ) THEN
        -- Rename old column
        ALTER TABLE memory_sources RENAME COLUMN source_id TO source_id_legacy;
        
        -- Add new UUID column
        ALTER TABLE memory_sources ADD COLUMN source_id UUID;
        
        -- Add FK constraint
        ALTER TABLE memory_sources 
        ADD CONSTRAINT fk_memory_sources_source 
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_memory_sources_source ON memory_sources(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_sources_unique ON memory_sources(memory_id, source_id);

-- ============================================================================
-- STEP 5: Create agent_sessions table (MCP/agent tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_owner_id ON agent_sessions(owner_id);

-- ============================================================================
-- STEP 6: Create agent_context_logs table (debug/explainability)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_context_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    memory_ids JSONB DEFAULT '[]',
    source_ids JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_context_logs_session_id ON agent_context_logs(session_id);

-- ============================================================================
-- STEP 7: Add account_type to users table (consumer vs api distinction)
-- ============================================================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'api';

-- Update existing users to 'api' type (default)
UPDATE users SET account_type = 'api' WHERE account_type IS NULL;

-- ============================================================================
-- DONE
-- ============================================================================
-- Summary of changes:
-- 1. Created end_users table for proper end-user identity isolation
-- 2. Created sources table for raw data storage (chats, docs, web, code, files)
-- 3. Added summary + summary_embedding to sources for RAG
-- 4. Added memories.end_user_id FK to end_users
-- 5. Refactored memory_sources to FK sources.id (UUID) instead of string
-- 6. Created agent_sessions and agent_context_logs for MCP traceability
-- 7. Added users.account_type for consumer vs api distinction
