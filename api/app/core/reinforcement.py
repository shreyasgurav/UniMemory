"""
Coactivation and reinforcement learning for memories (Hebbian learning)
"""
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.sql import func
import math
import logging

from app.db.models import Memory, Waypoint

logger = logging.getLogger(__name__)


async def reinforce_memories(
    session: AsyncSession,
    recalled_memory_ids: List[str],
    query: Optional[str] = None
) -> None:
    """
    Called after memories are recalled and used.
    Implements Hebbian learning: "neurons that fire together wire together"
    
    Args:
        session: Database session
        recalled_memory_ids: List of memory IDs that were recalled
        query: Optional search query that triggered the recall
    """
    if not recalled_memory_ids:
        return
    
    try:
        # 1. Increment recall_count and update last_recalled_at
        await session.execute(
            update(Memory)
            .where(Memory.id.in_(recalled_memory_ids))
            .values(
                recall_count=Memory.recall_count + 1,
                last_recalled_at=datetime.utcnow(),
                coactivation_score=func.least(Memory.coactivation_score + 0.05, 1.0)
            )
        )
        
        # 2. Boost salience for frequently recalled memories (threshold: 10 recalls)
        await session.execute(
            update(Memory)
            .where(Memory.id.in_(recalled_memory_ids))
            .where(Memory.recall_count >= 10)
            .values(salience=func.least(Memory.salience + 0.02, 1.0))
        )
        
        # 3. Promote to core memory if very frequently recalled (threshold: 20 recalls + high salience)
        await session.execute(
            update(Memory)
            .where(Memory.id.in_(recalled_memory_ids))
            .where(Memory.recall_count >= 20)
            .where(Memory.salience >= 0.8)
            .values(priority='core')
        )
        
        # 4. Strengthen waypoints between co-recalled memories
        if len(recalled_memory_ids) > 1:
            await strengthen_waypoints(session, recalled_memory_ids)
        
        # Commit the reinforcement changes
        await session.commit()
        
        logger.info(f"Reinforced {len(recalled_memory_ids)} memories after recall")
        
    except Exception as e:
        logger.error(f"Failed to reinforce memories: {e}")
        await session.rollback()


async def strengthen_waypoints(
    session: AsyncSession,
    memory_ids: List[str]
) -> None:
    """
    Strengthen waypoints between co-recalled memories.
    Creates new waypoints if they don't exist.
    
    Args:
        session: Database session
        memory_ids: List of memory IDs that were co-recalled
    """
    # Process all pairs of memories
    for i, mem1 in enumerate(memory_ids):
        for mem2 in memory_ids[i+1:]:
            # Ensure consistent ordering (smaller ID first)
            src_id = min(mem1, mem2)
            dst_id = max(mem1, mem2)
            
            # Check if waypoint exists
            stmt = select(Waypoint).where(
                Waypoint.src_id == src_id,
                Waypoint.dst_id == dst_id
            )
            result = await session.execute(stmt)
            waypoint = result.scalar_one_or_none()
            
            if waypoint:
                # Strengthen existing waypoint
                waypoint.coactivation_count += 1
                waypoint.weight = min(waypoint.weight + 0.05, 1.0)
                waypoint.last_coactivated_at = datetime.utcnow()
                
                # Update relationship type if frequently co-activated
                if waypoint.coactivation_count >= 5 and waypoint.relationship_type == 'similar':
                    waypoint.relationship_type = 'causal'  # They often appear together
                
            else:
                # Create new waypoint with low initial weight
                from uuid import uuid4
                new_waypoint = Waypoint(
                    id=str(uuid4()),
                    src_id=src_id,
                    dst_id=dst_id,
                    weight=0.3,
                    coactivation_count=1,
                    last_coactivated_at=datetime.utcnow(),
                    relationship_type='similar',
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_waypoint)


def calculate_coactivation_boost(memory: Memory) -> float:
    """
    Calculate boost score for frequently recalled memories.
    Uses logarithmic scale to avoid over-boosting.
    
    Args:
        memory: Memory object with recall_count
        
    Returns:
        Boost score between 0.0 and 0.5
    """
    if not memory.recall_count or memory.recall_count == 0:
        return 0.0
    
    # Logarithmic scale:
    # 1 recall = 0.05
    # 10 recalls = 0.10
    # 100 recalls = 0.15
    # 1000 recalls = 0.20
    boost = math.log10(memory.recall_count + 1) * 0.05
    
    # Cap at 0.5 to prevent over-dominance
    return min(boost, 0.5)


