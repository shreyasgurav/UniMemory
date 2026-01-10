"""
Security utilities for API key hashing and verification
"""
import secrets
import bcrypt
from typing import Tuple


def generate_api_key(prefix: str = "um_live") -> Tuple[str, str]:
    """
    Generate a new API key and its hash.
    
    Returns:
        Tuple of (plaintext_key, hashed_key)
    """
    # Generate 32 random bytes as hex (64 chars)
    random_part = secrets.token_hex(32)
    plaintext_key = f"{prefix}_{random_part}"
    
    # Hash the key for storage
    hashed_key = hash_api_key(plaintext_key)
    
    return plaintext_key, hashed_key


def hash_api_key(key: str) -> str:
    """
    Hash an API key for secure storage.
    """
    return bcrypt.hashpw(key.encode(), bcrypt.gensalt()).decode()


def verify_api_key(plaintext_key: str, hashed_key: str) -> bool:
    """
    Verify a plaintext API key against its hash.
    """
    try:
        return bcrypt.checkpw(plaintext_key.encode(), hashed_key.encode())
    except Exception:
        return False

