"""
UniMemory Python SDK client
"""

import requests
from typing import Any, Dict, List, Optional

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


class UniMemoryError(Exception):
    """Error from UniMemory API"""

    def __init__(self, message: str, status: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.code = code


class UniMemory:
    """
    UniMemory client.

    Core API:    add / list / get / update / delete / search
    Ingest API:  ingest_text / ingest_chat / ingest_document
    """

    DEFAULT_BASE_URL = "https://unimemory.up.railway.app/api/v1"

    def __init__(self, api_key: str, base_url: Optional[str] = None):
        if not api_key:
            raise UniMemoryError("API key is required")
        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
        })

    def _request(self, method: str, path: str, json: Any = None, params: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        resp = self._session.request(method, url, json=json, params=params)
        if not resp.ok:
            try:
                err = resp.json()
                detail = err.get("detail", resp.text)
            except Exception:
                detail = resp.text
            raise UniMemoryError(detail, status=resp.status_code)
        if resp.status_code == 204:
            return {}
        return resp.json()

    # -----------------------------------------------------------------------
    # Core Memory API
    # -----------------------------------------------------------------------

    def add(self, options: CreateMemoryOptions) -> CreateMemoryResponse:
        """Store an explicit memory (deterministic, no LLM)."""
        body: Dict[str, Any] = {"content": options.content}
        if options.user_id is not None:
            body["user_id"] = options.user_id
        if options.app_id is not None:
            body["app_id"] = options.app_id
        if options.tags is not None:
            body["tags"] = options.tags
        if options.metadata is not None:
            body["metadata"] = options.metadata
        if options.project_id is not None:
            body["project_id"] = options.project_id

        data = self._request("POST", "/memories", json=body)
        return CreateMemoryResponse(id=data["id"], created_at=data["created_at"])

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        user_id: Optional[str] = None,
        sector: Optional[str] = None,
    ) -> ListMemoriesResponse:
        """List memories with optional filters."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if user_id:
            params["user_id"] = user_id
        if sector:
            params["sector"] = sector

        data = self._request("GET", "/memories", params=params)
        memories = [
            Memory(
                id=m["id"],
                content=m["content"],
                user_id=m.get("user_id", "anonymous"),
                tags=m.get("tags", []),
                salience=m.get("salience", 0.5),
                created_at=m.get("created_at", ""),
            )
            for m in data.get("memories", [])
        ]
        return ListMemoriesResponse(memories=memories, total=data.get("total", len(memories)))

    def get(self, memory_id: str) -> Memory:
        """Get a single memory by ID."""
        m = self._request("GET", f"/memories/{memory_id}")
        return Memory(
            id=m["id"],
            content=m["content"],
            user_id=m.get("user_id", "anonymous"),
            tags=m.get("tags", []),
            salience=m.get("salience", 0.5),
            created_at=m.get("created_at", ""),
        )

    def update(self, memory_id: str, options: UpdateMemoryOptions) -> Memory:
        """Update a memory (tags, salience, metadata only — content cannot be changed)."""
        body: Dict[str, Any] = {}
        if options.tags is not None:
            body["tags"] = options.tags
        if options.salience is not None:
            body["salience"] = options.salience
        if options.metadata is not None:
            body["metadata"] = options.metadata

        m = self._request("PATCH", f"/memories/{memory_id}", json=body)
        return Memory(
            id=m["id"],
            content=m["content"],
            user_id=m.get("user_id", "anonymous"),
            tags=m.get("tags", []),
            salience=m.get("salience", 0.5),
            created_at=m.get("created_at", ""),
        )

    def delete(self, memory_id: str) -> Dict[str, Any]:
        """Delete a memory."""
        return self._request("DELETE", f"/memories/{memory_id}")

    # -----------------------------------------------------------------------
    # Search API
    # -----------------------------------------------------------------------

    def search(self, query: str, options: Optional[SearchOptions] = None) -> SearchResponse:
        """Semantic search across memories."""
        body: Dict[str, Any] = {"query": query}
        if options:
            if options.limit is not None:
                body["limit"] = options.limit
            if options.user_id is not None:
                body["user_id"] = options.user_id
            if options.min_salience is not None:
                body["min_salience"] = options.min_salience
            if options.project_id is not None:
                body["project_id"] = options.project_id

        data = self._request("POST", "/search", json=body)
        results = [
            SearchResult(
                id=r["id"],
                content=r["content"],
                tags=r.get("tags", []),
                salience=r.get("salience", 0.5),
                created_at=r.get("created_at"),
            )
            for r in data.get("results", [])
        ]
        return SearchResponse(results=results, total=data.get("total", len(results)), query=data.get("query", query))

    # -----------------------------------------------------------------------
    # Ingest API (LLM-powered, background processing)
    # -----------------------------------------------------------------------

    def ingest_text(self, options: IngestTextOptions) -> IngestResponse:
        """Ingest raw text — LLM extracts memories in the background."""
        body: Dict[str, Any] = {"content": options.content}
        if options.user_id is not None:
            body["user_id"] = options.user_id
        if options.app_id is not None:
            body["app_id"] = options.app_id
        if options.source_id is not None:
            body["source_id"] = options.source_id
        if options.project_id is not None:
            body["project_id"] = options.project_id
        if options.create_source is not None:
            body["create_source"] = options.create_source
        return self._ingest("/ingest/text", body)

    def ingest_chat(self, options: IngestChatOptions) -> IngestResponse:
        """Ingest chat messages — LLM extracts memories in the background."""
        body: Dict[str, Any] = {"messages": options.messages}
        if options.user_id is not None:
            body["user_id"] = options.user_id
        if options.app_id is not None:
            body["app_id"] = options.app_id
        if options.source_id is not None:
            body["source_id"] = options.source_id
        if options.project_id is not None:
            body["project_id"] = options.project_id
        if options.source_metadata is not None:
            body["source_metadata"] = options.source_metadata
        return self._ingest("/ingest/chat", body)

    def ingest_document(self, options: IngestDocumentOptions) -> IngestResponse:
        """Ingest a document — LLM extracts memories in the background."""
        body: Dict[str, Any] = {"content": options.content}
        if options.title is not None:
            body["title"] = options.title
        if options.user_id is not None:
            body["user_id"] = options.user_id
        if options.app_id is not None:
            body["app_id"] = options.app_id
        if options.source_id is not None:
            body["source_id"] = options.source_id
        if options.project_id is not None:
            body["project_id"] = options.project_id
        return self._ingest("/ingest/document", body)

    def _ingest(self, path: str, body: Dict[str, Any]) -> IngestResponse:
        data = self._request("POST", path, json=body)
        return IngestResponse(
            stored=data.get("stored", 0),
            skipped=data.get("skipped", 0),
            memory_ids=data.get("memory_ids", []),
            tokens_used=data.get("tokens_used", 0),
            source_id=data.get("source_id"),
            source_title=data.get("source_title"),
        )
