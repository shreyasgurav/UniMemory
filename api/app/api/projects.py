"""
Project management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from app.db.database import get_db
from app.db.models import User, Project
from app.core.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    project = Project(
        name=data.name,
        description=data.description,
        owner_id=user.id
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        is_active=project.is_active,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat()
    )


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """List all projects for the current user"""
    stmt = select(Project).where(
        Project.owner_id == user.id,
        Project.is_active == True
    ).order_by(Project.created_at.desc())
    
    result = await session.execute(stmt)
    projects = result.scalars().all()
    
    return [
        ProjectResponse(
            id=str(p.id),
            name=p.name,
            description=p.description,
            is_active=p.is_active,
            created_at=p.created_at.isoformat(),
            updated_at=p.updated_at.isoformat()
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Get a specific project"""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.owner_id == user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        is_active=project.is_active,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat()
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Update a project"""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.owner_id == user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    
    await session.commit()
    await session.refresh(project)
    
    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        is_active=project.is_active,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat()
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Delete a project (soft delete)"""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.owner_id == user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project.is_active = False
    await session.commit()

