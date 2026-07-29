import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from models.merge_request import MergeStatus


class MergeRequestCreate(BaseModel):
    source_branch_id: uuid.UUID
    target_branch_id: uuid.UUID
    file_id: str = Field(..., min_length=1)
    # The encrypted Yjs snapshot of the target branch BEFORE merge
    # (captured in the browser and sent here for safekeeping)
    pre_merge_snapshot: Optional[str] = None
    detail: dict = {}


class MergeReviewPayload(BaseModel):
    """Approve or reject a pending merge request."""
    status: MergeStatus  # 'approved' or 'rejected'
    detail: dict = {}


class MergeConfirmPayload(BaseModel):
    """Confirm an approved merge by submitting the final merged snapshot."""
    merged_snapshot: str  # encrypted Yjs snapshot after browser-side CRDT merge


class MergeRequestRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_branch_id: uuid.UUID
    target_branch_id: uuid.UUID
    file_id: str
    requested_by: Optional[uuid.UUID]
    reviewed_by: Optional[uuid.UUID]
    status: MergeStatus
    # Snapshots intentionally omitted from list/detail responses for security —
    # they are large encrypted blobs returned only from the dedicated /snapshot endpoint
    detail: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MergeSnapshotResponse(BaseModel):
    """Returns both encrypted snapshots so the browser can perform the CRDT merge."""
    merge_request_id: uuid.UUID
    pre_merge_snapshot: Optional[str]   # encrypted Yjs state of target before merge
    source_snapshot: Optional[str]      # encrypted Yjs state of source branch
