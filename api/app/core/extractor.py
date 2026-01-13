"""
LLM-based memory extraction
Production-ready with async calls and timeout handling
"""
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
import json
import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# EXTRACTION RESULT TYPES (strict schemas)
# =============================================================================

class ExtractedMemoryItem(BaseModel):
    """Strict schema for an extracted memory"""
    content: str = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    memory_type: Optional[str] = None  # fact, preference, goal, etc.


class ExtractionResult(BaseModel):
    """Result from memory extraction with token tracking"""
    memories: List[ExtractedMemoryItem] = Field(default_factory=list)
    tokens_used: int = 0
    was_worth_remembering: bool = True


class WorthinessResult(BaseModel):
    """Result from worthiness check"""
    is_worth_remembering: bool
    reason: str
    suggested_types: List[str] = Field(default_factory=list)
    tokens_used: int = 0

class MemoryExtractor:
    """Extract structured memories from raw text using LLM"""
    
    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set in config")
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=settings.OPENAI_TIMEOUT,
            max_retries=settings.OPENAI_MAX_RETRIES,
        )
    
    async def check_worthiness(self, text: str) -> WorthinessResult:
        """
        Check if text is worth remembering
        
        Returns WorthinessResult with token tracking
        """
        system_prompt = """You are a memory assistant. Decide if user input is worth remembering.

Worth remembering:
- Personal facts (name, age, location, preferences)
- Goals, aspirations, plans
- Relationships (people, organizations)
- Skills, knowledge, expertise
- Projects, work context
- Important events or deadlines
- Beliefs, opinions, values

NOT worth remembering:
- Casual conversation ("hey", "how are you")
- Transient state ("I'm typing", "loading...")
- Generic greetings
- Commands without context
- Random characters or gibberish

Return JSON:
{
  "is_worth_remembering": true/false,
  "reason": "explanation",
  "suggested_types": ["fact", "preference", "goal", ...]
}"""
        
        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Input: {text[:2000]}"}
                    ],
                    temperature=0.3,
                    response_format={"type": "json_object"},
                    max_tokens=200,
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            # Track token usage
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            result = json.loads(response.choices[0].message.content)
            return WorthinessResult(
                is_worth_remembering=result.get("is_worth_remembering", True),
                reason=result.get("reason", ""),
                suggested_types=result.get("suggested_types", []),
                tokens_used=tokens_used
            )
            
        except asyncio.TimeoutError:
            logger.warning(f"Worthiness check timed out for text: {text[:50]}...")
            return WorthinessResult(
                is_worth_remembering=True,
                reason="Timeout - defaulting to worth remembering",
                suggested_types=["insight"],
                tokens_used=0
            )
        except Exception as e:
            logger.error(f"Worthiness check failed: {e}")
            return WorthinessResult(
                is_worth_remembering=True,
                reason=f"LLM check failed: {e}",
                suggested_types=["insight"],
                tokens_used=0
            )
    
    async def extract_memories(self, text: str) -> ExtractionResult:
        """
        Extract structured memories from text
        
        Returns ExtractionResult with strict schema and token tracking
        """
        system_prompt = """You extract structured memories from user input.

For each meaningful fact, preference, goal, or insight, create a memory.

Memory types:
- fact: Personal facts ("User's name is John", "User lives in SF")
- preference: Preferences ("User prefers dark mode", "User likes pizza")
- goal: Goals ("User wants to learn Swift", "User plans to travel")
- relationship: Relationships ("User works with Sarah", "User's manager is Mike")
- event: Events ("Meeting tomorrow at 3pm", "Deadline is Friday")
- skill: Skills ("User knows Python", "User is good at design")
- project: Projects ("User is building Cortex app", "Working on X feature")
- insight: General insights
- belief: Beliefs or values
- instruction: How user wants things done

Return JSON object with memories array:
{
  "memories": [
  {
    "content": "Extracted fact/insight",
    "type": "fact",
    "confidence": 0.9,
    "tags": ["tag1", "tag2"]
    }
  ]
}

Extract at most 5 memories. Focus on the most important facts."""
        
        try:
            # Truncate input to prevent token overflow
            truncated_text = text[:settings.MAX_CONTENT_LENGTH]
            
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Extract memories from: {truncated_text}"}
                    ],
                    temperature=0.3,
                    response_format={"type": "json_object"},
                    max_tokens=1000,
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            # Track token usage
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            result = json.loads(response.choices[0].message.content)
            
            # Handle both {"memories": [...]} and [...] formats
            if "memories" in result:
                raw_memories = result["memories"]
            elif isinstance(result, list):
                raw_memories = result
            else:
                # Try to find any array in the response
                raw_memories = []
                for key, value in result.items():
                    if isinstance(value, list):
                        raw_memories = value
                        break
            
            # Convert to strict schema, discarding invalid entries
            memories = []
            for mem in raw_memories[:settings.MAX_MEMORIES_PER_REQUEST]:
                try:
                    if isinstance(mem, str):
                        # Handle plain string
                        memories.append(ExtractedMemoryItem(content=mem.strip()))
                    elif isinstance(mem, dict) and mem.get("content"):
                        memories.append(ExtractedMemoryItem(
                            content=mem["content"].strip(),
                            tags=mem.get("tags", []),
                            confidence=mem.get("confidence"),
                            memory_type=mem.get("type")
                        ))
                except Exception as e:
                    logger.warning(f"Skipping invalid memory item: {e}")
                    continue
            
            return ExtractionResult(
                memories=memories,
                tokens_used=tokens_used,
                was_worth_remembering=True
            )
            
        except asyncio.TimeoutError:
            logger.warning(f"Memory extraction timed out for text: {text[:50]}...")
            return ExtractionResult(memories=[], tokens_used=0, was_worth_remembering=True)
        except Exception as e:
            logger.error(f"Memory extraction failed: {e}")
            return ExtractionResult(memories=[], tokens_used=0, was_worth_remembering=True)


# Singleton instance
_extractor: Optional[MemoryExtractor] = None


def get_extractor() -> MemoryExtractor:
    """Get singleton MemoryExtractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = MemoryExtractor()
    return _extractor
