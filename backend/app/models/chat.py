import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255), default="New Chat")
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="chat", cascade="all, delete-orphan",
        order_by="Message.sequence_num",
    )
    turns: Mapped[list["Turn"]] = relationship(
        "Turn", back_populates="chat", cascade="all, delete-orphan",
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    chat_id: Mapped[str] = mapped_column(String(36), ForeignKey("chats.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user, assistant, system
    content: Mapped[str] = mapped_column(Text)
    turn_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("turns.id"), nullable=True)
    sequence_num: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")
    turn: Mapped["Turn | None"] = relationship("Turn", back_populates="messages")


class Turn(Base):
    __tablename__ = "turns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    chat_id: Mapped[str] = mapped_column(String(36), ForeignKey("chats.id"), index=True)
    turn_number: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    chat: Mapped["Chat"] = relationship("Chat", back_populates="turns")
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="turn", cascade="all, delete-orphan",
    )
    raw_request: Mapped["RawRequest | None"] = relationship(
        "RawRequest", back_populates="turn", uselist=False, cascade="all, delete-orphan",
    )
    raw_response: Mapped["RawResponse | None"] = relationship(
        "RawResponse", back_populates="turn", uselist=False, cascade="all, delete-orphan",
    )
