"""
Symmetric encryption for third-party connector tokens (Gmail, Notion, ...).

Tokens are encrypted at rest with Fernet (AES-128-CBC + HMAC). The key comes
from settings.CONNECTOR_ENC_KEY (urlsafe base64, 32 bytes). Generate one with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
from typing import Optional

from cryptography.fernet import Fernet

from app.config import settings

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.CONNECTOR_ENC_KEY:
            raise RuntimeError("CONNECTOR_ENC_KEY is not set; connectors disabled.")
        _fernet = Fernet(settings.CONNECTOR_ENC_KEY.encode())
    return _fernet


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    return _get_fernet().decrypt(token.encode()).decode()
