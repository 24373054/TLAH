import json
import time
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.llm import LLMResponse, create_provider
from app.models.chat import Chat, Message, Turn
from app.models.debug import RawRequest, RawResponse
from app.models.settings import AgentFile
from app.services.chat_service import get_next_sequence
from app.services.settings_service import EffectiveSettings, get_effective_settings


@dataclass
class SendMessageResult:
    turn: Turn
    user_message: Message
    assistant_message: Message
    raw_request: RawRequest
    raw_response: RawResponse


def _build_messages_for_llm(db: Session, chat_id: str) -> list[dict[str, str]]:
    """Build the message history list.

    Includes ALL message roles (user, assistant, AND system) so that
    system messages injected mid-conversation persist and are sent to
    the LLM in chronological order.
    """
    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.sequence_num)
        .all()
    )
    return [{"role": m.role, "content": m.content} for m in messages]


def _build_system_prompt(db: Session, chat: Chat, effective: EffectiveSettings) -> str:
    """Build the complete system prompt: chat override > global, + agent file if present."""
    # Chat-level system prompt takes priority over global
    base_prompt = chat.system_prompt if chat.system_prompt else effective.system_prompt

    # Append AGENT.md content if present
    agent_file = db.query(AgentFile).filter(AgentFile.chat_id == chat.id).first()
    if agent_file and agent_file.content:
        base_prompt += f"\n\n---\nThe following is additional context/instructions:\n\n{agent_file.content}"

    return base_prompt


def send_message(
    db: Session,
    chat_id: str,
    user_content: str,
    role: str | None = None,
) -> SendMessageResult:
    """
    THE CORE ORCHESTRATION FUNCTION.

    This executes the full send-message flow:
    1. Load chat + history
    2. Build effective system prompt (with agent file)
    3. Create Turn record
    4. Save message (with requested role, or effective.user_role)
    5. Build raw request payload
    6. Call LLM provider via raw HTTP
    7. Store raw request + raw response in DB
    8. Save assistant message
    9. Commit and return everything

    If `role` is "system", the message is persisted as a system message
    and will appear in future turns' message history.
    """
    from fastapi import HTTPException

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    # 1. Build effective settings
    effective = get_effective_settings(db, chat_id)

    # 2. Build message history (before adding the new message)
    prior_messages = _build_messages_for_llm(db, chat_id)

    # 3. Build system prompt
    system_prompt = _build_system_prompt(db, chat, effective)

    # 4. Determine the role to use
    msg_role = role if role else effective.user_role

    # 5. Determine turn number
    turn_count = db.query(Turn).filter(Turn.chat_id == chat_id).count()
    turn_number = turn_count + 1

    # 6. Create Turn
    turn = Turn(chat_id=chat_id, turn_number=turn_number)
    db.add(turn)
    db.flush()  # Get turn.id

    # 7. Save the outgoing message (system / user / custom role)
    seq = get_next_sequence(db, chat_id)
    sent_message = Message(
        chat_id=chat_id,
        role=msg_role,
        content=user_content,
        turn_id=turn.id,
        sequence_num=seq,
    )
    db.add(sent_message)
    db.flush()

    # 8. Create LLM provider
    provider = create_provider(
        provider_name=effective.provider,
        api_key=effective.api_key,
        base_url=effective.base_url,
        model=effective.model,
    )

    # 9. Build the full messages list for the LLM call
    # (prior messages + the new message, using the requested role)
    messages_for_llm = prior_messages + [{"role": msg_role, "content": user_content}]

    # 9. Call the LLM
    import asyncio

    loop = None
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    llm_result: LLMResponse = loop.run_until_complete(
        provider.chat(
            messages=messages_for_llm,
            system_prompt=system_prompt,
            temperature=effective.temperature,
            max_tokens=effective.max_tokens,
        )
    )

    # 11. Store raw request
    raw_request = RawRequest(
        turn_id=turn.id,
        provider=provider.provider_name(),
        endpoint_url=provider.endpoint_url(),
        request_json=json.dumps(llm_result.raw_request, indent=2, ensure_ascii=False),
    )
    db.add(raw_request)

    # 12. Store raw response
    raw_response = RawResponse(
        turn_id=turn.id,
        provider=provider.provider_name(),
        response_json=json.dumps(llm_result.raw_response, indent=2, ensure_ascii=False),
        http_status_code=llm_result.http_status,
        latency_ms=llm_result.latency_ms,
        token_usage_json=json.dumps(llm_result.token_usage) if llm_result.token_usage else None,
    )
    db.add(raw_response)

    # 13. Save assistant message
    assistant_content = llm_result.assistant_text
    ass_message = Message(
        chat_id=chat_id,
        role="assistant",
        content=assistant_content,
        turn_id=turn.id,
        sequence_num=seq + 1,
    )
    db.add(ass_message)

    # 14. Update chat timestamp
    chat.updated_at = None  # Force onupdate
    import datetime as _dt
    chat.updated_at = _dt.datetime.now(_dt.timezone.utc)

    # 15. Commit everything
    db.commit()
    db.refresh(sent_message)
    db.refresh(ass_message)
    db.refresh(turn)
    db.refresh(raw_request)
    db.refresh(raw_response)

    return SendMessageResult(
        turn=turn,
        user_message=sent_message,
        assistant_message=ass_message,
        raw_request=raw_request,
        raw_response=raw_response,
    )
