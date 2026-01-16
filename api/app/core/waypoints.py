"""
Waypoint creation and management
"""
from typing import List, Tuple, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import numpy as np
import uuid
from datetime import datetime

from app.db.models import Memory, Waypoint


MIN_SIMILARITY_THRESHOLD = 0.5  # Minimum similarity to create waypoint


async def create_waypoint_for_memory(
    session: AsyncSession,
    new_memory_id: str,
    new_embedding: List[float],
    user_id: str,
    limit: int = 10  # Reduced from 1000 - only check top 10 similar memories
) -> Optional[Waypoint]:
    """
    Find most similar existing memory and create a waypoint link
    
    OPTIMIZED: Uses pgvector cosine distance to find top similar memories
    instead of iterating through all memories
    """
    try:
        # Use pgvector to find top similar memories directly (MUCH faster)
        stmt = select(Memory).where(
            and_(
                Memory.id != new_memory_id,
                Memory.embedding.isnot(None),
                Memory.is_active == True,
                Memory.user_id == user_id
            )
        ).order_by(Memory.embedding.cosine_distance(new_embedding)).limit(limit)
        
        result = await session.execute(stmt)
        similar_memories = result.scalars().all()
        
        if not similar_memories:
            # No existing memories, create self-link
            waypoint = Waypoint(
                id=str(uuid.uuid4()),
                src_id=new_memory_id,
                dst_id=new_memory_id,
                weight=1.0
            )
            session.add(waypoint)
            await session.flush()
            return waypoint
        
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
        
        # Get the most similar memory (first result from ordered query)
        best_mem = similar_memories[0]
        best_target_id = str(best_mem.id)
        
        # Calculate actual similarity for weight
        try:
            if hasattr(best_mem.embedding, 'tolist'):
                mem_embedding = best_mem.embedding.tolist()
            else:
                mem_embedding = list(best_mem.embedding)
            best_similarity = cosine_similarity(new_embedding, mem_embedding)
        except Exception:
            best_similarity = 0.6  # Default if calculation fails
        
        # Create waypoint if similarity is above threshold
        if best_target_id and best_similarity >= MIN_SIMILARITY_THRESHOLD:
            # Check if waypoint already exists
            existing_stmt = select(Waypoint).where(
                and_(
                    Waypoint.src_id == new_memory_id,
                    Waypoint.dst_id == best_target_id
                )
            )
            existing_result = await session.execute(existing_stmt)
            existing_waypoint = existing_result.scalar_one_or_none()
            
            if existing_waypoint:
                # Update weight
                existing_waypoint.weight = float(best_similarity)
                existing_waypoint.updated_at = datetime.utcnow()
                await session.flush()
                return existing_waypoint
            else:
                # Create new waypoint
                waypoint = Waypoint(
                    id=str(uuid.uuid4()),
                    src_id=new_memory_id,
                    dst_id=best_target_id,
                    weight=float(best_similarity)
                )
                session.add(waypoint)
                await session.flush()
                print(f"[Waypoint] Created: {new_memory_id} → {best_target_id} (sim: {best_similarity:.2f})")
                return waypoint
        else:
            # No good match, create self-link (OpenMemory style)
            waypoint = Waypoint(
                id=str(uuid.uuid4()),
                src_id=new_memory_id,
                dst_id=new_memory_id,
                weight=1.0
            )
            session.add(waypoint)
            await session.flush()
            return waypoint
            
    except Exception as e:
        print(f"[Waypoint] Failed to create waypoint: {e}")
        return None

