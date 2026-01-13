"""
Source summarization and embedding utilities
Generates concise summaries of raw content for RAG
"""
from typing import Optional
from openai import AsyncOpenAI
import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class SourceSummarizer:
    """Generate summaries and embeddings for raw source content"""
    
    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set in config")
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=settings.OPENAI_TIMEOUT,
            max_retries=settings.OPENAI_MAX_RETRIES,
        )
    
    async def summarize_text(self, text: str, source_type: str = "text") -> tuple[str, int]:
        """
        Generate a concise summary of raw content.
        
        Args:
            text: Raw content to summarize
            source_type: Type of source (text, chat, document, web, code)
        
        Returns:
            Tuple of (summary, tokens_used)
        """
        # Truncate if too long
        max_chars = 8000
        truncated = text[:max_chars]
        
        system_prompt = f"""You are a summarization assistant. Create a concise, information-dense summary of the {source_type} content.

Focus on:
- Key facts, decisions, and insights
- Important context and relationships
- Actionable items or conclusions
- Technical details if relevant

Keep it under 200 words but capture all essential meaning."""
        
        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": truncated}
                    ],
                    temperature=0.3,
                    max_tokens=300,
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            summary = response.choices[0].message.content.strip()
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            return summary, tokens_used
            
        except asyncio.TimeoutError:
            logger.error(f"Summarization timeout for {source_type}")
            return f"[Summary unavailable - timeout] {truncated[:200]}...", 0
        except Exception as e:
            logger.error(f"Summarization error: {e}")
            return f"[Summary unavailable] {truncated[:200]}...", 0
    
    async def embed_text(self, text: str) -> Optional[list[float]]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed (summary or content)
        
        Returns:
            Embedding vector or None on failure
        """
        try:
            # Truncate to embedding model limits
            max_chars = 8000
            truncated = text[:max_chars]
            
            response = await asyncio.wait_for(
                self.client.embeddings.create(
                    model=settings.EMBEDDING_MODEL,
                    input=truncated
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            return response.data[0].embedding
            
        except asyncio.TimeoutError:
            logger.error("Embedding timeout")
            return None
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return None
    
    async def summarize_and_embed(self, text: str, source_type: str = "text") -> tuple[str, Optional[list[float]], int]:
        """
        Generate summary and embedding in one call.
        
        Args:
            text: Raw content
            source_type: Type of source
        
        Returns:
            Tuple of (summary, embedding, tokens_used)
        """
        summary, tokens = await self.summarize_text(text, source_type)
        embedding = await self.embed_text(summary)
        
        return summary, embedding, tokens
