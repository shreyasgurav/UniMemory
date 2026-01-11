"""
Memory management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import uuid

from app.db.database import get_db
from app.db.models import Memory, Waypoint, ProcessingLog, User
from app.core.extractor import get_extractor
from app.core.embeddings import get_embedding_service
from app.core.simhash import compute_simhash, hamming_distance
from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
from app.core.waypoints import create_waypoint_for_memory
from app.core.auth import validate_api_key
from app.config import settings

router = APIRouter()


# Request/Response models
class AddMemoryRequest(BaseModel):
    content: str
    source_app: Optional[str] = None
    user_id: Optional[str] = "anonymous"
    metadata: Optional[Dict[str, Any]] = None


class MemoryResponse(BaseModel):
    id: str
    content: str
    sector: Optional[str]
    salience: float
    tags: List[str]
    created_at: datetime
    was_deduplicated: bool = False
    extracted_count: int = 0
    
    class Config:
        from_attributes = True


class MemoryListResponse(BaseModel):
    memories: List[MemoryResponse]
    total: int


@router.post("/memories/add", response_model=Dict[str, Any])
async def add_memory(
    request: AddMemoryRequest,
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
    5. Store in database
    6. Create waypoint links
    """
    user, api_key = user_info  # Get authenticated user from API key
    owner_id = str(user.id)  # The UniMemory user who owns these memories
    
    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    
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
    
    # Step 3: Process each extracted memory
    saved_memories = []
    
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
        
        # Check for existing similar memory (scoped to owner and end-user)
        from sqlalchemy import select
        stmt = select(Memory).where(
            Memory.simhash.isnot(None),
            Memory.is_active == True,
            Memory.owner_id == owner_id,
            Memory.user_id == request.user_id
        ).order_by(Memory.salience.desc()).limit(100)
        
        result = await session.execute(stmt)
        existing_memories = result.scalars().all()
        
        existing = None
        for em in existing_memories:
            if em.simhash and hamming_distance(simhash, em.simhash) <= 3:
                existing = em
                break
        
        if existing:
            # Boost salience on duplicate (same as Mac app's reinforceOnDuplicate)
            DUPLICATE_BOOST = 0.15  # Same as Mac app
            existing.salience = min(1.0, (existing.salience or 0.5) + DUPLICATE_BOOST)
            existing.last_seen_at = datetime.utcnow()
            existing.updated_at = datetime.utcnow()
            await session.commit()
            
            saved_memories.append({
                "id": str(existing.id),
                "was_deduplicated": True
            })
            continue
        
        # Step 4: Classify sector
        sector, additional_sectors, confidence = classify_sector(mem_content)
        decay_lambda = get_sector_decay_lambda(sector)
        
        # Step 5: Calculate initial salience (same as Mac app: 0.4 + 0.1 per additional)
        initial_salience = calculate_initial_salience(sector, additional_sectors)
        
        # Step 6: Generate embedding
        embedding, dim = await embedding_service.embed(mem_content)
        
        # Step 7: Create memory
        memory_id = str(uuid.uuid4())
        # Get tags from mem_data if it's a dict, otherwise empty list
        tags = mem_data.get("tags", []) if isinstance(mem_data, dict) else []
        memory = Memory(
            id=memory_id,
            content=mem_content,
            simhash=simhash,
            sector=sector,
            salience=initial_salience,
            decay_lambda=decay_lambda,
            segment=0,  # TODO: Implement segment rotation
            tags=tags,
            extra_metadata=request.metadata or {},
            source_app=request.source_app,
            user_id=request.user_id,
            owner_id=owner_id,  # UniMemory user who owns this memory
            embedding=embedding,
            embedding_model=settings.EMBEDDING_MODEL,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow()
        )
        
        session.add(memory)
        await session.flush()  # Get memory ID
        
        # Step 8: Create waypoint link (find most similar existing memory)
        await create_waypoint_for_memory(
            session=session,
            new_memory_id=memory_id,
            new_embedding=embedding,
            user_id=request.user_id
        )
        
        saved_memories.append({
            "id": memory_id,
            "was_deduplicated": False
        })
    
    # Commit all changes
    await session.commit()
    
    # Log processing
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
    
    from sqlalchemy import select, func
    
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
            created_at=m.created_at
        ) for m in memories],
        total=total
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
    
    from sqlalchemy import select
    
    # Only allow deleting memories owned by this user
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

