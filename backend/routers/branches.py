from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from core.database import get_db
from core.deps import get_current_user, get_client_ip
from models.user import User, UserRole
from models.membership import Membership, MembershipRole
from models.branch import Branch, BranchMember, BranchType
from models.audit_log import AuditAction, ResourceType
from schemas.branch import (
    BranchCreate,
    BranchRead,
    BranchList,
    BranchMemberAdd,
    BranchMemberRead,
    BranchSyncPayload,
    BranchCompareResponse,
)
from services.audit_service import log_action

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _assert_project_membership(
    db: AsyncSession, project_id: UUID, user: User
) -> Optional[Membership]:
    """Returns membership or None (superadmin). Raises 403 if not a member."""
    if user.role == UserRole.superadmin:
        return None
    result = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == user.id,
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return m


async def _assert_branch_access(
    db: AsyncSession, branch: Branch, user: User, membership: Optional[Membership]
) -> None:
    """
    Verifies the user can read/write this branch:
      - main: any project member
      - subroom: project member who is also in branch_members
      - private: only the owner (created_by)
    """
    if user.role == UserRole.superadmin:
        return

    if branch.type == BranchType.main:
        # Already verified via project membership
        return

    if branch.type == BranchType.private:
        if branch.created_by != user.id:
            raise HTTPException(status_code=403, detail="Private branch is owner-only")
        return

    # subroom — check branch_members
    bm = await db.execute(
        select(BranchMember).where(
            BranchMember.branch_id == branch.id,
            BranchMember.user_id == user.id,
        )
    )
    if not bm.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You are not a member of this subroom branch")


async def _can_manage_branch(
    db: AsyncSession, project_id: UUID, branch: Branch, user: User
) -> bool:
    """
    Returns True if user can create/delete subroom branches or manage branch members:
      - superadmin always
      - project lead always
      - for private branches: the owner
    """
    if user.role == UserRole.superadmin:
        return True
    if branch.type == BranchType.private and branch.created_by == user.id:
        return True
    result = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == user.id,
            Membership.role == MembershipRole.lead,
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_branch(db: AsyncSession, branch_id: UUID, project_id: UUID) -> Branch:
    res = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id)
    )
    branch = res.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch


# ── List Branches ─────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/branches",
    response_model=BranchList,
    summary="List all branches the user can see in a project",
)
async def list_branches(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    q = select(Branch).where(Branch.project_id == project_id, Branch.is_active == True)

    if user.role != UserRole.superadmin:
        # Superadmin sees all. Others:
        # - always see main branches
        # - see subrooms they are a member of
        # - see their own private branches
        accessible_subrooms = (
            select(BranchMember.branch_id).where(BranchMember.user_id == user.id)
        )
        q = q.where(
            (Branch.type == BranchType.main)
            | (Branch.id.in_(accessible_subrooms))
            | ((Branch.type == BranchType.private) & (Branch.created_by == user.id))
        )

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar_one()

    result = await db.execute(q.order_by(Branch.type, Branch.created_at))
    branches = result.scalars().all()

    return BranchList(total=total, items=[BranchRead.model_validate(b) for b in branches])


# ── Get Branch ────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/branches/{branch_id}",
    response_model=BranchRead,
    summary="Get branch details",
)
async def get_branch(
    project_id: UUID,
    branch_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id)
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    await _assert_branch_access(db, branch, user, membership)
    return BranchRead.model_validate(branch)


