"""
MCP API endpoints for consumer users
Handles MCP tokens and MCP-over-HTTP protocol for AI agent connections
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
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
APP_URL = "https://unimemory-app.vercel.app"
API_URL = "https://unimemory.up.railway.app/api/v1"

MCP_SERVER_INFO = {
    "name": "unimemory",
    "version": "1.0.0",
}


# =============================================================================
# OAUTH DISCOVERY ENDPOINTS (for install-mcp and MCP clients)
# =============================================================================

@router.get("/mcp/.well-known/oauth-protected-resource")
async def oauth_protected_resource():
    """
    OAuth 2.0 Protected Resource Metadata endpoint.
    MCP clients use this to discover the authorization server.
    https://datatracker.ietf.org/doc/html/rfc8707
    """
    return {
        "resource": MCP_SERVER_URL,
        "authorization_servers": [API_URL],
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "bearer_methods_supported": ["header"],
        "resource_documentation": "https://unimemory.app/docs/mcp",
    }


@router.get("/mcp/.well-known/oauth-authorization-server")
@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server():
    """
    OAuth 2.0 Authorization Server Metadata endpoint.
    Available at both /mcp/.well-known/ and /.well-known/ paths
    since install-mcp queries the authorization_servers URL directly.
    https://datatracker.ietf.org/doc/html/rfc8414
    """
    return {
        "issuer": API_URL,
        "authorization_endpoint": f"{APP_URL}/mcp/authorize",
        "token_endpoint": f"{API_URL}/mcp/oauth/token",
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
    }


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
    {
        "name": "search_memory",
        "description": "Search your memory for relevant information. Use this to find what you know about a topic, person, preference, or past conversation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for in memory (natural language query)"},
                "limit": {"type": "number", "description": "Maximum number of results to return (default: 10)"}
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
        "description": "Save a full document, chat, or conversation as a source. The system will automatically generate a title, summary, and extract nuclear memories from the content. Use this for saving entire conversations, documents, or any substantial content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "raw_content": {"type": ["string", "object"], "description": "The full content to save. Can be a string (for text/documents) or an object with messages array (for chats)."},
                "type": {"type": "string", "enum": ["chat", "document", "text"], "description": "Type of source. Defaults to 'chat' if raw_content has messages, otherwise 'text'."},
                "metadata": {"type": "object", "description": "Optional metadata like tags, context, or custom fields."}
            },
            "required": ["raw_content"]
        }
    },
    {
        "name": "add_memory",
        "description": "Save a single atomic fact, preference, or piece of information as a memory. Use this for explicit facts like 'User prefers FastAPI', 'Birthday is Aug 12', or 'Uses dark mode'. For full conversations or documents, use add_source instead.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The fact or information to remember. Should be a single, clear statement."},
                "category": {"type": "string", "description": "Optional category like 'preference', 'fact', 'decision', or 'personal'."}
            },
            "required": ["content"]
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
    result = await session.execute(
        select(Memory)
        .where(Memory.owner_id == user.id)
        .order_by(Memory.embedding.cosine_distance(query_embedding))
        .limit(request.limit)
    )
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
    
    if tool_name == "search_memory":
        from app.core.embeddings import get_embedding_service
        
        query = args.get("query", "")
        limit = args.get("limit", 10)
        
        embedding_service = get_embedding_service()
        query_embedding, _ = await embedding_service.embed(query)
        
        result = await session.execute(
            select(Memory)
            .where(Memory.owner_id == user.id)
            .order_by(Memory.embedding.cosine_distance(query_embedding))
            .limit(limit)
        )
        memories = result.scalars().all()
        
        results = []
        for m in memories:
            source_result = await session.execute(
                select(MemorySource.source_id).where(MemorySource.memory_id == m.id).limit(1)
            )
            source_id = source_result.scalar_one_or_none()
            results.append({
                "memory_id": str(m.id),
                "content": m.content,
                "salience": m.salience or 0.5,
                "source_id": str(source_id) if source_id else None,
            })
        
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
                owner_id=owner_id,
                external_user_id="mcp_user"
            )
            
            # Create Source record
            source_uuid = str(uuid_module.uuid4())
            source = Source(
                id=source_uuid,
                owner_id=owner_id,
                end_user_id=str(end_user.id),
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
                        end_user_id=str(end_user.id),
                        owner_id=owner_id,
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
                    
                    # Link to source
                    if source_uuid:
                        link = MemorySource(
                            memory_id=memory_id,
                            source_id=source_uuid,
                        )
                        session.add(link)
                    
                    stored_count += 1
                
                memories_count = stored_count
            
            await session.commit()
            
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
    
    elif tool_name == "add_memory":
        from app.core.embeddings import get_embedding_service
        from app.core.simhash import compute_simhash
        from app.core.sector import classify_sector, get_sector_decay_lambda, calculate_initial_salience
        from app.config import settings
        import uuid as uuid_mod
        
        content = args.get("content", "")
        category = args.get("category")  # Used for extra_metadata
        
        if not content:
            return {"success": False, "error": "Content is required"}
        
        try:
            # Generate embedding and simhash
            embedding_service = get_embedding_service()
            embedding, _ = await embedding_service.embed(content)
            simhash = compute_simhash(content)
            
            # Classify sector and calculate salience
            sector, additional_sectors, confidence = classify_sector(content)
            decay_lambda = get_sector_decay_lambda(sector)
            initial_salience = calculate_initial_salience(sector, additional_sectors)
            
            memory_id = str(uuid_mod.uuid4())
            
            # Create memory with all required fields (matching ingest.py pattern)
            memory = Memory(
                id=memory_id,
                content=content,
                simhash=simhash,
                sector=sector,
                salience=initial_salience,
                decay_lambda=decay_lambda,
                segment=0,
                tags=[],
                extra_metadata={"category": category} if category else {},
                source_app="mcp",
                user_id="mcp_user",
                end_user_id=None,
                owner_id=str(user.id),
                api_key_id=None,
                embedding=embedding,
                embedding_model=settings.EMBEDDING_MODEL,
                is_active=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                last_seen_at=datetime.utcnow()
            )
            session.add(memory)
            await session.commit()
            
            await log_mcp_activity(
                user_id=str(user.id),
                mcp_token_id=mcp_token_id,
                tool_name=tool_name,
                client_type=client_type,
                tool_args={"content_length": len(content), "category": category},
                result_count=1,
                session=session
            )
            
            return {
                "success": True,
                "memory_id": memory_id,
                "content": content,
                "sector": sector,
                "salience": initial_salience,
                "message": "Memory saved successfully.",
            }
        except Exception as e:
            logger.error(f"add_memory error: {e}")
            return {"success": False, "error": str(e)}
    
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
