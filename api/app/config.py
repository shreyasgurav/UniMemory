"""
Configuration settings for UniMemory API
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # API
    API_TITLE: str = "UniMemory API"
    API_VERSION: str = "v1"
    API_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/unimemory"
    
    # PostgreSQL + pgvector
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "unimemory"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 1536
    
    # Auth
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    FIREBASE_SERVICE_ACCOUNT_PATH: Optional[str] = None  # Path to Firebase service account JSON file
    
    # Memory processing
    MIN_SALIENCE: float = 0.1
    DECAY_LAMBDA: float = 0.05
    SEGMENT_SIZE: int = 1000
    SUMMARY_MAX_LENGTH: int = 500
    
    # Search
    DEFAULT_SEARCH_LIMIT: int = 10
    MIN_SIMILARITY_THRESHOLD: float = 0.2
    WAYPOINT_EXPANSION_MAX: int = 20
    
    # CORS
    CORS_ORIGINS: list = ["*"]  # Allow all in dev, restrict in prod
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

