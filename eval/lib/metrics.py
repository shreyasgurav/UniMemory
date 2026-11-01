"""
Scoring + retrieval metrics shared across experiments.

Relevance is "keyword-grounded": because extracted memory text is
LLM-generated, we cannot predict exact memory IDs in advance. Instead each
query ships with `answer_keywords` (the ground-truth facts). A retrieved item
is counted relevant if it contains ALL keywords of at least one ground-truth
fact group. This is an automated proxy; raw model answers are also written to
CSV so results can be manually verified.
"""
import re
from typing import Dict, List, Sequence

try:
    import tiktoken
    _ENC = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover - tiktoken optional
    _ENC = None


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())


def count_tokens(text: str) -> int:
    if _ENC is not None:
        return len(_ENC.encode(text or ""))
    # rough fallback: ~4 chars per token
    return max(1, len((text or "")) // 4)


def item_matches_fact(item_text: str, fact_keywords: Sequence[str]) -> bool:
    """True if the item contains every keyword in a single fact group."""
    norm = _norm(item_text)
    return all(_norm(k).strip() in norm for k in fact_keywords)


def item_is_relevant(item_text: str, fact_groups: List[List[str]]) -> bool:
    """Relevant if it fully matches ANY ground-truth fact group."""
    return any(item_matches_fact(item_text, g) for g in fact_groups)


def hit_at_k(retrieved_texts: Sequence[str], fact_groups: List[List[str]],
             k: int) -> int:
    """1 if any of the top-k retrieved items is relevant, else 0."""
    for text in list(retrieved_texts)[:k]:
        if item_is_relevant(text, fact_groups):
            return 1
    return 0


def reciprocal_rank(retrieved_texts: Sequence[str],
                    fact_groups: List[List[str]]) -> float:
    for i, text in enumerate(retrieved_texts, start=1):
        if item_is_relevant(text, fact_groups):
            return 1.0 / i
    return 0.0


def answer_score(answer: str, fact_groups: List[List[str]]) -> int:
    """Rubric proxy for the ON/OFF experiment:
       2 = answer contains all keywords of some ground-truth fact group
       1 = answer contains some (>=1) but not a full group
       0 = answer contains none (generic / refusal / wrong)
    """
    norm = _norm(answer)
    best_full = any(all(_norm(k).strip() in norm for k in g) for g in fact_groups)
    if best_full:
        return 2
    any_kw = any(_norm(k).strip() in norm for g in fact_groups for k in g)
    return 1 if any_kw else 0


def mean(xs: Sequence[float]) -> float:
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def percentile(xs: Sequence[float], p: float) -> float:
    xs = sorted(xs)
    if not xs:
        return 0.0
    idx = min(len(xs) - 1, max(0, int(round((p / 100.0) * (len(xs) - 1)))))
    return xs[idx]
