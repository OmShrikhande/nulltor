import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
import enum


class MembershipRole(str, enum.Enum):
    lead = "lead"
    member = "member"


class MembershipCreate(BaseModel):
    email: str
    role: MembershipRole = MembershipRole.member


class MembershipRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    project_id: uuid.UUID
    role: MembershipRole
    granted_by: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class MembershipInviteResponse(BaseModel):
    membership: MembershipRead
    temp_password: Optional[str] = None


class MembershipWithUser(MembershipRead):
    """Extended membership that includes basic user info for the members list UI."""
    username: str
    email: str
    user_is_active: bool

    model_config = {"from_attributes": True}
