# UniMemory API

FastAPI backend for intelligent memory management with semantic search, automatic deduplication, and memory extraction.

## 🚀 Production API

**Base URL**: `https://unimemory.up.railway.app/api/v1`

**Health Check**: [https://unimemory.up.railway.app/api/v1/health](https://unimemory.up.railway.app/api/v1/health)

## ✨ Features

- **LLM-based Extraction**: Automatically extract structured memories from raw text
- **Semantic Search**: Vector similarity search with hybrid ranking
- **Hybrid Search**: Combines vector similarity, keyword overlap, waypoint expansion, recency, and tag matching
- **Graph Structure**: Memories linked via waypoints for associative retrieval
- **Sector Classification**: Semantic, episodic, procedural, emotional, reflective
- **SimHash Deduplication**: Fuzzy duplicate detection
- **Salience Decay**: Memories decay over time based on sector
- **Multi-tenancy**: Project-based isolation
- **Firebase Authentication**: Secure user authentication
- **API Key Management**: Per-project API keys

## 🏗️ Tech Stack

- **FastAPI** - Modern Python web framework
- **PostgreSQL + pgvector** - Vector database for embeddings
- **OpenAI** - Embeddings (text-embedding-3-small) and LLM extraction (gpt-4o-mini)
- **SQLAlchemy** - Async ORM
- **Firebase Admin** - User authentication
- **Docker** - Containerized deployment

## 📦 Installation

### 1. Install Dependencies

```bash
cd api
pip install -r requirements.txt
```

### 2. Set up PostgreSQL with pgvector

**Using Docker:**
```bash
docker-compose up -d postgres
```

**Using Supabase (Production):**
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Enable pgvector extension in SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Get connection string from Project Settings → Database

**Local Installation:**
```bash
# Install PostgreSQL 14+ and pgvector extension
# Create database
createdb unimemory
psql unimemory -c "CREATE EXTENSION vector;"
```

### 3. Configure Environment

Create a `.env` file:

```env
# API Configuration
API_TITLE=UniMemory API
API_VERSION=v1
DEBUG=false

# Database (PostgreSQL + pgvector)
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/unimemory
DB_HOST=localhost
DB_PORT=5432
DB_NAME=unimemory
DB_USER=postgres
DB_PASSWORD=postgres

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# CORS
CORS_ORIGINS=["*"]
```

### 4. Run API

**Development:**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**With Docker:**
```bash
docker-compose up
```

The API will auto-create database tables on first run.

API will be available at: `http://localhost:8000`

**API Documentation**: `http://localhost:8000/docs` (Swagger UI)

## 📡 API Endpoints

### Authentication

All endpoints (except `/health`) require authentication via Bearer token (Firebase ID token for dashboard, API key for SDK).

**Header:**
```
Authorization: Bearer <token>
```

### Health Check

```http
GET /api/v1/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-10T10:30:52.199462",
  "service": "UniMemory API"
}
```

### Authentication Endpoints

```http
GET /api/v1/auth/me
```

Get current user information.

### Projects

```http
GET /api/v1/projects
POST /api/v1/projects
GET /api/v1/projects/{project_id}
PATCH /api/v1/projects/{project_id}
DELETE /api/v1/projects/{project_id}
```

**Create Project:**
```json
POST /api/v1/projects
{
  "name": "My Project",
  "description": "Optional description"
}
```

### API Keys

```http
GET /api/v1/keys?project_id={project_id}
POST /api/v1/keys
DELETE /api/v1/keys/{key_id}
```

**Create API Key:**
```json
POST /api/v1/keys
{
  "name": "Production Key",
  "project_id": "project-uuid"
}
```

**Response:**
```json
{
  "id": "...",
  "key": "um_live_xxx...",  // Only shown once!
  "key_prefix": "um_live_xxx...",
  "name": "Production Key",
  "project_id": "...",
  "is_active": true,
  "created_at": "..."
}
```

### Memories

**Add Memory:**
```http
POST /api/v1/memories
X-API-Key: um_live_xxx...

{
  "content": "User prefers dark mode for all applications",
  "source_app": "my-app",
  "user_id": "user123",
  "metadata": {"page": "settings"}
}
```

**Response:**
```json
{
  "was_worth_remembering": true,
  "reason": "Contains user preference information",
  "extracted_count": 1,
  "memories": [
    {
      "id": "...",
      "was_deduplicated": false
    }
  ]
}
```

**List Memories:**
```http
GET /api/v1/memories?user_id=user123&limit=50&offset=0&sector=semantic
X-API-Key: um_live_xxx...
```

**Delete Memory:**
```http
DELETE /api/v1/memories/{memory_id}
X-API-Key: um_live_xxx...
```

### Search

**Semantic Search:**
```http
POST /api/v1/search
X-API-Key: um_live_xxx...

{
  "query": "user preferences for UI",
  "limit": 10,
  "user_id": "user123",
  "min_salience": 0.1,
  "debug": false
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "...",
      "content": "User prefers dark mode",
      "sector": "semantic",
      "salience": 0.85,
      "score": 0.92,
      "tags": ["preferences", "UI"],
      "created_at": "..."
    }
  ],
  "total": 1,
  "query": "user preferences for UI"
}
```

## 🏗️ Architecture

```
Client Apps (SDK, Dashboard)
    ↓
UniMemory API (FastAPI)
    ├── Authentication (Firebase/API Keys)
    ├── Projects Management
    └── Memory Operations
        ↓
┌─────────────────────────┐
│ PostgreSQL + pgvector   │
│  - Users                │
│  - Projects             │
│  - API Keys             │
│  - Memories             │
│  - Waypoints (links)    │
│  - Embeddings (vectors) │
└─────────────────────────┘
    ↓
OpenAI API
  - Embeddings (text-embedding-3-small)
  - LLM Extraction (gpt-4o-mini)
```

## 🚢 Deployment

### Railway (Production)

1. Connect GitHub repository to Railway
2. Set environment variables:
   - `DATABASE_URL` (Supabase connection string)
   - `OPENAI_API_KEY`
   - `SECRET_KEY`
   - `FIREBASE_SERVICE_ACCOUNT` (JSON string)
3. Railway will automatically deploy from root `Dockerfile`

**Current Production**: [https://unimemory.up.railway.app](https://unimemory.up.railway.app)

### Docker

**Build:**
```bash
docker build -t unimemory-api .
```

**Run:**
```bash
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql+asyncpg://..." \
  -e OPENAI_API_KEY="sk-..." \
  -e SECRET_KEY="..." \
  unimemory-api
```

**Using docker-compose:**
```bash
docker-compose up -d
```

## 🧪 Testing

```bash
# Test health endpoint
curl https://unimemory.up.railway.app/api/v1/health

# Test with API key (replace with your key)
curl -X POST https://unimemory.up.railway.app/api/v1/memories \
  -H "X-API-Key: um_live_xxx..." \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test memory",
    "user_id": "test-user"
  }'
```

## 🔧 Development

```bash
# Install dependencies
pip install -r requirements.txt

# Format code (if using black)
black app/

# Type checking (if using mypy)
mypy app/

# Run tests (if available)
pytest
```

## 📊 Database Schema

The API automatically creates tables on startup. Key models:

- **users** - User accounts (Firebase auth)
- **projects** - User projects
- **api_keys** - API keys per project
- **memories** - Stored memories
- **waypoints** - Memory relationship links
- **memory_embeddings** - Vector embeddings (pgvector)

## 🔐 Security

- Firebase authentication for dashboard users
- API key authentication for SDK clients
- Hashed API keys (bcrypt)
- CORS configuration
- Rate limiting (planned)
- Input validation with Pydantic

## 📝 License

MIT

## 🔗 Links

- **Production API**: [https://unimemory.up.railway.app](https://unimemory.up.railway.app)
- **API Docs**: [https://unimemory.up.railway.app/docs](https://unimemory.up.railway.app/docs)
- **Main Repository**: [https://github.com/shreyasgurav/UniMemory](https://github.com/shreyasgurav/UniMemory)
