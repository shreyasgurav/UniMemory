"""
Ingestion API - Intelligent memory extraction from raw content
These endpoints run LLM-based extraction and are allowed to evolve.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import uuid
import logging

from app.db.database import get_db, AsyncSessionLocal
from app.db.models import Memory, ProcessingLog, MemorySource
from app.core.extractor import get_extractor
from app.core.embeddings import get_embedding_service
from app.core.simhash import compute_simhash, hamming_distance
from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
from app.core.waypoints import create_waypoint_for_memory
from app.core.auth import validate_api_key
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class IngestTextRequest(BaseModel):
    """Request to ingest raw text and extract memories"""
    content: str = Field(..., min_length=1, max_length=50000)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)  # External reference


class IngestChatRequest(BaseModel):
    """Request to ingest chat messages and extract memories"""
    messages: List[Dict[str, str]] = Field(..., min_items=1)  # [{"role": "user", "content": "..."}]
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)


class IngestDocumentRequest(BaseModel):
    """Request to ingest document content and extract memories"""
    content: str = Field(..., min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=500)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)


class IngestResponse(BaseModel):
    """Response from ingestion endpoints"""
    stored: int
    skipped: int
    memory_ids: List[str]
    source_id: Optional[str] = None
    was_worth_remembering: bool = True


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

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


async def store_extracted_memories(
    session: AsyncSession,
    extracted: List[Dict[str, Any]],
    owner_id: str,
    user_id: str,
    app_id: Optional[str],
    api_key_id: Optional[str],
    source_id: Optional[str],
    source_type: str,
    background_tasks: BackgroundTasks
) -> tuple[int, int, List[str]]:
    """
    Store extracted memories with deduplication.
    Returns (stored_count, skipped_count, memory_ids)
    """
    embedding_service = get_embedding_service()
    
    # Pre-fetch existing memories for deduplication
    stmt = select(Memory).where(
        Memory.simhash.isnot(None),
        Memory.is_active == True,
        Memory.owner_id == owner_id,
        Memory.user_id == user_id
    ).order_by(Memory.salience.desc()).limit(500)
    
    result = await session.execute(stmt)
    existing_memories = result.scalars().all()
    
    # Build simhash lookup
    simhash_to_memory = {em.simhash: em for em in existing_memories if em.simhash}
    
    stored_count = 0
    skipped_count = 0
    memory_ids = []
    new_memories_for_waypoints = []
    
    for mem_data in extracted:
        # Handle both dict and string formats
        if isinstance(mem_data, str):
            mem_content = mem_data.strip()
        elif isinstance(mem_data, dict):
            mem_content = mem_data.get("content", "").strip()
        else:
            continue
        
        if not mem_content:
            continue
        
        # Compute SimHash
        simhash = compute_simhash(mem_content)
        
        # Check for duplicates
        is_duplicate = False
        for existing_hash, existing_mem in simhash_to_memory.items():
            if hamming_distance(simhash, existing_hash) <= 3:
                # Boost salience on duplicate
                existing_mem.salience = min(1.0, (existing_mem.salience or 0.5) + 0.15)
                existing_mem.last_seen_at = datetime.utcnow()
                skipped_count += 1
                is_duplicate = True
                break
        
        if is_duplicate:
            continue
        
        # Classify sector
        sector, additional_sectors, confidence = classify_sector(mem_content)
        decay_lambda = get_sector_decay_lambda(sector)
        initial_salience = calculate_initial_salience(sector, additional_sectors)
        
        # Generate embedding
        try:
            embedding, dim = await embedding_service.embed(mem_content)
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            continue
        
        # Create memory
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
            extra_metadata={},
            source_app=app_id,
            user_id=user_id,
            owner_id=owner_id,
            api_key_id=api_key_id,
            embedding=embedding,
            embedding_model=settings.EMBEDDING_MODEL,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow()
        )
        
        session.add(memory)
        simhash_to_memory[simhash] = memory
        memory_ids.append(memory_id)
        new_memories_for_waypoints.append((memory_id, embedding))
        stored_count += 1
    
    # Create source links if source_id provided
    if source_id and memory_ids:
        for mem_id in memory_ids:
            source_link = MemorySource(
                id=str(uuid.uuid4()),
                memory_id=mem_id,
                source_id=source_id,
                source_type=source_type
            )
            session.add(source_link)
    
    await session.commit()
    
    # Schedule waypoint creation in background
    if new_memories_for_waypoints:
        background_tasks.add_task(
            create_waypoints_background,
            AsyncSessionLocal,
            [m[0] for m in new_memories_for_waypoints],
            [m[1] for m in new_memories_for_waypoints],
            user_id
        )
    
    return stored_count, skipped_count, memory_ids


# =============================================================================
# INGEST ENDPOINTS
# =============================================================================

@router.post("/ingest/text", response_model=IngestResponse)
async def ingest_text(
    request: IngestTextRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Ingest raw text and extract memories using LLM.
    
    This endpoint:
    - Checks if content is worth remembering
    - Extracts structured memories using LLM
    - Deduplicates and stores memories
    - Creates graph waypoints
    
    Use POST /memories for explicit, known memories.
    Use this endpoint for intelligent extraction from raw content.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    extractor = get_extractor()
    content = request.content
    
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
        
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            source_id=request.source_id,
            was_worth_remembering=False
        )
    
    # Step 2: Extract memories
    extracted = await extractor.extract_memories(content)
    if not extracted:
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            source_id=request.source_id,
            was_worth_remembering=True
        )
    
    # Step 3: Store extracted memories
    stored, skipped, memory_ids = await store_extracted_memories(
        session=session,
        extracted=extracted,
        owner_id=owner_id,
        user_id=request.user_id or "anonymous",
        app_id=request.app_id,
        api_key_id=str(api_key.id) if api_key else None,
        source_id=request.source_id,
        source_type="text",
        background_tasks=background_tasks
    )
    
    # Log processing
    log = ProcessingLog(
        id=str(uuid.uuid4()),
        raw_content_hash=compute_simhash(content),
        processed_at=datetime.utcnow(),
        was_worth_remembering=True,
        reason="Extracted successfully",
        extracted_count=stored
    )
    session.add(log)
    await session.commit()
    
    return IngestResponse(
        stored=stored,
        skipped=skipped,
        memory_ids=memory_ids,
        source_id=request.source_id,
        was_worth_remembering=True
    )


@router.post("/ingest/chat", response_model=IngestResponse)
async def ingest_chat(
    request: IngestChatRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Ingest chat messages and extract memories using LLM.
    
    Accepts an array of messages in OpenAI format:
    [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    
    Extracts relevant facts, preferences, and insights from the conversation.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    extractor = get_extractor()
    
    # Combine messages into conversation text
    conversation = "\n".join([
        f"{msg.get('role', 'user')}: {msg.get('content', '')}"
        for msg in request.messages
    ])
    
    # Step 1: Check worthiness
    worthiness = await extractor.check_worthiness(conversation)
    if not worthiness.get("is_worth_remembering", False):
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            source_id=request.source_id,
            was_worth_remembering=False
        )
    
    # Step 2: Extract memories
    extracted = await extractor.extract_memories(conversation)
    if not extracted:
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            source_id=request.source_id,
            was_worth_remembering=True
        )
    
    # Step 3: Store extracted memories
    stored, skipped, memory_ids = await store_extracted_memories(
        session=session,
        extracted=extracted,
        owner_id=owner_id,
        user_id=request.user_id or "anonymous",
        app_id=request.app_id,
        api_key_id=str(api_key.id) if api_key else None,
        source_id=request.source_id,
        source_type="chat",
        background_tasks=background_tasks
    )
    
    return IngestResponse(
        stored=stored,
        skipped=skipped,
        memory_ids=memory_ids,
        source_id=request.source_id,
        was_worth_remembering=True
    )


@router.post("/ingest/document", response_model=IngestResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(validate_api_key),
    session: AsyncSession = Depends(get_db)
):
    """
    Ingest document content and extract memories using LLM.
    
    Handles longer content (up to 100k chars) by chunking if needed.
    Extracts key facts, insights, and learnings from the document.
    """
    user, api_key = user_info
    owner_id = str(user.id)
    
    extractor = get_extractor()
    content = request.content
    
    # Add title context if provided
    if request.title:
        content = f"Document: {request.title}\n\n{content}"
    
    # For long documents, process in chunks
    max_chunk_size = 10000
    chunks = [content[i:i+max_chunk_size] for i in range(0, len(content), max_chunk_size)]
    
    total_stored = 0
    total_skipped = 0
    all_memory_ids = []
    
    for chunk in chunks:
        # Check worthiness
        worthiness = await extractor.check_worthiness(chunk)
        if not worthiness.get("is_worth_remembering", False):
            continue
        
        # Extract memories
        extracted = await extractor.extract_memories(chunk)
        if not extracted:
            continue
        
        # Store memories
        stored, skipped, memory_ids = await store_extracted_memories(
            session=session,
            extracted=extracted,
            owner_id=owner_id,
            user_id=request.user_id or "anonymous",
            app_id=request.app_id,
            api_key_id=str(api_key.id) if api_key else None,
            source_id=request.source_id,
            source_type="document",
            background_tasks=background_tasks
        )
        
        total_stored += stored
        total_skipped += skipped
        all_memory_ids.extend(memory_ids)
    
    return IngestResponse(
        stored=total_stored,
        skipped=total_skipped,
        memory_ids=all_memory_ids,
        source_id=request.source_id,
        was_worth_remembering=total_stored > 0 or total_skipped > 0
    )
