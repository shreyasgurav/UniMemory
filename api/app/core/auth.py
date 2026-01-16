"""
Authentication utilities for Firebase and API key validation
Production-ready with caching and optimized lookups
"""
from fastapi import Depends, HTTPException, Header, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Tuple
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
import json
import os
import logging
import hashlib
import secrets

from app.db.database import get_db
from app.db.models import User, APIKey, MCPToken
from app.core.security import verify_api_key
from app.core.cache import (
    get_cached_api_key, set_cached_api_key, invalidate_api_key_cache,
    check_rate_limit
)
from app.config import settings

logger = logging.getLogger(__name__)

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


# MCP client types to auto-generate tokens for
MCP_CLIENT_TYPES = [
    ("cursor", "Cursor"),
    ("claude", "Claude Desktop"),
    ("windsurf", "Windsurf"),
    ("cline", "Cline"),
]


def generate_mcp_token() -> tuple[str, str, str]:
    """Generate a new MCP token, returns (token, hash, prefix)"""
    token = f"um_mcp_{secrets.token_urlsafe(32)}"
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_prefix = token[:12]
    return token, token_hash, token_prefix


async def create_mcp_tokens_for_user(user_id: str, session: AsyncSession) -> list[MCPToken]:
    """
    Create MCP tokens for all supported clients for a user.
    Also backfills token_value for existing tokens that don't have it.
    Returns list of created/updated tokens.
    """
    created_tokens = []
    
    for client_type, display_name in MCP_CLIENT_TYPES:
        # Check if token already exists for this client
        stmt = select(MCPToken).where(
            MCPToken.user_id == user_id,
            MCPToken.client_type == client_type
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            # Backfill token_value if it's missing
            if not existing.token_value:
                token, token_hash, token_prefix = generate_mcp_token()
                existing.token_hash = token_hash
                existing.token_prefix = token_prefix
                existing.token_value = token
                created_tokens.append(existing)
        else:
            # Create new token
            token, token_hash, token_prefix = generate_mcp_token()
            mcp_token = MCPToken(
                user_id=user_id,
                name=display_name,
                client_type=client_type,
                token_hash=token_hash,
                token_prefix=token_prefix,
                token_value=token,  # Store token for user retrieval
                is_active=True,
            )
            session.add(mcp_token)
            created_tokens.append(mcp_token)
    
    if created_tokens:
        await session.commit()
        for t in created_tokens:
            await session.refresh(t)
    
    return created_tokens


async def get_or_create_user(
    firebase_data: dict,
    session: AsyncSession
) -> User:
    """
    Get existing user or create new one from Firebase data.
    Also ensures MCP tokens exist for all supported clients.
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
        
        # Ensure MCP tokens exist for this user
        await create_mcp_tokens_for_user(str(user.id), session)
        
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
    
    # Create MCP tokens for all supported clients
    await create_mcp_tokens_for_user(str(user.id), session)
    
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


def extract_key_prefix(api_key: str) -> str:
    """Extract prefix from API key for lookup optimization"""
    # Format: um_live_<64chars>
    # We use first 20 chars as lookup prefix
    return api_key[:20] if len(api_key) >= 20 else api_key


async def validate_api_key_optimized(
    x_api_key: str,
    session: AsyncSession
) -> Tuple[User, APIKey]:
    """
    Optimized API key validation with caching.
    
    Strategy:
    1. Extract key prefix
    2. Check cache for key data
    3. If not cached, do prefix-based DB lookup (much fewer bcrypt checks)
    4. Verify with bcrypt
    5. Cache result
    """
    key_prefix = extract_key_prefix(x_api_key)
    
    # Step 1: Check cache first
    cached = await get_cached_api_key(key_prefix)
    if cached:
        # Verify the full key against cached hash
        if verify_api_key(x_api_key, cached["key_hash"]):
            # Get fresh user and key from DB (for up-to-date data)
            stmt = select(APIKey).where(
                APIKey.id == cached["key_id"],
                APIKey.is_active == True
            )
            result = await session.execute(stmt)
            api_key = result.scalar_one_or_none()
            
            if api_key:
                # Get user
                stmt = select(User).where(User.id == api_key.user_id)
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()
                
                if user and user.is_active:
                    # Update usage (non-blocking in production)
                    api_key.last_used_at = datetime.utcnow()
                    api_key.usage_count = (api_key.usage_count or 0) + 1
                    await session.commit()
                    return user, api_key
    
    # Step 2: Not in cache or cache miss - query by prefix
    # Only get keys that match the prefix (much smaller set to check)
    stored_prefix = key_prefix[:15] + "..."  # Match stored format
    stmt = select(APIKey).where(
        APIKey.is_active == True,
        APIKey.key_prefix == stored_prefix
    )
    result = await session.execute(stmt)
    candidate_keys = result.scalars().all()
    
    matched_key = None
    for key in candidate_keys:
        if verify_api_key(x_api_key, key.key_hash):
            matched_key = key
            break
    
    if not matched_key:
        # Fallback: Check all keys (for keys with different prefix format)
        # This is the slow path, but ensures backwards compatibility
        stmt = select(APIKey).where(APIKey.is_active == True)
        result = await session.execute(stmt)
        all_keys = result.scalars().all()
        
        for key in all_keys:
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
    
    # Get user
    stmt = select(User).where(User.id == matched_key.user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not found or inactive"
        )
    
    # Step 3: Cache the key data for future lookups
    await set_cached_api_key(key_prefix, {
        "key_id": str(matched_key.id),
        "key_hash": matched_key.key_hash,
        "user_id": str(user.id),
    }, ttl=300)  # 5 minute cache
    
    # Update usage tracking
    matched_key.last_used_at = datetime.utcnow()
    matched_key.usage_count = (matched_key.usage_count or 0) + 1
    await session.commit()
    
    return user, matched_key


async def validate_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db)
) -> Tuple[User, APIKey]:
    """
    Validate API key and return associated user.
    Production-ready with caching and rate limiting.
    
    Usage: @router.post("/endpoint")
           async def endpoint(user_info: tuple = Depends(validate_api_key)):
               user, api_key = user_info
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header required"
        )
    
    # Validate the key (with caching optimization)
    user, api_key = await validate_api_key_optimized(x_api_key, session)
    
    # Check rate limit
    allowed, remaining, reset = await check_rate_limit(str(api_key.id))
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(reset),
                "Retry-After": str(reset)
            }
        )
    
    return user, api_key


