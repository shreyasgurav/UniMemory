"""
Configuration settings for UniMemory API
"""
from pydantic_settings import BaseSettings
from typing import Optional, List
import os


class Settings(BaseSettings):
    # API
    API_TITLE: str = "UniMemory API"
    API_VERSION: str = "v1"
    API_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, staging, production
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/unimemory"
    
    # Connection Pool (production-tuned for Railway + Supabase)
    DB_POOL_SIZE: int = 5  # Reduced for Supabase connection limits (free tier: 60 max)
    DB_MAX_OVERFLOW: int = 10  # Allow burst connections
    DB_POOL_TIMEOUT: int = 10  # Faster timeout to fail fast
    DB_POOL_RECYCLE: int = 300  # Recycle connections every 5 min (Railway stability)
    DB_QUERY_TIMEOUT: int = 30  # Max query execution time in seconds
    
    # PostgreSQL + pgvector
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "unimemory"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    
    # Redis (for caching and rate limiting)
    REDIS_URL: Optional[str] = None  # redis://localhost:6379/0
    CACHE_TTL: int = 300  # 5 minutes default cache TTL
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 1536
    OPENAI_TIMEOUT: int = 15  # Reduced timeout for faster failure (embeddings are fast)
    OPENAI_MAX_RETRIES: int = 2  # Reduced retries to fail faster
    
    # Auth
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    FIREBASE_SERVICE_ACCOUNT_PATH: Optional[str] = None
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100  # Requests per window
    RATE_LIMIT_WINDOW: int = 60  # Window in seconds (1 minute)
    RATE_LIMIT_BURST: int = 20  # Burst allowance
    
    # Memory processing
    MIN_SALIENCE: float = 0.1
    DECAY_LAMBDA: float = 0.05
    SEGMENT_SIZE: int = 1000
    SUMMARY_MAX_LENGTH: int = 500
    MAX_CONTENT_LENGTH: int = 50000  # Max input content length (chars)
    MAX_MEMORIES_PER_REQUEST: int = 15  # Max memories extracted per request
    
    # Search
    DEFAULT_SEARCH_LIMIT: int = 10
    MAX_SEARCH_LIMIT: int = 100  # Hard limit on search results
    MIN_SIMILARITY_THRESHOLD: float = 0.2
    WAYPOINT_EXPANSION_MAX: int = 20
    
    # CORS (production: specify exact origins)
    CORS_ORIGINS: List[str] = ["*"]  # Override in prod via env
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # json or console
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"
    
    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()
