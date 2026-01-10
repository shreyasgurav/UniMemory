"""
Embedding generation using OpenAI
"""
from typing import List, Optional
import openai
from app.config import settings


class EmbeddingService:
    """Generate embeddings for text using OpenAI"""
    
    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set in config")
        openai.api_key = settings.OPENAI_API_KEY
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    
    async def embed(self, text: str) -> tuple[List[float], int]:
        """
        Generate embedding for text
        
        Returns:
            (embedding_vector, dimension)
        """
        try:
            response = self.client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=text
            )
            
            embedding = response.data[0].embedding
            dim = len(embedding)
            
            return embedding, dim
            
        except Exception as e:
            raise Exception(f"Failed to generate embedding: {e}")
    
    async def embed_batch(self, texts: List[str]) -> List[tuple[List[float], int]]:
        """
        Generate embeddings for multiple texts in batch
        
        Returns:
            List of (embedding_vector, dimension) tuples
        """
        try:
            response = self.client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=texts
            )
            
            results = []
            for item in response.data:
                embedding = item.embedding
                dim = len(embedding)
                results.append((embedding, dim))
            
            return results
            
        except Exception as e:
            raise Exception(f"Failed to generate batch embeddings: {e}")


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get singleton EmbeddingService instance"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service

