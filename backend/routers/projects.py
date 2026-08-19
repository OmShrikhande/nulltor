import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from core.database import get_db
from core.deps import get_current_user, get_client_ip
from models.user import User, UserRole
from models.project import Project
from models.membership import Membership
from models.branch import Branch, BranchType
from models.audit_log import AuditAction, ResourceType
from schemas.project import (
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    ProjectList,
    ProjectInviteUpdate,
    PassphraseVerify,
    EncryptedDataResponse,
    PassphraseMigrate,
)
from services.audit_service import log_action
from models.project import _generate_invite_code
from passlib.context import CryptContext

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger("nulltor")

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
        status=payload.status or "live",
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

    # Auto-create the 'main' branch for this project
    main_branch = Branch(
        project_id=project.id,
        name="main",
        type=BranchType.main,
        created_by=user.id,
    )
    db.add(main_branch)
    await db.flush()  # flush to get main_branch.id

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.create,
        resource_type=ResourceType.project,
        resource_id=project.id,
        project_id=project.id,
        detail={"name": project.name, "description": project.description, "status": project.status},
        ip_address=get_client_ip(request),
    )

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.branch_created,
        resource_type=ResourceType.branch,
        resource_id=main_branch.id,
        project_id=project.id,
        branch_id=main_branch.id,
        detail={"name": "main", "type": "main", "auto_created": True},
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
    if payload.status is not None:
        changes["status"] = {"from": getattr(project, "status", "live"), "to": payload.status}
        project.status = payload.status
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


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete project (owner/superadmin)")
async def delete_project(
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    project = await _assert_project_access(db, project_id, actor)

    if actor.role != UserRole.superadmin and project.owner_id != actor.id:
        raise HTTPException(status_code=403, detail="Only the project owner or a superadmin can delete this project")

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


# ── Passphrase Verification ───────────────────────────────────────────────────

@router.post("/{project_id}/verify-passphrase", summary="Verify or set the room passphrase")
async def verify_passphrase(
    project_id: UUID,
    payload: PassphraseVerify,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verify the passphrase for a project room.
    - If no passphrase is set yet, the first submitter's passphrase is hashed and saved (locks it in).
    - If a passphrase is already set, it is bcrypt-verified. Returns 403 on mismatch.
    """
    project = await _assert_project_access(db, project_id, user)

    if not project.passphrase_hash:
        # First time — lock in this passphrase
        project.passphrase_hash = _pwd_ctx.hash(payload.passphrase)
        await db.flush()
        return {"status": "set", "message": "Passphrase locked in for this project room."}

    if not _pwd_ctx.verify(payload.passphrase, project.passphrase_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Incorrect room passphrase. Access denied."
        )

    return {"status": "ok", "message": "Passphrase verified."}


@router.get("/{project_id}/encrypted-data", response_model=EncryptedDataResponse, summary="Get all encrypted snapshots and commits for a project")
async def get_encrypted_data(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fetches all encrypted data (file_snapshots and commits) for migration purposes."""
    project = await _assert_project_access(db, project_id, user)
    
    from sqlalchemy import text as sa_text
    from models.branch import Branch as BranchModel
    
    branches_result = await db.execute(select(BranchModel).where(BranchModel.project_id == project_id))
    branches = branches_result.scalars().all()
    branch_ids = [str(b.id) for b in branches]
    
    snapshots = []
    if branch_ids:
        placeholders = ", ".join(f"'{bid}'" for bid in branch_ids)
        res = await db.execute(sa_text(f"SELECT file_id, branch_id, data FROM file_snapshots WHERE branch_id IN ({placeholders})"))
        for row in res.fetchall():
            snapshots.append({"file_id": row[0], "branch_id": row[1], "data": row[2]})
            
    from models.commit import Commit
    commits_result = await db.execute(select(Commit).where(Commit.branch_id.in_(branch_ids))) if branch_ids else None
    commits = commits_result.scalars().all() if commits_result else []
    
    return {
        "snapshots": snapshots,
        "commits": [{"id": c.id, "snapshot": c.snapshot} for c in commits]
    }


@router.post("/{project_id}/migrate-passphrase", response_model=ProjectRead, summary="Migrate passphrase and re-encrypt all data")
async def migrate_passphrase(
    project_id: UUID,
    payload: PassphraseMigrate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _assert_project_access(db, project_id, user)

    if user.role != UserRole.superadmin and user.role != UserRole.admin and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only admins or the project owner can migrate the passphrase")

    if project.passphrase_hash and not _pwd_ctx.verify(payload.old_passphrase, project.passphrase_hash):
        raise HTTPException(status_code=403, detail="Incorrect old passphrase. Access denied.")

    project.passphrase_hash = _pwd_ctx.hash(payload.new_passphrase)
    
    from sqlalchemy import text as sa_text
    from models.branch import Branch as BranchModel
    from models.commit import Commit
    
    # 1. Update file_snapshots
    branches_result = await db.execute(select(BranchModel).where(BranchModel.project_id == project_id))
    branches = branches_result.scalars().all()
    branch_ids = [str(b.id) for b in branches]
    
    if branch_ids:
        placeholders = ", ".join(f"'{bid}'" for bid in branch_ids)
        await db.execute(sa_text(f"DELETE FROM file_snapshots WHERE branch_id IN ({placeholders})"))
        
        for snap in payload.snapshots:
            await db.execute(
                sa_text("INSERT INTO file_snapshots (file_id, branch_id, data, updated_at) VALUES (:fid, :bid, :data, CURRENT_TIMESTAMP) ON CONFLICT(file_id, branch_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP"),
                {"fid": str(snap.file_id), "bid": snap.branch_id, "data": snap.data}
            )
            
    # 2. Update commits
    for commit_data in payload.commits:
        await db.execute(
            sa_text("UPDATE commits SET snapshot = :data WHERE id = :cid"),
            {"data": commit_data.snapshot, "cid": str(commit_data.id)}
        )
        
    await db.commit()

    await log_action(
        db, actor_id=user.id, action=AuditAction.update, resource_type=ResourceType.project,
        resource_id=project.id, project_id=project.id, detail={"action": "passphrase_migrated"},
        ip_address=get_client_ip(request)
    )

    return ProjectRead.model_validate(project)


@router.post("/{project_id}/reset-passphrase", response_model=ProjectRead, summary="Reset the room passphrase (owner/superadmin only)")
async def reset_passphrase(
    project_id: UUID,
    payload: PassphraseVerify,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Allows the project owner or superadmin to reset the room passphrase."""
    project = await _assert_project_access(db, project_id, user)

    if user.role != UserRole.superadmin and user.role != UserRole.admin and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only admins or the project owner can reset the passphrase")

    project.passphrase_hash = _pwd_ctx.hash(payload.passphrase)
    await db.flush()

    # Wipe all encrypted snapshots for this project — they were encrypted
    # with the old passphrase and cannot be decrypted with the new one.
    # Members will start with fresh (empty) content encrypted with the new passphrase.
    try:
        from sqlalchemy import text as sa_text
        from models.branch import Branch as BranchModel
        branches_result = await db.execute(
            select(BranchModel).where(BranchModel.project_id == project_id)
        )
        branches = branches_result.scalars().all()
        branch_ids = [str(b.id) for b in branches]
        if branch_ids:
            placeholders = ", ".join(f"'{bid}'" for bid in branch_ids)
            await db.execute(sa_text(
                f"DELETE FROM file_snapshots WHERE branch_id IN ({placeholders})"
            ))
            logger.info(f"Wiped {len(branch_ids)} branch snapshots after passphrase reset for project {project_id}")
    except Exception as e:
        logger.warning(f"Could not wipe snapshots on passphrase reset: {e}")

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.update,
        resource_type=ResourceType.project,
        resource_id=project.id,
        project_id=project.id,
        detail={"action": "passphrase_reset", "snapshots_cleared": True},
        ip_address=get_client_ip(request),
    )

    return ProjectRead.model_validate(project)


# ── Join by Invite Code ───────────────────────────────────────────────────────

@router.post("/join/{invite_code}", response_model=ProjectRead, summary="Join a project via invite code")
async def join_by_invite_code(
    invite_code: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project).where(
            Project.invite_code == invite_code.upper().strip(),
            Project.is_active == True,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")

    # Check not already a member
    existing = await db.execute(
        select(Membership).where(
            Membership.project_id == project.id,
            Membership.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You are already a member of this project")

    from models.membership import MembershipRole
    role = MembershipRole(project.invite_role) if project.invite_role else MembershipRole.member
    membership = Membership(
        user_id=user.id,
        project_id=project.id,
        role=role,
        granted_by=None,
    )
    db.add(membership)
    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.grant_access,
        resource_type=ResourceType.membership,
        resource_id=membership.id,
        project_id=project.id,
        detail={"join_method": "invite_code", "role": role.value},
        ip_address=get_client_ip(request),
    )

    return ProjectRead.model_validate(project)


# ── Regenerate Invite Code ────────────────────────────────────────────────────

@router.post("/{project_id}/regenerate-code", response_model=ProjectRead, summary="Regenerate project invite code")
async def regenerate_invite_code(
    project_id: UUID,
    payload: ProjectInviteUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _assert_project_access(db, project_id, user)

    # Only lead/admin/superadmin can regenerate
    from models.membership import MembershipRole
    if user.role not in (UserRole.superadmin, UserRole.admin):
        m = await db.execute(
            select(Membership).where(
                Membership.project_id == project_id,
                Membership.user_id == user.id,
                Membership.role == MembershipRole.lead,
            )
        )
        if not m.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Only project leads or admins can regenerate the invite code")

    project.invite_code = _generate_invite_code()
    if payload.invite_role:
        project.invite_role = payload.invite_role
    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.create,
        resource_type=ResourceType.project,
        resource_id=project.id,
        project_id=project.id,
        detail={"action": "invite_code_regenerated"},
        ip_address=get_client_ip(request),
    )

    return ProjectRead.model_validate(project)
