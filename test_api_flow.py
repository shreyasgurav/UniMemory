#!/usr/bin/env python3
"""
Test script for UniMemory API
Tests the complete flow: add memory, search, list, delete
"""
import os
import sys
import json
import requests
from typing import Dict, Any

# Configuration
API_BASE = "https://unimemory.up.railway.app/api/v1"
API_KEY = os.environ.get("UNIMEMORY_API_KEY")

if not API_KEY:
    print("❌ Error: UNIMEMORY_API_KEY environment variable not set")
    print("   Set it with: export UNIMEMORY_API_KEY='your-api-key-here'")
    sys.exit(1)


def test_request(method: str, endpoint: str, data: Dict[Any, Any] = None) -> Dict[Any, Any]:
    """Make an API request"""
    url = f"{API_BASE}{endpoint}"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    
    print(f"\n🔵 {method} {endpoint}")
    if data:
        print(f"   Body: {json.dumps(data, indent=2)}")
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 204:  # No Content
            return {}
        
        try:
            result = response.json()
            print(f"   Response: {json.dumps(result, indent=2)}")
            return result
        except:
            print(f"   Response (text): {response.text}")
            return {}
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return {}


def main():
    print("=" * 60)
    print("🧪 UniMemory API Test Suite")
    print("=" * 60)
    print(f"API Base: {API_BASE}")
    print(f"API Key: {API_KEY[:10]}...{API_KEY[-4:]}")
    
    # Test user ID (your chatbot customer ID)
    test_user_id = "test_user_123"
    
    # Test 1: Add Memory
    print("\n" + "=" * 60)
    print("TEST 1: Add Memory")
    print("=" * 60)
    
    memory_content = "User prefers morning meetings and works best before 10 AM. They like concise summaries and prefer email over Slack for important communications."
    
    add_result = test_request("POST", "/memories/add", {
        "content": memory_content,
        "user_id": test_user_id,
        "source_app": "test-script",
        "metadata": {
            "test": True,
            "timestamp": "2024-01-01T00:00:00Z"
        }
    })
    
    if not add_result.get("was_worth_remembering"):
        print(f"⚠️  Memory was not worth remembering: {add_result.get('reason')}")
    else:
        print(f"✅ Memory added! Extracted {add_result.get('extracted_count', 0)} memories")
        memory_ids = [m.get("id") for m in add_result.get("memories", [])]
        print(f"   Memory IDs: {memory_ids}")
    
    # Wait a bit for processing
    import time
    print("\n⏳ Waiting 2 seconds for processing...")
    time.sleep(2)
    
    # Test 2: Add Another Memory (related)
    print("\n" + "=" * 60)
    print("TEST 2: Add Related Memory")
    print("=" * 60)
    
    related_content = "User mentioned they have a standing meeting every Tuesday at 2 PM and prefer video calls for team meetings."
    
    add_result2 = test_request("POST", "/memories/add", {
        "content": related_content,
        "user_id": test_user_id,
        "source_app": "test-script"
    })
    
    if add_result2.get("was_worth_remembering"):
        print(f"✅ Second memory added!")
    time.sleep(2)
    
    # Test 3: Search Memories
    print("\n" + "=" * 60)
    print("TEST 3: Search Memories")
    print("=" * 60)
    
    search_queries = [
        "user meeting preferences",
        "when does user prefer to work",
        "communication preferences"
    ]
    
    for query in search_queries:
        print(f"\n📝 Searching for: '{query}'")
        search_result = test_request("POST", "/search", {
            "query": query,
            "user_id": test_user_id,
            "limit": 5,
            "min_salience": 0.0
        })
        
        results = search_result.get("results", [])
        print(f"   Found {len(results)} results")
        for i, result in enumerate(results[:3], 1):
            print(f"   {i}. Score: {result.get('score', 0):.3f} | {result.get('content', '')[:60]}...")
    
    # Test 4: List All Memories
    print("\n" + "=" * 60)
    print("TEST 4: List All Memories")
    print("=" * 60)
    
    list_result = test_request("GET", f"/memories?user_id={test_user_id}&limit=10")
    
    memories = list_result.get("memories", [])
    total = list_result.get("total", 0)
    print(f"✅ Found {total} total memories (showing {len(memories)})")
    
    for i, mem in enumerate(memories[:5], 1):
        print(f"\n   {i}. ID: {mem.get('id')}")
        print(f"      Content: {mem.get('content', '')[:80]}...")
        print(f"      Sector: {mem.get('sector')} | Salience: {mem.get('salience', 0):.3f}")
        print(f"      Tags: {mem.get('tags', [])}")
        print(f"      Created: {mem.get('created_at')}")
    
    # Test 5: Delete a Memory (optional)
    if memories:
        print("\n" + "=" * 60)
        print("TEST 5: Delete Memory (Optional)")
        print("=" * 60)
        print("   Skipping delete test (comment out to enable)")
        # memory_to_delete = memories[0].get("id")
        # delete_result = test_request("DELETE", f"/memories/{memory_to_delete}")
        # print(f"✅ Memory deleted: {memory_to_delete}")
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ Test Suite Complete!")
    print("=" * 60)
    print(f"   Test User ID: {test_user_id}")
    print(f"   Total memories created/retrieved: {total}")
    print("\n💡 Next steps:")
    print("   1. Check Supabase database to see saved memories")
    print("   2. Try different search queries")
    print("   3. Test with different user_ids to verify isolation")


if __name__ == "__main__":
    main()
