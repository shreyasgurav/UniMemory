"""
Embedding generation using OpenAI
Production-ready with async calls, error handling, and caching
"""
from typing import List, Optional, Tuple
from openai import AsyncOpenAI
import asyncio
import logging
import hashlib
import json

from app.config import settings

logger = logging.getLogger(__name__)

# In-memory embedding cache (LRU-style)
_embedding_cache: dict = {}
_EMBEDDING_CACHE_MAX_SIZE = 500  # Cache up to 500 embeddings
_EMBEDDING_CACHE_TTL = 3600  # 1 hour TTL


def _get_cache_key(text: str) -> str:
    """Generate cache key from text"""
    normalized = text.strip().lower()[:1000]  # Normalize and limit
    return hashlib.md5(normalized.encode()).hexdigest()


def _get_cached_embedding(text: str) -> Optional[Tuple[List[float], int]]:
    """Get embedding from cache if exists and not expired"""
    import time
    key = _get_cache_key(text)
    if key in _embedding_cache:
        cached, timestamp = _embedding_cache[key]
        if time.time() - timestamp < _EMBEDDING_CACHE_TTL:
            return cached
        else:
            del _embedding_cache[key]
    return None


def _set_cached_embedding(text: str, embedding: Tuple[List[float], int]):
    """Cache embedding with TTL"""
    import time
    key = _get_cache_key(text)
    _embedding_cache[key] = (embedding, time.time())
    
    # Evict oldest entries if over limit
    if len(_embedding_cache) > _EMBEDDING_CACHE_MAX_SIZE:
        # Remove oldest 10%
        sorted_keys = sorted(_embedding_cache.keys(), 
                           key=lambda k: _embedding_cache[k][1])
        for k in sorted_keys[:_EMBEDDING_CACHE_MAX_SIZE // 10]:
            del _embedding_cache[k]


class EmbeddingService:
    """Generate embeddings for text using OpenAI with caching"""
    
    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set in config")
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=settings.OPENAI_TIMEOUT,
            max_retries=settings.OPENAI_MAX_RETRIES,
        )
    
    async def embed(self, text: str) -> Tuple[List[float], int]:
        """
        Generate embedding for text (with caching)
        
        Returns:
            (embedding_vector, dimension)
        """
        # Check cache first
        cached = _get_cached_embedding(text)
        if cached:
            logger.debug(f"Embedding cache hit for: {text[:30]}...")
            return cached
        
        try:
            # Truncate very long text
            truncated_text = text[:8000]  # ~2000 tokens max for embedding
            
            response = await asyncio.wait_for(
                self.client.embeddings.create(
                    model=settings.EMBEDDING_MODEL,
                    input=truncated_text
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            embedding = response.data[0].embedding
            dim = len(embedding)
            result = (embedding, dim)
            
            # Cache the result
            _set_cached_embedding(text, result)
            
            return result
            
        except asyncio.TimeoutError:
            logger.error(f"Embedding generation timed out for text: {text[:50]}...")
            raise Exception("Embedding generation timed out")
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise Exception(f"Failed to generate embedding: {e}")
    
    async def embed_batch(self, texts: List[str]) -> List[Tuple[List[float], int]]:
        """
        Generate embeddings for multiple texts in batch
        
        Returns:
            List of (embedding_vector, dimension) tuples
        """
        try:
            # Truncate each text
            truncated_texts = [t[:8000] for t in texts]
            
            response = await asyncio.wait_for(
                self.client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                    input=truncated_texts
                ),
                timeout=settings.OPENAI_TIMEOUT * 2  # Allow more time for batch
            )
            
            results = []
            for item in response.data:
                embedding = item.embedding
                dim = len(embedding)
                results.append((embedding, dim))
            
            return results
            
        except asyncio.TimeoutError:
            logger.error("Batch embedding generation timed out")
            raise Exception("Batch embedding generation timed out")
        except Exception as e:
            logger.error(f"Batch embedding generation failed: {e}")
            raise Exception(f"Failed to generate batch embeddings: {e}")


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get singleton EmbeddingService instance"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
