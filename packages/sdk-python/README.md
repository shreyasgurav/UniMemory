# UniMemory Python SDK

Official Python SDK for the UniMemory API.

## Installation

```bash
pip install unimemory
```

## Quick Start

```python
from unimemory import UniMemory, CreateMemoryOptions, IngestTextOptions, SearchOptions

client = UniMemory(api_key="um_live_...")

# Store an explicit memory (no LLM, deterministic)
result = client.add(CreateMemoryOptions(content="User prefers dark mode", tags=["preference"]))
print(result.id)

# Ingest text — LLM extracts memories in the background
resp = client.ingest_text(IngestTextOptions(content="We discussed the new API design..."))
print(resp.source_id)

# Search memories
results = client.search("What theme does the user prefer?")
for r in results.results:
    print(r.content, r.salience)

# List, get, update, delete
memories = client.list(limit=10)
memory = client.get(memories.memories[0].id)
client.delete(memory.id)
```

## API Reference

| Method | Description |
|---|---|
| `add(options)` | Store explicit memory (no LLM) |
| `list(limit, offset, user_id, sector)` | List memories |
| `get(memory_id)` | Get single memory |
| `update(memory_id, options)` | Update tags/salience/metadata |
| `delete(memory_id)` | Delete memory |
| `search(query, options)` | Semantic search |
| `ingest_text(options)` | Ingest text (LLM extraction) |
| `ingest_chat(options)` | Ingest chat messages |
| `ingest_document(options)` | Ingest document |

## Documentation

Full documentation at [https://docs.unimemory.app](https://docs.unimemory.app)
