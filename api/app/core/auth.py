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


# ============ Firebase User Cache ============
# Caches verified Firebase user data to avoid re-verifying on every request
import asyncio
import time as _time

_firebase_user_cache: dict[str, dict] = {}  # token -> {user_data, expires_at}
_FIREBASE_CACHE_TTL = 300  # 5 minutes
_FIREBASE_CACHE_MAX = 200

def _get_cached_firebase_user(token: str) -> Optional[dict]:
    """Check if we have a cached user for this Firebase token."""
    cached = _firebase_user_cache.get(token)
    if cached and cached["expires_at"] > _time.time():
        return cached["user_data"]
    if cached:
        del _firebase_user_cache[token]
    return None

def _cache_firebase_user(token: str, user_data: dict):
    """Cache verified Firebase user data."""
    if len(_firebase_user_cache) >= _FIREBASE_CACHE_MAX:
        # Evict oldest entries
        now = _time.time()
        expired = [k for k, v in _firebase_user_cache.items() if v["expires_at"] < now]
        for k in expired:
            del _firebase_user_cache[k]
        if len(_firebase_user_cache) >= _FIREBASE_CACHE_MAX:
            oldest = min(_firebase_user_cache.items(), key=lambda x: x[1]["expires_at"])
            del _firebase_user_cache[oldest[0]]
    _firebase_user_cache[token] = {
        "user_data": user_data,
        "expires_at": _time.time() + _FIREBASE_CACHE_TTL
    }


async def verify_firebase_token(token: str) -> dict:
    """
    Verify Firebase ID token and return decoded claims.
    Runs in executor since firebase_auth.verify_id_token is blocking.
    
    Returns dict with: uid, email, name, picture, etc.
    """
    try:
        get_firebase_app()
        # Run blocking Firebase verification in thread pool executor
        loop = asyncio.get_event_loop()
        decoded = await loop.run_in_executor(
            None, firebase_auth.verify_id_token, token
        )
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


# Track last_login_at updates to avoid DB writes on every request
_last_login_updates: dict[str, float] = {}  # user_id -> last_update_timestamp
_LOGIN_UPDATE_INTERVAL = 300  # Only update last_login_at every 5 minutes

async def get_or_create_user(
    firebase_data: dict,
    session: AsyncSession
) -> User:
    """
    Get existing user or create new one from Firebase data.
    MCP tokens are only created for NEW users (not checked on every request).
    last_login_at is rate-limited to avoid unnecessary DB writes.
    """
    firebase_uid = firebase_data.get("uid")
    
    # Try to find existing user
    stmt = select(User).where(User.firebase_uid == firebase_uid)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user:
        now = _time.time()
        user_id_str = str(user.id)
        needs_commit = False
        
        # Rate-limit last_login_at updates (once per 5 min, not every request)
        last_update = _last_login_updates.get(user_id_str, 0)
        if now - last_update > _LOGIN_UPDATE_INTERVAL:
            user.last_login_at = datetime.utcnow()
            _last_login_updates[user_id_str] = now
            needs_commit = True
        
        # Update profile only if changed
        if firebase_data.get("email") and user.email != firebase_data.get("email"):
            user.email = firebase_data.get("email")
            needs_commit = True
        if firebase_data.get("name") and user.display_name != firebase_data.get("name"):
            user.display_name = firebase_data.get("name")
            needs_commit = True
        if firebase_data.get("picture") and user.avatar_url != firebase_data.get("picture"):
            user.avatar_url = firebase_data.get("picture")
            needs_commit = True
        
        if needs_commit:
            await session.commit()
        
        # SKIP create_mcp_tokens_for_user here - only needed on first setup
        # MCP tokens are created on user creation and via /consumer/mcp-config endpoint
        
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
    
    # Create MCP tokens only for NEW users
    await create_mcp_tokens_for_user(str(user.id), session)
    
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency to get current user from Firebase token.
    Uses cache to avoid Firebase verification + DB lookup on every request.
    
    Usage: @router.get("/endpoint")
           async def endpoint(user: User = Depends(get_current_user)):
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )
    
    token = credentials.credentials
    
    # Check cache first (avoids Firebase network call + DB queries)
    cached = _get_cached_firebase_user(token)
    if cached:
        user = User()
        user.id = cached["id"]
        user.email = cached.get("email")
        user.display_name = cached.get("display_name")
        user.is_active = cached.get("is_active", True)
        return user
    
    # Cache miss - verify with Firebase and fetch/create user
    firebase_data = await verify_firebase_token(token)
    user = await get_or_create_user(firebase_data, session)
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )
    
    # Cache for future requests
    _cache_firebase_user(token, {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active
    })
    
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
            # Reconstruct User and APIKey from cache (NO DB queries)
            user = User()
            user.id = cached["user_id"]
            user.email = cached.get("user_email")
            user.display_name = cached.get("user_display_name")
            user.is_active = True  # Was active when cached
            
            api_key = APIKey()
            api_key.id = cached["key_id"]
            api_key.user_id = cached["user_id"]
            api_key.name = cached.get("key_name", "")
            api_key.key_prefix = cached.get("key_prefix_stored", "")
            api_key.is_active = True
            api_key.usage_count = cached.get("usage_count", 0)
            
            # Update usage in background (non-blocking, no await)
            import asyncio as _asyncio
            async def _update_usage(kid: str):
                try:
                    from app.db.database import AsyncSessionLocal
                    async with AsyncSessionLocal() as bg:
                        from sqlalchemy import update as sql_update
                        await bg.execute(
                            sql_update(APIKey)
                            .where(APIKey.id == kid)
                            .values(
                                last_used_at=datetime.utcnow(),
                                usage_count=APIKey.usage_count + 1
                            )
                        )
                        await bg.commit()
                except Exception:
                    pass
            _asyncio.create_task(_update_usage(cached["key_id"]))
            
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
    
    # Step 3: Cache the key data for future lookups (includes user data to skip DB on cache hit)
    await set_cached_api_key(key_prefix, {
        "key_id": str(matched_key.id),
        "key_hash": matched_key.key_hash,
        "user_id": str(user.id),
        "user_email": user.email,
        "user_display_name": user.display_name,
        "key_name": matched_key.name,
        "key_prefix_stored": matched_key.key_prefix,
        "usage_count": matched_key.usage_count or 0,
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
