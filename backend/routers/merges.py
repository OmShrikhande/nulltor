from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db, engine
from core.deps import get_current_user, get_client_ip
from models.user import User, UserRole
from models.membership import Membership, MembershipRole
from models.branch import Branch, BranchMember, BranchType
from models.merge_request import MergeRequest, MergeStatus
from models.audit_log import AuditAction, ResourceType
from schemas.merge_request import (
    MergeRequestCreate,
    MergeRequestRead,
    MergeReviewPayload,
    MergeConfirmPayload,
    MergeSnapshotResponse,
)
from services.audit_service import log_action

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _assert_project_membership(
    db: AsyncSession, project_id: UUID, user: User
) -> Optional[Membership]:
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


async def _can_review_merge(
    db: AsyncSession, project_id: UUID, target_branch_id: UUID, user: User
) -> bool:
    """
    Returns True if user can review/approve/confirm merges:
      - superadmin or admin always
      - project lead always
      - for target branch 'main': any verified project member
      - for target branch 'subroom': members of that subroom branch
      - for target branch 'private': owner of that private branch
    """
    if user.role in (UserRole.superadmin, UserRole.admin):
        return True

    # Check project lead
    result = await db.execute(
        select(Membership).where(
            Membership.project_id == project_id,
            Membership.user_id == user.id,
            Membership.role == MembershipRole.lead,
        )
    )
    if result.scalar_one_or_none() is not None:
        return True

    # Branch-specific check
    target_branch = await _get_branch(db, target_branch_id, project_id)
    if target_branch.type == BranchType.main:
        # Every project member can review and accept PRs into main!
        return True
    elif target_branch.type == BranchType.private:
        return target_branch.created_by == user.id
    elif target_branch.type == BranchType.subroom:
        bm = await db.execute(
            select(BranchMember).where(
                BranchMember.branch_id == target_branch.id,
                BranchMember.user_id == user.id,
            )
        )
        return bm.scalar_one_or_none() is not None

    return False


async def _resolve_target_file_id(
    db: AsyncSession, project_id: UUID, source_file_id: str, target_branch_id: UUID
) -> str:
    """
    Traces the file path up from the source branch and back down into the target branch 
    to find the corresponding file ID in the target branch if it exists.
    """
    target_file_id = source_file_id
    from models.directory import Directory
    
    path_names = []
    try:
        curr_uuid = UUID(source_file_id)
    except Exception:
        curr_uuid = None

    while curr_uuid:
        res = await db.execute(select(Directory).where(Directory.id == curr_uuid))
        node = res.scalar_one_or_none()
        if not node:
            break
        path_names.insert(0, node.name)
        curr_uuid = node.parent_id
    
    if path_names:
        curr_parent = None
        resolved_id = None
        for name in path_names:
            q = select(Directory.id).where(
                Directory.project_id == project_id,
                Directory.branch_id == target_branch_id,
                Directory.name == name
            )
            if curr_parent:
                q = q.where(Directory.parent_id == curr_parent)
            else:
                q = q.where(Directory.parent_id == None)
            
            res = await db.execute(q)
            node_id = res.scalar_one_or_none()
            if not node_id:
                resolved_id = None
                break
            curr_parent = node_id
            resolved_id = node_id
        
        if resolved_id:
            target_file_id = str(resolved_id)
            
    return target_file_id


async def _ensure_target_file_node(
    db: AsyncSession, project_id: UUID, source_file_id: str, target_branch_id: UUID, user_id: UUID
) -> str:
    """
    Ensures that the entire directory path and file node exist in the target branch.
    If the file or any parent directories are new, creates them in the directories table.
    """
    from models.directory import Directory
    
    # 1. Trace up from source file to get the full path
    path_nodes = []
    try:
        curr_uuid = UUID(source_file_id)
    except Exception:
        curr_uuid = None

    while curr_uuid:
        res = await db.execute(select(Directory).where(Directory.id == curr_uuid))
        node = res.scalar_one_or_none()
        if not node:
            break
        path_nodes.insert(0, {"name": node.name, "type": node.type})
        curr_uuid = node.parent_id

    if not path_nodes:
        return source_file_id

    # 2. Trace down in target branch and create missing directories / files
    curr_parent = None
    target_node_id = None
    
    for item in path_nodes:
        name = item["name"]
        node_type = item["type"]
        
        q = select(Directory).where(
            Directory.project_id == project_id,
            Directory.branch_id == target_branch_id,
            Directory.name == name
        )
        if curr_parent:
            q = q.where(Directory.parent_id == curr_parent)
        else:
            q = q.where(Directory.parent_id == None)
            
        res = await db.execute(q)
        existing_node = res.scalar_one_or_none()
        
        if existing_node:
            curr_parent = existing_node.id
            target_node_id = existing_node.id
        else:
            new_node = Directory(
                project_id=project_id,
                parent_id=curr_parent,
                name=name,
                type=node_type,
                branch_id=target_branch_id,
                created_by=user_id,
                updated_by=user_id
            )
            db.add(new_node)
            await db.flush()
            curr_parent = new_node.id
            target_node_id = new_node.id
            
    return str(target_node_id)


