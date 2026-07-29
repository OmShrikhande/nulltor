import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from core.database import Base


class MergeStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


def utcnow():
    return datetime.now(timezone.utc)


class MergeRequest(Base):
    """
    Records a merge between two branches within a project.

    Lifecycle:
      1. requested_by initiates merge → status = 'pending'
         pre_merge_snapshot saved (encrypted Yjs state of target before merge)
      2. A lead/admin reviews the browser-generated diff → status = 'approved' | 'rejected'
         merge_reviewed audit event logged
      3. On approval: browser merges in-memory, re-encrypts, POSTs merged_snapshot
         Final merged_snapshot written to file_snapshots for target branch
         'merged' audit event logged
    """
    __tablename__ = "merge_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The directory/file node ID being merged (matches file_snapshots.file_id)
    file_id: Mapped[str] = mapped_column(String(255), nullable=False)

    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[MergeStatus] = mapped_column(
        SAEnum(MergeStatus, name="merge_status", create_type=False),
        nullable=False,
        default=MergeStatus.pending,
        index=True,
    )
    # Encrypted Yjs snapshot of the TARGET branch BEFORE merge (for review/rollback)
    pre_merge_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Encrypted Yjs snapshot of the confirmed merged result
    merged_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    def __repr__(self) -> str:
        return f"<MergeRequest {self.source_branch_id} → {self.target_branch_id} [{self.status.value}]>"