async def get_user_from_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db)
) -> User:
    """
    Simplified dependency that just returns the user.
    
    Usage: @router.post("/endpoint")
           async def endpoint(user: User = Depends(get_user_from_api_key)):
    """
    user, _ = await validate_api_key(x_api_key, session)
    return user


async def validate_api_key_optional(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db)
) -> Optional[Tuple[User, APIKey]]:
    """
    Optional API key validation - returns None if no key provided.
    Used by unified auth to check API key first.
    """
    if not x_api_key:
        return None
    
    try:
        return await validate_api_key_optimized(x_api_key, session)
    except HTTPException:
        return None


async def verify_session_token_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    Optional session token validation - returns None if invalid.
    Used by unified auth to check session token as fallback.
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    secret_key = os.environ.get("JWT_SECRET_KEY", "unimemory-consumer-secret-key")
    
    try:
        import jwt
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        
        if payload.get("type") != "consumer_session":
            return None
        
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        result = await session.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if user and user.is_active:
            return user
        return None
        
    except Exception:
        return None


async def get_user_unified(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db)
) -> Tuple[User, Optional[APIKey]]:
    """
    Unified auth dependency - supports BOTH API key and session token.
    
    Priority:
    1. X-API-Key header (B2B developers)
    2. Bearer token (Consumer session from extension)
    
    Returns: (User, APIKey or None)
    - If API key auth: returns (user, api_key)
    - If session token auth: returns (user, None)
    
    Usage:
        @router.post("/memories")
        async def create_memory(user_info: tuple = Depends(get_user_unified)):
            user, api_key = user_info
    """
    # Try API key first (B2B)
    if x_api_key:
        try:
            user, api_key = await validate_api_key_optimized(x_api_key, session)
            # Check rate limit
            from app.core.cache import check_rate_limit
            allowed, remaining, reset = await check_rate_limit(str(api_key.id))
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                    headers={
                        "X-RateLimit-Remaining": str(remaining),
                        "X-RateLimit-Reset": str(reset),
                    }
                )
            return user, api_key
        except HTTPException:
            # API key provided but invalid - don't fallback, fail
            raise
    
    # Try session token (Consumer extension)
    if credentials:
        token = credentials.credentials
        secret_key = os.environ.get("JWT_SECRET_KEY", "unimemory-consumer-secret-key")
        
        try:
            import jwt
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
            
            if payload.get("type") != "consumer_session":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token type"
                )
            
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload"
                )
            
            result = await session.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found"
                )
            
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is deactivated"
                )
            
            return user, None  # No API key for session auth
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session token expired"
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session token"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Session token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token verification failed"
            )
    
    # No auth provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide X-API-Key header or Bearer token."
    )
