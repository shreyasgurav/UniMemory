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
    
    async def summarize_text(self, text: str, source_type: str = "text", metadata: dict = None) -> tuple[str, int]:
        """
        Generate a concise summary of raw content.
        
        Args:
            text: Raw content to summarize
            source_type: Type of source (text, chat, document, web, code)
            metadata: Optional metadata with platform, url, title info
        
        Returns:
            Tuple of (summary, tokens_used)
        """
        # Truncate if too long
        max_chars = 8000
        truncated = text[:max_chars]
        
        # Detect if this is a conversation or a web page
        is_conversation = self._is_conversation_content(truncated, metadata)
        
        if is_conversation:
            system_prompt = f"""You are a summarization assistant. Create a concise summary of this conversation.

Focus on:
- Main topics discussed
- Key decisions or conclusions reached
- Important questions asked and answered
- Action items or next steps
- Technical details if relevant

Keep it under 200 words but capture all essential meaning."""
        else:
            # Web page, document, or other content
            content_type = self._detect_content_type(metadata)
            system_prompt = f"""You are a summarization assistant. Create a concise summary of this {content_type}.

Focus on:
- Main purpose and key information
- Important facts, data, or insights
- Relevant technical details
- Notable features or highlights

Keep it under 200 words. Be factual and descriptive, not conversational."""
        
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
    
    def _is_conversation_content(self, text: str, metadata: dict = None) -> bool:
        """Detect if content is a conversation vs a web page"""
        if not metadata:
            # Check for conversation patterns in text
            conversation_indicators = [
                '"role":',  # JSON chat format
                'user:',
                'assistant:',
                'Human:',
                'AI:',
            ]
            return any(indicator in text[:500] for indicator in conversation_indicators)
        
        # Check metadata for conversation indicators
        platform = (metadata.get('platform') or '').lower()
        url = (metadata.get('url') or '').lower()
        
        conversation_platforms = ['chatgpt', 'claude', 'gemini', 'poe', 'perplexity', 'character']
        return any(plat in platform or plat in url for plat in conversation_platforms)
    
    def _detect_content_type(self, metadata: dict = None) -> str:
        """Detect the type of content from metadata"""
        if not metadata:
            return "content"
        
        platform = (metadata.get('platform') or '').lower()
        url = (metadata.get('url') or '').lower()
        hostname = (metadata.get('hostname') or '').lower()
        
        if 'github' in platform or 'github' in hostname:
            return "GitHub page"
        if 'stackoverflow' in hostname:
            return "Stack Overflow page"
        if 'reddit' in hostname:
            return "Reddit page"
        if 'twitter' in hostname or 'x.com' in hostname:
            return "Twitter/X page"
        if 'linkedin' in hostname:
            return "LinkedIn page"
        if 'medium' in hostname:
            return "Medium article"
        if 'docs.google' in hostname:
            return "Google Docs document"
        if 'notion' in hostname:
            return "Notion page"
        
        return "web page"
    
    async def generate_title(self, text: str, source_type: str = "chat", metadata: dict = None) -> tuple[str, int]:
        """
        Generate a meaningful title from content.
        
        Args:
            text: Raw content
            source_type: Type of source (chat, document, etc.)
            metadata: Optional metadata
        
        Returns:
            Tuple of (title, tokens_used)
        """
        # Truncate if too long
        max_chars = 2000
        truncated = text[:max_chars]
        
        is_conversation = self._is_conversation_content(truncated, metadata)
        
        if is_conversation:
            system_prompt = """Generate a short, descriptive title (3-8 words) for this conversation.
Focus on the main topic or question discussed. Be specific and concise.
Examples: "Python async/await best practices", "Debugging React state updates", "SQL query optimization tips"
Just return the title, nothing else."""
        else:
            system_prompt = """Generate a short, descriptive title (3-8 words) for this content.
Focus on the main topic or purpose. Be specific and concise.
Examples: "Machine learning tutorial", "API documentation guide", "Product pricing page"
Just return the title, nothing else."""
        
        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": truncated}
                    ],
                    temperature=0.5,
                    max_tokens=30,
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            title = response.choices[0].message.content.strip()
            # Remove quotes if present
            title = title.strip('"\'')
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            return title, tokens_used
            
        except asyncio.TimeoutError:
            logger.error(f"Title generation timeout for {source_type}")
            return "Untitled conversation" if is_conversation else "Untitled document", 0
        except Exception as e:
            logger.error(f"Title generation error: {e}")
            return "Untitled conversation" if is_conversation else "Untitled document", 0
    
    async def summarize_and_embed(self, text: str, source_type: str = "text", metadata: dict = None) -> tuple[str, Optional[list[float]], int]:
        """
        Generate summary and embedding in one call.
        
        Args:
            text: Raw content
            source_type: Type of source
            metadata: Optional metadata with platform, url, title info
        
        Returns:
            Tuple of (summary, embedding, tokens_used)
        """
        summary, tokens = await self.summarize_text(text, source_type, metadata)
        embedding = await self.embed_text(summary)
        
        return summary, embedding, tokens
