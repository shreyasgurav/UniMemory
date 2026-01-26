# UniMemory API Structure Analysis

## Overview
The UniMemory API has 3 main authentication layers:
1. **Consumer API** - Firebase ID Token (web app)
2. **Consumer Session API** - Consumer Session Token (browser extension)
3. **B2B API** - API Key authentication (developers/integrations)
4. **MCP API** - MCP Token authentication (AI assistants)

---

## 🔐 Authentication Methods

### 1. Firebase ID Token (`get_current_user`)
- Used by: Web app (consumer dashboard)
- Header: `Authorization: Bearer <firebase_id_token>`
- Validates Firebase token and returns User object

### 2. Consumer Session Token (`verify_consumer_session_token`)
- Used by: Browser extension
- Header: `Authorization: Bearer <consumer_session_token>`
- JWT token generated from Firebase token via `/consumer/auth/session`
- Validates session token and returns User object

### 3. API Key (`validate_api_key`)
- Used by: B2B developers, integrations
- Header: `x-api-key: <api_key>`
- Returns tuple of (owner_id, api_key_id, end_user_id)

### 4. MCP Token (`validate_mcp_token`)
- Used by: AI assistants (Claude, ChatGPT, etc.)
- Header: `Authorization: Bearer <mcp_token>`
- OAuth-based authentication for MCP protocol

---

## 📋 Complete API Endpoint Map

### Health Endpoints (No Auth)
```
GET  /health              - Basic health check
GET  /health/ready        - Database connectivity check
GET  /health/live         - Liveness probe
```

### Auth Endpoints
```
GET  /auth/me            - Get current user info (Firebase)
GET  /auth/validate      - Validate API key (B2B)
```

---

## 🌐 Consumer API (Web App - Firebase Auth)

### Sources
```
GET    /consumer/sources                    - List user's sources
GET    /consumer/sources/count              - Count of sources
GET    /consumer/sources/{source_id}        - Get source with memories
DELETE /consumer/sources/{source_id}        - Delete source
```

### Memories
```
GET    /consumer/memories                   - List user's memories
GET    /consumer/memories/count             - Count of memories
GET    /consumer/memories/{memory_id}       - Get memory with sources
PATCH  /consumer/memories/{memory_id}/tags  - Update memory tags
DELETE /consumer/memories/{memory_id}       - Delete memory (soft)
```

### Settings
```
GET   /consumer/settings                    - Get user settings
PATCH /consumer/settings                    - Update user settings
```

### Graph & Visualization
```
GET  /consumer/graph                        - Memory graph data
```

### Chat Context
```
POST /consumer/chat/context                 - Get relevant context for chat
```

### Activity Feed
```
GET  /consumer/activity                     - User activity timeline
```

### Connectors
```
GET  /consumer/connectors                   - List data connectors
```

### MCP Token Management
```
POST   /consumer/mcp/tokens                 - Create MCP token
GET    /consumer/mcp/tokens                 - List MCP tokens
DELETE /consumer/mcp/tokens/{token_id}      - Revoke MCP token
```

### OAuth (for MCP)
```
POST /mcp/oauth/code                        - Create OAuth code (Firebase auth)
```

### Session Management
```
GET  /consumer/auth/session                 - Generate consumer session token
```

---

## 🔌 Consumer Session API (Extension - Session Token Auth)

### Sources (Extension-specific)
```
GET  /consumer/session/sources              - List/search sources (with optional ?query)
GET  /consumer/session/sources/{source_id}  - Get source details
```

### Search
```
POST /consumer/search                       - Hybrid semantic search
```

---

## 🏢 B2B API (Developers - API Key Auth)

### Memories (CRUD)
```
POST   /memories                            - Create memory (unified auth)
GET    /memories                            - List memories
GET    /memories/{memory_id}               - Get memory details
PATCH  /memories/{memory_id}               - Update memory
DELETE /memories/{memory_id}               - Delete memory

GET    /memories/me                         - List my memories (internal)
PATCH  /memories/me/{memory_id}            - Update my memory (internal)
DELETE /memories/me/{memory_id}            - Delete my memory (internal)
```

### Sources
```
GET  /sources                               - List sources
GET  /sources/{source_id}                   - Get source details
GET  /memories/{memory_id}/sources          - Get sources for memory
```

### Search
```
POST /search                                - Hybrid search
```

### Ingestion
```
POST /ingest/text                           - Ingest text with extraction
POST /ingest/chat                           - Ingest chat conversation
POST /ingest/document                       - Ingest document
```

### API Key Management
```
POST   /keys                                - Create API key (Firebase auth)
GET    /keys                                - List API keys (Firebase auth)
DELETE /keys/{key_id}                       - Revoke API key (Firebase auth)
```

### Stats & Analytics
```
GET  /stats/overview                        - Dashboard stats (Firebase auth)
GET  /stats/memories-over-time              - Memory creation timeline (Firebase auth)
GET  /stats/requests-over-time              - API usage timeline (Firebase auth)
GET  /stats/end-users                       - End user stats (Firebase auth)
GET  /stats/sources-by-type                 - Source type breakdown (Firebase auth)
GET  /stats/logs                            - Processing logs (Firebase auth)
GET  /stats/logs/count                      - Log count (Firebase auth)
```

