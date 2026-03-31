"""
Dashboard statistics API endpoints
Provides aggregated stats for the console dashboard
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import Memory, Source, EndUser, ProcessingLog, User, APIKey
from app.core.auth import get_current_user

router = APIRouter()


class DashboardStats(BaseModel):
    """Overview stats for dashboard"""
    total_memories: int
    total_sources: int
    total_end_users: int
    requests_24h: int
    requests_7d: int
    tokens_used_30d: int


class MemoriesOverTime(BaseModel):
    """Memories created per day"""
    day: str
    count: int


class RequestsOverTime(BaseModel):
    """Requests per day"""
    day: str
    count: int


class EndUserStats(BaseModel):
    """End user with memory count"""
    id: str
    external_user_id: str
    memory_count: int
    created_at: str


class SourceStats(BaseModel):
    """Source type breakdown"""
    type: str
    count: int


@router.get("/stats/overview", response_model=DashboardStats)
async def get_dashboard_stats(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get overview stats for dashboard"""
    owner_id = str(user.id)
    
    # Only count data created through API keys (developer console scope)
    # Consumer/MCP/extension data has api_key_id = NULL and stays in consumer app
    
    # Total memories (API key only)
    memories_result = await session.execute(
        select(func.count(Memory.id)).where(
            Memory.owner_id == owner_id,
            Memory.is_active == True,
            Memory.api_key_id.isnot(None)
        )
    )
    total_memories = memories_result.scalar() or 0
    
    # Total sources (API key only)
    sources_result = await session.execute(
        select(func.count(Source.id)).where(
            Source.owner_id == owner_id,
            Source.api_key_id.isnot(None)
        )
    )
    total_sources = sources_result.scalar() or 0
    
    # Total end users (only those with API-key-created memories)
    end_users_result = await session.execute(
        text("""
            SELECT COUNT(DISTINCT m.end_user_id)
            FROM memories m
            WHERE m.owner_id = :owner_id
              AND m.is_active = true
              AND m.api_key_id IS NOT NULL
              AND m.end_user_id IS NOT NULL
        """),
        {"owner_id": owner_id}
    )
    total_end_users = end_users_result.scalar() or 0
    
    # Requests last 24h (API key only)
    now = datetime.utcnow()
    requests_24h_result = await session.execute(
        select(func.count(ProcessingLog.id)).where(
            ProcessingLog.owner_id == owner_id,
            ProcessingLog.api_key_id.isnot(None),
            ProcessingLog.processed_at >= now - timedelta(hours=24)
        )
    )
    requests_24h = requests_24h_result.scalar() or 0
    
    # Requests last 7d (API key only)
    requests_7d_result = await session.execute(
        select(func.count(ProcessingLog.id)).where(
            ProcessingLog.owner_id == owner_id,
            ProcessingLog.api_key_id.isnot(None),
            ProcessingLog.processed_at >= now - timedelta(days=7)
        )
    )
    requests_7d = requests_7d_result.scalar() or 0
    
    # Tokens used last 30d (placeholder)
    tokens_used_30d = 0
    
    return DashboardStats(
        total_memories=total_memories,
        total_sources=total_sources,
        total_end_users=total_end_users,
        requests_24h=requests_24h,
        requests_7d=requests_7d,
        tokens_used_30d=tokens_used_30d
    )


