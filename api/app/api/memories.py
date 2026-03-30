"""
Memory management endpoints
Production-ready with batch operations and proper validation
"""
from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import load_only
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
import uuid
import logging

from app.db.database import get_db
from app.db.models import Memory, Waypoint, ProcessingLog, User, ActivityLog, Project, Source
from app.core.extractor import get_extractor
from app.core.embeddings import get_embedding_service
from app.core.simhash import compute_simhash, hamming_distance
from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
from app.core.waypoints import create_waypoint_for_memory
from app.core.auth import validate_api_key, get_current_user, get_user_unified
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# =============================================================================
# PUBLIC RESPONSE MODELS
# =============================================================================

class PublicMemoryResponse(BaseModel):
    """Stable public memory response (SDK-safe)"""
    id: str
    content: str
    sector: Optional[str]
    salience: float
    tags: List[str]
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class PublicMemoryListResponse(BaseModel):
    memories: List[PublicMemoryResponse]
    total: int


# Request/Response models with validation
class AddMemoryRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    source_app: Optional[str] = Field(None, max_length=100)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    metadata: Optional[Dict[str, Any]] = None
    
    @validator('content')
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError('Content cannot be empty')
        return v.strip()


class MemoryResponse(BaseModel):
    id: str
    content: str
    sector: Optional[str]
    salience: float
    tags: List[str]
    user_id: str
    api_key_id: Optional[str] = None
    created_at: datetime
    was_deduplicated: bool = False
    extracted_count: int = 0
    
    class Config:
        from_attributes = True


class MemoryListResponse(BaseModel):
    memories: List[MemoryResponse]
    total: int


class MemoryDetailResponse(BaseModel):
    """Detailed memory response with all fields"""
    id: str
    content: str
    sector: Optional[str]
    salience: float
    tags: List[str]
    source_app: Optional[str]
    user_id: str
    api_key_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime]  # Can be None for older records
    last_seen_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class InternalMemoryResponse(MemoryDetailResponse):
    """Full detail response for dashboard (includes internal fields)"""
    pass


class InternalMemoryListResponse(BaseModel):
    memories: List[InternalMemoryResponse]
    total: int


class UpdateMemoryRequest(BaseModel):
    """Request to update a memory (tags, metadata, salience). Content updates are NOT allowed."""
    content: Optional[str] = Field(None, description="Must be None. Content updates are not allowed.")
    salience: Optional[float] = Field(None, ge=0.0, le=1.0)
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    force: bool = Field(False, description="Deprecated. Content updates are no longer supported via PATCH.")


async def create_waypoints_background(
    session_factory,
    memory_ids: List[str],
    embeddings: List[List[float]],
    user_id: str
):
    """Background task to create waypoints (non-blocking)"""
    try:
        async with session_factory() as session:
            for memory_id, embedding in zip(memory_ids, embeddings):
                await create_waypoint_for_memory(
                    session=session,
                    new_memory_id=memory_id,
                    new_embedding=embedding,
                    user_id=user_id
                )
            await session.commit()
    except Exception as e:
        logger.error(f"Background waypoint creation failed: {e}")


# =============================================================================
# CORE PUBLIC API - Stable, documented, SDK-ready
# =============================================================================

class CreateMemoryRequest(BaseModel):
    """Request to store an explicit memory (Core API)"""
    content: str = Field(..., min_length=1, max_length=50000)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)  # Application identifier
    tags: Optional[List[str]] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    project_id: Optional[str] = Field(None, description="Project ID to save this memory to")
    
    @validator('content')
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError('Content cannot be empty')
        return v.strip()


class CreateMemoryResponse(BaseModel):
    """Clean response for core memory creation (no internal details)"""
    id: str
    created_at: datetime


