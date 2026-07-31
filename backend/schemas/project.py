import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "live"


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
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectList(BaseModel):
    total: int
    items: list[ProjectRead]
