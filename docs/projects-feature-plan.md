# Projects Feature Implementation Plan

## Research Summary

### SuperMemory Approach: "Spaces"
- Simple string-based filtering (no separate table)
- Memories have a `space` field (string)
- "all" = show all memories (like "Latest")
- Dropdown selector with memory counts per space
- Spaces are created implicitly when a memory is saved to a new space

### OpenMemory Approach: "Namespaces"
- Simple `namespace: Optional[str]` field on memories
- No separate projects table
- Filtering happens at query time
- IDE extracts `ide_project_name` from metadata

### Key Insight
Both use **simple string fields** rather than full project tables. This is lightweight but lacks:
- Project metadata (description, status, icon)
- Project-level settings
- Project sharing/collaboration

---

## UniMemory Projects Design

### Philosophy
We want **more than just filtering** - we want:
1. **Project status tracking** ("Where are we now?")
2. **Cross-tool context** (same project across ChatGPT, Cursor, Claude)
3. **Project-scoped MCP search** (agent searches only project memories)
4. **Visual organization** in dashboard

### Database Schema

#### Option A: Lightweight (Like SuperMemory) ✅ RECOMMENDED
Add `project_id` to existing tables. Create `projects` table for metadata.

```sql
-- New table: projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Project identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,  -- URL-friendly name
    description TEXT,
    icon VARCHAR(50),  -- emoji or icon name
    color VARCHAR(20),  -- hex color for UI
    
    -- Status tracking (your key requirement!)
    status VARCHAR(50) DEFAULT 'active',  -- active, paused, completed, archived
    status_note TEXT,  -- "Working on auth flow", "Waiting for API response"
    
    -- Settings
    is_default BOOLEAN DEFAULT FALSE,  -- Only one per user
    is_pinned BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(owner_id, slug)
);

-- Add project_id to memories
ALTER TABLE memories ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_memories_project ON memories(project_id);

-- Add project_id to sources
ALTER TABLE sources ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_sources_project ON sources(project_id);
```

#### Default Project Behavior
1. Every user gets a "Default" project on signup
2. If no project selected → saves to Default
3. Default project cannot be deleted (only renamed)

---

## API Endpoints

### Projects CRUD
```
POST   /consumer/projects              - Create project
GET    /consumer/projects              - List user's projects
GET    /consumer/projects/:id          - Get project details
PATCH  /consumer/projects/:id          - Update project (name, status, etc.)
DELETE /consumer/projects/:id          - Delete project (moves memories to Default)
POST   /consumer/projects/:id/status   - Quick status update
```

### Project-Scoped Operations
```
GET    /consumer/projects/:id/memories  - List memories in project
GET    /consumer/projects/:id/sources   - List sources in project
GET    /consumer/projects/:id/graph     - Get project-scoped graph
POST   /consumer/projects/:id/search    - Search within project
```

### MCP Integration
```
search_memory(query, project_id?)       - Filter by project
get_memory_context(memory_id)           - Returns project context
add_memory(content, project_id?)        - Save to specific project
get_projects()                          - List projects for selection
```

---

## UI Implementation

### Dashboard (Memories Page)

#### Header Changes
```
[Memories] ─────────────────────────────────────────────────────────
                                              [+ New Project] [Graph]
┌─────────────────┐
│ 📁 All Projects │ ← Dropdown
│ ─────────────── │
│ ⭐ Default      │
│ 🚀 UniMemory    │
│ 📱 Mobile App   │
│ + New Project   │
└─────────────────┘
```

#### Project Card (when project selected)
```
┌──────────────────────────────────────────────────────────────────┐
│ 🚀 UniMemory                                          [⋮ Menu]  │
│ ──────────────────────────────────────────────────────────────── │
│ Status: 🟢 Active                                                │
│ "Working on projects feature - planning phase"                   │
│                                                                  │
│ 42 memories • 12 sources • Last updated 5 min ago               │
└──────────────────────────────────────────────────────────────────┘
```

#### Quick Status Update
Click status → modal with:
- Status dropdown (Active, Paused, Completed, Archived)
- Status note textarea
- Save button

### Extension Popup

#### Save Tab Enhancement
```
┌──────────────────────────────────────────┐
│ 🧠 UniMemory                        [→] │
├──────────────────────────────────────────┤
│ [Save] [Imports] [Settings]              │
├──────────────────────────────────────────┤
│ UniMemory                                │
│ http://localhost:3001/memories           │
├──────────────────────────────────────────┤
│ Save to project:                         │
│ ┌────────────────────────────────────┐   │
│ │ 🚀 UniMemory                    ▼ │   │ ← Dropdown
│ └────────────────────────────────────┘   │
│                                          │
│ ┌────────────────────────────────────┐   │
│ │        Save Current Page           │   │
│ └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

Dropdown options:
- ⭐ Default (always first)
- User's projects (sorted by recent use)
- + New Project... (opens modal)

---

## Implementation Phases

### Phase 1: Backend Foundation
1. Create `projects` table migration
2. Add `project_id` to memories/sources
3. Create default project for existing users
4. Implement Projects CRUD API

### Phase 2: Dashboard UI
1. Add project selector dropdown to memories page
2. Add "New Project" modal
3. Add project status card
4. Filter memories/sources by project
5. Update graph to support project filtering

### Phase 3: Extension Integration
1. Fetch projects list on extension load
2. Add project dropdown to Save tab
3. Store selected project in extension storage
4. Send project_id with save requests

### Phase 4: MCP Integration
1. Add `project_id` parameter to search_memory
2. Add get_projects tool
3. Add project context to get_memory_context
4. Update add_memory to accept project_id

---

## Data Migration Strategy

### For Existing Users
1. Create "Default" project for each user
2. Set all existing memories `project_id = default_project_id`
3. Set all existing sources `project_id = default_project_id`

```sql
-- Migration script (run after creating projects table)

-- 1. Create default projects for all users
INSERT INTO projects (owner_id, name, slug, is_default, icon)
SELECT id, 'Default', 'default', true, '⭐'
FROM users
ON CONFLICT DO NOTHING;

-- 2. Update memories to use default project
UPDATE memories m
SET project_id = p.id
FROM projects p
WHERE m.owner_id = p.owner_id AND p.is_default = true AND m.project_id IS NULL;

-- 3. Update sources to use default project
UPDATE sources s
SET project_id = p.id
FROM projects p
WHERE s.owner_id = p.owner_id AND p.is_default = true AND s.project_id IS NULL;
```

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Project storage | Separate table | Need metadata, status, settings |
| Default project | Auto-created | Ensure all memories have a project |
| Null project_id | Allowed (means Default) | Backward compatibility |
| Project deletion | Moves to Default | Never lose memories |
| Project in MCP | Optional parameter | Don't break existing integrations |

---

## Summary

This is a **full-featured** projects system that goes beyond SuperMemory/OpenMemory:

✅ **Status tracking** - Know where you are in each project
✅ **Visual organization** - Filter and group memories
✅ **Cross-tool context** - Same project across all tools
✅ **MCP integration** - Agents can search project-specific
✅ **Extension support** - Easy project selection when saving
✅ **Backward compatible** - Existing memories go to Default

Ready to implement? Start with Phase 1 (backend + migration).
