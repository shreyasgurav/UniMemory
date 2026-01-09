"""
Type definitions for UniMemory SDK
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class AddMemoryOptions(BaseModel):
    """Options for adding a memory"""
    content: str
    source_app: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class MemoryInfo(BaseModel):
    """Memory info returned after adding"""
    id: str
    was_deduplicated: bool


class AddMemoryResponse(BaseModel):
    """Response from adding a memory"""
    was_worth_remembering: bool
    reason: Optional[str] = None
    extracted_count: int
    memories: Optional[List[MemoryInfo]] = None


class SearchOptions(BaseModel):
    """Options for searching memories"""
    limit: Optional[int] = 10
    user_id: Optional[str] = None
    min_salience: Optional[float] = None
    debug: Optional[bool] = False


class SearchResult(BaseModel):
    """A single search result"""
    id: str
    content: str
    sector: Optional[str] = None
    salience: float
    score: float
    tags: List[str] = []


class SearchResponse(BaseModel):
    """Response from search"""
    results: List[SearchResult]
    total: int
    query: str


class Memory(BaseModel):
    """A memory object"""
    id: str
    content: str
    sector: Optional[str] = None
    salience: float
    tags: List[str] = []
    created_at: str


class ListMemoriesOptions(BaseModel):
    """Options for listing memories"""
    limit: Optional[int] = 50
    offset: Optional[int] = 0
    user_id: Optional[str] = None
    sector: Optional[str] = None


class ListMemoriesResponse(BaseModel):
    """Response from listing memories"""
    memories: List[Memory]
    total: int


class UniMemoryError(Exception):
    """UniMemory SDK Error"""
    def __init__(self, message: str, status: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code

