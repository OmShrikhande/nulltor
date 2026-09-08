from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, cast, String

from core.database import get_db
from core.deps import get_current_user
from models.user import User, UserRole
from models.audit_log import AuditLog, AuditAction, ResourceType
from models.membership import Membership
from schemas.audit_log import AuditLogRead, AuditLogList

router = APIRouter()


@router.get("", response_model=AuditLogList, summary="Paginated audit log viewer")
async def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    project_id: Optional[UUID] = None,
    branch_id: Optional[UUID] = None,
    actor_id: Optional[UUID] = None,
    action: Optional[AuditAction] = None,
    resource_type: Optional[ResourceType] = None,
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(AuditLog, User.username).outerjoin(User, AuditLog.actor_id == User.id)

    # Data isolation: non-superadmins can only see logs for their projects
    if user.role != UserRole.superadmin:
        accessible_projects = select(Membership.project_id).where(Membership.user_id == user.id)
        q = q.where(
            (AuditLog.project_id.in_(accessible_projects)) | (AuditLog.actor_id == user.id)
        )

    if project_id:
        q = q.where(AuditLog.project_id == project_id)
    if branch_id:
        q = q.where(AuditLog.branch_id == branch_id)
    if actor_id:
        q = q.where(AuditLog.actor_id == actor_id)
    if action:
        q = q.where(AuditLog.action == action)
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.where(
            or_(
                User.username.ilike(term),
                cast(AuditLog.action, String).ilike(term),
                cast(AuditLog.ip_address, String).ilike(term),
                cast(AuditLog.resource_type, String).ilike(term),
                cast(AuditLog.detail, String).ilike(term),
            )
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    result = await db.execute(
        q.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    )
    rows = result.all()
    items = []
    for log, uname in rows:
        item = AuditLogRead.model_validate(log)
        item.actor_username = (
            uname
            or (log.detail.get("username") if isinstance(log.detail, dict) else None)
            or (log.detail.get("email") if isinstance(log.detail, dict) else None)
            or "superadmin"
        )
        items.append(item)

    return AuditLogList(
        total=total,
        page=page,
        page_size=page_size,
        items=items,
    )
