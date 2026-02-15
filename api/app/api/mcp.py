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
OAUTH_ROOT = "https://unimemory.up.railway.app"
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
        "authorization_servers": [OAUTH_ROOT],
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "bearer_methods_supported": ["header"],
        "resource_documentation": "https://unimemory.app/docs/mcp",
    }

def _oauth_authorization_server_response():
    return {
        "issuer": OAUTH_ROOT,
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


# =============================================================================
# DATABASE-BACKED OAUTH CODE STORAGE (works across multiple workers)
# =============================================================================
# OAuth codes are stored as special MCP activity records in the database,
# ensuring they work correctly when running multiple uvicorn workers.

async def _store_oauth_code_db(session: AsyncSession, code: str, user_id: str, 
                                code_challenge: Optional[str] = None, client: str = "mcp"):
    """Store OAuth authorization code in the database (cross-worker safe)"""
    import uuid as uuid_module
    
    # IMPORTANT: Pass a Python dict, NOT json.dumps(). asyncpg double-encodes
    # strings for JSONB columns, which would make ->>'code' lookups fail.
    code_data_dict = {
        "code": code,
        "user_id": user_id,
        "code_challenge": code_challenge,
        "client": client,
        "created_at": datetime.utcnow().isoformat(),
    }
    
    record_id = str(uuid_module.uuid4())
    
    # Use the ORM model directly instead of raw SQL for proper JSONB handling
    activity = MCPActivity(
        id=record_id,
        user_id=user_id,
        tool_name="oauth_code",
        tool_args=code_data_dict,
    )
    session.add(activity)
    await session.commit()
    logger.info(f"[OAuth] Stored code in DB for user {user_id[:8]}... (code prefix: {code[:8]}..., record: {record_id[:8]}...)")


async def _get_and_delete_oauth_code_db(session: AsyncSession, code: str) -> Optional[Dict]:
    """Retrieve and delete OAuth code from database (one-time use)"""
    from sqlalchemy import text, cast
    from sqlalchemy.dialects.postgresql import JSONB as JSONB_TYPE
    
    # First, try to find the code. Log what we find for debugging.
    # Use raw SQL with text cast to ensure proper JSONB query
    try:
        result = await session.execute(
            select(MCPActivity)
            .where(
                MCPActivity.tool_name == "oauth_code",
                MCPActivity.tool_args["code"].astext == code,
            )
            .order_by(MCPActivity.created_at.desc())
            .limit(1)
        )
        activity = result.scalar_one_or_none()
    except Exception as e:
        logger.error(f"[OAuth] Error querying code with ORM: {e}")
        # Fallback: try raw SQL with explicit JSONB cast
        try:
            result = await session.execute(
                text("""
                    SELECT id, tool_args FROM mcp_activity 
                    WHERE tool_name = 'oauth_code'
                    AND tool_args->>'code' = :code
                    AND created_at > NOW() - INTERVAL '10 minutes'
                    LIMIT 1
                """),
                {"code": code}
            )
            row = result.fetchone()
            if row:
                record_id = row[0]
                await session.execute(
                    text("DELETE FROM mcp_activity WHERE id = :rid AND tool_name = 'oauth_code'"),
                    {"rid": str(record_id)}
                )
                await session.commit()
                code_data = json.loads(row[1]) if isinstance(row[1], str) else row[1]
                logger.info(f"[OAuth] Code exchanged (fallback) for user {code_data.get('user_id', '?')[:8]}...")
                return code_data
            else:
                logger.warning(f"[OAuth] Code not found (fallback): {code[:8]}...")
                return None
        except Exception as e2:
            logger.error(f"[OAuth] Fallback query also failed: {e2}")
            return None
    
    if not activity:
        # Log how many oauth_code records exist for debugging
        count_result = await session.execute(
            select(func.count(MCPActivity.id))
            .where(MCPActivity.tool_name == "oauth_code")
        )
        total_codes = count_result.scalar() or 0
        logger.warning(f"[OAuth] Code not found: {code[:8]}... (total oauth_code records in DB: {total_codes})")
        return None
    
    # Check TTL (10 minutes)
    if activity.created_at:
        from datetime import timezone
        created = activity.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - created).total_seconds()
        if age_seconds > 600:  # 10 minutes
            logger.warning(f"[OAuth] Code expired (age: {age_seconds:.0f}s): {code[:8]}...")
            await session.delete(activity)
            await session.commit()
            return None
    
    # Extract data
    code_data = activity.tool_args
    if isinstance(code_data, str):
        code_data = json.loads(code_data)
    
    # Delete the code (one-time use)
    await session.delete(activity)
    await session.commit()
    
    logger.info(f"[OAuth] Code exchanged for user {code_data.get('user_id', '?')[:8]}... (record: {str(activity.id)[:8]}...)")
    return code_data


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
    Uses database-backed code storage (works across multiple workers).
    """
    try:
        # Parse form data or JSON
        content_type = request.headers.get("content-type", "")
        logger.info(f"[OAuth] Token request received. Content-Type: {content_type}")
        
        if "application/x-www-form-urlencoded" in content_type:
            form_data = await request.form()
            grant_type = form_data.get("grant_type")
            code = form_data.get("code")
            redirect_uri = form_data.get("redirect_uri")
            code_verifier = form_data.get("code_verifier")
            client_id = form_data.get("client_id")
        else:
            body = await request.json()
            grant_type = body.get("grant_type")
            code = body.get("code")
            redirect_uri = body.get("redirect_uri")
            code_verifier = body.get("code_verifier")
            client_id = body.get("client_id")
        
        logger.info(
            f"[OAuth] Token request: grant_type={grant_type}, "
            f"code={code[:8] if code else 'None'}..., "
            f"has_verifier={bool(code_verifier)}, client_id={client_id}"
        )
        
        if grant_type != "authorization_code":
            logger.warning(f"[OAuth] Unsupported grant_type: {grant_type}")
            return JSONResponse(
                status_code=400,
                content={"error": "unsupported_grant_type"}
            )
        
        if not code:
            logger.warning("[OAuth] Missing code in token request")
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_request", "error_description": "Missing code"}
            )
        
        # Look up the code from database
        code_data = await _get_and_delete_oauth_code_db(session, code)
        if not code_data:
            logger.warning(f"[OAuth] Code lookup failed for: {code[:8]}...")
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Invalid or expired code"}
            )
        
        logger.info(
            f"[OAuth] Code found! user_id={code_data.get('user_id', '?')[:8]}..., "
            f"has_challenge={bool(code_data.get('code_challenge'))}"
        )
        
        # Verify PKCE if provided
        if code_data.get("code_challenge") and code_verifier:
            import base64
            expected = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).decode().rstrip("=")
            if expected != code_data["code_challenge"]:
                logger.warning(
                    "[OAuth] PKCE verification failed! "
                    f"expected={expected[:8]}..., "
                    f"challenge={code_data['code_challenge'][:8]}..."
                )
                return JSONResponse(
                    status_code=400,
                    content={"error": "invalid_grant", "error_description": "PKCE verification failed"}
                )
            logger.info("[OAuth] PKCE verification passed")
        elif code_data.get("code_challenge") and not code_verifier:
            logger.warning("[OAuth] code_challenge was stored but no code_verifier provided")
        
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
                name="ChatGPT MCP Token",
                client_type=code_data.get("client", "chatgpt"),
                token_hash=token_hash,
                token_prefix=token_prefix,
                token_value=token,
                is_active=True,
            )
            session.add(mcp_token)
            await session.commit()
            await session.refresh(mcp_token)
            access_token = token
            logger.info(f"[OAuth] Created new MCP token for user {user_id[:8]}...")
        else:
            access_token = mcp_token.token_value
            logger.info(f"[OAuth] Using existing MCP token for user {user_id[:8]}...")
        
        logger.info(
            f"[OAuth] Token issued successfully for user {user_id[:8]}... "
            f"(token prefix: {access_token[:12]}...)"
        )
        
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": 86400 * 365,  # 1 year
            "scope": "openid profile email",
        }
    
    except Exception as e:
        logger.error(f"[OAuth] Token endpoint error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "server_error", "error_description": str(e)}
        )


@router.get("/mcp/oauth/debug")
async def oauth_debug(session: AsyncSession = Depends(get_db)):
    """Debug endpoint to check OAuth code storage state (remove in production later)"""
    
    try:
        # Check recent oauth_code records
        result = await session.execute(
            select(MCPActivity)
            .where(MCPActivity.tool_name == "oauth_code")
            .order_by(MCPActivity.created_at.desc())
            .limit(5)
        )
        activities = result.scalars().all()
        
        records = []
        for a in activities:
            tool_args = a.tool_args
            records.append({
                "id": str(a.id)[:8] + "...",
                "user_id": str(a.user_id)[:8] + "...",
                "tool_args_type": type(tool_args).__name__,
                "has_code_key": isinstance(tool_args, dict) and "code" in tool_args,
                "code_prefix": tool_args.get("code", "?")[:8] + "..." if isinstance(tool_args, dict) else "NOT_A_DICT",
                "created_at": str(a.created_at),
            })
        
        # Also check if there are any MCP tokens (for ChatGPT)
        token_result = await session.execute(
            select(MCPToken)
            .where(MCPToken.is_active == True)
            .order_by(MCPToken.created_at.desc())
            .limit(5)
        )
        tokens = token_result.scalars().all()
        
        token_records = []
        for t in tokens:
            token_records.append({
                "id": str(t.id)[:8] + "...",
                "name": t.name,
                "client_type": t.client_type,
                "has_token_value": bool(t.token_value),
                "last_used_at": str(t.last_used_at) if t.last_used_at else None,
                "usage_count": t.usage_count,
                "created_at": str(t.created_at),
            })
        
        return {
            "total_oauth_codes": len(activities),
            "code_records": records,
            "total_mcp_tokens": len(token_records),
            "token_records": token_records,
            "note": "If tool_args_type is 'str' instead of 'dict', JSONB was double-encoded (bug)",
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/mcp/oauth/test-flow")
async def oauth_test_flow(session: AsyncSession = Depends(get_db)):
    """
    TEMPORARY: Test the full OAuth + MCP connection flow end-to-end.
    1. Creates a test OAuth code with PKCE
    2. Exchanges it for a token
    3. Validates the token would work for MCP SSE
    Remove this endpoint after debugging.
    """
    import base64
    
    steps = {}
    
    try:
        # Step 1: Find a user to test with
        user_result = await session.execute(select(User).limit(1))
        user = user_result.scalar_one_or_none()
        if not user:
            return {"error": "No users in database"}
        
        test_user_id = str(user.id)
        steps["1_user"] = {"user_id": test_user_id[:8] + "...", "ok": True}
        
        # Step 2: Create a test code with PKCE
        test_code_verifier = "test_verifier_" + secrets.token_urlsafe(32)
        test_code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(test_code_verifier.encode()).digest()
        ).decode().rstrip("=")
        test_code = secrets.token_urlsafe(32)
        
        await _store_oauth_code_db(
            session, test_code, test_user_id, 
            code_challenge=test_code_challenge, client="test"
        )
        steps["2_code_stored"] = {"ok": True}
        
        # Step 3: Verify it's in the DB correctly
        debug_result = await session.execute(
            select(MCPActivity)
            .where(MCPActivity.tool_name == "oauth_code")
            .order_by(MCPActivity.created_at.desc())
            .limit(1)
        )
        stored = debug_result.scalar_one_or_none()
        if stored:
            steps["3_db_check"] = {
                "ok": True,
                "tool_args_type": type(stored.tool_args).__name__,
                "has_code_key": isinstance(stored.tool_args, dict) and "code" in stored.tool_args,
            }
        else:
            steps["3_db_check"] = {"ok": False, "error": "Record not found"}
        
        # Step 4: Exchange the code (simulating ChatGPT's token endpoint call)
        code_data = await _get_and_delete_oauth_code_db(session, test_code)
        if code_data:
            expected = base64.urlsafe_b64encode(
                hashlib.sha256(test_code_verifier.encode()).digest()
            ).decode().rstrip("=")
            pkce_ok = expected == code_data.get("code_challenge")
            steps["4_code_exchange"] = {
                "ok": True,
                "pkce_verification": pkce_ok,
                "user_id_matches": code_data.get("user_id") == test_user_id,
            }
        else:
            steps["4_code_exchange"] = {"ok": False, "error": "Code lookup returned None"}
            return {"status": "failed", "steps": steps}
        
        # Step 5: Get/create MCP token (same logic as token endpoint)
        token_result = await session.execute(
            select(MCPToken)
            .where(MCPToken.user_id == test_user_id, MCPToken.is_active == True)
            .order_by(MCPToken.created_at.desc())
            .limit(1)
        )
        mcp_token = token_result.scalar_one_or_none()
        
        if mcp_token:
            access_token = mcp_token.token_value
            steps["5_token"] = {
                "ok": True,
                "reused_existing": True,
                "token_name": mcp_token.name,
                "token_prefix": access_token[:15] + "..." if access_token else "NONE",
                "token_starts_with_um_mcp": access_token.startswith("um_mcp_") if access_token else False,
            }
        else:
            steps["5_token"] = {"ok": True, "reused_existing": False, "note": "Would create new token"}
            access_token = None
        
        # Step 6: Validate the token would work for MCP SSE
        if access_token:
            try:
                test_user, test_mcp_token = await validate_mcp_token_from_header(
                    f"Bearer {access_token}", session
                )
                steps["6_token_validation"] = {
                    "ok": True,
                    "user_email": test_user.email[:5] + "..." if test_user.email else None,
                    "token_client_type": test_mcp_token.client_type,
                }
            except Exception as e:
                steps["6_token_validation"] = {"ok": False, "error": str(e)}
        
        # Step 7: Simulate the token response format
        token_response = {
            "access_token": access_token[:15] + "..." if access_token else None,
            "token_type": "Bearer",
            "expires_in": 86400 * 365,
            "scope": "openid profile email",
        }
        steps["7_response_format"] = {"ok": True, "response": token_response}
        
        return {"status": "all_steps_passed", "steps": steps}
        
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc(), "steps": steps}


@router.post("/mcp/oauth/code")
async def create_oauth_code(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Internal endpoint to create an OAuth authorization code.
    Called by the consumer app after user authenticates.
    Stores code in database (cross-worker safe).
    """
    body = await request.json()
    code = secrets.token_urlsafe(32)
    code_challenge = body.get("code_challenge")
    client = body.get("client", "mcp")
    
    await _store_oauth_code_db(session, code, str(user.id), code_challenge, client)
    
    return {"code": code}


