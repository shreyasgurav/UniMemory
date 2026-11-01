"""
MCP Gateway connector endpoints (consumer dashboard, Firebase-authenticated).

Lets a user connect third-party apps (Gmail first, Notion next) via OAuth. We
store only encrypted tokens; the MCP Gateway tools proxy to the provider APIs.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.db.models import User, ConnectorConnection
from app.core.auth import get_current_user
from app.core import connector_crypto as crypto
from app.core import connector_state, gmail_client, connector_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("")
async def list_connectors(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Which providers are connected, plus which are available to connect."""
    connected = await connector_service.list_user_connectors(session, str(user.id))
    return {
        "available": {
            "gmail": settings.gmail_connector_enabled,
            "notion": settings.notion_connector_enabled,
        },
        "connections": connected,
    }


@router.get("/gmail/connect")
async def gmail_connect(
    user: User = Depends(get_current_user),
):
    """Return the Google authorize URL for the dashboard to open."""
    if not settings.gmail_connector_enabled:
        raise HTTPException(status_code=503, detail="Gmail connector not configured")
    state = connector_state.make_state(str(user.id), "gmail")
    return {"authorize_url": gmail_client.authorize_url(state)}


@router.get("/gmail/callback")
async def gmail_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    session: AsyncSession = Depends(get_db),
):
    """OAuth redirect target. Browser-driven, so auth comes from signed state."""
    dest = f"{settings.CONSUMER_APP_URL}/connectors"
    if error or not code or not state:
        return RedirectResponse(f"{dest}?connected=gmail&status=denied")
    try:
        user_id = connector_state.read_state(state, "gmail")
        tok = await gmail_client.exchange_code(code)
        access = tok["access_token"]
        refresh = tok.get("refresh_token", "")
        email = await gmail_client.get_profile_email(access)

        existing = await connector_service.get_connection(session, user_id, "gmail")
        if existing:
            existing.access_token_enc = crypto.encrypt(access)
            if refresh:
                existing.refresh_token_enc = crypto.encrypt(refresh)
            existing.token_expiry = gmail_client.expiry_from_response(tok)
            existing.account_label = email or existing.account_label
            existing.scopes = " ".join(gmail_client.SCOPES)
            existing.status = "connected"
        else:
            session.add(ConnectorConnection(
                user_id=user_id,
                provider="gmail",
                status="connected",
                account_label=email,
                scopes=" ".join(gmail_client.SCOPES),
                access_token_enc=crypto.encrypt(access),
                refresh_token_enc=crypto.encrypt(refresh) if refresh else None,
                token_expiry=gmail_client.expiry_from_response(tok),
            ))
        await session.commit()
        return RedirectResponse(f"{dest}?connected=gmail&status=success")
    except Exception as e:  # noqa: BLE001 - surface a clean redirect, log details
        logger.error(f"[Connectors] Gmail callback failed: {e}")
        return RedirectResponse(f"{dest}?connected=gmail&status=error")


@router.delete("/{provider}")
async def disconnect(
    provider: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await session.execute(
        delete(ConnectorConnection).where(
            ConnectorConnection.user_id == user.id,
            ConnectorConnection.provider == provider,
        )
    )
    await session.commit()
    return {"success": True, "provider": provider}
