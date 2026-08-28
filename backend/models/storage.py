import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class EncryptedBlob(Base):
    """
    Content-addressable encrypted blob pool (CAS).
    Stores deduplicated AES-256-GCM ciphertext addressed by SHA-256 hash.
    """
    __tablename__ = "encrypted_blobs"

    hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_binary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    def __repr__(self) -> str:
        return f"<EncryptedBlob {self.hash[:8]} ({self.size_bytes}B)>"


class BranchManifest(Base):
    """
    Workspace tree manifest map { 'path': 'blob_hash' } for zero-copy branching.
    """
    __tablename__ = "branch_manifests"

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
    tree_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )


class CommitV2(Base):
    """
    Atomic multi-file commit header representing a workspace revision.
    """
    __tablename__ = "commits_v2"

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
    parent_commit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("commits_v2.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    tree_manifest: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    deltas: Mapped[list["CommitFileDelta"]] = relationship(
        "CommitFileDelta", back_populates="commit", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<CommitV2 {self.id} '{self.message[:20]}'>"


class CommitFileDelta(Base):
    """
    File-level change entry with direct parent traversal pointer for bounded reconstruction.
    """
    __tablename__ = "commit_file_deltas"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    commit_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("commits_v2.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    change_type: Mapped[str] = mapped_column(String(16), nullable=False, default="modified")
    
    # Set when is_keyframe=True, added file, or binary
    blob_hash: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("encrypted_blobs.hash"), nullable=True
    )
    # Encrypted diff-match-patch delta (None for binary or keyframe)
    encrypted_patch: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Direct pointer to previous file delta for O(1) linked-list traversal
    parent_delta_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("commit_file_deltas.id"), nullable=True, index=True
    )
    
    is_keyframe: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    chain_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    commit: Mapped[CommitV2] = relationship("CommitV2", back_populates="deltas")

    def __repr__(self) -> str:
        return f"<CommitFileDelta {self.file_path} ({self.change_type})>"


class LiveKeyframe(Base):
    """
    Active collaborative room keyframe pointer managed by Node.js real-time gateway.
    """
    __tablename__ = "live_keyframes"

    room_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    blob_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("encrypted_blobs.hash"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
