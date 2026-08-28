import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, field_validator
import enum


class AuditAction(str, enum.Enum):
    login = "login"
    logout = "logout"
    create = "create"
    update = "update"
    delete = "delete"
    grant_access = "grant_access"
    revoke_access = "revoke_access"
    create_room = "create_room"
    join_room = "join_room"
    leave_room = "leave_room"
    upload_snapshot = "upload_snapshot"
    load_snapshot = "load_snapshot"
    deactivate_user = "deactivate_user"
    reactivate_user = "reactivate_user"
    # Branch lifecycle
    branch_created = "branch_created"
    merged = "merged"
    merge_reviewed = "merge_reviewed"


class ResourceType(str, enum.Enum):
    user = "user"
    project = "project"
    directory = "directory"
    file = "file"
    membership = "membership"
    room = "room"
    session = "session"
    snapshot = "snapshot"
    branch = "branch"
    merge_request = "merge_request"


class AuditLogRead(BaseModel):
    id: uuid.UUID
    actor_id: Optional[uuid.UUID]
    actor_username: Optional[str] = None
    project_id: Optional[uuid.UUID]
    branch_id: Optional[uuid.UUID]
    resource_type: ResourceType
    resource_id: Optional[uuid.UUID]
    action: AuditAction
    detail: dict[str, Any]
    ip_address: Optional[str]
    created_at: datetime

    @field_validator("ip_address", mode="before")
    @classmethod
    def cast_ip_address(cls, v):
        return str(v) if v is not None else None

    model_config = {"from_attributes": True}


class AuditLogList(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[AuditLogRead]
