"""
Search endpoints - Core Public API
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime

from app.db.database import get_db
from app.core.search import hybrid_search
from app.db.models import Memory
from app.core.auth import validate_api_key
from app.config import settings

router = APIRouter()


# =============================================================================
# PUBLIC API MODELS (stable, no internal details)
# =============================================================================

class SearchRequest(BaseModel):
    """Public search request"""
    query: str
    limit: Optional[int] = 10
    user_id: Optional[str] = None
    min_salience: Optional[float] = 0.0
    project_id: Optional[str] = None  # Filter search to a specific project
    # EVAL-ONLY knobs. Omitted by all production/SDK callers, so defaults
    # preserve the exact production behavior. Used by eval/ ablation harness.
    # Rejected with 403 unless the server runs with EVAL_MODE=true.
    scoring_mode: Optional[str] = None  # None/"hybrid" (prod) | "lexical" | "cosine"
    reinforce: Optional[bool] = None    # None -> True (prod); False in eval


class PublicSearchResult(BaseModel):
    """Public search result (no internal scoring details)"""
    id: str
    content: str
    tags: List[str]
    salience: float
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Public search response"""
    results: List[PublicSearchResult]
    total: int
    query: str


@router.post("/search", response_model=SearchResponse)
async def search_memories(
    request: SearchRequest,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Search for relevant memories (Core Public API)
    
    Returns memories matching the query, ranked by relevance.
    
    Requires X-API-Key header for authentication.
    Only searches memories owned by the authenticated user.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if request.scoring_mode is not None or request.reinforce is not None:
        if not settings.EVAL_MODE:
            raise HTTPException(status_code=403, detail="Eval overrides disabled")
        if request.scoring_mode not in (None, "hybrid", "lexical", "cosine"):
            raise HTTPException(status_code=400, detail="Invalid scoring_mode")
    
    filters: Dict[str, Any] = {
        "debug": False,  # Never expose debug info in public API
        "owner_id": owner_id
    }
    if request.project_id:
        filters["project_id"] = request.project_id
    
    try:
        results = await hybrid_search(
            session=session,
            query=request.query,
            limit=request.limit or 10,
            user_id=request.user_id,
            min_salience=request.min_salience or 0.0,
            filters=filters,
            scoring_mode=request.scoring_mode or "hybrid",
            reinforce=True if request.reinforce is None else request.reinforce
        )
        
        # Convert to public response format (no internal details)
        search_results = []
        for result in results:
            mem = result["memory"]
            search_results.append(PublicSearchResult(
                id=str(mem.id),
                content=mem.content,
                tags=mem.tags or [],
                salience=mem.salience,
                created_at=mem.created_at
            ))
        
        return SearchResponse(
            results=search_results,
            total=len(search_results),
            query=request.query
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
