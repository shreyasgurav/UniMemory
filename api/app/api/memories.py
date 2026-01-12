"""
Memory management endpoints
Production-ready with batch operations and proper validation
"""
from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
import uuid
import logging

from app.db.database import get_db
from app.db.models import Memory, Waypoint, ProcessingLog, User
from app.core.extractor import get_extractor
from app.core.embeddings import get_embedding_service
from app.core.simhash import compute_simhash, hamming_distance
from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
from app.core.waypoints import create_waypoint_for_memory
from app.core.auth import validate_api_key, get_current_user
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


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
    created_at: datetime
    updated_at: Optional[datetime]  # Can be None for older records
    last_seen_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class UpdateMemoryRequest(BaseModel):
    """Request to update a memory"""
    content: Optional[str] = Field(None, min_length=1, max_length=50000)
    salience: Optional[float] = Field(None, ge=0.0, le=1.0)
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


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


@router.post("/memories/add", response_model=Dict[str, Any])
async def add_memory(
    request: AddMemoryRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Add a new memory (extracts and stores)
    
    Requires X-API-Key header for authentication.
    
    Flow:
    1. Check if worth remembering (LLM)
    2. Extract structured memories (LLM)
    3. Generate embeddings
    4. Check for duplicates (SimHash)
    5. Store in database (batched)
    6. Create waypoint links (background)
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    content = request.content
    
    extractor = get_extractor()
    embedding_service = get_embedding_service()
    
    # Step 1: Check worthiness
    worthiness = await extractor.check_worthiness(content)
    if not worthiness.get("is_worth_remembering", False):
        # Log as not worth remembering
        log = ProcessingLog(
            id=str(uuid.uuid4()),
            raw_content_hash=compute_simhash(content),
            processed_at=datetime.utcnow(),
            was_worth_remembering=False,
            reason=worthiness.get("reason", "Not worth remembering"),
            extracted_count=0
        )
        session.add(log)
        await session.commit()
        
        return {
            "was_worth_remembering": False,
            "reason": worthiness.get("reason"),
            "extracted_count": 0
        }
    
    # Step 2: Extract memories
    extracted = await extractor.extract_memories(content)
    if not extracted:
        return {
            "was_worth_remembering": True,
            "reason": "Worth remembering but extraction failed",
            "extracted_count": 0
        }
    
    # Step 3: Batch process extracted memories
    saved_memories = []
    new_memories_for_waypoints = []  # (memory_id, embedding)
    
    # Pre-fetch existing memories for deduplication (single query)
    stmt = select(Memory).where(
        Memory.simhash.isnot(None),
        Memory.is_active == True,
        Memory.owner_id == owner_id,
        Memory.user_id == request.user_id
    ).order_by(Memory.salience.desc()).limit(500)
    
    result = await session.execute(stmt)
    existing_memories = result.scalars().all()
    
    # Build simhash lookup for fast dedup
    simhash_to_memory = {}
    for em in existing_memories:
        if em.simhash:
            simhash_to_memory[em.simhash] = em
    
    for mem_data in extracted:
        # Handle both dict format {"content": "..."} and plain string format
        if isinstance(mem_data, str):
            mem_content = mem_data.strip()
        elif isinstance(mem_data, dict):
            mem_content = mem_data.get("content", "").strip()
        else:
            continue
            
        if not mem_content:
            continue
        
        # Generate SimHash for deduplication
        simhash = compute_simhash(mem_content)
        
        # Check for existing similar memory (optimized)
        existing = None
        for existing_hash, existing_mem in simhash_to_memory.items():
            if hamming_distance(simhash, existing_hash) <= 3:
                existing = existing_mem
                break
        
        if existing:
            # Boost salience on duplicate
            DUPLICATE_BOOST = 0.15
            existing.salience = min(1.0, (existing.salience or 0.5) + DUPLICATE_BOOST)
            existing.last_seen_at = datetime.utcnow()
            existing.updated_at = datetime.utcnow()
            
            saved_memories.append({
                "id": str(existing.id),
                "was_deduplicated": True
            })
            continue
        
        # Step 4: Classify sector
        sector, additional_sectors, confidence = classify_sector(mem_content)
        decay_lambda = get_sector_decay_lambda(sector)
        
        # Step 5: Calculate initial salience
        initial_salience = calculate_initial_salience(sector, additional_sectors)
        
        # Step 6: Generate embedding
        try:
            embedding, dim = await embedding_service.embed(mem_content)
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            continue
        
        # Step 7: Create memory object
        memory_id = str(uuid.uuid4())
        tags = mem_data.get("tags", []) if isinstance(mem_data, dict) else []
        
        memory = Memory(
            id=memory_id,
            content=mem_content,
            simhash=simhash,
            sector=sector,
            salience=initial_salience,
            decay_lambda=decay_lambda,
            segment=0,
            tags=tags,
            extra_metadata=request.metadata or {},
            source_app=request.source_app,
            user_id=request.user_id,
            owner_id=owner_id,
            embedding=embedding,
            embedding_model=settings.EMBEDDING_MODEL,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow()
        )
        
        session.add(memory)
        
        # Track for waypoint creation (background)
        new_memories_for_waypoints.append((memory_id, embedding))
        
        # Add to simhash lookup to prevent duplicates within same batch
        simhash_to_memory[simhash] = memory
        
        saved_memories.append({
            "id": memory_id,
            "was_deduplicated": False
        })
    
    # Step 8: Single commit for all changes
    await session.commit()
    
    # Step 9: Create waypoints in background (non-blocking)
    if new_memories_for_waypoints:
        from app.db.database import AsyncSessionLocal
        memory_ids = [m[0] for m in new_memories_for_waypoints]
        embeddings = [m[1] for m in new_memories_for_waypoints]
        background_tasks.add_task(
            create_waypoints_background,
            AsyncSessionLocal,
            memory_ids,
            embeddings,
            request.user_id
        )
    
    # Step 10: Log processing
    log = ProcessingLog(
        id=str(uuid.uuid4()),
        raw_content_hash=compute_simhash(content),
        processed_at=datetime.utcnow(),
        was_worth_remembering=True,
        reason=worthiness.get("reason"),
        extracted_count=len(saved_memories)
    )
    session.add(log)
    await session.commit()
    
    return {
        "was_worth_remembering": True,
        "reason": worthiness.get("reason"),
        "extracted_count": len(saved_memories),
        "memories": saved_memories
    }

@router.get("/memories/me", response_model=MemoryListResponse)
async def list_my_memories(
    user_id: Optional[str] = None,
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
    stmt = select(Memory).where(
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
    
    return MemoryListResponse(
        memories=[MemoryResponse(
            id=str(m.id),
            content=m.content,
            sector=m.sector,
            salience=m.salience,
            tags=m.tags or [],
            user_id=m.user_id or "anonymous",
            created_at=m.created_at
        ) for m in memories],
        total=total
    )



@router.get("/memories", response_model=MemoryListResponse)
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
    stmt = select(Memory).where(
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
    
    return MemoryListResponse(
        memories=[MemoryResponse(
            id=str(m.id),
            content=m.content,
            sector=m.sector,
            salience=m.salience,
            tags=m.tags or [],
            user_id=m.user_id or "anonymous",
            created_at=m.created_at
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
    
    # Update last_seen_at
    memory.last_seen_at = datetime.utcnow()
    await session.commit()
    await session.refresh(memory)  # Refresh to get updated values after commit
    
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


@router.patch("/memories/{memory_id}", response_model=MemoryDetailResponse)
async def update_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Update a memory (salience, tags, metadata).
    
    Requires X-API-Key header for authentication.
    Can only update memories owned by the authenticated user.
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
    
    # Update fields if provided
    if request.content is not None:
        memory.content = request.content
        # Re-compute simhash if content changed
        memory.simhash = compute_simhash(request.content)
        memory.updated_at = datetime.utcnow()
    
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
    await session.refresh(memory)  # Refresh to get updated values after commit
    
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


@router.patch("/memories/me/{memory_id}", response_model=MemoryDetailResponse)
async def patch_my_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Update a memory (content, salience, tags, metadata) for authenticated user.
    """
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
    
    if request.content is not None:
        memory.content = request.content
        memory.simhash = compute_simhash(request.content)
        memory.updated_at = datetime.utcnow()
    
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
