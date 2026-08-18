import uuid
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.deps import get_current_user, get_client_ip
from core.security import get_password_hash
from models.user import User, UserRole
from models.project import Project
from models.membership import Membership, MembershipRole
from models.audit_log import AuditAction, ResourceType
from schemas.membership import MembershipCreate, MembershipRead, MembershipWithUser, MembershipInviteResponse
from services.audit_service import log_action

router = APIRouter()


async def _can_manage_members(db: AsyncSession, project_id: UUID, user: User) -> str | None:
    """
    Returns:
      'superadmin' — user is superadmin (can assign any role including lead)
      'lead'       — user is a project lead (can only add member-role users)
      None         — user has no management rights
    """
    if user.role == UserRole.superadmin:
        return "superadmin"
    membership = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == user.id,
            Membership.role == MembershipRole.lead,
        )
    )
    return "lead" if membership.scalar_one_or_none() is not None else None


@router.get("/{project_id}/members", response_model=list[MembershipWithUser], summary="List project members")
async def list_members(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify access
    if user.role not in (UserRole.superadmin, UserRole.admin):
        m_check = await db.execute(
            select(Membership).where(
                Membership.project_id == project_id,
                Membership.user_id == user.id,
            )
        )
        if not m_check.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this project")

    # Join memberships and users
    result = await db.execute(
        select(Membership, User)
        .join(User, Membership.user_id == User.id)
        .where(Membership.project_id == project_id)
        .order_by(Membership.created_at)
    )
    rows = result.all()
    
    return [
        MembershipWithUser(
            id=m.id,
            user_id=m.user_id,
            project_id=m.project_id,
            role=m.role,
            granted_by=m.granted_by,
            created_at=m.created_at,
            username=u.username,
            email=u.email,
            user_is_active=u.is_active,
        )
        for m, u in rows
    ]


@router.post("/{project_id}/members", response_model=MembershipInviteResponse, status_code=status.HTTP_201_CREATED, summary="Add member to project")
async def add_member(
    project_id: UUID,
    payload: MembershipCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    requester_level = await _can_manage_members(db, project_id, user)
    if not requester_level:
        raise HTTPException(status_code=403, detail="Only superadmin or project leads can add members")

    # Project leads (admins) can only add regular members — not other leads.
    # Only superadmin can assign a lead (admin) role to a project.
    if requester_level == "lead" and payload.role == MembershipRole.lead:
        raise HTTPException(
            status_code=403,
            detail="Project leads can only add members, not other leads. Ask a superadmin to assign admins.",
        )

    # Verify project
    proj_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_active == True)
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Look up target user by email — user must already exist
    from models.user import User as UserModel
    u_result = await db.execute(select(UserModel).where(UserModel.email == payload.email))
    target_user = u_result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail=f"No account found for '{payload.email}'. Create the user first in User Management."
        )

    # Check not already a member
    existing = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == target_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member of this project")

    membership = Membership(
        user_id=target_user.id,
        project_id=project_id,
        role=payload.role,
        granted_by=user.id,
    )
    db.add(membership)
    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.grant_access,
        resource_type=ResourceType.membership,
        resource_id=membership.id,
        project_id=project_id,
        detail={
            "target_user_id": str(target_user.id),
            "target_username": target_user.username,
            "role": payload.role.value,
        },
        ip_address=get_client_ip(request),
    )

    return MembershipInviteResponse(
        membership=MembershipRead.model_validate(membership),
        temp_password=None
    )


@router.delete("/{project_id}/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke member access")
async def revoke_member(
    project_id: UUID,
    target_user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _can_manage_members(db, project_id, user):
        raise HTTPException(status_code=403, detail="Only superadmin or project leads can revoke members")

    result = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == target_user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    # Fetch username for the log
    from ..models.user import User as UserModel
    u_result = await db.execute(select(UserModel).where(UserModel.id == target_user_id))
    target = u_result.scalar_one_or_none()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.revoke_access,
        resource_type=ResourceType.membership,
        resource_id=membership.id,
        project_id=project_id,
        detail={
            "target_user_id": str(target_user_id),
            "target_username": target.username if target else "unknown",
            "role": membership.role.value,
        },
        ip_address=get_client_ip(request),
    )

    await db.delete(membership)
