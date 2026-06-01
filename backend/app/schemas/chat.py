from datetime import datetime

from pydantic import BaseModel, Field


class ChatCreate(BaseModel):
    title: str = "New Chat"


class ChatUpdate(BaseModel):
    title: str | None = None
    system_prompt: str | None = None


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    turn_id: str | None = None
    sequence_num: int
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatDetail(ChatResponse):
    messages: list[MessageResponse] = []

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str


class SendMessageResponse(BaseModel):
    turn_id: str
    user_message: MessageResponse
    assistant_message: MessageResponse
