# UniMemory

Memory Layer for AI Agents.

## Structure

```
unimemory/
├── api/              # Backend API (FastAPI + PostgreSQL + pgvector)
├── packages/
│   ├── js/           # npm package (unimemory)
│   └── python/       # pip package (unimemory)
└── dashboard/        # Web dashboard (Next.js)
```

## Quick Start

### 1. Install SDK

**JavaScript/TypeScript:**
```bash
npm install unimemory
```

**Python:**
```bash
pip install unimemory
```

### 2. Get API Key

1. Go to [dashboard.unimemory.ai](https://dashboard.unimemory.ai)
2. Sign in with Google
3. Create a project
4. Generate an API key

### 3. Use in Your App

**JavaScript:**
```typescript
import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Add memory
await client.addMemory({
  content: "User prefers dark mode"
});

// Search
const results = await client.search("user preferences");
```

**Python:**
```python
from unimemory import UniMemory

client = UniMemory(api_key="um_live_xxx...")

# Add memory
client.add_memory(content="User prefers dark mode")

# Search
results = client.search("user preferences")
```

## Development

### API

```bash
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

### SDK (JavaScript)

```bash
cd packages/js
npm install
npm run build
```

### SDK (Python)

```bash
cd packages/python
pip install -e .
```

## License

MIT

