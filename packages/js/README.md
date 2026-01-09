# UniMemory

AI memory management for your applications.

## Installation

```bash
npm install unimemory
```

## Quick Start

```typescript
import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

// Add a memory
await client.addMemory({
  content: "User prefers dark mode",
  sourceApp: "my-app"
});

// Search memories
const results = await client.search("user preferences");
console.log(results.results);
```

## API

### `new UniMemory(config)`

Create a new UniMemory client.

```typescript
const client = new UniMemory({
  apiKey: 'um_live_xxx...',
  baseUrl: 'https://api.unimemory.ai/api/v1' // optional
});
```

### `client.addMemory(options)`

Add a memory.

```typescript
const result = await client.addMemory({
  content: "Important information to remember",
  sourceApp: "my-app",        // optional
  userId: "user123",          // optional
  metadata: { key: "value" }  // optional
});

// Result:
// {
//   wasWorthRemembering: true,
//   reason: "Contains user preference",
//   extractedCount: 1,
//   memories: [{ id: "...", wasDeduplicated: false }]
// }
```

### `client.search(query, options?)`

Search memories.

```typescript
const results = await client.search("user preferences", {
  limit: 10,
  userId: "user123",
  minSalience: 0.5
});

// Result:
// {
//   results: [{ id, content, sector, salience, score, tags }],
//   total: 1,
//   query: "user preferences"
// }
```

### `client.listMemories(options?)`

List memories.

```typescript
const memories = await client.listMemories({
  limit: 50,
  offset: 0,
  userId: "user123",
  sector: "semantic"
});
```

### `client.deleteMemory(memoryId)`

Delete a memory.

```typescript
await client.deleteMemory("memory-id-here");
```

## License

MIT

