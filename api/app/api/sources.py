"""
Sources API endpoints (API key authenticated)
For MCP and SDK access to source data
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel
import logging

from app.db.database import get_db
from app.db.models import Source, Memory, MemorySource
from app.core.auth import validate_api_key

logger = logging.getLogger(__name__)
router = APIRouter()


class SourceResponse(BaseModel):
    """Source response model"""
    id: str
    type: str
    title: Optional[str] = None
    summary: Optional[str] = None
    source_metadata: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SourceDetailResponse(BaseModel):
    """Source with raw content"""
    id: str
    type: str
    title: Optional[str] = None
    summary: Optional[str] = None
    raw_content: Optional[Any] = None
    source_metadata: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MemoryWithSourceResponse(BaseModel):
    """Memory with linked sources"""
    id: str
    content: str
    salience: float
    created_at: datetime
    source_ids: List[str] = []

    class Config:
        from_attributes = True


class SourcesForMemoryResponse(BaseModel):
    """Sources linked to a memory"""
    sources: List[SourceResponse]


@router.get("/sources", response_model=List[SourceResponse])
async def list_sources(
    limit: int = 50,
    offset: int = 0,
    type: Optional[str] = None,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """List sources for the authenticated user"""
    owner_id, _ = user_info

    query = select(Source).where(Source.owner_id == owner_id)
    
    if type:
        query = query.where(Source.type == type)
    
    query = query.order_by(Source.created_at.desc()).offset(offset).limit(limit)
    
    result = await session.execute(query)
    sources = result.scalars().all()

    return [
        SourceResponse(
            id=str(s.id),
            type=s.type,
            title=s.title,
            summary=s.summary,
            source_metadata=s.source_metadata,
            created_at=s.created_at
        )
        for s in sources
    ]


@router.get("/sources/{source_id}", response_model=SourceDetailResponse)
async def get_source(
    source_id: str,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """Get a source by ID with full content"""
    owner_id, _ = user_info

    result = await session.execute(
        select(Source).where(
            Source.id == source_id,
            Source.owner_id == owner_id
        )
    )
    source = result.scalar_one_or_none()

    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    return SourceDetailResponse(
        id=str(source.id),
        type=source.type,
        title=source.title,
        summary=source.summary,
        raw_content=source.raw_content,
        source_metadata=source.source_metadata,
        created_at=source.created_at
    )


@router.get("/memories/{memory_id}/sources", response_model=SourcesForMemoryResponse)
async def get_sources_for_memory(
    memory_id: str,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """Get sources linked to a memory"""
    owner_id, _ = user_info

    # Verify memory belongs to user
    memory_result = await session.execute(
        select(Memory).where(
            Memory.id == memory_id,
            Memory.owner_id == owner_id
        )
    )
    memory = memory_result.scalar_one_or_none()

    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    # Get linked sources via memory_sources
    sources_result = await session.execute(
        select(Source)
        .join(MemorySource, MemorySource.source_id == Source.id)
        .where(MemorySource.memory_id == memory_id)
    )
    sources = sources_result.scalars().all()

    return SourcesForMemoryResponse(
        sources=[
            SourceResponse(
                id=str(s.id),
                type=s.type,
                title=s.title,
                summary=s.summary,
                source_metadata=s.source_metadata,
                created_at=s.created_at
            )
            for s in sources
        ]
    )
