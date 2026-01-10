#!/bin/bash

echo "Testing UniMemory API..."
echo ""

# 1. Health check
echo "1. Health check:"
curl -s http://localhost:8000/api/v1/health | python3 -m json.tool
echo ""

# 2. Add a memory
echo "2. Adding memory..."
curl -X POST http://localhost:8000/api/v1/memories/add \
  -H "Content-Type: application/json" \
  -d '{
    "content": "I prefer dark mode for all applications. It is easier on my eyes during long coding sessions.",
    "source_app": "test",
    "user_id": "test_user"
  }' | python3 -m json.tool
echo ""

# 3. Search memories
echo "3. Searching memories..."
curl -X POST http://localhost:8000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "dark mode preference",
    "limit": 5,
    "user_id": "test_user"
  }' | python3 -m json.tool
echo ""

# 4. List all memories
echo "4. Listing all memories:"
curl -s "http://localhost:8000/api/v1/memories?user_id=test_user&limit=10" | python3 -m json.tool

echo ""
echo "✅ Test complete!"
