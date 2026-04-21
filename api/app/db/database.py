"""
Database connection and session management
Production-ready with proper pooling and health checks
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from sqlalchemy.pool import QueuePool, NullPool
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Detect if using PgBouncer (Supabase pooler uses port 6543)
_is_pgbouncer = ":6543" in settings.DATABASE_URL or "pooler.supabase" in settings.DATABASE_URL

def _get_connect_args():
    """Get connection arguments based on database URL"""
    if "asyncpg" not in settings.DATABASE_URL:
        return {}
    
    base_args = {
        "command_timeout": settings.DB_QUERY_TIMEOUT,
        "server_settings": {
            "application_name": "unimemory-api",
            "jit": "off",
            "statement_timeout": f"{settings.DB_QUERY_TIMEOUT * 1000}",
        }
    }
    
    if _is_pgbouncer:
        # PgBouncer mode: disable ALL prepared statements
        logger.info("Using PgBouncer mode (statement caching disabled)")
        base_args["statement_cache_size"] = 0
        base_args["prepared_statement_cache_size"] = 0
    else:
        # Direct connection: can use prepared statements
        logger.info("Using direct connection mode")
    
    return base_args

# Create async engine with production-ready settings
# Use NullPool for PgBouncer to avoid connection state issues
if _is_pgbouncer:
    # NullPool doesn't accept pool size arguments
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        future=True,
        poolclass=NullPool,
        connect_args=_get_connect_args()
    )
else:
    # Direct connection: use QueuePool with full configuration
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        future=True,
        pool_pre_ping=True,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_recycle=settings.DB_POOL_RECYCLE,
        poolclass=QueuePool,
        connect_args=_get_connect_args()
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
