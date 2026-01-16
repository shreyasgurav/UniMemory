"""
Consumer API endpoints for app.unimemory.app
These endpoints are for end-users to view their sources and memories.
NO API keys - uses Firebase auth only.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import os
import jwt
import time
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_, and_
from pydantic import BaseModel, Field
import logging

from app.db.database import get_db
from app.db.models import Source, Memory, MemorySource, User, ProcessingLog, MCPActivity, Waypoint, ActivityLog
from app.api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Security scheme for consumer session tokens
consumer_security = HTTPBearer(auto_error=False)

# In-memory user cache for verified tokens (avoids DB lookup on every request)
_user_cache: Dict[str, tuple] = {}  # token_hash -> (user_data, timestamp)
_USER_CACHE_TTL = 300  # 5 minutes
_USER_CACHE_MAX_SIZE = 200


def _get_token_hash(token: str) -> str:
    """Get short hash of token for cache key"""
    import hashlib
    return hashlib.md5(token.encode()).hexdigest()[:16]


def _get_cached_user(token: str) -> Optional[dict]:
    """Get cached user data if not expired"""
    token_hash = _get_token_hash(token)
    if token_hash in _user_cache:
        user_data, timestamp = _user_cache[token_hash]
        if time.time() - timestamp < _USER_CACHE_TTL:
            return user_data
        else:
            del _user_cache[token_hash]
    return None


def _cache_user(token: str, user_data: dict):
    """Cache user data"""
    token_hash = _get_token_hash(token)
    _user_cache[token_hash] = (user_data, time.time())
    
    # Evict old entries if over limit
    if len(_user_cache) > _USER_CACHE_MAX_SIZE:
        sorted_keys = sorted(_user_cache.keys(), 
                           key=lambda k: _user_cache[k][1])
        for k in sorted_keys[:_USER_CACHE_MAX_SIZE // 10]:
            del _user_cache[k]


async def verify_consumer_session_token(
    credentials: HTTPAuthorizationCredentials = Depends(consumer_security),
    session: AsyncSession = Depends(get_db)
) -> User:
    """
    Verify consumer session token (JWT) from Chrome extension.
    Uses caching to avoid DB lookup on every request.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )
    
    token = credentials.credentials
    secret_key = os.environ.get("JWT_SECRET_KEY", "unimemory-consumer-secret-key")
    
    try:
        # Decode and verify JWT first (fast, no DB)
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        
        # Check token type
        if payload.get("type") != "consumer_session":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # Check cache first (avoids DB lookup)
        cached = _get_cached_user(token)
        if cached:
            # Return cached user as a simple object
            user = User()
            user.id = cached["id"]
            user.email = cached.get("email")
            user.display_name = cached.get("display_name")
            user.is_active = cached.get("is_active", True)
            return user
        
        # Cache miss - fetch from database
        result = await session.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated"
            )
        
        # Cache user data for future requests
        _cache_user(token, {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "is_active": user.is_active
        })
        
        return user
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed"
        )


# ============ Activity Logging Helper ============

async def log_activity(
    session: AsyncSession,
    user_id: str,
    action: str,
    source: str,
    agent: Optional[str] = None,
    memory_id: Optional[str] = None,
    source_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    description: Optional[str] = None
):
    """
    Log an activity event to the activity_logs table.
    
    Actions: memory_created, memory_deleted, memory_searched, source_created, 
             source_deleted, mcp_search, mcp_add_memory, dashboard_search, etc.
    Sources: extension, mcp, dashboard, api
    """
    try:
        activity = ActivityLog(
            user_id=user_id,
            action=action,
            source=source,
            agent=agent,
            memory_id=memory_id,
            source_id=source_id,
            details=details or {},
            description=description
        )
        session.add(activity)
        await session.commit()
    except Exception as e:
        logger.error(f"Failed to log activity: {e}")
        # Don't fail the main operation if logging fails
        await session.rollback()


# ============ Response Models ============

class SourceResponse(BaseModel):
    id: str
    type: str
    raw_content: dict
    summary: Optional[str] = None
    source_metadata: Optional[dict] = None
    end_user_id: Optional[str] = None
    owner_id: str
    created_at: str
    updated_at: Optional[str] = None
    memory_count: Optional[int] = 0

    class Config:
        from_attributes = True