class CoreMemoryResponse(BaseModel):
    """Public memory response (no internal implementation details)"""
    id: str
    content: str
    user_id: str
    tags: List[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class CoreMemoryListResponse(BaseModel):
    """Public list response"""
    memories: List[CoreMemoryResponse]
    total: int


@router.post("/memories", response_model=CreateMemoryResponse)
async def create_memory(
    request: CreateMemoryRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(get_user_unified),
    session: AsyncSession = Depends(get_db)
):
    """
    Store an explicit long-term memory (Core Public API)
    
    This is the stable, public memory storage endpoint.
    Use this when you know exactly what to remember.
    
    For intelligent extraction from raw text/chat, use /ingest/* endpoints.
    
    Authentication: X-API-Key header OR Bearer token (session).
    - B2B developers: Use X-API-Key header
    - Consumer extension: Use Bearer session token
    """
    user, api_key = user_info  # api_key is None for session auth
    owner_id = str(user.id)
    
    content = request.content
    embedding_service = get_embedding_service()
    
    # Step 1: Compute SimHash for deduplication
    simhash = compute_simhash(content)
    
    # Step 2: Check for near-duplicates
    stmt = select(Memory).where(
        Memory.simhash.isnot(None),
        Memory.is_active == True,
        Memory.owner_id == owner_id,
        Memory.user_id == request.user_id
    ).order_by(Memory.salience.desc()).limit(100)
    
    result = await session.execute(stmt)
    existing_memories = result.scalars().all()
    
    for existing in existing_memories:
        if existing.simhash and hamming_distance(simhash, existing.simhash) <= 3:
            # Near-duplicate found - boost salience and return existing
            existing.salience = min(1.0, (existing.salience or 0.5) + 0.1)
            existing.last_seen_at = datetime.utcnow()
            await session.commit()
            return CreateMemoryResponse(
                id=str(existing.id),
                created_at=existing.created_at
            )
    
    # Step 3: Generate embedding
    try:
        embedding, dim = await embedding_service.embed(content)
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to process memory")
    
    # Step 4: Classify sector (lightweight, no LLM)
    sector, _, _ = classify_sector(content)
    
    # Step 5: Create memory
    memory_id = str(uuid.uuid4())
    memory = Memory(
        id=memory_id,
        content=content,
        simhash=simhash,
        sector=sector,
        salience=0.5,  # Default salience
        decay_lambda=get_sector_decay_lambda(sector),
        segment=0,
        tags=request.tags or [],
        extra_metadata=request.metadata or {},
        source_app=request.app_id,
        user_id=request.user_id,
        owner_id=owner_id,
        project_id=request.project_id,  # Project to save memory to
        api_key_id=str(api_key.id) if api_key else None,
        embedding=embedding,
        embedding_model=settings.EMBEDDING_MODEL,
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        last_seen_at=datetime.utcnow()
    )
    
    session.add(memory)
    
    # Step 6: Log activity (single commit with memory)
    try:
        source = "extension" if not api_key else "api"
        agent = request.app_id or "Chrome Extension"
        content_preview = content[:100] if content else ""
        
        activity = ActivityLog(
            user_id=owner_id,
            action="memory_created",
            source=source,
            agent=agent,
            memory_id=memory_id,
            details={
                "content_preview": content_preview,
                "sector": sector,
                "salience": 0.5,
                "tags": request.tags or []
            },
            description=f"Added memory: {content_preview}..."
        )
        session.add(activity)
    except Exception as e:
        logger.error(f"Failed to create activity log: {e}")
    
    await session.commit()
    
    # Step 7: Create waypoints in background
    from app.db.database import AsyncSessionLocal
    background_tasks.add_task(
        create_waypoints_background,
        AsyncSessionLocal,
        [memory_id],
        [embedding],
        request.user_id or "anonymous"
    )
    
    return CreateMemoryResponse(
        id=memory_id,
        created_at=memory.created_at
    )


# =============================================================================
# LEGACY INGESTION API - Will be moved to /ingest/* in Phase 2
# =============================================================================

@router.post("/memories/add", response_model=Dict[str, Any], deprecated=True)
async def add_memory(
    request: AddMemoryRequest,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    DEPRECATED: Use POST /memories for explicit storage or POST /ingest/text for intelligent extraction.
    """
    raise HTTPException(
        status_code=410,
        detail="This endpoint is deprecated and removed. Use POST /ingest/text for extraction or POST /memories for explicit storage."
    )

@router.get("/memories/me", response_model=InternalMemoryListResponse)
async def list_my_memories(
    user_id: Optional[str] = None,
    api_key_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    sector: Optional[str] = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    List memories for the current authenticated user (Firebase auth).
    
    Requires Bearer token in Authorization header.
    Only returns memories owned by the authenticated user.
    """
    owner_id = str(user.id)
    
    # Enforce limits
    limit = min(limit, settings.MAX_SEARCH_LIMIT)
    
    # Always filter by owner_id (multi-tenant isolation)
    stmt = select(Memory).options(
        load_only(
            Memory.id, Memory.content, Memory.sector, Memory.salience,
            Memory.tags, Memory.source_app, Memory.user_id, Memory.api_key_id,
            Memory.created_at, Memory.updated_at, Memory.last_seen_at
        )
    ).where(
        Memory.is_active == True,
        Memory.owner_id == owner_id
    )
    
    if user_id:
        stmt = stmt.where(Memory.user_id == user_id)
    
    if api_key_id:
        stmt = stmt.where(Memory.api_key_id == api_key_id)
    
    if sector:
        stmt = stmt.where(Memory.sector == sector)
    
    stmt = stmt.order_by(Memory.created_at.desc()).offset(offset).limit(limit)
    
    result = await session.execute(stmt)
    memories = result.scalars().all()
    
    # Get total count (also filtered by owner_id)
    count_stmt = select(func.count(Memory.id)).where(
        Memory.is_active == True,
        Memory.owner_id == owner_id
    )
    if user_id:
        count_stmt = count_stmt.where(Memory.user_id == user_id)
    if api_key_id:
        count_stmt = count_stmt.where(Memory.api_key_id == api_key_id)
    if sector:
        count_stmt = count_stmt.where(Memory.sector == sector)
    
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    
    return InternalMemoryListResponse(
        memories=[InternalMemoryResponse(
            id=str(m.id),
            content=m.content,
            sector=m.sector,
            salience=m.salience,
            tags=m.tags or [],
            source_app=m.source_app,
            user_id=m.user_id or "anonymous",
            api_key_id=str(m.api_key_id) if m.api_key_id else None,
            created_at=m.created_at,
            updated_at=m.updated_at,
            last_seen_at=m.last_seen_at
        ) for m in memories],
        total=total
    )



@router.get("/memories", response_model=PublicMemoryListResponse)
async def list_memories(
    user_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    sector: Optional[str] = None,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    List memories with optional filters.
    
    Requires X-API-Key header for authentication.
    Only returns memories owned by the authenticated user.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    # Enforce limits
    limit = min(limit, settings.MAX_SEARCH_LIMIT)
    
    # Always filter by owner_id (multi-tenant isolation)
    stmt = select(Memory).options(
        load_only(
            Memory.id, Memory.content, Memory.sector, Memory.salience,
            Memory.tags, Memory.user_id, Memory.created_at, Memory.updated_at
        )
    ).where(
        Memory.is_active == True,
        Memory.owner_id == owner_id
    )
    
    if user_id:
        stmt = stmt.where(Memory.user_id == user_id)
    
    if sector:
        stmt = stmt.where(Memory.sector == sector)
    
    stmt = stmt.order_by(Memory.created_at.desc()).offset(offset).limit(limit)
    
    result = await session.execute(stmt)
    memories = result.scalars().all()
    
    # Get total count (also filtered by owner_id)
    count_stmt = select(func.count(Memory.id)).where(
        Memory.is_active == True,
        Memory.owner_id == owner_id
    )
    if user_id:
        count_stmt = count_stmt.where(Memory.user_id == user_id)
    if sector:
        count_stmt = count_stmt.where(Memory.sector == sector)
    
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    
    return PublicMemoryListResponse(
        memories=[PublicMemoryResponse(
            id=str(m.id),
            content=m.content,
            sector=m.sector,
            salience=m.salience,
            tags=m.tags or [],
            user_id=m.user_id or "anonymous",
            created_at=m.created_at,
            updated_at=m.updated_at
        ) for m in memories],
        total=total
    )


@router.get("/memories/{memory_id}", response_model=MemoryDetailResponse)
async def get_memory(
    memory_id: str,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Get a single memory by ID.
    
    Requires X-API-Key header for authentication.
    Can only get memories owned by the authenticated user.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    stmt = select(Memory).where(
        Memory.id == memory_id,
        Memory.owner_id == owner_id,
        Memory.is_active == True
    )
    result = await session.execute(stmt)
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    # Update last_seen_at in background (don't block the read)
    import asyncio as _asyncio
    async def _update_last_seen(mid: str):
        try:
            from app.db.database import AsyncSessionLocal
            async with AsyncSessionLocal() as bg_session:
                from sqlalchemy import update as sql_update
                await bg_session.execute(
                    sql_update(Memory).where(Memory.id == mid).values(last_seen_at=datetime.utcnow())
                )
                await bg_session.commit()
        except Exception:
            pass
    _asyncio.create_task(_update_last_seen(memory_id))
    
    return MemoryDetailResponse(
        id=str(memory.id),
        content=memory.content,
        sector=memory.sector,
        salience=memory.salience,
        tags=memory.tags or [],
        source_app=memory.source_app,
        user_id=memory.user_id or "anonymous",
        created_at=memory.created_at,
        updated_at=memory.updated_at,
        last_seen_at=memory.last_seen_at
    )


async def _update_memory_internal(
    session: AsyncSession,
    memory_id: str,
    owner_id: str,
    request: UpdateMemoryRequest
) -> Memory:
    """Unified internal memory update logic"""
    stmt = select(Memory).where(
        Memory.id == memory_id,
        Memory.owner_id == owner_id,
        Memory.is_active == True
    )
    result = await session.execute(stmt)
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    # Strictly disallow content changes in PATCH
    if request.content is not None:
        raise HTTPException(
            status_code=400,
            detail="Content updates are not allowed in PATCH to preserve embedding consistency. DELETE and re-create the memory instead."
        )
    
    if request.salience is not None:
        memory.salience = request.salience
    
    if request.tags is not None:
        memory.tags = request.tags
    
    if request.metadata is not None:
        existing_meta = memory.extra_metadata or {}
        existing_meta.update(request.metadata)
        memory.extra_metadata = existing_meta
    
    memory.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(memory)
    return memory


@router.patch("/memories/{memory_id}", response_model=PublicMemoryResponse)
async def update_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Update a memory (tags, metadata, salience only).
    
    Content updates are NOT allowed. To change content, delete and re-create.
    
    Requires X-API-Key header for authentication.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    return await _update_memory_internal(session, memory_id, owner_id, request)


@router.delete("/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Delete (deactivate) a memory.
    
    Requires X-API-Key header for authentication.
    Can only delete memories owned by the authenticated user.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    stmt = select(Memory).where(
        Memory.id == memory_id,
        Memory.owner_id == owner_id
    )
    result = await session.execute(stmt)
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found or not authorized")
    
    memory.is_active = False
    memory.updated_at = datetime.utcnow()
    
    await session.commit()
    
    return {"success": True, "id": memory_id}


@router.patch("/memories/me/{memory_id}", response_model=InternalMemoryResponse)
async def patch_my_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Update a memory (content, salience, tags, metadata) for authenticated user.
    
    Content updates are NOT allowed. To change content, delete and re-create.
    """
    owner_id = str(user.id)
    
    updated_memory = await _update_memory_internal(
        session=session,
        memory_id=memory_id,
        owner_id=owner_id,
        request=request
    )
    
    return InternalMemoryResponse(
        id=str(updated_memory.id),
        content=updated_memory.content,
        sector=updated_memory.sector,
        salience=updated_memory.salience,
        tags=updated_memory.tags or [],
        source_app=updated_memory.source_app,
        user_id=updated_memory.user_id or "anonymous",
        api_key_id=str(updated_memory.api_key_id) if updated_memory.api_key_id else None,
        created_at=updated_memory.created_at,
        updated_at=updated_memory.updated_at,
        last_seen_at=updated_memory.last_seen_at
    )


@router.delete("/memories/me/{memory_id}")
async def delete_my_memory(
    memory_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Delete (deactivate) a memory for authenticated user.
    """
    owner_id = str(user.id)
    
    stmt = select(Memory).where(
        Memory.id == memory_id,
        Memory.owner_id == owner_id
    )
    result = await session.execute(stmt)
    memory = result.scalar_one_or_none()
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found or not authorized")
    
    memory.is_active = False
    memory.updated_at = datetime.utcnow()
    
    await session.commit()
    
    return {"success": True, "id": memory_id}


# =============================================================================
# PROJECT ENDPOINTS (accessible via API key + Bearer token for MCP)
# =============================================================================

@router.get("/projects")
async def list_projects(
    user_info: tuple = Depends(get_user_unified),
    session: AsyncSession = Depends(get_db)
):
    """
    List all projects for the authenticated user.
    
    Works with both X-API-Key and Bearer token authentication.
    Used by MCP tools (get_projects) and standalone MCP clients.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    # Get projects with memory and source counts
    memory_count_subq = (
        select(
            Memory.project_id,
            func.count(Memory.id).label('memory_count')
        )
        .where(Memory.is_active == True, Memory.owner_id == owner_id)
        .group_by(Memory.project_id)
        .subquery()
    )
    
    source_count_subq = (
        select(
            Source.project_id,
            func.count(Source.id).label('source_count')
        )
        .where(Source.owner_id == owner_id)
        .group_by(Source.project_id)
        .subquery()
    )
    
    result = await session.execute(
        select(Project, memory_count_subq.c.memory_count, source_count_subq.c.source_count)
        .outerjoin(memory_count_subq, Project.id == memory_count_subq.c.project_id)
        .outerjoin(source_count_subq, Project.id == source_count_subq.c.project_id)
        .where(Project.owner_id == owner_id)
        .order_by(Project.is_default.desc(), Project.is_pinned.desc(), Project.updated_at.desc())
    )
    projects = result.all()
    
    return {
        "projects": [
            {
                "id": str(p.id),
                "name": p.name,
                "slug": p.slug,
                "description": p.description,
                "icon": p.icon or "📁",
                "status": p.status or "active",
                "status_note": p.status_note,
                "is_default": p.is_default or False,
                "is_pinned": p.is_pinned or False,
                "memory_count": mc or 0,
                "source_count": sc or 0,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p, mc, sc in projects
        ],
        "count": len(projects)
    }


@router.get("/projects/{project_id}/status")
async def get_project_status(
    project_id: str,
    user_info: tuple = Depends(get_user_unified),
    session: AsyncSession = Depends(get_db)
):
    """
    Get detailed project status including recent memories and sources.
    
    Works with both X-API-Key and Bearer token authentication.
    Used by MCP tools (get_project_status) and standalone MCP clients.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    # Get project
    result = await session.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get counts
    mem_count = (await session.execute(
        select(func.count(Memory.id))
        .where(Memory.project_id == project_id, Memory.is_active == True)
    )).scalar() or 0
    
    src_count = (await session.execute(
        select(func.count(Source.id))
        .where(Source.project_id == project_id)
    )).scalar() or 0
    
    # Get recent memories
    recent_mems = await session.execute(
        select(Memory)
        .where(Memory.project_id == project_id, Memory.is_active == True, Memory.owner_id == owner_id)
        .order_by(Memory.created_at.desc())
        .limit(10)
    )
    recent_memories = recent_mems.scalars().all()
    
    # Get recent sources
    recent_srcs = await session.execute(
        select(Source)
        .where(Source.project_id == project_id, Source.owner_id == owner_id)
        .order_by(Source.created_at.desc())
        .limit(5)
    )
    recent_sources = recent_srcs.scalars().all()
    
    return {
        "found": True,
        "project": {
            "id": str(project.id),
            "name": project.name,
            "slug": project.slug,
            "description": project.description,
            "icon": project.icon or "📁",
            "status": project.status or "active",
            "status_note": project.status_note,
            "is_default": project.is_default or False,
            "memory_count": mem_count,
            "source_count": src_count,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        },
        "recent_memories": [
            {
                "id": str(m.id),
                "content": m.content[:200],
                "sector": m.sector,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in recent_memories
        ],
        "recent_sources": [
            {
                "id": str(s.id),
                "type": s.type,
                "title": s.title,
                "summary": s.summary[:200] if s.summary else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in recent_sources
        ],
    }


class UpdateProjectStatusRequest(BaseModel):
    status: Optional[str] = None
    status_note: Optional[str] = None


@router.patch("/projects/{project_id}/status")
async def update_project_status_endpoint(
    project_id: str,
    request: UpdateProjectStatusRequest,
    user_info: tuple = Depends(get_user_unified),
    session: AsyncSession = Depends(get_db)
):
    """
    Update project status and status note.
    
    Works with both X-API-Key and Bearer token authentication.
    Used by MCP tools (update_project_status) and standalone MCP clients.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    # Get project
    result = await session.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update fields
    if request.status:
        project.status = request.status
    if request.status_note is not None:
        project.status_note = request.status_note
    project.updated_at = datetime.utcnow()
    
    await session.commit()
    await session.refresh(project)
    
    return {
        "success": True,
        "project": {
            "id": str(project.id),
            "name": project.name,
            "status": project.status,
            "status_note": project.status_note,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        },
        "message": f"Project '{project.name}' status updated to '{project.status}'.",
    }
