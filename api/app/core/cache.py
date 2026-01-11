"""
Caching layer for API keys and search results
Uses Redis when available, falls back to in-memory LRU cache
"""
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import hashlib
import json
import logging
from functools import lru_cache
from collections import OrderedDict
import asyncio

from app.config import settings

logger = logging.getLogger(__name__)

# In-memory LRU cache as fallback (thread-safe with asyncio.Lock)
_memory_cache: OrderedDict = OrderedDict()
_cache_lock = asyncio.Lock()
_MAX_MEMORY_CACHE_SIZE = 1000

# Redis client (lazy initialization)
_redis_client = None


async def get_redis():
    """Get Redis client (lazy initialization)"""
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
    if not settings.REDIS_URL:
        return None
    
    try:
        import redis.asyncio as redis
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5,
        )
        # Test connection
        await _redis_client.ping()
        logger.info("Redis connected")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis connection failed, using memory cache: {e}")
        return None


async def _memory_cache_get(key: str) -> Optional[str]:
    """Get from in-memory cache"""
    async with _cache_lock:
        if key in _memory_cache:
            value, expires_at = _memory_cache[key]
            if expires_at > datetime.utcnow():
                # Move to end (LRU)
                _memory_cache.move_to_end(key)
                return value
            else:
                # Expired, remove
                del _memory_cache[key]
        return None


async def _memory_cache_set(key: str, value: str, ttl: int = 300):
    """Set in-memory cache"""
    async with _cache_lock:
        expires_at = datetime.utcnow() + timedelta(seconds=ttl)
        _memory_cache[key] = (value, expires_at)
        _memory_cache.move_to_end(key)
        
        # Evict oldest if over size limit
        while len(_memory_cache) > _MAX_MEMORY_CACHE_SIZE:
            _memory_cache.popitem(last=False)


async def _memory_cache_delete(key: str):
    """Delete from in-memory cache"""
    async with _cache_lock:
        if key in _memory_cache:
            del _memory_cache[key]


async def cache_get(key: str) -> Optional[str]:
    """Get value from cache (Redis or memory)"""
    redis = await get_redis()
    
    if redis:
        try:
            return await redis.get(key)
        except Exception as e:
            logger.warning(f"Redis get failed: {e}")
    
    return await _memory_cache_get(key)


async def cache_set(key: str, value: str, ttl: int = None):
    """Set value in cache (Redis or memory)"""
    ttl = ttl or settings.CACHE_TTL
    redis = await get_redis()
    
    if redis:
        try:
            await redis.setex(key, ttl, value)
            return
        except Exception as e:
            logger.warning(f"Redis set failed: {e}")
    
    await _memory_cache_set(key, value, ttl)


async def cache_delete(key: str):
    """Delete value from cache"""
    redis = await get_redis()
    
    if redis:
        try:
            await redis.delete(key)
        except Exception as e:
            logger.warning(f"Redis delete failed: {e}")
    
    await _memory_cache_delete(key)


async def cache_delete_pattern(pattern: str):
    """Delete all keys matching pattern (Redis only)"""
    redis = await get_redis()
    
    if redis:
        try:
            keys = await redis.keys(pattern)
            if keys:
                await redis.delete(*keys)
        except Exception as e:
            logger.warning(f"Redis delete pattern failed: {e}")


# API Key Cache helpers
def api_key_cache_key(key_prefix: str) -> str:
    """Generate cache key for API key lookup"""
    return f"apikey:{key_prefix}"


async def get_cached_api_key(key_prefix: str) -> Optional[Dict[str, Any]]:
    """Get cached API key data by prefix"""
    cached = await cache_get(api_key_cache_key(key_prefix))
    if cached:
        return json.loads(cached)
    return None


async def set_cached_api_key(key_prefix: str, data: Dict[str, Any], ttl: int = 300):
    """Cache API key data"""
    await cache_set(api_key_cache_key(key_prefix), json.dumps(data), ttl)


async def invalidate_api_key_cache(key_prefix: str):
    """Invalidate cached API key"""
    await cache_delete(api_key_cache_key(key_prefix))


# Search result cache helpers
def search_cache_key(owner_id: str, query: str, user_id: str = None) -> str:
    """Generate cache key for search results"""
    key_data = f"{owner_id}:{query}:{user_id or ''}"
    key_hash = hashlib.md5(key_data.encode()).hexdigest()[:16]
    return f"search:{key_hash}"


# Rate limiting helpers
async def check_rate_limit(api_key_id: str) -> Tuple[bool, int, int]:
    """
    Check rate limit for API key.
    
    Returns:
        (allowed, remaining, reset_seconds)
    """
    redis = await get_redis()
    
    if not redis:
        # No Redis = no rate limiting (log warning in production)
        if settings.is_production:
            logger.warning("Rate limiting disabled: Redis not available")
        return True, settings.RATE_LIMIT_REQUESTS, 0
    
    key = f"ratelimit:{api_key_id}"
    window = settings.RATE_LIMIT_WINDOW
    
    try:
        pipe = redis.pipeline()
        now = int(datetime.utcnow().timestamp())
        window_start = now - window
        
        # Remove old entries
        pipe.zremrangebyscore(key, 0, window_start)
        # Count requests in window
        pipe.zcard(key)
        # Add current request
        pipe.zadd(key, {str(now): now})
        # Set expiry
        pipe.expire(key, window)
        
        results = await pipe.execute()
        request_count = results[1]
        
        allowed = request_count < settings.RATE_LIMIT_REQUESTS
        remaining = max(0, settings.RATE_LIMIT_REQUESTS - request_count - 1)
        
        # Calculate reset time
        oldest = await redis.zrange(key, 0, 0, withscores=True)
        reset = window if not oldest else int(oldest[0][1]) + window - now
        
        return allowed, remaining, max(0, reset)
        
    except Exception as e:
        logger.error(f"Rate limit check failed: {e}")
        return True, settings.RATE_LIMIT_REQUESTS, 0
