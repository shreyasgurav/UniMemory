# UniMemory API

Centralized memory management API for cross-platform memory sync (Mac, Windows, Chrome, VS Code).

## Features

- **LLM-based extraction**: Automatically extract structured memories from raw text
- **Hybrid search**: Combines vector similarity, keyword overlap, waypoint expansion, recency, and tag matching
- **Graph structure**: Memories linked via waypoints for associative retrieval
- **Sector classification**: Semantic, episodic, procedural, emotional, reflective
- **SimHash deduplication**: Fuzzy duplicate detection
- **Salience decay**: Memories decay over time based on sector

## Tech Stack

- **FastAPI**: Modern Python web framework
- **PostgreSQL + pgvector**: Vector database for embeddings
- **OpenAI**: Embeddings and LLM extraction
- **SQLAlchemy**: Async ORM
- **Docker**: Easy deployment

## Setup

### 1. Clone and Install

```bash
cd unimemory-api
pip install -r requirements.txt
```

### 2. Set up PostgreSQL with pgvector

Using Docker:
```bash
docker-compose up -d postgres
```

Or install locally:
```bash
# Install PostgreSQL and pgvector extension
# Create database
createdb unimemory
psql unimemory -c "CREATE EXTENSION vector;"
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 4. Run API

```bash
uvicorn app.main:app --reload
```

The API will auto-create database tables on first run.

Or with Docker:
```bash
docker-compose up
```

API will be available at: `http://localhost:8000`

## API Endpoints

### Health Check

```bash
GET /api/v1/health
```

### Add Memory

```bash
POST /api/v1/memories/add
Content-Type: application/json

{
  "content": "I prefer dark mode for all applications",
  "source_app": "chrome",
  "user_id": "user123",
  "metadata": {}
}
```

### Search Memories

```bash
POST /api/v1/search
Content-Type: application/json

{
  "query": "write a mail to john about the deadline",
  "limit": 10,
  "user_id": "user123",
  "min_salience": 0.1,
  "debug": false
}
```

### List Memories

```bash
GET /api/v1/memories?user_id=user123&limit=50&offset=0&sector=semantic
```

### Delete Memory

```bash
DELETE /api/v1/memories/{memory_id}
```

## Architecture

```
Client Apps (Mac, Chrome, VS Code)
    ↓
UniMemory API (FastAPI)
    ↓
┌─────────────────────────┐
│ PostgreSQL + pgvector   │
│  - Memories             │
│  - Waypoints (links)    │
│  - Embeddings (vectors) │
└─────────────────────────┘
    ↓
OpenAI API
  - Embeddings
  - LLM Extraction
```

## Deployment

### Railway

1. Connect GitHub repo
2. Add environment variables
3. Deploy!

### Render

1. Create new Web Service
2. Connect repo
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add PostgreSQL database
6. Set `DATABASE_URL` environment variable

### Docker

```bash
docker-compose up -d
```

## Testing

```bash
# Run the test script
./test_api.sh
```

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Format code
black app/

# Lint
flake8 app/
```

## Roadmap

- [ ] Authentication (API keys per user)
- [ ] Webhook support for real-time sync
- [ ] Batch operations
- [ ] Memory graph visualization endpoint
- [ ] Export/import functionality
- [ ] Rate limiting
- [ ] Caching layer

## License

MIT

