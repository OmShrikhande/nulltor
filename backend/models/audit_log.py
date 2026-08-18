import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Enum as SAEnum, Uuid, JSON
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


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


def utcnow():
    return datetime.now(timezone.utc)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    resource_type: Mapped[ResourceType] = mapped_column(
        SAEnum(ResourceType, name="resource_type", create_type=False),
        nullable=False,
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    action: Mapped[AuditAction] = mapped_column(
        SAEnum(AuditAction, name="audit_action", create_type=False),
        nullable=False,
        index=True,
    )
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, index=True
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action.value} on {self.resource_type.value}>"
