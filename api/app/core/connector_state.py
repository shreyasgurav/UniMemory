"""
Short-lived signed state for connector OAuth flows.

The OAuth callback is hit by the browser with no auth header, so we carry the
user id in a signed, expiring `state` parameter (signed with SECRET_KEY).
"""
from datetime import datetime, timedelta

from jose import jwt, JWTError

from app.config import settings

_ALG = "HS256"


def make_state(user_id: str, provider: str, minutes: int = 15) -> str:
    payload = {
        "sub": user_id,
        "provider": provider,
        "exp": datetime.utcnow() + timedelta(minutes=minutes),
        "typ": "connector_oauth",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=_ALG)


def read_state(state: str, provider: str) -> str:
    """Return the user_id if the state is valid for this provider, else raise."""
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[_ALG])
    except JWTError as e:
        raise ValueError(f"Invalid OAuth state: {e}")
    if payload.get("typ") != "connector_oauth" or payload.get("provider") != provider:
        raise ValueError("OAuth state mismatch")
    return payload["sub"]
