"""
Database connection and session management
Production-ready with proper pooling and health checks
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from sqlalchemy.pool import QueuePool
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Create async engine with production-ready settings
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,  # Verify connections before use
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    poolclass=QueuePool,
    # Connection arguments for reliability and performance
    connect_args={
        "command_timeout": settings.DB_QUERY_TIMEOUT,  # Query timeout (default 30s)
        "statement_cache_size": 0,  # Disable prepared statements for PgBouncer compatibility
        "server_settings": {
            "application_name": "unimemory-api",
            "jit": "off",  # Disable JIT for consistent performance
            "statement_timeout": f"{settings.DB_QUERY_TIMEOUT * 1000}",  # Statement timeout in ms
        }
    } if "asyncpg" in settings.DATABASE_URL else {}
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency to get database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database (create tables, enable pgvector)"""
    # Import models to register them with Base
    from app.db import models  # noqa: F401
    
    async with engine.begin() as conn:
        # Enable pgvector extension
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized")


async def close_db():
    """Close database connection pool gracefully"""
    await engine.dispose()
    logger.info("Database connections closed")


async def check_db_health() -> dict:
    """Check database connectivity and pool status"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar()
        
        pool = engine.pool
        return {
            "status": "healthy",
            "pool_size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }
