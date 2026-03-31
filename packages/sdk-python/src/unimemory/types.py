"""
UniMemory SDK type definitions
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Core Memory types
# ---------------------------------------------------------------------------

@dataclass
class CreateMemoryOptions:
    content: str
    user_id: Optional[str] = None
    app_id: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    project_id: Optional[str] = None


@dataclass
class CreateMemoryResponse:
    id: str
    created_at: str


@dataclass
class Memory:
    id: str
    content: str
    user_id: str
    tags: List[str]
    salience: float
    created_at: str


@dataclass
class ListMemoriesResponse:
    memories: List[Memory]
    total: int


@dataclass
class UpdateMemoryOptions:
    tags: Optional[List[str]] = None
    salience: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Search types
# ---------------------------------------------------------------------------

@dataclass
class SearchOptions:
    limit: Optional[int] = None
    user_id: Optional[str] = None
    min_salience: Optional[float] = None
    project_id: Optional[str] = None


@dataclass
class SearchResult:
    id: str
    content: str
    tags: List[str]
    salience: float
    created_at: Optional[str] = None


@dataclass
class SearchResponse:
    results: List[SearchResult]
    total: int
    query: str


# ---------------------------------------------------------------------------
# Ingest types
# ---------------------------------------------------------------------------

@dataclass
class IngestTextOptions:
    content: str
    user_id: Optional[str] = None
    app_id: Optional[str] = None
    source_id: Optional[str] = None
    project_id: Optional[str] = None
    create_source: Optional[bool] = None


@dataclass
class IngestChatOptions:
    messages: List[Dict[str, str]] = field(default_factory=list)
    user_id: Optional[str] = None
    app_id: Optional[str] = None
    source_id: Optional[str] = None
    project_id: Optional[str] = None
    source_metadata: Optional[Dict[str, Any]] = None


@dataclass
class IngestDocumentOptions:
    content: str = ""
    title: Optional[str] = None
    user_id: Optional[str] = None
    app_id: Optional[str] = None
    source_id: Optional[str] = None
    project_id: Optional[str] = None


@dataclass
class IngestResponse:
    stored: int
    skipped: int
    memory_ids: List[str]
    tokens_used: int
    source_id: Optional[str] = None
    source_title: Optional[str] = None
