"""
Entity extraction for UniMemory
Note: Fact extraction removed in schema cleanup (2026-04-24)
"""
from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.db.models import Entity, EntitySource
from app.core.embeddings import get_embedding_service
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class ExtractedEntity(BaseModel):
    """Extracted entity from content"""
    name: str
    entity_type: str  # person, organization, concept, place, thing
    summary: Optional[str] = None
    aliases: List[str] = []
    confidence: float = 1.0


class EntityExtractor:
    """Extract entities from content"""
    
    def __init__(self):
        self.embedding_service = get_embedding_service()
        
    async def extract_entities(self, content: str, metadata: Optional[Dict] = None) -> List[ExtractedEntity]:
        """
        Extract named entities from content.
        Uses patterns and heuristics for now, can be upgraded to LLM later.
        """
        entities = []
        
        # Person patterns
        person_pattern = r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b'
        for match in re.finditer(person_pattern, content):
            name = match.group(1)
            if self._is_likely_person(name):
                entities.append(ExtractedEntity(
                    name=name,
                    entity_type="person",
                    summary=f"Person mentioned in content",
                    confidence=0.8
                ))
        
        # Organization patterns (common tech companies for now)
        org_keywords = ['OpenAI', 'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Facebook', 
                       'Netflix', 'Tesla', 'SpaceX', 'GitHub', 'Railway', 'Vercel']
        for org in org_keywords:
            if org.lower() in content.lower():
                entities.append(ExtractedEntity(
                    name=org,
                    entity_type="organization",
                    summary=f"Organization: {org}",
                    confidence=0.9
                ))
        
        # Concept patterns (programming languages, frameworks)
        concepts = ['Python', 'JavaScript', 'TypeScript', 'React', 'Django', 'FastAPI', 
                   'PostgreSQL', 'Redis', 'Docker', 'Kubernetes', 'Machine Learning', 
                   'AI', 'LLM', 'ChatGPT', 'Claude']
        for concept in concepts:
            if concept.lower() in content.lower():
                entities.append(ExtractedEntity(
                    name=concept,
                    entity_type="concept",
                    summary=f"Technology/Concept: {concept}",
                    confidence=0.85
                ))
        
        # Place patterns (cities, countries)
        places = ['New York', 'San Francisco', 'London', 'Paris', 'Tokyo', 'USA', 'UK', 'India']
        for place in places:
            if place in content:
                entities.append(ExtractedEntity(
                    name=place,
                    entity_type="place",
                    summary=f"Location: {place}",
                    confidence=0.8
                ))
        
        # Deduplicate by name
        seen = set()
        unique_entities = []
        for entity in entities:
            if entity.name not in seen:
                seen.add(entity.name)
                unique_entities.append(entity)
        
        return unique_entities
    
    def _is_likely_person(self, name: str) -> bool:
        """Check if a string is likely a person's name"""
        # Simple heuristic: two capitalized words
        parts = name.split()
        if len(parts) != 2:
            return False
        
        # Exclude common non-person patterns
        exclude = ['New York', 'San Francisco', 'Los Angeles', 'United States', 
                  'Machine Learning', 'Artificial Intelligence']
        if name in exclude:
            return False
        
        return True
    
    async def resolve_entities(self, session: AsyncSession, extracted: List[ExtractedEntity], 
                              owner_id: str, end_user_id: Optional[str]) -> Dict[str, Entity]:
        """
        Resolve extracted entities against existing ones in the database.
        Returns mapping of entity name to Entity object.
        """
        entity_map = {}
        embedding_service = get_embedding_service()
        
        for extracted_entity in extracted:
            # Generate embedding for entity name
            embedding, _ = await embedding_service.embed(extracted_entity.name)
            
            # Search for similar existing entities
            # For now, use exact name match (can be improved with vector similarity)
            stmt = select(Entity).where(
                Entity.owner_id == owner_id,
                Entity.name == extracted_entity.name,
                Entity.is_active == True
            ).limit(1)
            
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                # Update existing entity
                existing.mention_count += 1
                existing.last_seen_at = datetime.utcnow()
                
                # Add aliases if new
                if extracted_entity.aliases:
                    current_aliases = existing.aliases or []
                    for alias in extracted_entity.aliases:
                        if alias not in current_aliases:
                            current_aliases.append(alias)
                    existing.aliases = current_aliases
                
                entity_map[extracted_entity.name] = existing
            else:
                # Create new entity
                new_entity = Entity(
                    id=str(uuid.uuid4()),
                    owner_id=owner_id,
                    end_user_id=end_user_id,
                    name=extracted_entity.name,
                    entity_type=extracted_entity.entity_type,
                    summary=extracted_entity.summary,
                    embedding=embedding,
                    aliases=extracted_entity.aliases,
                    mention_count=1,
                    first_seen_at=datetime.utcnow(),
                    last_seen_at=datetime.utcnow(),
                    is_active=True,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_entity)
                entity_map[extracted_entity.name] = new_entity
        
        return entity_map


def classify_memory_type(content: str, sector: str) -> str:
    """
    Classify memory type based on content and sector.
    Types: preference, fact, event, skill, insight
    """
    content_lower = content.lower()
    
    # Preference patterns
    if any(word in content_lower for word in ['prefer', 'like', 'love', 'favorite', 'enjoy', 'hate', 'dislike']):
        return 'preference'
    
    # Event patterns (episodic sector usually)
    if sector == 'episodic' or any(word in content_lower for word in ['happened', 'did', 'went', 'saw', 'met']):
        return 'event'
    
    # Skill patterns (procedural sector usually)
    if sector == 'procedural' or any(phrase in content_lower for phrase in ['how to', 'steps', 'process', 'method']):
        return 'skill'
    
    # Insight patterns (reflective sector usually)
    if sector == 'reflective' or any(word in content_lower for word in ['realize', 'understand', 'think', 'believe']):
        return 'insight'
    
    # Default to fact
    return 'fact'


def determine_priority(memory_type: str, salience: float, sector: str) -> str:
    """
    Determine if memory should be core or archival.
    Core memories are always in context, archival are searchable.
    """
    # High-salience preferences are always core
    if memory_type == 'preference' and salience >= 0.8:
        return 'core'
    
    # Important facts about the user
    if memory_type == 'fact' and salience >= 0.9 and 'user' in sector.lower():
        return 'core'
    
    # Critical skills
    if memory_type == 'skill' and salience >= 0.85:
        return 'core'
    
    # Everything else is archival
    return 'archival'
