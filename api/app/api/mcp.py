"""
MCP API endpoints for consumer users
Handles MCP tokens and MCP-over-HTTP protocol for AI agent connections
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import hashlib
import secrets
import logging
import json
import asyncio

from app.db.database import get_db
from app.db.models import MCPToken, User, Memory, Source, MemorySource, MCPActivity
from app.core.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# OAuth configuration
MCP_SERVER_URL = "https://unimemory.up.railway.app/api/v1/mcp"
MCP_SSE_SERVER_URL = "https://unimemory.up.railway.app/api/v1/mcp/sse"
APP_URL = "https://unimemory-app.vercel.app"
API_URL = "https://unimemory.up.railway.app/api/v1"

MCP_SERVER_INFO = {
    "name": "unimemory",
    "version": "1.0.0",
}

# OAuth metadata responses (reusable)
def _oauth_protected_resource_response():
    return {
        "resource": MCP_SSE_SERVER_URL,
        "authorization_servers": [API_URL],
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "bearer_methods_supported": ["header"],
        "resource_documentation": "https://unimemory.app/docs/mcp",
    }

def _oauth_authorization_server_response():
    return {
        "issuer": API_URL,
        "authorization_endpoint": f"{APP_URL}/mcp/authorize",
        "token_endpoint": f"{API_URL}/mcp/oauth/token",
        "registration_endpoint": f"{API_URL}/mcp/oauth/register",
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
    }


# =============================================================================
# OAUTH DISCOVERY ENDPOINTS (for install-mcp, Cursor, and MCP clients)
# =============================================================================

@router.get("/mcp/.well-known/oauth-protected-resource")
async def oauth_protected_resource():
    """OAuth 2.0 Protected Resource Metadata (relative to /mcp)"""
    return _oauth_protected_resource_response()


@router.get("/mcp/sse/.well-known/oauth-protected-resource")
async def oauth_protected_resource_sse():
    """OAuth 2.0 Protected Resource Metadata (relative to /mcp/sse - for ChatGPT)"""
    return _oauth_protected_resource_response()


@router.get("/mcp/.well-known/oauth-authorization-server")
@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server():
    """OAuth 2.0 Authorization Server Metadata (multiple paths for compatibility)"""
    return _oauth_authorization_server_response()


@router.get("/mcp/sse/.well-known/oauth-authorization-server")
async def oauth_authorization_server_sse():
    """OAuth 2.0 Authorization Server Metadata (relative to /mcp/sse - for ChatGPT)"""
    return _oauth_authorization_server_response()


# =============================================================================
# DYNAMIC CLIENT REGISTRATION (required by MCP OAuth spec for ChatGPT)
# =============================================================================

@router.post("/mcp/oauth/register")
async def oauth_dynamic_register(request: Request):
    """
    OAuth 2.0 Dynamic Client Registration (RFC 7591).
    ChatGPT and other MCP clients use this to register themselves.
    We accept any registration and return a client_id (since we use
    token-based auth, client credentials aren't strictly needed).
    """
    import uuid as uuid_module
    
    try:
        body = await request.json()
    except Exception:
        body = {}
    
    client_id = f"unimemory-{uuid_module.uuid4().hex[:12]}"
    
    return JSONResponse(content={
        "client_id": client_id,
        "client_name": body.get("client_name", "MCP Client"),
        "redirect_uris": body.get("redirect_uris", []),
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    })


# In-memory storage for OAuth codes (in production, use Redis/DB with TTL)
_oauth_codes: Dict[str, Dict[str, Any]] = {}


class OAuthTokenRequest(BaseModel):
    grant_type: str
    code: Optional[str] = None
    redirect_uri: Optional[str] = None
    code_verifier: Optional[str] = None
    refresh_token: Optional[str] = None


@router.post("/mcp/oauth/token")
async def oauth_token(
    request: Request,
    session: AsyncSession = Depends(get_db)
):
    """
    OAuth 2.0 Token Endpoint.
    Exchanges authorization codes for access tokens.
    """
    # Parse form data or JSON
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        form_data = await request.form()
        grant_type = form_data.get("grant_type")
        code = form_data.get("code")
        redirect_uri = form_data.get("redirect_uri")
        code_verifier = form_data.get("code_verifier")
    else:
        body = await request.json()
        grant_type = body.get("grant_type")
        code = body.get("code")
        redirect_uri = body.get("redirect_uri")
        code_verifier = body.get("code_verifier")
    
    if grant_type != "authorization_code":
        return JSONResponse(
            status_code=400,
            content={"error": "unsupported_grant_type"}
        )
    
    if not code:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "error_description": "Missing code"}
        )
    
    # Look up the code
    code_data = _oauth_codes.get(code)
    if not code_data:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_grant", "error_description": "Invalid or expired code"}
        )
    
    # Verify PKCE if provided
    if code_data.get("code_challenge") and code_verifier:
        import base64
        expected = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        ).decode().rstrip("=")
        if expected != code_data["code_challenge"]:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "PKCE verification failed"}
            )
    
    # Delete the code (one-time use)
    del _oauth_codes[code]
    
    # Get the user's MCP token
    user_id = code_data["user_id"]
    
    result = await session.execute(
        select(MCPToken)
        .where(MCPToken.user_id == user_id, MCPToken.is_active == True)
        .order_by(MCPToken.created_at.desc())
        .limit(1)
    )
    mcp_token = result.scalar_one_or_none()
    
    if not mcp_token:
        # Create a new MCP token for this user
        token, token_hash, token_prefix = generate_mcp_token()
        mcp_token = MCPToken(
            user_id=user_id,
            name="MCP OAuth Token",
            client_type=code_data.get("client", "mcp"),
            token_hash=token_hash,
            token_prefix=token_prefix,
            token_value=token,
            is_active=True,
        )
        session.add(mcp_token)
        await session.commit()
        await session.refresh(mcp_token)
        access_token = token
    else:
        access_token = mcp_token.token_value
    
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 86400 * 365,  # 1 year
        "scope": "openid profile email",
    }


def store_oauth_code(code: str, user_id: str, code_challenge: Optional[str] = None, client: str = "mcp"):
    """Store an OAuth authorization code (called from consumer app)"""
    _oauth_codes[code] = {
        "user_id": user_id,
        "code_challenge": code_challenge,
        "client": client,
        "created_at": datetime.utcnow().isoformat(),
    }


@router.post("/mcp/oauth/code")
async def create_oauth_code(
    request: Request,
    user: User = Depends(get_current_user),
):
    """
    Internal endpoint to create an OAuth authorization code.
    Called by the consumer app after user authenticates.
    """
    body = await request.json()
    code = secrets.token_urlsafe(32)
    code_challenge = body.get("code_challenge")
    client = body.get("client", "mcp")
    
    store_oauth_code(code, str(user.id), code_challenge, client)
    
    return {"code": code}


MCP_TOOLS = [
    # ---- ChatGPT Connector Required Tools (search + fetch) ----
    {
        "name": "search",
        "description": "Search UniMemory for relevant memories and sources. Returns a list of matching documents with IDs, titles, and URLs. Use fetch to get full content of any result.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "fetch",
        "description": "Retrieve the full content of a memory or source by ID. Use after search to get complete document text for analysis and citation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "The memory or source ID to retrieve (from search results)"}
            },
            "required": ["id"]
        }
    },
    # ---- UniMemory-specific Tools ----
    {
        "name": "search_memory",
        "description": "Search your memory for relevant information. Use this to find what you know about a topic, person, preference, or past conversation. Pass project_id to search within a specific project only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for in memory (natural language query)"},
                "limit": {"type": "number", "description": "Maximum number of results to return (default: 10)"},
                "project_id": {"type": "string", "description": "Optional project ID to scope search to a specific project. Use get_projects to find project IDs."}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_memory_context",
        "description": "Get detailed context for a specific memory, including its source summary and a preview of the raw content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "memory_id": {"type": "string", "description": "The memory ID to get context for"}
            },
            "required": ["memory_id"]
        }
    },
    {
        "name": "get_source",
        "description": "Get the full source document or conversation that a memory came from.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "source_id": {"type": "string", "description": "The source ID to retrieve"}
            },
            "required": ["source_id"]
        }
    },
    {
        "name": "add_source",
        "description": "Save a full document, chat, or conversation as a source to a project. The system will automatically generate a title, summary, and extract nuclear memories from the content. Use this for saving entire conversations, documents, or any substantial content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "raw_content": {"type": ["string", "object"], "description": "The full content to save. Can be a string (for text/documents) or an object with messages array (for chats)."},
                "type": {"type": "string", "enum": ["chat", "document", "text"], "description": "Type of source. Defaults to 'chat' if raw_content has messages, otherwise 'text'."},
                "metadata": {"type": "object", "description": "Optional metadata like tags, context, or custom fields."},
                "project_id": {"type": "string", "description": "Optional project ID to save this source to. Use get_projects to find project IDs."}
            },
            "required": ["raw_content"]
        }
    },
    {
        "name": "get_projects",
        "description": "List all projects in UniMemory. Returns project names, IDs, status, memory/source counts. Use this to find a project_id before searching or saving memories to a specific project.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_project_status",
        "description": "Get detailed status of a specific project including its current status, status note, memory count, source count, and recent memories. Use this to understand where a project currently stands.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID to get status for. Use get_projects to find project IDs."}
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "update_project_status",
        "description": "Update the status and status note of a project. Use this to log progress like 'Working on auth flow', 'Deployed v2', 'Waiting for API review', etc. Status can be: active, paused, completed, archived.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID to update. Use get_projects to find project IDs."},
                "status": {"type": "string", "enum": ["active", "paused", "completed", "archived"], "description": "Project status (active, paused, completed, archived)"},
                "status_note": {"type": "string", "description": "Free-text note about current project state, e.g. 'Working on auth implementation', 'Deployed to staging'"}
            },
            "required": ["project_id"]
        }
    }
]


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateMCPTokenRequest(BaseModel):
    client_type: str  # cursor, claude, vscode, windsurf, cline, gemini, custom
    name: Optional[str] = None


class MCPTokenResponse(BaseModel):
    id: str
    name: str
    client_type: str
    is_active: bool
    last_used_at: Optional[datetime] = None
    usage_count: int
    created_at: datetime
    token: Optional[str] = None  # The actual token value
    mcp_url: Optional[str] = None  # MCP endpoint URL


class MCPTokenCreatedResponse(BaseModel):
    id: str
    name: str
    client_type: str
    token: str  # Only returned once at creation
    mcp_url: str
    install_command: str
    cursor_deep_link: Optional[str] = None
    npx_command: Optional[str] = None


class MCPTokenListResponse(BaseModel):
    tokens: List[MCPTokenResponse]


# =============================================================================
# HELPERS
# =============================================================================

def generate_mcp_token() -> tuple[str, str, str]:
    """Generate a new MCP token, returns (token, hash, prefix)"""
    token = f"um_mcp_{secrets.token_urlsafe(32)}"
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_prefix = token[:12]
    return token, token_hash, token_prefix


def get_client_display_name(client_type: str) -> str:
    """Get display name for client type"""
    names = {
        "cursor": "Cursor",
        "claude": "Claude Desktop",
        "vscode": "VS Code",
        "windsurf": "Windsurf",
        "cline": "Cline",
        "gemini": "Gemini CLI",
        "custom": "Custom MCP Client",
    }
    return names.get(client_type, client_type.title())


def get_install_command(client_type: str, token: str, mcp_url: str) -> str:
    """Deprecated - kept for backward compatibility. Frontend now builds commands."""
    return ""


# =============================================================================
# CONSUMER MCP TOKEN ENDPOINTS
# =============================================================================

@router.post("/consumer/mcp/tokens", response_model=MCPTokenCreatedResponse)
async def create_mcp_token(
    request: CreateMCPTokenRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Create a new MCP token for connecting an AI agent"""
    client_type = request.client_type.lower()
    name = request.name or get_client_display_name(client_type)
    
    # Generate token
    token, token_hash, token_prefix = generate_mcp_token()
    
    # Create token record
    mcp_token = MCPToken(
        user_id=user.id,
        name=name,
        client_type=client_type,
        token_hash=token_hash,
        token_prefix=token_prefix,
        token_value=token,  # Store token for user retrieval
        is_active=True,
    )
    
    session.add(mcp_token)
    await session.commit()
    await session.refresh(mcp_token)
    
    # MCP URL - this will be your hosted MCP endpoint
    mcp_url = "https://unimemory.up.railway.app/api/v1/mcp"
    
    # Generate deep link config (base64 encoded JSON for Cursor)
    import base64
    config_json = json.dumps({"url": mcp_url, "headers": {"Authorization": f"Bearer {token}"}})
    config_base64 = base64.b64encode(config_json.encode()).decode()
    cursor_deep_link = f"cursor://anysphere.cursor-deeplink/mcp/install?name=unimemory&config={config_base64}"
    
    # Generate npx install-mcp command for other clients
    npx_command = None
    if client_type in ["claude", "vscode", "cline", "gemini"]:
        npx_command = f"npx -y @unimemory/install-mcp {mcp_url} --client {client_type} --token {token}"
    
    return MCPTokenCreatedResponse(
        id=str(mcp_token.id),
        name=mcp_token.name,
        client_type=mcp_token.client_type,
        token=token,
        mcp_url=mcp_url,
        install_command=get_install_command(client_type, token, mcp_url),
        cursor_deep_link=cursor_deep_link,
        npx_command=npx_command,
    )


MCP_URL = "https://unimemory.up.railway.app/api/v1/mcp"


@router.get("/consumer/mcp/tokens", response_model=MCPTokenListResponse)
async def list_mcp_tokens(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """List all MCP tokens for the current user with token values for display"""
    result = await session.execute(
        select(MCPToken)
        .where(MCPToken.user_id == user.id)
        .order_by(MCPToken.created_at.desc())
    )
    tokens = result.scalars().all()
    
    return MCPTokenListResponse(
        tokens=[
            MCPTokenResponse(
                id=str(t.id),
                name=t.name,
                client_type=t.client_type,
                is_active=t.is_active,
                last_used_at=t.last_used_at,
                usage_count=t.usage_count,
                created_at=t.created_at,
                token=t.token_value,  # Include stored token
                mcp_url=MCP_URL,
            )
            for t in tokens
        ]
    )


@router.delete("/consumer/mcp/tokens/{token_id}")
async def revoke_mcp_token(
    token_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Revoke (delete) an MCP token"""
    result = await session.execute(
        select(MCPToken).where(
            MCPToken.id == token_id,
            MCPToken.user_id == user.id
        )
    )
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    
    await session.delete(token)
    await session.commit()
    
    return {"success": True, "message": "Token revoked"}


# =============================================================================
# MCP TOKEN VALIDATION (used by MCP server)
# =============================================================================

async def validate_mcp_token(
    authorization: str = Header(None),
    session: AsyncSession = Depends(get_db)
) -> User:
    """Validate MCP token from Authorization header and return user"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization[7:]  # Remove "Bearer " prefix
    
    if not token.startswith("um_mcp_"):
        raise HTTPException(status_code=401, detail="Invalid MCP token format")
    
    # Hash the token to look it up
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    result = await session.execute(
        select(MCPToken).where(
            MCPToken.token_hash == token_hash,
            MCPToken.is_active == True
        )
    )
    mcp_token = result.scalar_one_or_none()
    
    if not mcp_token:
        raise HTTPException(status_code=401, detail="Invalid or revoked MCP token")
    
    # Update usage stats
    await session.execute(
        update(MCPToken)
        .where(MCPToken.id == mcp_token.id)
        .values(
            last_used_at=datetime.utcnow(),
            usage_count=MCPToken.usage_count + 1
        )
    )
    await session.commit()
    
    # Get the user
    user_result = await session.execute(
        select(User).where(User.id == mcp_token.user_id)
    )
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


# =============================================================================
# MCP ENDPOINTS (called by MCP clients with Bearer token)
# =============================================================================

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    project_id: Optional[str] = None


class SearchResultItem(BaseModel):
    memory_id: str
    content: str
    salience: float
    source_id: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[SearchResultItem]


@router.post("/mcp/search", response_model=SearchResponse)
async def mcp_search(
    request: SearchRequest,
    user: User = Depends(validate_mcp_token),
    session: AsyncSession = Depends(get_db)
):
    """Search memories via MCP (Bearer token auth)"""
    from app.core.embeddings import get_embedding_service
    
    embedding_service = get_embedding_service()
    query_embedding, _ = await embedding_service.embed(request.query)
    
    # Vector similarity search
    stmt = select(Memory).where(Memory.owner_id == user.id)
    if request.project_id:
        stmt = stmt.where(Memory.project_id == request.project_id)
    stmt = stmt.order_by(Memory.embedding.cosine_distance(query_embedding)).limit(request.limit)
    result = await session.execute(stmt)
    memories = result.scalars().all()
    
    # Get linked sources
    results = []
    for m in memories:
        source_result = await session.execute(
            select(MemorySource.source_id)
            .where(MemorySource.memory_id == m.id)
            .limit(1)
        )
        source_id = source_result.scalar_one_or_none()
        
        results.append(SearchResultItem(
            memory_id=str(m.id),
            content=m.content,
            salience=m.salience or 0.5,
            source_id=str(source_id) if source_id else None,
        ))
    
    return SearchResponse(results=results)


class MemoryContextResponse(BaseModel):
    memory_id: str
    content: str
    summary: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    raw_excerpt: Optional[str] = None
    found: bool


@router.get("/mcp/memories/{memory_id}/context", response_model=MemoryContextResponse)
async def mcp_get_memory_context(
    memory_id: str,
    user: User = Depends(validate_mcp_token),
    session: AsyncSession = Depends(get_db)
):
    """Get memory with context via MCP (Bearer token auth)"""
    # Get memory
    result = await session.execute(
        select(Memory).where(
            Memory.id == memory_id,
            Memory.owner_id == user.id
        )
    )
    memory = result.scalar_one_or_none()
    
    if not memory:
        return MemoryContextResponse(
            memory_id=memory_id,
            content="",
            found=False,
        )
    
    # Get linked source
    source_result = await session.execute(
        select(Source)
        .join(MemorySource, MemorySource.source_id == Source.id)
        .where(MemorySource.memory_id == memory_id)
        .limit(1)
    )
    source = source_result.scalar_one_or_none()
    
    raw_excerpt = None
    if source and source.raw_content:
        raw_str = str(source.raw_content)[:500]
        raw_excerpt = raw_str + "..." if len(str(source.raw_content)) > 500 else raw_str
    
    return MemoryContextResponse(
        memory_id=str(memory.id),
        content=memory.content,
        summary=source.summary if source else None,
        source_type=source.type if source else None,
        source_id=str(source.id) if source else None,
        raw_excerpt=raw_excerpt,
        found=True,
    )


class SourceResponse(BaseModel):
    id: str
    type: str
    title: Optional[str] = None
    summary: Optional[str] = None
    raw_content: Optional[dict] = None
    found: bool


@router.get("/mcp/sources/{source_id}", response_model=SourceResponse)
async def mcp_get_source(
    source_id: str,
    user: User = Depends(validate_mcp_token),
    session: AsyncSession = Depends(get_db)
):
    """Get source via MCP (Bearer token auth)"""
    result = await session.execute(
        select(Source).where(
            Source.id == source_id,
            Source.owner_id == user.id
        )
    )
    source = result.scalar_one_or_none()
    
    if not source:
        return SourceResponse(
            id=source_id,
            type="unknown",
            found=False,
        )
    
    return SourceResponse(
        id=str(source.id),
        type=source.type,
        title=source.title,
        summary=source.summary,
        raw_content=source.raw_content if isinstance(source.raw_content, dict) else None,
        found=True,
    )


# =============================================================================
# MCP-OVER-HTTP ENDPOINT (SSE Transport)
# =============================================================================

async def validate_mcp_token_from_header(authorization: str, session: AsyncSession) -> tuple[User, MCPToken]:
    """Validate MCP token and return user + token (non-dependency version for SSE)"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization[7:]
    
    if not token.startswith("um_mcp_"):
        raise HTTPException(status_code=401, detail="Invalid MCP token format")
    
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    result = await session.execute(
        select(MCPToken).where(
            MCPToken.token_hash == token_hash,
            MCPToken.is_active == True
        )
    )
    mcp_token = result.scalar_one_or_none()
    
    if not mcp_token:
        raise HTTPException(status_code=401, detail="Invalid or revoked MCP token")
    
    await session.execute(
        update(MCPToken)
        .where(MCPToken.id == mcp_token.id)
        .values(last_used_at=datetime.utcnow(), usage_count=MCPToken.usage_count + 1)
    )
    await session.commit()
    
    user_result = await session.execute(select(User).where(User.id == mcp_token.user_id))
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user, mcp_token


async def log_mcp_activity(
    user_id: str,
    mcp_token_id: Optional[str],
    tool_name: str,
    client_type: Optional[str],
    tool_args: Dict[str, Any],
    result_count: int,
    session: AsyncSession
):
    """Log MCP tool call to activity feed"""
    try:
        activity = MCPActivity(
            user_id=user_id,
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args=tool_args,
            result_count=result_count,
        )
        session.add(activity)
        await session.commit()
    except Exception as e:
        logger.error(f"Failed to log MCP activity: {e}")


async def execute_tool(
    tool_name: str, 
    args: Dict[str, Any], 
    user: User, 
    session: AsyncSession,
    mcp_token_id: Optional[str] = None,
    client_type: Optional[str] = None
) -> Dict[str, Any]:
    """Execute an MCP tool and return result"""
    
    # ---- ChatGPT Connector Tools (search + fetch) ----
    
    if tool_name == "search":
        from app.core.search import hybrid_search
        
        query = args.get("query", "")
        owner_id = str(user.id)
        
        search_results = await hybrid_search(
            session=session,
            query=query,
            limit=15,
            filters={"owner_id": owner_id}
        )
        
        results = []
        for r in search_results:
            m = r["memory"]
            # Find associated source
            source_result = await session.execute(
                select(MemorySource.source_id).where(MemorySource.memory_id == m.id).limit(1)
            )
            source_id = source_result.scalar_one_or_none()
            
            results.append({
                "id": str(m.id),
                "title": m.content[:100] + ("..." if len(m.content) > 100 else ""),
                "url": f"https://unimemory-app.vercel.app/memories?id={m.id}",
                "text": m.content[:300],
            })
        
        await log_mcp_activity(
            user_id=owner_id,
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"query": query},
            result_count=len(results),
            session=session
        )
        
        return {"results": results}
    
    elif tool_name == "fetch":
        item_id = args.get("id", "")
        owner_id = str(user.id)
        
        if not item_id:
            return {"error": "id is required"}
        
        # Try as memory first
        mem_result = await session.execute(
            select(Memory).where(Memory.id == item_id, Memory.owner_id == owner_id)
        )
        memory = mem_result.scalar_one_or_none()
        
        if memory:
            # Find the source for this memory
            source_link = await session.execute(
                select(MemorySource.source_id).where(MemorySource.memory_id == memory.id).limit(1)
            )
            source_id = source_link.scalar_one_or_none()
            
            # If has a source, fetch its full content
            source_text = ""
            source_title = ""
            if source_id:
                src_result = await session.execute(
                    select(Source).where(Source.id == source_id)
                )
                source = src_result.scalar_one_or_none()
                if source:
                    source_title = source.title or ""
                    # Use summary + memory content for full text
                    parts = []
                    if source.summary:
                        parts.append(f"Source Summary:\n{source.summary}")
                    parts.append(f"\nMemory:\n{memory.content}")
                    if source.raw_content:
                        raw = source.raw_content
                        if isinstance(raw, dict):
                            raw = json.dumps(raw, indent=2)
                        if len(str(raw)) > 10000:
                            raw = str(raw)[:10000] + "\n... (truncated)"
                        parts.append(f"\nRaw Source Content:\n{raw}")
                    source_text = "\n".join(parts)
            
            await log_mcp_activity(
                user_id=owner_id,
                mcp_token_id=mcp_token_id,
                tool_name=tool_name,
                client_type=client_type,
                tool_args={"id": item_id},
                result_count=1,
                session=session
            )
            
            return {
                "id": str(memory.id),
                "title": source_title or memory.content[:100],
                "text": source_text or memory.content,
                "url": f"https://unimemory-app.vercel.app/memories?id={memory.id}",
                "metadata": {
                    "type": "memory",
                    "salience": memory.salience,
                    "tags": memory.tags or [],
                    "created_at": memory.created_at.isoformat() if memory.created_at else None,
                    "source_id": str(source_id) if source_id else None,
                }
            }
        
        # Try as source
        src_result = await session.execute(
            select(Source).where(Source.id == item_id, Source.owner_id == owner_id)
        )
        source = src_result.scalar_one_or_none()
        
        if source:
            text_parts = []
            if source.summary:
                text_parts.append(f"Summary:\n{source.summary}")
            if source.raw_content:
                raw = source.raw_content
                if isinstance(raw, dict):
                    raw = json.dumps(raw, indent=2)
                if len(str(raw)) > 10000:
                    raw = str(raw)[:10000] + "\n... (truncated)"
                text_parts.append(f"\nFull Content:\n{raw}")
            
            await log_mcp_activity(
                user_id=owner_id,
                mcp_token_id=mcp_token_id,
                tool_name=tool_name,
                client_type=client_type,
                tool_args={"id": item_id},
                result_count=1,
                session=session
            )
            
            return {
                "id": str(source.id),
                "title": source.title or "Untitled Source",
                "text": "\n".join(text_parts) if text_parts else "No content available",
                "url": f"https://unimemory-app.vercel.app/memories?source={source.id}",
                "metadata": {
                    "type": "source",
                    "source_type": source.source_type,
                    "created_at": source.created_at.isoformat() if source.created_at else None,
                }
            }
        
        return {"error": f"No memory or source found with ID: {item_id}"}
    
    # ---- UniMemory-specific Tools ----
    
    elif tool_name == "search_memory":
        from app.core.search import hybrid_search
        from app.core.reinforcement import reinforce_memories
        
        query = args.get("query", "")
        limit = args.get("limit", 10)
        project_id = args.get("project_id")
        
        # Build filters with optional project scoping
        search_filters: Dict[str, Any] = {"owner_id": str(user.id)}
        if project_id:
            search_filters["project_id"] = project_id
        
        # Use hybrid_search with brain-like scoring (includes coactivation boost)
        search_results = await hybrid_search(
            session=session,
            query=query,
            limit=limit,
            filters=search_filters
        )
        
        results = []
        memory_ids = []
        for r in search_results:
            m = r["memory"]
            memory_ids.append(str(m.id))
            source_result = await session.execute(
                select(MemorySource.source_id).where(MemorySource.memory_id == m.id).limit(1)
            )
            source_id = source_result.scalar_one_or_none()
            results.append({
                "memory_id": str(m.id),
                "content": m.content,
                "salience": m.salience or 0.5,
                "source_id": str(source_id) if source_id else None,
                "score": r.get("score", 0.0),
            })
        
        # Reinforce recalled memories (Hebbian learning)
        if memory_ids:
            try:
                await reinforce_memories(session, memory_ids, query)
            except Exception as e:
                logger.warning(f"Failed to reinforce memories: {e}")
        
        # Log activity
        await log_mcp_activity(
            user_id=str(user.id),
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"query": query, "limit": limit},
            result_count=len(results),
            session=session
        )
        
        return {"results": results, "count": len(results)}
    
    elif tool_name == "get_memory_context":
        from app.core.reinforcement import reinforce_memories
        
        memory_id = args.get("memory_id", "")
        
        result = await session.execute(
            select(Memory).where(Memory.id == memory_id, Memory.owner_id == user.id)
        )
        memory = result.scalar_one_or_none()
        
        if not memory:
            await log_mcp_activity(
                user_id=str(user.id),
                mcp_token_id=mcp_token_id,
                tool_name=tool_name,
                client_type=client_type,
                tool_args={"memory_id": memory_id},
                result_count=0,
                session=session
            )
            return {"memory_id": memory_id, "content": "", "found": False}
        
        # Reinforce this memory (Hebbian learning - viewing = recall)
        try:
            await reinforce_memories(session, [str(memory_id)])
        except Exception as e:
            logger.warning(f"Failed to reinforce memory: {e}")
        
        source_result = await session.execute(
            select(Source)
            .join(MemorySource, MemorySource.source_id == Source.id)
            .where(MemorySource.memory_id == memory_id)
            .limit(1)
        )
        source = source_result.scalar_one_or_none()
        
        raw_excerpt = None
        if source and source.raw_content:
            raw_str = str(source.raw_content)[:500]
            raw_excerpt = raw_str + "..." if len(str(source.raw_content)) > 500 else raw_str
        
        await log_mcp_activity(
            user_id=str(user.id),
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"memory_id": memory_id},
            result_count=1,
            session=session
        )
        
        return {
            "memory_id": str(memory.id),
            "content": memory.content,
            "summary": source.summary if source else None,
            "source_type": source.type if source else None,
            "source_id": str(source.id) if source else None,
            "raw_excerpt": raw_excerpt,
            "found": True,
        }
    
    elif tool_name == "get_source":
        source_id = args.get("source_id", "")
        
        result = await session.execute(
            select(Source).where(Source.id == source_id, Source.owner_id == user.id)
        )
        source = result.scalar_one_or_none()
        
        if not source:
            await log_mcp_activity(
                user_id=str(user.id),
                mcp_token_id=mcp_token_id,
                tool_name=tool_name,
                client_type=client_type,
                tool_args={"source_id": source_id},
                result_count=0,
                session=session
            )
            return {"id": source_id, "type": "unknown", "found": False}
        
        await log_mcp_activity(
            user_id=str(user.id),
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"source_id": source_id},
            result_count=1,
            session=session
        )
        
        return {
            "id": str(source.id),
            "type": source.type,
            "title": source.title,
            "summary": source.summary,
            "raw_content": source.raw_content if isinstance(source.raw_content, dict) else None,
            "found": True,
        }
    
    elif tool_name == "add_source":
        from app.core.embeddings import get_embedding_service
        from app.core.summarizer import SourceSummarizer
        from app.core.extractor import get_extractor
        from app.api.ingest import store_extracted_memories, get_or_create_end_user
        import uuid as uuid_module
        
        raw_content = args.get("raw_content", "")
        source_type = args.get("type")
        metadata = args.get("metadata", {})
        project_id = args.get("project_id")
        
        # Add client_type to metadata for frontend display
        if client_type:
            metadata["client_type"] = client_type
        
        # Determine type if not provided
        if not source_type:
            if isinstance(raw_content, dict) and "messages" in raw_content:
                source_type = "chat"
            else:
                source_type = "text"
        
        try:
            summarizer = SourceSummarizer()
            extractor = get_extractor()
            owner_id = str(user.id)
            
            # Convert to conversation text for processing
            if source_type == "chat" and isinstance(raw_content, dict) and "messages" in raw_content:
                messages = raw_content.get("messages", [])
                conversation = "\n".join([
                    f"{msg.get('role', 'user')}: {msg.get('content', '')}"
                    for msg in messages
                ])
                raw_content_store = {"messages": messages}
            else:
                conversation = raw_content if isinstance(raw_content, str) else json.dumps(raw_content)
                raw_content_store = {"content": conversation}
            
            # Generate title
            generated_title, _ = await summarizer.generate_title(conversation, source_type, metadata=metadata)
            
            # Generate summary and embedding
            summary, summary_embedding, _ = await summarizer.summarize_and_embed(conversation, source_type, metadata=metadata)
            
            # Get or create end_user
            end_user = await get_or_create_end_user(
                session=session,
                owner_id=str(user.id),  # Convert UUID to string
                external_user_id="mcp_user"
            )
            
            # Create Source record
            source_uuid = str(uuid_module.uuid4())
            source = Source(
                id=source_uuid,
                owner_id=str(user.id),  # Convert to string (UUID(as_uuid=False))
                end_user_id=end_user.id,  # Already a string from get_or_create_end_user
                project_id=project_id,  # Project to save source to
                type=source_type,
                source_app="mcp",
                title=generated_title,
                raw_content=raw_content_store,
                summary=summary,
                summary_embedding=summary_embedding,
                source_metadata=metadata,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            session.add(source)
            await session.flush()
            
            # Extract memories
            extraction = await extractor.extract_memories(conversation, metadata=metadata)
            memories_count = 0
            
            if extraction.memories:
                # Store memories without background tasks (MCP context doesn't have BackgroundTasks)
                embedding_service = get_embedding_service()
                from app.core.simhash import compute_simhash, hamming_distance
                from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
                from app.config import settings
                
                # Fetch existing memories for deduplication
                stmt = select(Memory).where(
                    Memory.simhash.isnot(None),
                    Memory.is_active == True,
                    Memory.owner_id == owner_id,
                    Memory.user_id == "mcp_user"
                ).order_by(Memory.salience.desc()).limit(500)
                
                result = await session.execute(stmt)
                existing_memories = result.scalars().all()
                simhash_to_memory = {em.simhash: em for em in existing_memories if em.simhash}
                
                stored_count = 0
                new_memories_for_waypoints = []  # Collect (memory_id, embedding) for waypoint creation
                for mem_item in extraction.memories:
                    mem_content = mem_item.content.strip()
                    if not mem_content:
                        continue
                    
                    simhash = compute_simhash(mem_content)
                    
                    # Check for duplicates
                    is_duplicate = False
                    for existing_hash in simhash_to_memory.keys():
                        if hamming_distance(simhash, existing_hash) <= 3:
                            is_duplicate = True
                            break
                    
                    if is_duplicate:
                        continue
                    
                    # Classify sector and calculate salience
                    sector, additional_sectors, confidence = classify_sector(mem_content)
                    decay_lambda = get_sector_decay_lambda(sector)
                    initial_salience = calculate_initial_salience(sector, additional_sectors)
                    
                    # Generate embedding
                    embedding, _ = await embedding_service.embed(mem_content)
                    memory_id = str(uuid_module.uuid4())
                    
                    # Create memory with all required fields (matching ingest.py pattern)
                    memory = Memory(
                        id=memory_id,
                        content=mem_content,
                        simhash=simhash,
                        sector=sector,
                        salience=initial_salience,
                        decay_lambda=decay_lambda,
                        segment=0,
                        tags=mem_item.tags or [],
                        extra_metadata={},
                        source_app="mcp",
                        user_id="mcp_user",
                        end_user_id=end_user.id,  # Already a string from get_or_create_end_user
                        owner_id=str(user.id),  # Convert to string (UUID(as_uuid=False))
                        project_id=project_id,  # Project to save memory to
                        api_key_id=None,
                        embedding=embedding,
                        embedding_model=settings.EMBEDDING_MODEL,
                        is_active=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                        last_seen_at=datetime.utcnow()
                    )
                    session.add(memory)
                    simhash_to_memory[simhash] = memory
                    new_memories_for_waypoints.append((memory_id, embedding))
                    
                    # Link to source (same pattern as ingest.py)
                    if source_uuid:
                        link = MemorySource(
                            id=str(uuid_module.uuid4()),
                            memory_id=memory_id,
                            source_id=source_uuid,
                        )
                        session.add(link)
                        await session.commit()  # Commit each link individually like ingest.py
                    
                    stored_count += 1
                
                memories_count = stored_count
            
            await session.commit()
            
            # Create waypoints in background (MCP has no BackgroundTasks, use asyncio)
            if new_memories_for_waypoints:
                from app.api.ingest import create_waypoints_background
                from app.db.database import AsyncSessionLocal
                asyncio.create_task(
                    create_waypoints_background(
                        AsyncSessionLocal,
                        [m[0] for m in new_memories_for_waypoints],
                        [m[1] for m in new_memories_for_waypoints],
                        "mcp_user"
                    )
                )
            
            await log_mcp_activity(
                user_id=str(user.id),
                mcp_token_id=mcp_token_id,
                tool_name=tool_name,
                client_type=client_type,
                tool_args={"type": source_type, "content_length": len(str(raw_content))},
                result_count=memories_count,
                session=session
            )
            
            return {
                "success": True,
                "source_id": source_uuid,
                "title": generated_title,
                "summary": summary,
                "memories_extracted": memories_count,
                "message": "Source saved successfully. Title, summary, and memories were automatically generated.",
            }
        except Exception as e:
            logger.error(f"add_source error: {e}")
            return {"success": False, "error": str(e)}
    
    elif tool_name == "get_projects":
        from app.db.models import Project
        
        owner_id = str(user.id)
        
        # Get all projects with memory and source counts
        memory_count_subq = (
            select(
                Memory.project_id,
                func.count(Memory.id).label('memory_count')
            )
            .where(Memory.is_active == True, Memory.owner_id == owner_id)
            .group_by(Memory.project_id)
            .subquery()
        )
        
        source_count_subq = (
            select(
                Source.project_id,
                func.count(Source.id).label('source_count')
            )
            .where(Source.owner_id == owner_id)
            .group_by(Source.project_id)
            .subquery()
        )
        
        result = await session.execute(
            select(Project, memory_count_subq.c.memory_count, source_count_subq.c.source_count)
            .outerjoin(memory_count_subq, Project.id == memory_count_subq.c.project_id)
            .outerjoin(source_count_subq, Project.id == source_count_subq.c.project_id)
            .where(Project.owner_id == owner_id)
            .order_by(Project.is_default.desc(), Project.is_pinned.desc(), Project.updated_at.desc())
        )
        projects = result.all()
        
        await log_mcp_activity(
            user_id=owner_id,
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={},
            result_count=len(projects),
            session=session
        )
        
        return {
            "projects": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "slug": p.slug,
                    "description": p.description,
                    "icon": p.icon or "📁",
                    "status": p.status or "active",
                    "status_note": p.status_note,
                    "is_default": p.is_default or False,
                    "is_pinned": p.is_pinned or False,
                    "memory_count": mc or 0,
                    "source_count": sc or 0,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                }
                for p, mc, sc in projects
            ],
            "count": len(projects)
        }
    
    elif tool_name == "get_project_status":
        from app.db.models import Project
        
        project_id = args.get("project_id", "")
        owner_id = str(user.id)
        
        if not project_id:
            return {"error": "project_id is required"}
        
        # Get project
        result = await session.execute(
            select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return {"error": "Project not found", "found": False}
        
        # Get counts
        mem_count = (await session.execute(
            select(func.count(Memory.id))
            .where(Memory.project_id == project_id, Memory.is_active == True)
        )).scalar() or 0
        
        src_count = (await session.execute(
            select(func.count(Source.id))
            .where(Source.project_id == project_id)
        )).scalar() or 0
        
        # Get recent memories (latest 10 as a "log")
        recent_mems = await session.execute(
            select(Memory)
            .where(Memory.project_id == project_id, Memory.is_active == True, Memory.owner_id == owner_id)
            .order_by(Memory.created_at.desc())
            .limit(10)
        )
        recent_memories = recent_mems.scalars().all()
        
        # Get recent sources (latest 5)
        recent_srcs = await session.execute(
            select(Source)
            .where(Source.project_id == project_id, Source.owner_id == owner_id)
            .order_by(Source.created_at.desc())
            .limit(5)
        )
        recent_sources = recent_srcs.scalars().all()
        
        await log_mcp_activity(
            user_id=owner_id,
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"project_id": project_id},
            result_count=1,
            session=session
        )
        
        return {
            "found": True,
            "project": {
                "id": str(project.id),
                "name": project.name,
                "slug": project.slug,
                "description": project.description,
                "icon": project.icon or "📁",
                "status": project.status or "active",
                "status_note": project.status_note,
                "is_default": project.is_default or False,
                "memory_count": mem_count,
                "source_count": src_count,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            },
            "recent_memories": [
                {
                    "id": str(m.id),
                    "content": m.content[:200],
                    "sector": m.sector,
                    "memory_type": m.memory_type,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in recent_memories
            ],
            "recent_sources": [
                {
                    "id": str(s.id),
                    "type": s.type,
                    "title": s.title,
                    "summary": s.summary[:200] if s.summary else None,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in recent_sources
            ],
        }
    
    elif tool_name == "update_project_status":
        from app.db.models import Project
        
        project_id = args.get("project_id", "")
        new_status = args.get("status")
        status_note = args.get("status_note")
        owner_id = str(user.id)
        
        if not project_id:
            return {"error": "project_id is required"}
        
        # Get project
        result = await session.execute(
            select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return {"error": "Project not found", "success": False}
        
        # Update fields
        if new_status:
            project.status = new_status
        if status_note is not None:  # Allow empty string to clear note
            project.status_note = status_note
        project.updated_at = datetime.utcnow()
        
        await session.commit()
        await session.refresh(project)
        
        await log_mcp_activity(
            user_id=owner_id,
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"project_id": project_id, "status": new_status, "status_note": status_note},
            result_count=1,
            session=session
        )
        
        return {
            "success": True,
            "project": {
                "id": str(project.id),
                "name": project.name,
                "status": project.status,
                "status_note": project.status_note,
                "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            },
            "message": f"Project '{project.name}' status updated to '{project.status}'.",
        }
    
    else:
        return {"error": f"Unknown tool: {tool_name}"}


def create_jsonrpc_response(id: Any, result: Any) -> str:
    """Create a JSON-RPC 2.0 response"""
    return json.dumps({"jsonrpc": "2.0", "id": id, "result": result})


def create_jsonrpc_error(id: Any, code: int, message: str) -> str:
    """Create a JSON-RPC 2.0 error response"""
    return json.dumps({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})


@router.post("/mcp")
async def mcp_http_handler(request: Request, session: AsyncSession = Depends(get_db)):
    """
    MCP-over-HTTP endpoint (JSON-RPC 2.0)
    Handles: initialize, tools/list, tools/call
    """
    authorization = request.headers.get("Authorization", "")
    
    try:
        user, mcp_token = await validate_mcp_token_from_header(authorization, session)
    except HTTPException as e:
        return StreamingResponse(
            iter([f"data: {create_jsonrpc_error(None, -32000, e.detail)}\n\n"]),
            media_type="text/event-stream",
            status_code=401
        )
    
    try:
        body = await request.json()
    except:
        return StreamingResponse(
            iter([f"data: {create_jsonrpc_error(None, -32700, 'Parse error')}\n\n"]),
            media_type="text/event-stream",
            status_code=400
        )
    
    method = body.get("method", "")
    params = body.get("params", {})
    msg_id = body.get("id", 1)
    
    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": MCP_SERVER_INFO,
        }
        return StreamingResponse(
            iter([f"data: {create_jsonrpc_response(msg_id, result)}\n\n"]),
            media_type="text/event-stream"
        )
    
    elif method == "tools/list":
        result = {"tools": MCP_TOOLS}
        return StreamingResponse(
            iter([f"data: {create_jsonrpc_response(msg_id, result)}\n\n"]),
            media_type="text/event-stream"
        )
    
    elif method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})
        
        try:
            tool_result = await execute_tool(
                tool_name, 
                tool_args, 
                user, 
                session,
                mcp_token_id=str(mcp_token.id),
                client_type=mcp_token.client_type
            )
            result = {"content": [{"type": "text", "text": json.dumps(tool_result, default=str)}]}
            return StreamingResponse(
                iter([f"data: {create_jsonrpc_response(msg_id, result)}\n\n"]),
                media_type="text/event-stream"
            )
        except Exception as e:
            logger.error(f"Tool execution error: {e}")
            return StreamingResponse(
                iter([f"data: {create_jsonrpc_error(msg_id, -32603, str(e))}\n\n"]),
                media_type="text/event-stream"
            )
    
    else:
        return StreamingResponse(
            iter([f"data: {create_jsonrpc_error(msg_id, -32601, f'Method not found: {method}')}\n\n"]),
            media_type="text/event-stream"
        )


@router.get("/mcp")
async def mcp_http_sse(request: Request, session: AsyncSession = Depends(get_db)):
    """
    MCP-over-HTTP SSE endpoint for streaming connections
    Returns server info on GET (for client handshake)
    """
    authorization = request.headers.get("Authorization", "")
    
    try:
        user, mcp_token = await validate_mcp_token_from_header(authorization, session)
    except HTTPException as e:
        return {"error": e.detail}
    
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {"tools": {}},
        "serverInfo": MCP_SERVER_INFO,
        "tools": MCP_TOOLS,
    }


# =============================================================================
# STANDARD MCP SSE TRANSPORT (for ChatGPT Apps / Connectors)
# =============================================================================

# In-memory session store for SSE connections
_sse_sessions: Dict[str, Dict[str, Any]] = {}


@router.get("/mcp/sse")
async def mcp_sse_endpoint(request: Request, session: AsyncSession = Depends(get_db)):
    """
    Standard MCP SSE Transport - GET endpoint.
    Opens a persistent SSE stream and sends an `endpoint` event
    telling the client where to POST JSON-RPC messages.
    ChatGPT connects to this URL as the MCP Server URL.
    """
    import uuid as uuid_module
    
    authorization = request.headers.get("Authorization", "")
    
    # Validate auth - return proper 401 with resource_metadata for OAuth discovery
    try:
        user, mcp_token = await validate_mcp_token_from_header(authorization, session)
    except HTTPException as e:
        return JSONResponse(
            status_code=401,
            content={"error": e.detail},
            headers={
                "WWW-Authenticate": f'Bearer resource_metadata="{MCP_SSE_SERVER_URL}/.well-known/oauth-protected-resource"'
            }
        )
    
    # Create a session for this SSE connection
    session_id = str(uuid_module.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _sse_sessions[session_id] = {
        "queue": queue,
        "user_id": str(user.id),
        "mcp_token_id": str(mcp_token.id),
        "client_type": mcp_token.client_type or "chatgpt",
        "created_at": datetime.utcnow().isoformat(),
    }
    
    logger.info(f"[MCP SSE] New session {session_id} for user {user.id}")
    
    # Build the messages endpoint URL
    messages_url = f"{MCP_SERVER_URL}/sse/messages?session_id={session_id}"
    
    async def event_stream():
        try:
            # Send the endpoint event (tells client where to POST)
            yield f"event: endpoint\ndata: {messages_url}\n\n"
            
            # Keep the stream alive, forwarding responses from the queue
            while True:
                try:
                    # Wait for a message (with keepalive timeout)
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"event: message\ndata: {message}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent connection drop
                    yield ": keepalive\n\n"
                
                # Check if client disconnected
                if await request.is_disconnected():
                    break
        except asyncio.CancelledError:
            pass
        finally:
            # Clean up session
            _sse_sessions.pop(session_id, None)
            logger.info(f"[MCP SSE] Session {session_id} closed")
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/mcp/sse/messages")
async def mcp_sse_messages(
    request: Request,
    session_id: str = None,
    session: AsyncSession = Depends(get_db)
):
    """
    Standard MCP SSE Transport - POST endpoint for JSON-RPC messages.
    Clients POST JSON-RPC here, response is sent back on the SSE stream.
    """
    # Get session_id from query params
    if not session_id:
        from urllib.parse import parse_qs, urlparse
        query_params = dict(request.query_params)
        session_id = query_params.get("session_id")
    
    if not session_id or session_id not in _sse_sessions:
        return JSONResponse(
            status_code=404,
            content={"error": "Session not found. Connect to GET /mcp/sse first."}
        )
    
    sse_session = _sse_sessions[session_id]
    queue = sse_session["queue"]
    user_id = sse_session["user_id"]
    mcp_token_id = sse_session["mcp_token_id"]
    client_type = sse_session["client_type"]
    
    # Get the user
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return JSONResponse(status_code=401, content={"error": "User not found"})
    
    # Get MCP token for activity logging
    token_result = await session.execute(select(MCPToken).where(MCPToken.id == mcp_token_id))
    mcp_token = token_result.scalar_one_or_none()
    
    try:
        body = await request.json()
    except Exception:
        error_response = create_jsonrpc_error(None, -32700, "Parse error")
        await queue.put(error_response)
        return JSONResponse(content={"status": "ok"})
    
    method = body.get("method", "")
    params = body.get("params", {})
    msg_id = body.get("id", 1)
    
    logger.info(f"[MCP SSE] Session {session_id}: {method}")
    
    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": MCP_SERVER_INFO,
        }
        await queue.put(create_jsonrpc_response(msg_id, result))
    
    elif method == "notifications/initialized":
        # Client ack - no response needed
        pass
    
    elif method == "tools/list":
        result = {"tools": MCP_TOOLS}
        await queue.put(create_jsonrpc_response(msg_id, result))
    
    elif method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})
        
        try:
            tool_result = await execute_tool(
                tool_name,
                tool_args,
                user,
                session,
                mcp_token_id=mcp_token_id,
                client_type=client_type
            )
            result = {"content": [{"type": "text", "text": json.dumps(tool_result, default=str)}]}
            await queue.put(create_jsonrpc_response(msg_id, result))
        except Exception as e:
            logger.error(f"[MCP SSE] Tool execution error: {e}")
            await queue.put(create_jsonrpc_error(msg_id, -32603, str(e)))
    
    else:
        await queue.put(create_jsonrpc_error(msg_id, -32601, f"Method not found: {method}"))
    
    return JSONResponse(content={"status": "ok"})
