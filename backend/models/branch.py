import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class BranchType(str, enum.Enum):
    main = "main"
    subroom = "subroom"
    private = "private"


def utcnow():
    return datetime.now(timezone.utc)


class Branch(Base):
    """
    A branch scopes collaborative work within a project.

    Types:
      - main    : shared room, visible to all project members, always canonical.
      - subroom : collaborative feature branch, invite-controlled (via branch_members).
      - private : personal fork, visible only to the creator (owner-only).
    """
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_branch_name_in_project"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[BranchType] = mapped_column(
        SAEnum(BranchType, name="branch_type", create_type=False),
        nullable=False,
        default=BranchType.subroom,
    )
    # For subrooms/private branches: which branch was this forked from?
    parent_branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    def __repr__(self) -> str:
        return f"<Branch [{self.type.value}] {self.name!r} project={self.project_id}>"


class BranchMember(Base):
    """
    Controls per-user access to subroom branches.
    Not used for main (all project members) or private (owner-only).
    """
    __tablename__ = "branch_members"
    __table_args__ = (
        UniqueConstraint("branch_id", "user_id", name="uq_branch_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    def __repr__(self) -> str:
        return f"<BranchMember branch={self.branch_id} user={self.user_id}>"
