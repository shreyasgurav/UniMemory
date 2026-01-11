"""
Health check endpoints
"""
from fastapi import APIRouter
from datetime import datetime

from app.db.database import check_db_health

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Simple health check endpoint.
    Returns quickly for load balancer health checks.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "UniMemory API"
    }


@router.get("/health/ready")
async def readiness_check():
    """
    Readiness check - verifies database connectivity.
    Use this for kubernetes readiness probes.
    """
    db_health = await check_db_health()
    
    if db_health["status"] == "healthy":
        return {
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected"
        }
    else:
        return {
            "status": "not_ready",
            "timestamp": datetime.utcnow().isoformat(),
            "database": db_health.get("error", "disconnected")
        }


@router.get("/health/live")
async def liveness_check():
    """
    Liveness check - simple check that the service is running.
    Use this for kubernetes liveness probes.
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }
