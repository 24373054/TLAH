from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chat import SendMessageRequest, SendMessageResponse, MessageResponse
from app.services.llm_service import send_message

router = APIRouter(prefix="/chats", tags=["messages"])


@router.post("/{chat_id}/messages", response_model=SendMessageResponse)
def post_message(chat_id: str, body: SendMessageRequest, db: Session = Depends(get_db)):
    """Send a message and get an AI response.

    The backend captures the COMPLETE raw request sent to the LLM API
    and the COMPLETE raw response received. These are available via
    the debug endpoints: GET /api/turns/{turn_id}/raw-{request,response}
    """
    result = send_message(db=db, chat_id=chat_id, user_content=body.content)
    return SendMessageResponse(
        turn_id=result.turn.id,
        user_message=MessageResponse.model_validate(result.user_message),
        assistant_message=MessageResponse.model_validate(result.assistant_message),
    )