---

## 🤖 MCP API (AI Assistants - MCP Token Auth)

### OAuth Discovery
```
GET  /mcp/.well-known/oauth-protected-resource       - OAuth metadata
GET  /mcp/.well-known/oauth-authorization-server     - OAuth server metadata
GET  /.well-known/oauth-authorization-server         - OAuth server metadata (root)
```

### OAuth Token Exchange
```
POST /mcp/oauth/token                       - Exchange code for token
```

### MCP Operations
```
POST /mcp/search                            - Search memories
GET  /mcp/memories/{memory_id}/context      - Get memory context
GET  /mcp/sources/{source_id}               - Get source
POST /mcp                                   - MCP JSON-RPC handler
GET  /mcp                                   - MCP SSE streaming
```

---

## 🚨 Issues & Recommendations

### ✅ GOOD - Properly Separated
1. **Consumer vs B2B separation** - Clear distinction between web app and developer APIs
2. **Extension session auth** - Separate session token system for extension security
3. **MCP isolation** - MCP endpoints properly isolated with OAuth
4. **Unified memory creation** - `POST /memories` accepts both API key and Firebase auth

### ⚠️ ISSUES FOUND

#### 1. **Inconsistent Auth Patterns**
**Problem:** Some consumer endpoints use Firebase, some use session token
- `/consumer/sources` - Firebase ✅
- `/consumer/session/sources` - Session token ✅
- `/consumer/search` - Session token ✅

**Issue:** `/consumer/search` uses session token but other consumer endpoints use Firebase. This is inconsistent.

**Recommendation:** 
- Keep `/consumer/search` as session token (it's used by extension)
- OR create `/consumer/session/search` for consistency

#### 2. **Duplicate Source Endpoints**
**Problem:** Two sets of source endpoints with different auth:
- `/consumer/sources` (Firebase)
- `/consumer/session/sources` (Session token)

**Why it exists:** Extension needs session token auth, web app needs Firebase auth

**Status:** ✅ This is actually CORRECT - intentional duplication for different auth methods

#### 3. **Stats Endpoints Mixed with Consumer**
**Problem:** Stats endpoints (`/stats/*`) use Firebase auth but are in a separate router

**Current state:**
- Stats are for dashboard analytics
- Use Firebase auth (correct)
- Separate router (good organization)

**Status:** ✅ CORRECT

#### 4. **API Key Management Location**
**Problem:** `/keys` endpoints use Firebase auth (for web app users to manage their B2B keys)

**Status:** ✅ CORRECT - Users log in with Firebase to create/manage their B2B API keys

#### 5. **Deprecated Endpoint Still Present**
**Problem:** `/memories/add` is marked deprecated but still in code

**Recommendation:** Remove completely or keep for backward compatibility with clear sunset date

#### 6. **Ingest Endpoints Auth Flexibility**
**Problem:** Ingest endpoints accept BOTH API key AND session token

**Current implementation:**
```python
async def get_ingest_auth(authorization: str = Header(None), ...):
    if authorization and authorization.lower().startswith("bearer "):
        # Try consumer session token first
        payload = await verify_consumer_session_token_payload(token)
        # ...
    # Fall back to API key
```

**Status:** ✅ CORRECT - Allows both extension and B2B to ingest

#### 7. **Memory Creation Unified Auth**
**Problem:** `POST /memories` accepts both API key and Firebase token

**Status:** ✅ CORRECT - Unified endpoint for explicit memory creation

---

## 📊 Auth Flow Summary

### Web App Flow
```
User → Firebase Login → Firebase ID Token → Consumer API (/consumer/*)
```

### Extension Flow
```
User → Firebase Login (in web app) → 
  POST /consumer/auth/session → Consumer Session Token → 
  Extension uses Session Token → Consumer Session API (/consumer/session/*)
```

### B2B Developer Flow
```
Developer → Create account (Firebase) → 
  POST /keys → API Key → 
  Use API Key → B2B API (/memories, /sources, /search, /ingest)
```

### MCP Flow
```
AI Assistant → OAuth flow → 
  POST /mcp/oauth/code (user authorizes) → 
  POST /mcp/oauth/token → MCP Token → 
  MCP API (/mcp/*)
```

---

## ✅ Overall Assessment

### Strengths
1. **Clear separation** of consumer vs B2B APIs
2. **Flexible authentication** - Multiple auth methods for different use cases
3. **Extension security** - Separate session token system
4. **MCP integration** - Proper OAuth implementation
5. **Unified ingestion** - Ingest endpoints accept multiple auth types

### Architecture Quality: **8.5/10**

### Minor Improvements Needed
1. Consider renaming `/consumer/search` to `/consumer/session/search` for consistency
2. Remove deprecated `/memories/add` endpoint
3. Add API versioning headers for future-proofing
4. Consider rate limiting configuration per auth type

### Critical Issues: **NONE** ✅

The API structure is well-designed with proper separation of concerns and appropriate authentication for each use case.
