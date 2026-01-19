"""
Ingestion API - Intelligent memory extraction from raw content
These endpoints run LLM-based extraction and are allowed to evolve.

Guardrails:
- User-level ingest_enabled setting
- Token usage tracking
- Strict extraction schemas
- No internal details in responses
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import uuid
import logging

from app.db.database import get_db, AsyncSessionLocal
from app.db.models import Memory, ProcessingLog, MemorySource, User, Source, EndUser
from app.core.extractor import get_extractor, ExtractedMemoryItem
from app.core.embeddings import get_embedding_service
from app.core.simhash import compute_simhash, hamming_distance
from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
from app.core.waypoints import create_waypoint_for_memory
from app.core.auth import validate_api_key_optimized
from app.api.consumer import verify_consumer_session_token
from app.core.end_user import get_or_create_end_user
from app.core.summarizer import SourceSummarizer
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Maximum waypoints to create per ingest call (prevents unbounded background tasks)
MAX_WAYPOINTS_PER_INGEST = 20


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class IngestTextRequest(BaseModel):
    """Request to ingest raw text and extract memories"""
    content: str = Field(..., min_length=1, max_length=50000)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)
    # When False, skip creating a Source row and only store extracted memories
    create_source: bool = Field(True)


class IngestChatRequest(BaseModel):
    """Request to ingest chat messages and extract memories"""
    messages: List[Dict[str, str]] = Field(..., min_items=1)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)
    source_metadata: Optional[Dict[str, Any]] = Field(None)


class IngestDocumentRequest(BaseModel):
    """Request to ingest document content and extract memories"""
    content: str = Field(..., min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=500)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)


class IngestResponse(BaseModel):
    """Public response from ingestion endpoints (no internal details)"""
    stored: int
    skipped: int
    memory_ids: List[str]
    tokens_used: int = 0  # Token transparency
    source_id: Optional[str] = None
    source_title: Optional[str] = None  # Generated title for display
    # Note: was_worth_remembering removed from public response (internal detail)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def check_ingest_enabled(user: User) -> bool:
    """Check if ingest is enabled for this user (via settings)"""
    settings_dict = user.settings or {}
    # Default to True for backwards compatibility
    return settings_dict.get("ingest_enabled", True)


async def get_ingest_auth(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    session: AsyncSession = Depends(get_db)
):
    """
    Accept either authentication scheme:
    - X-API-Key (B2B developer/API flow)
    - Authorization: Bearer <consumer session token> (Chrome extension flow)

    Returns a tuple (user, api_key_or_none, source_app) where source_app is
    one of ["api", "chrome_extension"] to tag Source.source_app and app_id.
    """
    # Prefer API key if provided
    if x_api_key:
        user, api_key = await validate_api_key_optimized(x_api_key, session)
        return user, api_key, "api"

    # Try consumer session bearer token
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        payload = await verify_consumer_session_token(token)
        # Lookup user by payload["sub"] which stores owner/user id
        stmt = select(User).where(User.id == payload.get("sub"))
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session user")
        return user, None, "chrome_extension"

    # Neither provided
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-API-Key or Authorization bearer token required")


async def create_waypoints_background(
    session_factory,
    memory_ids: List[str],
    embeddings: List[List[float]],
    user_id: str
):
    """Background task to create waypoints (non-blocking, capped)"""
    try:
        async with session_factory() as session:
            # Cap waypoints to prevent unbounded work
            for memory_id, embedding in zip(memory_ids[:MAX_WAYPOINTS_PER_INGEST], embeddings[:MAX_WAYPOINTS_PER_INGEST]):
                await create_waypoint_for_memory(
                    session=session,
                    new_memory_id=memory_id,
                    new_embedding=embedding,
                    user_id=user_id
                )
            await session.commit()
    except Exception as e:
        logger.error(f"Background waypoint creation failed for memories {memory_ids[:3]}...: {e}")


async def store_extracted_memories(
    session: AsyncSession,
    extracted: List[ExtractedMemoryItem],
    owner_id: str,
    user_id: str,
    end_user_id: Optional[str],
    app_id: Optional[str],
    api_key_id: Optional[str],
    source_uuid: Optional[str],
    background_tasks: BackgroundTasks
) -> tuple[int, int, List[str]]:
    """
    Store extracted memories with deduplication.
    Links memories to source via memory_sources table.
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
    
    for mem_item in extracted:
        mem_content = mem_item.content.strip()
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
        
        memory = Memory(
            id=memory_id,
            content=mem_content,
            simhash=simhash,
            sector=sector,
            salience=initial_salience,
            decay_lambda=decay_lambda,
            segment=0,
            tags=mem_item.tags or [],
            extra_metadata={},
            source_app=app_id,
            user_id=user_id,
            end_user_id=end_user_id,
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
    
    # Commit memories first
    await session.commit()
    
    # Create source links individually to avoid UUID batch insert issues
    if source_uuid and memory_ids:
        for mem_id in memory_ids:
            source_link = MemorySource(
                id=str(uuid.uuid4()),
                memory_id=mem_id,
                source_id=source_uuid
            )
            session.add(source_link)
            await session.commit()  # Commit each link individually
    
    # Schedule waypoint creation in background (capped)
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
    user_info: tuple = Depends(get_ingest_auth),
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
    
    Can be disabled via user settings: {"ingest_enabled": false}
    """
    user, api_key, source_app = user_info
    owner_id = str(user.id)
    
    extractor = get_extractor()
    summarizer = SourceSummarizer()
    content = request.content
    total_tokens = 0
    create_source = request.create_source
    
    # Step 1: Check worthiness
    worthiness = await extractor.check_worthiness(content)
    total_tokens += worthiness.tokens_used
    
    if not worthiness.is_worth_remembering:
        # Log internally only
        log = ProcessingLog(
            id=str(uuid.uuid4()),
            raw_content_hash=compute_simhash(content),
            processed_at=datetime.utcnow(),
            was_worth_remembering=False,
            reason=worthiness.reason,
            extracted_count=0
        )
        session.add(log)
        await session.commit()
        
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            tokens_used=total_tokens,
            source_id=None
        )
    
    # Get or create end_user (needed for memories regardless of source creation)
    end_user = await get_or_create_end_user(
        session=session,
        owner_id=owner_id,
        external_user_id=request.user_id or "anonymous"
    )

    source_uuid: Optional[str] = None

    if create_source:
        # Step 2: Create Source record with raw content + summary + embedding
        summary, summary_embedding, summary_tokens = await summarizer.summarize_and_embed(content, "text")
        total_tokens += summary_tokens

        source_uuid = str(uuid.uuid4())
        source = Source(
            id=source_uuid,
            owner_id=owner_id,
            end_user_id=str(end_user.id),
            type="text",
            source_app=request.app_id or source_app,
            title=None,
            raw_content={"content": content},
            summary=summary,
            summary_embedding=summary_embedding,
            source_metadata={},
            external_ref=request.source_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(source)
        await session.flush()
    
    # Step 3: Extract memories
    extraction = await extractor.extract_memories(content)
    total_tokens += extraction.tokens_used
    
    if not extraction.memories:
        await session.commit()
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            tokens_used=total_tokens,
            source_id=source_uuid
        )
    
    # Step 4: Store extracted memories and link to source
    stored, skipped, memory_ids = await store_extracted_memories(
        session=session,
        extracted=extraction.memories,
        owner_id=owner_id,
        user_id=request.user_id or "anonymous",
        end_user_id=str(end_user.id),
        app_id=request.app_id or source_app,
        api_key_id=str(api_key.id) if api_key else None,
        source_uuid=source_uuid,
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
        tokens_used=total_tokens,
        source_id=source_uuid,
        # For /ingest/text we don't generate a display title; keep this None
        source_title=None
    )


@router.post("/ingest/chat", response_model=IngestResponse)
async def ingest_chat(
    request: IngestChatRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(get_ingest_auth),
    session: AsyncSession = Depends(get_db)
):
    """
    Ingest chat messages and extract memories using LLM.
    
    Accepts an array of messages in OpenAI format:
    [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    
    Extracts relevant facts, preferences, and insights from the conversation.
    
    Can be disabled via user settings: {"ingest_enabled": false}
    """
    user, api_key, source_app = user_info
    owner_id = str(user.id)
    
    extractor = get_extractor()
    summarizer = SourceSummarizer()
    total_tokens = 0
    
    # Combine messages into conversation text
    conversation = "\n".join([
        f"{msg.get('role', 'user')}: {msg.get('content', '')}"
        for msg in request.messages
    ])
    
    # Step 1: Check worthiness (TEMPORARILY DISABLED FOR DEBUGGING)
    # worthiness = await extractor.check_worthiness(conversation)
    # total_tokens += worthiness.tokens_used
    # 
    # if not worthiness.is_worth_remembering:
    #     return IngestResponse(
    #         stored=0,
    #         skipped=0,
    #         memory_ids=[],
    #         tokens_used=total_tokens,
    #         source_id=None
    #     )
    
    # Step 2: Generate meaningful title from content
    generated_title, title_tokens = await summarizer.generate_title(
        conversation,
        "chat",
        metadata=request.source_metadata
    )
    total_tokens += title_tokens
    
    # Step 3: Create Source record with raw chat + summary + embedding
    # Pass metadata to help summarizer detect if this is a conversation or web page
    summary, summary_embedding, summary_tokens = await summarizer.summarize_and_embed(
        conversation, 
        "chat",
        metadata=request.source_metadata
    )
    total_tokens += summary_tokens
    
    # Get or create end_user
    end_user = await get_or_create_end_user(
        session=session,
        owner_id=owner_id,
        external_user_id=request.user_id or "anonymous"
    )
    
    source_uuid = str(uuid.uuid4())
    source = Source(
        id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        type="chat",
        source_app=request.app_id or source_app,
        title=generated_title,  # Use generated title instead of tab title
        raw_content={"messages": request.messages},
        summary=summary,
        summary_embedding=summary_embedding,
        source_metadata=request.source_metadata or {},
        external_ref=request.source_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    session.add(source)
    await session.flush()
    
    # Step 3: Extract memories
    # Pass metadata to help extractor detect if this is a conversation or web page
    extraction = await extractor.extract_memories(conversation, metadata=request.source_metadata)
    total_tokens += extraction.tokens_used
    
    if not extraction.memories:
        await session.commit()
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            tokens_used=total_tokens,
            source_id=source_uuid
        )
    
    # Step 4: Store extracted memories and link to source
    stored, skipped, memory_ids = await store_extracted_memories(
        session=session,
        extracted=extraction.memories,
        owner_id=owner_id,
        user_id=request.user_id or "anonymous",
        end_user_id=str(end_user.id),
        app_id=request.app_id or source_app,
        api_key_id=str(api_key.id) if api_key else None,
        source_uuid=source_uuid,
        background_tasks=background_tasks
    )
    
    return IngestResponse(
        stored=stored,
        skipped=skipped,
        memory_ids=memory_ids,
        tokens_used=total_tokens,
        source_id=source_uuid,
        source_title=generated_title
    )


@router.post("/ingest/document", response_model=IngestResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(get_ingest_auth),
    session: AsyncSession = Depends(get_db)
):
    """
    Ingest document content and extract memories using LLM.
    
    Handles longer content (up to 100k chars) by chunking if needed.
    Checks worthiness on FULL document first, then extracts from chunks.
    
    Can be disabled via user settings: {"ingest_enabled": false}
    """
    user, api_key, source_app = user_info
    owner_id = str(user.id)
    
    extractor = get_extractor()
    summarizer = SourceSummarizer()
    content = request.content
    total_tokens = 0
    
    # Add title context if provided
    if request.title:
        content = f"Document: {request.title}\n\n{content}"
    
    # Step 1: Check worthiness on FULL document (not per-chunk)
    # Use first 10k chars for worthiness to get aggregate signal
    worthiness_sample = content[:10000]
    worthiness = await extractor.check_worthiness(worthiness_sample)
    total_tokens += worthiness.tokens_used
    
    if not worthiness.is_worth_remembering:
        return IngestResponse(
            stored=0,
            skipped=0,
            memory_ids=[],
            tokens_used=total_tokens,
            source_id=None
        )
    
    # Step 2: Create Source record with raw document + summary + embedding
    summary, summary_embedding, summary_tokens = await summarizer.summarize_and_embed(content, "document")
    total_tokens += summary_tokens
    
    # Get or create end_user
    end_user = await get_or_create_end_user(
        session=session,
        owner_id=owner_id,
        external_user_id=request.user_id or "anonymous"
    )
    
    source_uuid = str(uuid.uuid4())
    source = Source(
        id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        type="document",
        source_app=request.app_id or source_app,
        title=request.title,
        raw_content={"content": request.content},
        summary=summary,
        summary_embedding=summary_embedding,
        source_metadata={},
        external_ref=request.source_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    session.add(source)
    await session.flush()
    
    # Step 3: Process in chunks (worthiness already checked)
    max_chunk_size = 10000
    chunks = [content[i:i+max_chunk_size] for i in range(0, len(content), max_chunk_size)]
    
    total_stored = 0
    total_skipped = 0
    all_memory_ids = []
    
    for chunk in chunks:
        # Extract memories (no per-chunk worthiness check)
        extraction = await extractor.extract_memories(chunk)
        total_tokens += extraction.tokens_used
        
        if not extraction.memories:
            continue
        
        # Store memories and link to source
        stored, skipped, memory_ids = await store_extracted_memories(
            session=session,
            extracted=extraction.memories,
            owner_id=owner_id,
            user_id=request.user_id or "anonymous",
            end_user_id=str(end_user.id),
            app_id=request.app_id or source_app,
            api_key_id=str(api_key.id) if api_key else None,
            source_uuid=source_uuid,
            background_tasks=background_tasks
        )
        
        total_stored += stored
        total_skipped += skipped
        all_memory_ids.extend(memory_ids)
    
    return IngestResponse(
        stored=total_stored,
        skipped=total_skipped,
        memory_ids=all_memory_ids,
        tokens_used=total_tokens,
        source_id=source_uuid
    )
