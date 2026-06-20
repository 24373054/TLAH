from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chat import (
    CommitPendingResponse,
    ContinueTurnResponse,
    MessageResponse,
    QueueMessageRequest,
    QueueMessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.services.decision_loop import DecisionLoopManager
from app.services.llm_service import (
    CommitResult,
    SendMessageResult,
    save_message,
    send_message,
)

router = APIRouter(prefix="/chats", tags=["messages"])


# ── Legacy: immediate send-and-reply (kept for backward compatibility) ─


@router.post("/{chat_id}/messages", response_model=SendMessageResponse)
def post_message(chat_id: str, body: SendMessageRequest, db: Session = Depends(get_db)):
    """Send a message and get an immediate AI response.

    The backend captures the COMPLETE raw request sent to the LLM API
    and the COMPLETE raw response received. These are available via
    the debug endpoints: GET /api/turns/{turn_id}/raw-{request,response}

    Note: This is the legacy synchronous flow. For the new async harness
    (LLM decides when to reply), use POST /messages/queue.
    """
    result: SendMessageResult = send_message(
        db=db, chat_id=chat_id, user_content=body.content, role=body.role
    )
    return SendMessageResponse(
        turn_id=result.turn.id,
        user_message=MessageResponse.model_validate(result.user_message),
        assistant_message=MessageResponse.model_validate(result.assistant_message),
    )


# ── New async harness: queue → DecisionLoop picks up → LLM decides ──


@router.post("/{chat_id}/messages/queue", response_model=QueueMessageResponse, status_code=201)
def queue_message(chat_id: str, body: QueueMessageRequest, db: Session = Depends(get_db)):
    """Save a message WITHOUT triggering the LLM.

    The message is saved with turn_id=null (pending state).
    A background DecisionLoop will:
    1. Pick up all pending messages after a short debounce
    2. Call the LLM to decide: WAIT or REPLY
    3. If REPLY: create a Turn and save all assistant messages
    4. If WAIT: record the decision for debugging, keep messages pending

    This gives the LLM autonomy over conversation flow — it decides
    when to reply and how many messages to send, just like a human.
    """
    result = save_message(
        db=db, chat_id=chat_id, content=body.content, role=body.role,
    )
    # Signal the decision loop for this chat
    DecisionLoopManager.signal(chat_id)
    return QueueMessageResponse(
        message=MessageResponse.model_validate(result.message),
    )
