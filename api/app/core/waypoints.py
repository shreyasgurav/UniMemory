"""
Waypoint creation and management
"""
from typing import List, Tuple, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
import numpy as np
import uuid
from datetime import datetime
import logging

from app.db.models import Memory, Waypoint

logger = logging.getLogger(__name__)

MIN_SIMILARITY_THRESHOLD = 0.35  # Lowered from 0.5 - create more connections
MAX_WAYPOINTS_PER_MEMORY = 8  # Create up to 8 waypoints per memory (increased for cross-doc)


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
            src_id = min(new_memory_id, target_id)
            dst_id = max(new_memory_id, target_id)
            
            # Check if waypoint already exists (in either direction)
            existing_stmt = select(Waypoint).where(
                or_(
                    and_(Waypoint.src_id == src_id, Waypoint.dst_id == dst_id),
                    and_(Waypoint.src_id == dst_id, Waypoint.dst_id == src_id)
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
                # Create new waypoint
                waypoint = Waypoint(
                    id=str(uuid.uuid4()),
                    src_id=src_id,
                    dst_id=dst_id,
                    weight=float(similarity),
                    relationship_type='similar'
                )
                session.add(waypoint)
                created_waypoints.append(waypoint)
                waypoints_created += 1
                logger.info(f"[Waypoint] {src_id[:8]}... ↔ {dst_id[:8]}... (sim: {similarity:.2f})")
        
        await session.flush()
        logger.info(f"Created {waypoints_created} waypoints for memory {new_memory_id[:8]}...")
        return created_waypoints
            
    except Exception as e:
        logger.error(f"[Waypoint] Failed to create waypoints: {e}")
        return []

