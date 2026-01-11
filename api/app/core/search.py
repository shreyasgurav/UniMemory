"""
Hybrid search logic (OpenMemory HSG-style)
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import math
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector
import numpy as np

from app.db.models import Memory, Waypoint
from app.core.embeddings import get_embedding_service
from app.core.sector import classify_sector, get_sector_relationship_weight
from app.core.simhash import canonical_token_set


# Scoring weights (OpenMemory-style)
SCORING_WEIGHTS = {
    "similarity": 0.35,
    "overlap": 0.20,
    "waypoint": 0.15,
    "recency": 0.10,
    "tag_match": 0.20,
}

HYBRID_PARAMS = {
    "tau": 3.0,
    "beta": 2.0,
    "t_days": 7.0,
    "t_max_days": 60.0,
}


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Calculate cosine similarity between two vectors"""
    if not a or not b or len(a) != len(b):
        return 0.0
    
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return dot / (norm_a * norm_b)


def boosted_sim(similarity: float) -> float:
    """Boost similarity score using exponential"""
    return 1 - math.exp(-HYBRID_PARAMS["tau"] * similarity)


def compute_token_overlap(query: str, content: str) -> float:
    """Compute token overlap between query and content"""
    query_tokens = canonical_token_set(query)
    content_tokens = canonical_token_set(content)
    
    if not query_tokens:
        return 0.0
    
    overlap = len(query_tokens.intersection(content_tokens))
    return overlap / len(query_tokens)


def compute_recency_score(last_seen: datetime) -> float:
    """Calculate recency score (same as Mac app)"""
    now = datetime.now(last_seen.tzinfo if last_seen.tzinfo else None)
    days = (now - last_seen).total_seconds() / 86400.0
    
    t = HYBRID_PARAMS["t_days"]
    tmax = HYBRID_PARAMS["t_max_days"]
    
    # Same formula as Mac app: exp(-days/t) * (1 - days/tmax)
    recency = math.exp(-days / t) * (1 - min(1.0, days / tmax))
    return max(0.0, min(1.0, recency))


def sigmoid(x: float) -> float:
    """Sigmoid activation function"""
    return 1.0 / (1.0 + math.exp(-x))


def compute_hybrid_score(
    similarity: float,
    token_overlap: float,
    waypoint_weight: float,
    recency_score: float,
    tag_match: float = 0.0
) -> float:
    """Compute final hybrid score (OpenMemory-style)"""
    sim_boosted = boosted_sim(similarity)
    
    raw_score = (
        SCORING_WEIGHTS["similarity"] * sim_boosted +
        SCORING_WEIGHTS["overlap"] * token_overlap +
        SCORING_WEIGHTS["waypoint"] * waypoint_weight +
        SCORING_WEIGHTS["recency"] * recency_score +
        SCORING_WEIGHTS["tag_match"] * tag_match
    )
    
    return sigmoid(raw_score)


async def expand_via_waypoints(
    session: AsyncSession,
    seed_ids: List[str],
    max_expansion: int = 20
) -> Dict[str, Dict[str, Any]]:
    """
    Expand search via waypoints (graph traversal)
    
    Returns:
        {memory_id: {"weight": float, "path": List[str]}}
    """
    expanded = {}
    visited = set(seed_ids)
    queue = [{"id": id, "weight": 1.0, "path": [id]} for id in seed_ids]
    count = 0
    
    while queue and count < max_expansion:
        current = queue.pop(0)
        current_id = current["id"]
        
        # Get neighbors from waypoints
        stmt = select(Waypoint).where(
            and_(
                Waypoint.src_id == current_id,
                Waypoint.weight > 0.1  # Filter weak links
            )
        ).order_by(Waypoint.weight.desc())
        
        result = await session.execute(stmt)
        neighbors = result.scalars().all()
        
        for neighbor in neighbors:
            dst_id = neighbor.dst_id
            if dst_id in visited:
                continue
            
            # Calculate expanded weight (decay by 0.8)
            expanded_weight = current["weight"] * neighbor.weight * 0.8
            
            if expanded_weight < 0.1:
                continue
            
            expanded[dst_id] = {
                "weight": expanded_weight,
                "path": current["path"] + [dst_id]
            }
            
            visited.add(dst_id)
            queue.append({
                "id": dst_id,
                "weight": expanded_weight,
                "path": expanded[dst_id]["path"]
            })
            count += 1
    
    return expanded


