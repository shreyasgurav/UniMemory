"""
UniMemory API - Main FastAPI application
"""
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager

from app.config import settings
from app.db.database import init_db, close_db, get_db
from app.api import memories, search, health, auth, projects, keys


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    print("🚀 Starting UniMemory API...")
    try:
        await init_db()
        print("✅ Database initialized")
    except Exception as e:
        print(f"⚠️ Database init warning: {e}")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down UniMemory API...")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
    debug=settings.DEBUG
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix=settings.API_PREFIX, tags=["health"])
app.include_router(auth.router, prefix=settings.API_PREFIX, tags=["auth"])
app.include_router(projects.router, prefix=settings.API_PREFIX, tags=["projects"])
app.include_router(keys.router, prefix=settings.API_PREFIX, tags=["api-keys"])
app.include_router(memories.router, prefix=settings.API_PREFIX, tags=["memories"])
app.include_router(search.router, prefix=settings.API_PREFIX, tags=["search"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "UniMemory API",
        "version": settings.API_VERSION,
        "status": "running"
    }

