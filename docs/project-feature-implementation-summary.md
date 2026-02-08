# UniMemory Project Feature – Implementation Summary

## Overview
The Project feature lets users organize memories and sources into separate projects. The main use case: save content from ChatGPT (extension) into a UniMemory project, then use Cursor (MCP) to read and write that same project so there is one centralized, project-specific memory log.

## Database
- New table: `projects` with id, owner_id, name, slug, description, icon, color, status, status_note, is_default, is_pinned, created_at, updated_at.
- `sources` and `memories` tables each have optional `project_id` (FK to projects.id, ON DELETE SET NULL).
- Migration `20260207_projects.sql` creates the table, adds columns, ensures a default project per user, and moves unassigned memories/sources into default projects.

## Backend – Core Search
- `hybrid_search()` in `api/app/core/search.py` accepts `project_id` in the `filters` dict.
- When set, the vector search is restricted to memories in that project only.

## Backend – Public API
- **Search** (`api/app/api/search.py`): `SearchRequest` has optional `project_id`; it is passed into `hybrid_search` filters.
- **Create memory** (`api/app/api/memories.py`): `CreateMemoryRequest` has optional `project_id`; new memories are stored under that project.
- **Projects** (same file): New endpoints use `get_user_unified` (API key or Bearer):
  - `GET /api/v1/projects` – list projects with memory_count and source_count.
  - `GET /api/v1/projects/{project_id}/status` – project details plus recent memories and sources.
  - `PATCH /api/v1/projects/{project_id}/status` – update status and status_note.

## Backend – MCP (Built-in)
- **Removed** `add_memory` so all writes go through the same pipeline as the extension.
- **search_memory**: optional `project_id`; when provided, search is scoped to that project.
- **add_source**: optional `project_id`; stored on the Source and on all extracted Memory rows (same flow as extension: raw content → title, summary, nuclear memories).
- **New tools**: `get_projects`, `get_project_status`, `update_project_status`.
- MCP tool set (7): search_memory, get_memory_context, get_source, add_source, get_projects, get_project_status, update_project_status.

## Backend – Graph API
- Consumer graph response can include a `project` object (id, name, slug, status, status_note, memory_count, source_count) when a project is selected.
- Sources are returned in descending created_at order.
- New edge type `same-project`: every pair of sources that share the same `project_id` gets an edge so the graph shows "these docs belong to the same project."
- Removed timeline / consecutive doc-doc edges.

## Backend – Ingest
- Ingest request models already had optional `project_id`; `store_extracted_memories` assigns it to created Memory rows and uses batch commits for MemorySource links.

## Frontend – Memory Graph
- Layout kept as before: sources in a center grid, memories arranged around each source.
- Same-project edges drawn as dashed indigo curves between documents in the same project.
- Legend includes "Same Project" for these edges; project name shown in the header when a project is selected.

## Standalone MCP Package
- `mcp/unimemory-mcp`: Removed add_memory; added get_projects, get_project_status, update_project_status.
- Client methods updated to pass `project_id` for search, memory create, and ingest; new methods: getProjects(), getProjectStatus(), updateProjectStatus().

## Extension
- Popup project selector and SAVE_CHAT already send `projectId` to `/ingest/chat`; no change needed for project scoping.

## End-to-end flow
1. Extension or MCP sends raw content (chat/document/text) with `project_id` to ingest or add_source.
2. Backend generates title and summary, extracts nuclear memories, and stores Source + Memories with that `project_id`.
3. MCP can list projects, get project status (recent memories/sources), update status/notes, and search memories within a project.
4. Dashboard graph shows same-project links between sources so "what belongs to this project" is visible at a glance.