MCP_TOOLS = [
    # ---- ChatGPT Connector Required Tools (search + fetch) ----
    {
        "name": "search",
        "description": "Search UniMemory for relevant knowledge. Performs semantic search over memories and summaries and returns document-level results. Use context or fetch to get full content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
                "project_id": {"type": "string", "description": "Optional project ID to scope search. Use listProjects to find IDs."},
                "limit": {"type": "number", "description": "Maximum number of results to return (default: 10)"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "context",
        "description": "PRIMARY read API for UniMemory documents. Always use this to read full document context. Returns structured data including summary, raw content, extracted memories, and project information. This is the recommended tool for reading documents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string", "description": "The document ID returned by search."}
            },
            "required": ["document_id"]
        }
    },
    {
        "name": "fetch",
        "description": "Compatibility wrapper for legacy MCP clients. Prefer using `context` instead, which returns richer structured information. This tool exists only for MCP spec compliance.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "The document ID to retrieve (from search results). Use context tool instead for better structured data."}
            },
            "required": ["id"]
        }
    },
    {
        "name": "save",
        "description": "Save new content (chat, note, or document) into UniMemory, optionally under a project. The system will generate title, summary, and extract memories automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": ["string", "object"], "description": "The content to save. Can be plain text or an object with messages for chats."},
                "project_id": {"type": "string", "description": "Optional project ID to save this document to. Use listProjects to find IDs."}
            },
            "required": ["content"]
        }
    },
    {
        "name": "listProjects",
        "description": "List projects in UniMemory. Returns project IDs and names for scoping searches and saves.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


def get_resources() -> Dict[str, Any]:
    """
    Map MCP_TOOLS into ChatGPT App resources.
    Each MCP tool becomes an 'action' resource with the same schema.
    """
    return {
        "resources": [
            {
                "name": tool.get("name"),
                "description": tool.get("description", ""),
                "inputSchema": tool.get("inputSchema", {}),
                "type": "action",
            }
            for tool in MCP_TOOLS
        ]
    }


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

async def _resolve_mcp_token(
    token: str, session: AsyncSession
) -> tuple[User, MCPToken] | None:
    """Resolve Bearer token to (User, MCPToken). Accepts um_mcp_* (by hash) or OAuth-issued token (by value)."""
    if not token or not token.strip():
        return None
    token = token.strip()
    # 1) um_mcp_*: lookup by hash (Cursor, direct MCP clients)
    if token.startswith("um_mcp_"):
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        result = await session.execute(
            select(MCPToken).where(
                MCPToken.token_hash == token_hash,
                MCPToken.is_active == True
            )
        )
        mcp_token = result.scalar_one_or_none()
    else:
        # 2) OAuth access token (e.g. ChatGPT): lookup by stored token_value
        result = await session.execute(
            select(MCPToken).where(
                MCPToken.token_value == token,
                MCPToken.is_active == True
            )
        )
        mcp_token = result.scalar_one_or_none()
    if not mcp_token:
        return None
    user_result = await session.execute(select(User).where(User.id == mcp_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return None
    return user, mcp_token


async def validate_mcp_token(
    authorization: str = Header(None),
    session: AsyncSession = Depends(get_db)
) -> User:
    """Validate MCP token from Authorization header and return user. Accepts um_mcp_* or OAuth access token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    token = authorization[7:].strip()
    resolved = await _resolve_mcp_token(token, session)
    if not resolved:
        raise HTTPException(status_code=401, detail="Invalid or revoked MCP token")
    user, mcp_token = resolved
    await session.execute(
        update(MCPToken)
        .where(MCPToken.id == mcp_token.id)
        .values(
            last_used_at=datetime.utcnow(),
            usage_count=MCPToken.usage_count + 1
        )
    )
    await session.commit()
    return user


# =============================================================================
# MCP-OVER-HTTP ENDPOINT (SSE Transport)
# =============================================================================

async def validate_mcp_token_from_header(authorization: str, session: AsyncSession) -> tuple[User, MCPToken]:
    """Validate MCP token and return user + token. Accepts um_mcp_* (Cursor) or OAuth access token (ChatGPT)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    token = authorization[7:].strip()
    resolved = await _resolve_mcp_token(token, session)
    if not resolved:
        raise HTTPException(status_code=401, detail="Invalid or revoked MCP token")
    user, mcp_token = resolved
    await session.execute(
        update(MCPToken)
        .where(MCPToken.id == mcp_token.id)
        .values(last_used_at=datetime.utcnow(), usage_count=MCPToken.usage_count + 1)
    )
    await session.commit()
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


async def get_document_context_internal(
    document_id: str,
    user: User,
    session: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Shared helper to resolve a UniMemory document context by ID.
    Tries Source first (preferred), then falls back to Memory.
    Returns a rich context dict or None if not found.
    """
    if not document_id:
        return None
    
    owner_id = str(user.id)
    
    # First try as Source (preferred document type)
    src_result = await session.execute(
        select(Source).where(Source.id == document_id, Source.owner_id == owner_id)
    )
    source = src_result.scalar_one_or_none()
    
    memory_texts: list[str] = []
    project_obj = None
    
    if source:
        # Load project info if available
        if source.project_id:
            from app.db.models import Project
            proj_result = await session.execute(
                select(Project).where(Project.id == source.project_id)
            )
            project = proj_result.scalar_one_or_none()
            if project:
                project_obj = {"id": str(project.id), "name": project.name}
        
        # Load linked memories for extracted_memories
        ms_rows = await session.execute(
            select(Memory)
            .join(MemorySource, MemorySource.memory_id == Memory.id)
            .where(MemorySource.source_id == source.id)
            .order_by(Memory.created_at.desc())
            .limit(50)
        )
        linked_memories = ms_rows.scalars().all()
        memory_texts = [m.content for m in linked_memories]
        
        raw = source.raw_content
        if isinstance(raw, dict):
            raw_content = raw
        else:
            raw_content = raw
        
        return {
            "id": str(source.id),
            "title": source.title,
            "project": project_obj,
            "summary": source.summary,
            "raw_content": raw_content,
            "extracted_memories": memory_texts,
            "metadata": source.source_metadata or {},
        }
    
    # Fallback: try as Memory document
    mem_result = await session.execute(
        select(Memory).where(Memory.id == document_id, Memory.owner_id == owner_id)
    )
    memory = mem_result.scalar_one_or_none()
    if memory:
        # Try to resolve project via Memory.project_id
        if memory.project_id:
            from app.db.models import Project
            proj_result = await session.execute(
                select(Project).where(Project.id == memory.project_id)
            )
            project = proj_result.scalar_one_or_none()
            if project:
                project_obj = {"id": str(project.id), "name": project.name}
        
        return {
            "id": str(memory.id),
            "title": memory.content[:80],
            "project": project_obj,
            "summary": None,
            "raw_content": memory.content,
            "extracted_memories": [],
            "metadata": {},
        }
    
    return None


async def execute_tool(
    tool_name: str, 
    args: Dict[str, Any], 
    user: User, 
    session: AsyncSession,
    mcp_token_id: Optional[str] = None,
    client_type: Optional[str] = None
) -> Dict[str, Any]:
    """Execute an MCP tool and return result"""
    
    # ---- ChatGPT Connector + Core search tool ----
    
    if tool_name == "search":
        from app.core.search import hybrid_search
        from app.db.models import Project
        
        query = args.get("query", "")
        project_id = args.get("project_id")
        limit = int(args.get("limit", 10) or 10)
        owner_id = str(user.id)
        
        # Build filters for hybrid_search
        search_filters: Dict[str, Any] = {"owner_id": owner_id}
        if project_id:
            search_filters["project_id"] = project_id
        
        search_results = await hybrid_search(
            session=session,
            query=query,
            limit=limit,
            filters=search_filters
        )
        
        # Collect memory IDs for batch mapping to sources
        memories = [r["memory"] for r in search_results]
        memory_ids = [m.id for m in memories]
        
        memory_to_source: Dict[Any, Any] = {}
        sources_by_id: Dict[Any, Source] = {}
        projects_by_id: Dict[Any, Project] = {}
        
        if memory_ids:
            ms_rows = await session.execute(
                select(MemorySource.memory_id, MemorySource.source_id)
                .where(MemorySource.memory_id.in_(memory_ids))
            )
            for mem_id, src_id in ms_rows.all():
                if src_id:
                    memory_to_source[mem_id] = src_id
            
            source_ids = list({src_id for src_id in memory_to_source.values() if src_id})
            if source_ids:
                src_rows = await session.execute(
                    select(Source).where(Source.id.in_(source_ids))
                )
                sources = src_rows.scalars().all()
                for s in sources:
                    sources_by_id[s.id] = s
                
                project_ids = list({s.project_id for s in sources if s.project_id})
                if project_ids:
                    proj_rows = await session.execute(
                        select(Project).where(Project.id.in_(project_ids))
                    )
                    for p in proj_rows.scalars().all():
                        projects_by_id[p.id] = p
        
        results = []
        for r in search_results:
            m = r["memory"]
            src_id = memory_to_source.get(m.id)
            source = sources_by_id.get(src_id) if src_id else None
            project = projects_by_id.get(source.project_id) if source and source.project_id else None
            
            # Choose a stable document id: prefer Source.id, fall back to Memory.id
            doc_id = str(source.id) if source else str(m.id)
            
            # Build snippet and title
            snippet = m.content[:300]
            title = (source.title if source and source.title else m.content[:100]) or "Untitled"
            
            # Build project object if available
            project_obj = None
            if project:
                project_obj = {
                    "id": str(project.id),
                    "name": project.name,
                }
            
            results.append({
                # Connector-required fields
                "id": doc_id,
                "title": title,
                "url": f"https://unimemory-app.vercel.app/memories?source={doc_id}",
                "text": snippet,
                # Extra fields for richer MCP clients
                "project": project_obj,
                "score": r.get("score", 0.0),
            })
        
        await log_mcp_activity(
            user_id=owner_id,
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"query": query, "project_id": project_id, "limit": limit},
            result_count=len(results),
            session=session
        )
        
        return {"results": results}
    
    # IMPORTANT: `context` is the single source of truth for reading documents.
    # `fetch` exists only for MCP compatibility and MUST delegate to `context`.
    # Both tools use get_document_context_internal() internally.
    
    elif tool_name == "fetch":
        item_id = args.get("id", "")
        
        if not item_id:
            return {"error": "id is required"}
        
        ctx = await get_document_context_internal(item_id, user, session)
        if not ctx:
            return {"error": f"No document found with ID: {item_id}"}
        
        # Build text payload from summary + raw_content
        text_parts = []
        summary = ctx.get("summary")
        if summary:
            text_parts.append(f"Summary:\n{summary}")
        
        raw = ctx.get("raw_content")
        if raw is not None:
            if isinstance(raw, dict):
                raw_str = json.dumps(raw, indent=2)
            else:
                raw_str = str(raw)
            if len(raw_str) > 10000:
                raw_str = raw_str[:10000] + "\n... (truncated)"
            text_parts.append(f"\nContent:\n{raw_str}")
        
        text = "\n".join(text_parts) if text_parts else ""
        
        await log_mcp_activity(
            user_id=str(user.id),
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"id": item_id},
            result_count=1,
            session=session
        )
        
        return {
            "id": ctx.get("id"),
            "title": ctx.get("title") or "Untitled",
            "text": text,
            "url": f"https://unimemory-app.vercel.app/memories?source={ctx.get('id')}",
            "metadata": {
                "project": ctx.get("project"),
                "extracted_memories": ctx.get("extracted_memories"),
            },
        }
    
    # ---- UniMemory-specific Tools (new surface) ----
    
    elif tool_name == "context":
        """
        Get full context for a UniMemory document by document_id.
        """
        document_id = args.get("document_id", "")
        if not document_id:
            return {"error": "document_id is required"}
        
        ctx = await get_document_context_internal(document_id, user, session)
        if not ctx:
            return {"error": f"No document found with ID: {document_id}"}
        
        await log_mcp_activity(
            user_id=str(user.id),
            mcp_token_id=mcp_token_id,
            tool_name=tool_name,
            client_type=client_type,
            tool_args={"document_id": document_id},
            result_count=1,
            session=session
        )
        
        return ctx
    
    elif tool_name == "save":
        from app.core.embeddings import get_embedding_service
        from app.core.summarizer import SourceSummarizer
        from app.core.extractor import get_extractor
        from app.api.ingest import store_extracted_memories, get_or_create_end_user
        import uuid as uuid_module
        
        raw_content = args.get("content", "")
        source_type = None  # infer
        metadata: Dict[str, Any] = {}
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
                tool_args={"content_length": len(str(raw_content)), "project_id": project_id},
                result_count=memories_count,
                session=session
            )
            
            return {
                "success": True,
                "document_id": source_uuid,
                "project": {"id": project_id} if project_id else None,
                "summary": summary,
                "knowledge_extracted": memories_count,
                "message": "Content saved successfully. Title, summary, and memories were automatically generated.",
            }
        except Exception as e:
            logger.error(f"save error: {e}")
            return {"success": False, "error": str(e)}
    
    elif tool_name == "listProjects":
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
                }
                for p, _, _ in projects
            ]
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
            "capabilities": {
                "tools": {
                    "list": True,
                    "call": True,
                }
            },
            "serverInfo": MCP_SERVER_INFO,
        }
        return StreamingResponse(
            iter([f"data: {create_jsonrpc_response(msg_id, result)}\n\n"]),
            media_type="text/event-stream"
        )
    
    elif method == "resources/list":
        # ChatGPT Apps calls this to discover actions.
        result = get_resources()
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
        "capabilities": {
            "tools": {
                "list": True,
                "call": True,
            }
        },
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
                "WWW-Authenticate": (
                    f'Bearer resource_metadata="'
                    f'{OAUTH_ROOT}/.well-known/oauth-protected-resource"'
                )
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


@router.post("/mcp/sse")
async def mcp_sse_post(
    request: Request,
    session: AsyncSession = Depends(get_db)
):
    """
    Standard MCP SSE Transport - POST messages endpoint.

    ChatGPT currently POSTs JSON-RPC messages directly to the same URL that is
    used for the SSE stream (server_url). The spec only requires:
      - an SSE endpoint (GET) for server->client
      - an HTTP POST endpoint for client->server messages

    This handler implements the POST side for /mcp/sse so that:
      - POST /api/v1/mcp/sse returns 200 instead of 405
      - JSON-RPC "initialize", "tools/list", and "tools/call" work over HTTP

    Responses are standard JSON-RPC 2.0 objects in the HTTP body.
    """
    authorization = request.headers.get("Authorization", "")

    try:
        user, mcp_token = await validate_mcp_token_from_header(authorization, session)
    except HTTPException as e:
        # OAuth-protected MCP: on auth failure return 401 + WWW-Authenticate so
        # clients (e.g. ChatGPT Scan Tools) can discover the OAuth metadata.
        if e.status_code == 401:
            return JSONResponse(
                status_code=401,
                content={"error": e.detail},
                headers={
                    "WWW-Authenticate": (
                        f'Bearer resource_metadata="'
                        f'{OAUTH_ROOT}/.well-known/oauth-protected-resource"'
                    )
                },
            )
        return JSONResponse(
            status_code=e.status_code,
            content=json.loads(create_jsonrpc_error(None, -32000, e.detail)),
        )

    try:
        body = await request.json()
    except Exception:
        # JSON parse error
        return JSONResponse(
            status_code=400,
            content=json.loads(create_jsonrpc_error(None, -32700, "Parse error"))
        )

    method = body.get("method", "")
    params = body.get("params", {})
    msg_id = body.get("id")

    logger.info(f"[MCP SSE POST] method={method}, id={msg_id}")

    # Notifications (no id) don't require a response body
    is_notification = msg_id is None

    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {
                    "list": True,
                    "call": True,
                }
            },
            "serverInfo": MCP_SERVER_INFO,
        }
        if is_notification:
            return JSONResponse(status_code=200, content={})
        return JSONResponse(
            status_code=200,
            content=json.loads(create_jsonrpc_response(msg_id, result))
        )

    if method == "resources/list":
        # Used by ChatGPT Apps "Refresh actions" to discover available actions.
        result = get_resources()
        if is_notification:
            return JSONResponse(status_code=200, content={})
        return JSONResponse(
            status_code=200,
            content=json.loads(create_jsonrpc_response(msg_id, result))
        )

    if method == "notifications/initialized":
        # Ack only, no response needed
        return JSONResponse(status_code=200, content={})

    if method == "tools/list":
        result = {"tools": MCP_TOOLS}
        if is_notification:
            return JSONResponse(status_code=200, content={})
        return JSONResponse(
            status_code=200,
            content=json.loads(create_jsonrpc_response(msg_id, result))
        )

    if method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})

        try:
            tool_result = await execute_tool(
                tool_name,
                tool_args,
                user,
                session,
                mcp_token_id=str(mcp_token.id),
                client_type=mcp_token.client_type or "chatgpt",
            )
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(tool_result, default=str),
                    }
                ]
            }
            if is_notification:
                return JSONResponse(status_code=200, content={})
            return JSONResponse(
                status_code=200,
                content=json.loads(create_jsonrpc_response(msg_id, result))
            )
        except Exception as e:
            logger.error(f"[MCP SSE POST] Tool execution error: {e}", exc_info=True)
            if is_notification:
                return JSONResponse(status_code=200, content={})
            return JSONResponse(
                status_code=500,
                content=json.loads(create_jsonrpc_error(msg_id, -32603, str(e)))
            )

    # Unknown method
    if is_notification:
        return JSONResponse(status_code=200, content={})
    return JSONResponse(
        status_code=400,
        content=json.loads(
            create_jsonrpc_error(msg_id, -32601, f"Method not found: {method}")
        ),
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
    Also supports direct auth fallback when SSE session is not found.
    """
    # Get session_id from query params
    if not session_id:
        query_params = dict(request.query_params)
        session_id = query_params.get("session_id")
    
    queue = None
    user = None
    mcp_token_id = None
    client_type = None
    
    # Try session-based auth first
    if session_id and session_id in _sse_sessions:
        sse_session = _sse_sessions[session_id]
        queue = sse_session["queue"]
        user_id = sse_session["user_id"]
        mcp_token_id = sse_session["mcp_token_id"]
        client_type = sse_session["client_type"]
        
        user_result = await session.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
    
    # Fallback: validate Bearer token directly (for cross-worker compatibility)
    if not user:
        authorization = request.headers.get("Authorization", "")
        if authorization:
            try:
                user, mcp_token_obj = await validate_mcp_token_from_header(authorization, session)
                mcp_token_id = str(mcp_token_obj.id)
                client_type = mcp_token_obj.client_type or "chatgpt"
                logger.info(f"[MCP SSE] Using direct auth fallback for session {session_id}")
            except HTTPException:
                pass
    
    if not user:
        return JSONResponse(
            status_code=404,
            content={"error": "Session not found and no valid auth. Connect to GET /mcp/sse first."}
        )
    
    try:
        body = await request.json()
    except Exception:
        error_response = create_jsonrpc_error(None, -32700, "Parse error")
        if queue:
            await queue.put(error_response)
        return JSONResponse(content={"status": "error", "message": "Parse error"})
    
    method = body.get("method", "")
    params = body.get("params", {})
    msg_id = body.get("id", 1)
    
    logger.info(f"[MCP SSE] Session {session_id}: {method} (queue={'yes' if queue else 'no'})")
    
    response_data = None
    
    if method == "initialize":
        response_data = create_jsonrpc_response(msg_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {
                    "list": True,
                    "call": True,
                }
            },
            "serverInfo": MCP_SERVER_INFO,
        })
    
    elif method == "notifications/initialized":
        # Client ack - no response needed
        pass
    
    elif method == "resources/list":
        # Used by ChatGPT Apps "Refresh actions" to discover available actions.
        response_data = create_jsonrpc_response(msg_id, get_resources())
    
    elif method == "tools/list":
        response_data = create_jsonrpc_response(msg_id, {"tools": MCP_TOOLS})
    
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
            response_data = create_jsonrpc_response(msg_id, result)
        except Exception as e:
            logger.error(f"[MCP SSE] Tool execution error: {e}")
            response_data = create_jsonrpc_error(msg_id, -32603, str(e))
    
    else:
        response_data = create_jsonrpc_error(msg_id, -32601, f"Method not found: {method}")
    
    # Send response via SSE queue if available, otherwise return directly
    if response_data:
        if queue:
            await queue.put(response_data)
        # Always return ok (the SSE stream delivers the actual response)
    
    return JSONResponse(content={"status": "ok"})
