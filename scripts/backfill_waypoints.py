#!/usr/bin/env python3
"""
Backfill waypoints for existing memories
Run this script to create waypoint connections between all your existing memories
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from app.db.database import get_db_session
from app.db.models import Memory, User
from app.core.waypoints import create_waypoint_for_memory
from sqlalchemy import select
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def backfill_all_waypoints(owner_email: str, limit: int = 200):
    """
    Backfill waypoints for all memories belonging to a user
    
    Args:
        owner_email: Email of the user (from Firebase)
        limit: Maximum number of memories to process
    """
    async with get_db_session() as session:
        # Find user by email
        user_result = await session.execute(
            select(User).where(User.email == owner_email)
        )
        user = user_result.scalar_one_or_none()
        
        if not user:
            logger.error(f"User with email {owner_email} not found")
            return
        
        owner_id = str(user.id)
        logger.info(f"Found user: {user.email} (ID: {owner_id})")
        
        # Get all memories with embeddings
        memories_result = await session.execute(
            select(Memory)
            .where(
                Memory.owner_id == owner_id,
                Memory.is_active == True,
                Memory.embedding.isnot(None)
            )
            .order_by(Memory.created_at.desc())
            .limit(limit)
        )
        memories = memories_result.scalars().all()
        
        if not memories:
            logger.warning("No memories found")
            return
        
        logger.info(f"Processing {len(memories)} memories...")
        
        total_created = 0
        for i, mem in enumerate(memories, 1):
            try:
                if hasattr(mem.embedding, 'tolist'):
                    embedding = mem.embedding.tolist()
                else:
                    embedding = list(mem.embedding)
                
                waypoints = await create_waypoint_for_memory(
                    session=session,
                    new_memory_id=str(mem.id),
                    new_embedding=embedding,
                    user_id=mem.user_id or "consumer"
                )
                
                count = len([w for w in waypoints if w])
                total_created += count
                
                if i % 10 == 0:
                    logger.info(f"Progress: {i}/{len(memories)} memories processed, {total_created} waypoints created")
                    await session.commit()
                    
            except Exception as e:
                logger.error(f"Failed to create waypoints for memory {mem.id}: {e}")
                continue
        
        await session.commit()
        
        logger.info(f"✅ COMPLETE: Backfilled {total_created} waypoints for {len(memories)} memories")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python backfill_waypoints.py YOUR_EMAIL [limit]")
        print("Example: python backfill_waypoints.py user@example.com 100")
        sys.exit(1)
    
    email = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    
    asyncio.run(backfill_all_waypoints(email, limit))
