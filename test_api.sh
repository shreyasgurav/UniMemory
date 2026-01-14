#!/bin/bash

# Test script to verify API flow
# Replace FIREBASE_TOKEN with your actual Firebase ID token

API_BASE="https://unimemory.up.railway.app/api/v1"

echo "=== Step 1: Get Session Token ==="
echo "Get your Firebase token from browser console:"
echo "  firebase.auth().currentUser.getIdToken().then(t => console.log(t))"
echo ""
read -p "Enter Firebase token: " FIREBASE_TOKEN

SESSION_RESPONSE=$(curl -s -X GET "$API_BASE/consumer/auth/session" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json")

echo "Session response:"
echo "$SESSION_RESPONSE" | jq '.'

SESSION_TOKEN=$(echo "$SESSION_RESPONSE" | jq -r '.session_token')
USER_ID=$(echo "$SESSION_RESPONSE" | jq -r '.user.id')

echo ""
echo "Session Token: $SESSION_TOKEN"
echo "User ID: $USER_ID"
echo ""

echo "=== Step 2: Save Test Chat ==="
INGEST_RESPONSE=$(curl -s -X POST "$API_BASE/ingest/chat" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the capital of France?"},
      {"role": "assistant", "content": "The capital of France is Paris."}
    ],
    "source_metadata": {
      "platform": "test",
      "title": "Test Chat",
      "url": "http://test.com"
    }
  }')

echo "Ingest response:"
echo "$INGEST_RESPONSE" | jq '.'

STORED=$(echo "$INGEST_RESPONSE" | jq -r '.stored')
SOURCE_ID=$(echo "$INGEST_RESPONSE" | jq -r '.source_id')

echo ""
echo "Stored memories: $STORED"
echo "Source ID: $SOURCE_ID"
echo ""

echo "=== Step 3: Fetch Sources ==="
SOURCES_RESPONSE=$(curl -s -X GET "$API_BASE/consumer/sources" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json")

echo "Sources response:"
echo "$SOURCES_RESPONSE" | jq '.'

SOURCE_COUNT=$(echo "$SOURCES_RESPONSE" | jq '. | length')
echo ""
echo "Total sources: $SOURCE_COUNT"
echo ""

echo "=== Step 4: Fetch Memories ==="
MEMORIES_RESPONSE=$(curl -s -X GET "$API_BASE/consumer/memories" \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json")

echo "Memories response:"
echo "$MEMORIES_RESPONSE" | jq '.'

MEMORY_COUNT=$(echo "$MEMORIES_RESPONSE" | jq '. | length')
echo ""
echo "Total memories: $MEMORY_COUNT"
echo ""

if [ "$SOURCE_COUNT" -gt 0 ] && [ "$MEMORY_COUNT" -gt 0 ]; then
  echo "✅ SUCCESS: Data saved and retrieved correctly!"
else
  echo "❌ FAILURE: Data not appearing in dashboard"
  echo "   - Stored: $STORED memories"
  echo "   - Retrieved: $MEMORY_COUNT memories"
  echo "   - Check Railway logs for errors"
fi
