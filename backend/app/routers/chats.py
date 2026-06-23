import json

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
    if body.agent_enabled is not None:
        chat.agent_enabled = body.agent_enabled
        db.commit()
        db.refresh(chat)
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
        "agent_enabled": chat.agent_enabled,
        "created_at": chat.created_at,
        "updated_at": chat.updated_at,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "turn_id": m.turn_id,
                "sequence_num": m.sequence_num,
                "message_type": m.message_type,
                "metadata_json": json.loads(m.metadata_json) if m.metadata_json else None,
                "created_at": m.created_at,
            }
            for m in chat.messages
        ],
        "turns": get_turns_for_chat(db, chat_id),
    }
    return chat_dict


@router.patch("/{chat_id}", response_model=ChatResponse)
def update_chat(chat_id: str, body: ChatUpdate, db: Session = Depends(get_db)):
    chat = chat_service.update_chat(
        db, chat_id, title=body.title, system_prompt=body.system_prompt,
    )
    if body.agent_enabled is not None:
        chat.agent_enabled = body.agent_enabled
        db.commit()
        db.refresh(chat)
    return chat


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat_service.delete_chat(db, chat_id)
    # Stop the decision loop for this chat
    DecisionLoopManager.stop(chat_id)


# ── Sandbox endpoints ─────────────────────────────────────────────


@router.get("/{chat_id}/sandbox/status")
def sandbox_status(chat_id: str):
    """Get the sandbox container status for a chat."""
    import asyncio
    from app.services.sandbox import SandboxManager

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(SandboxManager.get_status(chat_id))
    finally:
        loop.close()


@router.post("/{chat_id}/sandbox/reset")
def sandbox_reset(chat_id: str):
    """Reset (destroy and recreate) the sandbox for a chat."""
    import asyncio
    from app.services.sandbox import SandboxManager

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(SandboxManager.reset(chat_id))
        return {"status": "ok"}
    finally:
        loop.close()


# ── File serving endpoint ──────────────────────────────────────────

_MIME_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
    ".bmp": "image/bmp", ".ico": "image/x-icon",
    ".txt": "text/plain", ".md": "text/markdown", ".html": "text/html",
    ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
    ".pdf": "application/pdf", ".zip": "application/zip",
    ".tar": "application/x-tar", ".gz": "application/gzip",
}


@router.get("/{chat_id}/files/{file_path:path}")
def serve_sandbox_file(chat_id: str, file_path: str):
    """Serve a file from the sandbox workspace.

    Only files within the chat's workspace directory are accessible.
    Path traversal attempts (..) are blocked.
    """
    from pathlib import Path

    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    from app.services.sandbox import SANDBOX_BASE

    # Security: reject path traversal
    if ".." in file_path or file_path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid file path")

    workspace = Path(SANDBOX_BASE) / chat_id
    file = (workspace / file_path).resolve()

    # Ensure the resolved path is still within the workspace
    if not str(file).startswith(str(workspace.resolve())):
        raise HTTPException(status_code=400, detail="Path traversal denied")

    if not file.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    ext = file.suffix.lower()
    media_type = _MIME_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file),
        media_type=media_type,
        filename=file.name,
    )