async def _get_branch(db: AsyncSession, branch_id: UUID, project_id: UUID) -> Branch:
    result = await db.execute(
        select(Branch).where(Branch.id == branch_id, Branch.project_id == project_id, Branch.is_active == True)
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail=f"Branch {branch_id} not found")
    return branch


# ── List Merge Requests ───────────────────────────────────────────────────────

@router.get(
    "/{project_id}/merges",
    response_model=list[MergeRequestRead],
    summary="List merge requests for a project",
)
async def list_merges(
    project_id: UUID,
    merge_status: Optional[MergeStatus] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    q = select(MergeRequest).where(MergeRequest.project_id == project_id)
    if merge_status:
        q = q.where(MergeRequest.status == merge_status)

    result = await db.execute(q.order_by(MergeRequest.created_at.desc()))
    return [MergeRequestRead.model_validate(m) for m in result.scalars().all()]


# ── Get Merge Request ─────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/merges/{merge_id}",
    response_model=MergeRequestRead,
    summary="Get merge request detail",
)
async def get_merge(
    project_id: UUID,
    merge_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(MergeRequest).where(MergeRequest.id == merge_id, MergeRequest.project_id == project_id)
    )
    mr = result.scalar_one_or_none()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")
    return MergeRequestRead.model_validate(mr)


# ── Get Snapshots for Browser-Side CRDT Merge ────────────────────────────────

