"""
MCP Token API endpoints for consumer users
Handles creation, listing, and revocation of MCP tokens for AI agent connections
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import hashlib
import secrets
import logging

from app.db.database import get_db
from app.db.models import MCPToken, User, Memory, Source, MemorySource
from app.core.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


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


class MCPTokenCreatedResponse(BaseModel):
    id: str
    name: str
    client_type: str
    token: str  # Only returned once at creation
    mcp_url: str
    install_command: str


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
    """Generate install command for each client type"""
    if client_type == "cursor":
        return f'cursor://mcp/install?name=unimemory&url={mcp_url}&token={token}'
    elif client_type == "claude":
        return f'''Add to ~/Library/Application Support/Claude/claude_desktop_config.json:
{{
  "mcpServers": {{
    "unimemory": {{
      "url": "{mcp_url}",
      "headers": {{ "Authorization": "Bearer {token}" }}
    }}
  }}
}}'''
    elif client_type == "vscode":
        return f'''Add to VS Code MCP settings:
{{
  "mcpServers": {{
    "unimemory": {{
      "url": "{mcp_url}",
      "headers": {{ "Authorization": "Bearer {token}" }}
    }}
  }}
}}'''
    elif client_type == "windsurf":
        return f'windsurf://mcp/install?name=unimemory&url={mcp_url}&token={token}'
    else:
        return f'MCP URL: {mcp_url}\nToken: {token}'


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
        is_active=True,
    )
    
    session.add(mcp_token)
    await session.commit()
    await session.refresh(mcp_token)
    
    # MCP URL - this will be your hosted MCP endpoint
    mcp_url = "https://unimemory.up.railway.app/api/v1/mcp"
    
    return MCPTokenCreatedResponse(
        id=str(mcp_token.id),
        name=mcp_token.name,
        client_type=mcp_token.client_type,
        token=token,
        mcp_url=mcp_url,
        install_command=get_install_command(client_type, token, mcp_url),
    )


@router.get("/consumer/mcp/tokens", response_model=MCPTokenListResponse)
async def list_mcp_tokens(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """List all MCP tokens for the current user"""
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
