import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "live"
    passphrase: Optional[str] = None  # If set at creation time


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    room_salt: Optional[str] = None


class ProjectRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    status: str = "live"
    owner_id: uuid.UUID
    room_salt: Optional[str]
    invite_code: Optional[str] = None
    invite_role: str = 'member'
    is_active: bool
    passphrase_set: bool = False  # True if a passphrase has been locked in
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        data = super().model_validate(obj, **kwargs)
        # Populate derived field
        if hasattr(obj, 'passphrase_hash'):
            data.passphrase_set = obj.passphrase_hash is not None
        return data


class PassphraseVerify(BaseModel):
    passphrase: str


class ProjectInviteUpdate(BaseModel):
    invite_role: Optional[str] = None  # 'member' | 'lead'


class ProjectList(BaseModel):
    total: int
    items: list[ProjectRead]


class SnapshotItem(BaseModel):
    file_id: uuid.UUID
    branch_id: str
    data: str


class CommitItem(BaseModel):
    id: uuid.UUID
    snapshot: str


class EncryptedDataResponse(BaseModel):
    snapshots: list[SnapshotItem]
    commits: list[CommitItem]


class PassphraseMigrate(BaseModel):
    old_passphrase: str
    new_passphrase: str
    snapshots: Optional[list[SnapshotItem]] = None
    commits: Optional[list[CommitItem]] = None
    new_snapshots: Optional[list[SnapshotItem]] = None
    new_commits: Optional[list[CommitItem]] = None