@router.get(
    "/{project_id}/merges/{merge_id}/snapshots",
    response_model=MergeSnapshotResponse,
    summary="Get both branch snapshots for browser-side Yjs CRDT merge",
)
async def get_merge_snapshots(
    project_id: UUID,
    merge_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Returns the encrypted pre-merge snapshot of the target AND the source branch snapshot.
    The browser decrypts both, merges via Y.applyUpdate, and shows the diff.
    Both blobs are encrypted — this endpoint never exposes plaintext.
    """
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(MergeRequest).where(MergeRequest.id == merge_id, MergeRequest.project_id == project_id)
    )
    mr = result.scalar_one_or_none()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    if not await _can_review_merge(db, project_id, mr.target_branch_id, user):
        raise HTTPException(status_code=403, detail="You do not have permission to access merge snapshots for this target branch")

    # Fetch target branch current snapshot from file_snapshots
    # We resolve the target file ID from the source file ID first
    target_file_id = await _resolve_target_file_id(db, project_id, mr.file_id, mr.target_branch_id)
    
    target_snapshot = None
    target_updated_at = None
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            row = await conn.execute(
                text("SELECT data, updated_at FROM file_snapshots WHERE file_id = :fid AND branch_id = :bid"),
                {"fid": target_file_id, "bid": str(mr.target_branch_id)},
            )
            r = row.fetchone()
            if r:
                target_snapshot = r[0]
                target_updated_at = r[1].isoformat() if r[1] else None
    except Exception:
        target_snapshot = None
        target_updated_at = None

    return MergeSnapshotResponse(
        merge_request_id=mr.id,
        pre_merge_snapshot=mr.pre_merge_snapshot,
        target_snapshot=target_snapshot,
        target_updated_at=target_updated_at,
    )


# ── Initiate Merge Request ────────────────────────────────────────────────────

@router.post(
    "/{project_id}/merges",
    response_model=MergeRequestRead,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate a merge request (source branch → target branch)",
)
async def create_merge_request(
    project_id: UUID,
    payload: MergeRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    source = await _get_branch(db, payload.source_branch_id, project_id)
    target = await _get_branch(db, payload.target_branch_id, project_id)

    mr = MergeRequest(
        project_id=project_id,
        source_branch_id=payload.source_branch_id,
        target_branch_id=payload.target_branch_id,
        file_id=payload.file_id,
        requested_by=user.id,
        status=MergeStatus.pending,
        pre_merge_snapshot=payload.pre_merge_snapshot,
        detail=payload.detail,
    )
    db.add(mr)
    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.create,
        resource_type=ResourceType.merge_request,
        resource_id=mr.id,
        project_id=project_id,
        branch_id=payload.source_branch_id,
        detail={
            "source_branch": source.name,
            "target_branch": target.name,
            "file_id": payload.file_id,
        },
        ip_address=get_client_ip(request),
    )

    return MergeRequestRead.model_validate(mr)


# ── Review Merge Request ──────────────────────────────────────────────────────

@router.post(
    "/{project_id}/merges/{merge_id}/review",
    response_model=MergeRequestRead,
    summary="Approve or reject a pending merge request",
)
async def review_merge(
    project_id: UUID,
    merge_id: UUID,
    payload: MergeReviewPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(MergeRequest).where(MergeRequest.id == merge_id, MergeRequest.project_id == project_id)
    )
    mr = result.scalar_one_or_none()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    if not await _can_review_merge(db, project_id, mr.target_branch_id, user):
        raise HTTPException(status_code=403, detail="You do not have permission to review merge requests for this target branch")

    if mr.status != MergeStatus.pending:
        raise HTTPException(status_code=400, detail=f"Merge request is already '{mr.status.value}'")

    if payload.status not in (MergeStatus.approved, MergeStatus.rejected):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    mr.status = payload.status
    mr.reviewed_by = user.id
    mr.detail = {**mr.detail, **payload.detail, "reviewer_decision": payload.status.value}
    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.merge_reviewed,
        resource_type=ResourceType.merge_request,
        resource_id=mr.id,
        project_id=project_id,
        branch_id=mr.source_branch_id,
        detail={
            "decision": payload.status.value,
            "source_branch_id": str(mr.source_branch_id),
            "target_branch_id": str(mr.target_branch_id),
        },
        ip_address=get_client_ip(request),
    )

    return MergeRequestRead.model_validate(mr)


# ── Confirm Merge ─────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/merges/{merge_id}/confirm",
    response_model=MergeRequestRead,
    summary="Submit the final merged snapshot (browser performed the CRDT merge)",
)
async def confirm_merge(
    project_id: UUID,
    merge_id: UUID,
    payload: MergeConfirmPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    After the browser has performed the Yjs CRDT merge and the user has reviewed
    the diff, this endpoint receives the final encrypted merged snapshot and writes
    it to the file_snapshots table for the target branch.
    """
    await _assert_project_membership(db, project_id, user)

    result = await db.execute(
        select(MergeRequest).where(MergeRequest.id == merge_id, MergeRequest.project_id == project_id)
    )
    mr = result.scalar_one_or_none()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    if not await _can_review_merge(db, project_id, mr.target_branch_id, user):
        raise HTTPException(status_code=403, detail="You do not have permission to confirm merges for this target branch")

    if mr.status == MergeStatus.rejected:
        raise HTTPException(status_code=400, detail="Cannot confirm a rejected merge request")

    mr.status = MergeStatus.approved
    mr.reviewed_by = user.id

    # Ensure the target file exists in the directories table for target branch
    target_file_id = await _ensure_target_file_node(db, project_id, mr.file_id, mr.target_branch_id, user.id)

    # Write merged snapshot to file_snapshots, encrypted_blobs, and live_keyframes for target branch
    from sqlalchemy import text
    import hashlib
    blob_hash = hashlib.sha256(payload.merged_snapshot.encode('utf-8')).hexdigest()
    size_bytes = len(payload.merged_snapshot.encode('utf-8'))
    room_key = f"{target_file_id}::{str(mr.target_branch_id)}"

    try:
        async with engine.begin() as conn:
            # 1. CAS encrypted_blobs
            await conn.execute(
                text("""
                    INSERT INTO encrypted_blobs (hash, ciphertext, size_bytes, is_binary, created_at)
                    VALUES (:hash, :data, :size, FALSE, CURRENT_TIMESTAMP)
                    ON CONFLICT (hash) DO NOTHING
                """),
                {"hash": blob_hash, "data": payload.merged_snapshot, "size": size_bytes},
            )
            # 2. live_keyframes
            await conn.execute(
                text("""
                    INSERT INTO live_keyframes (room_key, blob_hash, updated_at)
                    VALUES (:room_key, :hash, CURRENT_TIMESTAMP)
                    ON CONFLICT (room_key) DO UPDATE
                    SET blob_hash = EXCLUDED.blob_hash, updated_at = CURRENT_TIMESTAMP
                """),
                {"room_key": room_key, "hash": blob_hash},
            )
            # 3. file_snapshots
            await conn.execute(
                text("""
                    INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                    VALUES (:fid, :bid, :data, CURRENT_TIMESTAMP)
                    ON CONFLICT (file_id, branch_id) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
                """),
                {"fid": target_file_id, "bid": str(mr.target_branch_id), "data": payload.merged_snapshot},
            )
    except Exception as e:
        print("Merge CAS/snapshot insert error:", e)

    # Store reference in merge request for audit purposes
    mr.merged_snapshot = payload.merged_snapshot
    new_detail = dict(mr.detail)
    new_detail["is_merged"] = True
    mr.detail = new_detail
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(mr, "detail")
    
    # Automatically create a merge commit on the target branch timeline
    try:
        from models.commit import Commit
        merge_title = mr.detail.get("pr_title") or f"Merge branch {mr.source_branch_id} into {mr.target_branch_id}"
        merge_commit = Commit(
            project_id=project_id,
            branch_id=mr.target_branch_id,
            file_id=target_file_id,
            user_id=user.id,
            message=f"🔀 Merge: {merge_title}",
            snapshot=payload.merged_snapshot,
        )
        db.add(merge_commit)
    except Exception as e:
        print("Failed to record merge commit:", e)

    await db.flush()

    await log_action(
        db,
        actor_id=user.id,
        action=AuditAction.merged,
        resource_type=ResourceType.merge_request,
        resource_id=mr.id,
        project_id=project_id,
        branch_id=mr.target_branch_id,
        detail={
            "source_branch_id": str(mr.source_branch_id),
            "target_branch_id": str(mr.target_branch_id),
            "file_id": mr.file_id,
        },
        ip_address=get_client_ip(request),
    )

    return MergeRequestRead.model_validate(mr)
