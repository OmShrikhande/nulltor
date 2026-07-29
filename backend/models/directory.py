import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class NodeType(str, enum.Enum):
    dir = "dir"
    file = "file"


def utcnow():
    return datetime.now(timezone.utc)


class Directory(Base):
    __tablename__ = "directories"
    __table_args__ = (
        UniqueConstraint("project_id", "parent_id", "branch_id", "name", name="uq_dir_name_in_branch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("directories.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[NodeType] = mapped_column(
        SAEnum(NodeType, name="node_type", create_type=False),
        nullable=False,
        default=NodeType.file,
    )
    # Path to encrypted Yjs snapshot on disk (relative to SNAPSHOT_DIR)
    # e.g. "{project_id}/{file_id}.snap"
    snapshot_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Branch this node belongs to (NULL only during migration, backfilled by migration_v2.sql)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    def __repr__(self) -> str:
        return f"<Directory [{self.type.value}] {self.name!r}>"