@router.get("/stats/memories-over-time", response_model=List[MemoriesOverTime])
async def get_memories_over_time(
    days: int = 30,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get memories created per day for the last N days"""
    owner_id = str(user.id)
    
    result = await session.execute(
        text("""
            SELECT 
                date_trunc('day', created_at)::date AS day,
                COUNT(*) AS count
            FROM memories
            WHERE owner_id = :owner_id
              AND is_active = true
              AND api_key_id IS NOT NULL
              AND created_at >= now() - make_interval(days => :days)
            GROUP BY day
            ORDER BY day
        """),
        {"owner_id": owner_id, "days": days}
    )
    
    rows = result.fetchall()
    return [MemoriesOverTime(day=str(row[0]), count=row[1]) for row in rows]


@router.get("/stats/requests-over-time", response_model=List[RequestsOverTime])
async def get_requests_over_time(
    days: int = 30,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get requests per day for the last N days"""
    owner_id = str(user.id)
    result = await session.execute(
        text("""
            SELECT 
                date_trunc('day', processed_at)::date AS day,
                COUNT(*) AS count
            FROM processing_logs
            WHERE owner_id = :owner_id
              AND api_key_id IS NOT NULL
              AND processed_at >= now() - make_interval(days => :days)
            GROUP BY day
            ORDER BY day
        """),
        {"owner_id": owner_id, "days": days}
    )
    
    rows = result.fetchall()
    return [RequestsOverTime(day=str(row[0]), count=row[1]) for row in rows]


@router.get("/stats/end-users", response_model=List[EndUserStats])
async def get_end_users_stats(
    limit: int = 50,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get end users with memory counts"""
    owner_id = str(user.id)
    
    result = await session.execute(
        text("""
            SELECT 
                eu.id,
                eu.external_user_id,
                eu.created_at,
                COUNT(m.id) AS memory_count
            FROM end_users eu
            LEFT JOIN memories m ON m.end_user_id = eu.id 
                AND m.is_active = true 
                AND m.api_key_id IS NOT NULL
            WHERE eu.owner_id = :owner_id
            GROUP BY eu.id, eu.external_user_id, eu.created_at
            HAVING COUNT(m.id) > 0
            ORDER BY memory_count DESC
            LIMIT :limit
        """),
        {"owner_id": owner_id, "limit": limit}
    )
    
    rows = result.fetchall()
    return [
        EndUserStats(
            id=str(row[0]),
            external_user_id=row[1],
            memory_count=row[3],
            created_at=str(row[2])
        ) for row in rows
    ]


@router.get("/stats/sources-by-type", response_model=List[SourceStats])
async def get_sources_by_type(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get source count by type"""
    owner_id = str(user.id)
    
    result = await session.execute(
        text("""
            SELECT type, COUNT(*) AS count
            FROM sources
            WHERE owner_id = :owner_id
              AND api_key_id IS NOT NULL
            GROUP BY type
            ORDER BY count DESC
        """),
        {"owner_id": owner_id}
    )
    
    rows = result.fetchall()
    return [SourceStats(type=row[0], count=row[1]) for row in rows]


class ProcessingLogResponse(BaseModel):
    """Processing log entry for requests page"""
    id: str
    processed_at: str
    was_worth_remembering: bool
    reason: Optional[str]
    extracted_count: int
    raw_content_hash: Optional[str]


@router.get("/stats/logs", response_model=List[ProcessingLogResponse])
async def get_processing_logs(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get processing logs for requests page (API key scoped)"""
    owner_id = str(user.id)
    result = await session.execute(
        select(ProcessingLog)
        .where(
            ProcessingLog.owner_id == owner_id,
            ProcessingLog.api_key_id.isnot(None)
        )
        .order_by(ProcessingLog.processed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    logs = result.scalars().all()
    return [
        ProcessingLogResponse(
            id=str(log.id),
            processed_at=str(log.processed_at),
            was_worth_remembering=log.was_worth_remembering,
            reason=log.reason,
            extracted_count=log.extracted_count or 0,
            raw_content_hash=log.raw_content_hash
        ) for log in logs
    ]


class LogsCount(BaseModel):
    total: int


@router.get("/stats/logs/count", response_model=LogsCount)
async def get_logs_count(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get total count of processing logs (API key scoped)"""
    owner_id = str(user.id)
    result = await session.execute(
        select(func.count(ProcessingLog.id)).where(
            ProcessingLog.owner_id == owner_id,
            ProcessingLog.api_key_id.isnot(None)
        )
    )
    total = result.scalar() or 0
    return LogsCount(total=total)
