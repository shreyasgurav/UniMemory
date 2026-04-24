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
from sqlalchemy import select, update
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import uuid
import logging
import asyncio

from app.db.database import get_db, AsyncSessionLocal
from app.db.models import Memory, ProcessingLog, MemorySource, User, Source, EndUser, EntitySource
from app.core.extractor import get_extractor, ExtractedMemoryItem
from app.core.embeddings import get_embedding_service
from app.core.simhash import compute_simhash, hamming_distance
from app.core.sector import (
    classify_sector, calculate_initial_salience, 
    get_sector_relationship_weight
)
from app.core.entities import EntityExtractor
from app.core.waypoints import create_waypoint_for_memory
from app.core.auth import validate_api_key_optimized
from app.api.consumer import verify_consumer_session_token_payload
from app.core.end_user import get_or_create_end_user
from app.core.summarizer import SourceSummarizer
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Maximum waypoints to create per ingest call (prevents unbounded background tasks)
MAX_WAYPOINTS_PER_INGEST = 50  # Increased to handle larger ingests


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class IngestTextRequest(BaseModel):
    """Request to ingest raw text and extract memories"""
    content: str = Field(..., min_length=1, max_length=50000)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)
    project_id: Optional[str] = Field(None, max_length=255)  # Project to save to
    # When False, skip creating a Source row and only store extracted memories
    create_source: bool = Field(True)


class IngestChatRequest(BaseModel):
    """Request to ingest chat messages and extract memories"""
    messages: List[Dict[str, str]] = Field(..., min_items=1)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)
    project_id: Optional[str] = Field(None, max_length=255)  # Project to save to
    source_metadata: Optional[Dict[str, Any]] = Field(None)


class IngestDocumentRequest(BaseModel):
    """Request to ingest document content and extract memories"""
    content: str = Field(..., min_length=1, max_length=100000)
    title: Optional[str] = Field(None, max_length=500)
    user_id: Optional[str] = Field("anonymous", max_length=100)
    app_id: Optional[str] = Field(None, max_length=100)
    source_id: Optional[str] = Field(None, max_length=255)
    project_id: Optional[str] = Field(None, max_length=255)  # Project to save to


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
        payload = await verify_consumer_session_token_payload(token)
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
    logger.info(f"[Waypoint BG] Starting background task for {len(memory_ids)} memories")
    total_created = 0
    
    # Process each memory in its own session to avoid transaction issues
    for i, (memory_id, embedding) in enumerate(zip(memory_ids[:MAX_WAYPOINTS_PER_INGEST], embeddings[:MAX_WAYPOINTS_PER_INGEST])):
        try:
            logger.info(f"[Waypoint BG] Processing memory {i+1}/{len(memory_ids)}: {memory_id[:8]}...")
            async with session_factory() as session:
                waypoints = await create_waypoint_for_memory(
                    session=session,
                    new_memory_id=memory_id,
                    new_embedding=embedding,
                    user_id=user_id
                )
                await session.commit()
                count = len(waypoints) if waypoints else 0
                total_created += count
                logger.info(f"[Waypoint BG] Memory {memory_id[:8]}... created {count} waypoints")
        except Exception as e:
            logger.error(f"[Waypoint BG] FAILED for memory {memory_id[:8]}...: {e}", exc_info=True)
            continue
    
    logger.info(f"[Waypoint BG] COMPLETED: {total_created} total waypoints for {len(memory_ids)} memories")


