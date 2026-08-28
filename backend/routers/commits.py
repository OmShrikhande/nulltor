import uuid
import hashlib
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.commit import Commit
from models.branch import Branch
from models.membership import Membership
from models.storage import EncryptedBlob, CommitV2, CommitFileDelta

router = APIRouter(prefix="/projects/{project_id}/commits", tags=["commits"])


class CommitCreate(BaseModel):
    branch_id: str
    file_id: str
    message: str = Field(..., max_length=255)
    snapshot: Optional[str] = None  # Full encrypted snapshot if keyframe
    blob_hash: Optional[str] = None  # SHA-256 CAS blob hash
    encrypted_patch: Optional[str] = None  # Encrypted diff-match-patch delta
    parent_delta_id: Optional[uuid.UUID] = None
    is_keyframe: bool = False
    chain_depth: int = 0
    file_path: Optional[str] = ""
    tree_manifest: Optional[Dict[str, str]] = None


class CommitFileDeltaResponse(BaseModel):
    id: uuid.UUID
    commit_id: uuid.UUID
    file_id: str
    file_path: str
    change_type: str
    blob_hash: Optional[str] = None
    encrypted_patch: Optional[str] = None
    parent_delta_id: Optional[uuid.UUID] = None
    is_keyframe: bool = False
    chain_depth: int = 0

    class Config:
        from_attributes = True


class CommitResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    branch_id: uuid.UUID
    file_id: str
    user_id: uuid.UUID | None
    message: str
    snapshot: Optional[str] = None
    blob_hash: Optional[str] = None
    encrypted_patch: Optional[str] = None
    parent_delta_id: Optional[uuid.UUID] = None
    is_keyframe: bool = False
    chain_depth: int = 0
    tree_manifest: Optional[Dict[str, str]] = None
    created_at: datetime
    
    # Optional field to show the username
    username: str | None = None

    class Config:
        from_attributes = True


class BlobResponse(BaseModel):
    hash: str
    ciphertext: str
    size_bytes: int
    is_binary: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=CommitResponse)
