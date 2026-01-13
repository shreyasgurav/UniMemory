# UniMemory Python SDK

Official Python SDK for the UniMemory API.

## Installation
```bash
pip install unimemory
```

## Usage
```python
from unimemory import UniMemory

client = UniMemory(api_key="your-api-key")

# Ingest text
client.ingest.text(
    content="Important information to remember",
    user_id="user-123"
)

# Search memories
results = client.search(
    query="what did I learn about...",
    user_id="user-123"
)

# Get memories
memories = client.memories.list(user_id="user-123")
```

## API Reference
- `ingest.text()` - Ingest text content
- `ingest.chat()` - Ingest chat messages
- `ingest.document()` - Ingest documents
- `search()` - Semantic search
- `memories.list()` - List memories
- `memories.get()` - Get memory by ID
- `memories.delete()` - Delete memory
