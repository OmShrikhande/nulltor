import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
import enum


class NodeType(str, enum.Enum):
    dir = "dir"
    file = "file"


class DirectoryCreate(BaseModel):
    name: str
    type: NodeType = NodeType.file
    parent_id: Optional[uuid.UUID] = None


class DirectoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None


class DirectoryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: Optional[uuid.UUID]
    name: str
    type: NodeType
    snapshot_path: Optional[str]
    created_by: Optional[uuid.UUID]
    updated_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DirectoryTreeNode(DirectoryRead):
    """Recursive tree node for the full directory tree response."""
    children: list["DirectoryTreeNode"] = []

    model_config = {"from_attributes": True}


DirectoryTreeNode.model_rebuild()
