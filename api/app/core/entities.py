"""
Entity and Fact extraction for UniMemory
"""
from typing import List, Dict, Tuple, Optional, Any
from datetime import datetime
from pydantic import BaseModel
import re
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.db.models import Entity, Fact, EntitySource, EntityLink
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


class ExtractedFact(BaseModel):
    """Extracted fact (SPO triple)"""
    subject: str  # Entity name
    predicate: str  # Relationship
    object: str  # Entity name or value
    fact_text: str  # Human-readable
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    confidence: float = 1.0


class EntityExtractor:
    """Extract entities and facts from content"""
    
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
    
    async def extract_facts(self, content: str, entities: List[ExtractedEntity], 
                           event_time: Optional[datetime] = None) -> List[ExtractedFact]:
        """
        Extract facts (relationships) from content.
        Uses patterns for now, can be upgraded to LLM later.
        """
        facts = []
        entity_names = {e.name.lower(): e.name for e in entities}
        
        # Work relationship patterns
        work_patterns = [
            r'(?i)(works? at|employed by|joined)\s+(\w+)',
            r'(?i)(\w+)\s+(CEO|CTO|engineer|developer|manager)\s+at\s+(\w+)',
        ]
        
        for pattern in work_patterns:
            for match in re.finditer(pattern, content):
                try:
                    if 'work' in pattern or 'employ' in pattern or 'join' in pattern:
                        # Pattern: X works at Y
                        predicate = "works_at"
                        # Find subject (person) before the verb
                        before_text = content[:match.start()][-50:]  # Look back 50 chars
                        subject = self._find_nearest_entity(before_text, entity_names, "person")
                        object_text = match.group(2)
                        
                        if subject and object_text:
                            facts.append(ExtractedFact(
                                subject=subject,
                                predicate=predicate,
                                object=object_text,
                                fact_text=f"{subject} works at {object_text}",
                                valid_from=event_time or datetime.utcnow(),
                                confidence=0.7
                            ))
                except:
                    continue
        
        # Preference patterns
        pref_patterns = [
            r'(?i)(prefer|like|love|enjoy|favorite)\s+(\w+)',
            r'(?i)(\w+)\s+is\s+my\s+favorite',
        ]
        
        for pattern in pref_patterns:
            for match in re.finditer(pattern, content):
                try:
                    if 'favorite' in pattern and 'is my' in pattern:
                        object_text = match.group(1)
                        facts.append(ExtractedFact(
                            subject="User",
                            predicate="prefers",
                            object=object_text,
                            fact_text=f"User prefers {object_text}",
                            valid_from=event_time or datetime.utcnow(),
                            confidence=0.8
                        ))
                    elif match.group(2):
                        object_text = match.group(2)
                        facts.append(ExtractedFact(
                            subject="User",
                            predicate="prefers",
                            object=object_text,
                            fact_text=f"User prefers {object_text}",
                            valid_from=event_time or datetime.utcnow(),
                            confidence=0.75
                        ))
                except:
                    continue
        
        # Knowledge/skill patterns
        skill_patterns = [
            r'(?i)(know|understand|learned|learning)\s+(\w+)',
            r'(?i)(expert|proficient|skilled)\s+in\s+(\w+)',
        ]
        
        for pattern in skill_patterns:
            for match in re.finditer(pattern, content):
                try:
                    skill = match.group(2) if match.lastindex >= 2 else match.group(1)
                    if skill and len(skill) > 2:
                        facts.append(ExtractedFact(
                            subject="User",
                            predicate="knows",
                            object=skill,
                            fact_text=f"User knows {skill}",
                            valid_from=event_time or datetime.utcnow(),
                            confidence=0.7
                        ))
                except:
                    continue
        
        return facts
    
    def _find_nearest_entity(self, text: str, entity_names: Dict[str, str], 
                            preferred_type: Optional[str] = None) -> Optional[str]:
        """Find the nearest entity in the text"""
        for name_lower, name_original in entity_names.items():
            if name_lower in text.lower():
                return name_original
        
        # If no entity found, check for "I" or "me" (refers to user)
        if any(word in text.lower() for word in ['i ', 'me ', 'my ']):
            return "User"
        
        return None
    
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
    
    async def resolve_and_store_facts(self, session: AsyncSession, extracted_facts: List[ExtractedFact],
                                     entity_map: Dict[str, Entity], owner_id: str, 
                                     end_user_id: Optional[str], source_id: Optional[str]) -> List[Fact]:
        """
        Resolve facts and handle temporal conflicts.
        Returns list of created Fact objects.
        """
        created_facts = []
        embedding_service = get_embedding_service()
        
        for extracted_fact in extracted_facts:
            # Get subject entity
            subject_entity = entity_map.get(extracted_fact.subject)
            if not subject_entity:
                # Create User entity if not exists
                if extracted_fact.subject == "User":
                    user_embedding, _ = await embedding_service.embed("User")
                    subject_entity = Entity(
                        id=str(uuid.uuid4()),
                        owner_id=owner_id,
                        end_user_id=end_user_id,
                        name="User",
                        entity_type="person",
                        summary="The user of this system",
                        embedding=user_embedding,
                        aliases=[],
                        mention_count=1,
                        first_seen_at=datetime.utcnow(),
                        last_seen_at=datetime.utcnow(),
                        is_active=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow()
                    )
                    session.add(subject_entity)
                    entity_map["User"] = subject_entity
                else:
                    continue  # Skip if subject entity not found
            
            # Get object entity (if it's an entity)
            object_entity = entity_map.get(extracted_fact.object)
            object_value = None if object_entity else extracted_fact.object
            
            # Check for conflicting facts (same subject + predicate)
            stmt = select(Fact).where(
                Fact.owner_id == owner_id,
                Fact.subject_entity_id == subject_entity.id,
                Fact.predicate == extracted_fact.predicate,
                Fact.is_valid == True,
                Fact.valid_to == None  # Currently valid
            )
            
            result = await session.execute(stmt)
            existing_facts = result.scalars().all()
            
            # Invalidate conflicting facts
            for existing in existing_facts:
                if object_entity:
                    # Check if it's actually different
                    if existing.object_entity_id != object_entity.id:
                        existing.valid_to = datetime.utcnow()
                        existing.invalidated_at = datetime.utcnow()
                        existing.is_valid = False
                        existing.invalidation_reason = "superseded"
                elif existing.object_value != object_value:
                    existing.valid_to = datetime.utcnow()
                    existing.invalidated_at = datetime.utcnow()
                    existing.is_valid = False
                    existing.invalidation_reason = "superseded"
            
            # Generate embedding for fact
            fact_embedding, _ = await embedding_service.embed(extracted_fact.fact_text)
            
            # Create new fact
            new_fact = Fact(
                id=str(uuid.uuid4()),
                owner_id=owner_id,
                end_user_id=end_user_id,
                subject_entity_id=subject_entity.id,
                predicate=extracted_fact.predicate,
                object_entity_id=object_entity.id if object_entity else None,
                object_value=object_value,
                fact_text=extracted_fact.fact_text,
                embedding=fact_embedding,
                valid_from=extracted_fact.valid_from or datetime.utcnow(),
                valid_to=extracted_fact.valid_to,
                created_at=datetime.utcnow(),
                invalidated_at=None,
                confidence=extracted_fact.confidence,
                source_id=source_id,
                is_valid=True,
                invalidation_reason=None
            )
            session.add(new_fact)
            created_facts.append(new_fact)
            
            # Update entity links if both are entities
            if object_entity:
                # Check if link exists
                stmt = select(EntityLink).where(
                    EntityLink.owner_id == owner_id,
                    EntityLink.src_entity_id == subject_entity.id,
                    EntityLink.dst_entity_id == object_entity.id
                ).limit(1)
                
                result = await session.execute(stmt)
                existing_link = result.scalar_one_or_none()
                
                if existing_link:
                    existing_link.fact_count += 1
                    existing_link.updated_at = datetime.utcnow()
                else:
                    # Create new link
                    new_link = EntityLink(
                        id=str(uuid.uuid4()),
                        owner_id=owner_id,
                        src_entity_id=subject_entity.id,
                        dst_entity_id=object_entity.id,
                        relationship_type=extracted_fact.predicate,
                        weight=0.5,
                        fact_count=1,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow()
                    )
                    session.add(new_link)
        
        return created_facts


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
