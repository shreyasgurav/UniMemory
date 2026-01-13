"""
End-user identity management utilities
Prevents ID collisions across different account owners
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import EndUser
import uuid


async def get_or_create_end_user(
    session: AsyncSession,
    owner_id: str,
    external_user_id: str
) -> EndUser:
    """
    Get or create an end_user record.
    
    This ensures proper identity isolation:
    - Same external_user_id can exist across different owners
    - Each (owner_id, external_user_id) pair gets a unique UUID
    
    Args:
        session: Database session
        owner_id: UniMemory account owner UUID
        external_user_id: User ID from API caller (e.g., "user_123")
    
    Returns:
        EndUser record with stable UUID
    """
    # Try to find existing
    stmt = select(EndUser).where(
        EndUser.owner_id == owner_id,
        EndUser.external_user_id == external_user_id
    )
    result = await session.execute(stmt)
    end_user = result.scalar_one_or_none()
    
    if end_user:
        return end_user
    
    # Create new
    end_user = EndUser(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        external_user_id=external_user_id
    )
    session.add(end_user)
    await session.flush()  # Get the ID without committing
    
    return end_user