async def create_commit(
    project_id: uuid.UUID,
    payload: CommitCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Membership).where(Membership.project_id == project_id, Membership.user_id == current_user.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project")
    
    # Verify branch exists
    res = await db.execute(select(Branch).where(Branch.id == uuid.UUID(payload.branch_id), Branch.project_id == project_id))
    branch = res.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    blob_hash = payload.blob_hash
    snapshot_data = payload.snapshot or ""

    # If full snapshot is provided, store in CAS EncryptedBlob pool
    if snapshot_data and not blob_hash:
        blob_hash = hashlib.sha256(snapshot_data.encode("utf-8")).hexdigest()

    if blob_hash and snapshot_data:
        existing_blob = await db.execute(select(EncryptedBlob).where(EncryptedBlob.hash == blob_hash))
        if not existing_blob.scalar_one_or_none():
            new_blob = EncryptedBlob(
                hash=blob_hash,
                ciphertext=snapshot_data,
                size_bytes=len(snapshot_data.encode("utf-8")),
                is_binary=False,
            )
            db.add(new_blob)
            await db.flush()

    # 1. Create Atomic Commit Header (commits_v2)
    commit_v2 = CommitV2(
        project_id=project_id,
        branch_id=uuid.UUID(payload.branch_id),
        parent_commit_id=None,
        user_id=current_user.id,
        message=payload.message,
        tree_manifest=payload.tree_manifest or {},
    )
    db.add(commit_v2)
    await db.flush()

    # 2. Create File Delta Entry with Traversal Pointer
    file_delta = CommitFileDelta(
        commit_id=commit_v2.id,
        file_id=payload.file_id,
        file_path=payload.file_path or payload.file_id,
        change_type="modified",
        blob_hash=blob_hash if (payload.is_keyframe or not payload.encrypted_patch) else None,
        encrypted_patch=payload.encrypted_patch,
        parent_delta_id=payload.parent_delta_id,
        is_keyframe=payload.is_keyframe or bool(snapshot_data and not payload.encrypted_patch),
        chain_depth=payload.chain_depth,
    )
    db.add(file_delta)

    # 3. Maintain legacy Commit row for backward compatibility
    legacy_commit = Commit(
        id=commit_v2.id,
        project_id=project_id,
        branch_id=uuid.UUID(payload.branch_id),
        file_id=payload.file_id,
        user_id=current_user.id,
        message=payload.message,
        snapshot=snapshot_data or (payload.encrypted_patch or ""),
    )
    db.add(legacy_commit)

    await db.commit()

    return {
        "id": commit_v2.id,
        "project_id": project_id,
        "branch_id": uuid.UUID(payload.branch_id),
        "file_id": payload.file_id,
        "user_id": current_user.id,
        "message": payload.message,
        "snapshot": snapshot_data,
        "blob_hash": file_delta.blob_hash,
        "encrypted_patch": file_delta.encrypted_patch,
        "parent_delta_id": file_delta.parent_delta_id,
        "is_keyframe": file_delta.is_keyframe,
        "chain_depth": file_delta.chain_depth,
        "tree_manifest": commit_v2.tree_manifest,
        "created_at": commit_v2.created_at,
        "username": current_user.username,
    }


@router.get("/blobs/{blob_hash}", response_model=BlobResponse)
async def get_blob(
    project_id: uuid.UUID,
    blob_hash: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve an encrypted content-addressed blob by hash."""
    res = await db.execute(select(Membership).where(Membership.project_id == project_id, Membership.user_id == current_user.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project")

    blob_res = await db.execute(select(EncryptedBlob).where(EncryptedBlob.hash == blob_hash))
    blob = blob_res.scalar_one_or_none()
    if not blob:
        raise HTTPException(status_code=404, detail="Blob not found")

    return blob


@router.get("", response_model=List[CommitResponse])
async def get_commits(
    project_id: uuid.UUID,
    file_id: str,
    branch_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Membership).where(Membership.project_id == project_id, Membership.user_id == current_user.id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project")

    # 1. Parse file_id safely
    from models.directory import Directory
    file_uuid = None
    try:
        file_uuid = uuid.UUID(file_id)
    except Exception:
        pass

    file_node = None
    if file_uuid:
        file_node_res = await db.execute(select(Directory).where(Directory.id == file_uuid))
        file_node = file_node_res.scalar_one_or_none()

    related_file_ids = [file_id]
    if file_node:
        # Get all file_ids in this project with the exact same name
        related_files_res = await db.execute(
            select(Directory.id).where(
                Directory.project_id == project_id,
                Directory.name == file_node.name,
                Directory.type == file_node.type
            )
        )
        related_file_ids.extend([str(f_id) for f_id in related_files_res.scalars().all()])
    
    related_file_ids = list(set(related_file_ids))

    # 2. Fetch commits joining commit_file_deltas for hybrid delta metadata
    stmt = (
        select(Commit, User.username, CommitFileDelta)
        .outerjoin(User, Commit.user_id == User.id)
        .outerjoin(CommitFileDelta, Commit.id == CommitFileDelta.commit_id)
        .where(
            Commit.project_id == project_id,
            Commit.file_id.in_(related_file_ids)
        )
        .order_by(Commit.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    result = []
    for commit, username, delta in rows:
        commit_dict = {
            "id": commit.id,
            "project_id": commit.project_id,
            "branch_id": commit.branch_id,
            "file_id": commit.file_id,
            "user_id": commit.user_id,
            "message": commit.message,
            "snapshot": commit.snapshot,
            "created_at": commit.created_at,
            "username": username,
            "blob_hash": delta.blob_hash if delta else None,
            "encrypted_patch": delta.encrypted_patch if delta else None,
            "parent_delta_id": delta.parent_delta_id if delta else None,
            "is_keyframe": delta.is_keyframe if delta else True,
            "chain_depth": delta.chain_depth if delta else 0,
            "tree_manifest": None,
        }
        result.append(commit_dict)

    return result
