from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from core.database import get_db
from core.deps import get_current_user, require_superadmin, get_client_ip
from models.user import User, UserRole
from models.project import Project
from models.membership import Membership
from models.audit_log import AuditAction, ResourceType
from schemas.project import ProjectCreate, ProjectRead, ProjectUpdate, ProjectList
from services.audit_service import log_action

router = APIRouter()


async def _assert_project_access(db: AsyncSession, project_id: UUID, user: User) -> Project:
    """Raise 404/403 if the user cannot access the given project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_active == True)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user.role == UserRole.superadmin:
        return project  # superadmin sees all

    # Check membership
    m_result = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == user.id,
        )
    )
    if not m_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You do not have access to this project")

    return project


@router.get("", response_model=ProjectList, summary="List accessible projects")
async def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.superadmin:
        q = select(Project).where(Project.is_active == True)
    else:
        # Only projects the user is a member of
        member_projects = select(Membership.project_id).where(Membership.user_id == user.id)
        q = select(Project).where(
            Project.is_active == True,
            Project.id.in_(member_projects),
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    result = await db.execute(q.order_by(Project.created_at.desc()).offset(skip).limit(limit))
    projects = result.scalars().all()

    return ProjectList(total=total, items=[ProjectRead.model_validate(p) for p in projects])


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED, summary="Create project")
async def create_project(
    payload: ProjectCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Only superadmin and admin can create projects
    if user.role == UserRole.member:
        raise HTTPException(status_code=403, detail="Members cannot create projects")

    project = Project(
        name=payload.name,
        description=payload.description,
        owner_id=user.id,
    )
    db.add(project)
    await db.flush()

    # Auto-add creator as lead
    membership = Membership(
        user_id=user.id,
        project_id=project.id,
        role="lead",
        granted_by=user.id,
    )
    db.add(membership)

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.create,
        resource_type=ResourceType.project,
        resource_id=project.id,
        project_id=project.id,
        detail={"name": project.name, "description": project.description},
        ip_address=get_client_ip(request),
    )

    return ProjectRead.model_validate(project)


@router.get("/{project_id}", response_model=ProjectRead, summary="Get project detail")
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _assert_project_access(db, project_id, user)
    return ProjectRead.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectRead, summary="Update project (lead/admin/superadmin)")
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _assert_project_access(db, project_id, user)

    # Only superadmin or project lead can update
    if user.role == UserRole.member:
        m = await db.execute(
            select(Membership).where(
                Membership.project_id == project_id,
                Membership.user_id == user.id,
                Membership.role == "lead",
            )
        )
        if not m.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Only project leads can update this project")

    changes: dict = {}
    if payload.name is not None:
        changes["name"] = {"from": project.name, "to": payload.name}
        project.name = payload.name
    if payload.description is not None:
        changes["description"] = {"from": project.description, "to": payload.description}
        project.description = payload.description
    if payload.room_salt is not None:
        project.room_salt = payload.room_salt
        changes["room_salt"] = "updated"

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.update,
        resource_type=ResourceType.project,
        resource_id=project.id,
        project_id=project.id,
        detail={"changes": changes},
        ip_address=get_client_ip(request),
    )

    return ProjectRead.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete project (superadmin only)")
async def delete_project(
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.is_active = False  # Soft delete — preserves audit log FK references

    await log_action(
        db,
        actor_id=actor.id,
        action=AuditAction.delete,
        resource_type=ResourceType.project,
        resource_id=project.id,
        detail={"name": project.name},
        ip_address=get_client_ip(request),
    )
