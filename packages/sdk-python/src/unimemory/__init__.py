"""
UniMemory Python SDK
The memory layer for AI applications
"""

from .client import UniMemory, UniMemoryError
from .types import (
    CreateMemoryOptions,
    CreateMemoryResponse,
    Memory,
    ListMemoriesResponse,
    UpdateMemoryOptions,
    SearchOptions,
    SearchResult,
    SearchResponse,
    IngestTextOptions,
    IngestChatOptions,
    IngestDocumentOptions,
    IngestResponse,
)

__version__ = "1.0.0"
__all__ = [
    "UniMemory",
    "UniMemoryError",
    "CreateMemoryOptions",
    "CreateMemoryResponse",
    "Memory",
    "ListMemoriesResponse",
    "UpdateMemoryOptions",
    "SearchOptions",
    "SearchResult",
    "SearchResponse",
    "IngestTextOptions",
    "IngestChatOptions",
    "IngestDocumentOptions",
    "IngestResponse",
]
