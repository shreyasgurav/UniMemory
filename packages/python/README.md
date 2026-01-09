# UniMemory

AI memory management for your applications.

## Installation

```bash
pip install unimemory
```

## Quick Start

```python
from unimemory import UniMemory

client = UniMemory(api_key="um_live_xxx...")
# Or set UNIMEMORY_API_KEY environment variable

# Add a memory
result = client.add_memory(content="User prefers dark mode")
print(f"Remembered: {result.was_worth_remembering}")

# Search memories
results = client.search("user preferences")
for r in results.results:
    print(f"{r.content} (score: {r.score})")
```

## API

### Initialize

```python
from unimemory import UniMemory

# With API key
client = UniMemory(api_key="um_live_xxx...")

# Or using environment variable
import os
os.environ["UNIMEMORY_API_KEY"] = "um_live_xxx..."
client = UniMemory()

# Custom base URL
client = UniMemory(
    api_key="um_live_xxx...",
    base_url="http://localhost:8000/api/v1"
)
```

### Add Memory

```python
result = client.add_memory(
    content="User clicked the buy button",
    source_app="my-app",        # optional
    user_id="user123",          # optional
    metadata={"page": "checkout"}  # optional
)

print(result.was_worth_remembering)  # True/False
print(result.extracted_count)        # Number of memories extracted
print(result.memories)               # List of memory IDs
```

### Search

```python
results = client.search(
    query="user preferences",
    limit=10,
    user_id="user123",
    min_salience=0.5
)

for r in results.results:
    print(f"ID: {r.id}")
    print(f"Content: {r.content}")
    print(f"Score: {r.score}")
    print(f"Salience: {r.salience}")
```

### List Memories

```python
memories = client.list_memories(
    limit=50,
    offset=0,
    user_id="user123",
    sector="semantic"
)

for m in memories.memories:
    print(f"{m.content} - {m.created_at}")
```

### Delete Memory

```python
client.delete_memory("memory-id-here")
```

## Context Manager

```python
with UniMemory(api_key="...") as client:
    client.add_memory(content="...")
    # Client is automatically closed after the block
```

## License

MIT

