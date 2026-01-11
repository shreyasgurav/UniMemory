"""
API key management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.db.database import get_db
from app.db.models import User, APIKey
from app.core.auth import get_current_user
from app.core.security import generate_api_key

router = APIRouter(prefix="/keys", tags=["api-keys"])


class KeyCreate(BaseModel):
    name: str
    expires_at: Optional[datetime] = None


class KeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    user_id: str
    is_active: bool
    expires_at: Optional[str]
    last_used_at: Optional[str]
    usage_count: int
    created_at: str

    class Config:
        from_attributes = True


class KeyCreateResponse(KeyResponse):
    key: str  # Full key only shown once at creation


@router.post("", response_model=KeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: KeyCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Create a new API key for the user"""
    # Generate key
    plaintext_key, hashed_key = generate_api_key()
    key_prefix = plaintext_key[:15] + "..."
    
    api_key = APIKey(
        name=data.name,
        key_hash=hashed_key,
        key_prefix=key_prefix,
        user_id=user.id,
        expires_at=data.expires_at
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)
    
    return KeyCreateResponse(
        id=str(api_key.id),
        name=api_key.name,
        key=plaintext_key,  # Only time the full key is returned
        key_prefix=api_key.key_prefix,
        user_id=str(api_key.user_id),
        is_active=api_key.is_active,
        expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
        last_used_at=api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        usage_count=api_key.usage_count or 0,
        created_at=api_key.created_at.isoformat()
    )


@router.get("", response_model=List[KeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """List API keys for the current user"""
    stmt = select(APIKey).where(
        APIKey.user_id == user.id,
        APIKey.is_active == True
    ).order_by(APIKey.created_at.desc())
    
    result = await session.execute(stmt)
    keys = result.scalars().all()
    
    return [
        KeyResponse(
            id=str(k.id),
            name=k.name,
            key_prefix=k.key_prefix,
            user_id=str(k.user_id),
            is_active=k.is_active,
            expires_at=k.expires_at.isoformat() if k.expires_at else None,
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
            usage_count=k.usage_count or 0,
            created_at=k.created_at.isoformat()
        )
        for k in keys
    ]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Revoke an API key"""
    # Get the key
    stmt = select(APIKey).where(APIKey.id == key_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Verify user ownership
    if api_key.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to revoke this key"
        )
    
    # Delete the key from the database
    session.delete(api_key)
    await session.commit()
