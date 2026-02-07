"""
Waypoint creation and management

RESEARCH-BASED THRESHOLDS (Feb 2026):

1. EMBEDDING MODEL: text-embedding-3-small (1536 dims)
   - V3 models have MUCH lower similarity scores than ada-002
   - ada-002: avg similarity ~85%, threshold typically 0.79-0.85
   - text-embedding-3-small: avg similarity ~43%
   - Source: https://www.s-anand.net/blog/embeddings-similarity-threshold/

2. SIMILARITY EXAMPLES (text-embedding-3-small):
   - "apple" vs "orange" (related fruits): 45-47% similarity
   - "Jamaica" vs "apple" (unrelated): ~20% similarity
   - Related concepts: 45-55% similarity
   - Same topic: 55-70% similarity
   - Very similar: 70%+ similarity

3. OPTIMAL THRESHOLD: 0.50 (50%)
   - Captures: Same topic, closely related concepts
   - Filters: Unrelated items that share some words
   - Result: Meaningful clusters, not a hairball

4. MAX CONNECTIONS: 5 per memory
   - Miller's Law: Human working memory = 4-7 items
   - Graph theory: Optimal node degree = 4-6 for navigability
   - Neuroscience: Strong synaptic connections = 5-20 per neuron
   - Result: Clustered graph with clear associations
"""
from typing import List, Tuple, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, text
import numpy as np
import uuid
from datetime import datetime
import logging

from app.db.models import Memory, Waypoint

logger = logging.getLogger(__name__)

# RESEARCH-BASED VALUES (see docstring above for sources)
MIN_SIMILARITY_THRESHOLD = 0.50  # 50% - captures related concepts, filters noise
MAX_WAYPOINTS_PER_MEMORY = 5     # 5 connections - optimal for graph navigability


async def create_waypoint_for_memory(
    session: AsyncSession,
    new_memory_id: str,
    new_embedding: List[float],
    user_id: str,
    limit: int = 30  # Check top 30 similar memories (increased for cross-doc)
) -> List[Waypoint]:
    """
    Find similar memories and create multiple waypoint links (graph edges)
    
    OPTIMIZED: Uses pgvector cosine distance to find top similar memories
    Creates multiple waypoints to all sufficiently similar memories (not just one)
    """
    created_waypoints = []
    
    try:
        # Get the new memory to find its owner_id
        new_mem_result = await session.execute(
            select(Memory).where(Memory.id == new_memory_id)
        )
        new_memory = new_mem_result.scalar_one_or_none()
        
        if not new_memory:
            logger.warning(f"Memory {new_memory_id} not found for waypoint creation")
            return []
        
        # Use owner_id for filtering (works for both API and consumer)
        owner_id = new_memory.owner_id
        
        # Use pgvector to find top similar memories directly
        stmt = select(Memory).where(
            and_(
                Memory.id != new_memory_id,
                Memory.embedding.isnot(None),
                Memory.is_active == True,
                Memory.owner_id == owner_id  # Use owner_id instead of user_id
            )
        ).order_by(Memory.embedding.cosine_distance(new_embedding)).limit(limit)
        
        result = await session.execute(stmt)
        similar_memories = result.scalars().all()
        
        if not similar_memories:
            logger.info(f"No similar memories found for {new_memory_id[:8]}...")
            return []
        
        # Helper function for cosine similarity
        def cosine_similarity(a: List[float], b: List[float]) -> float:
            """Calculate cosine similarity between two vectors"""
            if not a or not b or len(a) != len(b):
                return 0.0
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = (sum(x * x for x in a)) ** 0.5
            norm_b = (sum(x * x for x in b)) ** 0.5
            if norm_a == 0 or norm_b == 0:
                return 0.0
            return dot / (norm_a * norm_b)
        
        # Create waypoints to ALL sufficiently similar memories (not just one)
        waypoints_created = 0
        
        for mem in similar_memories:
            if waypoints_created >= MAX_WAYPOINTS_PER_MEMORY:
                break
                
            target_id = str(mem.id)
            
            # Calculate similarity for weight
            try:
                if hasattr(mem.embedding, 'tolist'):
                    mem_embedding = mem.embedding.tolist()
                else:
                    mem_embedding = list(mem.embedding)
                similarity = cosine_similarity(new_embedding, mem_embedding)
            except Exception:
                similarity = 0.4  # Default if calculation fails
            
            # Only create waypoint if above threshold
            if similarity < MIN_SIMILARITY_THRESHOLD:
                continue
            
            # Consistent ordering (smaller ID first) for bidirectional lookup
            # Ensure IDs are strings for comparison and storage
            src_id_str = str(min(new_memory_id, target_id))
            dst_id_str = str(max(new_memory_id, target_id))
            
            # Check if waypoint already exists (in either direction)
            existing_stmt = select(Waypoint).where(
                or_(
                    and_(Waypoint.src_id == src_id_str, Waypoint.dst_id == dst_id_str),
                    and_(Waypoint.src_id == dst_id_str, Waypoint.dst_id == src_id_str)
                )
            )
            existing_result = await session.execute(existing_stmt)
            existing_waypoint = existing_result.scalar_one_or_none()
            
            if existing_waypoint:
                # Update weight if new similarity is higher
                if similarity > existing_waypoint.weight:
                    existing_waypoint.weight = float(similarity)
                    existing_waypoint.updated_at = datetime.utcnow()
                created_waypoints.append(existing_waypoint)
            else:
                # Create new waypoint using raw SQL to avoid SQLAlchemy 2.0 UUID mismatch issue
                waypoint_id = str(uuid.uuid4())
                await session.execute(
                    text("""
                        INSERT INTO waypoints (id, src_id, dst_id, weight, created_at, updated_at)
                        VALUES (:id, :src_id, :dst_id, :weight, NOW(), NOW())
                        ON CONFLICT (src_id, dst_id) DO UPDATE SET weight = GREATEST(waypoints.weight, :weight)
                    """),
                    {"id": waypoint_id, "src_id": src_id_str, "dst_id": dst_id_str, "weight": float(similarity)}
                )
                waypoints_created += 1
                logger.info(f"[Waypoint] {src_id_str[:8]}... ↔ {dst_id_str[:8]}... (sim: {similarity:.2f})")
        
        logger.info(f"Created {waypoints_created} waypoints for memory {new_memory_id[:8]}...")
        return created_waypoints
            
    except Exception as e:
        logger.error(f"[Waypoint] Failed to create waypoints: {e}")
        return []