def calculate_temporal_decay(memory: Memory, current_time: datetime) -> float:
    """
    Apply time-based decay to memory salience.
    Uses sector-specific decay rates.
    
    Args:
        memory: Memory object with sector and decay_lambda
        current_time: Current timestamp
        
    Returns:
        Decay factor between 0.0 and 1.0
    """
    if not memory.last_seen_at:
        memory.last_seen_at = memory.created_at
    
    # Calculate age in hours
    age_hours = (current_time - memory.last_seen_at).total_seconds() / 3600
    
    # Apply exponential decay with sector-specific rate
    decay_lambda = memory.decay_lambda or 0.02
    decay_factor = math.exp(-decay_lambda * age_hours)
    
    return decay_factor


def calculate_effective_salience(
    memory: Memory,
    current_time: Optional[datetime] = None
) -> float:
    """
    Calculate effective salience combining base salience, decay, and coactivation.
    
    Args:
        memory: Memory object
        current_time: Current timestamp (defaults to now)
        
    Returns:
        Effective salience score between 0.0 and 1.0
    """
    if current_time is None:
        current_time = datetime.utcnow()
    
    # Apply temporal decay
    decay_factor = calculate_temporal_decay(memory, current_time)
    base_salience = (memory.salience or 0.5) * decay_factor
    
    # Add coactivation boost
    coactivation_boost = calculate_coactivation_boost(memory)
    
    # Combine scores
    effective_salience = base_salience + coactivation_boost
    
    # Cap at 1.0
    return min(1.0, effective_salience)


def get_core_memory_filter():
    """
    Get SQLAlchemy filter for core memories.
    Core memories are high-priority and should always be in context.
    
    Returns:
        SQLAlchemy filter expression
    """
    from sqlalchemy import or_, and_
    
    return or_(
        # Explicitly marked as core
        Memory.priority == 'core',
        
        # High-salience preferences
        and_(
            Memory.memory_type == 'preference',
            Memory.salience >= 0.8
        ),
        
        # Frequently recalled with high salience
        and_(
            Memory.recall_count >= 10,
            Memory.salience >= 0.7
        )
    )


async def get_core_memories(
    session: AsyncSession,
    owner_id: str,
    limit: int = 20
) -> List[Memory]:
    """
    Get core memories for a user.
    These are always included in LLM context.
    
    Args:
        session: Database session
        owner_id: User ID
        limit: Maximum number of core memories
        
    Returns:
        List of core Memory objects
    """
    stmt = (
        select(Memory)
        .where(Memory.owner_id == owner_id)
        .where(Memory.is_active == True)
        .where(Memory.valid_to == None)  # Only current facts
        .where(get_core_memory_filter())
        .order_by(Memory.salience.desc())
        .limit(limit)
    )
    
    result = await session.execute(stmt)
    return result.scalars().all()


async def decay_old_memories(
    session: AsyncSession,
    owner_id: str,
    threshold_salience: float = 0.1
) -> int:
    """
    Background job to decay old memories and deactivate very low salience ones.
    Should be run periodically (e.g., daily).
    
    Args:
        session: Database session
        owner_id: User ID
        threshold_salience: Memories below this salience are deactivated
        
    Returns:
        Number of memories deactivated
    """
    current_time = datetime.utcnow()
    deactivated_count = 0
    
    # Get all active memories
    stmt = (
        select(Memory)
        .where(Memory.owner_id == owner_id)
        .where(Memory.is_active == True)
        .where(Memory.priority != 'core')  # Don't decay core memories
    )
    
    result = await session.execute(stmt)
    memories = result.scalars().all()
    
    for memory in memories:
        # Calculate effective salience with decay
        effective = calculate_effective_salience(memory, current_time)
        
        # Update salience to reflect decay
        memory.salience = effective
        
        # Deactivate if below threshold
        if effective < threshold_salience:
            memory.is_active = False
            memory.valid_to = current_time
            deactivated_count += 1
    
    await session.commit()
    
    logger.info(f"Decayed memories for user {owner_id}, deactivated {deactivated_count}")
    
    return deactivated_count