async def hybrid_search(
    session: AsyncSession,
    query: str,
    limit: int = 10,
    user_id: Optional[str] = None,
    min_salience: float = 0.0,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Perform hybrid search (OpenMemory HSG-style)
    
    Args:
        session: Database session
        query: Search query text
        limit: Maximum results to return
        user_id: Filter by user ID (optional)
        min_salience: Minimum salience threshold
        filters: Additional filters
    
    Returns:
        List of {
            "memory": Memory,
            "score": float,
            "path": List[str],
            "debug": Dict (optional)
        }
    """
    if not query or not query.strip():
        return []
    
    query_text = query.strip()
    
    # Step 1: Strip intent phrases and extract keywords
    intent_phrases = [
        "write a mail to", "send a mail to", "write an email to",
        "help me with", "tell me about", "can you find",
        "i need to", "i want to", "please"
    ]
    
    core_query = query_text.lower()
    for phrase in intent_phrases:
        core_query = core_query.replace(phrase, " ")
    
    core_query = " ".join(core_query.split()).strip()
    if not core_query:
        core_query = query_text  # Fallback to original
    
    # Step 2: Classify query sector
    query_sector, _, _ = classify_sector(core_query)
    
    # Step 3: Generate embedding
    embedding_service = get_embedding_service()
    try:
        query_embedding, dim = await embedding_service.embed(core_query)
    except Exception as e:
        print(f"[Search] Embedding failed: {e}")
        return []  # Fallback to keyword search if needed
    
    # Step 4: Vector search (using pgvector)
    stmt = select(Memory).where(
        Memory.embedding.isnot(None),
        Memory.is_active == True
    )
    
    # Filter by owner_id for multi-tenant isolation (required)
    owner_id = filters.get("owner_id") if filters else None
    if owner_id:
        stmt = stmt.where(Memory.owner_id == owner_id)
    
    if user_id:
        stmt = stmt.where(Memory.user_id == user_id)
    
    if min_salience > 0:
        stmt = stmt.where(Memory.salience >= min_salience)
    
    # Use pgvector cosine distance (pass list directly, not Vector wrapper)
    stmt = stmt.order_by(Memory.embedding.cosine_distance(query_embedding)).limit(limit * 3)
    
    result = await session.execute(stmt)
    vector_results = result.scalars().all()
    
    # Calculate average similarity for confidence check
    similarities = []
    candidate_ids = []
    for mem in vector_results:
        if mem.embedding is not None:
            # Convert pgvector Vector to list if needed (handle numpy arrays)
            try:
                if hasattr(mem.embedding, 'tolist'):
                    embedding_list = mem.embedding.tolist()
                elif hasattr(mem.embedding, '__iter__') and not isinstance(mem.embedding, str):
                    embedding_list = list(mem.embedding)
                else:
                    embedding_list = mem.embedding
                sim = cosine_similarity(query_embedding, embedding_list)
                similarities.append(sim)
                candidate_ids.append(mem.id)
            except Exception:
                candidate_ids.append(mem.id)  # Still add to candidates even if similarity fails
    
    avg_similarity = sum(similarities) / len(similarities) if similarities else 0.0
    high_confidence = avg_similarity >= 0.55
    
    # Step 5: Waypoint expansion (if low confidence)
    waypoint_expansion = {}
    if not high_confidence and candidate_ids:
        waypoint_expansion = await expand_via_waypoints(
            session, candidate_ids[:10], max_expansion=limit * 2
        )
        candidate_ids.extend(waypoint_expansion.keys())
    
    # Step 6: Score all candidates
    query_tokens = canonical_token_set(core_query)
    scored_results = []
    
    # Get all candidate memories
    if candidate_ids:
        stmt = select(Memory).where(Memory.id.in_(candidate_ids))
        result = await session.execute(stmt)
        candidates = {mem.id: mem for mem in result.scalars().all()}
    else:
        candidates = {}
    
    for mem_id in set(candidate_ids):
        mem = candidates.get(mem_id)
        if not mem:
            continue
        
        # Calculate similarity
        similarity = 0.0
        if mem.embedding is not None:
            # Convert pgvector Vector to list if needed (handle numpy arrays)
            try:
                if hasattr(mem.embedding, 'tolist'):
                    embedding_list = mem.embedding.tolist()
                elif hasattr(mem.embedding, '__iter__') and not isinstance(mem.embedding, str):
                    embedding_list = list(mem.embedding)
                else:
                    embedding_list = mem.embedding
                similarity = cosine_similarity(query_embedding, embedding_list)
            except Exception:
                similarity = 0.0
        
        # Sector relationship weight (same as Mac app - full matrix)
        if mem.sector and query_sector:
            sector_weight = get_sector_relationship_weight(query_sector, mem.sector)
        else:
            sector_weight = 1.0
        
        adjusted_similarity = similarity * sector_weight
        
        # Get waypoint weight
        waypoint_entry = waypoint_expansion.get(mem_id, {})
        waypoint_weight = waypoint_entry.get("weight", 0.0)
        path = waypoint_entry.get("path", [mem_id])
        
        # Calculate token overlap
        token_overlap = compute_token_overlap(core_query, mem.content)
        
        # Calculate recency score
        last_seen = mem.last_seen_at or mem.created_at
        recency = compute_recency_score(last_seen)
        
        # Calculate tag match
        tag_match = 0.0
        if mem.tags and query_tokens:
            mem_tags_lower = [str(t).lower() for t in mem.tags]
            for token in query_tokens:
                if token in mem_tags_lower:
                    tag_match += 1.0
            tag_match = min(1.0, tag_match / max(1, len(mem.tags)))
        
        # Compute final hybrid score
        final_score = compute_hybrid_score(
            adjusted_similarity,
            token_overlap,
            waypoint_weight,
            recency,
            tag_match
        )
        
        scored_results.append({
            "memory": mem,
            "score": final_score,
            "path": path,
            "debug": {
                "similarity": adjusted_similarity,
                "token_overlap": token_overlap,
                "waypoint_weight": waypoint_weight,
                "recency": recency,
                "tag_match": tag_match,
                "sector_weight": sector_weight
            } if filters and filters.get("debug") else None
        })
    
    # Step 7: Sort and limit
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    top_results = scored_results[:limit]
    
    # Step 8: Reinforce retrieved memories (boost salience)
    await reinforce_retrieved_memories(session, top_results)
    
    return top_results


async def reinforce_retrieved_memories(
    session: AsyncSession,
    results: List[Dict[str, Any]]
):
    """
    Boost salience of retrieved memories (same as Mac app)
    Called after search to reinforce accessed memories
    """
    from datetime import datetime
    
    SALIENCE_BOOST = 0.1  # Same as Mac app
    MAX_SALIENCE = 1.0
    
    for result in results:
        mem = result["memory"]
        current_salience = mem.salience or 0.0
        
        # Boost salience (same as Mac app's reinforceOnRetrieval)
        boosted_salience = min(MAX_SALIENCE, current_salience + SALIENCE_BOOST)
        
        mem.salience = boosted_salience
        mem.last_seen_at = datetime.utcnow()
        
        # Update in database
        session.add(mem)
    
    try:
        await session.commit()
    except Exception as e:
        print(f"[Search] Failed to reinforce memories: {e}")
        await session.rollback()

