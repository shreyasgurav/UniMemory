"""
UniMemory Recall Service

Semantic-first, layered, ranked search.
- Embeds full query sentence (not keywords)
- Dual search: atomic memories + source summaries
- Ranks by similarity, recency, salience
- Returns small, high-signal context
"""
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.db.models import Memory, Source, MemorySource
from app.core.embeddings import get_embedding_service

logger = logging.getLogger(__name__)


class RecallResult:
    """Structured recall result"""
    def __init__(
        self,
        memories: List[Dict[str, Any]],
        sources: List[Dict[str, Any]],
        query: str,
        total_memories: int,
        total_sources: int
    ):
        self.memories = memories
        self.sources = sources
        self.query = query
        self.total_memories = total_memories
        self.total_sources = total_sources
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "memories": self.memories,
            "sources": self.sources,
            "query": self.query,
            "total_memories": self.total_memories,
            "total_sources": self.total_sources
        }
    
    def to_context_block(self) -> str:
        """Format as injectable context for AI agents"""
        lines = []
        
        if self.memories:
            lines.append("Relevant context from your memory:")
            lines.append("")
            for mem in self.memories:
                lines.append(f"- {mem['content']}")
            lines.append("")
        
        if self.sources:
            lines.append("Related discussions:")
            for src in self.sources:
                title = src.get('title') or 'Untitled'
                summary = src.get('summary', '')[:150] if src.get('summary') else ''
                if summary:
                    lines.append(f"- {title}: {summary}...")
                else:
                    lines.append(f"- {title}")
            lines.append("")
        
        return "\n".join(lines) if lines else "No relevant context found."


async def recall(
    session: AsyncSession,
    query: str,
    owner_id: str,
    memory_limit: int = 5,
    source_limit: int = 2,
    min_similarity: float = 0.3
) -> RecallResult:
    """
    Semantic recall with dual search.
    
    Pipeline:
    1. Embed full query sentence
    2. Search atomic memories (precision)
    3. Search source summaries (context)
    4. Rank and merge results
    5. Return structured, small context
    
    Args:
        session: Database session
        query: Full user query/prompt (embed as-is, not keywords)
        owner_id: User ID for scoping
        memory_limit: Max atomic memories to return (default 5)
        source_limit: Max sources to return (default 2)
        min_similarity: Minimum cosine similarity threshold
    
    Returns:
        RecallResult with ranked memories and sources
    """
    if not query or not query.strip():
        return RecallResult([], [], query, 0, 0)
    
    # Step 1: Embed FULL query sentence (not keywords)
    embedding_service = get_embedding_service()
    query_embedding, _ = await embedding_service.embed(query)
    
    # Step 2: Dual search in parallel
    memories_result, sources_result = await _dual_search(
        session=session,
        query_embedding=query_embedding,
        owner_id=owner_id,
        memory_limit=memory_limit * 2,  # Fetch more for ranking
        source_limit=source_limit * 2,
        min_similarity=min_similarity
    )
    
    # Step 3: Rank and trim
    ranked_memories = _rank_memories(memories_result, memory_limit)
    ranked_sources = _rank_sources(sources_result, source_limit)
    
    return RecallResult(
        memories=ranked_memories,
        sources=ranked_sources,
        query=query,
        total_memories=len(memories_result),
        total_sources=len(sources_result)
    )


async def _dual_search(
    session: AsyncSession,
    query_embedding: List[float],
    owner_id: str,
    memory_limit: int,
    source_limit: int,
    min_similarity: float
) -> Tuple[List[Dict], List[Dict]]:
    """
    Run parallel semantic searches on memories and source summaries.
    """
    
    # Search A: Atomic memories
    memory_query = (
        select(
            Memory,
            (1 - Memory.embedding.cosine_distance(query_embedding)).label('similarity')
        )
        .where(Memory.owner_id == owner_id)
        .where(Memory.embedding.isnot(None))
        .where((1 - Memory.embedding.cosine_distance(query_embedding)) >= min_similarity)
        .order_by((1 - Memory.embedding.cosine_distance(query_embedding)).desc())
        .limit(memory_limit)
    )
    
    # Search B: Source summaries
    source_query = (
        select(
            Source,
            (1 - Source.summary_embedding.cosine_distance(query_embedding)).label('similarity')
        )
        .where(Source.owner_id == owner_id)
        .where(Source.summary_embedding.isnot(None))
        .where((1 - Source.summary_embedding.cosine_distance(query_embedding)) >= min_similarity)
        .order_by((1 - Source.summary_embedding.cosine_distance(query_embedding)).desc())
        .limit(source_limit)
    )
    
    # Execute both
    memory_result = await session.execute(memory_query)
    source_result = await session.execute(source_query)
    
    memories = []
    for mem, similarity in memory_result.all():
        memories.append({
            "id": str(mem.id),
            "content": mem.content,
            "tags": mem.tags or [],
            "salience": mem.salience or 0.5,
            "similarity": float(similarity),
            "created_at": mem.created_at.isoformat() if mem.created_at else None
        })
    
    sources = []
    for src, similarity in source_result.all():
        sources.append({
            "id": str(src.id),
            "type": src.type,
            "title": src.title,
            "summary": src.summary,
            "similarity": float(similarity),
            "created_at": src.created_at.isoformat() if src.created_at else None,
            # DO NOT include raw_content - fetch on demand only
        })
    
    return memories, sources


def _rank_memories(memories: List[Dict], limit: int) -> List[Dict]:
    """
    Rank memories by combined score.
    
    Ranking signals:
    - Similarity (primary)
    - Salience (importance)
    - Recency (bonus for recent)
    """
    now = datetime.now(timezone.utc)
    
    for mem in memories:
        similarity = mem.get('similarity', 0)
        salience = mem.get('salience', 0.5)
        
        # Recency bonus (exponential decay over 30 days)
        recency_bonus = 0
        if mem.get('created_at'):
            try:
                created = datetime.fromisoformat(mem['created_at'].replace('Z', '+00:00'))
                days_old = (now - created).days
                recency_bonus = max(0, 0.1 * (1 - days_old / 30))
            except:
                pass
        
        # Combined score: 60% similarity + 30% salience + 10% recency
        mem['score'] = (0.6 * similarity) + (0.3 * salience) + recency_bonus
    
    # Sort by score, take top N
    ranked = sorted(memories, key=lambda x: x.get('score', 0), reverse=True)
    return ranked[:limit]


def _rank_sources(sources: List[Dict], limit: int) -> List[Dict]:
    """
    Rank sources by combined score.
    
    Ranking signals:
    - Similarity (primary)
    - Recency (recent conversations more relevant)
    - Type priority (chat > document > web)
    """
    now = datetime.now(timezone.utc)
    type_priority = {'chat': 1.0, 'document': 0.9, 'web': 0.8, 'code': 0.85, 'file': 0.75}
    
    for src in sources:
        similarity = src.get('similarity', 0)
        
        # Type bonus
        src_type = src.get('type', 'unknown')
        type_bonus = type_priority.get(src_type, 0.7) * 0.1
        
        # Recency bonus
        recency_bonus = 0
        if src.get('created_at'):
            try:
                created = datetime.fromisoformat(src['created_at'].replace('Z', '+00:00'))
                days_old = (now - created).days
                recency_bonus = max(0, 0.15 * (1 - days_old / 14))  # 2 week decay
            except:
                pass
        
        # Combined score: 70% similarity + 15% recency + 15% type
        src['score'] = (0.7 * similarity) + recency_bonus + type_bonus
    
    ranked = sorted(sources, key=lambda x: x.get('score', 0), reverse=True)
    return ranked[:limit]
