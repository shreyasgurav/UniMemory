# UniMemory JavaScript SDK

Official JavaScript/TypeScript SDK for the UniMemory API.

## Installation
```bash
npm install @unimemory/sdk
```

## Usage
```typescript
import { UniMemory } from '@unimemory/sdk';

const client = new UniMemory({
  apiKey: 'your-api-key'
});

// Ingest text
await client.ingest.text({
  content: 'Important information to remember',
  user_id: 'user-123'
});

// Search memories
const results = await client.search({
  query: 'what did I learn about...',
  user_id: 'user-123'
});

// Get memories
const memories = await client.memories.list({
  user_id: 'user-123'
});
```

## API Reference
- `ingest.text()` - Ingest text content
- `ingest.chat()` - Ingest chat messages
- `ingest.document()` - Ingest documents
- `search()` - Semantic search
- `memories.list()` - List memories
- `memories.get()` - Get memory by ID
- `memories.delete()` - Delete memory