# ── Create Branch ─────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/branches",
    response_model=BranchRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a subroom or private branch",
)
async def create_branch(
    project_id: UUID,
    payload: BranchCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    # Permission check
    if payload.type == BranchType.main:
        raise HTTPException(
            status_code=400,
            detail="Cannot manually create a 'main' branch — it is auto-created with the project",
        )

    if payload.type == BranchType.subroom:
        # Any project member can create subrooms (spec: members should be allowed)
        pass
    # private branches: any project member can create one (no extra check needed)

    # Verify parent branch exists in the same project if provided
    if payload.parent_branch_id:
        pr = await db.execute(
            select(Branch).where(
                Branch.id == payload.parent_branch_id,
                Branch.project_id == project_id,
            )
        )
        if not pr.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Parent branch not found in this project")

    branch = Branch(
        project_id=project_id,
        name=payload.name,
        type=payload.type,
        parent_branch_id=payload.parent_branch_id,
        created_by=user.id,
    )
    db.add(branch)
    await db.flush()

    # For subrooms: auto-add creator as a branch member
    if payload.type == BranchType.subroom:
        db.add(BranchMember(branch_id=branch.id, user_id=user.id, granted_by=user.id))

    # Perform Deep Copy (Fork) if parent_branch_id provided
    if payload.parent_branch_id:
        from models.directory import Directory
        from sqlalchemy import text
        import uuid

        # 1. Fetch directories of parent branch
        dir_rows = await db.execute(
            select(Directory).where(
                Directory.project_id == project_id,
                Directory.branch_id == payload.parent_branch_id
            )
        )
        old_dirs = dir_rows.scalars().all()

        if old_dirs:
            # 2. Map old_id -> new_id
            id_map = {d.id: uuid.uuid4() for d in old_dirs}
            
            # 3. Insert copied directories
            new_dirs = []
            for d in old_dirs:
                nd = Directory(
                    id=id_map[d.id],
                    project_id=d.project_id,
                    parent_id=id_map[d.parent_id] if d.parent_id and d.parent_id in id_map else None,
                    branch_id=branch.id,
                    name=d.name,
                    type=d.type,
                    snapshot_path=d.snapshot_path,
                    created_by=user.id,
                    updated_by=user.id
                )
                new_dirs.append(nd)
            db.add_all(new_dirs)
            await db.flush()

            # 4. Copy file_snapshots via raw SQL
            copy_params = [
                {
                    "new_id": str(new_id),
                    "new_branch": str(branch.id),
                    "old_id": str(old_id),
                    "old_branch": str(payload.parent_branch_id)
                }
                for old_id, new_id in id_map.items()
            ]
            
            if copy_params:
                try:
                    for cp in copy_params:
                        await db.execute(
                            text("""
                                INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                                SELECT :new_id, :new_branch, data, CURRENT_TIMESTAMP
                                FROM file_snapshots
                                WHERE file_id = :old_id AND (branch_id = :old_branch OR branch_id = 'main')
                                ORDER BY updated_at DESC LIMIT 1
                                ON CONFLICT (file_id, branch_id) DO UPDATE
                                SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
                            """),
                            cp
                        )
                    await db.flush()
                except Exception as e:
                    print("Failed to copy file_snapshots on branch fork:", e)

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.branch_created,
        resource_type=ResourceType.branch,
        resource_id=branch.id,
        project_id=project_id,
        branch_id=branch.id,
        detail={"name": branch.name, "type": branch.type.value, "parent_branch_id": str(payload.parent_branch_id) if payload.parent_branch_id else None},
        ip_address=get_client_ip(request),
    )

    return BranchRead.model_validate(branch)


# ── Delete (deactivate) Branch ────────────────────────────────────────────────

@router.delete(
    "/{project_id}/branches/{branch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete a branch (lead/admin or private branch owner)",
)
async def delete_branch(
    project_id: UUID,
    branch_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id)
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    if branch.type == BranchType.main:
        raise HTTPException(status_code=400, detail="Cannot delete the main branch")

    if not await _can_manage_branch(db, project_id, branch, user):
        raise HTTPException(status_code=403, detail="Insufficient permissions to delete this branch")

    branch.is_active = False

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.delete,
        resource_type=ResourceType.branch,
        resource_id=branch.id,
        project_id=project_id,
        branch_id=branch.id,
        detail={"name": branch.name, "type": branch.type.value},
        ip_address=get_client_ip(request),
    )


# ── Branch Members (subroom only) ─────────────────────────────────────────────

@router.get(
    "/{project_id}/branches/{branch_id}/members",
    response_model=list[BranchMemberRead],
    summary="List members of a subroom branch",
)
async def list_branch_members(
    project_id: UUID,
    branch_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id)
    )
    branch = result.scalar_one_or_none()
    if not branch or branch.type != BranchType.subroom:
        raise HTTPException(status_code=404, detail="Subroom branch not found")

    await _assert_branch_access(db, branch, user, membership)

    from models.user import User as UserModel
    rows = await db.execute(
        select(BranchMember, UserModel)
        .join(UserModel, BranchMember.user_id == UserModel.id)
        .where(BranchMember.branch_id == branch_id)
        .order_by(BranchMember.created_at)
    )
    return [
        BranchMemberRead(
            id=bm.id,
            branch_id=bm.branch_id,
            user_id=bm.user_id,
            granted_by=bm.granted_by,
            created_at=bm.created_at,
            username=u.username,
            email=u.email,
        )
        for bm, u in rows.all()
    ]


