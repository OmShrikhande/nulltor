import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Commit(Base):
    """
    Represents a saved point in time for a specific file in a specific branch.
    Stores the encrypted Yjs state (base64) exactly as it was when saved.
    """
    __tablename__ = "commits"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The file or node ID being committed
    file_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    message: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Encrypted Yjs snapshot (base64 encoded Yjs update, then AES encrypted)
    snapshot: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    def __repr__(self) -> str:
        return f"<Commit {self.id} on {self.file_id}>"
