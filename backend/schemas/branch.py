import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from models.branch import BranchType


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: BranchType = BranchType.subroom
    parent_branch_id: Optional[uuid.UUID] = None

    @field_validator("name")
    @classmethod
    def name_no_spaces(cls, v: str) -> str:
        # Allow hyphens and underscores but no raw spaces (like Git)
        return v.strip().replace(" ", "-")


class BranchRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    type: BranchType
    parent_branch_id: Optional[uuid.UUID]
    created_by: Optional[uuid.UUID]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BranchList(BaseModel):
    total: int
    items: list[BranchRead]


class BranchMemberAdd(BaseModel):
    user_id: uuid.UUID


class BranchMemberRead(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    user_id: uuid.UUID
    granted_by: Optional[uuid.UUID]
    created_at: datetime
    # Joined fields
    username: Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}


class BranchSyncPayload(BaseModel):
    source_branch_id: uuid.UUID
    file_id: Optional[str] = None
    custom_snapshot: Optional[str] = None
    sync_message: Optional[str] = None


class BranchCompareResponse(BaseModel):
    source_branch_id: uuid.UUID
    target_branch_id: uuid.UUID
    source_branch_name: str
    target_branch_name: str
    source_snapshot: Optional[str] = None
    target_snapshot: Optional[str] = None
    source_commits: list[dict] = []
    target_commits: list[dict] = []

