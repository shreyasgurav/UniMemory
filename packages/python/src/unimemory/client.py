"""
UniMemory Client
"""

import os
from typing import Optional, Dict, Any
import httpx

from .types import (
    AddMemoryOptions,
    AddMemoryResponse,
    SearchOptions,
    SearchResult,
    SearchResponse,
    Memory,
    ListMemoriesOptions,
    ListMemoriesResponse,
    UniMemoryError,
    MemoryInfo,
)


class UniMemory:
    """
    UniMemory SDK Client
    
    Usage:
        client = UniMemory(api_key="um_live_xxx...")
        
        # Add memory
        result = client.add_memory(content="User prefers dark mode")
        
        # Search
        results = client.search("user preferences")
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize UniMemory client.
        
        Args:
            api_key: Your UniMemory API key. If not provided, uses UNIMEMORY_API_KEY env var.
            base_url: API base URL. Defaults to https://api.unimemory.ai/api/v1
        """
        self.api_key = api_key or os.environ.get("UNIMEMORY_API_KEY")
        if not self.api_key:
            raise UniMemoryError("API key is required. Set UNIMEMORY_API_KEY or pass api_key.")
        
        self.base_url = base_url or os.environ.get(
            "UNIMEMORY_BASE_URL", 
            "https://api.unimemory.ai/api/v1"
        )
        
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "X-API-Key": self.api_key,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
    
    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request"""
        try:
            response = self._client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            error_data = {}
            try:
                error_data = e.response.json()
            except:
                pass
            raise UniMemoryError(
                message=error_data.get("detail", str(e)),
                status=e.response.status_code,
                code=error_data.get("code"),
            )
        except httpx.RequestError as e:
            raise UniMemoryError(f"Request failed: {e}")
    
    def add_memory(
        self,
        content: str,
        source_app: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AddMemoryResponse:
        """
        Add a memory to UniMemory.
        
        Args:
            content: The content to remember
            source_app: Optional source application name
            user_id: Optional user ID for multi-user contexts
            metadata: Optional additional metadata
            
        Returns:
            AddMemoryResponse with extraction results
        """
        data = {
            "content": content,
            "source_app": source_app,
            "user_id": user_id,
            "metadata": metadata,
        }
        # Remove None values
        data = {k: v for k, v in data.items() if v is not None}
        
        response = self._request("POST", "/memories/add", json=data)
        
        memories = None
        if response.get("memories"):
            memories = [
                MemoryInfo(
                    id=m["id"],
                    was_deduplicated=m.get("was_deduplicated", False)
                )
                for m in response["memories"]
            ]
        
        return AddMemoryResponse(
            was_worth_remembering=response.get("was_worth_remembering", False),
            reason=response.get("reason"),
            extracted_count=response.get("extracted_count", 0),
            memories=memories,
        )
    
    def search(
        self,
        query: str,
        limit: Optional[int] = 10,
        user_id: Optional[str] = None,
        min_salience: Optional[float] = None,
        debug: bool = False,
    ) -> SearchResponse:
        """
        Search memories.
        
        Args:
            query: Search query
            limit: Maximum results to return
            user_id: Optional user ID filter
            min_salience: Minimum salience threshold
            debug: Include debug info in results
            
        Returns:
            SearchResponse with results
        """
        data = {
            "query": query,
            "limit": limit,
            "user_id": user_id,
            "min_salience": min_salience,
            "debug": debug,
        }
        data = {k: v for k, v in data.items() if v is not None}
        
        response = self._request("POST", "/search", json=data)
        
        return SearchResponse(
            results=[
                SearchResult(
                    id=r["id"],
                    content=r["content"],
                    sector=r.get("sector"),
                    salience=r["salience"],
                    score=r["score"],
                    tags=r.get("tags", []),
                )
                for r in response.get("results", [])
            ],
            total=response.get("total", 0),
            query=response.get("query", query),
        )
    
    def list_memories(
        self,
        limit: int = 50,
        offset: int = 0,
        user_id: Optional[str] = None,
        sector: Optional[str] = None,
    ) -> ListMemoriesResponse:
        """
        List memories.
        
        Args:
            limit: Maximum memories to return
            offset: Pagination offset
            user_id: Optional user ID filter
            sector: Optional sector filter
            
        Returns:
            ListMemoriesResponse with memories
        """
        params = {
            "limit": limit,
            "offset": offset,
        }
        if user_id:
            params["user_id"] = user_id
        if sector:
            params["sector"] = sector
        
        response = self._request("GET", "/memories", params=params)
        
        return ListMemoriesResponse(
            memories=[
                Memory(
                    id=m["id"],
                    content=m["content"],
                    sector=m.get("sector"),
                    salience=m["salience"],
                    tags=m.get("tags", []),
                    created_at=m["created_at"],
                )
                for m in response.get("memories", [])
            ],
            total=response.get("total", 0),
        )
    
    def delete_memory(self, memory_id: str) -> Dict[str, Any]:
        """
        Delete a memory.
        
        Args:
            memory_id: ID of memory to delete
            
        Returns:
            Success response
        """
        return self._request("DELETE", f"/memories/{memory_id}")
    
    def close(self):
        """Close the HTTP client"""
        self._client.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        self.close()