async def store_extracted_memories(
    session: AsyncSession,
    extracted: List[ExtractedMemoryItem],
    owner_id: str,
    user_id: str,
    end_user_id: Optional[str],
    app_id: Optional[str],
    api_key_id: Optional[str],
    source_uuid: Optional[str],
    background_tasks: BackgroundTasks,
    project_id: Optional[str] = None
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
    
    # Phase 1: Deduplicate and classify (no API calls)
    unique_items = []  # (mem_item, simhash, sector, additional_sectors, initial_salience)
    
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
        initial_salience = calculate_initial_salience(sector, additional_sectors)
        unique_items.append((mem_item, simhash, sector, additional_sectors, initial_salience))
    
    # Phase 2: Generate all embeddings in parallel
    if not unique_items:
        await session.commit()
        return (0, skipped_count, [])
    
    contents_to_embed = [item[0].content.strip() for item in unique_items]
    try:
        embeddings_results = await asyncio.gather(
            *[embedding_service.embed(c) for c in contents_to_embed],
            return_exceptions=True
        )
    except Exception as e:
        logger.error(f"Batch embedding generation failed: {e}")
        embeddings_results = [e] * len(contents_to_embed)
    
    # Phase 3: Create memory objects with embeddings
    for i, (mem_item, simhash, sector, additional_sectors, initial_salience) in enumerate(unique_items):
        mem_content = mem_item.content.strip()
        
        # Check embedding result
        emb_result = embeddings_results[i]
        if isinstance(emb_result, Exception):
            logger.error(f"Failed to generate embedding for memory: {emb_result}")
            continue
        embedding, dim = emb_result
        
        # Create memory
        memory_id = str(uuid.uuid4())
        
        memory = Memory(
            id=memory_id,
            content=mem_content,
            simhash=simhash,
            sector=sector,
            salience=initial_salience,
            tags=mem_item.tags or [],
            extra_metadata={},
            source_app=app_id,
            user_id=user_id,
            owner_id=owner_id,
            end_user_id=end_user_id,
            api_key_id=api_key_id,
            project_id=project_id,
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
    
    # Create source links in batch for better performance
    if source_uuid and memory_ids:
        for mem_id in memory_ids:
            source_link = MemorySource(
                id=str(uuid.uuid4()),
                memory_id=mem_id,
                source_id=source_uuid,
                created_at=datetime.utcnow()  # Explicitly set to avoid NULL constraint violation
            )
            session.add(source_link)
        # Single commit for all links - much faster than individual commits
        await session.commit()
    
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
    
    Returns immediately after saving raw source (~1-2s).
    All heavy processing (worthiness, summary, extraction, embeddings, waypoints)
    runs in the background.
    
    Use POST /memories for explicit, known memories.
    Use this endpoint for intelligent extraction from raw content.
    
    Can be disabled via user settings: {"ingest_enabled": false}
    """
    user, api_key, source_app = user_info
    owner_id = str(user.id)
    content = request.content
    create_source = request.create_source
    
    # Get or create end_user (fast DB lookup)
    end_user = await get_or_create_end_user(
        session=session,
        owner_id=owner_id,
        external_user_id=request.user_id or "anonymous"
    )

    source_uuid: Optional[str] = None

    if create_source:
        # Save raw source IMMEDIATELY (no LLM calls)
        source_uuid = str(uuid.uuid4())
        source = Source(
            id=source_uuid,
            owner_id=owner_id,
            end_user_id=str(end_user.id),
            project_id=request.project_id,
            type="text",
            source_app=request.app_id or source_app,
            title="Processing...",  # Will be updated by background task
            raw_content={"content": content},
            summary=None,  # Will be filled by background task
            summary_embedding=None,  # Will be filled by background task
            source_metadata={},
            external_ref=request.source_id,
            api_key_id=str(api_key.id) if api_key else None,
            event_at=datetime.utcnow(),
            ingested_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(source)
        await session.commit()
    
    # Schedule ALL heavy processing as background task
    background_tasks.add_task(
        _process_text_background,
        source_id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        user_id=request.user_id or "anonymous",
        project_id=request.project_id,
        app_id=request.app_id or source_app,
        api_key_id=str(api_key.id) if api_key else None,
        content=content,
        create_source=create_source,
        source_metadata=getattr(request, 'source_metadata', None),
    )
    
    # Return immediately
    return IngestResponse(
        stored=0,  # Will be processed in background
        skipped=0,
        memory_ids=[],
        tokens_used=0,
        source_id=source_uuid,
        source_title="Processing..."
    )


async def _process_text_background(
    source_id: Optional[str],
    owner_id: str,
    end_user_id: str,
    user_id: str,
    project_id: Optional[str],
    app_id: Optional[str],
    api_key_id: Optional[str],
    content: str,
    create_source: bool,
    source_metadata: Optional[Dict[str, Any]] = None,
):
    """
    Background task for text ingestion. Same pattern as _process_chat_background.
    
    Steps:
    1. Check worthiness (fast LLM call)
    2. If worthy: summary + extract memories in PARALLEL
    3. Update source with summary + embedding
    4. Deduplicate, embed, and store memories (batched)
    5. Entity/fact extraction (non-critical)
    6. Build waypoints
    """
    log_prefix = f"[IngestTextBG] Source {source_id[:8] if source_id else 'none'}:"
    logger.info(f"{log_prefix} Starting background processing...")
    
    try:
        extractor = get_extractor()
        summarizer = SourceSummarizer()
        embedding_service = get_embedding_service()
        
        # Step 1: Check worthiness
        worthiness = await extractor.check_worthiness(content)
        
        if not worthiness.is_worth_remembering:
            logger.info(f"{log_prefix} Not worth remembering: {worthiness.reason}")
            # Log it
            async with AsyncSessionLocal() as session:
                log = ProcessingLog(
                    id=str(uuid.uuid4()),
                    owner_id=owner_id,
                    api_key_id=api_key_id,
                    raw_content_hash=compute_simhash(content),
                    processed_at=datetime.utcnow(),
                    was_worth_remembering=False,
                    reason=worthiness.reason,
                    extracted_count=0
                )
                session.add(log)
                # If source was created, update title to indicate not worth remembering
                if source_id:
                    await session.execute(
                        update(Source).where(Source.id == source_id)
                        .values(title="(Not worth remembering)", updated_at=datetime.utcnow())
                    )
                await session.commit()
            return
        
        # Step 2: Run summary + memory extraction in PARALLEL
        summary_task = summarizer.summarize_and_embed(content, "text", metadata=source_metadata)
        extraction_task = extractor.extract_memories(content, metadata=source_metadata)
        
        (summary, summary_embedding, summary_tokens), extraction = await asyncio.gather(
            summary_task, extraction_task
        )
        
        logger.info(f"{log_prefix} summary done, memories={len(extraction.memories)}")
        
        # Step 3: Update source with summary + embedding
        if source_id and create_source:
            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(Source).where(Source.id == source_id)
                    .values(
                        title=content[:100].strip(),  # Use first 100 chars as title
                        summary=summary,
                        summary_embedding=summary_embedding,
                        updated_at=datetime.utcnow()
                    )
                )
                await session.commit()
        
        # Step 4: Store extracted memories
        if extraction.memories:
            async with AsyncSessionLocal() as session:
                # Pre-fetch existing memories for deduplication
                stmt = select(Memory).where(
                    Memory.simhash.isnot(None),
                    Memory.is_active == True,
                    Memory.owner_id == owner_id,
                    Memory.user_id == user_id
                ).order_by(Memory.salience.desc()).limit(500)
                
                result = await session.execute(stmt)
                existing_memories = result.scalars().all()
                simhash_to_memory = {em.simhash: em for em in existing_memories if em.simhash}
                
                # Phase 1: Deduplicate and classify
                unique_items = []
                skipped_count = 0
                
                for mem_item in extraction.memories:
                    mem_content = mem_item.content.strip()
                    if not mem_content:
                        continue
                    
                    simhash = compute_simhash(mem_content)
                    is_duplicate = False
                    for existing_hash, existing_mem in simhash_to_memory.items():
                        if hamming_distance(simhash, existing_hash) <= 3:
                            existing_mem.salience = min(1.0, (existing_mem.salience or 0.5) + 0.15)
                            existing_mem.last_seen_at = datetime.utcnow()
                            skipped_count += 1
                            is_duplicate = True
                            break
                    
                    if is_duplicate:
                        continue
                    
                    sector, additional_sectors, confidence = classify_sector(mem_content)
                    decay_lambda = get_sector_decay_lambda(sector)
                    initial_salience = calculate_initial_salience(sector, additional_sectors)
                    memory_type = classify_memory_type(mem_content, sector)
                    priority = determine_priority(memory_type, initial_salience, sector)
                    unique_items.append((mem_item, simhash, sector, decay_lambda, initial_salience, memory_type, priority))
                
                if not unique_items:
                    await session.commit()
                    logger.info(f"{log_prefix} all {skipped_count} memories were duplicates")
                else:
                    # Phase 2: Generate all embeddings in parallel
                    contents = [item[0].content.strip() for item in unique_items]
                    embeddings_results = await asyncio.gather(
                        *[embedding_service.embed(c) for c in contents],
                        return_exceptions=True
                    )
                    
                    # Phase 3: Create memory objects
                    memory_ids = []
                    stored_count = 0
                    
                    for i, (mem_item, simhash, sector, initial_salience) in enumerate(unique_items):
                        emb_result = embeddings_results[i]
                        if isinstance(emb_result, Exception):
                            logger.error(f"{log_prefix} Embedding failed: {emb_result}")
                            continue
                        embedding, dim = emb_result
                        
                        memory_id = str(uuid.uuid4())
                        memory = Memory(
                            id=memory_id,
                            content=mem_item.content.strip(),
                            simhash=simhash,
                            sector=sector,
                            salience=initial_salience,
                            tags=mem_item.tags or [],
                            extra_metadata={},
                            source_app=app_id,
                            user_id=user_id,
                            end_user_id=end_user_id,
                            owner_id=owner_id,
                            api_key_id=api_key_id,
                            project_id=project_id,
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
                        stored_count += 1
                    
                    # Link memories to source
                    if source_id:
                        for mid in memory_ids:
                            ms = MemorySource(
                                id=str(uuid.uuid4()),
                                memory_id=mid,
                                source_id=source_id,
                                created_at=datetime.utcnow()
                            )
                            session.add(ms)
                    
                    # Single commit for all memories and links
                    await session.commit()
                    logger.info(f"{log_prefix} stored {stored_count}, skipped {skipped_count}")
                    
                    # Step 5: Build waypoints
                    if memory_ids:
                        try:
                            async with AsyncSessionLocal() as wp_session:
                                total_created = 0
                                for mid in memory_ids[:MAX_WAYPOINTS_PER_INGEST]:
                                    try:
                                        from app.core.waypoints import create_waypoint_for_memory
                                        count = await create_waypoint_for_memory(wp_session, mid, owner_id)
                                        total_created += count
                                    except Exception as e:
                                        logger.error(f"{log_prefix} Waypoint failed for {mid[:8]}: {e}")
                                logger.info(f"{log_prefix} Created {total_created} waypoints")
                        except Exception as e:
                            logger.error(f"{log_prefix} Waypoint task failed: {e}")
        
        # Step 6: Entity extraction (non-critical, best-effort)
        # Note: Fact extraction removed in schema cleanup (2026-04-24)
        if source_id:
            try:
                entity_extractor = EntityExtractor()
                
                async with AsyncSessionLocal() as session:
                    extracted_entities = await entity_extractor.extract_entities(content, source_metadata)
                    entity_map = await entity_extractor.resolve_entities(
                        session, extracted_entities, owner_id, end_user_id
                    )
                    
                    if entity_map:
                        for entity in entity_map.values():
                            entity_source = EntitySource(
                                id=str(uuid.uuid4()),
                                entity_id=entity.id,
                                source_id=source_id,
                                created_at=datetime.utcnow()
                            )
                            session.add(entity_source)
                    
                    await session.commit()
                    logger.info(f"{log_prefix} Extracted {len(entity_map)} entities")
            except Exception as e:
                logger.error(f"{log_prefix} Entity extraction failed (non-fatal): {e}", exc_info=True)
        
        # Log processing
        async with AsyncSessionLocal() as session:
            log = ProcessingLog(
                id=str(uuid.uuid4()),
                owner_id=owner_id,
                api_key_id=api_key_id,
                raw_content_hash=compute_simhash(content),
                processed_at=datetime.utcnow(),
                was_worth_remembering=True,
                reason="Extracted successfully",
                extracted_count=len(extraction.memories) if extraction.memories else 0
            )
            session.add(log)
            await session.commit()
        
        logger.info(f"{log_prefix} COMPLETED")
        
    except Exception as e:
        logger.error(f"{log_prefix} FAILED: {e}", exc_info=True)


async def _process_chat_background(
    source_id: str,
    owner_id: str,
    end_user_id: str,
    user_id: str,
    project_id: Optional[str],
    app_id: Optional[str],
    api_key_id: Optional[str],
    conversation: str,
    messages: List[Dict[str, str]],
    source_metadata: Optional[Dict[str, Any]],
):
    """
    Background task that handles all heavy LLM processing for chat ingestion.
    Runs AFTER the endpoint has already returned a fast response to the client.
    
    Steps:
    1. Generate title + summary + extract memories (parallel LLM calls)
    2. Update source record with title, summary, embedding
    3. Deduplicate, embed, and store memories
    4. Build waypoints (semantic graph links)
    """
    logger.info(f"[IngestBG] Starting background processing for source {source_id[:8]}...")
    
    try:
        extractor = get_extractor()
        summarizer = SourceSummarizer()
        embedding_service = get_embedding_service()
        
        # Step 1: Run title, summary, and memory extraction in parallel
        title_task = summarizer.generate_title(conversation, "chat", metadata=source_metadata)
        summary_task = summarizer.summarize_and_embed(conversation, "chat", metadata=source_metadata)
        extraction_task = extractor.extract_memories(conversation, metadata=source_metadata)
        
        (generated_title, title_tokens), (summary, summary_embedding, summary_tokens), extraction = await asyncio.gather(
            title_task, summary_task, extraction_task
        )
        
        logger.info(f"[IngestBG] Source {source_id[:8]}: title='{generated_title}', memories={len(extraction.memories)}")
        
        # Step 2: Update source with title, summary, embedding
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Source)
                .where(Source.id == source_id)
                .values(
                    title=generated_title,
                    summary=summary,
                    summary_embedding=summary_embedding,
                    updated_at=datetime.utcnow()
                )
            )
            await session.commit()
        
        # Step 3: Store extracted memories (dedup + embed + save)
        if extraction.memories:
            async with AsyncSessionLocal() as session:
                # Pre-fetch existing memories for deduplication
                stmt = select(Memory).where(
                    Memory.simhash.isnot(None),
                    Memory.is_active == True,
                    Memory.owner_id == owner_id,
                    Memory.user_id == user_id
                ).order_by(Memory.salience.desc()).limit(500)
                
                result = await session.execute(stmt)
                existing_memories = result.scalars().all()
                simhash_to_memory = {em.simhash: em for em in existing_memories if em.simhash}
                
                # Phase 1: Deduplicate and classify
                unique_items = []
                skipped_count = 0
                
                for mem_item in extraction.memories:
                    mem_content = mem_item.content.strip()
                    if not mem_content:
                        continue
                    
                    simhash = compute_simhash(mem_content)
                    is_duplicate = False
                    for existing_hash, existing_mem in simhash_to_memory.items():
                        if hamming_distance(simhash, existing_hash) <= 3:
                            existing_mem.salience = min(1.0, (existing_mem.salience or 0.5) + 0.15)
                            existing_mem.last_seen_at = datetime.utcnow()
                            skipped_count += 1
                            is_duplicate = True
                            break
                    
                    if is_duplicate:
                        continue
                    
                    sector, additional_sectors, confidence = classify_sector(mem_content)
                    initial_salience = calculate_initial_salience(sector, additional_sectors)
                    unique_items.append((mem_item, simhash, sector, initial_salience))
                
                if not unique_items:
                    await session.commit()
                    logger.info(f"[IngestBG] Source {source_id[:8]}: all {skipped_count} memories were duplicates")
                    return
                
                # Phase 2: Generate all embeddings in parallel
                contents = [item[0].content.strip() for item in unique_items]
                embeddings_results = await asyncio.gather(
                    *[embedding_service.embed(c) for c in contents],
                    return_exceptions=True
                )
                
                # Phase 3: Create memory objects
                memory_ids = []
                stored_count = 0
                
                for i, (mem_item, simhash, sector, initial_salience) in enumerate(unique_items):
                    emb_result = embeddings_results[i]
                    if isinstance(emb_result, Exception):
                        logger.error(f"[IngestBG] Embedding failed: {emb_result}")
                        continue
                    embedding, dim = emb_result
                    
                    memory_id = str(uuid.uuid4())
                    memory = Memory(
                        id=memory_id,
                        content=mem_item.content.strip(),
                        simhash=simhash,
                        sector=sector,
                        salience=initial_salience,
                        tags=mem_item.tags or [],
                        extra_metadata={},
                        source_app=app_id,
                        user_id=user_id,
                        owner_id=owner_id,
                        end_user_id=end_user_id,
                        api_key_id=api_key_id,
                        project_id=project_id,
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
                    stored_count += 1
                
                # Link memories to source
                for mid in memory_ids:
                    ms = MemorySource(
                        id=str(uuid.uuid4()),
                        memory_id=mid,
                        source_id=source_id,
                        created_at=datetime.utcnow()
                    )
                    session.add(ms)
                
                await session.commit()
                
                logger.info(f"[IngestBG] Source {source_id[:8]}: stored {stored_count}, skipped {skipped_count}")
                
                # Step 4: Build waypoints (semantic graph links)
                if memory_ids:
                    try:
                        async with AsyncSessionLocal() as wp_session:
                            total_created = 0
                            for mid in memory_ids[:MAX_WAYPOINTS_PER_INGEST]:
                                try:
                                    from app.core.waypoints import create_waypoint_for_memory
                                    count = await create_waypoint_for_memory(wp_session, mid, owner_id)
                                    total_created += count
                                except Exception as e:
                                    logger.error(f"[IngestBG] Waypoint failed for {mid[:8]}: {e}")
                            logger.info(f"[IngestBG] Created {total_created} waypoints for {len(memory_ids)} memories")
                    except Exception as e:
                        logger.error(f"[IngestBG] Waypoint task failed: {e}")
        else:
            logger.info(f"[IngestBG] Source {source_id[:8]}: no memories extracted")
        
        # Log processing
        async with AsyncSessionLocal() as log_session:
            log = ProcessingLog(
                id=str(uuid.uuid4()),
                owner_id=owner_id,
                api_key_id=api_key_id,
                raw_content_hash=compute_simhash(conversation[:500]),
                processed_at=datetime.utcnow(),
                was_worth_remembering=True if extraction.memories else False,
                reason="Extracted successfully" if extraction.memories else "No memories extracted",
                extracted_count=stored_count if extraction.memories else 0
            )
            log_session.add(log)
            await log_session.commit()
        
        logger.info(f"[IngestBG] COMPLETED for source {source_id[:8]}")
        
    except Exception as e:
        logger.error(f"[IngestBG] FAILED for source {source_id[:8]}: {e}", exc_info=True)


@router.post("/ingest/chat", response_model=IngestResponse)
async def ingest_chat(
    request: IngestChatRequest,
    background_tasks: BackgroundTasks,
    user_info: tuple = Depends(get_ingest_auth),
    session: AsyncSession = Depends(get_db)
):
    """
    Ingest chat messages and extract memories using LLM.
    
    Returns immediately after storing raw source (~2s).
    All heavy processing (title, summary, extraction, embeddings, waypoints)
    runs in the background.
    """
    user, api_key, source_app = user_info
    owner_id = str(user.id)
    
    # Combine messages into conversation text
    conversation = "\n".join([
        f"{msg.get('role', 'user')}: {msg.get('content', '')}"
        for msg in request.messages
    ])
    
    # Source-level dedup: reject if same URL ingested by same user within 60s
    source_url = (request.source_metadata or {}).get("url")
    if source_url:
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(seconds=60)
        dup_check = await session.execute(
            select(Source.id, Source.title)
            .where(
                Source.owner_id == owner_id,
                Source.type == "chat",
                Source.source_metadata["url"].astext == source_url,
                Source.created_at >= cutoff
            )
            .limit(1)
        )
        existing = dup_check.first()
        if existing:
            logger.info(f"[Ingest] Duplicate chat blocked: URL={source_url} already ingested as {existing.id}")
            return IngestResponse(
                stored=0,
                skipped=0,
                memory_ids=[],
                tokens_used=0,
                source_id=str(existing.id),
                source_title=existing.title
            )
    
    # Get or create end_user (fast DB lookup)
    end_user = await get_or_create_end_user(
        session=session,
        owner_id=owner_id,
        external_user_id=request.user_id or "anonymous"
    )
    
    # Create source with raw content immediately (no LLM calls)
    source_uuid = str(uuid.uuid4())
    # Generate a quick title from metadata or first message (no LLM)
    quick_title = (request.source_metadata or {}).get("title") or "Processing..."
    
    source = Source(
        id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        project_id=request.project_id,
        type="chat",
        source_app=request.app_id or source_app,
        title=quick_title,  # Will be updated by background task
        raw_content={"messages": request.messages},
        summary=None,  # Will be filled by background task
        summary_embedding=None,  # Will be filled by background task
        source_metadata=request.source_metadata or {},
        external_ref=request.source_id,
        api_key_id=str(api_key.id) if api_key else None,
        event_at=datetime.utcnow(),
        ingested_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    session.add(source)
    await session.commit()
    
    logger.info(f"[Ingest] Source {source_uuid[:8]} saved, scheduling background processing...")
    
    # Schedule ALL heavy processing as background task
    background_tasks.add_task(
        _process_chat_background,
        source_id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        user_id=request.user_id or "anonymous",
        project_id=request.project_id,
        app_id=request.app_id or source_app,
        api_key_id=str(api_key.id) if api_key else None,
        conversation=conversation,
        messages=request.messages,
        source_metadata=request.source_metadata,
    )
    
    # Return immediately - memories will be processed in background
    return IngestResponse(
        stored=0,  # Will be processed in background
        skipped=0,
        memory_ids=[],
        tokens_used=0,
        source_id=source_uuid,
        source_title=quick_title
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
    
    Returns immediately after saving raw source (~1-2s).
    All heavy processing (worthiness, summary, chunked extraction, embeddings, waypoints)
    runs in the background.
    
    Can be disabled via user settings: {"ingest_enabled": false}
    """
    user, api_key, source_app = user_info
    owner_id = str(user.id)
    content = request.content
    
    # Add title context if provided
    if request.title:
        content = f"Document: {request.title}\n\n{content}"
    
    # Get or create end_user (fast DB lookup)
    end_user = await get_or_create_end_user(
        session=session,
        owner_id=owner_id,
        external_user_id=request.user_id or "anonymous"
    )
    
    # Save raw source IMMEDIATELY (no LLM calls)
    source_uuid = str(uuid.uuid4())
    quick_title = request.title or "Processing..."
    source = Source(
        id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        project_id=request.project_id,
        type="document",
        source_app=request.app_id or source_app,
        title=quick_title,
        raw_content={"content": request.content},
        summary=None,  # Will be filled by background task
        summary_embedding=None,  # Will be filled by background task
        source_metadata={},
        external_ref=request.source_id,
        api_key_id=str(api_key.id) if api_key else None,
        event_at=datetime.utcnow(),
        ingested_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    session.add(source)
    await session.commit()
    
    # Schedule ALL heavy processing as background task
    background_tasks.add_task(
        _process_document_background,
        source_id=source_uuid,
        owner_id=owner_id,
        end_user_id=str(end_user.id),
        user_id=request.user_id or "anonymous",
        project_id=request.project_id,
        app_id=request.app_id or source_app,
        api_key_id=str(api_key.id) if api_key else None,
        content=content,
        title=request.title,
    )
    
    # Return immediately
    return IngestResponse(
        stored=0,  # Will be processed in background
        skipped=0,
        memory_ids=[],
        tokens_used=0,
        source_id=source_uuid,
        source_title=quick_title
    )


async def _process_document_background(
    source_id: str,
    owner_id: str,
    end_user_id: str,
    user_id: str,
    project_id: Optional[str],
    app_id: Optional[str],
    api_key_id: Optional[str],
    content: str,
    title: Optional[str] = None,
):
    """
    Background task for document ingestion.
    
    Steps:
    1. Check worthiness on first 10k chars
    2. Summary + embed
    3. Chunk document and extract memories from each chunk
    4. Deduplicate, embed, and store memories (batched per chunk)
    5. Build waypoints
    """
    log_prefix = f"[IngestDocBG] Source {source_id[:8]}:"
    logger.info(f"{log_prefix} Starting background processing...")
    
    try:
        extractor = get_extractor()
        summarizer = SourceSummarizer()
        embedding_service = get_embedding_service()
        
        # Step 1: Check worthiness
        worthiness_sample = content[:10000]
        worthiness = await extractor.check_worthiness(worthiness_sample)
        
        if not worthiness.is_worth_remembering:
            logger.info(f"{log_prefix} Not worth remembering: {worthiness.reason}")
            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(Source).where(Source.id == source_id)
                    .values(title=title or "(Not worth remembering)", updated_at=datetime.utcnow())
                )
                await session.commit()
            return
        
        # Step 2: Generate summary + embedding
        summary, summary_embedding, _ = await summarizer.summarize_and_embed(content, "document")
        
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Source).where(Source.id == source_id)
                .values(
                    title=title or content[:100].strip(),
                    summary=summary,
                    summary_embedding=summary_embedding,
                    updated_at=datetime.utcnow()
                )
            )
            await session.commit()
        
        # Step 3: Process in chunks
        max_chunk_size = 10000
        chunks = [content[i:i+max_chunk_size] for i in range(0, len(content), max_chunk_size)]
        
        all_memory_ids = []
        total_stored = 0
        
        for chunk_idx, chunk in enumerate(chunks):
            extraction = await extractor.extract_memories(chunk)
            
            if not extraction.memories:
                continue
            
            async with AsyncSessionLocal() as session:
                # Pre-fetch existing memories for deduplication
                stmt = select(Memory).where(
                    Memory.simhash.isnot(None),
                    Memory.is_active == True,
                    Memory.owner_id == owner_id,
                    Memory.user_id == user_id
                ).order_by(Memory.salience.desc()).limit(500)
                
                result = await session.execute(stmt)
                existing_memories = result.scalars().all()
                simhash_to_memory = {em.simhash: em for em in existing_memories if em.simhash}
                
                # Deduplicate and classify
                unique_items = []
                for mem_item in extraction.memories:
                    mem_content = mem_item.content.strip()
                    if not mem_content:
                        continue
                    
                    simhash = compute_simhash(mem_content)
                    is_duplicate = any(
                        hamming_distance(simhash, eh) <= 3 for eh in simhash_to_memory.keys()
                    )
                    if is_duplicate:
                        continue
                    
                    sector, additional_sectors, _ = classify_sector(mem_content)
                    initial_salience = calculate_initial_salience(sector, additional_sectors)
                    unique_items.append((mem_item, simhash, sector, initial_salience))
                    simhash_to_memory[simhash] = True
                
                if not unique_items:
                    continue
                
                # Batch embed
                contents_to_embed = [item[0].content.strip() for item in unique_items]
                embeddings_results = await asyncio.gather(
                    *[embedding_service.embed(c) for c in contents_to_embed],
                    return_exceptions=True
                )
                
                # Create memories
                chunk_memory_ids = []
                for i, (mem_item, simhash, sector, initial_salience) in enumerate(unique_items):
                    emb_result = embeddings_results[i]
                    if isinstance(emb_result, Exception):
                        continue
                    embedding, _ = emb_result
                    
                    memory_id = str(uuid.uuid4())
                    memory = Memory(
                        id=memory_id,
                        content=mem_item.content.strip(),
                        simhash=simhash,
                        sector=sector,
                        salience=initial_salience,
                        tags=mem_item.tags or [],
                        extra_metadata={},
                        source_app=app_id,
                        user_id=user_id,
                        owner_id=owner_id,
                        end_user_id=end_user_id,
                        api_key_id=api_key_id,
                        project_id=project_id,
                        embedding=embedding,
                        embedding_model=settings.EMBEDDING_MODEL,
                        is_active=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                        last_seen_at=datetime.utcnow()
                    )
                    session.add(memory)
                    chunk_memory_ids.append(memory_id)
                    total_stored += 1
                
                # Link to source
                for mid in chunk_memory_ids:
                    ms = MemorySource(
                        id=str(uuid.uuid4()),
                        memory_id=mid,
                        source_id=source_id,
                        created_at=datetime.utcnow()
                    )
                    session.add(ms)
                
                await session.commit()
                all_memory_ids.extend(chunk_memory_ids)
            
            logger.info(f"{log_prefix} Chunk {chunk_idx+1}/{len(chunks)}: stored {len(chunk_memory_ids)} memories")
        
        # Step 4: Build waypoints
        if all_memory_ids:
            try:
                async with AsyncSessionLocal() as wp_session:
                    total_wp = 0
                    for mid in all_memory_ids[:MAX_WAYPOINTS_PER_INGEST]:
                        try:
                            from app.core.waypoints import create_waypoint_for_memory
                            count = await create_waypoint_for_memory(wp_session, mid, owner_id)
                            total_wp += count
                        except Exception as e:
                            logger.error(f"{log_prefix} Waypoint failed for {mid[:8]}: {e}")
                    logger.info(f"{log_prefix} Created {total_wp} waypoints")
            except Exception as e:
                logger.error(f"{log_prefix} Waypoint task failed: {e}")
        
        # Log processing
        async with AsyncSessionLocal() as log_session:
            log = ProcessingLog(
                id=str(uuid.uuid4()),
                owner_id=owner_id,
                api_key_id=api_key_id,
                raw_content_hash=compute_simhash(content[:500]),
                processed_at=datetime.utcnow(),
                was_worth_remembering=total_stored > 0,
                reason=f"Extracted {total_stored} memories from {len(chunks)} chunks" if total_stored > 0 else "No memories extracted",
                extracted_count=total_stored
            )
            log_session.add(log)
            await log_session.commit()
        
        logger.info(f"{log_prefix} COMPLETED: {total_stored} memories from {len(chunks)} chunks")
        
    except Exception as e:
        logger.error(f"{log_prefix} FAILED: {e}", exc_info=True)
