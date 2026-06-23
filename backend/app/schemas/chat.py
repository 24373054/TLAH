from datetime import datetime

from pydantic import BaseModel, Field


class ChatCreate(BaseModel):
    title: str = "New Chat"
    agent_enabled: bool = True


class ChatUpdate(BaseModel):
    title: str | None = None
    system_prompt: str | None = None
    agent_enabled: bool | None = None


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    turn_id: str | None = None
    sequence_num: int
    message_type: str = "text"
    metadata_json: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSummary(BaseModel):
    id: str
    title: str
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    id: str
    title: str
    system_prompt: str
    agent_enabled: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatDetail(ChatResponse):
    messages: list[MessageResponse] = []
    turns: list["TurnMeta"] = []

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str
    role: str | None = None  # If None, uses effective user_role; set "system" to inject a system message


class SendMessageResponse(BaseModel):
    turn_id: str
    user_message: MessageResponse
    assistant_message: MessageResponse


class QueueMessageRequest(BaseModel):
    """Request: save a message without triggering the LLM."""
    content: str
    role: str | None = None


class QueueMessageResponse(BaseModel):
    """Response after saving a message (pending, turn_id=null)."""
    message: MessageResponse


class CommitPendingResponse(BaseModel):
    """Response after committing all pending messages to one Turn."""
    turn_id: str
    turn_number: int
    user_messages: list[MessageResponse]
    assistant_messages: list[MessageResponse]


class ContinueTurnResponse(BaseModel):
    """Response after continuing a Turn (generating another AI reply)."""
    turn_id: str
    turn_number: int
    parent_turn_id: str
    assistant_message: MessageResponse


class TurnMeta(BaseModel):
    """Lightweight Turn metadata for frontend message grouping."""
    id: str
    turn_number: int
    parent_turn_id: str | None = None
    turn_type: str = "reply"  # "reply" | "wait" | "force_reply"
    child_turn_ids: list[str] = []
