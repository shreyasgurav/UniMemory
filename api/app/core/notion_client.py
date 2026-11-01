"""
Notion connector: OAuth 2.0 (public integration) + minimal REST operations
used by the MCP Gateway tools. Calls the Notion REST API directly.

Notion tokens do NOT expire — no refresh token flow needed.
"""
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from app.config import settings

AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
TOKEN_URL = "https://api.notion.com/v1/oauth/token"
API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


def redirect_uri() -> str:
    return f"{settings.CONNECTOR_REDIRECT_BASE}/api/v1/connectors/notion/callback"


def authorize_url(state: str) -> str:
    params = {
        "client_id": settings.NOTION_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "owner": "user",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> Dict[str, Any]:
    """Exchange an authorization code for an access token."""
    import base64
    credentials = base64.b64encode(
        f"{settings.NOTION_CLIENT_ID}:{settings.NOTION_CLIENT_SECRET}".encode()
    ).decode()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            TOKEN_URL,
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri(),
            },
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
        )
        r.raise_for_status()
        return r.json()


def _notion_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


async def get_workspace_name(token: str) -> Optional[str]:
    """Return the workspace name for use as the account_label."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{API_BASE}/users/me", headers=_notion_headers(token))
        if r.status_code == 200:
            data = r.json()
            # bot tokens carry workspace info in a different place
            return (
                data.get("bot", {}).get("workspace_name")
                or data.get("name")
                or "Notion Workspace"
            )
    return "Notion Workspace"


async def search_pages(
    token: str, query: str, limit: int = 10
) -> List[Dict[str, Any]]:
    """Search Notion pages and databases matching *query*.

    Returns lightweight hits: id, title, url, last_edited, object_type.
    """
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{API_BASE}/search",
            headers=_notion_headers(token),
            json={
                "query": query,
                "page_size": min(limit, 20),
                "filter": {"property": "object", "value": "page"},
                "sort": {"direction": "descending", "timestamp": "last_edited_time"},
            },
        )
        r.raise_for_status()
        results = r.json().get("results", [])

    hits = []
    for item in results[:limit]:
        title = _extract_title(item)
        hits.append({
            "id": item["id"],
            "title": title or "(Untitled)",
            "url": item.get("url", ""),
            "last_edited": item.get("last_edited_time", ""),
            "object": item.get("object", "page"),
            "snippet": "",  # populated below if parent text is available
        })
    return hits


def _extract_title(item: Dict[str, Any]) -> str:
    """Pull the title from a Notion page/database object."""
    props = item.get("properties", {})
    # Try common title property names
    for key in ("title", "Title", "Name", "name"):
        prop = props.get(key)
        if prop and prop.get("type") == "title":
            parts = prop.get("title", [])
            return "".join(p.get("plain_text", "") for p in parts)
    # Fallback: first title-type property found
    for prop in props.values():
        if isinstance(prop, dict) and prop.get("type") == "title":
            parts = prop.get("title", [])
            text = "".join(p.get("plain_text", "") for p in parts)
            if text:
                return text
    return ""


def _rich_text_to_str(rich: List[Dict[str, Any]]) -> str:
    return "".join(r.get("plain_text", "") for r in rich)


def _blocks_to_text(blocks: List[Dict[str, Any]], depth: int = 0) -> str:
    """Recursively flatten a Notion block list to plain text."""
    lines: List[str] = []
    indent = "  " * depth
    for block in blocks:
        btype = block.get("type", "")
        data = block.get(btype, {})

        # Rich-text blocks
        rich = data.get("rich_text", [])
        text = _rich_text_to_str(rich).strip()

        if btype == "heading_1":
            lines.append(f"{indent}# {text}")
        elif btype == "heading_2":
            lines.append(f"{indent}## {text}")
        elif btype == "heading_3":
            lines.append(f"{indent}### {text}")
        elif btype in ("paragraph", "quote"):
            if text:
                lines.append(f"{indent}{text}")
        elif btype == "bulleted_list_item":
            lines.append(f"{indent}• {text}")
        elif btype == "numbered_list_item":
            lines.append(f"{indent}1. {text}")
        elif btype == "to_do":
            checked = "✓" if data.get("checked") else "☐"
            lines.append(f"{indent}{checked} {text}")
        elif btype == "toggle":
            lines.append(f"{indent}▸ {text}")
        elif btype == "callout":
            icon = data.get("icon", {}).get("emoji", "")
            lines.append(f"{indent}{icon} {text}")
        elif btype == "code":
            lang = data.get("language", "")
            lines.append(f"{indent}```{lang}\n{indent}{text}\n{indent}```")
        elif btype == "divider":
            lines.append(f"{indent}---")
        elif btype == "image":
            caption = _rich_text_to_str(data.get("caption", []))
            lines.append(f"{indent}[image{': ' + caption if caption else ''}]")
        elif btype == "child_page":
            lines.append(f"{indent}📄 {data.get('title', '(sub-page)')}")
        elif btype == "table_row":
            cells = [_rich_text_to_str(cell) for cell in data.get("cells", [])]
            lines.append(f"{indent}| {' | '.join(cells)} |")

        # Recurse into children if present
        children = block.get("children", [])
        if children:
            lines.append(_blocks_to_text(children, depth + 1))

    return "\n".join(l for l in lines if l is not None)


async def _fetch_block_children(
    token: str, block_id: str, client: httpx.AsyncClient, depth: int = 0
) -> List[Dict[str, Any]]:
    """Recursively fetch all block children (max depth 3 to avoid runaway calls)."""
    if depth > 3:
        return []
    blocks: List[Dict[str, Any]] = []
    cursor = None
    while True:
        params: Dict[str, Any] = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        r = await client.get(
            f"{API_BASE}/blocks/{block_id}/children",
            headers=_notion_headers(token),
            params=params,
        )
        if r.status_code != 200:
            break
        data = r.json()
        page_blocks = data.get("results", [])
        for b in page_blocks:
            if b.get("has_children"):
                b["children"] = await _fetch_block_children(
                    token, b["id"], client, depth + 1
                )
        blocks.extend(page_blocks)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return blocks


async def get_page(token: str, page_id: str) -> Dict[str, Any]:
    """Fetch a Notion page with its full block content flattened to plain text."""
    async with httpx.AsyncClient(timeout=60) as c:
        # Page metadata
        pr = await c.get(f"{API_BASE}/pages/{page_id}", headers=_notion_headers(token))
        pr.raise_for_status()
        page_data = pr.json()

        # Fetch block children recursively
        blocks = await _fetch_block_children(token, page_id, c)

    title = _extract_title(page_data)
    full_text = _blocks_to_text(blocks)
    # Trim to 8000 chars so the MCP response stays manageable
    if len(full_text) > 8000:
        full_text = full_text[:8000] + "\n...(truncated)"

    return {
        "id": page_id,
        "title": title or "(Untitled)",
        "url": page_data.get("url", ""),
        "last_edited": page_data.get("last_edited_time", ""),
        "full_text": full_text,
    }
