from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

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
    db: AsyncSession, project_id: UUID, user: User
) -> bool:
    """Returns True if user can review/approve merges (lead, admin, superadmin)."""
    if user.role in (UserRole.superadmin, UserRole.admin):
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

    if not await _can_review_merge(db, project_id, user):
        raise HTTPException(status_code=403, detail="Only leads/admins can access merge snapshots")

    # Fetch source branch current snapshot from file_snapshots
    # This is stored in the Node.js PostgreSQL table
    source_snapshot = None
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            row = await conn.execute(
                text("SELECT data FROM file_snapshots WHERE file_id = :fid AND branch_id = :bid"),
                {"fid": mr.file_id, "bid": str(mr.source_branch_id)},
            )
            r = row.fetchone()
            if r:
                source_snapshot = r[0]
    except Exception:
        source_snapshot = None

    return MergeSnapshotResponse(
        merge_request_id=mr.id,
        pre_merge_snapshot=mr.pre_merge_snapshot,
        source_snapshot=source_snapshot,
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
    membership = await _assert_project_membership(db, project_id, user)

    source = await _get_branch(db, payload.source_branch_id, project_id)
    target = await _get_branch(db, payload.target_branch_id, project_id)

    # Permission: merging into main or subroom requires lead/admin
    if target.type in (BranchType.main, BranchType.subroom):
        if not await _can_review_merge(db, project_id, user):
            raise HTTPException(
                status_code=403,
                detail="Only project leads or admins can merge into main or subroom branches",
            )

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

    if not await _can_review_merge(db, project_id, user):
        raise HTTPException(status_code=403, detail="Only leads/admins can review merge requests")

    result = await db.execute(
        select(MergeRequest).where(MergeRequest.id == merge_id, MergeRequest.project_id == project_id)
    )
    mr = result.scalar_one_or_none()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

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

    if not await _can_review_merge(db, project_id, user):
        raise HTTPException(status_code=403, detail="Only leads/admins can confirm merges")

    result = await db.execute(
        select(MergeRequest).where(MergeRequest.id == merge_id, MergeRequest.project_id == project_id)
    )
    mr = result.scalar_one_or_none()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge request not found")

    if mr.status != MergeStatus.approved:
        raise HTTPException(status_code=400, detail="Merge must be approved before confirming")

    # Write merged snapshot to file_snapshots for the target branch
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO file_snapshots (file_id, branch_id, data, updated_at)
                VALUES (:fid, :bid, :data, NOW())
                ON CONFLICT (file_id, branch_id) DO UPDATE
                SET data = EXCLUDED.data, updated_at = NOW()
            """),
            {"fid": mr.file_id, "bid": str(mr.target_branch_id), "data": payload.merged_snapshot},
        )

    # Store reference in merge request for audit purposes
    mr.merged_snapshot = payload.merged_snapshot
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
