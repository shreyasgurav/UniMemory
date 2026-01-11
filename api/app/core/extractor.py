"""
LLM-based memory extraction
Production-ready with async calls and timeout handling
"""
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
import json
import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


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
    
    async def check_worthiness(self, text: str) -> Dict[str, Any]:
        """
        Check if text is worth remembering
        
        Returns:
            {
                "is_worth_remembering": bool,
                "reason": str,
                "suggested_types": List[str]
            }
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
                        {"role": "user", "content": f"Input: {text[:2000]}"}  # Limit input
                    ],
                    temperature=0.3,
                    response_format={"type": "json_object"},
                    max_tokens=200,
                ),
                timeout=settings.OPENAI_TIMEOUT
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except asyncio.TimeoutError:
            logger.warning(f"Worthiness check timed out for text: {text[:50]}...")
            return {
                "is_worth_remembering": True,
                "reason": "Timeout - defaulting to worth remembering",
                "suggested_types": ["insight"]
            }
        except Exception as e:
            logger.error(f"Worthiness check failed: {e}")
            return {
                "is_worth_remembering": True,
                "reason": f"LLM check failed: {e}",
                "suggested_types": ["insight"]
            }
    
    async def extract_memories(self, text: str) -> List[Dict[str, Any]]:
        """
        Extract structured memories from text
        
        Returns:
            List of {
                "content": str,
                "type": str,
                "confidence": float,
                "tags": List[str],
                "expires_at": Optional[str] (ISO format)
            }
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
      "tags": ["tag1", "tag2"],
      "expires_at": null
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
            
            result = json.loads(response.choices[0].message.content)
            
            # Handle both {"memories": [...]} and [...] formats
            if "memories" in result:
                memories = result["memories"]
            elif isinstance(result, list):
                memories = result
            else:
                # Try to find any array in the response
                memories = []
                for key, value in result.items():
                    if isinstance(value, list):
                        memories = value
                        break
            
            # Ensure memories is a list
            if not isinstance(memories, list):
                memories = []
            
            # Limit number of memories
            memories = memories[:settings.MAX_MEMORIES_PER_REQUEST]
            
            return memories
            
        except asyncio.TimeoutError:
            logger.warning(f"Memory extraction timed out for text: {text[:50]}...")
            return []
        except Exception as e:
            logger.error(f"Memory extraction failed: {e}")
            return []


# Singleton instance
_extractor: Optional[MemoryExtractor] = None


def get_extractor() -> MemoryExtractor:
    """Get singleton MemoryExtractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = MemoryExtractor()
    return _extractor
