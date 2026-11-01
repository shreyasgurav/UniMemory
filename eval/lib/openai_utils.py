"""
OpenAI helpers for the harness: embeddings for the raw-RAG baseline (E2) and
chat completion for the ON/OFF generation experiment (E1).

Uses the SAME embedding model as the API so the structured-vs-raw comparison
is fair.
"""
from typing import List

from openai import OpenAI

import config

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not config.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY not set (needed for E1/E2).")
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def embed(texts: List[str]) -> List[List[float]]:
    client = _get_client()
    resp = client.embeddings.create(model=config.EMBEDDING_MODEL, input=texts)
    return [d.embedding for d in resp.data]


def embed_one(text: str) -> List[float]:
    return embed([text])[0]


def generate(system: str, user: str, temperature: float = 0.0) -> str:
    client = _get_client()
    resp = client.chat.completions.create(
        model=config.GEN_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return (resp.choices[0].message.content or "").strip()
