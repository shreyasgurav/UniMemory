"""
Authentication utilities for Firebase and API key validation
"""
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
import json
import os

from app.db.database import get_db
from app.db.models import User, Project, APIKey
from app.core.security import verify_api_key
from app.config import settings

# Firebase initialization (lazy)
_firebase_app = None

def get_firebase_app():
    """Initialize Firebase Admin SDK (lazy initialization)."""
    global _firebase_app
    if _firebase_app is None:
        try:
            # Try to get default app if already initialized
            _firebase_app = firebase_admin.get_app()
        except ValueError:
            # Initialize with service account credentials
            # Option 1: JSON string from environment variable
            firebase_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
            if firebase_json:
                try:
                    cred_dict = json.loads(firebase_json)
                    cred = credentials.Certificate(cred_dict)
                    _firebase_app = firebase_admin.initialize_app(cred)
                except json.JSONDecodeError:
                    raise ValueError("Invalid FIREBASE_SERVICE_ACCOUNT JSON")
            # Option 2: File path from settings
            elif settings.FIREBASE_SERVICE_ACCOUNT_PATH:
                cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
                _firebase_app = firebase_admin.initialize_app(cred)
            else:
                # Use default credentials (for Cloud Run, etc.)
                _firebase_app = firebase_admin.initialize_app()
    return _firebase_app


# HTTP Bearer security scheme
security = HTTPBearer(auto_error=False)


async def verify_firebase_token(token: str) -> dict:
    """
    Verify Firebase ID token and return decoded claims.
    
    Returns dict with: uid, email, name, picture, etc.
    """
    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase token"
        )
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token expired"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )


async def get_or_create_user(
    firebase_data: dict,
    session: AsyncSession
) -> User:
    """
    Get existing user or create new one from Firebase data.
    """
    firebase_uid = firebase_data.get("uid")
    
    # Try to find existing user
    stmt = select(User).where(User.firebase_uid == firebase_uid)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user:
        # Update last login
        user.last_login_at = datetime.utcnow()
        # Update profile if changed
        if firebase_data.get("email") and user.email != firebase_data.get("email"):
            user.email = firebase_data.get("email")
        if firebase_data.get("name") and user.display_name != firebase_data.get("name"):
            user.display_name = firebase_data.get("name")
        if firebase_data.get("picture") and user.avatar_url != firebase_data.get("picture"):
            user.avatar_url = firebase_data.get("picture")
        await session.commit()
        return user
    
    # Create new user
    user = User(
        firebase_uid=firebase_uid,
        email=firebase_data.get("email"),
        display_name=firebase_data.get("name"),
        avatar_url=firebase_data.get("picture"),
        last_login_at=datetime.utcnow()
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency to get current user from Firebase token.
    
    Usage: @router.get("/endpoint")
           async def endpoint(user: User = Depends(get_current_user)):
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )
    
    token = credentials.credentials
    firebase_data = await verify_firebase_token(token)
    user = await get_or_create_user(firebase_data, session)
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )
    
    return user


async def validate_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db)
) -> tuple[Project, APIKey]:
    """
    Validate API key and return associated project.
    
    Usage: @router.post("/endpoint")
           async def endpoint(project_info: tuple = Depends(validate_api_key)):
               project, api_key = project_info
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header required"
        )
    
    # Get all active API keys and check against provided key
    # Note: We iterate because bcrypt hashes can't be looked up directly
    stmt = select(APIKey).where(APIKey.is_active == True)
    result = await session.execute(stmt)
    api_keys = result.scalars().all()
    
    matched_key = None
    for key in api_keys:
        if verify_api_key(x_api_key, key.key_hash):
            matched_key = key
            break
    
    if not matched_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )
    
    # Check expiration
    if matched_key.expires_at and matched_key.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expired"
        )
    
    # Update usage tracking
    matched_key.last_used_at = datetime.utcnow()
    matched_key.usage_count = (matched_key.usage_count or 0) + 1
    
    # Get project
    stmt = select(Project).where(Project.id == matched_key.project_id)
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project or not project.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project not found or inactive"
        )
    
    await session.commit()
    
    return project, matched_key


async def get_project_from_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db)
) -> Project:
    """
    Simplified dependency that just returns the project.
    
    Usage: @router.post("/endpoint")
           async def endpoint(project: Project = Depends(get_project_from_api_key)):
    """
    project, _ = await validate_api_key(x_api_key, session)
    return project

