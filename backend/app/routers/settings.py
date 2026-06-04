from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database import get_db
from app.models.settings import AgentFile
from app.schemas.settings import (
    AgentFileResponse,
    ChatSettingsResponse,
    ChatSettingsUpdate,
    GlobalSettingsResponse,
    GlobalSettingsUpdate,
    ProviderInfo,
    SUPPORTED_PROVIDERS,
)
from app.services import settings_service

router = APIRouter(tags=["settings"])


class BetaCodeRequest(BaseModel):
    code: str


@router.post("/verify-beta-code")
def verify_beta_code(body: BetaCodeRequest):
    if not app_settings.beta_access_code:
        return {"valid": True}
    return {"valid": body.code == app_settings.beta_access_code}


# ── Providers ──────────────────────────────────────────────────────

@router.get("/providers", response_model=list[ProviderInfo])
def list_providers():
    return SUPPORTED_PROVIDERS


# ── Global Settings ─────────────────────────────────────────────────

@router.get("/settings", response_model=GlobalSettingsResponse)
def get_global_settings(db: Session = Depends(get_db)):
    return settings_service.get_global_settings_masked(db)


@router.put("/settings", response_model=GlobalSettingsResponse)
def update_global_settings(body: GlobalSettingsUpdate, db: Session = Depends(get_db)):
    gs = settings_service.update_global_settings(db, body)
    # Auto-fill default base_url and model when switching providers
    if body.provider:
        for p in SUPPORTED_PROVIDERS:
            if p.key == body.provider:
                if not gs.base_url or gs.base_url == "":
                    gs.base_url = p.default_base_url
                if not gs.model or gs.model == "":
                    gs.model = p.default_model
                db.commit()
                db.refresh(gs)
                break
    return settings_service.get_global_settings_masked(db)


# ── Per-Chat Settings ──────────────────────────────────────────────

@router.get("/chats/{chat_id}/settings", response_model=ChatSettingsResponse)
def get_chat_settings(chat_id: str, db: Session = Depends(get_db)):
    cs = settings_service.get_chat_settings(db, chat_id)
    if cs is None:
        return ChatSettingsResponse()
    return cs


@router.put("/chats/{chat_id}/settings", response_model=ChatSettingsResponse)
def update_chat_settings(chat_id: str, body: ChatSettingsUpdate, db: Session = Depends(get_db)):
    return settings_service.update_chat_settings(db, chat_id, body)


# ── Agent File ─────────────────────────────────────────────────────

@router.post("/chats/{chat_id}/agent-file", response_model=AgentFileResponse, status_code=201)
async def upload_agent_file(
    chat_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="Only .md files are allowed")

    content = (await file.read()).decode("utf-8")

    # Upsert: replace existing agent file for this chat
    existing = db.query(AgentFile).filter(AgentFile.chat_id == chat_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    agent_file = AgentFile(
        chat_id=chat_id,
        filename=file.filename,
        content=content,
        size_bytes=len(content.encode("utf-8")),
    )
    db.add(agent_file)
    db.commit()
    db.refresh(agent_file)
    return agent_file


@router.get("/chats/{chat_id}/agent-file", response_model=AgentFileResponse)
def get_agent_file(chat_id: str, db: Session = Depends(get_db)):
    af = db.query(AgentFile).filter(AgentFile.chat_id == chat_id).first()
    if af is None:
        raise HTTPException(status_code=404, detail="No agent file for this chat")
    return af


@router.delete("/chats/{chat_id}/agent-file", status_code=204)
def delete_agent_file(chat_id: str, db: Session = Depends(get_db)):
    af = db.query(AgentFile).filter(AgentFile.chat_id == chat_id).first()
    if af is None:
        raise HTTPException(status_code=404, detail="No agent file for this chat")
    db.delete(af)
    db.commit()
