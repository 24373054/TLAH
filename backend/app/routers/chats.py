from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chat import (
    ChatCreate,
    ChatDetail,
    ChatResponse,
    ChatSummary,
    ChatUpdate,
    TurnMeta,
)
from app.services import chat_service
from app.services.decision_loop import DecisionLoopManager
from app.services.llm_service import get_turns_for_chat

router = APIRouter(prefix="/chats", tags=["chats"])


@router.post("", response_model=ChatResponse, status_code=201)
def create_chat(body: ChatCreate, db: Session = Depends(get_db)):
    chat = chat_service.create_chat(db, title=body.title)
    # Prime the DecisionLoop for this chat so it's ready when messages arrive
    DecisionLoopManager.get_or_create(chat.id)
    return chat


@router.get("", response_model=list[ChatSummary])
def list_chats(db: Session = Depends(get_db)):
    return chat_service.list_chats(db)


@router.get("/{chat_id}", response_model=ChatDetail)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = chat_service.get_chat_or_404(db, chat_id)
    # Build the response manually to include turns metadata
    chat_dict = {
        "id": chat.id,
        "title": chat.title,
        "system_prompt": chat.system_prompt,
        "created_at": chat.created_at,
        "updated_at": chat.updated_at,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "turn_id": m.turn_id,
                "sequence_num": m.sequence_num,
                "created_at": m.created_at,
            }
            for m in chat.messages
        ],
        "turns": get_turns_for_chat(db, chat_id),
    }
    return chat_dict


@router.patch("/{chat_id}", response_model=ChatResponse)
def update_chat(chat_id: str, body: ChatUpdate, db: Session = Depends(get_db)):
    return chat_service.update_chat(
        db, chat_id, title=body.title, system_prompt=body.system_prompt,
    )


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat_service.delete_chat(db, chat_id)
    # Stop the decision loop for this chat
    DecisionLoopManager.stop(chat_id)
