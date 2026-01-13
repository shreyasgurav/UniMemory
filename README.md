# UniMemory

<div align="center">

**Long-term memory infrastructure for AI applications.**

[![npm version](https://img.shields.io/npm/v/unimemory.svg?style=flat-square)](https://www.npmjs.com/package/unimemory)
[![PyPI version](https://img.shields.io/pypi/v/unimemory.svg?style=flat-square)](https://pypi.org/project/unimemory/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

[📖 Documentation](#documentation) • [🚀 Quick Start](#quick-start) • [📦 npm](https://www.npmjs.com/package/unimemory) • [🐍 PyPI](https://pypi.org/project/unimemory/)

</div>

---

## What is UniMemory?

UniMemory provides:

1. **A Long-Term Memory API** — Stable, deterministic storage for memories your app explicitly decides to keep
2. **An AI-Powered Ingest Layer** — Optional, intelligent extraction from raw content (chats, documents, text)

This separation means:
- Your SDKs can rely on the Core API forever
- Extraction logic can evolve without breaking your app
- You control what gets remembered

##  Features

- 🧠 **Core Memory API** — Store and retrieve explicit memories with vector search
- 🤖 **Intelligent Ingest** — Optional LLM-powered extraction from raw content
- 🔍 **Semantic Search** — Find memories by meaning, not just keywords
- 🎯 **Automatic Deduplication** — Prevents duplicate memories using similarity detection
- 🔗 **Memory Relationships** — Graph-based connections between related memories
- 📊 **Token Tracking** — Know exactly how many tokens your ingest calls consume
- 📱 **Multi-Platform SDKs** — JavaScript/TypeScript and Python support
- 🎨 **Modern Dashboard** — Web interface for managing API keys and viewing memories
- ⚡ **Production Ready** — Deployed API with proper guardrails

##  Quick Start

### Installation

**JavaScript/TypeScript:**
```bash
npm install unimemory
```

**Python:**
```bash
pip install unimemory
```

### Get Your API Key

1. Visit the [UniMemory Dashboard](https://app.unimemory.ai)
2. Sign in with Google
3. Create a new API key

### Usage

**Store an explicit memory (Core API):**
```typescript
import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Store a memory you've decided to keep
const memory = await client.addMemory({
  content: "User prefers dark mode",
  userId: "user123",
  tags: ["preferences"]
});
```

**Extract memories from content (Ingest API):**
```typescript
// Let AI extract memories from a conversation
const result = await client.ingestText({
  content: "User says: I'm moving to San Francisco next month for my new job at Google",
  userId: "user123"
});
// Result: stored: 2 (e.g., "User is moving to San Francisco", "User works at Google")
```

##  API Architecture

### Core Memory API (Stable, Public)

These endpoints are your long-term contract. SDKs wrap these.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/memories` | Store an explicit memory |
| `GET` | `/memories` | List memories with filters |
| `GET` | `/memories/{id}` | Get a single memory |
| `DELETE` | `/memories/{id}` | Delete a memory |
| `POST` | `/search` | Semantic search |

### Ingest API (Smart, Evolvable)

These endpoints run LLM-based extraction. Logic may change over time.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ingest/text` | Extract memories from raw text |
| `POST` | `/ingest/chat` | Extract from chat messages |
| `POST` | `/ingest/document` | Extract from documents |

### Platform API (Account Management)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/auth/me` | Get current user |
| `POST` | `/keys` | Create API key |
| `GET` | `/keys` | List API keys |
| `DELETE` | `/keys/{id}` | Delete API key |


##  Architecture

```
UniMemory/
├── api/                 # Backend API (FastAPI + PostgreSQL + pgvector)
│   ├── app/
│   │   ├── api/        # API routes
│   │   ├── core/       # Core logic (embeddings, search, extraction)
│   │   └── db/         # Database models and migrations
│   └── Dockerfile      # Production deployment
├── webapp/            # Web application (Next.js 14)
│   └── app/           # Next.js App Router pages
├── packages/
│   ├── js/            # JavaScript/TypeScript SDK
│   └── python/        # Python SDK
└── README.md
```

### Technology Stack

**Backend:**
- FastAPI - Modern Python web framework
- PostgreSQL - Relational database
- pgvector - Vector similarity search
- OpenAI - Embeddings and LLM capabilities
- Firebase Auth - User authentication

**Frontend:**
- Next.js 14 - React framework with App Router
- TypeScript - Type safety
- Tailwind CSS - Utility-first styling
- Firebase Auth - Client-side authentication

**SDKs:**
- TypeScript/JavaScript - ESM and CommonJS support
- Python - Async/await support with httpx

## 🔧 Development

### Prerequisites

- Node.js 18+ (for webapp and JS SDK)
- Python 3.8+ (for API and Python SDK)
- PostgreSQL 14+ with pgvector extension
- OpenAI API key

### Local Setup

1. **Clone the repository:**
```bash
git clone https://github.com/shreyasgurav/UniMemory.git
cd UniMemory
```

2. **Setup API:**
```bash
cd api
pip install -r requirements.txt
# Configure .env file (see api/.env.example)
uvicorn app.main:app --reload
```

3. **Setup Webapp:**
```bash
cd webapp
npm install
# Configure .env.local with Firebase and API settings
npm run dev
```

4. **Setup JavaScript SDK:**
```bash
cd packages/js
npm install
npm run build
npm run dev  # Watch mode
```

5. **Setup Python SDK:**
```bash
cd packages/python
pip install -e .
# Or for development
pip install -e ".[dev]"
```

### Environment Variables

**API (.env):**
```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/unimemory
OPENAI_API_KEY=sk-...
SECRET_KEY=your-secret-key
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

**Webapp (.env.local):**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

##  Deployment

### API Deployment (Railway)

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically deploy from `Dockerfile`

**Railway Setup:**
- Database: Use Supabase or Railway PostgreSQL
- Environment: Set all required env vars
- Domain: Railway provides HTTPS domain automatically

### Webapp Deployment (Vercel)

1. Connect repository to Vercel
2. Configure environment variables
3. Deploy automatically on push to main

**Vercel Setup:**
```bash
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
vercel env add NEXT_PUBLIC_API_URL
```

### SDK Publishing

**JavaScript SDK:**
```bash
cd packages/js
npm version patch|minor|major
npm publish
```

**Python SDK:**
```bash
cd packages/python
python -m build
twine upload dist/*
```

##  Production Status

- ✅ **API**: Deployed at [https://unimemory.up.railway.app](https://unimemory.up.railway.app)
- ✅ **Dashboard**: [https://app.unimemory.ai](https://app.unimemory.ai)
- ✅ **npm Package**: [unimemory@1.0.2](https://www.npmjs.com/package/unimemory)
- ✅ **PyPI Package**: [unimemory@1.0.2](https://pypi.org/project/unimemory/)
- ✅ **Database**: Supabase PostgreSQL with pgvector

##  Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all checks pass before submitting PR

##  License

This project is licensed under the MIT License - see the [LICENSE](./api/LICENSE) file for details.

##  Links

- **Dashboard**: [https://app.unimemory.ai](https://app.unimemory.ai)
- **API**: [https://unimemory.up.railway.app](https://unimemory.up.railway.app)
- **npm Package**: [https://www.npmjs.com/package/unimemory](https://www.npmjs.com/package/unimemory)
- **PyPI Package**: [https://pypi.org/project/unimemory/](https://pypi.org/project/unimemory/)
- **GitHub Repository**: [https://github.com/shreyasgurav/UniMemory](https://github.com/shreyasgurav/UniMemory)
- **Issues**: [https://github.com/shreyasgurav/UniMemory/issues](https://github.com/shreyasgurav/UniMemory/issues)

##  Acknowledgments

- Built with [FastAPI](https://fastapi.tiangolo.com/)
- Powered by [OpenAI](https://openai.com/) embeddings
- Vector search with [pgvector](https://github.com/pgvector/pgvector)
- UI built with [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/)

##  Contact

- **Email**: hello@unimemory.ai
- **GitHub**: [@shreyasgurav](https://github.com/shreyasgurav)

---

<div align="center">
Made with ❤️ by the UniMemory team
</div>
