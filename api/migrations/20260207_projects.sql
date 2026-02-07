-- Projects Feature Migration
-- Adds projects table and project_id to memories/sources

-- 1. CREATE projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📁',
    color VARCHAR(20) DEFAULT '#6366f1',
    status VARCHAR(50) DEFAULT 'active',
    status_note TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, slug)
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_default ON projects(owner_id, is_default);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ============================================================================
-- 2. ADD project_id to memories table
-- ============================================================================

ALTER TABLE memories ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_owner_project ON memories(owner_id, project_id);

-- ============================================================================
-- 3. ADD project_id to sources table
-- ============================================================================

ALTER TABLE sources ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_owner_project ON sources(owner_id, project_id);

-- ============================================================================
-- 4. CREATE default projects for existing users
-- ============================================================================

INSERT INTO projects (owner_id, name, slug, is_default, icon, description)
SELECT id, 'Default', 'default', true, '⭐', 'Default project for all memories'
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM projects WHERE projects.owner_id = users.id AND projects.is_default = true
);

-- ============================================================================
-- 5. MIGRATE existing memories to default project
-- ============================================================================

UPDATE memories m
SET project_id = p.id
FROM projects p
WHERE m.owner_id = p.owner_id 
  AND p.is_default = true 
  AND m.project_id IS NULL;

-- ============================================================================
-- 6. MIGRATE existing sources to default project
-- ============================================================================

UPDATE sources s
SET project_id = p.id
FROM projects p
WHERE s.owner_id = p.owner_id 
  AND p.is_default = true 
  AND s.project_id IS NULL;

-- ============================================================================
-- 7. VERIFY migration
-- ============================================================================

-- Check projects created
-- SELECT COUNT(*) as total_projects FROM projects;
-- SELECT COUNT(*) as default_projects FROM projects WHERE is_default = true;

-- Check memories migrated
-- SELECT COUNT(*) as memories_with_project FROM memories WHERE project_id IS NOT NULL;
-- SELECT COUNT(*) as memories_without_project FROM memories WHERE project_id IS NULL;
