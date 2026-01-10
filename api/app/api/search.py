"""
Search endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from app.db.database import get_db
from app.core.search import hybrid_search
from app.db.models import Memory

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 10
    user_id: Optional[str] = None
    min_salience: Optional[float] = 0.0
    debug: Optional[bool] = False


class SearchResult(BaseModel):
    id: str
    content: str
    sector: Optional[str]
    salience: float
    score: float
    tags: List[str]
    path: List[str]
    debug: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int
    query: str


@router.post("/search", response_model=SearchResponse)
async def search_memories(
    request: SearchRequest,
    session: AsyncSession = Depends(get_db)
):
    """
    Search for relevant memories using hybrid search (OpenMemory HSG-style)
    
    Combines:
    - Vector similarity (embeddings)
    - Token overlap (keywords)
    - Waypoint expansion (graph traversal)
    - Recency scoring
    - Tag matching
    """
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    filters = {
        "debug": request.debug
    }
    
    try:
        results = await hybrid_search(
            session=session,
            query=request.query,
            limit=request.limit or 10,
            user_id=request.user_id,
            min_salience=request.min_salience or 0.0,
            filters=filters
        )
        
        # Convert to response format
        search_results = []
        for result in results:
            mem = result["memory"]
            search_results.append(SearchResult(
                id=str(mem.id),
                content=mem.content,
                sector=mem.sector,
                salience=mem.salience,
                score=result["score"],
                tags=mem.tags or [],
                path=result["path"],
                debug=result.get("debug")
            ))
        
        return SearchResponse(
            results=search_results,
            total=len(search_results),
            query=request.query
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

