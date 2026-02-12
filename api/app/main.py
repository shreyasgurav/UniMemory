"""
UniMemory API - Main FastAPI application
Production-ready with proper middleware and error handling
"""
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import logging
import time
import uuid
from datetime import datetime

from app.config import settings
from app.db.database import init_db, close_db, check_db_health
from app.api import memories, search, health, auth, keys, ingest, stats, consumer, sources, mcp

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s' 
        if settings.LOG_FORMAT == 'console' 
        else '{"time":"%(asctime)s","name":"%(name)s","level":"%(levelname)s","message":"%(message)s"}'
)
logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with timing and request ID"""
    
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        start_time = time.time()
        
        # Add request ID to headers
        request.state.request_id = request_id
        
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log request (skip health checks in production)
            if not (settings.is_production and request.url.path == "/api/v1/health"):
                logger.info(
                    f"[{request_id}] {request.method} {request.url.path} "
                    f"- {response.status_code} - {duration_ms:.2f}ms"
                )
            
            # Add headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
            
            return response
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"[{request_id}] {request.method} {request.url.path} "
                f"- ERROR - {duration_ms:.2f}ms - {str(e)}"
            )
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # HSTS in production
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    logger.info(f"Starting UniMemory API ({settings.ENVIRONMENT})...")
    
    try:
        await init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Database init failed: {e}")
        # In production, fail fast if DB is unavailable
        if settings.is_production:
            raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down UniMemory API...")
    await close_db()
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
    debug=settings.DEBUG,
    docs_url="/docs" if not settings.is_production else None,  # Disable docs in prod
    redoc_url="/redoc" if not settings.is_production else None,
)

# Add middleware (order matters - first added = outermost)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB

# CORS middleware - configure properly for production
if settings.is_production and settings.CORS_ORIGINS != ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "X-API-Key", "Content-Type"],
        expose_headers=["X-Request-ID", "X-Response-Time", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, 'request_id', 'unknown')
    logger.error(f"[{request_id}] Unhandled exception: {exc}", exc_info=True)
    
    # Don't leak error details in production
    detail = str(exc) if settings.DEBUG else "Internal server error"
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": detail,
            "request_id": request_id
        }
    )


# Include routers
app.include_router(health.router, prefix=settings.API_PREFIX, tags=["health"])
app.include_router(auth.router, prefix=settings.API_PREFIX, tags=["auth"])
app.include_router(keys.router, prefix=settings.API_PREFIX, tags=["api-keys"])
app.include_router(memories.router, prefix=settings.API_PREFIX, tags=["memories"])
app.include_router(search.router, prefix=settings.API_PREFIX, tags=["search"])
app.include_router(ingest.router, prefix=settings.API_PREFIX, tags=["ingest"])
app.include_router(stats.router, prefix=settings.API_PREFIX, tags=["stats"])
app.include_router(consumer.router, prefix=settings.API_PREFIX, tags=["consumer"])
app.include_router(sources.router, prefix=settings.API_PREFIX, tags=["sources"])
app.include_router(mcp.router, prefix=settings.API_PREFIX, tags=["mcp"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "UniMemory API",
        "version": settings.API_VERSION,
        "status": "running",
        "environment": settings.ENVIRONMENT
    }


# =============================================================================
# ROOT-LEVEL OAUTH DISCOVERY (ChatGPT checks origin root for .well-known)
# =============================================================================

_APP_URL = "https://unimemory-app.vercel.app"
_API_URL = "https://unimemory.up.railway.app/api/v1"
_MCP_SSE_URL = "https://unimemory.up.railway.app/api/v1/mcp/sse"

@app.get("/.well-known/oauth-protected-resource")
async def root_oauth_protected_resource():
    """OAuth 2.0 Protected Resource Metadata at origin root"""
    return {
        "resource": _MCP_SSE_URL,
        "authorization_servers": [_API_URL],
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "bearer_methods_supported": ["header"],
    }

@app.get("/.well-known/oauth-authorization-server")
async def root_oauth_authorization_server():
    """OAuth 2.0 Authorization Server Metadata at origin root"""
    return {
        "issuer": _API_URL,
        "authorization_endpoint": f"{_APP_URL}/mcp/authorize",
        "token_endpoint": f"{_API_URL}/mcp/oauth/token",
        "registration_endpoint": f"{_API_URL}/mcp/oauth/register",
        "scopes_supported": ["openid", "profile", "email", "offline_access"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
    }


@app.get("/api/v1/health/detailed")
async def detailed_health():
    """Detailed health check with database status"""
    db_health = await check_db_health()
    
    return {
        "status": "healthy" if db_health["status"] == "healthy" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "UniMemory API",
        "version": settings.API_VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_health,
        "config": {
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "rate_limit": f"{settings.RATE_LIMIT_REQUESTS}/{settings.RATE_LIMIT_WINDOW}s",
        }
    }
