"""
Consumer API endpoints for app.unimemory.app
These endpoints are for end-users to view their sources and memories.
NO API keys - uses Firebase auth only.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import Source, Memory, MemorySource, User
from app.api.auth import get_current_user

router = APIRouter()


# ============ Response Models ============

class SourceResponse(BaseModel):
    id: str
    type: str
    raw_content: dict
    summary: Optional[str]
    source_metadata: Optional[dict]
    end_user_id: Optional[str]
    owner_id: str
    created_at: str
    updated_at: Optional[str]

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

@router.get("/consumer/sources", response_model=List[SourceResponse])
async def get_sources(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get all sources for the current user, ordered by created_at desc"""
    result = await session.execute(
        select(Source)
        .where(Source.owner_id == str(user.id))
        .order_by(Source.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    sources = result.scalars().all()
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
            updated_at=str(s.updated_at) if s.updated_at else None
        ) for s in sources
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
    
    memory.is_active = False
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