class MemoryResponse(BaseModel):
    id: str
    content: str
    sector: Optional[str]
    salience: float
    tags: List[str]
    user_id: str
    is_active: bool
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class SourceWithMemoriesResponse(SourceResponse):
    memories: List[MemoryResponse]
    memory_count: int


class MemoryWithSourcesResponse(MemoryResponse):
    sources: List[SourceResponse]


class CountResponse(BaseModel):
    total: int


class UserSettingsResponse(BaseModel):
    ingest_enabled: bool


class TagsUpdateRequest(BaseModel):
    tags: List[str]


# ============ Sources Endpoints ============
# NOTE: Atomic memory creation is handled by POST /memories (unified auth)

@router.get("/consumer/sources", response_model=List[SourceResponse])
async def get_sources(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get all sources for the current user, ordered by created_at desc"""
    # Subquery to count memories per source
    memory_count_subq = (
        select(
            MemorySource.source_id,
            func.count(MemorySource.memory_id).label('memory_count')
        )
        .join(Memory, Memory.id == MemorySource.memory_id)
        .where(Memory.is_active == True)
        .group_by(MemorySource.source_id)
        .subquery()
    )
    
    # Main query with left join to get memory counts
    result = await session.execute(
        select(Source, memory_count_subq.c.memory_count)
        .outerjoin(memory_count_subq, Source.id == memory_count_subq.c.source_id)
        .where(Source.owner_id == str(user.id))
        .order_by(Source.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    sources_with_counts = result.all()
    
    return [
        SourceResponse(
            id=str(s.id),
            type=s.type,
            raw_content=s.raw_content or {},
            summary=s.summary,
            source_metadata=s.source_metadata,
            end_user_id=s.end_user_id,
            owner_id=str(s.owner_id),
            created_at=str(s.created_at),
            updated_at=str(s.updated_at) if s.updated_at else None,
            memory_count=count or 0
        ) for s, count in sources_with_counts
    ]


@router.get("/consumer/sources/count", response_model=CountResponse)
async def get_sources_count(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get total count of sources for the current user"""
    result = await session.execute(
        select(func.count(Source.id))
        .where(Source.owner_id == str(user.id))
    )
    total = result.scalar() or 0
    return CountResponse(total=total)


@router.get("/consumer/sources/{source_id}", response_model=SourceWithMemoriesResponse)
async def get_source(
    source_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get a single source with linked memories"""
    result = await session.execute(
        select(Source)
        .where(Source.id == source_id)
        .where(Source.owner_id == str(user.id))
    )
    source = result.scalar_one_or_none()
    
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    # Get linked memories
    memories_result = await session.execute(
        select(Memory)
        .join(MemorySource, MemorySource.memory_id == Memory.id)
        .where(MemorySource.source_id == source_id)
        .where(Memory.is_active == True)
    )
    memories = memories_result.scalars().all()
    
    return SourceWithMemoriesResponse(
        id=str(source.id),
        type=source.type,
        raw_content=source.raw_content or {},
        summary=source.summary,
        source_metadata=source.source_metadata,
        end_user_id=source.end_user_id,
        owner_id=str(source.owner_id),
        created_at=str(source.created_at),
        updated_at=str(source.updated_at) if source.updated_at else None,
        memories=[
            MemoryResponse(
                id=str(m.id),
                content=m.content,
                sector=m.sector,
                salience=m.salience or 0.5,
                tags=m.tags or [],
                user_id=m.user_id or "",
                is_active=m.is_active,
                created_at=str(m.created_at),
                updated_at=str(m.updated_at) if m.updated_at else None
            ) for m in memories
        ],
        memory_count=len(memories)
    )


# ============ Memories Endpoints ============

@router.get("/consumer/memories", response_model=List[MemoryResponse])
async def get_memories(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get all memories for the current user"""
    result = await session.execute(
        select(Memory)
        .where(Memory.owner_id == str(user.id))
        .where(Memory.is_active == True)
        .order_by(Memory.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    memories = result.scalars().all()
    return [
        MemoryResponse(
            id=str(m.id),
            content=m.content,
            sector=m.sector,
            salience=m.salience or 0.5,
            tags=m.tags or [],
            user_id=m.user_id or "",
            is_active=m.is_active,
            created_at=str(m.created_at),
            updated_at=str(m.updated_at) if m.updated_at else None
        ) for m in memories
    ]


@router.get("/consumer/memories/count", response_model=CountResponse)
async def get_memories_count(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get total count of memories for the current user"""
    result = await session.execute(
        select(func.count(Memory.id))
        .where(Memory.owner_id == str(user.id))
        .where(Memory.is_active == True)
    )
    total = result.scalar() or 0
    return CountResponse(total=total)


@router.get("/consumer/memories/{memory_id}", response_model=MemoryWithSourcesResponse)
async def get_memory(
    memory_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get a single memory with linked sources"""
    result = await session.execute(
        select(Memory)
        .where(Memory.id == memory_id)
        .where(Memory.owner_id == str(user.id))
        .where(Memory.is_active == True)
    )
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    # Get linked sources
    sources_result = await session.execute(
        select(Source)
        .join(MemorySource, MemorySource.source_id == Source.id)
        .where(MemorySource.memory_id == memory_id)
    )
    sources = sources_result.scalars().all()
    
    return MemoryWithSourcesResponse(
        id=str(memory.id),
        content=memory.content,
        sector=memory.sector,
        salience=memory.salience or 0.5,
        tags=memory.tags or [],
        user_id=memory.user_id or "",
        is_active=memory.is_active,
        created_at=str(memory.created_at),
        updated_at=str(memory.updated_at) if memory.updated_at else None,
        sources=[
            SourceResponse(
                id=str(s.id),
                type=s.type,
                raw_content=s.raw_content or {},
                summary=s.summary,
                source_metadata=s.source_metadata,
                end_user_id=s.end_user_id,
                owner_id=str(s.owner_id),
                created_at=str(s.created_at),
                updated_at=str(s.updated_at) if s.updated_at else None
            ) for s in sources
        ]
    )


@router.patch("/consumer/memories/{memory_id}/tags", response_model=MemoryResponse)
async def update_memory_tags(
    memory_id: str,
    request: TagsUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Update tags for a memory (PATCH only - no content changes allowed)"""
    result = await session.execute(
        select(Memory)
        .where(Memory.id == memory_id)
        .where(Memory.owner_id == str(user.id))
        .where(Memory.is_active == True)
    )
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    memory.tags = request.tags
    await session.commit()
    await session.refresh(memory)
    
    return MemoryResponse(
        id=str(memory.id),
        content=memory.content,
        sector=memory.sector,
        salience=memory.salience or 0.5,
        tags=memory.tags or [],
        user_id=memory.user_id or "",
        is_active=memory.is_active,
        created_at=str(memory.created_at),
        updated_at=str(memory.updated_at) if memory.updated_at else None
    )


@router.delete("/consumer/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Soft delete a memory (set is_active = false)"""
    result = await session.execute(
        select(Memory)
        .where(Memory.id == memory_id)
        .where(Memory.owner_id == str(user.id))
        .where(Memory.is_active == True)
    )
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    # Log the deletion activity BEFORE deleting (preserve content info)
    content_preview = memory.content[:100] if memory.content else ""
    await log_activity(
        session=session,
        user_id=str(user.id),
        action="memory_deleted",
        source="unimemory",
        agent="UniMemory",
        memory_id=memory_id,
        details={
            "content_preview": content_preview,
            "sector": memory.sector,
            "salience": memory.salience
        },
        description=f"Deleted memory: {content_preview}..."
    )
    
    memory.is_active = False
    await session.commit()
    
    return {"success": True}


@router.delete("/consumer/sources/{source_id}")
async def delete_source(
    source_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Delete a source and all its associated memories"""
    result = await session.execute(
        select(Source)
        .where(Source.id == source_id)
        .where(Source.owner_id == str(user.id))
    )
    source = result.scalar_one_or_none()
    
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    # Count memories to be deleted
    mem_count_result = await session.execute(
        select(func.count(MemorySource.memory_id))
        .where(MemorySource.source_id == source_id)
    )
    mem_count = mem_count_result.scalar() or 0
    
    # Log the deletion activity BEFORE deleting
    metadata = source.source_metadata or {}
    await log_activity(
        session=session,
        user_id=str(user.id),
        action="source_deleted",
        source="unimemory",
        agent="UniMemory",
        source_id=source_id,
        details={
            "title": source.title or metadata.get("title"),
            "url": metadata.get("url"),
            "type": source.type,
            "memory_count": mem_count,
            "source_app": source.source_app
        },
        description=f"Deleted source: {source.title or 'Untitled'} ({mem_count} memories)"
    )
    
    # Soft delete all memories associated with this source
    await session.execute(
        select(Memory)
        .where(Memory.id.in_(
            select(MemorySource.memory_id)
            .where(MemorySource.source_id == source_id)
        ))
        .where(Memory.owner_id == str(user.id))
    )
    
    # Update memories to set is_active = False
    from sqlalchemy import update as sql_update
    await session.execute(
        sql_update(Memory)
        .where(Memory.id.in_(
            select(MemorySource.memory_id)
            .where(MemorySource.source_id == source_id)
        ))
        .where(Memory.owner_id == str(user.id))
        .values(is_active=False)
    )
    
    # Delete the source
    await session.delete(source)
    await session.commit()
    
    return {"success": True}


# ============ Settings Endpoints ============

@router.get("/consumer/settings", response_model=UserSettingsResponse)
async def get_settings(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get user settings"""
    settings = user.settings or {}
    return UserSettingsResponse(
        ingest_enabled=settings.get("ingest_enabled", True)
    )


@router.patch("/consumer/settings", response_model=UserSettingsResponse)
async def update_settings(
    request: UserSettingsResponse,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Update user settings"""
    settings = user.settings or {}
    settings["ingest_enabled"] = request.ingest_enabled
    user.settings = settings
    await session.commit()
    await session.refresh(user)
    
    return UserSettingsResponse(
        ingest_enabled=user.settings.get("ingest_enabled", True)
    )


# ============ Search Endpoints ============

class ConsumerSearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 5


class ConsumerSearchResult(BaseModel):
    id: str
    content: str
    tags: List[str]
    salience: float
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class ConsumerSearchResponse(BaseModel):
    results: List[ConsumerSearchResult]
    total: int
    query: str


# Search result cache for consumer queries
_search_cache: Dict[str, tuple] = {}
_SEARCH_CACHE_TTL = 120  # 2 minutes
_SEARCH_CACHE_MAX_SIZE = 100


def _get_search_cache_key(owner_id: str, query: str, limit: int) -> str:
    """Generate cache key for search results"""
    import hashlib
    key_data = f"{owner_id}:{query.strip().lower()[:100]}:{limit}"
    return hashlib.md5(key_data.encode()).hexdigest()[:16]


@router.post("/consumer/search", response_model=ConsumerSearchResponse)
async def consumer_search(
    request: ConsumerSearchRequest,
    user: User = Depends(verify_consumer_session_token),
    session: AsyncSession = Depends(get_db)
):
    """
    Search for relevant memories (Consumer API)
    
    Used by browser extension to retrieve memories for context injection.
    Returns memories matching the query, ranked by relevance.
    Uses caching to speed up repeated queries.
    """
    from app.core.search import hybrid_search
    
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    owner_id = str(user.id)
    limit = request.limit or 5
    
    # Check search cache first
    cache_key = _get_search_cache_key(owner_id, request.query, limit)
    if cache_key in _search_cache:
        cached_results, timestamp = _search_cache[cache_key]
        if time.time() - timestamp < _SEARCH_CACHE_TTL:
            logger.debug(f"Search cache hit for query: {request.query[:30]}...")
            return ConsumerSearchResponse(
                results=cached_results,
                total=len(cached_results),
                query=request.query
            )
        else:
            del _search_cache[cache_key]
    
    try:
        results = await hybrid_search(
            session=session,
            query=request.query,
            limit=limit,
            user_id=None,
            min_salience=0.0,
            filters={"owner_id": owner_id, "debug": False}
        )
        
        search_results = []
        for result in results:
            mem = result["memory"]
            search_results.append(ConsumerSearchResult(
                id=str(mem.id),
                content=mem.content,
                tags=mem.tags or [],
                salience=mem.salience,
                created_at=mem.created_at.isoformat() if mem.created_at else None
            ))
        
        # Cache the results
        _search_cache[cache_key] = (search_results, time.time())
        
        # Evict old cache entries if over limit
        if len(_search_cache) > _SEARCH_CACHE_MAX_SIZE:
            sorted_keys = sorted(_search_cache.keys(), 
                               key=lambda k: _search_cache[k][1])
            for k in sorted_keys[:_SEARCH_CACHE_MAX_SIZE // 10]:
                del _search_cache[k]
        
        # Log search activity
        try:
            await log_activity(
                session=session,
                user_id=owner_id,
                action="memory_searched",
                source="extension",
                agent="Chrome Extension",
                details={
                    "query": request.query,
                    "result_count": len(search_results),
                    "limit": limit
                },
                description=f"Searched: '{request.query}' ({len(search_results)} results)"
            )
        except Exception as e:
            logger.error(f"Failed to log search activity: {e}")
        
        return ConsumerSearchResponse(
            results=search_results,
            total=len(search_results),
            query=request.query
        )
        
    except Exception as e:
        logger.error(f"Consumer search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# ============ Memory Graph Endpoints ============

class GraphMemory(BaseModel):
    id: str
    content: str
    sector: Optional[str]
    salience: float
    created_at: str

class GraphSource(BaseModel):
    id: str
    type: str
    title: Optional[str]
    summary: Optional[str]
    created_at: str
    memory_count: int
    memories: List[GraphMemory]

class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float
    edge_type: str  # "doc-memory", "memory-memory", "doc-doc"

class MemoryGraphResponse(BaseModel):
    sources: List[GraphSource]
    atomic_memories: List[GraphMemory]  # Standalone memories not linked to any document
    edges: List[GraphEdge]
    stats: dict


@router.get("/consumer/graph", response_model=MemoryGraphResponse)
async def get_memory_graph(
    limit: int = 50,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Get memory graph data for visualization.
    Returns sources (documents) with their memories, plus waypoint edges.
    Structure mirrors supermemory's DocumentWithMemories approach.
    """
    owner_id = str(user.id)
    
    # Fetch ALL active memories for the user (including atomic memories without sources)
    all_memories_result = await session.execute(
        select(Memory)
        .where(Memory.owner_id == owner_id, Memory.is_active == True)
        .order_by(Memory.created_at.desc())
        .limit(limit * 5)  # Get more memories since we'll cluster them
    )
    all_memories = all_memories_result.scalars().all()
    
    if not all_memories:
        return MemoryGraphResponse(sources=[], edges=[], stats={"sources": 0, "memories": 0, "connections": 0})
    
    all_memory_ids = [str(m.id) for m in all_memories]
    memories = {str(m.id): m for m in all_memories}
    
    # Fetch sources
    sources_result = await session.execute(
        select(Source)
        .where(Source.owner_id == owner_id)
        .order_by(Source.created_at.desc())
        .limit(limit)
    )
    sources = sources_result.scalars().all()
    source_ids = [str(s.id) for s in sources]
    
    # Fetch memory_sources links
    memory_sources_result = await session.execute(
        select(MemorySource)
        .where(MemorySource.source_id.in_(source_ids))
    )
    memory_sources = memory_sources_result.scalars().all()
    
    # Build source -> memories mapping
    source_memories_map: Dict[str, List] = {sid: [] for sid in source_ids}
    for ms in memory_sources:
        sid = str(ms.source_id)
        mid = str(ms.memory_id)
        if mid in memories and sid in source_memories_map:
            source_memories_map[sid].append(memories[mid])
    
    # Fetch waypoints between ALL memories
    waypoints_result = await session.execute(
        select(Waypoint)
        .where(
            Waypoint.src_id.in_(all_memory_ids),
            Waypoint.dst_id.in_(all_memory_ids)
        )
    )
    waypoints = waypoints_result.scalars().all()
    
    # Track which memories are linked to sources
    linked_memory_ids = set()
    for ms in memory_sources:
        linked_memory_ids.add(str(ms.memory_id))
    
    # Build graph sources
    graph_sources = []
    total_memories = 0
    
    # 1. Add sources with their memories
    for source in sources:
        sid = str(source.id)
        source_mems = source_memories_map.get(sid, [])
        total_memories += len(source_mems)
        
        graph_sources.append(GraphSource(
            id=sid,
            type=source.type or "unknown",
            title=source.source_metadata.get("title") if source.source_metadata else None,
            summary=source.summary[:300] if source.summary else None,
            created_at=source.created_at.isoformat() if source.created_at else "",
            memory_count=len(source_mems),
            memories=[
                GraphMemory(
                    id=str(m.id),
                    content=m.content[:200] if m.content else "",
                    sector=m.sector,
                    salience=m.salience or 0.5,
                    created_at=m.created_at.isoformat() if m.created_at else ""
                )
                for m in source_mems[:20]  # Limit memories per source for performance
            ]
        ))
    
    # 2. Get atomic memories (memories without sources) as separate list
    atomic_memories = [m for m in all_memories if str(m.id) not in linked_memory_ids]
    atomic_graph_memories = [
        GraphMemory(
            id=str(m.id),
            content=m.content[:200] if m.content else "",
            sector=m.sector,
            salience=m.salience or 0.5,
            created_at=m.created_at.isoformat() if m.created_at else ""
        )
        for m in atomic_memories[:100]  # Show up to 100 atomic memories
    ]
    total_memories += len(atomic_graph_memories)
    
    # Build edges
    edges = []
    
    # 1. Doc-memory edges (source to each of its memories)
    for source in graph_sources:
        for mem in source.memories:
            edges.append(GraphEdge(
                source=source.id,
                target=mem.id,
                weight=1.0,
                edge_type="doc-memory"
            ))
    
    # 2. Memory-memory edges (waypoints) - these will connect similar atomic memories
    for w in waypoints:
        edges.append(GraphEdge(
            source=str(w.src_id),
            target=str(w.dst_id),
            weight=w.weight or 0.5,
            edge_type="memory-memory"
        ))
    
    return MemoryGraphResponse(
        sources=graph_sources,
        atomic_memories=atomic_graph_memories,
        edges=edges,
        stats={
            "sources": len(graph_sources),
            "memories": total_memories,
            "atomic": len(atomic_graph_memories),
            "connections": len(edges)
        }
    )


# ============ Chat Context Endpoints ============

class ChatContextRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(10, ge=1, le=50)


class ChatMemoryItem(BaseModel):
    id: str
    content: str
    salience: float
    sector: Optional[str]


class ChatSourceItem(BaseModel):
    id: str
    type: str
    summary: Optional[str]
    created_at: str


class ChatContextResponse(BaseModel):
    memories: List[ChatMemoryItem]
    sources: List[ChatSourceItem]


@router.post("/consumer/chat/context", response_model=ChatContextResponse)
async def get_chat_context(
    request: ChatContextRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Retrieve relevant memories and sources for chat context.
    Uses hybrid search over memories.embedding and sources.summary_embedding.
    """
    try:
        embedding_service = get_embedding_service()
        query_embedding, _ = await embedding_service.embed(request.query)
    except Exception as e:
        logger.error(f"Failed to generate query embedding: {e}")
        return ChatContextResponse(memories=[], sources=[])
    
    # Search memories by embedding similarity
    memories_result = await session.execute(
        select(Memory)
        .where(Memory.owner_id == str(user.id))
        .where(Memory.is_active == True)
        .where(Memory.embedding.isnot(None))
        .order_by(Memory.salience.desc())
        .limit(request.limit)
    )
    memories = memories_result.scalars().all()
    
    # Search sources by summary embedding similarity
    sources_result = await session.execute(
        select(Source)
        .where(Source.owner_id == str(user.id))
        .where(Source.summary_embedding.isnot(None))
        .order_by(Source.created_at.desc())
        .limit(request.limit)
    )
    sources = sources_result.scalars().all()
    
    return ChatContextResponse(
        memories=[
            ChatMemoryItem(
                id=str(m.id),
                content=m.content,
                salience=m.salience or 0.5,
                sector=m.sector
            ) for m in memories
        ],
        sources=[
            ChatSourceItem(
                id=str(s.id),
                type=s.type,
                summary=s.summary,
                created_at=str(s.created_at)
            ) for s in sources
        ]
    )


# ============ Activity Feed Endpoints ============

class ActivityEvent(BaseModel):
    id: str
    type: str  # "ingest", "mcp_search", "mcp_context", "mcp_source", "source_created"
    source: Optional[str]  # "chrome_extension", "api", "mcp"
    agent: Optional[str]  # "cursor", "claude", etc.
    memory_count: Optional[int]
    details: Optional[str]
    tool_name: Optional[str]  # For MCP: search_memory, get_memory_context, get_source
    created_at: str
    # Source metadata for better display
    title: Optional[str] = None  # Chat/page title
    url: Optional[str] = None  # Source URL
    platform: Optional[str] = None  # "ChatGPT", "Claude", etc.


class ActivityFeedResponse(BaseModel):
    events: List[ActivityEvent]
    total: int


@router.get("/consumer/activity", response_model=ActivityFeedResponse)
async def get_activity_feed(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Get comprehensive activity feed showing all user actions:
    - Source/memory creation (extension, API, MCP)
    - Deletions (memories, sources)
    - Searches (MCP, dashboard)
    - MCP tool calls
    
    Primary source: activity_logs table
    Fallback: sources, mcp_activity tables for legacy data
    """
    events = []
    seen_ids = set()  # Track seen event IDs to avoid duplicates
    
    # 1. Get activity logs (primary source for new events)
    try:
        activity_result = await session.execute(
            select(ActivityLog)
            .where(ActivityLog.user_id == str(user.id))
            .order_by(ActivityLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        activity_logs = activity_result.scalars().all()
        
        for log in activity_logs:
            details_dict = log.details or {}
            events.append(ActivityEvent(
                id=str(log.id),
                type=log.action,
                source=log.source,
                agent=log.agent,
                memory_count=details_dict.get("memory_count"),
                details=log.description or details_dict.get("content_preview", ""),
                tool_name=details_dict.get("tool_name"),
                created_at=str(log.created_at),
                title=details_dict.get("title"),
                url=details_dict.get("url"),
                platform=details_dict.get("platform") or log.agent
            ))
            seen_ids.add(str(log.id))
            # Also track related entity IDs
            if log.source_id:
                seen_ids.add(str(log.source_id))
            if log.memory_id:
                seen_ids.add(str(log.memory_id))
    except Exception as e:
        logger.warning(f"Failed to fetch activity logs (table may not exist yet): {e}")
    
    # 2. Get recent sources (legacy ingestion events)
    sources_result = await session.execute(
        select(Source)
        .where(Source.owner_id == str(user.id))
        .order_by(Source.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    sources = sources_result.scalars().all()
    
    for source in sources:
        if str(source.id) in seen_ids:
            continue  # Skip if already in activity_logs
            
        # Count linked memories
        mem_count_result = await session.execute(
            select(func.count(MemorySource.memory_id))
            .where(MemorySource.source_id == str(source.id))
        )
        mem_count = mem_count_result.scalar() or 0
        
        # Extract metadata for display
        metadata = source.source_metadata or {}
        platform = metadata.get("platform") or source.source_app or "unknown"
        url = metadata.get("url")
        title = source.title or metadata.get("title")
        
        events.append(ActivityEvent(
            id=str(source.id),
            type="source_created",
            source=source.source_app or "extension",
            agent=None,
            memory_count=mem_count,
            details=f"Saved {mem_count} memories",
            tool_name=None,
            created_at=str(source.created_at),
            title=title,
            url=url,
            platform=platform
        ))
        seen_ids.add(str(source.id))
    
    # 3. Get MCP activity (searches, memory operations via AI agents)
    mcp_result = await session.execute(
        select(MCPActivity)
        .where(MCPActivity.user_id == str(user.id))
        .order_by(MCPActivity.created_at.desc())
        .limit(limit)
    )
    mcp_activities = mcp_result.scalars().all()
    
    for mcp in mcp_activities:
        if str(mcp.id) in seen_ids:
            continue
            
        # Determine activity type based on tool
        if mcp.tool_name == "search_memory":
            activity_type = "memory_searched"
            query = mcp.tool_args.get("query", "")
            details = f"Searched: '{query}' ({mcp.result_count} results)"
        elif mcp.tool_name == "get_memory_context":
            activity_type = "memory_viewed"
            details = "Retrieved memory context"
        elif mcp.tool_name == "get_source":
            activity_type = "source_viewed"
            details = "Retrieved source document"
        elif mcp.tool_name == "add_memory":
            activity_type = "memory_created"
            details = mcp.tool_args.get("content", "")[:100] + "..." if mcp.tool_args.get("content") else "Added memory"
        else:
            activity_type = "mcp_call"
            details = f"Called {mcp.tool_name}"
        
        # Map client types to readable names
        agent_map = {
            "cursor": "Cursor",
            "claude": "Claude Desktop",
            "vscode": "VS Code",
            "windsurf": "Windsurf",
            "cline": "Cline",
            "gemini": "Gemini CLI"
        }
        agent_name = agent_map.get(mcp.client_type, mcp.client_type)
        
        events.append(ActivityEvent(
            id=str(mcp.id),
            type=activity_type,
            source="mcp",
            agent=mcp.client_type,
            memory_count=mcp.result_count if mcp.tool_name == "search_memory" else None,
            details=details,
            tool_name=mcp.tool_name,
            created_at=str(mcp.created_at),
            platform=agent_name
        ))
        seen_ids.add(str(mcp.id))
    
    # Sort all events by created_at (newest first)
    events.sort(key=lambda x: x.created_at, reverse=True)
    
    return ActivityFeedResponse(
        events=events[:limit],
        total=len(events)
    )


# ============ Connectors Endpoints ============

class ConnectorItem(BaseModel):
    id: str
    name: str
    type: str  # "extension", "agent", "data_source"
    connected: bool
    installed: bool
    description: Optional[str]


class ConnectorsResponse(BaseModel):
    extensions: List[ConnectorItem]
    agents: List[ConnectorItem]
    data_sources: List[ConnectorItem]


@router.get("/consumer/connectors", response_model=ConnectorsResponse)
async def get_connectors(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    List available connectors (extensions, agents, data sources).
    Shows connection status based on recent source activity.
    """
    # Check which sources have been used recently
    sources_result = await session.execute(
        select(Source.source_app)
        .where(Source.owner_id == str(user.id))
        .distinct()
    )
    active_sources = {row[0] for row in sources_result.all() if row[0]}
    
    # Define available connectors
    extensions = [
        ConnectorItem(
            id="chrome",
            name="Chrome Extension",
            type="extension",
            connected="chrome_extension" in active_sources,
            installed="chrome_extension" in active_sources,
            description="Capture ChatGPT conversations and web content"
        ),
        ConnectorItem(
            id="raycast",
            name="Raycast Extension",
            type="extension",
            connected="raycast" in active_sources,
            installed="raycast" in active_sources,
            description="Quick capture from anywhere on macOS"
        )
    ]
    
    agents = [
        ConnectorItem(
            id="cursor",
            name="Cursor",
            type="agent",
            connected="cursor" in active_sources,
            installed=False,
            description="AI code editor with memory context"
        ),
        ConnectorItem(
            id="claude",
            name="Claude Desktop",
            type="agent",
            connected="claude" in active_sources,
            installed=False,
            description="Claude with your personal memory"
        )
    ]
    
    data_sources = [
        ConnectorItem(
            id="notion",
            name="Notion",
            type="data_source",
            connected=False,
            installed=False,
            description="Sync your Notion workspace"
        ),
        ConnectorItem(
            id="google_drive",
            name="Google Drive",
            type="data_source",
            connected=False,
            installed=False,
            description="Import documents from Drive"
        )
    ]
    
    return ConnectorsResponse(
        extensions=extensions,
        agents=agents,
        data_sources=data_sources
    )


# ============ Consumer Session Token (for Chrome Extension) ============

class ConsumerSessionResponse(BaseModel):
    authenticated: bool
    session_token: Optional[str] = None
    expires_in: Optional[int] = None
    user: Optional[Dict[str, Any]] = None


@router.get("/consumer/auth/session", response_model=ConsumerSessionResponse)
async def get_consumer_session(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a consumer session token for Chrome extension.
    
    The extension calls this endpoint with the Firebase ID token.
    Backend returns a short-lived consumer session token that the extension
    stores locally and uses for subsequent API calls.
    
    This keeps Firebase tokens out of the extension and provides
    a clean separation between auth and API access.
    """
    import jwt
    import secrets
    from datetime import timedelta
    
    # Generate a short-lived consumer session token (1 hour)
    expires_in = 3600  # 1 hour in seconds
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    
    # Create JWT payload
    payload = {
        "sub": str(user.id),
        "firebase_uid": user.firebase_uid,
        "email": user.email,
        "type": "consumer_session",
        "iat": datetime.utcnow(),
        "exp": expires_at
    }
    
    # Sign with app secret (use settings.SECRET_KEY or generate one)
    secret_key = os.environ.get("JWT_SECRET_KEY", "unimemory-consumer-secret-key")
    session_token = jwt.encode(payload, secret_key, algorithm="HS256")
    
    return ConsumerSessionResponse(
        authenticated=True,
        session_token=session_token,
        expires_in=expires_in,
        user={
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url
        }
    )


async def verify_consumer_session_token(token: str) -> dict:
    """
    Verify a consumer session token and return the payload.
    Used by ingest endpoints when called from the extension.
    """
    import jwt
    
    secret_key = os.environ.get("JWT_SECRET_KEY", "unimemory-consumer-secret-key")
    
    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        if payload.get("type") != "consumer_session":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")
