"""
Memory sector classification (OpenMemory-style)
"""
from typing import Dict, List, Tuple
import re


# Sector configurations (OpenMemory-style)
SECTOR_CONFIGS = {
    "semantic": {
        "patterns": [
            re.compile(r"\b(know|understand|learn|concept|fact|definition|what is)\b", re.I),
            re.compile(r"\b(means|means|defined as|refers to)\b", re.I),
        ],
        "decay_lambda": 0.02,
        "weight": 1.0
    },
    "episodic": {
        "patterns": [
            re.compile(r"\b(today|yesterday|tomorrow|last week|this week)\b", re.I),
            re.compile(r"\b(remember|happened|went|did|saw|met)\b", re.I),
            re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),  # Dates
        ],
        "decay_lambda": 0.05,
        "weight": 1.0
    },
    "procedural": {
        "patterns": [
            re.compile(r"\b(how to|steps|process|procedure|method|way to)\b", re.I),
            re.compile(r"\b(first|then|next|finally|step|instruction)\b", re.I),
        ],
        "decay_lambda": 0.03,
        "weight": 1.0
    },
    "emotional": {
        "patterns": [
            re.compile(r"\b(feel|feeling|love|hate|like|dislike|prefer)\b", re.I),
            re.compile(r"\b(excited|happy|sad|angry|frustrated|proud)\b", re.I),
        ],
        "decay_lambda": 0.08,
        "weight": 1.0
    },
    "reflective": {
        "patterns": [
            re.compile(r"\b(think|believe|opinion|view|perspective|realize)\b", re.I),
            re.compile(r"\b(important|matters|values|principle|philosophy)\b", re.I),
        ],
        "decay_lambda": 0.04,
        "weight": 1.0
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
