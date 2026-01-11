#!/usr/bin/env python3
"""
Production API Test Script
Tests all endpoints with proper API key authentication

Usage:
    export UNIMEMORY_API_KEY="your-api-key"
    python3 test_production_api.py

Or specify base URL:
    python3 test_production_api.py --url https://unimemory.up.railway.app
"""
import os
import sys
import asyncio
import httpx
import json
from typing import Optional, Dict, Any
from datetime import datetime


# Configuration
API_BASE = os.environ.get("UNIMEMORY_API_URL", "https://unimemory.up.railway.app/api/v1")
API_KEY = os.environ.get("UNIMEMORY_API_KEY")


def print_section(title: str):
    """Print a section header"""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_test(name: str):
    """Print test name"""
    print(f"\n✓ {name}...")


def print_success(message: str = "Success"):
    """Print success message"""
    print(f"  ✅ {message}")


def print_error(message: str):
    """Print error message"""
    print(f"  ❌ {message}")


def print_info(message: str):
    """Print info message"""
    print(f"  ℹ️  {message}")


async def test_health(client: httpx.AsyncClient):
    """Test health endpoints"""
    print_test("Health Check")
    
    try:
        response = await client.get("/health")
        if response.status_code == 200:
            data = response.json()
            print_success(f"Status: {data.get('status')}")
            return True
        else:
            print_error(f"Status code: {response.status_code}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_readiness(client: httpx.AsyncClient):
    """Test readiness endpoint"""
    print_test("Readiness Check")
    
    try:
        response = await client.get("/health/ready")
        if response.status_code == 200:
            data = response.json()
            print_success(f"Status: {data.get('status')}")
            print_info(f"Database: {data.get('database', 'unknown')}")
            return True
        else:
            print_error(f"Status code: {response.status_code}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_api_key_validation(client: httpx.AsyncClient):
    """Test API key validation endpoint"""
    print_test("API Key Validation")
    
    if not API_KEY:
        print_error("API_KEY not set")
        return False
    
    try:
        response = await client.get("/auth/validate", headers={"X-API-Key": API_KEY})
        if response.status_code == 200:
            data = response.json()
            print_success(f"Valid: {data.get('valid')}")
            print_info(f"User: {data.get('user', {}).get('email', 'unknown')}")
            print_info(f"Plan: {data.get('user', {}).get('plan', 'unknown')}")
            print_info(f"API Key: {data.get('api_key', {}).get('name', 'unknown')}")
            return True
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_add_memory(client: httpx.AsyncClient):
    """Test adding a memory"""
    print_test("Add Memory")
    
    if not API_KEY:
        print_error("API_KEY not set")
        return False
    
    test_content = f"I prefer dark mode for all applications. This is a test memory created at {datetime.utcnow().isoformat()}."
    
    try:
        response = await client.post(
            "/memories/add",
            headers={"X-API-Key": API_KEY},
            json={
                "content": test_content,
                "source_app": "test_script",
                "user_id": "test_user_production",
                "metadata": {"test": True, "timestamp": datetime.utcnow().isoformat()}
            },
            timeout=60.0  # OpenAI calls can take time
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Worth remembering: {data.get('was_worth_remembering')}")
            print_info(f"Extracted: {data.get('extracted_count', 0)} memories")
            print_info(f"Reason: {data.get('reason', 'N/A')}")
            
            if data.get("memories"):
                memory_ids = [m.get("id") for m in data.get("memories", [])]
                print_info(f"Memory IDs: {', '.join(memory_ids[:3])}")
                return memory_ids[0] if memory_ids else None
            return None
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(str(e))
        return None


async def test_search_memories(client: httpx.AsyncClient):
    """Test searching memories"""
    print_test("Search Memories")
    
    if not API_KEY:
        print_error("API_KEY not set")
        return False
    
    try:
        response = await client.post(
            "/search",
            headers={"X-API-Key": API_KEY},
            json={
                "query": "dark mode preference",
                "limit": 5,
                "user_id": "test_user_production",
                "debug": False
            },
            timeout=30.0
        )
        
        if response.status_code == 200:
            data = response.json()
            results = data.get("results", [])
            print_success(f"Found {len(results)} results")
            
            for i, result in enumerate(results[:3], 1):
                print_info(f"  {i}. Score: {result.get('score', 0):.3f} - {result.get('content', '')[:50]}...")
            
            return True
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_list_memories(client: httpx.AsyncClient):
    """Test listing memories"""
    print_test("List Memories")
    
    if not API_KEY:
        print_error("API_KEY not set")
        return False
    
    try:
        response = await client.get(
            "/memories",
            headers={"X-API-Key": API_KEY},
            params={
                "user_id": "test_user_production",
                "limit": 10,
                "offset": 0
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            memories = data.get("memories", [])
            total = data.get("total", 0)
            print_success(f"Total: {total}, Returned: {len(memories)}")
            
            for i, mem in enumerate(memories[:3], 1):
                print_info(f"  {i}. {mem.get('content', '')[:50]}...")
            
            return memories[0].get("id") if memories else None
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(str(e))
        return None


async def test_get_memory(client: httpx.AsyncClient, memory_id: str):
    """Test getting a single memory"""
    print_test("Get Memory")
    
    if not API_KEY or not memory_id:
        print_error("API_KEY or memory_id not set")
        return False
    
    try:
        response = await client.get(
            f"/memories/{memory_id}",
            headers={"X-API-Key": API_KEY}
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Memory ID: {data.get('id')}")
            print_info(f"Content: {data.get('content', '')[:50]}...")
            print_info(f"Sector: {data.get('sector', 'N/A')}")
            print_info(f"Salience: {data.get('salience', 0):.2f}")
            return True
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_update_memory(client: httpx.AsyncClient, memory_id: str):
    """Test updating a memory"""
    print_test("Update Memory")
    
    if not API_KEY or not memory_id:
        print_error("API_KEY or memory_id not set")
        return False
    
    try:
        response = await client.patch(
            f"/memories/{memory_id}",
            headers={"X-API-Key": API_KEY},
            json={
                "salience": 0.8,
                "tags": ["test", "production", "automated"],
                "metadata": {"updated": True, "updated_at": datetime.utcnow().isoformat()}
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Updated salience: {data.get('salience', 0):.2f}")
            print_info(f"Tags: {', '.join(data.get('tags', []))}")
            return True
        else:
            print_error(f"Status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_rate_limit(client: httpx.AsyncClient):
    """Test rate limiting (should not exceed limit)"""
    print_test("Rate Limit Check")
    
    if not API_KEY:
        print_error("API_KEY not set")
        return False
    
    try:
        # Make a few requests quickly to check rate limiting
        requests_made = 0
        rate_limited = False
        
        for i in range(5):
            response = await client.get(
                "/health",
                headers={"X-API-Key": API_KEY}
            )
            requests_made += 1
            
            if response.status_code == 429:
                rate_limited = True
                remaining = response.headers.get("X-RateLimit-Remaining", "0")
                reset = response.headers.get("X-RateLimit-Reset", "0")
                print_info(f"Rate limited after {requests_made} requests")
                print_info(f"Remaining: {remaining}, Reset in: {reset}s")
                break
        
        if rate_limited:
            print_success("Rate limiting is working")
        else:
            print_info(f"Made {requests_made} requests without rate limit (this is fine)")
        
        return True
    except Exception as e:
        print_error(str(e))
        return False


async def test_invalid_api_key(client: httpx.AsyncClient):
    """Test with invalid API key"""
    print_test("Invalid API Key Rejection")
    
    try:
        response = await client.get(
            "/auth/validate",
            headers={"X-API-Key": "invalid_key_12345"}
        )
        
        if response.status_code == 401:
            print_success("Invalid API key correctly rejected")
            return True
        else:
            print_error(f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def test_missing_api_key(client: httpx.AsyncClient):
    """Test with missing API key"""
    print_test("Missing API Key Rejection")
    
    try:
        response = await client.get("/auth/validate")
        
        if response.status_code == 401:
            print_success("Missing API key correctly rejected")
            return True
        else:
            print_error(f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print_error(str(e))
        return False


async def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("  UniMemory API Production Test Suite")
    print("=" * 60)
    print(f"\nBase URL: {API_BASE}")
    print(f"API Key: {'*' * 20 if API_KEY else 'NOT SET'}")
    
    if not API_KEY:
        print("\n⚠️  WARNING: UNIMEMORY_API_KEY not set!")
        print("   Some tests will be skipped.")
        print("\n   Set it with:")
        print("   export UNIMEMORY_API_KEY='your-api-key'")
    
    results = {
        "passed": 0,
        "failed": 0,
        "skipped": 0
    }
    
    async with httpx.AsyncClient(base_url=API_BASE, timeout=60.0) as client:
        # Basic health checks (no auth required)
        print_section("Basic Health Checks")
        if await test_health(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        if await test_readiness(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        # Authentication tests
        print_section("Authentication Tests")
        if await test_api_key_validation(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        if await test_invalid_api_key(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        if await test_missing_api_key(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        # Core functionality tests
        print_section("Core Functionality Tests")
        memory_id = await test_add_memory(client)
        if memory_id:
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        if await test_search_memories(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        list_memory_id = await test_list_memories(client)
        if list_memory_id:
            results["passed"] += 1
        else:
            results["failed"] += 1
        
        # Use memory ID from list if add didn't return one
        test_memory_id = memory_id or list_memory_id
        if test_memory_id:
            if await test_get_memory(client, test_memory_id):
                results["passed"] += 1
            else:
                results["failed"] += 1
            
            if await test_update_memory(client, test_memory_id):
                results["passed"] += 1
            else:
                results["failed"] += 1
        
        # Performance and security tests
        print_section("Performance & Security Tests")
        if await test_rate_limit(client):
            results["passed"] += 1
        else:
            results["failed"] += 1
    
    # Summary
    print_section("Test Summary")
    print(f"✅ Passed: {results['passed']}")
    print(f"❌ Failed: {results['failed']}")
    print(f"⏭️  Skipped: {results['skipped']}")
    
    total = results['passed'] + results['failed']
    if total > 0:
        success_rate = (results['passed'] / total) * 100
        print(f"\nSuccess Rate: {success_rate:.1f}%")
    
    if results['failed'] == 0:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print("\n⚠️  Some tests failed. Check the output above.")
        return 1


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--url":
        if len(sys.argv) > 2:
            API_BASE = sys.argv[2] + "/api/v1"
        else:
            print("Usage: python3 test_production_api.py --url <base_url>")
            sys.exit(1)
    
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
