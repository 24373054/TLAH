from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chat import (
    ChatCreate,
    ChatDetail,
    ChatResponse,
    ChatSummary,
    ChatUpdate,
)
from app.services import chat_service

router = APIRouter(prefix="/chats", tags=["chats"])


@router.post("", response_model=ChatResponse, status_code=201)
def create_chat(body: ChatCreate, db: Session = Depends(get_db)):
    chat = chat_service.create_chat(db, title=body.title)
    return chat


@router.get("", response_model=list[ChatSummary])
def list_chats(db: Session = Depends(get_db)):
    return chat_service.list_chats(db)


@router.get("/{chat_id}", response_model=ChatDetail)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = chat_service.get_chat_or_404(db, chat_id)
    return chat


@router.patch("/{chat_id}", response_model=ChatResponse)
def update_chat(chat_id: str, body: ChatUpdate, db: Session = Depends(get_db)):
    return chat_service.update_chat(
        db, chat_id, title=body.title, system_prompt=body.system_prompt,
    )


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat_service.delete_chat(db, chat_id)
