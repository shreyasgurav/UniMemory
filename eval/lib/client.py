"""
Thin HTTP client for the UniMemory API, used by the evaluation harness.

Only covers the endpoints the experiments need. Authenticates with the eval
test user's X-API-Key. Includes the EVAL-ONLY search knobs (scoring_mode,
reinforce) that default to production behavior unless explicitly set.
"""
import time
from typing import Any, Dict, List, Optional

import httpx

import config


class UniMemoryClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None,
                 timeout: float = 120.0):
        self.base_url = (base_url or config.API_BASE_URL).rstrip("/")
        self.api_key = api_key or config.get_api_key()
        self._http = httpx.Client(timeout=timeout)

    def _headers(self) -> Dict[str, str]:
        return {"X-API-Key": self.api_key, "Content-Type": "application/json"}

    # --- ingestion ----------------------------------------------------------
    def ingest_chat(self, messages: List[Dict[str, str]], end_user: str,
                    source_id: Optional[str] = None) -> Dict[str, Any]:
        payload = {"messages": messages, "user_id": end_user}
        if source_id:
            payload["source_id"] = source_id
        r = self._http.post(f"{self.base_url}/ingest/chat",
                            json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def add_memory(self, content: str, end_user: str,
                   tags: Optional[List[str]] = None) -> Dict[str, Any]:
        payload = {"content": content, "user_id": end_user, "tags": tags or []}
        r = self._http.post(f"{self.base_url}/memories",
                            json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    # --- retrieval ----------------------------------------------------------
    def search(self, query: str, end_user: str, limit: int = 5,
               scoring_mode: Optional[str] = None,
               reinforce: Optional[bool] = None) -> Dict[str, Any]:
        """Timed search. Returns parsed JSON plus 'elapsed_ms'.

        scoring_mode / reinforce are EVAL-ONLY knobs. Leave them None to get
        exact production behavior; set scoring_mode='cosine' for the ablation
        baseline and reinforce=False to keep retrieval side-effect free.
        """
        payload: Dict[str, Any] = {"query": query, "user_id": end_user, "limit": limit}
        if scoring_mode is not None:
            payload["scoring_mode"] = scoring_mode
        if reinforce is not None:
            payload["reinforce"] = reinforce
        t0 = time.perf_counter()
        r = self._http.post(f"{self.base_url}/search",
                            json=payload, headers=self._headers())
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        r.raise_for_status()
        data = r.json()
        data["elapsed_ms"] = elapsed_ms
        return data

    # --- listing / counting -------------------------------------------------
    def list_memories(self, end_user: Optional[str] = None,
                      limit: int = 100) -> List[Dict[str, Any]]:
        params = {"limit": limit}
        if end_user:
            params["user_id"] = end_user
        r = self._http.get(f"{self.base_url}/memories",
                           params=params, headers=self._headers())
        r.raise_for_status()
        return r.json().get("memories", [])

    def memory_count(self, end_user: Optional[str] = None) -> int:
        return len(self.list_memories(end_user=end_user, limit=100))

    def wait_for_memories(self, end_user: str, settle_seconds: int,
                          poll: float = 3.0) -> int:
        """Poll until the memory count stops growing for one full poll window
        or settle_seconds elapses. Ingestion extraction runs in the background,
        so this gives it time to finish."""
        deadline = time.time() + settle_seconds
        last = -1
        stable_for = 0
        while time.time() < deadline:
            count = self.memory_count(end_user=end_user)
            if count == last and count > 0:
                stable_for += 1
                if stable_for >= 2:
                    return count
            else:
                stable_for = 0
            last = count
            time.sleep(poll)
        return max(last, 0)
