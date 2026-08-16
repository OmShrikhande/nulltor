import uuid
from typing import List
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

router = APIRouter(prefix="/projects/{project_id}/commits", tags=["commits"])


class CommitCreate(BaseModel):
    branch_id: str
    file_id: str
    message: str = Field(..., max_length=255)
    snapshot: str


class CommitResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    branch_id: uuid.UUID
    file_id: str
    user_id: uuid.UUID | None
    message: str
    snapshot: str
    created_at: datetime
    
    # Optional field to show the username
    username: str | None = None

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

    new_commit = Commit(
        project_id=project_id,
        branch_id=uuid.UUID(payload.branch_id),
        file_id=payload.file_id,
        user_id=current_user.id,
        message=payload.message,
        snapshot=payload.snapshot
    )
    db.add(new_commit)
    await db.commit()
    await db.refresh(new_commit)

    # Return with username
    return {**new_commit.__dict__, "username": current_user.username}


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

    # 1. Get the name of the requested file
    from models.directory import Directory
    file_node_res = await db.execute(select(Directory).where(Directory.id == file_id))
    file_node = file_node_res.scalar_one_or_none()
    
    if not file_node:
        return []

    # 2. Get all file_ids in this project with the EXACT SAME NAME
    # This ensures that when a file is cloned to a subroom branch (and gets a new UUID),
    # its history is still preserved across all branches.
    related_files_res = await db.execute(
        select(Directory.id).where(
            Directory.project_id == project_id,
            Directory.name == file_node.name,
            Directory.type == file_node.type
        )
    )
    related_file_ids = [str(f_id) for f_id in related_files_res.scalars().all()]

    # 3. Fetch commits for ALL those related file IDs
    stmt = (
        select(Commit, User.username)
        .outerjoin(User, Commit.user_id == User.id)
        .where(
            Commit.project_id == project_id,
            Commit.file_id.in_(related_file_ids)
        )
        .order_by(Commit.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()
    print(f"DEBUG get_commits: project_id={project_id}, file_id={file_id}, found {len(rows)} commits")

    result = []
    for commit, username in rows:
        commit_dict = {**commit.__dict__}
        commit_dict["username"] = username
        result.append(commit_dict)

    return result