@router.post(
    "/{project_id}/branches/{branch_id}/members",
    response_model=BranchMemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a user to a subroom branch",
)
async def add_branch_member(
    project_id: UUID,
    branch_id: UUID,
    payload: BranchMemberAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id)
    )
    branch = result.scalar_one_or_none()
    if not branch or branch.type != BranchType.subroom:
        raise HTTPException(status_code=404, detail="Subroom branch not found")

    if not await _can_manage_branch(db, project_id, branch, user):
        raise HTTPException(status_code=403, detail="Only leads or the subroom creator can add members")

    # Ensure target user is a project member
    from models.user import User as UserModel
    target_m = await db.execute(
        select(Membership, UserModel)
        .join(UserModel, Membership.user_id == UserModel.id)
        .where(Membership.project_id == project_id, Membership.user_id == payload.user_id)
    )
    row = target_m.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Target user is not a member of this project")
    _, target_user = row

    # Check not already a branch member
    existing = await db.execute(
        select(BranchMember).where(
            BranchMember.branch_id == branch_id,
            BranchMember.user_id == payload.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member of this branch")

    bm = BranchMember(branch_id=branch_id, user_id=payload.user_id, granted_by=user.id)
    db.add(bm)
    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.grant_access,
        resource_type=ResourceType.branch,
        resource_id=branch.id,
        project_id=project_id,
        branch_id=branch.id,
        detail={"target_user_id": str(payload.user_id), "target_username": target_user.username},
        ip_address=get_client_ip(request),
    )

    return BranchMemberRead(
        id=bm.id,
        branch_id=bm.branch_id,
        user_id=bm.user_id,
        granted_by=bm.granted_by,
        created_at=bm.created_at,
        username=target_user.username,
        email=target_user.email,
    )


@router.delete(
    "/{project_id}/branches/{branch_id}/members/{target_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a user from a subroom branch",
)
async def remove_branch_member(
    project_id: UUID,
    branch_id: UUID,
    target_user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id)
    )
    branch = result.scalar_one_or_none()
    if not branch or branch.type != BranchType.subroom:
        raise HTTPException(status_code=404, detail="Subroom branch not found")

    if not await _can_manage_branch(db, project_id, branch, user):
        raise HTTPException(status_code=403, detail="Insufficient permissions to remove branch members")

    bm_r = await db.execute(
        select(BranchMember).where(
            BranchMember.branch_id == branch_id,
            BranchMember.user_id == target_user_id,
        )
    )
    bm = bm_r.scalar_one_or_none()
    if not bm:
        raise HTTPException(status_code=404, detail="Branch member not found")

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.revoke_access,
        resource_type=ResourceType.branch,
        resource_id=branch.id,
        project_id=project_id,
        branch_id=branch.id,
        detail={"target_user_id": str(target_user_id)},
        ip_address=get_client_ip(request),
    )

    await db.delete(bm)


# ── Compare Branches (For Pull / Sync and Merge Previews) ────────────────────

