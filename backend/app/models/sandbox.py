"""Sandbox container model — tracks Docker sandbox lifecycle per chat."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    import uuid
    return str(uuid.uuid4())


class SandboxContainer(Base):
    __tablename__ = "sandbox_containers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    chat_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chats.id"), unique=True, index=True,
    )
    container_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    image: Mapped[str] = mapped_column(String(100), default="alpine:latest")
    status: Mapped[str] = mapped_column(
        String(20), default="pending",
    )  # "pending" | "running" | "stopped" | "error"
    workspace_host: Mapped[str] = mapped_column(String(500), default="")
    last_activity: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
