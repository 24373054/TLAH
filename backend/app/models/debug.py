from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    import uuid
    return str(uuid.uuid4())


class RawRequest(Base):
    """Stores the COMPLETE raw HTTP request payload sent to the LLM API."""
    __tablename__ = "raw_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    turn_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("turns.id"), unique=True, index=True,
    )
    provider: Mapped[str] = mapped_column(String(50))
    endpoint_url: Mapped[str] = mapped_column(String(500))
    request_json: Mapped[str] = mapped_column(Text)  # Full JSON payload as string
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    turn: Mapped["Turn"] = relationship("Turn", back_populates="raw_request")  # noqa: F821


class RawResponse(Base):
    """Stores the COMPLETE raw HTTP response received from the LLM API."""
    __tablename__ = "raw_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    turn_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("turns.id"), unique=True, index=True,
    )
    provider: Mapped[str] = mapped_column(String(50))
    response_json: Mapped[str] = mapped_column(Text)  # Full JSON response as string
    http_status_code: Mapped[int] = mapped_column(Integer, default=200)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    token_usage_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    turn: Mapped["Turn"] = relationship("Turn", back_populates="raw_response")  # noqa: F821
