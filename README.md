# UniMemory

<div align="center">

**The memory layer for your AI apps.**

[![npm version](https://img.shields.io/npm/v/unimemory.svg?style=flat-square)](https://www.npmjs.com/package/unimemory)
[![PyPI version](https://img.shields.io/pypi/v/unimemory.svg?style=flat-square)](https://pypi.org/project/unimemory/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

[📖 Documentation](#documentation) • [🚀 Quick Start](#quick-start) • [📦 npm](https://www.npmjs.com/package/unimemory) • [🐍 PyPI](https://pypi.org/project/unimemory/)

</div>

---

UniMemory provides intelligent memory management for AI applications. Store, search, and retrieve memories with semantic understanding, automatic deduplication, and intelligent extraction.

## ✨ Features

- 🧠 **Semantic Memory Storage** - Store memories with vector embeddings for intelligent retrieval
- 🔍 **Semantic Search** - Find memories by meaning, not just keywords
- 🎯 **Automatic Deduplication** - Prevents duplicate memories using similarity detection
- 📊 **Memory Extraction** - Automatically extracts meaningful information from content
- 🏷️ **Sector Classification** - Organizes memories into semantic sectors
- 🔗 **Memory Relationships** - Tracks connections between related memories
- 📱 **Multi-Platform SDKs** - JavaScript/TypeScript and Python support
- 🎨 **Modern Dashboard** - Beautiful web interface for managing projects and API keys
- ⚡ **Production Ready** - Deployed API and scalable infrastructure

## 🚀 Quick Start

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
3. Create a new project
4. Generate an API key

### Usage

**JavaScript/TypeScript:**
```typescript
import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Add a memory
const result = await client.addMemory({
  content: "User prefers dark mode",
  sourceApp: "my-app",
  userId: "user123"
});

// Search memories semantically
const results = await client.search("user preferences");
console.log(results.results);
```

**Python:**
```python
from unimemory import UniMemory

client = UniMemory(api_key="um_live_xxx...")

# Add a memory
result = client.add_memory(
    content="User prefers dark mode",
    source_app="my-app",
    user_id="user123"
)

# Search memories
results = client.search("user preferences")
for memory in results.results:
    print(f"{memory.content} (score: {memory.score})")
```

## 📖 Documentation

### JavaScript/TypeScript SDK

Full documentation: [packages/js/README.md](./packages/js/README.md)

#### Methods

- `addMemory(options)` - Add a new memory
- `search(query, options?)` - Semantic search memories
- `listMemories(options?)` - List memories with filters
- `deleteMemory(memoryId)` - Delete a memory by ID

### Python SDK

Full documentation: [packages/python/README.md](./packages/python/README.md)

#### Methods

- `add_memory(**kwargs)` - Add a new memory
- `search(query, **kwargs)` - Semantic search memories
- `list_memories(**kwargs)` - List memories with filters
- `delete_memory(memory_id)` - Delete a memory by ID

### API Reference

The UniMemory API provides RESTful endpoints for memory management:

- **Base URL**: `https://unimemory.up.railway.app/api/v1`
- **Authentication**: Bearer token (API Key)
- **Documentation**: [API Documentation](./api/README.md)

#### Endpoints

- `POST /memories` - Create a new memory
- `GET /memories` - List memories
- `POST /search` - Semantic search
- `DELETE /memories/{id}` - Delete a memory
- `GET /projects` - List projects
- `POST /projects` - Create project
- `POST /keys` - Create API key
- `GET /keys` - List API keys

## 🏗️ Architecture

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

## 🚢 Deployment

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

## 📊 Production Status

- ✅ **API**: Deployed at [https://unimemory.up.railway.app](https://unimemory.up.railway.app)
- ✅ **Dashboard**: [https://app.unimemory.ai](https://app.unimemory.ai)
- ✅ **npm Package**: [unimemory@1.0.2](https://www.npmjs.com/package/unimemory)
- ✅ **PyPI Package**: [unimemory@1.0.2](https://pypi.org/project/unimemory/)
- ✅ **Database**: Supabase PostgreSQL with pgvector

## 🤝 Contributing

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

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./api/LICENSE) file for details.

## 🔗 Links

- **Dashboard**: [https://app.unimemory.ai](https://app.unimemory.ai)
- **API**: [https://unimemory.up.railway.app](https://unimemory.up.railway.app)
- **npm Package**: [https://www.npmjs.com/package/unimemory](https://www.npmjs.com/package/unimemory)
- **PyPI Package**: [https://pypi.org/project/unimemory/](https://pypi.org/project/unimemory/)
- **GitHub Repository**: [https://github.com/shreyasgurav/UniMemory](https://github.com/shreyasgurav/UniMemory)
- **Issues**: [https://github.com/shreyasgurav/UniMemory/issues](https://github.com/shreyasgurav/UniMemory/issues)

## 🙏 Acknowledgments

- Built with [FastAPI](https://fastapi.tiangolo.com/)
- Powered by [OpenAI](https://openai.com/) embeddings
- Vector search with [pgvector](https://github.com/pgvector/pgvector)
- UI built with [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/)

## 📧 Contact

- **Email**: hello@unimemory.ai
- **GitHub**: [@shreyasgurav](https://github.com/shreyasgurav)

---

<div align="center">
Made with ❤️ by the UniMemory team
</div>