"""
Memory sector classification (OpenMemory-style)
"""
from typing import Dict, List, Tuple
import re


# Sector configurations (Brain-like with adaptive decay)
SECTOR_CONFIGS = {
    "semantic": {
        "patterns": [
            re.compile(r"\b(know|understand|learn|concept|fact|definition|what is)\b", re.I),
            re.compile(r"\b(means|means|defined as|refers to)\b", re.I),
        ],
        "decay_lambda": 0.01,  # Slow decay - facts persist
        "priority_threshold": 0.7,  # Threshold for core memory
        "weight": 1.0,
        "description": "Facts, knowledge, concepts"
    },
    "episodic": {
        "patterns": [
            re.compile(r"\b(today|yesterday|tomorrow|last week|this week)\b", re.I),
            re.compile(r"\b(remember|happened|went|did|saw|met)\b", re.I),
            re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),  # Dates
        ],
        "decay_lambda": 0.05,  # Fast decay - events fade
        "priority_threshold": 0.9,  # Only very high salience becomes core
        "weight": 1.0,
        "description": "Events, experiences, conversations"
    },
    "procedural": {
        "patterns": [
            re.compile(r"\b(how to|steps|process|procedure|method|way to)\b", re.I),
            re.compile(r"\b(first|then|next|finally|step|instruction)\b", re.I),
        ],
        "decay_lambda": 0.005,  # Very slow decay - skills stick
        "priority_threshold": 0.6,
        "weight": 1.0,
        "description": "How-to, processes, workflows"
    },
    "emotional": {
        "patterns": [
            re.compile(r"\b(feel|feeling|love|hate|like|dislike|prefer)\b", re.I),
            re.compile(r"\b(excited|happy|sad|angry|frustrated|proud)\b", re.I),
        ],
        "decay_lambda": 0.03,  # Medium decay
        "priority_threshold": 0.8,
        "weight": 1.0,
        "description": "Feelings, reactions, sentiments"
    },
    "reflective": {
        "patterns": [
            re.compile(r"\b(think|believe|opinion|view|perspective|realize)\b", re.I),
            re.compile(r"\b(important|matters|values|principle|philosophy)\b", re.I),
        ],
        "decay_lambda": 0.01,  # Slow decay - insights are valuable
        "priority_threshold": 0.7,
        "weight": 1.0,
        "description": "Insights, learnings, meta-thoughts"
    }
}


# Sector relationship matrix (same as Mac app)
SECTOR_RELATIONSHIPS = {
    "semantic": {"procedural": 0.8, "episodic": 0.6, "reflective": 0.7, "emotional": 0.4},
    "procedural": {"semantic": 0.8, "episodic": 0.6, "reflective": 0.6, "emotional": 0.3},
    "episodic": {"reflective": 0.8, "semantic": 0.6, "procedural": 0.6, "emotional": 0.7},
    "reflective": {"episodic": 0.8, "semantic": 0.7, "procedural": 0.6, "emotional": 0.6},
    "emotional": {"episodic": 0.7, "reflective": 0.6, "semantic": 0.4, "procedural": 0.3},
}


def classify_sector(content: str) -> Tuple[str, List[str], float]:
    """
    Classify content into memory sectors
    
    Returns:
        (primary_sector, additional_sectors, confidence)
    """
    scores = {sector: 0.0 for sector in SECTOR_CONFIGS.keys()}
    
    for sector, config in SECTOR_CONFIGS.items():
        for pattern in config["patterns"]:
            matches = pattern.findall(content)
            if matches:
                scores[sector] += len(matches) * config["weight"]
    
    # Find primary and additional sectors
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    primary, primary_score = sorted_scores[0]
    
    # Calculate confidence
    second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0
    confidence = min(1.0, primary_score / (primary_score + second_score + 1))
    
    # Find additional sectors (above 30% of primary score)
    threshold = max(1.0, primary_score * 0.3)
    additional = [s for s, sc in sorted_scores[1:] if sc > 0 and sc >= threshold]
    
    # Default to semantic if no match
    if primary_score == 0:
        primary = "semantic"
        confidence = 0.2
    
    return primary, additional, confidence


def get_sector_decay_lambda(sector: str) -> float:
    """Get decay lambda for a sector"""
    return SECTOR_CONFIGS.get(sector, {}).get("decay_lambda", 0.02)


def get_sector_relationship_weight(from_sector: str, to_sector: str) -> float:
    """
    Get relationship weight between two sectors (same as Mac app)
    
    Returns 1.0 if same sector, otherwise relationship weight
    """
    if from_sector == to_sector:
        return 1.0
    
    return SECTOR_RELATIONSHIPS.get(from_sector, {}).get(to_sector, 0.3)


def calculate_initial_salience(primary_sector: str, additional_sectors: List[str]) -> float:
    """
    Calculate initial salience for new memory (same as Mac app)
    
    Base 0.4 + 0.1 per additional sector
    """
    base = 0.4
    bonus = 0.1 * len(additional_sectors)
    return min(1.0, max(0.0, base + bonus))


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
    if memory_type == 'fact' and salience >= 0.9:
        return 'core'
    
    # Critical skills
    if memory_type == 'skill' and salience >= 0.85:
        return 'core'
    
    # Sector-specific threshold
    threshold = SECTOR_CONFIGS.get(sector, {}).get('priority_threshold', 0.8)
    if salience >= threshold:
        return 'core'
    
    # Everything else is archival
    return 'archival'
