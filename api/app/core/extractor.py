"""
LLM-based memory extraction
"""
from typing import List, Dict, Any, Optional
import openai
import json
from app.config import settings


class MemoryExtractor:
    """Extract structured memories from raw text using LLM"""
    
    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set in config")
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    
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
            response = self.client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Input: {text}"}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            # Default to worth remembering if LLM fails
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

Return JSON array:
[
  {
    "content": "Extracted fact/insight",
    "type": "fact",
    "confidence": 0.9,
    "tags": ["tag1", "tag2"],
    "expires_at": null  // ISO date string or null
  }
]"""
        
        try:
            response = self.client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Extract memories from: {text}"}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
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
            
            return memories
            
        except Exception as e:
            print(f"[Extractor] Failed to extract memories: {e}")
            return []


# Singleton instance
_extractor: Optional[MemoryExtractor] = None


def get_extractor() -> MemoryExtractor:
    """Get singleton MemoryExtractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = MemoryExtractor()
    return _extractor

