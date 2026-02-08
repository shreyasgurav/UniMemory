# Project Feature: Use Case, Current State & Implementation Plan

## 1. Intended Use Case (Your Vision)

**Goal:** One project = one “work unit” with **centralized memory** shared across tools.

- **User saves a convo in ChatGPT** (e.g. product decisions, requirements) → stored in UniMemory under **Project X**.
- **User works in Cursor** on the same project → Cursor (via MCP) **reads** that context and **writes** new context (e.g. “implemented auth flow”, “API contract decided”) into **the same Project X**.
- **Optional:** ChatGPT mini app (over MCP) and Cursor MCP both read/write **the same project** so you have one “log” of where the project is (status, decisions, code context).

So: **project = shared memory space** across ChatGPT (extension or future mini app) and Cursor (MCP), with optional project status/notes.

---

## 2. Current State: What Works vs What’s Missing

### What already works

| Flow | Project support | Notes |
|------|-----------------|--------|
| **Extension save (chat/page)** | ✅ | Popup project selector → `project_id` in ingest body → Source + Memory get `project_id`. |
| **Dashboard** | ✅ | Project dropdown filters sources/memories and graph by `project_id`. |
| **Ingest API** | ✅ | `POST /ingest/chat`, `/ingest/text`, `/ingest/document` accept `project_id` and set it on Source + Memory. |
| **Consumer list/graph** | ✅ | `GET /consumer/sources`, `/consumer/memories`, `/consumer/graph` accept `project_id` query param. |

### What’s missing for “same project in Cursor + ChatGPT”

| Flow | Current behavior | Gap |
|------|-------------------|-----|
| **MCP `search_memory`** | Calls `POST /api/v1/search`. Backend uses only `owner_id` (and optional `user_id`). **No `project_id`.** | Search returns **all** memories across all projects. Cursor cannot “search only Project X”. |
| **MCP `add_memory`** | Calls `POST /api/v1/memories`. Request has no `project_id`. Backend creates memory with `project_id=None`. | New memories from Cursor go to **Default** (or NULL), not to the chosen project. |
| **MCP `add_source`** | Calls `/ingest/chat` or `/ingest/text` via client; payload has **no `project_id`**. | Ingest supports it, but MCP client doesn’t send it. New sources from Cursor go to **no project** (NULL/Default). |
| **MCP project selection** | No tool to list projects; no way to pass “current project” into tools. | Cursor (or the user) cannot reliably choose “this is Project X” for read/write. |

So today:

- **ChatGPT (extension)** can target a project.
- **Cursor (MCP)** always writes to “default” and searches over “all” memories. **Not reliable** for “one project, shared between ChatGPT and Cursor.”

---

## 3. Architecture You Need

High level:

1. **Single source of truth:** One UniMemory project = one `project_id`. All clients (extension, Cursor MCP, future ChatGPT mini app) must be able to **read** and **write** scoped to that `project_id`.
2. **Writes:** Every write path (ingest, explicit memory create) must accept optional `project_id` and set it on Source/Memory.
3. **Reads:** Every read path (search, list memories/sources, graph) must accept optional `project_id` and filter by it.
4. **Discovery:** MCP (and future mini app) need a way to **list projects** and optionally to **resolve** “current project” (by ID or slug).

Concretely:

- **Backend**
  - **Search:** `POST /api/v1/search` accepts optional `project_id` and passes it into `hybrid_search`; core `hybrid_search` filters by `Memory.project_id` when provided.
  - **Create memory:** `POST /api/v1/memories` accepts optional `project_id` and sets `Memory.project_id`.
  - **Ingest:** Already has `project_id`; MCP client must send it in the ingest payload for `add_source`.
  - **Projects list for MCP:** Either reuse `GET /consumer/session/projects` when MCP uses Bearer (consumer) token, or add an API-key–friendly `GET /api/v1/projects` that returns the same shape. MCP client adds `getProjects()` and a `get_projects` tool.
- **MCP**
  - **Tools:** `search_memory`, `add_memory`, `add_source` each accept optional `project_id` (and optionally `project_slug` if you add slug→id resolution).
  - **Client:** `searchMemories(..., { project_id })`, `saveMemory(..., { project_id })`, `ingestSource(..., { project_id })` and, for ingest, include `project_id` in the body.
  - **New tool:** `get_projects` so the agent (or user) can see project list and pick one.
- **Project selection in Cursor**
  - **Option A (recommended):** User (or Cursor rule) passes `project_id` (or slug) on each tool call when they want project-scoped behavior. Agent can call `get_projects` first to get IDs/names.
  - **Option B:** Optional server-level default (e.g. `UNIMEMORY_PROJECT_ID` in env or MCP config) so every MCP call defaults to that project unless overridden. Option B can be added later.

With this, the flow becomes:

