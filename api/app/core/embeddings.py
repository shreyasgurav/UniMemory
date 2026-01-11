"""
Embedding generation using OpenAI
Production-ready with async calls and error handling
"""
from typing import List, Optional, Tuple
from openai import AsyncOpenAI
import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generate embeddings for text using OpenAI"""
    
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
        Generate embedding for text
        
        Returns:
            (embedding_vector, dimension)
        """
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
            
            return embedding, dim
            
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
