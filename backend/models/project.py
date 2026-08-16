import uuid
import secrets
import string
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Text, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


def _generate_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


def utcnow():
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="live")
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # AES salt set when the first Socket.IO room is created for this project
    room_salt: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Invite code for join-by-code feature (8-char, regeneratable)
    invite_code: Mapped[str] = mapped_column(String(16), nullable=False, default=_generate_invite_code, unique=True, index=True)
    # Role granted to new members who join via the invite code
    invite_role: Mapped[str] = mapped_column(String(20), nullable=False, default='member')
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    def __repr__(self) -> str:
        return f"<Project {self.name!r} status={self.status}>"
