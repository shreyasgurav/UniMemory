"""
Authentication endpoints
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import User
from app.core.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_current_user_info(
    user: User = Depends(get_current_user)
):
    """Get current user information"""
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "plan": user.plan,
        "created_at": user.created_at.isoformat() if user.created_at else None
    }

