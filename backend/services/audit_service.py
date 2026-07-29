"""Audit service — central function to write audit log entries."""
from typing import Optional, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from models.audit_log import AuditLog, AuditAction, ResourceType


async def log_action(
    db: AsyncSession,
    *,
    actor_id: Optional[UUID],
    action: AuditAction,
    resource_type: ResourceType,
    resource_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    detail: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    """
    Write a single audit log record.

    The caller is responsible for committing the session.
    Typically called inside a route handler just before the final commit.
    """
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        project_id=project_id,
        detail=detail or {},
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
