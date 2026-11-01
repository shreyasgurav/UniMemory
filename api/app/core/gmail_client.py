"""
Gmail connector: OAuth 2.0 (readonly) + minimal REST operations used by the
MCP Gateway tools. We call the normal Gmail REST API (generally available),
not the preview Gmail MCP server.
"""
import base64
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://gmail.googleapis.com/gmail/v1"


def redirect_uri() -> str:
    return f"{settings.CONNECTOR_REDIRECT_BASE}/api/v1/connectors/gmail/callback"


def authorize_url(state: str) -> str:
    from urllib.parse import urlencode
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",   # required to receive a refresh token
        "prompt": "consent",        # force refresh token on re-consent
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> Dict[str, Any]:
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(TOKEN_URL, data=data)
        r.raise_for_status()
        return r.json()


async def refresh_access_token(refresh_token: str) -> Dict[str, Any]:
    data = {
        "refresh_token": refresh_token,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(TOKEN_URL, data=data)
        r.raise_for_status()
        return r.json()


async def get_profile_email(access_token: str) -> Optional[str]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{API_BASE}/users/me/profile",
                        headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code == 200:
            return r.json().get("emailAddress")
    return None


def expiry_from_response(tok: Dict[str, Any]) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=int(tok.get("expires_in", 3600)) - 60)


async def search_messages(access_token: str, query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Return lightweight hits: id, threadId, subject, from, date, snippet."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{API_BASE}/users/me/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"q": query, "maxResults": min(limit, 20)},
        )
        r.raise_for_status()
        ids = [m["id"] for m in r.json().get("messages", [])]

        hits = []
        for mid in ids[:limit]:
            mr = await c.get(
                f"{API_BASE}/users/me/messages/{mid}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"format": "metadata",
                        "metadataHeaders": ["Subject", "From", "Date"]},
            )
            if mr.status_code != 200:
                continue
            md = mr.json()
            headers = {h["name"].lower(): h["value"]
                       for h in md.get("payload", {}).get("headers", [])}
            hits.append({
                "id": mid,
                "thread_id": md.get("threadId"),
                "subject": headers.get("subject", "(no subject)"),
                "from": headers.get("from", ""),
                "date": headers.get("date", ""),
                "snippet": md.get("snippet", ""),
            })
        return hits


def _decode_part(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode() + b"==").decode("utf-8", "replace")


def _extract_body(payload: Dict[str, Any]) -> str:
    """Prefer text/plain; walk multipart recursively."""
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    if mime == "text/plain" and body.get("data"):
        return _decode_part(body["data"])
    for part in payload.get("parts", []) or []:
        text = _extract_body(part)
        if text:
            return text
    # fall back to any html part stripped crudely
    if mime == "text/html" and body.get("data"):
        import re
        return re.sub(r"<[^>]+>", " ", _decode_part(body["data"]))
    return ""


async def get_message(access_token: str, message_id: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{API_BASE}/users/me/messages/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"format": "full"},
        )
        r.raise_for_status()
        md = r.json()
    headers = {h["name"].lower(): h["value"]
               for h in md.get("payload", {}).get("headers", [])}
    return {
        "id": message_id,
        "thread_id": md.get("threadId"),
        "subject": headers.get("subject", "(no subject)"),
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "date": headers.get("date", ""),
        "body": _extract_body(md.get("payload", {}))[:8000],
    }
