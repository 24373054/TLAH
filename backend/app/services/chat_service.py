from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.chat import Chat, Message, Turn


def create_chat(db: Session, title: str = "New Chat") -> Chat:
    chat = Chat(title=title)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def get_chat(db: Session, chat_id: str) -> Chat | None:
    return db.query(Chat).filter(Chat.id == chat_id).first()


def get_chat_or_404(db: Session, chat_id: str) -> Chat:
    from fastapi import HTTPException

    chat = get_chat(db, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


def list_chats(db: Session) -> list[dict]:
    """Return chat summaries with message counts."""
    rows = (
        db.query(
            Chat.id,
            Chat.title,
            Chat.updated_at,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.chat_id == Chat.id)
        .group_by(Chat.id)
        .order_by(Chat.updated_at.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "title": row.title,
            "updated_at": row.updated_at,
            "message_count": row.message_count,
        }
        for row in rows
    ]


def update_chat(db: Session, chat_id: str, title: str | None = None, system_prompt: str | None = None) -> Chat:
    chat = get_chat_or_404(db, chat_id)
    if title is not None:
        chat.title = title
    if system_prompt is not None:
        chat.system_prompt = system_prompt
    db.commit()
    db.refresh(chat)
    return chat


def delete_chat(db: Session, chat_id: str) -> None:
    chat = get_chat_or_404(db, chat_id)
    db.delete(chat)  # Cascade deletes messages, turns, raw_*, chat_settings, agent_files
    db.commit()


def get_chat_messages(db: Session, chat_id: str) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.sequence_num)
        .all()
    )


def get_next_sequence(db: Session, chat_id: str) -> int:
    max_seq = (
        db.query(func.max(Message.sequence_num))
        .filter(Message.chat_id == chat_id)
        .scalar()
    )
    return (max_seq or 0) + 1
