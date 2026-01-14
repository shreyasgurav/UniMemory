"""
Consumer API endpoints for app.unimemory.app
These endpoints are for end-users to view their sources and memories.
NO API keys - uses Firebase auth only.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_, and_
from pydantic import BaseModel, Field
import logging

from app.db.database import get_db
from app.db.models import Source, Memory, MemorySource, User, ProcessingLog
from app.api.auth import get_current_user
from app.core.embeddings import get_embedding_service

logger = logging.getLogger(__name__)
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
    type: str  # "ingest", "agent_use", "memory_created", "source_created"
    source: Optional[str]  # "chrome_extension", "api", "mcp"
    agent: Optional[str]  # "cursor", "claude", etc.
    memory_count: Optional[int]
    details: Optional[str]
    created_at: str


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
    Get activity feed showing ingestion events and agent usage.
    Aggregates from processing_logs and sources.
    """
    events = []
    
    # Get recent sources (ingestion events)
    sources_result = await session.execute(
        select(Source)
        .where(Source.owner_id == str(user.id))
        .order_by(Source.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    sources = sources_result.scalars().all()
    
    for source in sources:
        # Count linked memories
        mem_count_result = await session.execute(
            select(func.count(MemorySource.memory_id))
            .where(MemorySource.source_id == str(source.id))
        )
        mem_count = mem_count_result.scalar() or 0
        
        events.append(ActivityEvent(
            id=str(source.id),
            type="source_created",
            source=source.source_app or "unknown",
            agent=None,
            memory_count=mem_count,
            details=f"{mem_count} memories extracted from {source.type}",
            created_at=str(source.created_at)
        ))
    
    # Get processing logs
    logs_result = await session.execute(
        select(ProcessingLog)
        .order_by(ProcessingLog.processed_at.desc())
        .limit(20)
    )
    logs = logs_result.scalars().all()
    
    for log in logs:
        if log.was_worth_remembering:
            events.append(ActivityEvent(
                id=str(log.id),
                type="ingest",
                source="api",
                agent=None,
                memory_count=log.extracted_count,
                details=f"{log.extracted_count} memories extracted",
                created_at=str(log.processed_at)
            ))
    
    # Sort all events by created_at
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
