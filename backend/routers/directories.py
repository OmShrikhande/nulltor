from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.deps import get_current_user, get_client_ip
from models.user import User, UserRole
from models.project import Project
from models.membership import Membership, MembershipRole
from models.directory import Directory
from models.audit_log import AuditAction, ResourceType
from schemas.directory import DirectoryCreate, DirectoryRead, DirectoryUpdate, DirectoryTreeNode
from services.audit_service import log_action

router = APIRouter()


async def _get_project_and_access(db: AsyncSession, project_id: UUID, user: User) -> tuple[Project, Optional[Membership]]:
    """Returns (project, membership_or_None). Raises 404/403 if inaccessible."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_active == True)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user.role == UserRole.superadmin:
        return project, None

    m_result = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == user.id,
        )
    )
    membership = m_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    return project, membership


def _build_tree(nodes: list[Directory], parent_id: Optional[UUID] = None) -> list[DirectoryTreeNode]:
    """Recursively build tree structure from flat list."""
    children = []
    for node in nodes:
        if node.parent_id == parent_id:
            tree_node = DirectoryTreeNode.model_validate(node)
            tree_node.children = _build_tree(nodes, node.id)
            children.append(tree_node)
    children.sort(key=lambda n: (n.type.value, n.name.lower()))
    return children


@router.get("/{project_id}/tree", response_model=list[DirectoryTreeNode], summary="Get full directory tree")
async def get_tree(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_project_and_access(db, project_id, user)

    result = await db.execute(
        select(Directory).where(Directory.project_id == project_id).order_by(Directory.name)
    )
    nodes = result.scalars().all()
    return _build_tree(nodes)


@router.post("/{project_id}/tree", response_model=DirectoryRead, status_code=status.HTTP_201_CREATED, summary="Create file or directory")
async def create_node(
    project_id: UUID,
    payload: DirectoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project, membership = await _get_project_and_access(db, project_id, user)

    # Only admins or project leads can create files or directories
    if user.role == UserRole.member:
        if not membership or membership.role == MembershipRole.member:
            raise HTTPException(status_code=403, detail="Only admins or project leads can create files or directories")

    # Validate parent exists in the same project
    if payload.parent_id:
        parent_result = await db.execute(
            select(Directory).where(
                Directory.id == payload.parent_id,
                Directory.project_id == project_id,
            )
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent directory not found")
        if parent.type.value != "dir":
            raise HTTPException(status_code=400, detail="Parent must be a directory, not a file")

    node = Directory(
        project_id=project_id,
        parent_id=payload.parent_id,
        name=payload.name,
        type=payload.type,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(node)
    await db.flush()

    resource_type = ResourceType.directory if payload.type.value == "dir" else ResourceType.file
    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.create,
        resource_type=resource_type,
        resource_id=node.id,
        project_id=project_id,
        detail={"name": node.name, "type": node.type.value, "parent_id": str(payload.parent_id) if payload.parent_id else None},
        ip_address=get_client_ip(request),
    )

    return DirectoryRead.model_validate(node)


@router.patch("/{project_id}/tree/{node_id}", response_model=DirectoryRead, summary="Rename or move node")
async def update_node(
    project_id: UUID,
    node_id: UUID,
    payload: DirectoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_project_and_access(db, project_id, user)

    result = await db.execute(
        select(Directory).where(Directory.id == node_id, Directory.project_id == project_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    changes: dict = {}
    if payload.name is not None and payload.name != node.name:
        changes["name"] = {"from": node.name, "to": payload.name}
        node.name = payload.name
    if payload.parent_id is not None and payload.parent_id != node.parent_id:
        changes["parent_id"] = {"from": str(node.parent_id), "to": str(payload.parent_id)}
        node.parent_id = payload.parent_id

    node.updated_by = user.id

    resource_type = ResourceType.directory if node.type.value == "dir" else ResourceType.file
    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.update,
        resource_type=resource_type,
        resource_id=node.id,
        project_id=project_id,
        detail={"changes": changes},
        ip_address=get_client_ip(request),
    )

    return DirectoryRead.model_validate(node)


@router.delete("/{project_id}/tree/{node_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete file/directory (superadmin only)")
async def delete_node(
    project_id: UUID,
    node_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Only superadmin can permanently delete files/directories")

    result = await db.execute(
        select(Directory).where(Directory.id == node_id, Directory.project_id == project_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    resource_type = ResourceType.directory if node.type.value == "dir" else ResourceType.file
    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.delete,
        resource_type=resource_type,
        resource_id=node.id,
        project_id=project_id,
        detail={"name": node.name, "type": node.type.value},
        ip_address=get_client_ip(request),
    )

    await db.delete(node)  # Cascades to children via FK ON DELETE CASCADE
