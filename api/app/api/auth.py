"""
Authentication endpoints
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import User, APIKey
from app.core.auth import get_current_user, validate_api_key

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_current_user_info(
    user: User = Depends(get_current_user)
):
    """
    Get current user information (Firebase auth - for web dashboard).
    
    Requires Bearer token in Authorization header.
    """
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "plan": user.plan,
        "created_at": user.created_at.isoformat() if user.created_at else None
    }


@router.get("/validate")
async def validate_api_key_endpoint(
    user_info: tuple = Depends(validate_api_key)
):
    """
    Validate API key and get user/key information (API key auth - for B2B developers).
    
    Requires X-API-Key header.
    
    Use this endpoint to:
    - Verify your API key is valid
    - Get your user ID and plan
    - Check API key usage stats
    """
    user, api_key = user_info
    
    return {
        "valid": True,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "plan": user.plan
        },
        "api_key": {
            "id": str(api_key.id),
            "name": api_key.name,
            "key_prefix": api_key.key_prefix,
            "usage_count": api_key.usage_count or 0,
            "last_used_at": api_key.last_used_at.isoformat() if api_key.last_used_at else None,
            "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
            "created_at": api_key.created_at.isoformat() if api_key.created_at else None
        }
    }