- User creates/selects “UniMemory app” project in dashboard (or extension).
- In ChatGPT: saves convo to “UniMemory app” (extension already does this).
- In Cursor: user says “we’re working on UniMemory app” (or sets default project). Agent calls `get_projects`, finds project id, then uses `search_memory(query, project_id)` and `add_memory(content, project_id)` / `add_source(..., project_id)`. All reads/writes for that project go to the same bucket → **centralized memory** and “status/log” of the project.

---

## 4. Implementation Plan (Ordered)

### Phase 1: Backend – project-scoped search and create

1. **Core search**
   - In `api/app/core/search.py`, in `hybrid_search`, read `project_id` from `filters` (if present).
   - If `project_id` is set, add `stmt = stmt.where(Memory.project_id == project_id)` (and optionally allow a sentinel for “only default project” if you ever need it). If not set, keep current behavior (all projects).
2. **Search API**
   - In `api/app/api/search.py`, add optional `project_id` to `SearchRequest`.
   - When calling `hybrid_search`, pass `project_id` in `filters`.
3. **Create memory API**
   - In `api/app/api/memories.py`, add optional `project_id` to `CreateMemoryRequest`.
   - In `create_memory`, set `Memory(..., project_id=request.project_id)` (and ensure NULL is allowed if not provided).

### Phase 2: MCP client and tools – project_id everywhere

4. **MCP client**
   - `searchMemories(query, options)`: add `project_id` to `options` and include it in the POST body to `/api/v1/search`.
   - `saveMemory(content, options)`: add `project_id` to `options` and include it in the POST body to `/api/v1/memories`.
   - `ingestSource(endpoint, payload)`: allow `project_id` in payload (or in options and merge into payload); send it in the JSON body so ingest can tag Source and extracted memories.
   - Add `getProjects()`: call `GET /api/v1/consumer/session/projects` (if Bearer) or a new `GET /api/v1/projects` (if you add it for API key). Return list of `{ id, name, slug, ... }`.
5. **MCP tools**
   - **search_memory:** Add optional `project_id` (and optionally `project_slug`) to input schema; pass to `client.searchMemories(..., { project_id })`.
   - **add_memory:** Add optional `project_id`; pass to `client.saveMemory(..., { project_id })`.
   - **add_source:** Add optional `project_id`; pass in ingest payload (and in client’s `ingestSource` payload).
   - **get_projects (new):** Call `client.getProjects()`, return list so the agent can choose a project.

### Phase 3: Project list for API-key users (optional but useful)

6. **Backend**
   - If MCP is used with API key (not Bearer), add `GET /api/v1/projects` (or similar) that uses `validate_api_key`, then returns the same project list as consumer (by `owner_id`). Reuse the same response model as `GET /consumer/projects`.

### Phase 4: Docs and “current project” UX (optional)

7. **Docs / Cursor rule**
   - Short doc or Cursor rule: “When working on a specific project, call get_projects, then pass the chosen project_id to search_memory, add_memory, and add_source so all context stays in one project.”
8. **Default project in MCP (optional)**
   - Support `UNIMEMORY_PROJECT_ID` (or similar) in MCP server env so that, when set, every tool call defaults to this project_id if the tool didn’t receive one. Reduces repetition for single-project users.

---

## 5. Reliability After Changes

Once the above is done:

- **Extension:** Already sends `project_id` to ingest → no change; remains correct.
- **Cursor MCP:** Can pass `project_id` to search and add_memory/add_source → reads and writes are project-scoped → **same project** as ChatGPT.
- **Dashboard:** Already filters by project → no change.
- **ChatGPT mini app (future):** Same as Cursor: use `get_projects`, then use `project_id` in search and in any write (e.g. add_source for convos) so everything stays in one project.

So the **architecture** is: one project id, all clients use it for that “work unit”; backend already stores and filters by `project_id` on consumer paths and ingest; the only missing pieces are **search**, **POST /memories**, and **MCP client/tools** (and project list for MCP).

---

## 6. Open Decisions (for you)

1. **Project selection in Cursor**
   - Prefer **only** per-call `project_id` (agent gets list and passes it each time)?
   - Or also support a **default project** in MCP config/env so the user sets “current project” once?

2. **Slug vs ID**
   - Should MCP tools accept **project_slug** (e.g. `unimemory-app`) in addition to `project_id`, and have the backend (or client) resolve slug → id? That would allow “use project unimemory-app” without copying UUIDs.

3. **API key vs Bearer for MCP**
   - Today MCP can use Bearer (consumer token) or API key. For `get_projects`, do you want to add `GET /api/v1/projects` for API-key users, or is “MCP = consumer token only” acceptable for the mini app + Cursor use case?

Once you decide these, the plan above can be implemented as-is (with slug and default-project as optional extras).
