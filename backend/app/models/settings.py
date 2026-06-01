from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    import uuid
    return str(uuid.uuid4())


class GlobalSettings(Base):
    """Singleton row (id always 1) holding global defaults."""
    __tablename__ = "global_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider: Mapped[str] = mapped_column(String(50), default="openai")
    api_key: Mapped[str] = mapped_column(String(500), default="")
    base_url: Mapped[str] = mapped_column(String(500), default="https://api.openai.com")
    model: Mapped[str] = mapped_column(String(100), default="gpt-4o")
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)
    system_prompt: Mapped[str] = mapped_column(Text, default="You are a helpful assistant.")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class ChatSettings(Base):
    """Per-chat settings overrides. NULL fields inherit from GlobalSettings."""
    __tablename__ = "chat_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    chat_id: Mapped[str] = mapped_column(String(36), ForeignKey("chats.id"), unique=True)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AgentFile(Base):
    """AGENT.md file attached to a chat. Content is appended to system prompt."""
    __tablename__ = "agent_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    chat_id: Mapped[str] = mapped_column(String(36), ForeignKey("chats.id"), unique=True)
    filename: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