@router.get(
    "/{project_id}/branches/{branch_id}/compare",
    response_model=BranchCompareResponse,
    summary="Compare code and commits between source branch and target branch",
)
async def compare_branch(
    project_id: UUID,
    branch_id: UUID,
    source_branch_id: UUID,
    file_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _assert_project_membership(db, project_id, user)
    
    target_branch = await _get_branch(db, branch_id, project_id)
    source_branch = await _get_branch(db, source_branch_id, project_id)
    await _assert_branch_access(db, target_branch, user, membership)
    await _assert_branch_access(db, source_branch, user, membership)

    source_snapshot = None
    target_snapshot = None

    if file_id:
        from routers.merges import _resolve_target_file_id
        source_file_id = await _resolve_target_file_id(db, project_id, file_id, source_branch_id)
        target_file_id = await _resolve_target_file_id(db, project_id, file_id, branch_id)
        
        from sqlalchemy import text
        from core.database import engine
        try:
            async with engine.begin() as conn:
                # Source snapshot (look up using source_file_id and file_id, checking both source_branch_id and 'main')
                res1 = await conn.execute(
                    text("""
                        SELECT data FROM file_snapshots 
                        WHERE (file_id = :sfid OR file_id = :fid) 
                          AND (branch_id = :sbid OR branch_id = 'main')
                        ORDER BY updated_at DESC LIMIT 1
                    """),
                    {"sfid": source_file_id, "fid": file_id, "sbid": str(source_branch_id)},
                )
                r1 = res1.fetchone()
                if r1:
                    source_snapshot = r1[0]

                # Target snapshot (look up using target_file_id and file_id, checking both branch_id and 'main')
                res2 = await conn.execute(
                    text("""
                        SELECT data FROM file_snapshots 
                        WHERE (file_id = :tfid OR file_id = :fid) 
                          AND (branch_id = :tbid OR branch_id = 'main')
                        ORDER BY updated_at DESC LIMIT 1
                    """),
                    {"tfid": target_file_id, "fid": file_id, "tbid": str(branch_id)},
                )
                r2 = res2.fetchone()
                if r2:
                    target_snapshot = r2[0]
        except Exception as e:
            print("Compare snapshot error:", e)

    # Fetch recent commits for both branches
    from models.commit import Commit
    s_commits_q = select(Commit).where(Commit.project_id == project_id, Commit.branch_id == source_branch_id).order_by(Commit.created_at.desc()).limit(10)
    t_commits_q = select(Commit).where(Commit.project_id == project_id, Commit.branch_id == branch_id).order_by(Commit.created_at.desc()).limit(10)

    s_res = await db.execute(s_commits_q)
    t_res = await db.execute(t_commits_q)

    source_commits = [{"id": str(c.id), "message": c.message, "created_at": c.created_at.isoformat()} for c in s_res.scalars().all()]
    target_commits = [{"id": str(c.id), "message": c.message, "created_at": c.created_at.isoformat()} for c in t_res.scalars().all()]

    return BranchCompareResponse(
        source_branch_id=source_branch_id,
        target_branch_id=branch_id,
        source_branch_name=source_branch.name,
        target_branch_name=target_branch.name,
        source_snapshot=source_snapshot,
        target_snapshot=target_snapshot,
        source_commits=source_commits,
        target_commits=target_commits,
    )


# ── Pull / Sync Changes From Branch ───────────────────────────────────────────

@router.post(
    "/{project_id}/branches/{branch_id}/sync",
    summary="Pull and sync updates from a source branch (e.g. main) into current branch",
)
async def sync_branch(
    project_id: UUID,
    branch_id: UUID,
    payload: BranchSyncPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _assert_project_membership(db, project_id, user)
    
    target_branch = await _get_branch(db, branch_id, project_id)
    source_branch = await _get_branch(db, payload.source_branch_id, project_id)
    
    await _assert_branch_access(db, target_branch, user, membership)
    await _assert_branch_access(db, source_branch, user, membership)

    from routers.merges import _ensure_target_file_node, _resolve_target_file_id
    from core.database import engine
    from sqlalchemy import text
    from models.commit import Commit

    target_file_id = None
    synced_snapshot = payload.custom_snapshot

    if payload.file_id:
        target_file_id = await _ensure_target_file_node(db, project_id, payload.file_id, branch_id, user.id)
        source_file_id = await _resolve_target_file_id(db, project_id, payload.file_id, payload.source_branch_id)

        if not synced_snapshot:
            # Pull snapshot from source branch
            try:
                async with engine.begin() as conn:
                    res = await conn.execute(
                        text("""
                            SELECT data FROM file_snapshots 
                            WHERE (file_id = :sfid OR file_id = :fid) 
                              AND (branch_id = :bid OR branch_id = 'main')
                            ORDER BY updated_at DESC LIMIT 1
                        """),
                        {"sfid": source_file_id, "fid": payload.file_id, "bid": str(payload.source_branch_id)},
                    )
                    row = res.fetchone()
                    if row:
                        synced_snapshot = row[0]
            except Exception as e:
                print("Failed to read source snapshot during sync:", e)

        if synced_snapshot:
            # Write to target branch snapshot
            try:
                async with engine.begin() as conn:
                    await conn.execute(
                        text("""
                            INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                            VALUES (:fid, :bid, :data, CURRENT_TIMESTAMP)
                            ON CONFLICT (file_id, branch_id) DO UPDATE
                            SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
                        """),
                        {"fid": target_file_id, "bid": str(branch_id), "data": synced_snapshot},
                    )
            except Exception as e:
                print("Failed to save synced snapshot:", e)

            # Auto-create sync commit
            sync_msg = payload.sync_message or f"⬇ Sync: Pulled updates from '{source_branch.name}'"
            sync_commit = Commit(
                project_id=project_id,
                branch_id=branch_id,
                file_id=target_file_id,
                user_id=user.id,
                message=sync_msg,
                snapshot=synced_snapshot,
            )
            db.add(sync_commit)
            await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.create,
        resource_type=ResourceType.branch,
        resource_id=branch_id,
        project_id=project_id,
        branch_id=branch_id,
        detail={
            "action": "pull_sync",
            "source_branch_id": str(payload.source_branch_id),
            "source_branch_name": source_branch.name,
            "target_branch_name": target_branch.name,
            "file_id": payload.file_id,
        },
        ip_address=get_client_ip(request),
    )

    return {
        "status": "success",
        "message": f"Successfully pulled latest changes from '{source_branch.name}' into '{target_branch.name}'",
        "target_file_id": target_file_id,
        "snapshot": synced_snapshot,
    }
