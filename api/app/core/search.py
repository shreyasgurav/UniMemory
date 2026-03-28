"""
Hybrid search logic (OpenMemory HSG-style)
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import math
import re
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector
import numpy as np

from app.db.models import Memory, Waypoint
from app.core.embeddings import get_embedding_service
from app.core.sector import classify_sector, get_sector_relationship_weight
from app.core.simhash import canonical_token_set

# Common stop words that don't add semantic value to search
STOP_WORDS = {
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
    'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are',
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
    'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
    'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
    'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once'
}


def remove_stop_words(text: str) -> str:
    """
    Remove stop words from text while preserving meaningful content.
    Only removes stop words if there are other meaningful words remaining.
    """
    if not text:
        return text
    
    # Tokenize and filter
    words = re.findall(r'\b\w+\b', text.lower())
    meaningful_words = [w for w in words if w not in STOP_WORDS]
    
    # If all words are stop words, keep the original text
    # This prevents empty queries
    if not meaningful_words:
        return text
    
    # Reconstruct text with meaningful words only
    return ' '.join(meaningful_words)


# Scoring weights (Brain-like with coactivation)
SCORING_WEIGHTS = {
    "similarity": 0.30,
    "overlap": 0.15,
    "waypoint": 0.10,
    "recency": 0.10,
    "tag_match": 0.15,
    "coactivation": 0.20,  # Hebbian learning boost
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


def compute_coactivation_boost(recall_count: int, coactivation_score: float = 0.0) -> float:
    """
    Calculate coactivation boost based on recall count (Hebbian learning).
    Memories that are frequently recalled get higher scores.
    """
    if not recall_count or recall_count == 0:
        return coactivation_score or 0.0
    
    # Logarithmic scale to avoid over-boosting
    # 1 recall = 0.05, 10 recalls = 0.10, 100 recalls = 0.15
    recall_boost = min(0.5, math.log10(recall_count + 1) * 0.05)
    
    return recall_boost + (coactivation_score or 0.0)


def compute_hybrid_score(
    similarity: float,
    token_overlap: float,
    waypoint_weight: float,
    recency_score: float,
    tag_match: float = 0.0,
    coactivation: float = 0.0
) -> float:
    """Compute final hybrid score (Brain-like with coactivation)"""
    sim_boosted = boosted_sim(similarity)
    
    raw_score = (
        SCORING_WEIGHTS["similarity"] * sim_boosted +
        SCORING_WEIGHTS["overlap"] * token_overlap +
        SCORING_WEIGHTS["waypoint"] * waypoint_weight +
        SCORING_WEIGHTS["recency"] * recency_score +
        SCORING_WEIGHTS["tag_match"] * tag_match +
        SCORING_WEIGHTS["coactivation"] * coactivation
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
    
    # Step 1.5: Remove stop words to focus on meaningful keywords
    # This prevents matching on common words like "I", "a", "is", etc.
    filtered_query = remove_stop_words(core_query)
    if filtered_query:
        core_query = filtered_query
    
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
    
    # Filter by project_id (optional - scopes search to a single project)
    project_id = filters.get("project_id") if filters else None
    if project_id:
        stmt = stmt.where(Memory.project_id == project_id)
    
    if user_id:
        stmt = stmt.where(Memory.user_id == user_id)
    
    if min_salience > 0:
        stmt = stmt.where(Memory.salience >= min_salience)
    
    # Use pgvector cosine distance for fast ANN search
    fetch_limit = min(limit * 2, 30)
    stmt = stmt.order_by(Memory.embedding.cosine_distance(query_embedding)).limit(fetch_limit)
    
    result = await session.execute(stmt)
    vector_results = result.scalars().all()
    
    # Build candidates dict from vector results (REUSE - no re-fetch)
    candidates = {mem.id: mem for mem in vector_results}
    
    # Calculate similarities using numpy for speed
    query_arr = np.array(query_embedding)
    query_norm = np.linalg.norm(query_arr)
    
    similarity_map = {}
    for mem in vector_results:
        if mem.embedding is not None:
            try:
                mem_arr = np.array(mem.embedding if not hasattr(mem.embedding, 'tolist') else mem.embedding.tolist())
                dot = np.dot(query_arr, mem_arr)
                mem_norm = np.linalg.norm(mem_arr)
                sim = float(dot / (query_norm * mem_norm)) if query_norm > 0 and mem_norm > 0 else 0.0
                similarity_map[mem.id] = sim
            except Exception:
                similarity_map[mem.id] = 0.0
    
    candidate_ids = list(candidates.keys())
    avg_similarity = sum(similarity_map.values()) / len(similarity_map) if similarity_map else 0.0
    high_confidence = avg_similarity >= 0.5
    
    # Step 5: Waypoint expansion (ONLY if low confidence AND few results)
    waypoint_expansion = {}
    if not high_confidence and len(candidate_ids) < limit and candidate_ids:
        waypoint_expansion = await expand_via_waypoints(
            session, candidate_ids[:5], max_expansion=limit
        )
        # Fetch ONLY the expanded memories we don't already have
        new_ids = [mid for mid in waypoint_expansion.keys() if mid not in candidates]
        if new_ids:
            expanded_result = await session.execute(
                select(Memory).where(Memory.id.in_(new_ids))
            )
            for mem in expanded_result.scalars().all():
                candidates[mem.id] = mem
                # Calculate similarity for expanded memories
                if mem.embedding is not None:
                    try:
                        mem_arr = np.array(mem.embedding if not hasattr(mem.embedding, 'tolist') else mem.embedding.tolist())
                        dot = np.dot(query_arr, mem_arr)
                        mem_norm = np.linalg.norm(mem_arr)
                        similarity_map[mem.id] = float(dot / (query_norm * mem_norm)) if query_norm > 0 and mem_norm > 0 else 0.0
                    except Exception:
                        similarity_map[mem.id] = 0.0
    
    # Step 6: Score all candidates (using already-loaded data)
    query_tokens = canonical_token_set(core_query)
    scored_results = []
    
    for mem_id, mem in candidates.items():
        similarity = similarity_map.get(mem_id, 0.0)
        
        # Sector relationship weight
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
        
        # Calculate coactivation boost (Hebbian learning)
        coactivation = compute_coactivation_boost(
            getattr(mem, 'recall_count', 0) or 0,
            getattr(mem, 'coactivation_score', 0.0) or 0.0
        )
        
        # Compute final hybrid score
        final_score = compute_hybrid_score(
            adjusted_similarity,
            token_overlap,
            waypoint_weight,
            recency,
            tag_match,
            coactivation
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
    
    # Step 8: Reinforce retrieved memories in background (non-blocking)
    # Extract IDs so background task can use its own session
    result_memory_ids = [r["memory"].id for r in top_results]
    if result_memory_ids:
        import asyncio as _asyncio
        _asyncio.create_task(_reinforce_background(result_memory_ids))
    
    return top_results


async def _reinforce_background(memory_ids: list):
    """Non-blocking reinforcement with its own DB session"""
    try:
        from app.db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as bg_session:
            # Re-fetch memories in this session
            result = await bg_session.execute(
                select(Memory).where(Memory.id.in_(memory_ids))
            )
            memories = result.scalars().all()
            
            SALIENCE_BOOST = 0.1
            COACTIVATION_BOOST = 0.05
            
            for mem in memories:
                mem.salience = min(1.0, (mem.salience or 0.0) + SALIENCE_BOOST)
                mem.last_seen_at = datetime.now(mem.last_seen_at.tzinfo if mem.last_seen_at and mem.last_seen_at.tzinfo else None)
                if hasattr(mem, 'recall_count'):
                    mem.recall_count = (mem.recall_count or 0) + 1
                if hasattr(mem, 'last_recalled_at'):
                    mem.last_recalled_at = datetime.utcnow()
                if hasattr(mem, 'coactivation_score'):
                    mem.coactivation_score = min(1.0, (mem.coactivation_score or 0.0) + COACTIVATION_BOOST)
                bg_session.add(mem)
            
            # Strengthen co-recalled waypoints
            if len(memory_ids) > 1:
                await strengthen_coactivated_waypoints(bg_session, memory_ids)
            
            await bg_session.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[Search] Background reinforce failed: {e}")


async def reinforce_retrieved_memories(
    session: AsyncSession,
    results: List[Dict[str, Any]]
):
    """
    Reinforce retrieved memories with Hebbian learning.
    - Boost salience
    - Increment recall_count
    - Update coactivation_score
    - Update last_recalled_at
    - Strengthen waypoints between co-recalled memories
    """
    from datetime import datetime
    
    SALIENCE_BOOST = 0.1
    COACTIVATION_BOOST = 0.05
    MAX_SALIENCE = 1.0
    MAX_COACTIVATION = 1.0
    
    memory_ids = []
    
    for result in results:
        mem = result["memory"]
        current_salience = mem.salience or 0.0
        
        # Boost salience
        mem.salience = min(MAX_SALIENCE, current_salience + SALIENCE_BOOST)
        mem.last_seen_at = datetime.utcnow()
        
        # Increment recall count (Hebbian learning)
        if hasattr(mem, 'recall_count'):
            mem.recall_count = (mem.recall_count or 0) + 1
        
        # Update last_recalled_at
        if hasattr(mem, 'last_recalled_at'):
            mem.last_recalled_at = datetime.utcnow()
        
        # Boost coactivation score
        if hasattr(mem, 'coactivation_score'):
            mem.coactivation_score = min(
                MAX_COACTIVATION, 
                (mem.coactivation_score or 0.0) + COACTIVATION_BOOST
            )
        
        # Promote to core if frequently recalled with high salience
        if hasattr(mem, 'priority') and hasattr(mem, 'recall_count'):
            if (mem.recall_count or 0) >= 10 and mem.salience >= 0.8:
                mem.priority = 'core'
        
        session.add(mem)
        memory_ids.append(mem.id)
    
    # Strengthen waypoints between co-recalled memories
    if len(memory_ids) > 1:
        await strengthen_coactivated_waypoints(session, memory_ids)
    
    try:
        await session.commit()
    except Exception as e:
        print(f"[Search] Failed to reinforce memories: {e}")
        await session.rollback()


async def strengthen_coactivated_waypoints(
    session: AsyncSession,
    memory_ids: List[str]
):
    """
    Strengthen waypoints between memories that were recalled together.
    This implements "neurons that fire together wire together".
    Uses batch query instead of O(n²) individual queries.
    """
    from datetime import datetime
    from sqlalchemy import or_, tuple_
    import uuid as uuid_module
    
    if len(memory_ids) < 2:
        return
    
    WEIGHT_BOOST = 0.05
    MAX_WEIGHT = 1.0
    
    # Build all pairs with consistent ordering
    pairs = []
    for i, mem1_id in enumerate(memory_ids):
        for mem2_id in memory_ids[i+1:]:
            src_id = min(str(mem1_id), str(mem2_id))
            dst_id = max(str(mem1_id), str(mem2_id))
            pairs.append((src_id, dst_id))
    
    if not pairs:
        return
    
    # Batch fetch ALL existing waypoints for these pairs (1 query instead of N²)
    conditions = [
        and_(Waypoint.src_id == src, Waypoint.dst_id == dst)
        for src, dst in pairs
    ]
    result = await session.execute(
        select(Waypoint).where(or_(*conditions))
    )
    existing = {(w.src_id, w.dst_id): w for w in result.scalars().all()}
    
    # Update existing or create new
    for src_id, dst_id in pairs:
        waypoint = existing.get((src_id, dst_id))
        if waypoint:
            waypoint.weight = min(MAX_WEIGHT, waypoint.weight + WEIGHT_BOOST)
            if hasattr(waypoint, 'coactivation_count'):
                waypoint.coactivation_count = (waypoint.coactivation_count or 0) + 1
            if hasattr(waypoint, 'last_coactivated_at'):
                waypoint.last_coactivated_at = datetime.utcnow()
            waypoint.updated_at = datetime.utcnow()
        else:
            new_waypoint = Waypoint(
                id=str(uuid_module.uuid4()),
                src_id=src_id,
                dst_id=dst_id,
                weight=0.3,
                coactivation_count=1,
                last_coactivated_at=datetime.utcnow(),
                relationship_type='coactivated',
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            session.add(new_waypoint)

